// VeilPrivacyGuard – macOS.
//
//   Shield mode : NSWindow.sharingType = .none keeps the window out of screenshots
//                 and recordings; a CGEventTap swallows ⌘⇧3/4/5/6 while Veil is active.
//   Cover mode  : borderless, always-on-top, non-activating black panels that DO show
//                 up in captures. Draggable by their body, resizable by a corner grip.
//
// Honest limits (also reported through `getCapabilities`):
//   • sharingType is best-effort: modern ScreenCaptureKit based tools may still see the window.
//   • The event tap needs the Accessibility permission and an un-sandboxed app (see Veil.entitlements).
//
// Coordinates exposed to JS are top-left based, in points, with y = 0 at the top of the
// primary screen – the same convention the Windows module uses.

#import "VeilPrivacyGuard.h"

#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <unistd.h>

static NSString *const kEventBlocked = @"veilBlocked";
static NSString *const kEventAttempt = @"veilCaptureAttempt";
static NSString *const kEventMaskMoved = @"veilMaskMoved";
static NSString *const kEventHotkey = @"veilHotkey";

static const CGFloat kMinMaskSize = 40.0;
static const CGFloat kClickThroughBelow = 0.05;
static const NSTimeInterval kMovedDebounce = 0.12;

#pragma mark - Cover panel

@interface VeilCoverGrip : NSView
@end

@implementation VeilCoverGrip {
  NSPoint _startMouse;
  NSRect _startFrame;
}

- (BOOL)mouseDownCanMoveWindow {
  return NO; // the grip resizes; only the rest of the panel drags it
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event {
  return YES;
}

- (void)drawRect:(NSRect)dirty {
  [[NSColor colorWithCalibratedRed:0.486 green:0.424 blue:1.0 alpha:0.95] setFill];
  NSBezierPath *tri = [NSBezierPath bezierPath];
  [tri moveToPoint:NSMakePoint(NSMaxX(self.bounds), NSMinY(self.bounds))];
  [tri lineToPoint:NSMakePoint(NSMaxX(self.bounds), NSMaxY(self.bounds))];
  [tri lineToPoint:NSMakePoint(NSMinX(self.bounds), NSMinY(self.bounds))];
  [tri closePath];
  [tri fill];
}

- (void)resetCursorRects {
  [self addCursorRect:self.bounds cursor:[NSCursor crosshairCursor]];
}

- (void)mouseDown:(NSEvent *)event {
  _startMouse = [NSEvent mouseLocation];
  _startFrame = self.window.frame;
}

- (void)mouseDragged:(NSEvent *)event {
  NSPoint now = [NSEvent mouseLocation];
  CGFloat dx = now.x - _startMouse.x;
  CGFloat dy = now.y - _startMouse.y; // AppKit: positive is up
  NSRect f = _startFrame;
  f.size.width = MAX(kMinMaskSize, _startFrame.size.width + dx);
  f.size.height = MAX(kMinMaskSize, _startFrame.size.height - dy);
  f.origin.y = NSMaxY(_startFrame) - f.size.height; // keep the top-left corner fixed
  [self.window setFrame:f display:YES];
}

@end

@interface VeilCoverPanel : NSPanel
@property(nonatomic, copy) NSString *maskId;
@property(nonatomic, strong) VeilCoverGrip *grip;
@end

@implementation VeilCoverPanel
- (BOOL)canBecomeKeyWindow {
  return NO; // never steal focus from the app being protected
}
- (BOOL)canBecomeMainWindow {
  return NO;
}
@end

#pragma mark - Module

@interface VeilPrivacyGuard () {
  BOOL _hasListeners;

  // keyboard
  CFMachPortRef _tap;
  CFRunLoopSourceRef _tapSource;
  BOOL _blockShortcuts;
  BOOL _autoBlackout;
  NSTimeInterval _blackoutSeconds;
  NSMutableSet<NSNumber *> *_swallowed;

  // hotkey
  EventHotKeyRef _hotKeyRef;
  EventHandlerRef _hotKeyHandler;

  // covers
  NSMutableDictionary<NSString *, VeilCoverPanel *> *_masks;
  double _maskOpacity;
  BOOL _maskLocked;
  BOOL _flashing;
  NSInteger _programmatic; // >0 while we resize a panel ourselves
  NSTimer *_blackoutTimer;

  // main window state
  BOOL _alwaysOnTop;
  BOOL _hudSaved;
  NSRect _hudFrame;
  NSWindowLevel _hudLevel;
}
@end

static CGEventRef VeilTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon);
static OSStatus VeilHotKeyHandler(EventHandlerCallRef next, EventRef event, void *userData);

@implementation VeilPrivacyGuard

RCT_EXPORT_MODULE(VeilPrivacyGuard)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ kEventBlocked, kEventAttempt, kEventMaskMoved, kEventHotkey ];
}

- (void)startObserving {
  _hasListeners = YES;
}

- (void)stopObserving {
  _hasListeners = NO;
}

- (instancetype)init {
  if ((self = [super init])) {
    _masks = [NSMutableDictionary new];
    _swallowed = [NSMutableSet new];
    _maskOpacity = 1.0;
    _blackoutSeconds = 3.0;
    [self registerHotKey];
  }
  return self;
}

- (void)invalidate {
  [self removeTap];
  if (_hotKeyRef) {
    UnregisterEventHotKey(_hotKeyRef);
    _hotKeyRef = NULL;
  }
  if (_hotKeyHandler) {
    RemoveEventHandler(_hotKeyHandler);
    _hotKeyHandler = NULL;
  }
  for (VeilCoverPanel *p in _masks.allValues) {
    [p orderOut:nil];
    [p close];
  }
  [_masks removeAllObjects];
  [super invalidate];
}

- (void)emit:(NSString *)name body:(NSDictionary *)body {
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

#pragma mark Windows

- (NSWindow *)mainWindow {
  for (NSWindow *w in NSApp.windows) {
    if (![w isKindOfClass:[VeilCoverPanel class]] && w.canBecomeMainWindow) {
      return w;
    }
  }
  return NSApp.windows.firstObject;
}

static CGFloat PrimaryHeight(void) {
  NSScreen *primary = NSScreen.screens.firstObject; // the screen with the menu bar
  return primary ? primary.frame.size.height : 0;
}

static NSRect FrameFromTopLeft(double x, double y, double w, double h) {
  return NSMakeRect(x, PrimaryHeight() - y - h, w, h);
}

static NSDictionary *TopLeftFromFrame(NSRect f) {
  return @{
    @"x" : @(f.origin.x),
    @"y" : @(PrimaryHeight() - NSMaxY(f)),
    @"width" : @(f.size.width),
    @"height" : @(f.size.height)
  };
}

#pragma mark Capabilities

RCT_EXPORT_METHOD(getCapabilities
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  BOOL trusted = AXIsProcessTrusted();
  resolve(@{
    @"platform" : @"macos",
    @"captureProtection" : @"partial",
    @"shortcutBlocking" : trusted ? @"full" : @"partial",
    @"maskWindows" : @YES,
    @"autoBlackout" : @(trusted),
    @"windowOpacity" : @YES,
    @"windowOpacityMode" : @"native",
    @"alwaysOnTop" : @YES,
    @"customChrome" : @NO,
    @"globalHotkey" : @YES,
    @"notes" : @[
      @"Veil asks macOS to exclude its window from screenshots and recordings (NSWindow.sharingType). This is best-effort: some screen-capture tools built on ScreenCaptureKit can still see protected windows, and macOS can ignore it in full-screen.",
      trusted ? @"Capture shortcuts (⌘⇧3, ⌘⇧4, ⌘⇧5) are blocked while Veil is the active app."
              : @"Grant Veil the Accessibility permission (System Settings → Privacy & Security → Accessibility) so it can block capture shortcuts and black out covers when you take a screenshot.",
      @"Covers are real always-on-top windows, so they appear black in every screenshot."
    ]
  });
}

#pragma mark Capture protection / window

RCT_EXPORT_METHOD(setCaptureProtection
                  : (BOOL)enabled resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSWindow *w = [self mainWindow];
  if (!w) {
    resolve(@NO);
    return;
  }
  w.sharingType = enabled ? NSWindowSharingNone : NSWindowSharingReadOnly;
  resolve(@YES);
}

RCT_EXPORT_METHOD(setAlwaysOnTop
                  : (BOOL)enabled resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSWindow *w = [self mainWindow];
  if (!w) {
    resolve(@NO);
    return;
  }
  _alwaysOnTop = enabled;
  [self applyTopmost:enabled toWindow:w];
  resolve(@YES);
}

- (void)applyTopmost:(BOOL)enabled toWindow:(NSWindow *)w {
  NSWindowCollectionBehavior base = w.collectionBehavior;
  NSWindowCollectionBehavior extra = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
  w.collectionBehavior = enabled ? (base | extra) : (base & ~extra);
  w.level = enabled ? NSScreenSaverWindowLevel : NSNormalWindowLevel;
  if (enabled) {
    [w orderFrontRegardless];
  }
}

RCT_EXPORT_METHOD(setWindowOpacity
                  : (double)opacity resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSWindow *w = [self mainWindow];
  if (!w) {
    resolve(@NO);
    return;
  }
  w.alphaValue = MIN(1.0, MAX(0.25, opacity));
  resolve(@YES);
}

RCT_EXPORT_METHOD(getDisplayBounds
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSRect u = NSZeroRect;
  BOOL first = YES;
  for (NSScreen *s in NSScreen.screens) {
    u = first ? s.frame : NSUnionRect(u, s.frame);
    first = NO;
  }
  resolve(TopLeftFromFrame(u));
}

RCT_EXPORT_METHOD(windowControl
                  : (NSString *)action resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSWindow *w = [self mainWindow];
  if (w) {
    if ([action isEqualToString:@"minimize"]) {
      [w miniaturize:nil];
    } else if ([action isEqualToString:@"maximize"]) {
      [w zoom:nil];
    } else if ([action isEqualToString:@"close"]) {
      [w close];
    } else if ([action isEqualToString:@"hud"]) {
      if (!_hudSaved) {
        _hudSaved = YES;
        _hudFrame = w.frame;
        _hudLevel = w.level;
      }
      NSRect f = w.frame;
      CGFloat width = 380, height = 520;
      f.origin.y = NSMaxY(f) - height; // keep the top-left corner where it was
      f.size = NSMakeSize(width, height);
      [w setFrame:f display:YES animate:YES];
      [self applyTopmost:YES toWindow:w];
    } else if ([action isEqualToString:@"restore"]) {
      if (_hudSaved) {
        _hudSaved = NO;
        [w setFrame:_hudFrame display:YES animate:YES];
        [self applyTopmost:_alwaysOnTop toWindow:w];
      }
    }
  }
  resolve(nil);
}

#pragma mark Covers

RCT_EXPORT_METHOD(syncMasks
                  : (NSArray *)masks opacity
                  : (double)opacity locked
                  : (BOOL)locked resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  _maskOpacity = opacity;
  _maskLocked = locked;

  NSMutableSet<NSString *> *wanted = [NSMutableSet new];
  for (id item in masks) {
    if ([item isKindOfClass:[NSDictionary class]] && [item[@"id"] isKindOfClass:[NSString class]]) {
      [wanted addObject:item[@"id"]];
    }
  }
  for (NSString *mid in _masks.allKeys) {
    if (![wanted containsObject:mid]) {
      VeilCoverPanel *p = _masks[mid];
      [[NSNotificationCenter defaultCenter] removeObserver:self name:nil object:p];
      [p orderOut:nil];
      [p close];
      [_masks removeObjectForKey:mid];
    }
  }

  for (NSDictionary *spec in masks) {
    if (![spec isKindOfClass:[NSDictionary class]] || ![spec[@"id"] isKindOfClass:[NSString class]]) {
      continue;
    }
    NSString *mid = spec[@"id"];
    NSRect frame = FrameFromTopLeft([spec[@"x"] doubleValue],
                                    [spec[@"y"] doubleValue],
                                    MAX(kMinMaskSize, [spec[@"width"] doubleValue]),
                                    MAX(kMinMaskSize, [spec[@"height"] doubleValue]));
    VeilCoverPanel *panel = _masks[mid];
    if (!panel) {
      panel = [self makeCoverWithId:mid frame:frame];
      _masks[mid] = panel;
    } else if (!NSEqualRects(panel.frame, frame)) {
      _programmatic++;
      [panel setFrame:frame display:YES];
      _programmatic--;
    }
    [self styleCover:panel opacity:_flashing ? 1.0 : _maskOpacity];
  }

  [self updateTap];
  resolve(nil);
}

- (VeilCoverPanel *)makeCoverWithId:(NSString *)mid frame:(NSRect)frame {
  VeilCoverPanel *p = [[VeilCoverPanel alloc]
      initWithContentRect:frame
                styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                  backing:NSBackingStoreBuffered
                    defer:NO];
  p.maskId = mid;
  p.opaque = NO;
  p.backgroundColor = NSColor.blackColor;
  p.hasShadow = NO;
  p.releasedWhenClosed = NO;
  p.hidesOnDeactivate = NO;
  p.movableByWindowBackground = YES;
  p.level = NSScreenSaverWindowLevel + 1; // above the main window, above everything
  p.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary |
                         NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
  // Covers exist to appear in captures, so they must never be excluded from them.
  p.sharingType = NSWindowSharingReadOnly;

  VeilCoverGrip *grip = [[VeilCoverGrip alloc] initWithFrame:NSMakeRect(frame.size.width - 22, 0, 22, 22)];
  grip.autoresizingMask = NSViewMinXMargin | NSViewMaxYMargin;
  [p.contentView addSubview:grip];
  p.grip = grip;

  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(coverMoved:) name:NSWindowDidMoveNotification object:p];
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(coverMoved:) name:NSWindowDidResizeNotification object:p];

  [p orderFrontRegardless];
  return p;
}

- (void)styleCover:(VeilCoverPanel *)p opacity:(double)opacity {
  BOOL clickThrough = _maskLocked || opacity < kClickThroughBelow;
  p.ignoresMouseEvents = clickThrough;
  p.grip.hidden = _maskLocked;
  // Never fully 0: an alpha-0 window can drop out of the composited scene.
  p.alphaValue = MAX(0.004, MIN(1.0, opacity));
  [p orderFrontRegardless];
}

- (void)coverMoved:(NSNotification *)note {
  if (_programmatic > 0) {
    return; // our own setFrame – never echo it back as a user drag
  }
  VeilCoverPanel *p = note.object;
  // Coalesce the stream of move events into one report once the drag settles.
  [NSObject cancelPreviousPerformRequestsWithTarget:self selector:@selector(reportCover:) object:p];
  [self performSelector:@selector(reportCover:) withObject:p afterDelay:kMovedDebounce];
}

- (void)reportCover:(VeilCoverPanel *)p {
  if (!p.maskId) {
    return;
  }
  NSMutableDictionary *body = [TopLeftFromFrame(p.frame) mutableCopy];
  body[@"id"] = p.maskId;
  [self emit:kEventMaskMoved body:body];
}

#pragma mark Auto black-out

RCT_EXPORT_METHOD(setAutoBlackout
                  : (BOOL)enabled duration
                  : (double)durationMs resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  _autoBlackout = enabled;
  _blackoutSeconds = MAX(0.5, durationMs / 1000.0);
  if (!enabled) {
    [self endFlash];
  }
  [self updateTap];
  resolve(@(enabled ? AXIsProcessTrusted() : YES));
}

/// Snap every cover to solid black now. Called from inside the event tap, i.e. *before* the
/// system screenshot handler sees the key, so the black frame is composited first.
- (void)flash {
  if (_masks.count == 0) {
    return;
  }
  _flashing = YES;
  for (VeilCoverPanel *p in _masks.allValues) {
    p.ignoresMouseEvents = NO;
    p.alphaValue = 1.0;
    [p orderFrontRegardless];
  }
  [CATransaction flush];
  usleep(40000); // give WindowServer one composition pass before the key is delivered

  [_blackoutTimer invalidate];
  _blackoutTimer = [NSTimer scheduledTimerWithTimeInterval:_blackoutSeconds
                                                    target:self
                                                  selector:@selector(endFlashTimer:)
                                                  userInfo:nil
                                                   repeats:NO];
  [[NSRunLoop mainRunLoop] addTimer:_blackoutTimer forMode:NSRunLoopCommonModes];
}

- (void)endFlashTimer:(NSTimer *)t {
  [self endFlash];
}

- (void)endFlash {
  [_blackoutTimer invalidate];
  _blackoutTimer = nil;
  if (!_flashing) {
    return;
  }
  _flashing = NO;
  for (VeilCoverPanel *p in _masks.allValues) {
    [self styleCover:p opacity:_maskOpacity];
  }
}

#pragma mark Keyboard (CGEventTap)

RCT_EXPORT_METHOD(setShortcutBlocking
                  : (BOOL)enabled resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  _blockShortcuts = enabled;
  if (enabled && !AXIsProcessTrusted()) {
    // Shows the system prompt once; the user then enables Veil in Accessibility settings.
    NSDictionary *opts = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt : @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)opts);
  }
  [self updateTap];
  resolve(@(enabled ? (_tap != NULL) : YES));
}

/// The tap exists only while it has a job, so Veil adds nothing to normal typing otherwise.
- (void)updateTap {
  BOOL need = _blockShortcuts || (_autoBlackout && _masks.count > 0);
  if (need && !_tap) {
    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);
    _tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, VeilTapCallback, (__bridge void *)self);
    if (_tap) {
      _tapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, _tap, 0);
      CFRunLoopAddSource(CFRunLoopGetMain(), _tapSource, kCFRunLoopCommonModes);
      CGEventTapEnable(_tap, true);
    }
  } else if (!need && _tap) {
    [self removeTap];
  }
}

- (void)removeTap {
  if (_tap) {
    CGEventTapEnable(_tap, false);
    CFMachPortInvalidate(_tap);
    CFRelease(_tap);
    _tap = NULL;
  }
  if (_tapSource) {
    CFRunLoopRemoveSource(CFRunLoopGetMain(), _tapSource, kCFRunLoopCommonModes);
    CFRelease(_tapSource);
    _tapSource = NULL;
  }
  [_swallowed removeAllObjects];
}

/// ⌘⇧3 (screen), ⌘⇧4 (selection / window), ⌘⇧5 (toolbar & recording), ⌘⇧6 (Touch Bar), F13 (Print Screen keycap).
+ (NSString *)captureComboForKey:(CGKeyCode)key flags:(CGEventFlags)flags {
  BOOL cmd = (flags & kCGEventFlagMaskCommand) != 0;
  BOOL shift = (flags & kCGEventFlagMaskShift) != 0;
  if (cmd && shift) {
    switch (key) {
      case kVK_ANSI_3: return @"⌘⇧3";
      case kVK_ANSI_4: return @"⌘⇧4";
      case kVK_ANSI_5: return @"⌘⇧5";
      case kVK_ANSI_6: return @"⌘⇧6";
    }
  }
  if (key == kVK_F13) {
    return @"F13";
  }
  return nil;
}

- (CGEventRef)handleTapEvent:(CGEventRef)event type:(CGEventType)type {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (_tap) {
      CGEventTapEnable(_tap, true); // the system disables slow taps – turn it back on
    }
    return event;
  }
  if (type != kCGEventKeyDown && type != kCGEventKeyUp) {
    return event;
  }
  CGKeyCode key = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);

  if (type == kCGEventKeyUp) {
    if ([_swallowed containsObject:@(key)]) {
      [_swallowed removeObject:@(key)];
      return NULL; // swallow the matching key-up of a swallowed key-down
    }
    return event;
  }

  NSString *combo = [VeilPrivacyGuard captureComboForKey:key flags:CGEventGetFlags(event)];
  if (!combo) {
    return event;
  }
  double now = [[NSDate date] timeIntervalSince1970] * 1000.0;

  if (_blockShortcuts && NSApp.isActive) {
    [_swallowed addObject:@(key)];
    [self emit:kEventBlocked body:@{@"combo" : combo, @"at" : @(now)}];
    return NULL;
  }
  if (_autoBlackout && _masks.count > 0) {
    [self flash];
    [self emit:kEventAttempt body:@{@"combo" : combo, @"at" : @(now)}];
  }
  return event;
}

#pragma mark Global hotkey (⌃⌥⌘B)

- (void)registerHotKey {
  EventTypeSpec spec = {kEventClassKeyboard, kEventHotKeyPressed};
  InstallApplicationEventHandler(&VeilHotKeyHandler, 1, &spec, (__bridge void *)self, &_hotKeyHandler);
  EventHotKeyID hid = {'VEIL', 1};
  RegisterEventHotKey(kVK_ANSI_B, controlKey | optionKey | cmdKey, hid, GetApplicationEventTarget(), 0, &_hotKeyRef);
}

- (void)hotKeyPressed {
  [self emit:kEventHotkey body:@{@"action" : @"toggle-covers"}];
}

#pragma mark Settings

- (NSURL *)settingsURL:(BOOL)create {
  NSURL *base = [[NSFileManager defaultManager] URLForDirectory:NSApplicationSupportDirectory
                                                        inDomain:NSUserDomainMask
                                               appropriateForURL:nil
                                                          create:create
                                                           error:nil];
  NSURL *dir = [base URLByAppendingPathComponent:@"Veil" isDirectory:YES];
  if (create) {
    [[NSFileManager defaultManager] createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil];
  }
  return [dir URLByAppendingPathComponent:@"settings.json"];
}

RCT_EXPORT_METHOD(loadSettings
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSString *s = [NSString stringWithContentsOfURL:[self settingsURL:NO] encoding:NSUTF8StringEncoding error:nil];
  id value = s.length ? (id)s : (id)[NSNull null];
  resolve(value);
}

RCT_EXPORT_METHOD(saveSettings
                  : (NSString *)json resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  NSError *err = nil;
  // atomically: a crash can never leave half a settings file behind
  if ([json writeToURL:[self settingsURL:YES] atomically:YES encoding:NSUTF8StringEncoding error:&err]) {
    resolve(nil);
  } else {
    reject(@"E_SAVE", err.localizedDescription ?: @"Could not write settings", err);
  }
}

@end

#pragma mark - C callbacks

static CGEventRef VeilTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
  VeilPrivacyGuard *guard = (__bridge VeilPrivacyGuard *)refcon;
  return [guard handleTapEvent:event type:type];
}

static OSStatus VeilHotKeyHandler(EventHandlerCallRef next, EventRef event, void *userData) {
  VeilPrivacyGuard *guard = (__bridge VeilPrivacyGuard *)userData;
  dispatch_async(dispatch_get_main_queue(), ^{
    [guard hotKeyPressed];
  });
  return noErr;
}

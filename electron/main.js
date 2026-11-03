'use strict';

/**
 * Electron host – the Linux implementation of the VeilPrivacyGuard contract
 * (src/core/native/types.ts). It also runs on Windows/macOS, which is handy
 * for development, but those platforms ship with their own native modules.
 *
 * What Linux can and cannot do is reported honestly through `capabilities`:
 *   - no OS API excludes a window from capture on X11 or Wayland
 *   - capture hotkeys can be grabbed on X11 only; Wayland compositors own them
 *   - windows can't be made translucent by the OS here, so opacity is CSS on a
 *     transparent window
 */

const {app, BrowserWindow, globalShortcut, ipcMain, screen} = require('electron');
const fs = require('fs');
const path = require('path');

const IS_LINUX = process.platform === 'linux';
const IS_WIN = process.platform === 'win32';
const PLATFORM_ID = IS_LINUX ? 'linux' : IS_WIN ? 'windows' : 'macos';
const DEV_URL = process.env.VEIL_DEV_URL || '';

/** Same combo as the native Windows/macOS modules. */
const TOGGLE_HOTKEY = 'CommandOrControl+Alt+Shift+B';

/** Accelerators swallowed while the Veil window is focused. */
const CAPTURE_KEYS = IS_WIN
  ? [
      'PrintScreen',
      'Alt+PrintScreen',
      'Ctrl+PrintScreen',
      'Super+Shift+S',
      'Super+Alt+R',
      'Super+Alt+PrintScreen',
    ]
  : [
      'PrintScreen',
      'Alt+PrintScreen',
      'Shift+PrintScreen',
      'Ctrl+PrintScreen',
      'Ctrl+Shift+PrintScreen',
      'Super+PrintScreen',
      'Super+Shift+PrintScreen',
      'Ctrl+Alt+Shift+R',
    ];

/** @type {import('electron').BrowserWindow | null} */
let main = null;
let shortcutsWanted = false;
let registeredKeys = [];
let onTop = false;
let hudSaved = null;

/* -------------------------------- helpers -------------------------------- */

function send(channel, payload) {
  if (main && !main.isDestroyed()) {
    main.webContents.send(`veil:${channel}`, payload);
  }
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function setOnTop(win, enabled) {
  win.setAlwaysOnTop(enabled, 'screen-saver');
  try {
    win.setVisibleOnAllWorkspaces(enabled, {visibleOnFullScreen: true});
  } catch {
    /* not supported on every platform / compositor */
  }
}

function displayBounds() {
  const all = screen.getAllDisplays().map(d => d.bounds);
  const x = Math.min(...all.map(b => b.x));
  const y = Math.min(...all.map(b => b.y));
  const r = Math.max(...all.map(b => b.x + b.width));
  const b = Math.max(...all.map(b => b.y + b.height));
  return {x, y, width: r - x, height: b - y};
}

/* ---------------------------- capture shortcuts --------------------------- */

function unregisterCaptureKeys() {
  registeredKeys.forEach(k => globalShortcut.unregister(k));
  registeredKeys = [];
}

/** Grabs the capture keys only while Veil is focused, as promised in the UI. */
function applyCaptureKeys() {
  unregisterCaptureKeys();
  if (!shortcutsWanted || !main || main.isDestroyed() || !main.isFocused()) {
    return;
  }
  for (const key of CAPTURE_KEYS) {
    try {
      const ok = globalShortcut.register(key, () =>
        send('blocked', {combo: key.replace('Super', IS_WIN ? 'Win' : 'Super'), at: Date.now()}),
      );
      if (ok) {
        registeredKeys.push(key);
      }
    } catch {
      /* some accelerators are rejected by the OS – partial coverage is reported in capabilities */
    }
  }
}

/* ---------------------------------- masks --------------------------------- */

/**
 * `programmaticAt` is when the UI last moved the window itself. The OS echoes
 * every setBounds back as move events, and those must never be reported as
 * user drags – otherwise a stale position fights the drag in progress.
 * @type {Map<string, {win: import('electron').BrowserWindow, lastSet: any, programmaticAt: number}>}
 */
const masks = new Map();
const ECHO_WINDOW_MS = 400;
let maskStyle = {opacity: 1, locked: false};

function pushMaskStyle(win) {
  if (!win.isDestroyed()) {
    win.webContents.send('mask:style', maskStyle);
    // Locked, or nearly invisible: never intercept the mouse.
    win.setIgnoreMouseEvents(maskStyle.locked || maskStyle.opacity < 0.04);
  }
}

function sameBounds(a, b) {
  return (
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.width - b.width) < 2 &&
    Math.abs(a.height - b.height) < 2
  );
}

function createMask(spec) {
  const win = new BrowserWindow({
    x: Math.round(spec.x),
    y: Math.round(spec.y),
    width: Math.round(spec.width),
    height: Math.round(spec.height),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false, // never steal focus from the app being protected
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'mask-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Covers MUST appear in captures – that is their whole job – so no content protection here.
  win.setContentProtection(false);
  setOnTop(win, true);
  win.setMinimumSize(40, 40);
  win.loadFile(path.join(__dirname, 'mask.html'));

  const entry = {
    win,
    lastSet: {x: spec.x, y: spec.y, width: spec.width, height: spec.height},
    programmaticAt: Date.now(), // creation itself positions the window
  };
  let timer = null;
  const report = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) {
        return;
      }
      const b = win.getBounds();
      if (Date.now() - entry.programmaticAt < ECHO_WINDOW_MS || sameBounds(b, entry.lastSet)) {
        return;
      }
      entry.lastSet = b;
      send('mask-moved', {id: spec.id, rect: b});
    }, 120);
  };
  win.on('move', report);
  win.on('resize', report);
  win.webContents.once('did-finish-load', () => {
    pushMaskStyle(win);
    win.showInactive();
  });
  win.on('closed', () => masks.delete(spec.id));
  masks.set(spec.id, entry);
  return entry;
}

function syncMasks({masks: specs = [], opacity = 1, locked = false}) {
  maskStyle = {opacity, locked};
  const wanted = new Set(specs.map(s => s.id));

  for (const [id, entry] of masks) {
    if (!wanted.has(id)) {
      entry.win.destroy();
      masks.delete(id);
    }
  }
  for (const spec of specs) {
    let entry = masks.get(spec.id);
    if (!entry) {
      createMask(spec);
      continue;
    }
    const target = {
      x: Math.round(spec.x),
      y: Math.round(spec.y),
      width: Math.round(spec.width),
      height: Math.round(spec.height),
    };
    if (!sameBounds(entry.win.getBounds(), target)) {
      entry.programmaticAt = Date.now();
      entry.lastSet = target;
      entry.win.setBounds(target);
    }
    pushMaskStyle(entry.win);
  }
}

/* ---------------------------------- window -------------------------------- */

function createMain() {
  main = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 320,
    minHeight: 260,
    show: false,
    title: 'Veil',
    backgroundColor: IS_LINUX ? '#00000000' : '#07080D',
    // Linux: a transparent, frameless window is the only way to get real
    // see-through opacity, so the renderer draws its own title bar.
    transparent: IS_LINUX,
    frame: !IS_LINUX,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  main.once('ready-to-show', () => main.show());
  main.on('focus', applyCaptureKeys);
  main.on('blur', unregisterCaptureKeys);
  main.on('closed', () => {
    unregisterCaptureKeys();
    for (const e of masks.values()) {
      e.win.destroy();
    }
    masks.clear();
    main = null;
  });

  // Veil is a single local page: nothing may navigate or open elsewhere.
  main.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  main.webContents.on('will-navigate', e => e.preventDefault());

  if (DEV_URL) {
    main.loadURL(DEV_URL);
  } else {
    main.loadFile(path.join(__dirname, '..', 'dist', 'web', 'index.html'));
  }
}

/* ----------------------------------- IPC ---------------------------------- */

function handle(channel, fn) {
  ipcMain.handle(`veil:${channel}`, (_e, payload) => fn(payload));
}

function registerIpc() {
  handle('capabilities', () => ({
    platform: PLATFORM_ID,
    captureProtection: IS_LINUX ? 'none' : IS_WIN ? 'full' : 'partial',
    shortcutBlocking: 'partial',
    maskWindows: true,
    autoBlackout: false,
    windowOpacity: true,
    windowOpacityMode: IS_LINUX ? 'css' : 'native',
    alwaysOnTop: true,
    customChrome: IS_LINUX,
    globalHotkey: true,
    notes: IS_LINUX
      ? [
          'Linux has no API to exclude a window from screenshots or screen recording, so this window can still be captured.',
          'Capture keys (Print Screen and friends) are grabbed on X11 only while Veil is focused. Wayland compositors handle those keys themselves, so they cannot be blocked.',
          'Covers are always-on-top windows and are included in screenshots. Always-on-top above full-screen apps depends on your compositor.',
          'Automatic black-out on capture is unavailable: Linux does not let an app observe a hotkey without taking it away from the screenshot tool. Set the cover opacity to 100% instead.',
        ]
      : [
          'Running through the Electron development host. Use the native build for full protection.',
        ],
  }));

  handle('capture-protection', enabled => {
    if (!main) return false;
    main.setContentProtection(Boolean(enabled));
    return !IS_LINUX; // a no-op on Linux – be honest about it
  });

  handle('shortcut-blocking', enabled => {
    shortcutsWanted = Boolean(enabled);
    applyCaptureKeys();
    return true; // best effort; the exact coverage is described in `capabilities`
  });

  handle('always-on-top', enabled => {
    if (!main) return false;
    onTop = Boolean(enabled);
    setOnTop(main, onTop);
    return true;
  });

  handle('window-opacity', value => {
    if (!main) return false;
    const v = Math.min(1, Math.max(0.25, Number(value) || 1));
    if (!IS_LINUX) {
      main.setOpacity(v);
    }
    return true;
  });

  handle('display-bounds', () => displayBounds());
  handle('sync-masks', payload => syncMasks(payload || {}));
  handle('auto-blackout', () => false);

  handle('load-settings', () => {
    try {
      return fs.readFileSync(settingsFile(), 'utf8');
    } catch {
      return null;
    }
  });

  handle('save-settings', json => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), {recursive: true});
      fs.writeFileSync(settingsFile(), String(json), 'utf8');
    } catch (e) {
      console.warn('[veil] could not save settings', e);
    }
  });

  handle('window-control', action => {
    if (!main) return;
    switch (action) {
      case 'minimize':
        main.minimize();
        break;
      case 'maximize':
        main.isMaximized() ? main.unmaximize() : main.maximize();
        break;
      case 'close':
        main.close();
        break;
      case 'hud':
        if (!hudSaved) {
          hudSaved = {bounds: main.getBounds(), onTop, maximized: main.isMaximized()};
        }
        main.unmaximize();
        main.setMinimumSize(280, 220);
        main.setSize(380, 520);
        setOnTop(main, true);
        break;
      case 'restore':
        if (hudSaved) {
          main.setMinimumSize(320, 260);
          main.setBounds(hudSaved.bounds);
          setOnTop(main, hudSaved.onTop);
          hudSaved.maximized && main.maximize();
          hudSaved = null;
        }
        break;
    }
  });

  // Mask pages ask the main process to resize them (their own corner grip).
  ipcMain.on('mask:resize', (e, size) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
      const b = win.getBounds();
      win.setBounds({
        x: b.x,
        y: b.y,
        width: Math.max(40, Math.round(size.width)),
        height: Math.max(40, Math.round(size.height)),
      });
    }
  });
}

/* ---------------------------------- boot ---------------------------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (main) {
      main.isMinimized() && main.restore();
      main.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    createMain();
    // Works while another app is focused – this is what makes Cover mode usable.
    globalShortcut.register(TOGGLE_HOTKEY, () => send('hotkey', {action: 'toggle-covers'}));
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createMain());
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}

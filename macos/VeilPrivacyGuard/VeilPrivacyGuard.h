#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// macOS implementation of the VeilPrivacyGuard contract (src/core/native/types.ts).
/// Legacy (bridge) architecture: an RCTEventEmitter exporting promise-based methods,
/// all executed on the main queue because every call touches AppKit.
@interface VeilPrivacyGuard : RCTEventEmitter <RCTBridgeModule>
@end

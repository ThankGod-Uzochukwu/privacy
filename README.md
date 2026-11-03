# Veil — desktop screen privacy

One app, two modes, for Windows, macOS and Linux.

| | **Shield** | **Cover** |
|---|---|---|
| Purpose | Nobody can screenshot or record **Veil itself** | Runs in the background, floats over every app, and **lets you take screenshots** while hiding the parts you choose |
| Screenshots | Window is excluded from capture; capture shortcuts are blocked while Veil is focused | Allowed. Shortcuts are never blocked |
| What you see | A protected dashboard | Draggable black **covers** over your apps. Whatever is under a cover comes out hidden in the screenshot |
| Opacity | Window opacity slider (25 – 100 %) | Cover opacity slider (0 – 100 %) + window opacity |
| Hotkey | – | **Ctrl + Alt + Shift + B** (⌃⌥⌘B on macOS) toggles covers from any app |

Both modes share a floating **HUD** (shrink the window below 440 px, or press *Shrink to floating bar*): mode switch, on/off, and opacity, always on top.

## How it is built

React Native on every desktop, with the platform-specific part reduced to one small native contract
([src/core/native/types.ts](src/core/native/types.ts)).

```
src/                         shared TypeScript UI + logic (identical on all three OSes)
  core/native/               the contract + bindings (.native.ts for Metro, .web.ts for Vite)
  core/engine/effective.ts   the one place that turns settings into OS behaviour (both modes)
  core/store/                tiny external store + validated, versioned-safe settings
  features/ components/      screens and design-system primitives (Views only: no icon fonts / SVG libs)
windows/Veil/PrivacyGuard.cpp   Windows  – C++/WinRT, react-native-windows 0.81 (Win32, Fabric)
macos/VeilPrivacyGuard/         macOS    – Objective-C, react-native-macos 0.81 (LEGACY architecture)
electron/ + web/                Linux    – react-native-web in Electron (no maintained RN-Linux exists)
```

| Platform | Renderer | Architecture | Notes |
|---|---|---|---|
| Windows 10 2004+ / 11 | react-native-windows **0.81** Win32 | New (Fabric) | The legacy Paper template for Windows is UWP-only, which cannot exclude windows from capture, hook keys or create overlay windows. Fabric Win32 is the only mode with the needed Win32 access |
| macOS 14+ | react-native-macos **0.81** | **Legacy** (`RCT_NEW_ARCH_ENABLED=0`, pinned in the Podfile) | |
| Linux | react-native-web 0.21 inside Electron | – | X11 and Wayland |

### What each OS can honestly enforce (also shown in-app under *Settings → This platform*)

| | Hide window from capture | Block capture shortcuts | Covers over other apps | Auto-black-out on capture | Window opacity |
|---|---|---|---|---|---|
| Windows | **Full** (`WDA_EXCLUDEFROMCAPTURE`) | **Full** (low-level keyboard hook, while focused) | Yes | Yes | Native alpha |
| macOS | Best-effort (`NSWindow.sharingType`) | Full with Accessibility permission | Yes | With Accessibility permission | Native alpha |
| Linux | **None** – no OS API exists | X11 only; Wayland owns those keys | Yes | No | CSS on a transparent window |

No software can stop a phone pointed at the screen, or a hardware capture card. Veil defends against screenshot and screen-recording software.

## Run it

```bash
npm install --legacy-peer-deps

# tests + types
npm test
npm run typecheck

# Windows (Visual Studio 2022/2026 with “Desktop development with C++”, Windows SDK 10.0.19041+)
npm start                      # Metro
npm run windows                # build + launch

# macOS (Xcode 15+, CocoaPods)
pod install --project-directory=macos
npm run macos

# Linux / development host
npm run linux:dev              # Vite + Electron with hot reload
npm run linux:dist             # AppImage + .deb  (run on Linux)
```

> macOS builds must be signed with a Developer ID and **not sandboxed** (a `CGEventTap` is forbidden by the App
> Sandbox), so Veil is distributed outside the Mac App Store. See `macos/Veil-macOS/Veil.entitlements`.

## Verifying it

```bash
npm test                                                   # unit tests: settings, modes, opacity maths, geometry
npm run web:build
npx electron scripts/smoke-electron.js                     # drives the real UI with real mouse events and asserts on real windows
npx electron scripts/verify-capture.js                     # takes a REAL OS screenshot: protected window absent, cover present (Windows)
```

(If your terminal sets `ELECTRON_RUN_AS_NODE`, unset it first — VS Code's does.)

## Design notes

* **Opacity** is a first-class, draggable control (`DragSlider`, built on `PanResponder` so the gesture code is
  identical everywhere). Window opacity goes to real OS alpha (`SetLayeredWindowAttributes`, `NSWindow.alphaValue`);
  cover opacity is per-window alpha. Slider updates are coalesced (`latestOnly`) so a fast drag never queues native calls.
  The window can never be set below 25 % so it can always be found again.
* **Covers** are separate native windows, *included* in captures on purpose. They never take focus, can be locked to be
  click-through, and are kept above other topmost windows by a periodic re-assert.
* **Auto-black-out** (Windows, macOS): with covers at, say, 0 % idle opacity, the keyboard hook sees a capture hotkey
  and snaps every cover to solid black *before* the capture tool runs, then fades back. On Windows this waits for
  `DwmFlush()` so the black frame is composed first.
* **Responsive / adaptive**: layout follows the *window*, not the device — HUD (<440) · compact (<620, bottom bar) ·
  medium (<960, rail) · expanded (two columns, sidebar).
* **Scalable**: add a screen by adding a folder under `features/` and one route; add a native capability by adding one
  method to the contract and implementing it in each platform module.

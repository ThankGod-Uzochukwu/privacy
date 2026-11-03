// VeilPrivacyGuard – the Windows implementation of the contract in
// src/core/native/types.ts.
//
//   Shield mode : SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) hides the app
//                 from every screenshot / recording, and a low-level keyboard
//                 hook swallows capture hotkeys while the app is focused.
//   Cover mode  : always-on-top, layered, black "cover" windows that DO appear in
//                 captures, so whatever lies beneath them is hidden. Draggable and
//                 resizable natively; opacity is real per-window alpha.
//
// Threading: one dedicated "guard" thread owns the keyboard hook, the cover
// windows, the hotkey and the timers (a hook needs a thread with a message
// loop). Work reaches it through Post(). Operations on the main window are
// executed directly on the caller's thread – Win32 allows that.

#include "pch.h"

#include "PrivacyGuard.h"

#include "NativeModules.h"

#include <dwmapi.h>
#include <shlobj.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")

using namespace winrt::Microsoft::ReactNative;

#ifndef WDA_EXCLUDEFROMCAPTURE
#define WDA_EXCLUDEFROMCAPTURE 0x00000011
#endif

namespace veil {

namespace {

constexpr UINT WM_VEIL_TASK = WM_APP + 1;
constexpr UINT_PTR TIMER_TOPMOST = 1;
constexpr UINT_PTR TIMER_BLACKOUT = 2;
constexpr int HOTKEY_TOGGLE_COVERS = 1;
constexpr wchar_t kMaskClass[] = L"VeilCoverWindow";
constexpr wchar_t kMsgClass[] = L"VeilGuardMessageWindow";
constexpr int kMinMaskSize = 40;
constexpr int kResizeBorder = 10;
constexpr BYTE kMinVisibleAlpha = 1;
// Below this a cover is effectively invisible, so it must not eat mouse clicks.
constexpr double kClickThroughBelow = 0.05;

// ---------------------------------------------------------------------------
// helpers

BYTE ToAlpha(double opacity) {
  const double clamped = std::min(1.0, std::max(0.0, opacity));
  return static_cast<BYTE>(std::lround(clamped * 255.0));
}

DWORD BuildNumber() {
  using RtlGetVersionFn = LONG(WINAPI *)(PRTL_OSVERSIONINFOW);
  static const DWORD build = [] {
    if (HMODULE ntdll = GetModuleHandleW(L"ntdll.dll")) {
      if (auto fn = reinterpret_cast<RtlGetVersionFn>(GetProcAddress(ntdll, "RtlGetVersion"))) {
        RTL_OSVERSIONINFOW info{};
        info.dwOSVersionInfoSize = sizeof(info);
        if (fn(&info) == 0) {
          return info.dwBuildNumber;
        }
      }
    }
    return static_cast<DWORD>(0);
  }();
  return build;
}

/// WDA_EXCLUDEFROMCAPTURE needs Windows 10 version 2004 (build 19041). Before
/// that the closest behaviour is WDA_MONITOR, which captures a black rectangle.
bool HasExcludeFromCapture() {
  return BuildNumber() >= 19041;
}

std::wstring SettingsPath(bool create) {
  PWSTR raw = nullptr;
  std::wstring dir;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &raw)) && raw) {
    dir = raw;
    CoTaskMemFree(raw);
  }
  if (dir.empty()) {
    return L"";
  }
  dir += L"\\Veil";
  if (create) {
    CreateDirectoryW(dir.c_str(), nullptr); // fine if it already exists
  }
  return dir + L"\\settings.json";
}

struct MaskSpec {
  std::string id;
  int x = 0, y = 0, w = kMinMaskSize, h = kMinMaskSize;
};

struct MaskWindow {
  std::string id;
  HWND hwnd = nullptr;
};

// ---------------------------------------------------------------------------
// the guard

class Guard {
 public:
  static Guard &Get() {
    static Guard instance;
    return instance;
  }

  void SetContext(ReactContext const &ctx) {
    std::lock_guard<std::mutex> lock(m_ctxMutex);
    m_ctx = ctx;
  }

  void SetMainWindow(HWND hwnd) noexcept {
    m_main = hwnd;
  }

  /// Starts the guard thread (once) and waits until its message window exists.
  void EnsureThread() {
    std::unique_lock<std::mutex> lock(m_startMutex);
    if (m_started) {
      return;
    }
    m_started = true;
    m_thread = std::thread([this] { ThreadMain(); });
    m_thread.detach(); // lives for the whole process; torn down with it
    m_startCv.wait(lock, [this] { return m_msgWnd != nullptr; });
  }

  void Post(std::function<void()> fn) {
    EnsureThread();
    auto *task = new std::function<void()>(std::move(fn));
    if (!PostMessageW(m_msgWnd, WM_VEIL_TASK, 0, reinterpret_cast<LPARAM>(task))) {
      delete task;
    }
  }

  // ---- main-window operations (any thread) --------------------------------

  HWND MainWindow() {
    if (m_main && IsWindow(m_main)) {
      return m_main;
    }
    // Fallback: the first visible, un-owned top-level window of this process.
    struct Ctx {
      HWND found = nullptr;
    } ctx;
    EnumWindows(
        [](HWND h, LPARAM lp) -> BOOL {
          DWORD pid = 0;
          GetWindowThreadProcessId(h, &pid);
          wchar_t cls[64]{};
          GetClassNameW(h, cls, 64);
          if (pid == GetCurrentProcessId() && IsWindowVisible(h) && GetWindow(h, GW_OWNER) == nullptr &&
              wcscmp(cls, kMaskClass) != 0 && wcscmp(cls, kMsgClass) != 0) {
            reinterpret_cast<Ctx *>(lp)->found = h;
            return FALSE;
          }
          return TRUE;
        },
        reinterpret_cast<LPARAM>(&ctx));
    m_main = ctx.found;
    return m_main;
  }

  bool SetCaptureProtection(bool enabled) {
    HWND hwnd = MainWindow();
    if (!hwnd) {
      return false;
    }
    if (!enabled) {
      return SetWindowDisplayAffinity(hwnd, WDA_NONE) != FALSE;
    }
    if (HasExcludeFromCapture() && SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)) {
      return true;
    }
    return SetWindowDisplayAffinity(hwnd, WDA_MONITOR) != FALSE; // black box instead of a hole
  }

  bool SetAlwaysOnTop(bool enabled) {
    HWND hwnd = MainWindow();
    if (!hwnd) {
      return false;
    }
    m_alwaysOnTop = enabled;
    const bool ok = ApplyTopmost(hwnd, enabled);
    // Keep re-asserting: other topmost windows can appear above us later.
    Post([this, enabled] {
      if (enabled) {
        SetTimer(m_msgWnd, TIMER_TOPMOST, 1500, nullptr);
      } else {
        KillTimer(m_msgWnd, TIMER_TOPMOST);
      }
    });
    return ok;
  }

  bool SetWindowOpacity(double opacity) {
    HWND hwnd = MainWindow();
    if (!hwnd) {
      return false;
    }
    const LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (opacity >= 0.999) {
      // Fully opaque: drop the layered style so the window renders exactly as normal.
      if (ex & WS_EX_LAYERED) {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & ~static_cast<LONG_PTR>(WS_EX_LAYERED));
        RedrawWindow(hwnd, nullptr, nullptr, RDW_INVALIDATE | RDW_ALLCHILDREN | RDW_FRAME);
      }
      return true;
    }
    if (!(ex & WS_EX_LAYERED)) {
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED);
    }
    return SetLayeredWindowAttributes(hwnd, 0, ToAlpha(std::max(0.25, opacity)), LWA_ALPHA) != FALSE;
  }

  void WindowControl(std::string const &action) {
    HWND hwnd = MainWindow();
    if (!hwnd) {
      return;
    }
    if (action == "minimize") {
      ShowWindow(hwnd, SW_MINIMIZE);
    } else if (action == "maximize") {
      ShowWindow(hwnd, IsZoomed(hwnd) ? SW_RESTORE : SW_MAXIMIZE);
    } else if (action == "close") {
      PostMessageW(hwnd, WM_CLOSE, 0, 0);
    } else if (action == "hud") {
      if (!m_hudSaved) {
        m_hudSaved = true;
        m_hudZoomed = IsZoomed(hwnd) != FALSE;
        if (m_hudZoomed) {
          ShowWindow(hwnd, SW_RESTORE);
        }
        GetWindowRect(hwnd, &m_hudRect);
        m_hudTopmost = m_alwaysOnTop;
      }
      const UINT dpi = GetDpiForWindow(hwnd);
      const int w = MulDiv(380, dpi, 96);
      const int h = MulDiv(520, dpi, 96);
      SetWindowPos(hwnd, HWND_TOPMOST, m_hudRect.left, m_hudRect.top, w, h, SWP_NOACTIVATE);
    } else if (action == "restore") {
      if (m_hudSaved) {
        m_hudSaved = false;
        SetWindowPos(
            hwnd,
            m_hudTopmost ? HWND_TOPMOST : HWND_NOTOPMOST,
            m_hudRect.left,
            m_hudRect.top,
            m_hudRect.right - m_hudRect.left,
            m_hudRect.bottom - m_hudRect.top,
            SWP_NOACTIVATE);
        if (m_hudZoomed) {
          ShowWindow(hwnd, SW_MAXIMIZE);
        }
      }
    }
  }

  // ---- guard-thread operations (call only through Post) -------------------

  void SetShortcutBlockingOnThread(bool enabled) {
    m_blockShortcuts = enabled;
    UpdateHook();
  }

  void SetAutoBlackoutOnThread(bool enabled, DWORD durationMs) {
    m_autoBlackout = enabled;
    m_blackoutMs = std::max<DWORD>(500, durationMs);
    if (!enabled) {
      EndFlash();
    }
    UpdateHook();
  }

  void SyncMasksOnThread(std::vector<MaskSpec> const &specs, double opacity, bool locked) {
    m_maskOpacity = opacity;
    m_maskLocked = locked;

    std::set<std::string> wanted;
    for (auto const &s : specs) {
      wanted.insert(s.id);
    }
    for (auto it = m_masks.begin(); it != m_masks.end();) {
      if (!wanted.count(it->first)) {
        DestroyWindow(it->second.hwnd);
        it = m_masks.erase(it);
      } else {
        ++it;
      }
    }
    for (auto const &s : specs) {
      auto it = m_masks.find(s.id);
      if (it == m_masks.end()) {
        HWND hwnd = CreateMask(s);
        if (!hwnd) {
          continue;
        }
        it = m_masks.emplace(s.id, MaskWindow{s.id, hwnd}).first;
      } else {
        RECT cur{};
        GetWindowRect(it->second.hwnd, &cur);
        if (cur.left != s.x || cur.top != s.y || (cur.right - cur.left) != s.w || (cur.bottom - cur.top) != s.h) {
          SetWindowPos(it->second.hwnd, HWND_TOPMOST, s.x, s.y, s.w, s.h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
      }
      ApplyMaskStyle(it->second.hwnd, m_flashing ? 1.0 : m_maskOpacity);
    }
    UpdateHook();
  }

  // ---- events --------------------------------------------------------------

  void Emit(wchar_t const *name, JSValueObject &&payload) {
    ReactContext ctx;
    {
      std::lock_guard<std::mutex> lock(m_ctxMutex);
      ctx = m_ctx;
    }
    if (ctx) {
      ctx.EmitJSEvent(L"RCTDeviceEventEmitter", name, std::move(payload));
    }
  }

  void EmitMaskMoved(HWND hwnd) {
    for (auto const &kv : m_masks) {
      if (kv.second.hwnd == hwnd) {
        RECT r{};
        GetWindowRect(hwnd, &r);
        Emit(
            L"veilMaskMoved",
            JSValueObject{
                {"id", kv.first},
                {"x", static_cast<double>(r.left)},
                {"y", static_cast<double>(r.top)},
                {"width", static_cast<double>(r.right - r.left)},
                {"height", static_cast<double>(r.bottom - r.top)}});
        return;
      }
    }
  }

 private:
  Guard() = default;

  // ---- thread --------------------------------------------------------------

  void ThreadMain() {
    HINSTANCE inst = GetModuleHandleW(nullptr);

    WNDCLASSEXW mc{};
    mc.cbSize = sizeof(mc);
    mc.lpfnWndProc = &Guard::MsgProc;
    mc.hInstance = inst;
    mc.lpszClassName = kMsgClass;
    RegisterClassExW(&mc);

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = &Guard::MaskProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursorW(nullptr, IDC_SIZEALL);
    wc.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    wc.lpszClassName = kMaskClass;
    RegisterClassExW(&wc);

    HWND msg = CreateWindowExW(0, kMsgClass, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, inst, nullptr);
    {
      std::lock_guard<std::mutex> lock(m_startMutex);
      m_msgWnd = msg;
    }
    m_startCv.notify_all();

    // Works from any app: lets the user switch covers on/off without leaving what they're doing.
    RegisterHotKey(msg, HOTKEY_TOGGLE_COVERS, MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 'B');

    MSG m;
    while (GetMessageW(&m, nullptr, 0, 0) > 0) {
      TranslateMessage(&m);
      DispatchMessageW(&m);
    }
    if (m_hook) {
      UnhookWindowsHookEx(m_hook);
      m_hook = nullptr;
    }
  }

  static LRESULT CALLBACK MsgProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    Guard &g = Get();
    switch (msg) {
      case WM_VEIL_TASK: {
        std::unique_ptr<std::function<void()>> task(reinterpret_cast<std::function<void()> *>(lp));
        if (task && *task) {
          (*task)();
        }
        return 0;
      }
      case WM_HOTKEY:
        if (wp == HOTKEY_TOGGLE_COVERS) {
          g.Emit(L"veilHotkey", JSValueObject{{"action", "toggle-covers"}});
        }
        return 0;
      case WM_TIMER:
        if (wp == TIMER_TOPMOST) {
          g.Reassert();
        } else if (wp == TIMER_BLACKOUT) {
          g.EndFlash();
        }
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
  }

  // ---- cover windows -------------------------------------------------------

  HWND CreateMask(MaskSpec const &s) {
    HWND hwnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED,
        kMaskClass,
        L"Veil cover",
        WS_POPUP | WS_THICKFRAME,
        s.x,
        s.y,
        s.w,
        s.h,
        nullptr,
        nullptr,
        GetModuleHandleW(nullptr),
        nullptr);
    if (!hwnd) {
      return nullptr;
    }
    // Covers are meant to appear in screenshots: make sure they are NOT excluded.
    SetWindowDisplayAffinity(hwnd, WDA_NONE);
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    SetWindowPos(hwnd, HWND_TOPMOST, s.x, s.y, s.w, s.h, SWP_NOACTIVATE | SWP_FRAMECHANGED);
    return hwnd;
  }

  void ApplyMaskStyle(HWND hwnd, double opacity) {
    const bool clickThrough = m_maskLocked || opacity < kClickThroughBelow;
    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    const LONG_PTR want = clickThrough ? (ex | WS_EX_TRANSPARENT) : (ex & ~static_cast<LONG_PTR>(WS_EX_TRANSPARENT));
    if (want != ex) {
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
    }
    // Never fully 0: a layered window with alpha 0 can stop being composed.
    const BYTE alpha = std::max<BYTE>(kMinVisibleAlpha, ToAlpha(opacity));
    SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
  }

  static LRESULT CALLBACK MaskProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
      case WM_NCCALCSIZE:
        // Client area == whole window: WS_THICKFRAME only exists to enable resizing.
        if (wp) {
          return 0;
        }
        break;
      case WM_NCHITTEST: {
        RECT r{};
        GetWindowRect(hwnd, &r);
        const LONG x = static_cast<short>(LOWORD(lp));
        const LONG y = static_cast<short>(HIWORD(lp));
        const bool left = x < r.left + kResizeBorder;
        const bool right = x >= r.right - kResizeBorder;
        const bool top = y < r.top + kResizeBorder;
        const bool bottom = y >= r.bottom - kResizeBorder;
        if (top && left) return HTTOPLEFT;
        if (top && right) return HTTOPRIGHT;
        if (bottom && left) return HTBOTTOMLEFT;
        if (bottom && right) return HTBOTTOMRIGHT;
        if (left) return HTLEFT;
        if (right) return HTRIGHT;
        if (top) return HTTOP;
        if (bottom) return HTBOTTOM;
        return HTCAPTION;
      }
      case WM_GETMINMAXINFO: {
        auto *mmi = reinterpret_cast<MINMAXINFO *>(lp);
        mmi->ptMinTrackSize.x = kMinMaskSize;
        mmi->ptMinTrackSize.y = kMinMaskSize;
        return 0;
      }
      case WM_MOUSEACTIVATE:
        return MA_NOACTIVATE; // dragging a cover must never pull focus from the app underneath
      case WM_DPICHANGED:
        return 0; // keep the same physical pixels covered when dragged across monitors
      case WM_EXITSIZEMOVE:
        Get().EmitMaskMoved(hwnd);
        return 0;
      case WM_SETCURSOR:
        break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
  }

  // ---- auto black-out ------------------------------------------------------

  /// Snap every cover to solid black *now*. DwmFlush blocks until the next
  /// composition pass so the black frame is on screen before the capture tool
  /// (which is still waiting on our hook) takes its picture.
  void Flash() {
    if (m_masks.empty()) {
      return;
    }
    m_flashing = true;
    for (auto const &kv : m_masks) {
      LONG_PTR ex = GetWindowLongPtrW(kv.second.hwnd, GWL_EXSTYLE);
      SetWindowLongPtrW(kv.second.hwnd, GWL_EXSTYLE, ex & ~static_cast<LONG_PTR>(WS_EX_TRANSPARENT));
      SetLayeredWindowAttributes(kv.second.hwnd, 0, 255, LWA_ALPHA);
      SetWindowPos(kv.second.hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
    DwmFlush();
    SetTimer(m_msgWnd, TIMER_BLACKOUT, m_blackoutMs, nullptr);
  }

  void EndFlash() {
    KillTimer(m_msgWnd, TIMER_BLACKOUT);
    if (!m_flashing) {
      return;
    }
    m_flashing = false;
    for (auto const &kv : m_masks) {
      ApplyMaskStyle(kv.second.hwnd, m_maskOpacity);
    }
  }

  void Reassert() {
    if (m_alwaysOnTop) {
      if (HWND main = m_main) {
        ApplyTopmost(main, true);
      }
    }
    for (auto const &kv : m_masks) {
      SetWindowPos(kv.second.hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
  }

  static bool ApplyTopmost(HWND hwnd, bool enabled) {
    return SetWindowPos(
               hwnd,
               enabled ? HWND_TOPMOST : HWND_NOTOPMOST,
               0,
               0,
               0,
               0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) != FALSE;
  }

  // ---- keyboard hook -------------------------------------------------------

  /// The hook is only installed while it has a job, so the app adds no
  /// overhead to normal typing when protection is off.
  void UpdateHook() {
    const bool need = m_blockShortcuts || (m_autoBlackout && !m_masks.empty());
    if (need && !m_hook) {
      m_hook = SetWindowsHookExW(WH_KEYBOARD_LL, &Guard::KeyboardProc, GetModuleHandleW(nullptr), 0);
    } else if (!need && m_hook) {
      UnhookWindowsHookEx(m_hook);
      m_hook = nullptr;
      m_swallowed.clear();
    }
  }

  static bool Down(int vk) {
    return (GetAsyncKeyState(vk) & 0x8000) != 0;
  }

  /// Names the capture / recording shortcut for this key press, or "" if it isn't one.
  static std::string Classify(DWORD vk) {
    const bool win = Down(VK_LWIN) || Down(VK_RWIN);
    const bool ctrl = Down(VK_CONTROL);
    const bool alt = Down(VK_MENU);
    const bool shift = Down(VK_SHIFT);

    std::string mods;
    if (win) mods += "Win+";
    if (ctrl) mods += "Ctrl+";
    if (alt) mods += "Alt+";
    if (shift) mods += "Shift+";

    if (vk == VK_SNAPSHOT) return mods + "PrintScreen";
    if (win && shift && vk == 'S') return "Win+Shift+S";        // Snipping Tool
    if (win && shift && vk == 'R') return "Win+Shift+R";        // Snipping Tool recording
    if (win && alt && vk == 'R') return "Win+Alt+R";            // Xbox Game Bar record
    if (win && alt && vk == 'G') return "Win+Alt+G";            // Game Bar: record last 30s
    if (win && !alt && !shift && !ctrl && vk == 'G') return "Win+G"; // Game Bar
    return "";
  }

  static bool ForegroundIsThisApp() {
    HWND fg = GetForegroundWindow();
    if (!fg) {
      return false;
    }
    DWORD pid = 0;
    GetWindowThreadProcessId(fg, &pid);
    return pid == GetCurrentProcessId();
  }

  /// Swallowing a Win+<key> combo would otherwise leave a bare Win press, which
  /// opens the Start menu. A harmless injected key in between cancels that.
  static void CancelStartMenu() {
    INPUT in[2]{};
    in[0].type = in[1].type = INPUT_KEYBOARD;
    in[0].ki.wVk = in[1].ki.wVk = 0xE8; // unassigned virtual key
    in[1].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(2, in, sizeof(INPUT));
  }

  static LRESULT CALLBACK KeyboardProc(int code, WPARAM wp, LPARAM lp) {
    if (code != HC_ACTION) {
      return CallNextHookEx(nullptr, code, wp, lp);
    }
    auto const *kb = reinterpret_cast<KBDLLHOOKSTRUCT const *>(lp);
    if (kb->flags & LLKHF_INJECTED) { // our own CancelStartMenu input, or other tools'
      return CallNextHookEx(nullptr, code, wp, lp);
    }

    Guard &g = Get();
    const bool isDown = wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN;
    const bool isUp = wp == WM_KEYUP || wp == WM_SYSKEYUP;

    // Key-ups of keys we swallowed must be swallowed too.
    if (isUp && g.m_swallowed.erase(kb->vkCode)) {
      return 1;
    }
    if (!isDown) {
      return CallNextHookEx(nullptr, code, wp, lp);
    }

    const std::string combo = Classify(kb->vkCode);
    if (combo.empty()) {
      return CallNextHookEx(nullptr, code, wp, lp);
    }

    if (g.m_blockShortcuts && ForegroundIsThisApp()) {
      g.m_swallowed.insert(kb->vkCode);
      if (combo.rfind("Win", 0) == 0) {
        CancelStartMenu();
      }
      g.Emit(L"veilBlocked", JSValueObject{{"combo", combo}, {"at", static_cast<double>(GetTickCount64())}});
      return 1;
    }

    if (g.m_autoBlackout && !g.m_masks.empty()) {
      g.Flash(); // the capture is allowed – but the covers are solid black when it happens
      g.Emit(L"veilCaptureAttempt", JSValueObject{{"combo", combo}, {"at", static_cast<double>(GetTickCount64())}});
    }
    return CallNextHookEx(nullptr, code, wp, lp);
  }

  // ---- state ---------------------------------------------------------------

  std::mutex m_ctxMutex;
  ReactContext m_ctx;

  std::mutex m_startMutex;
  std::condition_variable m_startCv;
  bool m_started = false;
  std::thread m_thread;
  HWND m_msgWnd = nullptr;

  std::atomic<HWND> m_main{nullptr};
  bool m_alwaysOnTop = false;

  bool m_hudSaved = false;
  bool m_hudZoomed = false;
  bool m_hudTopmost = false;
  RECT m_hudRect{};

  // guard-thread state
  HHOOK m_hook = nullptr;
  bool m_blockShortcuts = false;
  bool m_autoBlackout = false;
  DWORD m_blackoutMs = 3000;
  bool m_flashing = false;
  double m_maskOpacity = 1.0;
  bool m_maskLocked = false;
  std::map<std::string, MaskWindow> m_masks;
  std::set<DWORD> m_swallowed;
};

} // namespace

void SetMainWindow(HWND hwnd) noexcept {
  Guard::Get().SetMainWindow(hwnd);
}

} // namespace veil

// ---------------------------------------------------------------------------
// the React Native module

namespace Veil {

REACT_MODULE(VeilPrivacyGuard)
struct VeilPrivacyGuard {
  REACT_INIT(Init)
  void Init(ReactContext const &context) noexcept {
    veil::Guard::Get().SetContext(context);
    veil::Guard::Get().EnsureThread();
  }

  REACT_METHOD(GetCapabilities, L"getCapabilities")
  void GetCapabilities(ReactPromise<JSValueObject> &&promise) noexcept {
    const bool excludes = veil::HasExcludeFromCapture();
    JSValueArray notes;
    notes.push_back(
        excludes
            ? "Veil is excluded from screenshots and recordings with SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)."
            : "This Windows build predates 2004, so Veil appears as a black box in captures instead of being removed.");
    notes.push_back(
        "Capture shortcuts (Print Screen, Win+Shift+S, Game Bar) are blocked only while Veil is the focused window.");
    notes.push_back(
        "Some GPU-level capture paths (certain drivers, hardware capture cards) can still see protected windows.");
    notes.push_back("Covers are real always-on-top windows, so they appear black in every screenshot.");

    JSValueObject caps{
        {"platform", "windows"},
        {"captureProtection", excludes ? "full" : "partial"},
        {"shortcutBlocking", "full"},
        {"maskWindows", true},
        {"autoBlackout", true},
        {"windowOpacity", true},
        {"windowOpacityMode", "native"},
        {"alwaysOnTop", true},
        {"customChrome", false},
        {"globalHotkey", true},
        {"notes", std::move(notes)}};
    promise.Resolve(caps);
  }

  REACT_METHOD(SetCaptureProtection, L"setCaptureProtection")
  void SetCaptureProtection(bool enabled, ReactPromise<bool> &&promise) noexcept {
    promise.Resolve(veil::Guard::Get().SetCaptureProtection(enabled));
  }

  REACT_METHOD(SetShortcutBlocking, L"setShortcutBlocking")
  void SetShortcutBlocking(bool enabled, ReactPromise<bool> &&promise) noexcept {
    veil::Guard::Get().Post([enabled] { veil::Guard::Get().SetShortcutBlockingOnThread(enabled); });
    promise.Resolve(true);
  }

  REACT_METHOD(SetAlwaysOnTop, L"setAlwaysOnTop")
  void SetAlwaysOnTop(bool enabled, ReactPromise<bool> &&promise) noexcept {
    promise.Resolve(veil::Guard::Get().SetAlwaysOnTop(enabled));
  }

  REACT_METHOD(SetWindowOpacity, L"setWindowOpacity")
  void SetWindowOpacity(double opacity, ReactPromise<bool> &&promise) noexcept {
    promise.Resolve(veil::Guard::Get().SetWindowOpacity(opacity));
  }

  REACT_METHOD(GetDisplayBounds, L"getDisplayBounds")
  void GetDisplayBounds(ReactPromise<JSValueObject> &&promise) noexcept {
    JSValueObject b{
        {"x", static_cast<double>(GetSystemMetrics(SM_XVIRTUALSCREEN))},
        {"y", static_cast<double>(GetSystemMetrics(SM_YVIRTUALSCREEN))},
        {"width", static_cast<double>(GetSystemMetrics(SM_CXVIRTUALSCREEN))},
        {"height", static_cast<double>(GetSystemMetrics(SM_CYVIRTUALSCREEN))}};
    promise.Resolve(b);
  }

  REACT_METHOD(SyncMasks, L"syncMasks")
  void SyncMasks(JSValueArray &&masks, double opacity, bool locked, ReactPromise<void> &&promise) noexcept {
    std::vector<veil::MaskSpec> specs;
    specs.reserve(masks.size());
    for (auto const &item : masks) {
      auto const *obj = item.TryGetObject();
      if (!obj) {
        continue;
      }
      veil::MaskSpec s;
      s.id = (*obj)["id"].AsString();
      s.x = static_cast<int>(std::lround((*obj)["x"].AsDouble()));
      s.y = static_cast<int>(std::lround((*obj)["y"].AsDouble()));
      s.w = std::max<int>(veil::kMinMaskSize, static_cast<int>(std::lround((*obj)["width"].AsDouble())));
      s.h = std::max<int>(veil::kMinMaskSize, static_cast<int>(std::lround((*obj)["height"].AsDouble())));
      if (!s.id.empty()) {
        specs.push_back(std::move(s));
      }
    }
    veil::Guard::Get().Post([specs = std::move(specs), opacity, locked] {
      veil::Guard::Get().SyncMasksOnThread(specs, opacity, locked);
    });
    promise.Resolve();
  }

  REACT_METHOD(SetAutoBlackout, L"setAutoBlackout")
  void SetAutoBlackout(bool enabled, double durationMs, ReactPromise<bool> &&promise) noexcept {
    const DWORD ms = static_cast<DWORD>(std::max(0.0, durationMs));
    veil::Guard::Get().Post([enabled, ms] { veil::Guard::Get().SetAutoBlackoutOnThread(enabled, ms); });
    promise.Resolve(true);
  }

  REACT_METHOD(LoadSettings, L"loadSettings")
  void LoadSettings(ReactPromise<JSValue> &&promise) noexcept {
    const std::wstring path = veil::SettingsPath(false);
    HANDLE f = path.empty() ? INVALID_HANDLE_VALUE
                            : CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) {
      promise.Resolve(JSValue{nullptr});
      return;
    }
    LARGE_INTEGER size{};
    std::string data;
    if (GetFileSizeEx(f, &size) && size.QuadPart > 0 && size.QuadPart < (4 << 20)) {
      data.resize(static_cast<size_t>(size.QuadPart));
      DWORD read = 0;
      if (!ReadFile(f, data.data(), static_cast<DWORD>(data.size()), &read, nullptr)) {
        data.clear();
      } else {
        data.resize(read);
      }
    }
    CloseHandle(f);
    if (data.empty()) {
      promise.Resolve(JSValue{nullptr});
    } else {
      promise.Resolve(JSValue{std::move(data)});
    }
  }

  REACT_METHOD(SaveSettings, L"saveSettings")
  void SaveSettings(std::string &&json, ReactPromise<void> &&promise) noexcept {
    const std::wstring path = veil::SettingsPath(true);
    if (path.empty()) {
      promise.Reject("Could not resolve the settings folder");
      return;
    }
    // Write to a temp file then swap, so a crash can never leave half a settings file.
    const std::wstring tmp = path + L".tmp";
    HANDLE f = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) {
      promise.Reject("Could not write settings");
      return;
    }
    DWORD written = 0;
    const BOOL ok = WriteFile(f, json.data(), static_cast<DWORD>(json.size()), &written, nullptr);
    CloseHandle(f);
    if (!ok || written != json.size() || !MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)) {
      promise.Reject("Could not write settings");
      return;
    }
    promise.Resolve();
  }

  REACT_METHOD(WindowControl, L"windowControl")
  void WindowControl(std::string &&action, ReactPromise<void> &&promise) noexcept {
    veil::Guard::Get().WindowControl(action);
    promise.Resolve();
  }
};

} // namespace Veil

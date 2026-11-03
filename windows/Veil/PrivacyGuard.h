#pragma once

#include <windows.h>

namespace veil {

/// Tells the privacy module which HWND is the app's main window. Call once the
/// window exists and before the message loop starts (see Veil.cpp).
void SetMainWindow(HWND hwnd) noexcept;

} // namespace veil

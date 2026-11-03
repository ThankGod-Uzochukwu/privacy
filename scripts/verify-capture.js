'use strict';

/**
 * Proves the two halves of Veil on the real desktop, using a real OS screenshot:
 *
 *   1. SHIELD  – a capture-protected window is absent from the screenshot.
 *   2. COVER   – an ordinary always-on-top window (what a cover is) IS in the screenshot,
 *                so whatever lies beneath it comes out hidden.
 *
 * A bright green "sensitive" window sits at the bottom. A protected window and a black
 * cover are placed over different parts of it; we screenshot the screen with GDI (the same
 * path Print Screen / Snipping Tool style tools use) and sample the pixels.
 *
 *   npx electron scripts/verify-capture.js          (Windows)
 */

const {app, BrowserWindow, screen} = require('electron');
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'veil-capture');
fs.mkdirSync(OUT, {recursive: true});
const wait = ms => new Promise(r => setTimeout(r, ms));

function solid(color, x, y, w, h, opts = {}) {
  const win = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false, resizable: false, skipTaskbar: true, show: false, focusable: false,
    backgroundColor: color, alwaysOnTop: true, ...opts,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL('data:text/html,<body style="margin:0"></body>');
  return win;
}

/** Screenshot of the primary display via GDI, then the colour at each point (physical px). */
function screenshotAndSample(points, file) {
  const ps = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[void][Dpi]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$bmp.Save('${file.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Png)
${points.map(([x, y]) => `$c = $bmp.GetPixel(${x}, ${y}); "$($c.R),$($c.G),$($c.B)"`).join('\n')}
`;
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8'});
  return out.trim().split(/\r?\n/).slice(-points.length).map(l => l.split(',').map(Number));
}

const near = (c, r, g, b, tol = 40) => Math.abs(c[0] - r) <= tol && Math.abs(c[1] - g) <= tol && Math.abs(c[2] - b) <= tol;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  const k = d.scaleFactor;
  const W = d.bounds.width;
  const H = d.bounds.height;

  // layout in DIPs (all inside the primary display)
  const green = {x: 100, y: 100, w: Math.min(900, W - 200), h: Math.min(500, H - 200)};
  const sensitive = solid('#00FF00', green.x, green.y, green.w, green.h);          // the "sensitive content"
  const protectedWin = solid('#FF00FF', green.x + 40, green.y + 40, 200, 150);      // Shield window: magenta
  const cover = solid('#000000', green.x + 400, green.y + 40, 200, 150);            // Cover: black
  protectedWin.setContentProtection(true);
  cover.setContentProtection(false);
  [sensitive, protectedWin, cover].forEach(w => w.showInactive());
  await wait(1500);

  const px = (dx, dy) => [Math.round((green.x + dx) * k), Math.round((green.y + dy) * k)];
  const [protectedPx, coverPx, plainPx] = screenshotAndSample(
    [px(140, 115), px(500, 115), px(300, 400)],
    path.join(OUT, 'real-screenshot.png'),
  );

  console.log(`display ${W}x${H} @${k}x  protectedPx=${protectedPx} coverPx=${coverPx} plainPx=${plainPx}`);
  check('Shield: a capture-protected window is NOT in the screenshot (the green beneath shows)', near(protectedPx, 0, 255, 0) , `got rgb(${protectedPx})`);
  check('Shield: the same window is really on screen (it is only hidden from capture)', protectedWin.isVisible());
  check('Cover: an ordinary always-on-top cover IS in the screenshot as black, hiding the green', near(coverPx, 0, 0, 0, 25), `got rgb(${coverPx})`);
  check('Sensitive content elsewhere is visible (control)', near(plainPx, 0, 255, 0), `got rgb(${plainPx})`);

  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed. Screenshot: ${OUT}`);
  app.exit(results.every(Boolean) ? 0 : 1);
});

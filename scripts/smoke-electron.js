'use strict';

/**
 * End-to-end smoke test of the real Electron host + the real React Native UI.
 * It drives the UI with genuine mouse events and asserts on what the OS-facing
 * layer actually did (window flags, cover windows, opacity, shortcuts).
 *
 *   npm run web:build && npx electron scripts/smoke-electron.js
 *
 * Screenshots are taken with webContents.capturePage(), which is unaffected by
 * the capture protection the app itself applies.
 */

const {app, BrowserWindow, globalShortcut} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'veil-smoke');
fs.mkdirSync(OUT, {recursive: true});
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'veil-userdata-')));

require('../electron/main.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({name, ok: Boolean(ok), detail});
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function run() {
  await app.whenReady();
  await wait(3000);

  const main = BrowserWindow.getAllWindows().find(
    w => !w.webContents.getURL().includes('mask.html'),
  );
  if (!main) throw new Error('main window not found');
  const js = code => main.webContents.executeJavaScript(code);
  const masks = () =>
    BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('mask.html'));

  const shot = async name => {
    const img = await main.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  };
  const rectOf = label =>
    js(`(() => { const e = [...document.querySelectorAll('[aria-label="${label}"]')].find(x => x.getBoundingClientRect().width > 0);
      if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()`);
  const mouse = (type, x, y) =>
    main.webContents.sendInputEvent({
      type,
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1,
    });
  const click = async label => {
    const r = await rectOf(label);
    if (!r) throw new Error(`no element with aria-label "${label}"`);
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    mouse('mouseMove', x, y);
    mouse('mouseDown', x, y);
    mouse('mouseUp', x, y);
    await wait(500);
  };
  /** Drags a slider from its centre to `fraction` of its width using real mouse events. */
  const dragSlider = async (label, fraction) => {
    const r = await rectOf(label);
    if (!r) throw new Error(`no slider "${label}"`);
    const y = r.y + r.h / 2;
    const from = r.x + r.w * 0.5;
    const to = r.x + r.w * fraction;
    mouse('mouseMove', from, y);
    mouse('mouseDown', from, y);
    for (let i = 1; i <= 10; i++) {
      mouse('mouseMove', from + ((to - from) * i) / 10, y);
      await wait(20);
    }
    mouse('mouseUp', to, y);
    await wait(600);
  };

  // ---- boot ----
  const caps = await js(`window.veil.invoke('capabilities')`);
  check(
    'boots and reports capabilities',
    caps && caps.platform,
    JSON.stringify({p: caps.platform, cap: caps.captureProtection}),
  );
  await shot('01-dashboard-shield');

  // ---- Shield mode ----
  check('Shield: window excluded from capture', main.isContentProtected?.() === true);
  main.focus();
  await wait(400);
  const prtscn = globalShortcut.isRegistered('PrintScreen');
  check('Shield: PrintScreen is grabbed while focused', prtscn);
  check('Shield: no cover windows', masks().length === 0);

  // ---- Cover mode ----
  await click('Cover mode');
  await wait(400);
  check('Cover: capture shortcuts are NOT blocked', !globalShortcut.isRegistered('PrintScreen'));
  check('Cover: control panel still hidden from screenshots', main.isContentProtected?.() === true);
  await shot('02-dashboard-cover');

  await click('Add cover');
  await wait(1200);
  check(
    'Cover: adding a cover opens a floating window',
    masks().length === 1,
    `windows=${masks().length}`,
  );
  const m = masks()[0];
  if (m) {
    check(
      'Cover window is NOT capture-protected (must appear in screenshots)',
      m.isContentProtected?.() === false,
    );
    check('Cover window is always on top', m.isAlwaysOnTop());
    check('Cover window never steals focus', !m.isFocusable());
  }

  // opacity of the cover
  await dragSlider('Cover opacity', 0.25);
  await wait(400);
  const bg = m
    ? await m.webContents.executeJavaScript(
        `getComputedStyle(document.getElementById('cover')).backgroundColor`,
      )
    : '';
  const a = Number((bg.match(/rgba?\([^)]*?,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/) || [])[1]);
  check('Cover opacity slider drives the cover window', a > 0.15 && a < 0.35, `background=${bg}`);
  await shot('03-cover-opacity');

  // window opacity
  await click('Overlay');
  await shot('04-overlay');
  await dragSlider('Opacity', 0.35);
  const wo = main.getOpacity();
  check(
    'Window opacity slider drives the OS window',
    wo > 0.3 && wo < 0.6,
    `opacity=${wo.toFixed(2)}`,
  );
  await dragSlider('Opacity', 1);
  check(
    'Window opacity restores to 100%',
    main.getOpacity() > 0.95,
    `opacity=${main.getOpacity().toFixed(2)}`,
  );

  // always on top
  await click('Keep on top of other apps');
  check('Keep-on-top toggle pins the window', main.isAlwaysOnTop());

  // covers screen
  await click('Covers');
  await shot('05-covers-screen');

  // move the cover from the JS map -> real window follows
  const before = m ? m.getBounds() : null;
  const label = await js(
    `[...document.querySelectorAll('[aria-label^="Region 1"]')].map(e=>e.getAttribute('aria-label'))[0] || null`,
  );
  if (label) {
    const r = await rectOf(label);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    mouse('mouseMove', cx, cy);
    mouse('mouseDown', cx, cy);
    for (let i = 1; i <= 8; i++) {
      mouse('mouseMove', cx - 12 * i, cy - 6 * i);
      await wait(25);
    }
    mouse('mouseUp', cx - 96, cy - 48);
    await wait(900);
    const after = m.getBounds();
    check(
      'Dragging a cover on the screen map moves the real cover window',
      after.x < before.x && after.y < before.y,
      `from ${before.x},${before.y} to ${after.x},${after.y}`,
    );
  } else {
    check('screen map exposes the cover', false, 'no Region 1 element');
  }

  // real cover moved by the user (natively) -> the UI follows
  if (m) {
    m.setBounds({x: 100, y: 120, width: 300, height: 200});
    await wait(900);
    const listed = await js(`document.body.innerText.includes('300 × 200 at 100, 120')`);
    check('Moving the real cover updates the UI', listed);
  }

  // ---- hotkey ----
  check(
    'Global toggle hotkey is registered',
    globalShortcut.isRegistered('CommandOrControl+Alt+Shift+B'),
  );

  // ---- back to Shield ----
  await click('Privacy');
  await click('Shield mode');
  await wait(900);
  check(
    'Back in Shield: cover windows are removed',
    masks().length === 0,
    `windows=${masks().length}`,
  );
  main.focus();
  await wait(500);
  check('Back in Shield: PrintScreen grabbed again', globalShortcut.isRegistered('PrintScreen'));

  // ---- persistence ----
  await wait(800);
  const file = path.join(app.getPath('userData'), 'settings.json');
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  check(
    'Settings persisted to disk',
    saved && saved.mode === 'shield' && saved.masks.length === 1 && saved.alwaysOnTop === true,
    saved ? `mode=${saved.mode} masks=${saved.masks.length}` : 'no file',
  );

  // ---- floating bar ----
  await click('Privacy');
  await js(`window.veil.invoke('window-control', 'hud')`);
  await wait(900);
  const hb = main.getBounds();
  check(
    'HUD shrinks the window and pins it',
    hb.width <= 400 && main.isAlwaysOnTop(),
    `${hb.width}x${hb.height}`,
  );
  await shot('06-hud');
  await js(`window.veil.invoke('window-control', 'restore')`);
  await wait(600);
  check('HUD restores the window', main.getBounds().width > 900, `${main.getBounds().width}`);
  await shot('07-restored');
}

run()
  .catch(e => {
    check('smoke run completed', false, String(e && e.stack ? e.stack : e));
  })
  .finally(() => {
    const failed = results.filter(r => !r.ok);
    console.log(
      `\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`,
    );
    app.exit(failed.length ? 1 : 0);
  });

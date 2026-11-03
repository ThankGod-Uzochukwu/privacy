'use strict';

const cover = document.getElementById('cover');
const grip = document.getElementById('grip');

window.maskBridge.onStyle(({opacity, locked}) => {
  cover.style.background = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, opacity))})`;
  document.body.classList.toggle('locked', Boolean(locked));
});

// Corner grip: pointer capture keeps the drag alive even if the cursor outruns the window.
let start = null;
grip.addEventListener('pointerdown', e => {
  grip.setPointerCapture(e.pointerId);
  start = {x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight};
  e.preventDefault();
});
grip.addEventListener('pointermove', e => {
  if (!start) return;
  window.maskBridge.resize(start.w + (e.screenX - start.x), start.h + (e.screenY - start.y));
});
const end = e => {
  start = null;
  if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
};
grip.addEventListener('pointerup', end);
grip.addEventListener('pointercancel', end);

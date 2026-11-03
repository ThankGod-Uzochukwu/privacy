'use strict';

const {contextBridge, ipcRenderer} = require('electron');

// Only these channels exist. The renderer is a web page, so it gets a narrow,
// allow-listed bridge rather than raw ipcRenderer.
const INVOKE = new Set([
  'capabilities',
  'capture-protection',
  'shortcut-blocking',
  'always-on-top',
  'window-opacity',
  'display-bounds',
  'sync-masks',
  'auto-blackout',
  'load-settings',
  'save-settings',
  'window-control',
]);
const EVENTS = new Set(['blocked', 'capture-attempt', 'mask-moved', 'hotkey']);

contextBridge.exposeInMainWorld('veil', {
  invoke(channel, payload) {
    if (!INVOKE.has(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`));
    }
    return ipcRenderer.invoke(`veil:${channel}`, payload);
  },
  on(channel, callback) {
    if (!EVENTS.has(channel)) {
      throw new Error(`Unknown event: ${channel}`);
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(`veil:${channel}`, handler);
    return () => ipcRenderer.removeListener(`veil:${channel}`, handler);
  },
});

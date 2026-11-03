'use strict';

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('maskBridge', {
  onStyle(callback) {
    ipcRenderer.on('mask:style', (_event, style) => callback(style));
  },
  resize(width, height) {
    ipcRenderer.send('mask:resize', {width, height});
  },
});

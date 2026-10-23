const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pet', {
  info: () => ipcRenderer.invoke('info'),
  cursor: () => ipcRenderer.invoke('cursor'),
  move: (x, y) => ipcRenderer.send('move', x, y),
  through: (on) => ipcRenderer.send('through', on),
  icon: (url, theme) => ipcRenderer.send('icon', url, theme),
  onCmd: (fn) => ipcRenderer.on('cmd', (_e, c) => fn(c)),
  onWorld: (fn) => ipcRenderer.on('world', (_e, w) => fn(w)),
  onWatch: (fn) => ipcRenderer.on('watch', (_e, v) => fn(v)),
  onMusic: (fn) => ipcRenderer.on('music', (_e, v) => fn(v)),
  onBusy: (fn) => ipcRenderer.on('busy', (_e, v) => fn(v))
})

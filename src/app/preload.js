const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('steelAPI', {
  onSteelEvent: (cb) => {
    const listener = (_, data) => cb(data)
    ipcRenderer.on('steel-event', listener)
    return () => ipcRenderer.removeListener('steel-event', listener)
  },
  getStats: () => ipcRenderer.invoke('get-stats'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  startDrag: (dx, dy) => ipcRenderer.send('hud-drag', { dx, dy }),
  onScale: (cb) => {
    const listener = (_, s) => cb(s)
    ipcRenderer.on('set-scale', listener)
    return () => ipcRenderer.removeListener('set-scale', listener)
  },
  onStatsReset: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('stats-reset', listener)
    return () => ipcRenderer.removeListener('stats-reset', listener)
  },
  setMouseOver: (v) => ipcRenderer.send('hud-mouse', { entered: v }),
})

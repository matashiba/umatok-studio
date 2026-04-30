const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('umatok', {
  saveBlob: (options) => ipcRenderer.invoke('save-blob', options),
  getFilePath: (file) => webUtils.getPathForFile(file),
  saveProjectFolder: (options) => ipcRenderer.invoke('save-project-folder', options),
  openProjectFolder: () => ipcRenderer.invoke('open-project-folder'),
})

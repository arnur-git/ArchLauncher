const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arch', {
  state: () => ipcRenderer.invoke('get-state'), saveSettings: data => ipcRenderer.invoke('save-settings', data),
  createInstance: data => ipcRenderer.invoke('create-instance', data), deleteInstance: id => ipcRenderer.invoke('delete-instance', id),
  getVersions: loader => ipcRenderer.invoke('get-versions', loader), installJava: major => ipcRenderer.invoke('install-java', major),
  searchMods: data => ipcRenderer.invoke('search-mods', data), installMod: data => ipcRenderer.invoke('install-mod', data), listMods: id => ipcRenderer.invoke('list-mods', id), removeMod: data => ipcRenderer.invoke('remove-mod', data),
  loginOffline: username => ipcRenderer.invoke('login-offline', username), loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'), loginEly: credentials => ipcRenderer.invoke('login-ely-password', credentials),
  saveAccount: account => ipcRenderer.invoke('save-account', account), selectAccount: uuid => ipcRenderer.invoke('select-account', uuid), launchGame: payload => ipcRenderer.invoke('launch-game', payload),
  openFolder: () => ipcRenderer.invoke('open-folder'), openExternal: url => ipcRenderer.invoke('open-external', url),
  on: (channel, callback) => { const allowed = ['auth-status','install-progress','game-log','game-progress','download-progress','game-exit','game-status']; if (allowed.includes(channel)) ipcRenderer.on(channel, (_, data) => callback(data)); }
});

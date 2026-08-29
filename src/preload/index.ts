import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BrowsyAPI, type BrowserState, type ChromePanel, type PopupRequest } from '../shared/types'

const api: BrowsyAPI = {
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  navigate: (input) => ipcRenderer.invoke(IPC.NAVIGATE, input),
  goBack: () => ipcRenderer.invoke(IPC.GO_BACK),
  goForward: () => ipcRenderer.invoke(IPC.GO_FORWARD),
  reload: () => ipcRenderer.invoke(IPC.RELOAD),
  stop: () => ipcRenderer.invoke(IPC.STOP),
  newTab: (url) => ipcRenderer.invoke(IPC.NEW_TAB, url),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  switchTab: (tabId) => ipcRenderer.invoke(IPC.SWITCH_TAB, tabId),
  newWindow: () => ipcRenderer.invoke(IPC.NEW_WINDOW),
  showChrome: (panel: ChromePanel) => ipcRenderer.invoke(IPC.SHOW_CHROME, panel),
  hideChrome: () => ipcRenderer.invoke(IPC.HIDE_CHROME),
  toggleDevTools: () => ipcRenderer.invoke(IPC.TOGGLE_DEVTOOLS),
  getBookmarks: () => ipcRenderer.invoke(IPC.GET_BOOKMARKS),
  addBookmark: (url, title) => ipcRenderer.invoke(IPC.ADD_BOOKMARK, url, title),
  removeBookmark: (id) => ipcRenderer.invoke(IPC.REMOVE_BOOKMARK, id),
  getHistory: () => ipcRenderer.invoke(IPC.GET_HISTORY),
  getRecentSites: () => ipcRenderer.invoke(IPC.GET_RECENT_SITES),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (settings) => ipcRenderer.invoke(IPC.SET_SETTINGS, settings),
  onStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state)
    ipcRenderer.on(IPC.STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.STATE_CHANGED, handler)
  },
  onPopupRequest: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PopupRequest) => callback(request)
    ipcRenderer.on(IPC.POPUP_REQUEST, handler)
    return () => ipcRenderer.removeListener(IPC.POPUP_REQUEST, handler)
  },
  respondToPopup: (id, allow) => ipcRenderer.invoke(IPC.POPUP_RESPONSE, id, allow)
}

contextBridge.exposeInMainWorld('browsy', api)

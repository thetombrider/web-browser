import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type BookmarkResult,
  type BrowsyAPI,
  type BrowserState,
  type ChromePanel,
  type PopupRequest,
  type ToastPayload
} from '../shared/types'

const api: BrowsyAPI = {
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  navigate: (input) => ipcRenderer.invoke(IPC.NAVIGATE, input),
  goBack: () => ipcRenderer.invoke(IPC.GO_BACK),
  goForward: () => ipcRenderer.invoke(IPC.GO_FORWARD),
  reload: () => ipcRenderer.invoke(IPC.RELOAD),
  stop: () => ipcRenderer.invoke(IPC.STOP),
  newTab: (url, forceNew) => ipcRenderer.invoke(IPC.NEW_TAB, url, forceNew),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  switchTab: (tabId) => ipcRenderer.invoke(IPC.SWITCH_TAB, tabId),
  nextTab: () => ipcRenderer.invoke(IPC.NEXT_TAB),
  prevTab: () => ipcRenderer.invoke(IPC.PREV_TAB),
  newWindow: () => ipcRenderer.invoke(IPC.NEW_WINDOW),
  showChrome: (panel: ChromePanel) => ipcRenderer.invoke(IPC.SHOW_CHROME, panel),
  hideChrome: () => ipcRenderer.invoke(IPC.HIDE_CHROME),
  setChromeHeight: (height) => ipcRenderer.invoke(IPC.SET_CHROME_HEIGHT, height),
  startWindowDrag: (screenX, screenY) => ipcRenderer.send(IPC.WINDOW_DRAG_START, screenX, screenY),
  moveWindowDrag: (screenX, screenY) => ipcRenderer.send(IPC.WINDOW_DRAG_MOVE, screenX, screenY),
  endWindowDrag: () => ipcRenderer.send(IPC.WINDOW_DRAG_END),
  toggleDevTools: () => ipcRenderer.invoke(IPC.TOGGLE_DEVTOOLS),
  getBookmarks: () => ipcRenderer.invoke(IPC.GET_BOOKMARKS),
  addBookmark: (url, title) => ipcRenderer.invoke(IPC.ADD_BOOKMARK, url, title) as Promise<BookmarkResult>,
  bookmarkPage: () => ipcRenderer.invoke(IPC.BOOKMARK_PAGE) as Promise<BookmarkResult>,
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
  onToast: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, toast: ToastPayload) => callback(toast)
    ipcRenderer.on(IPC.TOAST, handler)
    return () => ipcRenderer.removeListener(IPC.TOAST, handler)
  },
  respondToPopup: (id, allow) => ipcRenderer.invoke(IPC.POPUP_RESPONSE, id, allow)
}

contextBridge.exposeInMainWorld('browsy', api)

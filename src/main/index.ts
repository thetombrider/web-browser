import { app, BrowserWindow } from 'electron'
import { BROWSY_CDP_PORT } from '../shared/types'
import { WindowManager } from './windows/window-manager'

const cdpPort = process.env.BROWSY_CDP_PORT ?? String(BROWSY_CDP_PORT)
app.commandLine.appendSwitch('remote-debugging-port', cdpPort)

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const windowManager = new WindowManager()

app.whenReady().then(async () => {
  console.log(`[Browsy] CDP available on port ${cdpPort}`)
  await windowManager.initialize()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await windowManager.createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

import { app, BrowserWindow, protocol } from 'electron'
import { randomBytes } from 'crypto'
import { BROWSY_CDP_PORT } from '../shared/types'
import { WindowManager } from './windows/window-manager'

// Must run before app is ready so browsy:// gets standard/secure privileges.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'browsy',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

// Restored pages may try to resume media while they load in the background.
// Require a user gesture so session restore never starts audio on its own.
app.commandLine.appendSwitch('autoplay-policy', 'user-gesture-required')

function shouldEnableCdp(): boolean {
  return process.env.BROWSY_ENABLE_CDP === '1' || Boolean(process.env.BROWSY_CDP_PORT)
}

function resolveCdpPort(): string {
  return process.env.BROWSY_CDP_PORT ?? String(BROWSY_CDP_PORT)
}

function shouldEnableApi(): boolean {
  return process.env.BROWSY_ENABLE_API === '1' || Boolean(process.env.BROWSY_API_TOKEN)
}

function resolveApiToken(): string {
  const fromEnv = process.env.BROWSY_API_TOKEN?.trim()
  if (fromEnv) return fromEnv
  return randomBytes(32).toString('hex')
}

if (shouldEnableCdp()) {
  const cdpPort = resolveCdpPort()
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
  console.log(`[Browsy] CDP enabled on port ${cdpPort}`)
} else {
  console.log('[Browsy] CDP disabled (set BROWSY_ENABLE_CDP=1 or BROWSY_CDP_PORT to enable)')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const apiToken = shouldEnableApi() ? resolveApiToken() : null

if (apiToken && !process.env.BROWSY_API_TOKEN) {
  process.env.BROWSY_API_TOKEN = apiToken
  console.log(`[Browsy] Generated API token (export BROWSY_API_TOKEN to reuse): ${apiToken}`)
} else if (!apiToken) {
  console.log('[Browsy] Local API disabled (set BROWSY_ENABLE_API=1 or BROWSY_API_TOKEN to enable)')
}

const windowManager = new WindowManager({ apiToken })

app.whenReady().then(async () => {
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

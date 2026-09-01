/**
 * Smoke: permission handlers must allow clipboard-sanitized-write so
 * navigator.clipboard.writeText succeeds after a user gesture.
 *
 * Run: npx electron scripts/smoke-clipboard-electron.cjs
 */
const { app, BrowserWindow, session, clipboard } = require('electron')
const http = require('http')

const ALLOWED_WEB_PERMISSIONS = new Set(['clipboard-sanitized-write'])

function isAllowedWebPermission(permission) {
  return ALLOWED_WEB_PERMISSIONS.has(permission)
}

const PAGE = `<!doctype html><title>clip</title><body>
<button id="c">copy</button>
<script>
document.getElementById('c').addEventListener('click', async () => {
  window.__clipResult = 'pending'
  try {
    await navigator.clipboard.writeText('browsy-clipboard-smoke')
    window.__clipResult = 'write-ok'
  } catch (err) {
    window.__clipResult = 'write-fail:' + (err && err.message ? err.message : String(err))
  }
})
</script>
</body>`

async function main() {
  await app.whenReady()

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(PAGE)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  const ses = session.fromPartition('smoke-clipboard')
  const requested = []
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    requested.push(permission)
    callback(isAllowedWebPermission(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => isAllowedWebPermission(permission))

  const win = new BrowserWindow({
    show: true,
    width: 400,
    height: 300,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  await win.loadURL(`http://127.0.0.1:${port}/`)
  await new Promise((r) => setTimeout(r, 300))

  clipboard.clear()
  win.focus()
  win.webContents.focus()

  const bounds = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('c');
      const r = el.getBoundingClientRect();
      return { x: Math.floor(r.left + r.width / 2), y: Math.floor(r.top + r.height / 2) };
    })()
  `)
  win.webContents.sendInputEvent({ type: 'mouseDown', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 })

  let result = null
  for (let i = 0; i < 40; i++) {
    result = await win.webContents.executeJavaScript('window.__clipResult || null')
    if (result && result !== 'pending') break
    await new Promise((r) => setTimeout(r, 50))
  }

  const fromMain = clipboard.readText()
  win.destroy()
  server.close()

  if (result !== 'write-ok') {
    throw new Error(`clipboard write failed: ${result} (requested=${JSON.stringify(requested)})`)
  }
  if (fromMain !== 'browsy-clipboard-smoke') {
    throw new Error(`main clipboard mismatch: ${JSON.stringify(fromMain)}`)
  }
  if (!requested.includes('clipboard-sanitized-write')) {
    throw new Error(`expected clipboard-sanitized-write request, got ${JSON.stringify(requested)}`)
  }

  console.log('smoke-clipboard-electron: ok')
  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})

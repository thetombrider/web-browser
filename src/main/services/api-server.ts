import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { BROWSY_API_PORT } from '../../shared/types'
import type { WindowManager } from '../windows/window-manager'

type RouteHandler = (body: unknown) => Promise<unknown>

export class ApiServer {
  private server: Server | null = null
  private routes = new Map<string, RouteHandler>()

  constructor(private windowManager: WindowManager) {}

  registerRoutes(): void {
    const wm = this.windowManager

    this.routes.set('GET /state', async () => wm.getFocusedState())
    this.routes.set('POST /navigate', async (body) => {
      const { input } = body as { input: string }
      await wm.navigateFocused(input)
      return { ok: true }
    })
    this.routes.set('POST /back', async () => {
      wm.goBackFocused()
      return { ok: true }
    })
    this.routes.set('POST /forward', async () => {
      wm.goForwardFocused()
      return { ok: true }
    })
    this.routes.set('POST /reload', async () => {
      wm.reloadFocused()
      return { ok: true }
    })
    this.routes.set('POST /stop', async () => {
      wm.stopFocused()
      return { ok: true }
    })
    this.routes.set('POST /tabs', async (body) => {
      const { url } = (body ?? {}) as { url?: string }
      await wm.newTabFocused(url)
      return { ok: true }
    })
    this.routes.set('DELETE /tabs', async (body) => {
      const { tabId } = (body ?? {}) as { tabId?: string }
      wm.closeTabFocused(tabId)
      return { ok: true }
    })
    this.routes.set('POST /tabs/switch', async (body) => {
      const { tabId } = body as { tabId: string }
      wm.switchTabFocused(tabId)
      return { ok: true }
    })
    this.routes.set('POST /windows', async () => {
      await wm.createWindow()
      return { ok: true }
    })
    this.routes.set('POST /devtools', async () => {
      wm.toggleDevToolsFocused()
      return { ok: true }
    })
    this.routes.set('GET /tabs', async () => wm.getFocusedState())
  }

  start(): void {
    this.registerRoutes()

    this.server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const body = await this.readBody(req)
      const key = `${req.method} ${req.url?.split('?')[0]}`
      const handler = this.routes.get(key)

      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
        return
      }

      try {
        const result = await handler(body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result ?? { ok: true }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: String(err) }))
      }
    })

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Browsy] API port ${BROWSY_API_PORT} already in use, reusing existing server`)
        return
      }
      console.error('[Browsy] API server error:', err)
    })

    this.server.listen(BROWSY_API_PORT, '127.0.0.1', () => {
      console.log(`[Browsy] API listening on http://127.0.0.1:${BROWSY_API_PORT}`)
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      if (req.method === 'GET' || req.method === 'DELETE') {
        resolve({})
        return
      }
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
      })
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {})
        } catch {
          resolve({})
        }
      })
    })
  }
}

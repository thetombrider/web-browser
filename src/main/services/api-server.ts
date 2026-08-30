import { createServer, type Server, type IncomingMessage } from 'http'
import { timingSafeEqual } from 'crypto'
import { BROWSY_API_MAX_BODY_BYTES, BROWSY_API_PORT } from '../../shared/types'
import type { WindowManager } from '../windows/window-manager'

type RouteHandler = (body: unknown) => Promise<unknown>

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (match?.[1]) return match[1].trim()
  }
  const header = req.headers['x-browsy-token']
  if (typeof header === 'string' && header.trim()) return header.trim()
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim()
  return null
}

export class ApiServer {
  private server: Server | null = null
  private routes = new Map<string, RouteHandler>()

  constructor(
    private windowManager: WindowManager,
    private token: string
  ) {}

  registerRoutes(): void {
    const wm = this.windowManager

    this.routes.set('GET /state', async () => wm.getFocusedState())
    this.routes.set('POST /navigate', async (body) => {
      const { input } = body as { input: string }
      if (typeof input !== 'string') throw new Error('input must be a string')
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
      if (url !== undefined && typeof url !== 'string') throw new Error('url must be a string')
      await wm.newTabFocused(url)
      return { ok: true }
    })
    this.routes.set('DELETE /tabs', async (body) => {
      const { tabId } = (body ?? {}) as { tabId?: string }
      if (tabId !== undefined && typeof tabId !== 'string') throw new Error('tabId must be a string')
      wm.closeTabFocused(tabId)
      return { ok: true }
    })
    this.routes.set('POST /tabs/switch', async (body) => {
      const { tabId } = body as { tabId: string }
      if (typeof tabId !== 'string') throw new Error('tabId must be a string')
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
      try {
        // Loopback-only API: no CORS. Cross-origin browser callers are not supported.
        if (req.method === 'OPTIONS') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const declared = Number(req.headers['content-length'] ?? 0)
        if (Number.isFinite(declared) && declared > BROWSY_API_MAX_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
          req.resume()
          return
        }

        const provided = extractToken(req)
        if (!provided || !tokensEqual(provided, this.token)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          req.resume()
          return
        }

        let body: unknown
        try {
          body = await this.readBody(req)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const status = message.includes('too large') ? 413 : 400
          res.writeHead(status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: message }))
          return
        }

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
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
        }
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    })

    this.server.listen(BROWSY_API_PORT, '127.0.0.1', () => {
      console.log(`[Browsy] API listening on http://127.0.0.1:${BROWSY_API_PORT} (token auth required)`)
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const method = req.method ?? 'GET'
      if (method === 'GET' || method === 'HEAD') {
        resolve({})
        return
      }

      const declared = Number(req.headers['content-length'] ?? 0)
      if (Number.isFinite(declared) && declared > BROWSY_API_MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        // Leave the socket readable so the HTTP layer can still send 400.
        req.resume()
        return
      }

      const chunks: Buffer[] = []
      let size = 0
      let settled = false

      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        reject(err)
        req.resume()
      }

      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > BROWSY_API_MAX_BODY_BYTES) {
          fail(new Error('Request body too large'))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (settled) return
        settled = true
        const data = Buffer.concat(chunks).toString('utf8')
        if (!data) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))))
    })
  }
}

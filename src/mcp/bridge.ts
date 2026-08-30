import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { BROWSY_API_PORT } from '../shared/types'

const API_BASE = `http://127.0.0.1:${BROWSY_API_PORT}`

function requireApiToken(): string {
  const token = process.env.BROWSY_API_TOKEN?.trim()
  if (!token) {
    throw new Error(
      'BROWSY_API_TOKEN is required. Enable the API with BROWSY_ENABLE_API=1 or BROWSY_API_TOKEN, then pass the same token to the MCP bridge.'
    )
  }
  return token
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = requireApiToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} failed: ${text}`)
  }
  return res.json()
}

const server = new Server(
  { name: 'browsy', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browse_url',
      description: 'Navigate the active tab to a URL or search query',
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string', description: 'URL or search query' } },
        required: ['input']
      }
    },
    {
      name: 'list_tabs',
      description: 'List all tabs in the focused window',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'new_tab',
      description: 'Open a new tab',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Optional URL' } }
      }
    },
    {
      name: 'close_tab',
      description: 'Close a tab by id, or the active tab if omitted',
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string' } }
      }
    },
    {
      name: 'switch_tab',
      description: 'Switch to a tab by id',
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string' } },
        required: ['tabId']
      }
    },
    {
      name: 'go_back',
      description: 'Navigate back in the active tab',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'go_forward',
      description: 'Navigate forward in the active tab',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'reload',
      description: 'Reload the active tab',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'toggle_devtools',
      description: 'Toggle DevTools for the active tab (docked right)',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'new_window',
      description: 'Open a new browser window',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result: unknown

    switch (name) {
      case 'browse_url':
        result = await api('POST', '/navigate', { input: (args as { input: string }).input })
        break
      case 'list_tabs':
        result = await api('GET', '/tabs')
        break
      case 'new_tab':
        result = await api('POST', '/tabs', { url: (args as { url?: string })?.url })
        break
      case 'close_tab':
        result = await api('DELETE', '/tabs', { tabId: (args as { tabId?: string })?.tabId })
        break
      case 'switch_tab':
        result = await api('POST', '/tabs/switch', { tabId: (args as { tabId: string }).tabId })
        break
      case 'go_back':
        result = await api('POST', '/back')
        break
      case 'go_forward':
        result = await api('POST', '/forward')
        break
      case 'reload':
        result = await api('POST', '/reload')
        break
      case 'toggle_devtools':
        result = await api('POST', '/devtools')
        break
      case 'new_window':
        result = await api('POST', '/windows')
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true
    }
  }
})

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[Browsy MCP] Connected via stdio')
}

main().catch((err) => {
  console.error('[Browsy MCP] Fatal:', err)
  process.exit(1)
})

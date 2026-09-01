import type { AiAssistant } from './types'
import { sanitizeNavigationUrl } from './utils'

export const AI_ASSISTANT_LABELS: Record<AiAssistant, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini'
}

export const AI_ASSISTANT_HOME_URLS: Record<AiAssistant, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/'
}

/** Keep encoded `?q=` URLs within typical browser limits. */
const MAX_SELECTION_CHARS = 4000

export function buildExplainPrompt(selection: string, sourceUrl: string): string {
  const trimmed = selection.trim()
  const body =
    trimmed.length > MAX_SELECTION_CHARS ? `${trimmed.slice(0, MAX_SELECTION_CHARS)}\n…` : trimmed
  const source = sourceUrl.trim() || 'unknown page'
  return `explain this\n\n${body}\n\nSource: ${source}`
}

export function buildAiChatUrl(assistant: AiAssistant, prompt: string): string {
  const encoded = encodeURIComponent(prompt)
  switch (assistant) {
    case 'chatgpt':
      return `https://chatgpt.com/?q=${encoded}`
    case 'claude':
      return `https://claude.ai/new?q=${encoded}`
    case 'gemini':
      return `https://gemini.google.com/app?q=${encoded}`
  }
}

export function resolveContextTargetUrl(linkURL: string | undefined, pageUrl: string): string | null {
  return sanitizeNavigationUrl(linkURL) ?? sanitizeNavigationUrl(pageUrl)
}

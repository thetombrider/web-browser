import type { AiAssistant } from './types'
import { sanitizeNavigationUrl } from './utils'

export const AI_ASSISTANT_LABELS: Record<AiAssistant, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini'
}

export const AI_ASSISTANT_GLYPHS: Record<AiAssistant, string> = {
  chatgpt: '✦',
  claude: 'C',
  gemini: 'G'
}

export const AI_ASSISTANT_HOME_URLS: Record<AiAssistant, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/'
}

/** Parse launcher input such as `@ai explain this` or `@claude explain this`. */
export function parseAiCommand(
  input: string,
  defaultAssistant: AiAssistant = 'chatgpt'
): { assistant: AiAssistant; prompt: string } | null {
  const match = input.trim().match(/^@(ai|chatgpt|claude|gemini)\s+([\s\S]+)$/i)
  if (!match) return null

  const prompt = match[2].trim()
  if (!prompt) return null

  const provider = match[1].toLowerCase()
  return {
    assistant: provider === 'ai' ? defaultAssistant : (provider as AiAssistant),
    prompt
  }
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

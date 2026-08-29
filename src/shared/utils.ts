import { URL } from 'url'
import { GOOGLE_SEARCH_URL } from './types'

export function resolveNavigationInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'browsy://home'

  if (/^browsy:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }

  if (/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(trimmed) || trimmed.includes('.')) {
    try {
      const withProtocol = `https://${trimmed}`
      // eslint-disable-next-line no-new
      new URL(withProtocol)
      return withProtocol
    } catch {
      return `${GOOGLE_SEARCH_URL}${encodeURIComponent(trimmed)}`
    }
  }

  return `${GOOGLE_SEARCH_URL}${encodeURIComponent(trimmed)}`
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

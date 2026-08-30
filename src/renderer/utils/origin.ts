export type UrlScheme = 'https' | 'http' | 'browsy' | 'other'

export function getUrlScheme(url: string): UrlScheme {
  const trimmed = url.trim().toLowerCase()
  if (!trimmed) return 'other'
  if (trimmed.startsWith('https://')) return 'https'
  if (trimmed.startsWith('http://')) return 'http'
  if (trimmed.startsWith('browsy://')) return 'browsy'
  return 'other'
}

export function schemeLabel(scheme: UrlScheme): string {
  switch (scheme) {
    case 'https':
      return 'Connection is secure'
    case 'http':
      return 'Not secure'
    case 'browsy':
      return 'Browsy page'
    default:
      return ''
  }
}

import { app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

interface FontAsset {
  pkg: string
  file: string
  type: string
}

/** Latin subset only — enough for chrome + internal pages without Google Fonts. */
const FONT_ASSETS: Record<string, FontAsset> = {
  'ibm-plex-sans-400.woff2': {
    pkg: '@fontsource/ibm-plex-sans',
    file: 'files/ibm-plex-sans-latin-400-normal.woff2',
    type: 'font/woff2'
  },
  'ibm-plex-sans-500.woff2': {
    pkg: '@fontsource/ibm-plex-sans',
    file: 'files/ibm-plex-sans-latin-500-normal.woff2',
    type: 'font/woff2'
  },
  'ibm-plex-sans-600.woff2': {
    pkg: '@fontsource/ibm-plex-sans',
    file: 'files/ibm-plex-sans-latin-600-normal.woff2',
    type: 'font/woff2'
  },
  'ibm-plex-mono-400.woff2': {
    pkg: '@fontsource/ibm-plex-mono',
    file: 'files/ibm-plex-mono-latin-400-normal.woff2',
    type: 'font/woff2'
  },
  'ibm-plex-mono-500.woff2': {
    pkg: '@fontsource/ibm-plex-mono',
    file: 'files/ibm-plex-mono-latin-500-normal.woff2',
    type: 'font/woff2'
  }
}

/** @font-face rules for browsy:// HTML pages (no network). */
export function localFontFaceCss(): string {
  return `
@font-face {
  font-family: "IBM Plex Sans";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("browsy://font/ibm-plex-sans-400.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans";
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url("browsy://font/ibm-plex-sans-500.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans";
  font-style: normal;
  font-display: swap;
  font-weight: 600;
  src: url("browsy://font/ibm-plex-sans-600.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("browsy://font/ibm-plex-mono-400.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url("browsy://font/ibm-plex-mono-500.woff2") format("woff2");
}
`.trim()
}

export async function serveLocalFont(name: string): Promise<Response | null> {
  const key = name.replace(/^\//, '')
  const asset = FONT_ASSETS[key]
  if (!asset) return null

  const candidates = [
    join(app.getAppPath(), 'node_modules', asset.pkg, asset.file),
    join(__dirname, '../../node_modules', asset.pkg, asset.file),
    join(process.cwd(), 'node_modules', asset.pkg, asset.file)
  ]

  for (const path of candidates) {
    try {
      const data = await readFile(path)
      return new Response(data, {
        headers: {
          'Content-Type': asset.type,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      })
    } catch {
      // Try next candidate.
    }
  }
  return null
}

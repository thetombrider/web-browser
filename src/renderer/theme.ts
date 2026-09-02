import { extendTheme, type ThemeConfig } from '@chakra-ui/react'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT
} from '@shared/types'

const config: ThemeConfig = {
  initialColorMode: 'system',
  // Theme selection is persisted in Browsy settings and synced by ThemeSync.
  useSystemColorMode: false
}

export const theme = extendTheme({
  config,
  fonts: {
    heading:
      '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    body: '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace'
  },
  semanticTokens: {
    colors: {
      browsy: {
        surface: { default: APP_SURFACE_LIGHT, _dark: APP_SURFACE_DARK },
        elevated: { default: APP_SURFACE_ELEVATED_LIGHT, _dark: APP_SURFACE_ELEVATED_DARK },
        accent: { default: '#2563eb', _dark: '#3b82f6' },
        ink: { default: '#18181b', _dark: '#f4f4f5' },
        muted: { default: 'gray.500', _dark: 'gray.400' },
        glyphText: { default: 'gray.600', _dark: 'gray.400' },
        icon: { default: 'gray.400', _dark: 'gray.400' },
        border: { default: 'blackAlpha.200', _dark: 'whiteAlpha.200' },
        input: { default: 'blackAlpha.50', _dark: 'whiteAlpha.100' },
        inputBorder: { default: 'blackAlpha.200', _dark: 'whiteAlpha.200' },
        focusBorder: { default: 'blue.500', _dark: 'blue.300' },
        hover: { default: 'blackAlpha.50', _dark: 'whiteAlpha.100' },
        active: { default: 'blackAlpha.100', _dark: 'whiteAlpha.200' },
        glyph: { default: 'blackAlpha.100', _dark: 'whiteAlpha.200' },
        card: { default: 'white', _dark: 'gray.900' },
        backdrop: { default: 'blackAlpha.300', _dark: 'blackAlpha.700' },
        preview: { default: 'gray.100', _dark: 'gray.800' },
        previewGradientStart: { default: 'gray.100', _dark: 'gray.700' },
        previewGradientEnd: { default: 'gray.300', _dark: 'gray.900' },
        secure: { default: '#16a34a', _dark: '#4ade80' },
        insecure: { default: '#ea580c', _dark: '#fb923c' },
        internal: { default: '#52525b', _dark: '#a1a1aa' },
        peek: { default: 'blackAlpha.100', _dark: 'blackAlpha.100' },
        peekHover: { default: 'blackAlpha.400', _dark: 'blackAlpha.400' },
        overlay: { default: 'rgba(0, 0, 0, 0.5)', _dark: 'rgba(0, 0, 0, 0.72)' },
        overlayText: { default: 'white', _dark: 'white' },
        overlayMuted: { default: 'whiteAlpha.800', _dark: 'whiteAlpha.800' },
        overlayHint: { default: 'whiteAlpha.900', _dark: 'whiteAlpha.900' },
        tooltip: { default: 'gray.900', _dark: 'whiteAlpha.900' },
        tooltipText: { default: 'white', _dark: 'gray.900' }
      }
    }
  },
  shadows: {
    browsyCardFocused: '0 18px 55px rgba(0,0,0,0.42)',
    browsyCard: '0 10px 30px rgba(0,0,0,0.26)',
    browsySpotlight: '0 24px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.18)'
  },
  styles: {
    global: {
      'html, body, #root': {
        background: 'transparent',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'body'
      }
    }
  },
  components: {
    Button: {
      defaultProps: { colorScheme: 'gray' }
    }
  }
})

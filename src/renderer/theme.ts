import { extendTheme, type ThemeConfig } from '@chakra-ui/react'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT
} from '@shared/types'

const config: ThemeConfig = {
  initialColorMode: 'system',
  useSystemColorMode: true
}

export const theme = extendTheme({
  config,
  fonts: {
    heading:
      '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    body: '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace'
  },
  colors: {
    browsy: {
      surface: { light: APP_SURFACE_LIGHT, dark: APP_SURFACE_DARK },
      elevated: { light: APP_SURFACE_ELEVATED_LIGHT, dark: APP_SURFACE_ELEVATED_DARK },
      accent: { light: '#2563eb', dark: '#3b82f6' },
      ink: { light: '#18181b', dark: '#f4f4f5' },
      muted: { light: '#71717a', dark: '#a1a1aa' }
    }
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

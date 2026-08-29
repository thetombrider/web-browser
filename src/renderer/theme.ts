import { extendTheme, type ThemeConfig } from '@chakra-ui/react'

const config: ThemeConfig = {
  initialColorMode: 'system',
  useSystemColorMode: true
}

export const theme = extendTheme({
  config,
  styles: {
    global: {
      'html, body, #root': {
        background: 'transparent',
        height: '100%',
        overflow: 'hidden'
      }
    }
  }
})

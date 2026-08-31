import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { ChakraProvider, ColorModeScript, useColorMode } from '@chakra-ui/react'
import App from './App'
import { theme } from './theme'
import type { Settings } from '@shared/types'

function ThemeSync() {
  const { setColorMode } = useColorMode()

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let selectedTheme: Settings['theme'] = 'system'

    const applyTheme = (settings: Settings) => {
      selectedTheme = settings.theme
      setColorMode(settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme)
    }

    const onSystemThemeChanged = () => {
      if (selectedTheme === 'system') {
        setColorMode(media.matches ? 'dark' : 'light')
      }
    }

    const unsubscribe = window.browsy.onSettingsChanged(applyTheme)
    void window.browsy.getSettings().then(applyTheme)
    media.addEventListener('change', onSystemThemeChanged)

    return () => {
      unsubscribe()
      media.removeEventListener('change', onSystemThemeChanged)
    }
  }, [setColorMode])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <ChakraProvider theme={theme}>
      <ThemeSync />
      <App />
    </ChakraProvider>
  </React.StrictMode>
)

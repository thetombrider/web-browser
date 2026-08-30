import { useEffect, useState } from 'react'
import {
  Box,
  CloseButton,
  FormControl,
  FormLabel,
  HStack,
  Select,
  Text,
  VStack,
  useColorModeValue,
  Collapse,
  Button
} from '@chakra-ui/react'
import type { Settings } from '@shared/types'
import { BROWSY_API_PORT, BROWSY_CDP_PORT } from '@shared/types'
import { ChromePanel } from './ChromePanel'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showDev, setShowDev] = useState(false)
  const muted = useColorModeValue('gray.500', 'gray.400')
  const inputBackground = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')

  useEffect(() => {
    window.browsy.getSettings().then(setSettings)
  }, [])

  const update = async (partial: Partial<Settings>) => {
    const next = await window.browsy.setSettings(partial)
    setSettings(next)
  }

  return (
    <ChromePanel>
      <Box px={3} pb={3}>
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" fontWeight="600">
            Settings
          </Text>
          <CloseButton size="sm" onClick={onClose} />
        </HStack>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FormLabel fontSize="xs" color={muted} mb={1}>
              New tab
            </FormLabel>
            <Select
              size="sm"
              value={settings?.homepage ?? 'recent'}
              onChange={(e) => void update({ homepage: e.target.value as Settings['homepage'] })}
              bg={inputBackground}
              border="none"
            >
              <option value="recent">Recent sites</option>
              <option value="blank">Blank</option>
            </Select>
          </FormControl>

          <Box>
            <Button size="xs" variant="ghost" onClick={() => setShowDev((v) => !v)} px={0}>
              {showDev ? 'Hide developer' : 'Developer'}
            </Button>
            <Collapse in={showDev} animateOpacity>
              <Box fontSize="xs" color={muted} mt={2} lineHeight="1.6">
                <Text>Agent API · http://127.0.0.1:{BROWSY_API_PORT}</Text>
                <Text>CDP · localhost:{BROWSY_CDP_PORT}</Text>
                <Text>MCP · npm run mcp</Text>
              </Box>
            </Collapse>
          </Box>
        </VStack>
      </Box>
    </ChromePanel>
  )
}

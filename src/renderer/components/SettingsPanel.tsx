import { useEffect, useState } from 'react'
import {
  Box,
  CloseButton,
  FormControl,
  FormLabel,
  HStack,
  Select,
  Text,
  VStack
} from '@chakra-ui/react'
import type { Settings } from '@shared/types'
import { BROWSY_API_PORT, BROWSY_CDP_PORT } from '@shared/types'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.browsy.getSettings().then(setSettings)
  }, [])

  const update = async (partial: Partial<Settings>) => {
    const next = await window.browsy.setSettings(partial)
    setSettings(next)
  }

  return (
    <Box
      bg="blackAlpha.800"
      backdropFilter="blur(12px)"
      borderBottom="1px solid"
      borderColor="whiteAlpha.200"
      px={4}
      py={3}
      pt="36px"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <HStack justify="space-between" mb={4}>
        <Text fontWeight="medium">Settings</Text>
        <CloseButton size="sm" onClick={onClose} />
      </HStack>
      <VStack align="stretch" spacing={4}>
        <FormControl>
          <FormLabel fontSize="sm">Homepage</FormLabel>
          <Select
            size="sm"
            value={settings?.homepage ?? 'recent'}
            onChange={(e) => void update({ homepage: e.target.value as Settings['homepage'] })}
          >
            <option value="recent">Recent sites</option>
            <option value="blank">Blank (browsy://home)</option>
          </Select>
        </FormControl>
        <Box fontSize="xs" opacity={0.7}>
          <Text>Agent API: http://127.0.0.1:{BROWSY_API_PORT}</Text>
          <Text>CDP: localhost:{BROWSY_CDP_PORT}</Text>
          <Text mt={2}>Run MCP bridge: npm run mcp</Text>
        </Box>
      </VStack>
    </Box>
  )
}

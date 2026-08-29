import { useEffect, useState } from 'react'
import {
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
import { FloatingOverlay, FloatingPanel } from './FloatingPanel'

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
    <FloatingOverlay onDismiss={onClose} position="top">
      <FloatingPanel borderRadius="xl" px={3} py={2.5} maxW="360px">
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" fontWeight="medium" color="gray.700">
            Settings
          </Text>
          <CloseButton size="sm" color="gray.500" onClick={onClose} />
        </HStack>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FormLabel fontSize="xs" color="gray.600" mb={1}>
              Homepage
            </FormLabel>
            <Select
              size="sm"
              bg="white"
              color="gray.800"
              value={settings?.homepage ?? 'recent'}
              onChange={(e) => void update({ homepage: e.target.value as Settings['homepage'] })}
            >
              <option value="recent">Recent sites</option>
              <option value="blank">Blank (browsy://home)</option>
            </Select>
          </FormControl>
          <VStack align="stretch" spacing={0.5} fontSize="2xs" color="gray.500">
            <Text>API: 127.0.0.1:{BROWSY_API_PORT}</Text>
            <Text>CDP: localhost:{BROWSY_CDP_PORT}</Text>
          </VStack>
        </VStack>
      </FloatingPanel>
    </FloatingOverlay>
  )
}

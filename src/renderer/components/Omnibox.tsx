import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  Icon,
  Kbd,
  Text,
  HStack
} from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'

interface OmniboxProps {
  initialValue: string
  focusToken: number
  onSubmit: (value: string) => void
  onClose: () => void
}

export function Omnibox({ initialValue, focusToken, onSubmit, onClose }: OmniboxProps) {
  const [value, setValue] = useState(initialValue === 'browsy://home' ? '' : initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusToken])

  useEffect(() => {
    setValue(initialValue === 'browsy://home' ? '' : initialValue)
  }, [initialValue])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <Box
      px={4}
      py={3}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <InputGroup size="lg">
        <InputLeftElement pointerEvents="none">
          <Icon as={SearchIcon} color="gray.400" />
        </InputLeftElement>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(value)
          }}
          placeholder="Search or enter URL"
          bg="whiteAlpha.100"
          border="1px solid"
          borderColor="whiteAlpha.200"
          _focus={{ borderColor: 'blue.400', boxShadow: 'outline' }}
        />
      </InputGroup>
      <HStack mt={2} spacing={3} opacity={0.7}>
        <Text fontSize="xs">Enter to go</Text>
        <Kbd fontSize="xs">Esc</Kbd>
        <Text fontSize="xs">to close</Text>
      </HStack>
    </Box>
  )
}

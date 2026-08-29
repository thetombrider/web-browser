import { useEffect, useRef, useState } from 'react'
import { Input, InputGroup, InputLeftElement, Icon } from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import { FloatingOverlay, FloatingPanel } from './FloatingPanel'

interface OmniboxProps {
  initialValue: string
  onSubmit: (value: string) => void
  onClose: () => void
}

export function Omnibox({ initialValue, onSubmit, onClose }: OmniboxProps) {
  const [value, setValue] = useState(initialValue === 'browsy://home' ? '' : initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <FloatingOverlay onDismiss={onClose} position="center">
      <FloatingPanel borderRadius="2xl" px={3} py={2}>
        <InputGroup size="md">
          <InputLeftElement pointerEvents="none" h="full">
            <Icon as={SearchIcon} color="gray.400" boxSize={3.5} />
          </InputLeftElement>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(value)
            }}
            placeholder="Search or enter URL"
            variant="unstyled"
            pl={9}
            h="36px"
            fontSize="sm"
            color="gray.800"
            _placeholder={{ color: 'gray.400' }}
          />
        </InputGroup>
      </FloatingPanel>
    </FloatingOverlay>
  )
}

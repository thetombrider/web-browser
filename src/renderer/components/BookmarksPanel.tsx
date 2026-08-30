import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  CloseButton,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  VStack,
  useColorModeValue
} from '@chakra-ui/react'
import { DeleteIcon, SearchIcon } from '@chakra-ui/icons'
import type { Bookmark } from '@shared/types'
import { ChromePanel } from './ChromePanel'
import { Favicon } from './Favicon'

interface BookmarksPanelProps {
  bookmarks: Bookmark[]
  onRemove: (id: string) => void
  onNavigate: (url: string) => void
  onAdd: () => void
  onClose: () => void
}

export function BookmarksPanel({
  bookmarks,
  onRemove,
  onNavigate,
  onAdd,
  onClose
}: BookmarksPanelProps) {
  const [query, setQuery] = useState('')
  const hoverBackground = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')
  const muted = useColorModeValue('gray.500', 'gray.400')
  const inputBackground = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return bookmarks
    return bookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    )
  }, [bookmarks, query])

  return (
    <ChromePanel maxHeight="50vh">
      <Box px={3} pb={3} overflowY="auto" maxH="calc(50vh - 32px)">
        <HStack justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="600">
            Bookmarks
          </Text>
          <HStack spacing={1}>
            <Button size="xs" variant="ghost" onClick={onAdd}>
              Save page
            </Button>
            <CloseButton size="sm" onClick={onClose} />
          </HStack>
        </HStack>

        <InputGroup size="sm" mb={2}>
          <InputLeftElement pointerEvents="none" h="32px">
            <SearchIcon color="gray.400" boxSize={3} />
          </InputLeftElement>
          <Input
            h="32px"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter bookmarks"
            bg={inputBackground}
            border="none"
            _focus={{ boxShadow: 'none', bg: inputBackground }}
            autoFocus
          />
        </InputGroup>

        {filtered.length === 0 ? (
          <Text fontSize="sm" color={muted} py={2}>
            {bookmarks.length === 0
              ? 'No bookmarks yet. Save the current page, or press Ctrl+B anytime.'
              : 'No matches.'}
          </Text>
        ) : (
          <VStack align="stretch" spacing={0}>
            {filtered.map((bookmark) => (
              <HStack
                key={bookmark.id}
                px={2}
                py={1.5}
                borderRadius="md"
                _hover={{ bg: hoverBackground }}
                cursor="pointer"
                spacing={2}
                sx={{
                  '& .bm-delete': { opacity: 0 },
                  '&:hover .bm-delete': { opacity: 1 }
                }}
              >
                <Favicon url={bookmark.url} size={20} />
                <Box flex={1} minW={0} onClick={() => onNavigate(bookmark.url)}>
                  <Text fontSize="sm" fontWeight="500" noOfLines={1}>
                    {bookmark.title}
                  </Text>
                  <Text fontSize="xs" color={muted} noOfLines={1}>
                    {bookmark.url}
                  </Text>
                </Box>
                <IconButton
                  className="bm-delete"
                  aria-label="Remove bookmark"
                  icon={<DeleteIcon boxSize={3} />}
                  size="xs"
                  variant="ghost"
                  onClick={() => onRemove(bookmark.id)}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </Box>
    </ChromePanel>
  )
}

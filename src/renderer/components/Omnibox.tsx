import { useEffect, useRef, useState } from 'react'
import {
  Box,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Text,
  Spinner,
  useColorModeValue,
  VStack
} from '@chakra-ui/react'
import {
  ArrowBackIcon,
  ArrowForwardIcon,
  CloseIcon,
  RepeatIcon,
  SearchIcon
} from '@chakra-ui/icons'
import type { Bookmark, HistoryEntry, TabState } from '@shared/types'
import { browsyPageLabel } from '@shared/internal-pages'
import {
  buildSuggestions,
  commandForExactQuery,
  kindLabel,
  type CommandAction,
  type Suggestion
} from '../utils/suggestions'
import { getUrlScheme } from '../utils/origin'
import { OriginCue } from './OriginCue'
import { Favicon } from './Favicon'

interface OmniboxProps {
  initialValue: string
  focusToken: number
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  tabs: TabState[]
  onSubmit: (value: string) => void
  onClose: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onSwitchTab: (id: string) => void
  onCommand: (action: CommandAction) => void
}

function displayValueForUrl(url: string): string {
  return browsyPageLabel(url) ? '' : url
}

export function Omnibox({
  initialValue,
  focusToken,
  canGoBack,
  canGoForward,
  isLoading,
  tabs,
  onSubmit,
  onClose,
  onBack,
  onForward,
  onReload,
  onStop,
  onSwitchTab,
  onCommand
}: OmniboxProps) {
  const [value, setValue] = useState(displayValueForUrl(initialValue))
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const inputBackground = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')
  const inputBorder = useColorModeValue('blackAlpha.200', 'whiteAlpha.200')
  const focusBorder = useColorModeValue('blue.500', 'blue.300')
  const suggestionHover = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')
  const suggestionActive = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const muted = useColorModeValue('gray.500', 'gray.400')
  const glyphBg = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')

  const suggestions = showSuggestions
    ? buildSuggestions(value, tabs, bookmarks, history)
    : []

  const liveDisplay = displayValueForUrl(initialValue)
  const scheme = getUrlScheme(initialValue)
  // Show origin cue only when the field still mirrors the live tab URL (not while typing).
  const showingLiveUrl = value === liveDisplay && liveDisplay.length > 0
  const showOriginCue = showingLiveUrl && !isLoading && (scheme === 'https' || scheme === 'http' || scheme === 'browsy')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    setShowSuggestions(true)
    setActiveIndex(-1)
  }, [focusToken])

  useEffect(() => {
    setValue(displayValueForUrl(initialValue))
  }, [initialValue])

  useEffect(() => {
    void Promise.all([window.browsy.getBookmarks(), window.browsy.getHistory()]).then(
      ([nextBookmarks, nextHistory]) => {
        setBookmarks(nextBookmarks)
        setHistory(nextHistory)
      }
    )
  }, [focusToken])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const choose = (suggestion: Suggestion) => {
    if (suggestion.kind === 'command' && suggestion.action) {
      onCommand(suggestion.action)
      return
    }
    if (suggestion.kind === 'tab' && suggestion.tabId) {
      onSwitchTab(suggestion.tabId)
      onClose()
      return
    }
    if (suggestion.url) onSubmit(suggestion.url)
  }

  const commit = (raw: string) => {
    const next = raw.trim()
    if (!next) {
      if (suggestions[0]) choose(suggestions[0])
      return
    }
    if (next.startsWith('/')) {
      if (suggestions[0]) choose(suggestions[0])
      return
    }
    const exactCommand =
      suggestions.find(
        (s) => s.kind === 'command' && s.title.toLowerCase() === next.toLowerCase()
      ) ?? commandForExactQuery(next)
    if (exactCommand) {
      choose(exactCommand)
      return
    }
    onSubmit(next)
  }

  return (
    <Box px={3} pt={1.5} pb={2} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <HStack spacing={1.5} align="center">
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          size="xs"
          variant="ghost"
          isDisabled={!canGoBack}
          onClick={onBack}
        />
        <IconButton
          aria-label="Forward"
          icon={<ArrowForwardIcon />}
          size="xs"
          variant="ghost"
          isDisabled={!canGoForward}
          onClick={onForward}
        />
        <IconButton
          aria-label={isLoading ? 'Stop' : 'Reload'}
          icon={isLoading ? <CloseIcon boxSize={2} /> : <RepeatIcon />}
          size="xs"
          variant="ghost"
          onClick={isLoading ? onStop : onReload}
        />
        {showOriginCue ? (
          <Box
            w="28px"
            h="28px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            borderRadius="md"
            bg={inputBackground}
            border="1px solid"
            borderColor={inputBorder}
          >
            <OriginCue scheme={scheme} />
          </Box>
        ) : null}
        <InputGroup size="sm" flex={1}>
          <InputLeftElement h="32px" pointerEvents="none">
            {isLoading ? (
              <Spinner size="xs" color="gray.400" thickness="1.5px" />
            ) : (
              <SearchIcon color="gray.400" boxSize={3.5} />
            )}
          </InputLeftElement>
          <Input
            ref={inputRef}
            value={value}
            h="32px"
            fontSize="sm"
            borderRadius="md"
            onChange={(e) => {
              setValue(e.target.value)
              setShowSuggestions(true)
              setActiveIndex(-1)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (!suggestions.length) return
                setActiveIndex((i) => (i + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (!suggestions.length) return
                setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                  choose(suggestions[activeIndex])
                } else {
                  commit(value)
                }
              } else if (e.key === 'Tab' && suggestions.length) {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % suggestions.length)
              }
            }}
            placeholder="Search, URL, or command"
            bg={inputBackground}
            border="1px solid"
            borderColor={inputBorder}
            _focus={{ borderColor: focusBorder, boxShadow: 'none' }}
          />
          {value && (
            <InputRightElement h="32px">
              <IconButton
                aria-label="Clear"
                icon={<CloseIcon boxSize={2} />}
                size="xs"
                variant="ghost"
                onClick={() => {
                  setValue('')
                  setActiveIndex(-1)
                  inputRef.current?.focus()
                }}
              />
            </InputRightElement>
          )}
        </InputGroup>
      </HStack>

      {suggestions.length > 0 && (
        <VStack align="stretch" spacing={0} mt={1.5} role="listbox">
          {suggestions.map((suggestion, index) => {
            const selected = index === activeIndex
            return (
              <HStack
                key={suggestion.id}
                role="option"
                aria-selected={selected}
                px={2}
                py={1.5}
                borderRadius="md"
                cursor="pointer"
                bg={selected ? suggestionActive : 'transparent'}
                _hover={{ bg: selected ? suggestionActive : suggestionHover }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(suggestion)
                }}
                spacing={2}
              >
                {suggestion.kind === 'command' || !suggestion.url ? (
                  <Box
                    w="20px"
                    h="20px"
                    borderRadius="sm"
                    bg={glyphBg}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="10px"
                    fontWeight="600"
                    color={muted}
                    flexShrink={0}
                  >
                    {suggestion.glyph}
                  </Box>
                ) : (
                  <Favicon url={suggestion.url} favicon={suggestion.favicon} size={20} />
                )}
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" noOfLines={1} fontWeight="500">
                    {suggestion.title}
                  </Text>
                  <Text fontSize="xs" color={muted} noOfLines={1}>
                    {suggestion.subtitle}
                  </Text>
                </Box>
                <Text fontSize="xs" color={muted} flexShrink={0}>
                  {kindLabel(suggestion.kind)}
                </Text>
              </HStack>
            )
          })}
        </VStack>
      )}
    </Box>
  )
}

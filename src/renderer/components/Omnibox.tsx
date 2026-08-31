import { useEffect, useRef, useState } from 'react'
import {
  Box,
  CloseButton,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Text,
  Spinner,
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
  findCompletion,
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
  activeTabId: string | null
  onSubmit: (value: string) => void
  onClose: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onSwitchTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
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
  activeTabId,
  onSubmit,
  onClose,
  onBack,
  onForward,
  onReload,
  onStop,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onCommand
}: OmniboxProps) {
  const [value, setValue] = useState(displayValueForUrl(initialValue))
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [completionSuppressedFor, setCompletionSuppressedFor] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Spotlight always shows inventory / matches while open.
  const suggestions = buildSuggestions(value, tabs, bookmarks, history, activeTabId)
  const queryEmpty = value.trim().length === 0
  const showingTabsInventory = queryEmpty && suggestions.some((s) => s.kind === 'tab')

  const completionMatch =
    activeIndex === -1 && completionSuppressedFor !== value ? findCompletion(suggestions, value) : null
  const completion = completionMatch?.value ?? null
  const displayedValue = completion ?? value

  const liveDisplay = displayValueForUrl(initialValue)
  const scheme = getUrlScheme(initialValue)
  const showingLiveUrl = value === liveDisplay && liveDisplay.length > 0
  const showOriginCue =
    showingLiveUrl && !isLoading && (scheme === 'https' || scheme === 'http' || scheme === 'browsy')

  useEffect(() => {
    setValue(displayValueForUrl(initialValue))
    inputRef.current?.focus()
    inputRef.current?.select()
    setActiveIndex(-1)
    setCompletionSuppressedFor(null)
  }, [focusToken])

  useEffect(() => {
    setValue(displayValueForUrl(initialValue))
    setActiveIndex(-1)
    setCompletionSuppressedFor(null)
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
    const el = inputRef.current
    if (!el || !completion) return
    el.setSelectionRange(value.length, completion.length)
  }, [displayedValue, completion, value.length])

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
      // Empty Enter: act on highlighted row only — don't auto-jump to first tab.
      if (activeIndex >= 0 && suggestions[activeIndex]) choose(suggestions[activeIndex])
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
    <Box>
      <HStack spacing={1} px={3} pt={3} pb={2} align="center">
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          size="sm"
          variant="ghost"
          isDisabled={!canGoBack}
          onClick={onBack}
        />
        <IconButton
          aria-label="Forward"
          icon={<ArrowForwardIcon />}
          size="sm"
          variant="ghost"
          isDisabled={!canGoForward}
          onClick={onForward}
        />
        <IconButton
          aria-label={isLoading ? 'Stop' : 'Reload'}
          icon={isLoading ? <CloseIcon boxSize={2.5} /> : <RepeatIcon />}
          size="sm"
          variant="ghost"
          onClick={isLoading ? onStop : onReload}
        />
        {showOriginCue ? (
          <Box
            w="32px"
            h="36px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            borderRadius="md"
            bg="browsy.input"
            border="1px solid"
            borderColor="browsy.inputBorder"
          >
            <OriginCue scheme={scheme} />
          </Box>
        ) : null}
        <InputGroup size="md" flex={1}>
          <InputLeftElement h="40px" pointerEvents="none">
            {isLoading ? (
              <Spinner size="sm" color="browsy.icon" thickness="1.5px" />
            ) : (
              <SearchIcon color="browsy.icon" boxSize={4} />
            )}
          </InputLeftElement>
          <Input
            ref={inputRef}
            value={displayedValue}
            h="40px"
            fontSize="md"
            borderRadius="lg"
            onChange={(e) => {
              setValue(e.target.value)
              setActiveIndex(-1)
              setCompletionSuppressedFor(null)
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && completionMatch) {
                e.preventDefault()
                setCompletionSuppressedFor(value)
                inputRef.current?.setSelectionRange(value.length, value.length)
              } else if (e.key === 'ArrowDown') {
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
                } else if (completionMatch) {
                  choose(completionMatch.suggestion)
                } else {
                  commit(value)
                }
              } else if (e.key === 'Tab' && suggestions.length) {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % suggestions.length)
              }
            }}
            placeholder="Search, URL, tab, or /command"
            bg="browsy.input"
            border="1px solid"
            borderColor="browsy.inputBorder"
            _focus={{ borderColor: 'browsy.focusBorder', boxShadow: 'none' }}
          />
          {value && (
            <InputRightElement h="40px">
              <IconButton
                aria-label="Clear"
                icon={<CloseIcon boxSize={2.5} />}
                size="sm"
                variant="ghost"
                onClick={() => {
                  setValue('')
                  setActiveIndex(-1)
                  setCompletionSuppressedFor(null)
                  inputRef.current?.focus()
                }}
              />
            </InputRightElement>
          )}
        </InputGroup>
        <IconButton
          aria-label="New tab"
          icon={<Text fontSize="lg" lineHeight={1}>+</Text>}
          size="sm"
          variant="ghost"
          onClick={() => {
            onNewTab()
          }}
        />
      </HStack>

      {suggestions.length > 0 && (
        <Box
          borderTop="1px solid"
          borderColor="browsy.border"
          maxH="min(52vh, 420px)"
          overflowY="auto"
          css={{
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--chakra-colors-browsy-border)',
              borderRadius: '3px'
            }
          }}
        >
          {showingTabsInventory && (
            <Text px={4} pt={3} pb={1} fontSize="xs" fontWeight="600" color="browsy.muted" letterSpacing="wide">
              OPEN TABS
            </Text>
          )}
          <VStack align="stretch" spacing={0} px={2} py={1.5} role="listbox" aria-label="Suggestions">
            {suggestions.map((suggestion, index) => {
              const selected = index === activeIndex
              const isTabRow = suggestion.kind === 'tab'
              return (
                <HStack
                  key={suggestion.id}
                  role="option"
                  aria-selected={selected}
                  px={2}
                  py={2}
                  borderRadius="md"
                  cursor="pointer"
                  bg={selected ? 'browsy.active' : suggestion.isActiveTab ? 'browsy.hover' : 'transparent'}
                  _hover={{ bg: selected ? 'browsy.active' : 'browsy.hover' }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(suggestion)
                  }}
                  spacing={2.5}
                  sx={
                    isTabRow
                      ? {
                          '& .tab-close': { opacity: selected || suggestion.isActiveTab ? 0.7 : 0 },
                          '&:hover .tab-close': { opacity: 1 }
                        }
                      : undefined
                  }
                >
                  {suggestion.kind === 'command' || !suggestion.url ? (
                    <Box
                      w="22px"
                      h="22px"
                      borderRadius="sm"
                      bg="browsy.glyph"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="10px"
                      fontWeight="600"
                      color="browsy.muted"
                      flexShrink={0}
                    >
                      {suggestion.glyph}
                    </Box>
                  ) : (
                    <Favicon url={suggestion.url} favicon={suggestion.favicon} size={22} />
                  )}
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" noOfLines={1} fontWeight={suggestion.isActiveTab ? '600' : '500'}>
                      {suggestion.title}
                      {suggestion.isActiveTab ? (
                        <Text as="span" color="browsy.muted" fontWeight="400">
                          {' '}
                          · current
                        </Text>
                      ) : null}
                    </Text>
                    <Text fontSize="xs" color="browsy.muted" noOfLines={1}>
                      {suggestion.subtitle}
                    </Text>
                  </Box>
                  {isTabRow && suggestion.tabId ? (
                    <CloseButton
                      className="tab-close"
                      size="sm"
                      flexShrink={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        onCloseTab(suggestion.tabId!)
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                      }}
                    />
                  ) : (
                    <Text fontSize="xs" color="browsy.muted" flexShrink={0}>
                      {kindLabel(suggestion.kind)}
                    </Text>
                  )}
                </HStack>
              )
            })}
          </VStack>
        </Box>
      )}

      <HStack
        px={4}
        py={2}
        borderTop="1px solid"
        borderColor="browsy.border"
        justify="space-between"
        bg="browsy.input"
      >
        <Text fontSize="xs" color="browsy.muted">
          ↑↓ select · Enter open · Esc dismiss
        </Text>
        <Text fontSize="xs" color="browsy.muted">
          Cmd←/→ tabs
        </Text>
      </HStack>
    </Box>
  )
}

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
import { CloseIcon, SearchIcon } from '@chakra-ui/icons'
import type { AiAssistant, Bookmark, HistoryEntry, TabState } from '@shared/types'
import { AI_ASSISTANT_GLYPHS, AI_ASSISTANT_LABELS, parseAiCommand } from '@shared/ai-assistant'
import { selectPinnedBookmarks } from '@shared/pinned-sites'
import { browsyPageLabel } from '@shared/internal-pages'
import {
  buildSuggestions,
  commandForExactQuery,
  findCompletion,
  kindLabel,
  SPOTLIGHT_QUICK_ACTIONS,
  type CommandAction,
  type Suggestion
} from '../utils/suggestions'
import { getUrlScheme } from '../utils/origin'
import { OriginCue } from './OriginCue'
import { Favicon } from './Favicon'
import { PinnedSitesRow } from './PinnedSitesRow'

interface OmniboxProps {
  initialValue: string
  focusToken: number
  isLoading: boolean
  tabs: TabState[]
  activeTabId: string | null
  onSubmit: (value: string) => void
  onClose: () => void
  onSwitchTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCommand: (action: CommandAction) => void
}

function displayValueForUrl(url: string): string {
  return browsyPageLabel(url) ? '' : url
}

export function Omnibox({
  initialValue,
  focusToken,
  isLoading,
  tabs,
  activeTabId,
  onSubmit,
  onClose,
  onSwitchTab,
  onCloseTab,
  onCommand
}: OmniboxProps) {
  const [value, setValue] = useState(displayValueForUrl(initialValue))
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [aiAssistant, setAiAssistant] = useState<AiAssistant>('chatgpt')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [completionSuppressedFor, setCompletionSuppressedFor] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const liveDisplay = displayValueForUrl(initialValue)
  const scheme = getUrlScheme(initialValue)
  const showingLiveUrl = value === liveDisplay && liveDisplay.length > 0
  // While the field still mirrors the live URL (just opened / not edited), show
  // the open-tabs inventory instead of searching for that URL string.
  const suggestionQuery = showingLiveUrl ? '' : value
  const suggestions = buildSuggestions(suggestionQuery, tabs, bookmarks, history, activeTabId, 12, aiAssistant)
  const queryEmpty = suggestionQuery.trim().length === 0
  const showingTabsInventory = queryEmpty && suggestions.some((s) => s.kind === 'tab')
  const pinnedSites = selectPinnedBookmarks(bookmarks)

  // Flat index space: quick cards, then pinned favicons, then suggestion rows.
  // Arrow nav is spatial (omnibox hub), not a single cycle — see moveUp/moveDown.
  const quickCount = SPOTLIGHT_QUICK_ACTIONS.length
  const pinnedCount = pinnedSites.length
  const firstPinned = quickCount
  const firstResult = quickCount + pinnedCount
  const lastResult = firstResult + suggestions.length - 1
  const inQuick = (index: number) => index >= 0 && index < quickCount
  const inPinned = (index: number) =>
    pinnedCount > 0 && index >= firstPinned && index < firstPinned + pinnedCount

  const completionMatch =
    activeIndex === -1 && completionSuppressedFor !== value && !showingLiveUrl
      ? findCompletion(suggestions, value)
      : null
  const completion = completionMatch?.value ?? null
  const displayedValue = completion ?? value
  const aiCommand = parseAiCommand(value, aiAssistant)
  const aiInputValue = aiCommand ? aiCommand.prompt : displayedValue

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
    void window.browsy.getBookmarks().then(setBookmarks)
    void window.browsy.getSettings().then((settings) => setAiAssistant(settings.aiAssistant ?? 'chatgpt'))
    // Prefetch a small recent slice only — never the full history store.
    void window.browsy.getHistory(40).then(setHistory)
    const unsubBookmarks = window.browsy.onBookmarksChanged(setBookmarks)
    const unsubSettings = window.browsy.onSettingsChanged((settings) => {
      setAiAssistant(settings.aiAssistant ?? 'chatgpt')
    })
    return () => {
      unsubBookmarks()
      unsubSettings()
    }
  }, [focusToken])

  // Debounced main-process search while typing (keeps IPC payloads tiny).
  useEffect(() => {
    const q = suggestionQuery.trim()
    if (!q || q.startsWith('/')) {
      void window.browsy.getHistory(40).then(setHistory)
      return
    }
    const timer = window.setTimeout(() => {
      void window.browsy.searchHistory(q, 12).then(setHistory)
    }, 40)
    return () => window.clearTimeout(timer)
  }, [suggestionQuery])

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
    if (suggestion.kind === 'ai') {
      if (suggestion.commandInput) onSubmit(suggestion.commandInput)
      return
    }
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

  const activateIndex = (index: number) => {
    if (inQuick(index)) {
      choose(SPOTLIGHT_QUICK_ACTIONS[index])
      return
    }
    if (inPinned(index)) {
      const site = pinnedSites[index - firstPinned]
      if (site) onSubmit(site.url)
      return
    }
    const suggestion = suggestions[index - firstResult]
    if (suggestion) choose(suggestion)
  }

  // Spatial zones: cards above ← omnibox (-1) → pinned + results below.
  // ↑ from omnibox enters cards; ↓ enters pinned/results. Zones don't bleed.
  const moveDown = () => {
    setActiveIndex((i) => {
      if (i < 0) {
        if (pinnedCount) return firstPinned
        return suggestions.length ? firstResult : -1
      }
      if (inQuick(i)) return -1
      if (inPinned(i)) return suggestions.length ? firstResult : i
      if (!suggestions.length) return -1
      return i >= lastResult ? firstResult : i + 1
    })
  }

  const moveUp = () => {
    setActiveIndex((i) => {
      if (i < 0) return quickCount ? 0 : -1
      if (inQuick(i)) return i
      if (inPinned(i)) return -1
      if (i <= firstResult) return pinnedCount ? firstPinned : -1
      return i - 1
    })
  }

  const commit = (raw: string) => {
    const next = raw.trim()
    if (!next) {
      // Empty Enter: act on highlighted row only — don't auto-jump to first tab.
      if (activeIndex >= 0) activateIndex(activeIndex)
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
      <Box px={3} pt={3} pb={0}>
        <HStack spacing={1} role="listbox" aria-label="Quick actions" mb={1.5}>
          {SPOTLIGHT_QUICK_ACTIONS.map((action, index) => {
            const selected = index === activeIndex
            return (
              <Box
                key={action.id}
                role="option"
                aria-selected={selected}
                flex={1}
                minW={0}
                px={2.5}
                py={2}
                borderRadius="md"
                bg={selected ? 'browsy.active' : 'transparent'}
                cursor="pointer"
                transition="background 0.12s ease"
                _hover={{ bg: selected ? 'browsy.active' : 'browsy.hover' }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(action)
                }}
              >
                <HStack spacing={2} align="center" justify="center">
                  <Text
                    fontSize="xs"
                    fontWeight="600"
                    color={selected ? 'browsy.ink' : 'browsy.muted'}
                    lineHeight={1}
                    flexShrink={0}
                  >
                    {action.glyph}
                  </Text>
                  <Text
                    fontSize="sm"
                    fontWeight={selected ? '600' : '500'}
                    color="browsy.ink"
                    opacity={selected ? 1 : 0.72}
                    noOfLines={1}
                  >
                    {action.title}
                  </Text>
                </HStack>
              </Box>
            )
          })}
        </HStack>

        <InputGroup size="md" pb={2}>
          <InputLeftElement h="44px" w="auto" left={3} pointerEvents="none">
            {aiCommand ? (
              <HStack
                spacing={1.5}
                px={1.5}
                py={1}
                borderRadius="md"
                bg="browsy.glyph"
                color="browsy.ink"
                role="img"
                aria-label={`${AI_ASSISTANT_LABELS[aiCommand.assistant]} provider`}
              >
                <Box
                  w="16px"
                  h="16px"
                  borderRadius="full"
                  bg="browsy.active"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="10px"
                  fontWeight="700"
                >
                  {AI_ASSISTANT_GLYPHS[aiCommand.assistant]}
                </Box>
                <Text fontSize="xs" fontWeight="600">
                  {AI_ASSISTANT_LABELS[aiCommand.assistant]}
                </Text>
              </HStack>
            ) : isLoading ? (
              <Spinner size="sm" color="browsy.icon" thickness="1.5px" />
            ) : showOriginCue ? (
              <OriginCue scheme={scheme} />
            ) : (
              <SearchIcon color="browsy.icon" boxSize={4} />
            )}
          </InputLeftElement>
          <Input
            ref={inputRef}
            value={aiInputValue}
            h="44px"
            fontSize="md"
            pl={aiCommand ? 28 : 10}
            borderRadius="lg"
            onChange={(e) => {
              if (aiCommand) {
                const prefix = value.trim().match(/^@(ai|chatgpt|claude|gemini)/i)?.[0]
                setValue(prefix ? (e.target.value ? `${prefix} ${e.target.value}` : prefix) : e.target.value)
              } else {
                setValue(e.target.value)
              }
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
                moveDown()
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                moveUp()
              } else if (
                (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
                inQuick(activeIndex)
              ) {
                e.preventDefault()
                const delta = e.key === 'ArrowRight' ? 1 : -1
                setActiveIndex((i) => (i + delta + quickCount) % quickCount)
              } else if (
                (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
                inPinned(activeIndex)
              ) {
                e.preventDefault()
                const delta = e.key === 'ArrowRight' ? 1 : -1
                setActiveIndex((i) => firstPinned + ((i - firstPinned + delta + pinnedCount) % pinnedCount))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (activeIndex >= 0) {
                  activateIndex(activeIndex)
                } else if (completionMatch) {
                  choose(completionMatch.suggestion)
                } else {
                  commit(value)
                }
              } else if (e.key === 'Tab') {
                e.preventDefault()
                if (e.shiftKey) moveUp()
                else moveDown()
              }
            }}
            placeholder="Search, URL, tab, /command, or @ai prompt"
            bg="browsy.input"
            border="1px solid"
            borderColor="browsy.inputBorder"
            _focus={{ borderColor: 'browsy.focusBorder', boxShadow: 'none' }}
          />
          {value && (
            <InputRightElement h="44px">
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
      </Box>

      {(suggestions.length > 0 || pinnedSites.length > 0) && (
        <Box borderTop="1px solid" borderColor="browsy.border">
          <PinnedSitesRow
            sites={pinnedSites}
            activeIndex={inPinned(activeIndex) ? activeIndex - firstPinned : -1}
            onHover={(index) => setActiveIndex(firstPinned + index)}
            onChoose={(site) => onSubmit(site.url)}
          />
          {showingTabsInventory && (
            <Text
              px={4}
              pt={pinnedSites.length ? 1 : 3}
              pb={1}
              fontSize="xs"
              fontWeight="600"
              color="browsy.muted"
              letterSpacing="wide"
              bg="browsy.elevated"
              flexShrink={0}
            >
              OPEN TABS
            </Text>
          )}
          {suggestions.length > 0 && (
          <Box
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
            <VStack align="stretch" spacing={0} px={2} py={1.5} role="listbox" aria-label="Suggestions">
              {suggestions.map((suggestion, index) => {
                const itemIndex = firstResult + index
                const selected = itemIndex === activeIndex
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
                    onMouseEnter={() => setActiveIndex(itemIndex)}
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
          ↑ cards · ↓ results · ←→ · Enter · Esc
        </Text>
        <Text fontSize="xs" color="browsy.muted">
          Cmd←/→ tabs
        </Text>
      </HStack>
    </Box>
  )
}

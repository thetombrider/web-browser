import assert from 'node:assert/strict'
import test from 'node:test'
import { aiPromptInputValue, buildAiChatUrl, parseAiCommand } from './ai-assistant'

test('uses the configured provider for @ai commands', () => {
  assert.deepEqual(parseAiCommand('@ai explain this page', 'claude'), {
    assistant: 'claude',
    prompt: 'explain this page'
  })
})

test('allows a provider override', () => {
  assert.deepEqual(parseAiCommand(' @GEMINI  summarize this  '), {
    assistant: 'gemini',
    prompt: 'summarize this'
  })
})

test('ignores incomplete AI commands', () => {
  assert.equal(parseAiCommand('@ai'), null)
  assert.equal(parseAiCommand('@unknown do something'), null)
})

test('preserves a trailing space while editing an AI prompt', () => {
  assert.equal(aiPromptInputValue('@claude explain this '), 'explain this ')
})

test('builds a provider chat URL from the prompt', () => {
  assert.equal(
    buildAiChatUrl('chatgpt', 'what is this?'),
    'https://chatgpt.com/?q=what%20is%20this%3F'
  )
})

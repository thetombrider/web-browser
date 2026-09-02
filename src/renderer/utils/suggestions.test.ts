import assert from 'node:assert/strict'
import test from 'node:test'
import { completionForSuggestion, type Suggestion } from './suggestions'

const urlSuggestion: Suggestion = {
  id: 'history-example',
  kind: 'history',
  title: 'Example',
  subtitle: 'https://example.com',
  url: 'https://example.com',
  completionValues: ['https://example.com'],
  glyph: 'E'
}

test('does not replace a space typed after a URL completion', () => {
  assert.equal(completionForSuggestion(urlSuggestion, 'https://example'), 'https://example.com')
  assert.equal(completionForSuggestion(urlSuggestion, 'https://example '), null)
})

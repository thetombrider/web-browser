import assert from 'assert'
import { isAllowedWebPermission } from '../src/shared/utils'

assert.strictEqual(isAllowedWebPermission('clipboard-sanitized-write'), true)
assert.strictEqual(isAllowedWebPermission('clipboard-read'), false)
assert.strictEqual(isAllowedWebPermission('clipboard-write'), false)
assert.strictEqual(isAllowedWebPermission('media'), false)
assert.strictEqual(isAllowedWebPermission('geolocation'), false)
assert.strictEqual(isAllowedWebPermission('notifications'), false)

console.log('smoke-clipboard-permission: ok')

import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'mocha'

describe('local prefill does not inherit obsolete TASK executor readiness', () => {
  it('removes the old work-item execution gate but keeps explicit task/actor matching', () => {
    assert.equal(existsSync(new URL('../src/composables/useFormalTaskExecutionScope.js', import.meta.url)), false)
    const hall = readFileSync(new URL('../src/components/world/JuyiHall.vue', import.meta.url), 'utf8')
    assert.doesNotMatch(hall, /useFormalTaskExecutionScope|formalTaskExecutionContext/)
    assert.match(hall, /target\.agentId !== intent\.targetAgentId/)
    assert.match(hall, /bountyInteractionTargetId\(chatContext.value\) === intent.targetAgentId/)
    assert.match(hall, /sourceIdentity !==/)
  })
})

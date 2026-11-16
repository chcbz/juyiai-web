import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'mocha'

describe('retired direct TASK executor', () => {
  it('has no independent write/recovery engine; task materials emit only a scoped local handoff', () => {
    assert.equal(existsSync(new URL('../src/composables/useFormalTaskExecution.js', import.meta.url)), false)
    const source = readFileSync(new URL('../src/components/personal-workspace/TaskMaterialLinks.vue', import.meta.url), 'utf8')
    assert.match(source, /emit\('open-deliberation', \{ mode: 'TASK', taskId: props.taskId, targetAgentId: props.targetAgentId/)
    assert.doesNotMatch(source, /useFormalTaskExecution|revokeOriginal|recoverOriginalRequest|\.begin\(/)
    assert.doesNotMatch(source, /确认并开始办理（PDF）/)
  })
})

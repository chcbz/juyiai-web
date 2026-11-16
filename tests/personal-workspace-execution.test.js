import { strict as assert } from 'node:assert'
import { describe, it } from 'mocha'
import { ref } from 'vue'
import { usePersonalWorkspaceExecutionHistory } from '../src/composables/usePersonalWorkspaceExecution.js'

const row = (executionId = 'exec-1') => ({ executionId, targetAgentId: 'agent-a', state: 'OUTPUT_COMMITTED', createdAt: 10, outputContentMimeType: 'application/octet-stream' })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

describe('workspace historical execution reads', () => {
  it('loads historical facts and exact detail without capabilities, writes, recovery or polling', async () => {
    const calls = []
    const history = usePersonalWorkspaceExecutionHistory({ identityScope: 'owner-a', api: { execute: async request => {
      calls.push(request)
      return request.url.endsWith('/exec-1') ? { executionId: 'exec-1', state: 'OUTPUT_COMMITTED', taskId: null } : { items: [row()], nextCursor: null }
    } } })
    try {
      await history.loadHistory()
      await history.selectHistoryExecution('exec-1')
      assert.equal(history.execution.value.executionId, 'exec-1')
      assert.ok(calls.every(call => call.method === 'GET'))
      assert.equal(calls.length, 2)
      for (const old of ['create', 'recover', 'revokeInputs', 'loadCapabilities', 'prepareNewRequest']) assert.equal(history[old], undefined)
    } finally { history.dispose() }
  })
  it('does not fetch a record that was not selected from the owned history', async () => {
    let calls = 0
    const history = usePersonalWorkspaceExecutionHistory({ api: { execute: async () => { calls++ } } })
    try { assert.equal(await history.selectHistoryExecution('foreign'), null); assert.equal(calls, 0) } finally { history.dispose() }
  })
  it('drops late history and aborts reads across identity changes', async () => {
    const gate = deferred(), identityEpoch = ref(1); let signal
    const history = usePersonalWorkspaceExecutionHistory({ identityEpoch, api: { execute: request => { signal = request.signal; return gate.promise } } })
    try {
      const reading = history.loadHistory()
      identityEpoch.value++
      assert.equal(signal.aborted, true)
      gate.resolve({ items: [row()], nextCursor: null })
      await reading
      assert.deepEqual(history.history.value, [])
      assert.equal(history.historyState.value, 'idle')
    } finally { history.dispose() }
  })
  it('only offers currently operable owner Agents for the local prefill selector', async () => {
    const history = usePersonalWorkspaceExecutionHistory({ api: { execute: async () => [
      { agentId: 'mine', boundToMe: true, canOperate: true }, { agentId: 'foreign', boundToMe: false, canOperate: true },
      { agentId: 'system', boundToMe: true, canOperate: true, systemAgent: true }
    ] } })
    try {
      await history.loadAgents()
      assert.deepEqual(history.agents.value.map(agent => agent.agentId), ['mine'])
      assert.equal(history.selectAgent('foreign'), false)
      assert.equal(history.selectAgent('mine'), true)
    } finally { history.dispose() }
  })
  it('does not let an older selected detail replace the current selection', async () => {
    const first = deferred(), second = deferred()
    const history = usePersonalWorkspaceExecutionHistory({ api: { execute: async ({ url }) => url.endsWith('/exec-1') ? first.promise : url.endsWith('/exec-2') ? second.promise : { items: [row('exec-1'), row('exec-2')], nextCursor: null } } })
    try {
      await history.loadHistory()
      const a = history.selectHistoryExecution('exec-1'), b = history.selectHistoryExecution('exec-2')
      second.resolve({ executionId: 'exec-2', state: 'FAILED' }); await b
      first.resolve({ executionId: 'exec-1', state: 'OUTPUT_COMMITTED' }); await a
      assert.equal(history.execution.value.executionId, 'exec-2')
    } finally { history.dispose() }
  })
})

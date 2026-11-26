import { readFileSync } from 'node:fs'
import { expect } from 'chai'
import { ref } from 'vue'
import { useHallData } from '../src/composables/juyiting/useHallData.js'
import { parseAssigneeRecommendation, taskQuoteText, isAvailableTaskQuote } from '../src/composables/juyiting/hallAssigneeRecommendation.js'

const task = () => ({ id: 'task-r1', taskVersion: '7', title: '写一份说明', description: '说明使用方式', status: 'open' })
const agent = { agentId: 'a', name: '好汉', status: 'online', canOperate: true, boundToMe: true, abilities: ['写作'] }
const result = () => ({ taskId: 'task-r1', taskVersion: '7', state: 'READY', observedAt: 1000,
  candidateSetComplete: true, retrievalMode: 'HYBRID', rankingVersion: 'v1', degradedReasons: [], recommendations: [{ agent,
    reason: '登记了写作本领', evidence: [{ id: 'ability:0', kind: 'DECLARED_ABILITY', label: '写作', description: '登记声明', available: true }], gaps: ['受众未知，不保证适合具体使用场景'] }] })
const create = implementation => {
  const selectedTask = ref(task()), identityScope = ref('owner-a')
  const data = useHallData({ agentApi: { create: implementation, get: async url => url.endsWith('/assignee-candidates') ? ({ items: [{ agentId: 'a', displayName: '好汉', providerDisplayName: null, isMine: true, availability: 'online' }], nextAfterAgentId: null }) : selectedTask.value }, log: { warn() {} },
    normalizeStatus: value => value?.toLowerCase(), selectedAgent: ref(null), selectedTask, identityScope })
  data.agents.value = [agent]
  return { data, selectedTask, identityScope }
}
describe('single-track model assignee recommendation R1', () => {
  it('consumes the complete envelope fixture matched by the actual API controller', () => {
    const envelope = JSON.parse(readFileSync(new URL('./fixtures/billing/task-recommendation.json', import.meta.url), 'utf8'))
    expect(envelope.protocolVersion).to.equal(1); expect(envelope.code).to.equal('E0')
    const parsed = parseAssigneeRecommendation(envelope.data, { id: 'task', taskVersion: '7' })
    expect(parsed.recommendations[0]).not.to.have.property('quote')
  })
  it('keeps complete lexical-only candidates selectable without treating retrieval as a price', async () => {
    const value = { ...result(), state: 'DEGRADED', retrievalMode: 'LEXICAL_ONLY', degradedReasons: ['QUERY_VECTOR_UNAVAILABLE'] }
    const { data } = create(async (_url, _input, options) => options.onSuccess(value))
    await data.loadTaskRecommendations()
    expect(data.canAssign(task(), agent)).to.equal(true)
    expect(data.recommendedAgents.value[0]).not.to.have.property('taskQuote')
    data.dispose()
    for (const invalid of [{ degradedReasons: [] }, { retrievalMode: 'UNAVAILABLE' }, { candidateSetComplete: false }])
      expect(() => parseAssigneeRecommendation({ ...value, ...invalid }, task())).to.throw()
  })
  it('keeps the manual list when no disclosed evidence needs retrieval', async () => {
    const row = { ...result().recommendations[0], agent: { ...agent, abilities: [] }, evidence: [] }
    const value = { ...result(), state: 'NO_MATCH', retrievalMode: 'NOT_NEEDED', recommendations: [row] }
    const { data } = create(async (_url, _input, options) => options.onSuccess(value))
    await data.loadTaskRecommendations()
    expect(data.recommendationState.value.state).to.equal('NO_MATCH'); expect(data.canAssign(task(), agent)).to.equal(true)
    data.dispose()
    for (const bad of [{ recommendations: [] }, { state: 'READY' }, { recommendations: [{ ...row, evidence: result().recommendations[0].evidence }] }])
      expect(() => parseAssigneeRecommendation({ ...value, ...bad }, task())).to.throw()
  })
  it('preserves retrieval order and keeps unmatched candidates for manual selection', async () => {
    const first = result().recommendations[0]
    const rows = [{ ...first, agent: { ...agent, boundToMe: false } }, { ...first, agent: { ...agent, agentId: 'b' }, evidence: [] }]
    const { data } = create(async (_url, _input, options) => options.onSuccess({ ...result(), recommendations: rows }))
    await data.loadTaskRecommendations()
    expect(data.recommendedAgents.value.map(a => a.agentId)).to.deep.equal(['a', 'b'])
    data.dispose()
  })

  it('accepts additive fields but rejects old scored arrays, stale task and unsupported states', () => {
    expect(parseAssigneeRecommendation({ ...result(), future: true }, task()).state).to.equal('READY')
    for (const value of [[], [{ agent, score: 80 }], { ...result(), taskVersion: '8' }, { ...result(), state: 'DONE' },
      { ...result(), recommendations: [] }, { ...result(), state: 'NO_MATCH' }]) {
      expect(() => parseAssigneeRecommendation(value, task())).to.throw()
    }
  })
  it('uses authoritative evidence with no score and coalesces an in-flight request', async () => {
    let release, calls = 0, body
    const { data } = create(async (_url, input, options) => { calls++; body = input; await new Promise(r => { release = r }); options.onSuccess(result()) })
    const first = data.loadTaskRecommendations(), second = data.loadTaskRecommendations()
    expect(first).to.equal(second)
    expect(data.recommendationState.value.state).to.equal('LOADING')
    release(); await first
    expect(calls).to.equal(1); expect(body).to.deep.equal({ expectedTaskVersion: '7' })
    expect(data.recommendedAgents.value[0].recommendationEvidence[0].label).to.equal('写作')
    expect(data.recommendedAgents.value[0]).not.to.have.property('recommendationScore')
    await data.loadTaskRecommendations(); expect(calls).to.equal(1)
    data.dispose()
  })
  it('retains unknown assessments for manual selection without inventing positive recommendations', async () => {
    const { data } = create(async (_url, _input, options) => options.onSuccess({ ...result(), state: 'NO_MATCH', recommendations: [{ ...result().recommendations[0], reason: '资料不足', evidence: [] }] }))
    await data.loadTaskRecommendations(); expect(data.recommendationState.value.state).to.equal('NO_MATCH')
    expect(data.recommendedAgents.value[0].recommendationEvidence).to.deep.equal([]); expect(data.canAssign(task(), agent)).to.equal(true)
    data.dispose()
    const failed = create(async () => { throw new Error('provider offline') })
    await failed.data.loadTaskRecommendations(); expect(failed.data.recommendationState.value.state).to.equal('ERROR')
    expect(failed.data.recommendedAgents.value).to.deep.equal([]); failed.data.dispose()
  })
  it('discards responses after identity or task version changes', async () => {
    for (const scopeChange of [true, false]) {
      let release
      const { data, selectedTask, identityScope } = create(async (_url, _input, options) => { await new Promise(r => { release = r }); options.onSuccess(result()) })
      const request = data.loadTaskRecommendations()
      if (scopeChange) identityScope.value = 'other-owner'
      else selectedTask.value = { ...task(), taskVersion: '8' }
      release(); await request
      expect(data.recommendedAgents.value).to.deep.equal([])
      expect(data.recommendationState.value.state).not.to.equal('LOADING')
      data.dispose()
    }
  })
  it('requires evidence for each recommended candidate, while allowing missing skills', () => {
    const valid = result(); expect(parseAssigneeRecommendation(valid, task())).to.equal(valid)
    valid.recommendations[0].evidence[0].available = false
    expect(() => parseAssigneeRecommendation(valid, task())).to.throw()
  })
  it('rejects removed clarification and questions, retaining explicit stale retry', async () => {
    let calls = 0
    const { data } = create(async () => { calls++; throw Object.assign(new Error(), { code: 'RECOMMENDATION_STALE', status: 409 }) })
    await data.loadTaskRecommendations(); expect(data.recommendationState.value.state).to.equal('STALE')
    await data.loadTaskRecommendations(); expect(calls).to.equal(1)
    await data.loadTaskRecommendations(task(), { refresh: true }); expect(calls).to.equal(2)
    data.dispose()
    for (const value of [
      { ...result(), state: 'NEEDS_CLARIFICATION', recommendations: [], questions: ['面向谁？'] },
      { ...result(), state: 'NEEDS_CLARIFICATION', recommendations: [], questions: [] },
      { ...result(), state: 'NO_MATCH', recommendations: [], questions: ['请补充需求'] }
    ]) expect(() => parseAssigneeRecommendation(value, task())).to.throw()
  })
  it('refreshes detail once before retry, adopts current version and coalesces repeated clicks', async () => {
    const selectedTask = ref(task()), identityScope = ref('owner')
    let release, calls = 0, reads = 0
    const data = useHallData({ selectedTask, selectedAgent: ref(null), identityScope,
      normalizeStatus: v => v, log: { warn() {} }, agentApi: {
        get: async url => {
          if (url.endsWith('/assignee-candidates')) return { items: [], nextAfterAgentId: null }
          reads++; await new Promise(r => { release = r }); return { ...task(), taskVersion: '8' }
        },
        create: async (_url, body, options) => {
          calls++; expect(body.expectedTaskVersion).to.equal('8')
          options.onSuccess({ ...result(), taskVersion: '8' })
        }
      } })
    const first = data.loadTaskRecommendations(selectedTask.value, { refresh: true })
    expect(data.loadTaskRecommendations(selectedTask.value, { refresh: true })).to.equal(first)
    expect(data.recommendationState.value.state).to.equal('LOADING')
    expect(calls).to.equal(0); release(); await first
    expect(reads).to.equal(1); expect(calls).to.equal(1)
    expect(data.recommendationState.value.state).to.equal('READY')
    data.dispose()
  })
  it('does not call the model on failed detail refresh or after identity/task switching', async () => {
    for (const change of ['failure', 'identity', 'task']) {
      const selectedTask = ref(task()), identityScope = ref('owner')
      let release, calls = 0
      const data = useHallData({ selectedTask, selectedAgent: ref(null), identityScope,
        normalizeStatus: v => v, log: { warn() {} }, agentApi: {
          get: async url => {
            if (url.endsWith('/assignee-candidates')) return { items: [], nextAfterAgentId: null }
            await new Promise(r => { release = r })
            if (change === 'failure') throw new Error('offline')
            return { ...task(), taskVersion: '8' }
          }, create: async () => { calls++ }
        } })
      const pending = data.loadTaskRecommendations(selectedTask.value, { refresh: true })
      if (change === 'identity') identityScope.value = 'other'
      if (change === 'task') selectedTask.value = { ...task(), id: 'other' }
      release(); await pending
      expect(calls).to.equal(0)
      expect(data.recommendationState.value.state).to.equal(change === 'failure' ? 'ERROR' : 'IDLE')
      data.dispose()
    }
  })

})


describe('task quotation availability explanations', () => {
  const unavailable = reason => ({ state: 'UNAVAILABLE', quoteId: null, recommendationId: 'rec', amount: null, unavailableReason: reason })
  for (const [reason, message] of Object.entries({
    NO_BASELINE: '同类实测样本', OUT_OF_DISTRIBUTION: '超出已验证的预算范围',
    USAGE_INCOMPLETE: '历史用量记录不完整', PRICE_MISSING: '参考单价不完整',
    BILLING_ROUTE_MISSING: '计费配置尚未就绪', MODEL_PRICE_MISSING: '模型单价尚未登记',
    TOKEN_PRICE_MISSING: '模型用量单价不完整', TOOL_PRICE_MISSING: '收费工具尚未登记单价',
    QUOTE_AMOUNT_OVERFLOW: '预估费用超出支持范围'
  })) it(`explains ${reason} without suggesting a paid retry or free assignment`, () => {
    const quote = unavailable(reason)
    expect(taskQuoteText(quote)).to.include(message)
    if (reason === 'BILLING_ROUTE_MISSING') {
      expect(taskQuoteText(quote)).to.include('如有「查看首次交付方式」')
      expect(taskQuoteText(quote)).to.include('配置就绪后点「重新取价」')
      expect(taskQuoteText(quote)).to.include('仍无报价')
    } else expect(taskQuoteText(quote)).not.to.include('首次交付方式')
    expect(taskQuoteText(quote)).not.to.include('稍后重试')
    expect(taskQuoteText(quote)).not.to.include('0文')
    expect(isAvailableTaskQuote(quote)).to.equal(false)
    const response = result(); response.recommendations[0].quote = quote
    expect(parseAssigneeRecommendation(response, task())).to.equal(response)
  })
  for (const reason of ['NEW_REASON', 'constructor', '__proto__']) it(`keeps unknown reason ${reason} readable without rejecting the whole recommendation`, () => {
    const quote = unavailable(reason)
    expect(taskQuoteText(quote)).to.equal('暂无法报价：费用信息未就绪，请联系平台核查。')
    const response = result(); response.recommendations[0].quote = quote
    expect(parseAssigneeRecommendation(response, task())).to.equal(response)
  })
  it('keeps an absent quote distinct from an explicitly available zero or positive quote', () => {
    expect(taskQuoteText(null)).to.equal('尚未取得独立报价')
    for (const amount of ['0', '1', '13']) {
      const quote = { state: 'AVAILABLE', quoteId: 'quote', recommendationId: 'rec', amount: { currency: 'WEN', amountMinor: amount } }
      expect(taskQuoteText(quote)).to.equal(`事项报价 ${amount}文`)
      expect(isAvailableTaskQuote(quote)).to.equal(true)
    }
  })
})

describe('independent selected-assignee budget', () => {
  const unavailable = id => ({ taskId: 'task-r1', taskVersion: '7', observedAt: 1, quotes: [{ agentId: id,
    state: 'UNAVAILABLE', quoteId: null, recommendationId: 'batch', amount: null, unavailableReason: 'NO_BASELINE' }] })
  it('requests one explicit ID; retries preserve both headers, new intent replaces both', async () => {
    const calls = []; const { data } = create(async (url, body, opts) => {
      calls.push({ url, body, headers: opts.headers }); if (calls.length === 1) throw new Error('network')
      return unavailable('a')
    })
    await data.loadAssigneeCandidates(); await data.requestBudget(task(), 'a'); expect(data.budget.value.state).to.equal('ERROR')
    await data.requestBudget(task(), 'a', 'retry'); expect(data.budget.value.state).to.equal('UNAVAILABLE')
    await data.requestBudget(task(), 'a'); expect(calls).to.have.length(2)
    await data.requestBudget(task(), 'a', 'renew'); expect(calls[0].url).to.equal('/tasks/task-r1/quotes')
    expect(calls[0].body).to.deep.equal({ expectedTaskVersion: '7', agentIds: ['a'] }); expect(calls[1].headers).to.deep.equal(calls[0].headers)
    for (const header of ['Idempotency-Key', 'X-Request-Id']) expect(calls[2].headers[header]).to.not.equal(calls[0].headers[header]); data.dispose()
  })
  for (const boundary of ['close','version','identity','dispose']) it(`discards a late response after ${boundary}`, async () => {
    let resolve; const { data, selectedTask, identityScope } = create(() => new Promise(done => { resolve = done }))
    await data.loadAssigneeCandidates(); const flight = data.requestBudget(task(), 'a'); expect(data.budget.value.state).to.equal('LOADING')
    if (boundary === 'close') data.clearBudget(); else if (boundary === 'version') selectedTask.value.taskVersion = '8'
    else if (boundary === 'identity') identityScope.value = 'different'; else data.dispose()
    resolve(unavailable('a')); await flight; expect(data.budget.value.state).to.equal('IDLE'); data.dispose()
  })
})

import { ref } from 'vue'
import { resolveRequestId } from '../useRequestRum.js'
import { isTaskQuote, recommendationTaskKey } from './hallAssigneeRecommendation.js'

// One authorized candidate set per intent. The server owns all prices, evidence and confirmation bindings.
export function useHallTaskBudget ({ api, getTask, identity, eligible, refreshDetail }) {
  const budget = ref({ state: 'IDLE' })
  let intent, controller
  function clearBudget () {
    intent = null
    controller?.abort()
    controller = null
    budget.value = { state: 'IDLE' }
  }
  async function requestBudgets (task, eligibleIds, mode = 'select') {
    const ids = Array.isArray(eligibleIds) ? [...new Set(eligibleIds)].sort() : []
    if (!task || !ids.length || recommendationTaskKey(task) !== recommendationTaskKey(getTask()) || !ids.every(agentId => eligible(task, { agentId }))) {
      clearBudget(); return
    }
    task = { id: task.id, taskVersion: task.taskVersion }
    const scope = identity()
    const key = JSON.stringify([scope, task.id, task.taskVersion, ids])
    if (mode === 'select' && intent?.key === key) return
    if (mode !== 'select' && (intent?.key !== key || controller)) return
    if (mode === 'refresh' && budget.value.state === 'REFRESH_FAILED') {
      const old = intent; budget.value = { ...budget.value, state: 'REFRESHING' }
      const loaded = await refreshDetail(task)
      if (old === intent) budget.value = { ...budget.value, state: loaded ? 'STALE' : 'REFRESH_FAILED' }
      return
    }
    if (!['select','retry','renew'].includes(mode)) return
    if (mode === 'retry' && budget.value.state !== 'ERROR') return
    if (mode === 'renew' && !['READY', 'STALE'].includes(budget.value.state)) return
    if (mode !== 'retry') {
      clearBudget()
      intent = { key, requestId: resolveRequestId(), idempotencyKey: resolveRequestId() }
    }
    const original = intent, own = new AbortController()
    controller = own
    const current = () => intent === original && !own.signal.aborted && identity() === scope &&
      recommendationTaskKey(task) === recommendationTaskKey(getTask())
    const show = (state, quotesByAgentId = new Map()) => { budget.value = { state, scope, idsKey: JSON.stringify(ids), taskId: task.id, taskVersion: task.taskVersion, quotesByAgentId } }
    show('LOADING')
    try {
      const result = await api.create(`/tasks/${encodeURIComponent(task.id)}/quotes`, { expectedTaskVersion: task.taskVersion, agentIds: ids }, {
        autoLoading: false, signal: own.signal, headers: { 'Idempotency-Key': original.idempotencyKey, 'X-Request-Id': original.requestId }
      })
      if (!current()) return
      if (result?.taskId !== task.id || result.taskVersion !== task.taskVersion || !Number.isSafeInteger(result.observedAt) || result.observedAt < 0 ||
        !Array.isArray(result.quotes) || result.quotes.length !== ids.length) throw new Error('Invalid budget response')
      const remaining = new Set(ids), seenQuotes = new Set(), byId = new Map()
      let batch
      for (const quote of result.quotes) {
        if (!isTaskQuote(quote) || !remaining.delete(quote.agentId) || (batch && batch !== quote.recommendationId) ||
          (quote.quoteId && seenQuotes.has(quote.quoteId))) throw new Error('Invalid budget item')
        batch = quote.recommendationId
        if (quote.quoteId) seenQuotes.add(quote.quoteId)
        byId.set(quote.agentId, quote)
      }
      show('READY', byId)
    } catch (e) {
      if (!current()) return
      if (e?.status === 409) {
        show('REFRESHING')
        const loaded = await refreshDetail(task)
        if (current()) show(loaded ? 'STALE' : 'REFRESH_FAILED')
      } else show([401,403,404].includes(e?.status) ? 'INACCESSIBLE' : 'ERROR')
    } finally { if (controller === own) controller = null }
  }
  return { budget, requestBudgets, clearBudget }
}

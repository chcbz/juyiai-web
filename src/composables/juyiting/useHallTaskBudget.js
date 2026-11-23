import { ref } from 'vue'
import { resolveRequestId } from '../useRequestRum.js'
import { isTaskQuote, recommendationTaskKey } from './hallAssigneeRecommendation.js'

// One visible selection only. The server owns all prices, evidence and confirmation bindings.
export function useHallTaskBudget ({ api, getTask, identity, eligible, refreshDetail }) {
  const budget = ref({ state: 'IDLE' })
  let intent, controller
  function clearBudget () {
    intent = null
    controller?.abort()
    controller = null
    budget.value = { state: 'IDLE' }
  }
  async function requestBudget (task, agentId, mode = 'select') {
    if (!task || !agentId || recommendationTaskKey(task) !== recommendationTaskKey(getTask()) || !eligible(task, { agentId })) {
      clearBudget(); return
    }
    task = { id: task.id, taskVersion: task.taskVersion }
    const scope = identity()
    const key = JSON.stringify([scope, task.id, task.taskVersion, agentId])
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
    if (mode === 'renew' && !['AVAILABLE', 'UNAVAILABLE', 'STALE'].includes(budget.value.state)) return
    if (mode !== 'retry') {
      clearBudget()
      intent = { key, requestId: resolveRequestId(), idempotencyKey: resolveRequestId() }
    }
    const original = intent, own = new AbortController()
    controller = own
    const current = () => intent === original && !own.signal.aborted && identity() === scope &&
      recommendationTaskKey(task) === recommendationTaskKey(getTask())
    const show = (state, quote = null) => { budget.value = { state, agentId, taskId: task.id, taskVersion: task.taskVersion, quote } }
    show('LOADING')
    try {
      const result = await api.create(`/tasks/${encodeURIComponent(task.id)}/quotes`, { expectedTaskVersion: task.taskVersion, agentIds: [agentId] }, {
        autoLoading: false, signal: own.signal, headers: { 'Idempotency-Key': original.idempotencyKey, 'X-Request-Id': original.requestId }
      })
      if (!current()) return
      const quote = result?.quotes?.[0]
      if (result?.taskId !== task.id || result.taskVersion !== task.taskVersion || !Number.isSafeInteger(result.observedAt) || result.observedAt < 0 ||
        !Array.isArray(result.quotes) || result.quotes.length !== 1 || quote?.agentId !== agentId || !isTaskQuote(quote)) throw new Error('Invalid budget response')
      show(quote.state, quote)
    } catch (e) {
      if (!current()) return
      if (e?.status === 409) {
        show('REFRESHING')
        const loaded = await refreshDetail(task)
        if (current()) show(loaded ? 'STALE' : 'REFRESH_FAILED')
      } else show([401,403,404].includes(e?.status) ? 'INACCESSIBLE' : 'ERROR')
    } finally { if (controller === own) controller = null }
  }
  return { budget, requestBudget, clearBudget }
}

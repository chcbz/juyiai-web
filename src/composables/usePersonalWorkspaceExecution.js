import { computed, getCurrentInstance, onBeforeUnmount, ref, unref, watch } from 'vue'
import { createApi } from './useHttp.js'
import { registerIdentityCleanup } from '../utils/identityLifecycle.js'

const valueOf = value => typeof value === 'function' ? value() : unref(value)
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && value.trim() === value
const timestamp = value => Number.isSafeInteger(value) && value >= 0
const summary = value => value && id(value.executionId) && id(value.targetAgentId) && typeof value.state === 'string' && timestamp(value.createdAt)
const cursor = value => value == null || (timestamp(value.createdAt) && id(value.executionId))

// Historical facts only. No create, revoke, capability negotiation, recovery key,
// polling or provider execution is reachable from this module.
export function usePersonalWorkspaceExecutionHistory ({ api = createApi('/agent'), identityEpoch = 0, identityScope = identityEpoch } = {}) {
  const agents = ref([]), rosterState = ref('idle'), rosterError = ref(''), selectedAgentId = ref('')
  const history = ref([]), historyState = ref('idle'), historyError = ref(''), historyNextCursor = ref(null)
  const execution = ref(null), detailState = ref('idle'), error = ref('')
  const selectedAgent = computed(() => agents.value.find(agent => agent.agentId === selectedAgentId.value) || null)
  const identity = computed(() => `${valueOf(identityEpoch)}\u0000${valueOf(identityScope)}`)
  const controllers = new Set()
  let generation = 0, selection = 0, historyRead = 0, rosterRead = 0, disposed = false
  const reset = () => {
    generation++; selection++; historyRead++; rosterRead++
    for (const controller of controllers) controller.abort()
    controllers.clear()
    agents.value = []; selectedAgentId.value = ''; rosterState.value = 'idle'; rosterError.value = ''
    history.value = []; historyState.value = 'idle'; historyError.value = ''; historyNextCursor.value = null
    execution.value = null; detailState.value = 'idle'; error.value = ''
  }
  const request = async options => {
    const version = generation, owner = identity.value, controller = new AbortController()
    controllers.add(controller)
    try {
      const result = await api.execute({ ...options, autoLoading: false, needAuth: true, signal: controller.signal })
      if (disposed || generation !== version || identity.value !== owner || controller.signal.aborted) throw new DOMException('Identity changed', 'AbortError')
      return result
    } finally { controllers.delete(controller) }
  }
  const loadAgents = async () => {
    const sequence = ++rosterRead
    rosterState.value = 'loading'; rosterError.value = ''
    try {
      const value = await request({ url: '/roster', method: 'POST', data: { pageNum: 1, pageSize: 100 } })
      if (sequence !== rosterRead) return []
      const rows = Array.isArray(value) ? value : value?.items || value?.list || value?.records || value?.rows
      if (!Array.isArray(rows)) throw new Error('好汉名册返回无效')
      agents.value = rows.filter(row => id(row.agentId || row.id) && row.boundToMe === true && row.canOperate === true && !row.systemAgent)
        .map(row => ({ ...row, agentId: row.agentId || row.id, name: row.name || row.personaName || row.agentId || row.id }))
      if (!selectedAgent.value) selectedAgentId.value = ''
      rosterState.value = agents.value.length ? 'ready' : 'empty'
      return agents.value
    } catch (cause) {
      if (sequence === rosterRead && cause?.name !== 'AbortError') { rosterState.value = 'error'; rosterError.value = cause.message || '名册暂不可读' }
      return []
    }
  }
  const selectAgent = agentId => { if (!agents.value.some(agent => agent.agentId === agentId)) return false; selectedAgentId.value = agentId; return true }
  const loadHistory = async ({ beforeCreatedAt = null, beforeExecutionId = null, append = false } = {}) => {
    const sequence = ++historyRead
    historyState.value = 'loading'; historyError.value = ''
    const params = { limit: 20 }
    if (beforeCreatedAt !== null || beforeExecutionId !== null) {
      if (!timestamp(beforeCreatedAt) || !id(beforeExecutionId)) { historyState.value = 'error'; historyError.value = '历史游标无效'; return [] }
      Object.assign(params, { beforeCreatedAt, beforeExecutionId })
    }
    try {
      const value = await request({ url: '/personal-workspace/executions', method: 'GET', params })
      if (sequence !== historyRead) return []
      if (!Array.isArray(value?.items) || !value.items.every(summary) || !cursor(value.nextCursor)) throw new Error('历史记录返回无效')
      history.value = append ? [...history.value, ...value.items.filter(item => !history.value.some(previous => previous.executionId === item.executionId))] : value.items
      historyNextCursor.value = value.nextCursor || null; historyState.value = history.value.length ? 'ready' : 'empty'
      return history.value
    } catch (cause) {
      if (sequence === historyRead && cause?.name !== 'AbortError') { historyState.value = 'error'; historyError.value = cause.message || '历史暂不可读' }
      return []
    }
  }
  const selectHistoryExecution = async executionId => {
    if (!history.value.some(item => item.executionId === executionId)) return null
    const sequence = ++selection
    execution.value = null; detailState.value = 'loading'; error.value = ''
    try {
      const result = await request({ url: `/personal-workspace/executions/${encodeURIComponent(executionId)}`, method: 'GET' })
      if (sequence !== selection) return null
      if (result?.executionId !== executionId || typeof result.state !== 'string') throw new Error('历史详情返回无效')
      execution.value = result; detailState.value = 'ready'; return result
    } catch (cause) {
      if (sequence === selection && cause?.name !== 'AbortError') { detailState.value = 'error'; error.value = cause.message || '历史详情暂不可读' }
      return null
    }
  }
  const stopIdentity = watch(identity, reset, { flush: 'sync' })
  const unregister = registerIdentityCleanup(reset)
  const dispose = () => { if (disposed) return; disposed = true; stopIdentity(); unregister(); reset() }
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  return { agents, rosterState, rosterError, selectedAgentId, selectedAgent, loadAgents, selectAgent,
    history, historyState, historyError, historyNextCursor, loadHistory, execution, detailState, error, selectHistoryExecution, reset, dispose }
}

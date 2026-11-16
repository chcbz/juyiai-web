import { computed, shallowRef } from 'vue'

const randomKey = () => globalThis.crypto?.randomUUID?.() || `pws-${Date.now()}-${Math.random().toString(36).slice(2)}`
const pendingStates = new Set(['PREPARED', 'SENDING', 'UNKNOWN', 'PROCESSING'])
const sameInput = (left, right) => left.length === right.length && left.every((value, index) => value === right[index])
const rejectedCodes = new Set(['BAD_REQUEST', 'FILE_NOT_FOUND', 'METADATA_CHANGED', 'PRECONDITION_REQUIRED',
  'FILE_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'FILE_TYPE_UNSUPPORTED', 'TASK_FILE_LINK_NOT_FOUND', 'CONVERSATION_FILE_LINK_NOT_FOUND', 'TASK_FILE_LINK_CHANGED',
  'CONVERSATION_FILE_LINK_CHANGED', 'OUTPUT_LINK_MANAGED_BY_EXECUTION'])

/** Immutable intentions; only the page-return consumer opts into a pure-data checkpoint. */
export function usePersonalWorkspaceWriteIntent ({ persistence = null, parentKind = null } = {}) {
  const entries = new Map()
  const revision = shallowRef(0)
  let generation = 0
  const durable = () => persistence?.enabled?.() === true
  const saved = () => durable() ? (persistence.read() || []).filter(item => item.parentKind === parentKind) : []
  const persist = entry => {
    if (!durable() || !entry.descriptor) return
    const value = { ...entry.descriptor, key: entry.key, state: entry.state }
    const all = persistence.read() || []
    persistence.save([...all.filter(item => item.key !== entry.key), value])
  }
  const publish = () => { revision.value += 1 }
  const pending = computed(() => {
    void revision.value
    return [...new Map([...saved().map(item => ({ target: JSON.stringify([item.parentId, item.fileId]), label: item.action === 'CREATE' ? '添加资料' : '移除资料', state: item.state })), ...entries.values()].map(item => [item.target, item])).values()].filter(entry => pendingStates.has(entry.state))
      .map(({ target, label, state }) => ({ target, label, state }))
  })
  const attempt = entry => {
    if (entry.promise) return entry.promise
    const epoch = generation
    // A failed write/readback must prevent the network request entirely.
    try { persist(entry); entry.state = 'SENDING'; persist(entry) } catch (cause) { return Promise.reject(cause) }
    // Register before executing user code or the first await, including synchronous double clicks.
    entry.promise = Promise.resolve().then(async () => {
      try {
        if (epoch !== generation) return null
        const value = await entry.execute(entry.key, entry.attempts++ > 0)
        if (epoch !== generation) return null
        entry.state = 'COMMITTED'
        persist(entry)
        publish()
        // A known successful write must never become UNKNOWN because its follow-up GET failed.
        await entry.committed?.(value)
        return value
      } catch (caught) {
        let cause = caught
        if (epoch !== generation) return null
        if (entry.state !== 'COMMITTED') {
          entry.state = cause?.code === 'OPERATION_PROCESSING' ? 'PROCESSING'
            : rejectedCodes.has(cause?.code) && cause?.status >= 400 && cause?.status < 500 ? 'REJECTED' : 'UNKNOWN'
          try { persist(entry) } catch (saveError) { cause = saveError }
          publish()
        }
        throw cause
      } finally {
        entry.promise = null
        if (epoch === generation) {
          // Terminal records no longer need to retain File objects or request closures.
          if (!durable() && !pendingStates.has(entry.state) && entries.get(entry.target) === entry) entries.delete(entry.target)
          publish()
        }
      }
    })
    publish()
    return entry.promise
  }
  const run = ({ target, input, label, execute, committed, descriptor }) => {
    const existing = entries.get(target)
    const prior = existing && pendingStates.has(existing.state) ? existing : null
    if (prior) {
      if (!sameInput(prior.input, input)) {
        return Promise.reject(new Error('该目标有结果尚未确认的操作，请先重试，不要修改内容后重复提交。'))
      }
      return attempt(prior)
    }
    const original = saved().find(item => pendingStates.has(item.state) && JSON.stringify([item.parentId, item.fileId]) === target && item.action === descriptor?.action)
    const originalInput = original && (original.action === 'CREATE' ? ['CREATE', original.version, original.role] : ['DELETE', original.relationId, original.ifMatch])
    if (original && !sameInput(originalInput, input)) return Promise.reject(new Error('原操作输入已保存，请先核对原操作，不能更换输入重试。'))
    const entry = { target, input: [...input], label, execute, committed, descriptor, key: original?.key || randomKey(),
      state: original?.state || 'PREPARED', attempts: original ? 1 : 0, promise: null }
    entries.set(target, entry)
    return attempt(entry)
  }
  const retry = target => entries.has(target) ? attempt(entries.get(target)) : Promise.resolve(null)
  const clear = () => { generation += 1; entries.clear(); publish() }
  return { pending, run, retry, clear }
}

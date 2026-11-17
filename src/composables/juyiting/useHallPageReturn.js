import { computed, inject, nextTick, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue'
import { createPageReturnStore, returnScene, returnTarget, returnTargetKey, sameReturnDraft } from '../../utils/pageReturnState.js'
import { clearWechatReturnQuery, hasWechatImportReturn, resolveWechatImport } from '../../utils/miniProgramMaterialBridge.js'

export const hallPageReturnKey = Symbol('hall-page-return')
export const hallReturnReceiverKey = Symbol('hall-return-receiver')
const clone = value => JSON.parse(JSON.stringify(value))
const refKey = value => JSON.stringify([value.fileId, value.version])

/** Hall-scoped coordinator; no URL listeners, module-global active ID or automatic newest fallback. */
export function useHallPageReturn ({ host = window, owner, epoch, prepareTarget }) {
  const store = createPageReturnStore(host)
  const explicit = hasWechatImportReturn(host)
  const status = ref(explicit ? 'loading' : 'idle')
  const error = ref('')
  const record = shallowRef(null)
  const pending = shallowRef([])
  const receiver = shallowRef(null)
  let generation = 0, disposed = false, delivery = null, delivered = null
  const busy = computed(() => ['loading', 'conflict', 'error'].includes(status.value))
  const held = computed(() => status.value !== 'idle' && status.value !== 'finished')
  const report = cause => { error.value = cause?.message || '原现场恢复未完成，请重试。'; status.value = 'error' }
  const refreshPending = () => { try { pending.value = store.list(owner()) } catch (cause) { error.value = cause.message } }
  const matches = candidate => record.value && candidate && candidate.key() === returnTargetKey(record.value.owner, record.value.target)
  // The page is inert until restoration is accepted; reactive initialization is not an edit.
  const canPersist = candidate => !candidate.hydrating && candidate.ready() && !!candidate.key() && !busy.value && status.value !== 'waiting'
  const persist = (candidate, scene) => {
    if (!canPersist(candidate)) return
    const target = returnTarget(candidate.context()), identity = candidate.context().owner
    const old = store.source(identity, target)
    if (!old) return // This is not a whole-site draft persistence framework.
    if (candidate.revision && candidate.revision !== old.revision) throw new Error('当前草稿已在另一页面变化，请先核对，未覆盖。')
    const saved = store.saveSource(identity, target, { ...old, ...clone(scene) }, old.revision)
    candidate.revision = saved.revision
    if (matches(candidate) && record.value.phase === 'RESULT_ACCEPTED') {
      record.value = store.checkpoint(record.value, { ...returnScene(record.value), ...clone(scene), writeIntents: record.value.checkpoint?.writeIntents || scene.writeIntents || [], revision: saved.revision })
    }
    return saved
  }
  const deliver = async (force = false) => {
    const candidate = receiver.value, original = record.value, run = generation
    if (!matches(candidate) || !candidate.ready() || delivery || delivered?.candidate === candidate && delivered.run === run && !force || !original || ['error', 'conflict'].includes(status.value) && !force) return
    const current = () => !disposed && run === generation && receiver.value === candidate && matches(candidate)
    delivery = candidate
    candidate.hydrating = true
    try {
      const saved = store.source(original.owner, original.target)
      // A later accepted source owns text AND tentative removal state, even with a stale URL.
      let scene = saved?.acceptedRequestId === original.requestId ? saved : returnScene(original)
      if (['FINISHED', 'ABANDONED'].includes(original.phase)) scene = { ...scene, pickerOpen: false }
      const live = candidate.scene()
      const changedSource = saved && saved.revision !== original.sourceRevision && saved.acceptedRequestId !== original.requestId &&
        saved.revision !== original.checkpoint?.revision && !sameReturnDraft(saved, returnScene(original))
      const changedLive = live.draft && live.draft !== scene.draft
      if (!force && (changedSource || changedLive)) { status.value = 'conflict'; error.value = '当前草稿与离开前不同，请选择保留哪一份。'; return }
      if (!scene.resultApplied && !['FINISHED', 'ABANDONED'].includes(original.phase)) {
        scene = { ...scene, stagedSelection: [...new Map([...scene.stagedSelection, ...(original.result?.references || [])].map(item => [refKey(item), item])).values()],
          resultApplied: true, acceptedRequestId: original.requestId }
      }
      if (!current()) return
      await candidate.apply(clone(scene))
      if (!current() || status.value === 'error') return
      candidate.revision = saved?.revision || null
      // Persist merged scene before ACL reads. Unreadable fixed refs must survive refresh.
      if (!['FINISHED', 'ABANDONED'].includes(original.phase)) {
        record.value = store.checkpoint(record.value, scene)
        const source = store.saveSource(original.owner, original.target, { ...scene, activeRequestId: original.requestId }, saved?.revision || null)
        candidate.revision = source.revision
        record.value = store.checkpoint(record.value, { ...scene, revision: source.revision })
      }
      error.value = ''
      status.value = candidate.readOnly() ? 'readonly' : scene.pickerOpen ? 'ready' : 'finished'
      if (scene.pickerOpen && !candidate.readOnly()) {
        const opening = candidate.openPicker?.(scene)
        // Initialization is suppressed; edits during slow fixed-version reads are real edits.
        candidate.hydrating = false
        await opening
      }
      if (current()) delivered = { candidate, run }
    } catch (cause) { if (current()) report(cause) }
    finally { candidate.hydrating = false; delivery = null }
  }
  const start = async (id = null) => {
    const run = ++generation, identity = owner(), identityEpoch = epoch()
    const current = () => !disposed && run === generation && identity === owner() && identityEpoch === epoch()
    status.value = 'loading'; error.value = ''
    try {
      const value = id ? store.read(id, identity) : resolveWechatImport(host, identity)
      if (!value || value.supersededBy || store.source(identity, value.target)?.activeRequestId && store.source(identity, value.target).activeRequestId !== value.requestId) throw new Error('这次现场已结束或被后续选择替代。')
      record.value = value
      await prepareTarget(value, current)
      if (!current()) return
      status.value = 'waiting'
      await nextTick()
      await deliver()
    } catch (cause) { if (current()) report(cause) }
  }
  const leave = () => { generation++; record.value = null; status.value = 'idle'; error.value = ''; clearWechatReturnQuery(host); refreshPending() }
  const keepCurrent = async () => {
    const candidate = receiver.value
    if (!matches(candidate) || !candidate.ready()) { leave(); return }
    try {
      const old = store.source(owner(), record.value.target)
      const live = candidate.scene()
      const scene = candidate.dirty || live.draft ? live : old || live
      candidate.hydrating = true
      finish(candidate, scene, true, old?.revision || null)
      await candidate.apply(scene)
      leave()
    } catch (cause) { report(cause) }
    finally { candidate.hydrating = false }
  }
  const finish = (candidate, scene, cancelled = false, expectedRevision = candidate.revision) => {
    if (!matches(candidate)) return
    record.value = store.finish(record.value, scene, cancelled, expectedRevision)
    candidate.revision = store.source(record.value.owner, record.value.target)?.revision
    status.value = 'finished'; clearWechatReturnQuery(host); refreshPending()
  }
  const saveDraft = (draft, context) => {
    const candidate = receiver.value
    if (!candidate || !canPersist(candidate) || candidate.key() !== returnTargetKey(context.owner, returnTarget(context))) return
    candidate.dirty = true
    try { persist(candidate, { ...candidate.scene(), draft }) } catch (cause) { report(cause) }
  }
  const register = candidate => {
    receiver.value = candidate
    void nextTick(() => deliver())
    return () => { if (receiver.value === candidate) receiver.value = null }
  }
  watch([owner, epoch], () => { generation++; record.value = null; status.value = explicit ? 'error' : 'idle'; error.value = explicit ? '登录身份已变化，请重新读取原现场。' : ''; pending.value = [] }, { flush: 'sync' })
  const onStorage = event => {
    const candidate = receiver.value
    if (!candidate || !event.key?.startsWith('cyf:wechat-import:')) return
    try {
      const saved = store.source(candidate.context().owner, returnTarget(candidate.context()))
      if (saved && candidate.revision && saved.revision !== candidate.revision) { error.value = '其他页面已修改此草稿，未覆盖。'; status.value = 'conflict' }
    } catch (cause) { report(cause) }
  }
  host.addEventListener?.('storage', onStorage)
  onBeforeUnmount(() => { disposed = true; generation++; host.removeEventListener?.('storage', onStorage) })
  const api = { store, explicit, status, error, record, pending, busy, held, start, leave, keepCurrent, refreshPending, register, matches, canPersist, persist, finish, report, saveDraft,
    deliver, retry: () => record.value ? start(record.value.requestId) : start(), useRestored: () => deliver(true) }
  provide(hallPageReturnKey, api)
  return api
}

/** Scene ownership stays in the page. Scoped injection passes the same receiver through the three panel wrappers. */
export function useHallReturnReceiver ({ context, scene, apply, ready = () => true, readOnly = () => false }) {
  const coordinator = inject(hallPageReturnKey, null)
  const picker = shallowRef(null)
  const candidate = { context, scene: () => ({ ...(coordinator?.matches(candidate) ? returnScene(coordinator.record.value) : {}), ...scene(), ...(picker.value?.scene() || {}) }), apply: async value => { await apply(value); await nextTick() },
    ready, readOnly, hydrating: true, dirty: false, revision: null, key: () => { const value = context(); return value?.owner ? returnTargetKey(value.owner, returnTarget(value)) : '' },
    openPicker: value => picker.value?.restore(value) }
  const save = () => {
    if (!coordinator || !coordinator.canPersist(candidate)) return
    candidate.dirty = true
    try { coordinator.persist(candidate, candidate.scene()) } catch (cause) { coordinator.report(cause) }
  }
  let unregister = null, disposed = false, registration = 0
  watch(() => candidate.key(), async () => {
    const run = ++registration
    unregister?.(); candidate.hydrating = true; candidate.dirty = false; candidate.revision = null
    const key = candidate.key()
    await nextTick()
    if (disposed || run !== registration || key !== candidate.key()) return
    if (coordinator) {
      candidate.revision = coordinator.store.source(context().owner, returnTarget(context()))?.revision || null
      unregister = coordinator.register(candidate)
    }
    candidate.hydrating = false
  }, { immediate: true, flush: 'sync' })
  watch(() => scene(), save, { deep: true, flush: 'sync' })
  watch(() => [ready(), readOnly()], ([available, readonly]) => { if (available) void coordinator?.deliver(!readonly && coordinator?.status.value === 'readonly') })
  const api = { coordinator, candidate, picker, save,
    record: computed(() => coordinator?.matches(candidate) ? coordinator.record.value : null),
    restorePicker: () => { if (coordinator?.matches(candidate)) void coordinator.deliver() },
    finish: (value, cancelled) => coordinator?.finish(candidate, { ...candidate.scene(), ...value }, cancelled),
    intents: {
      read: () => api.record.value?.checkpoint?.writeIntents || [],
      save: intents => {
        if (!api.record.value) return
        const value = { ...returnScene(api.record.value), ...candidate.scene(), writeIntents: intents }
        coordinator.record.value = coordinator.store.checkpoint(api.record.value, value)
        coordinator.persist(candidate, value)
      },
      enabled: () => !!api.record.value && api.record.value.phase === 'RESULT_ACCEPTED'
    } }
  provide(hallReturnReceiverKey, api)
  onBeforeUnmount(() => { disposed = true; registration++; unregister?.(); candidate.hydrating = true })
  return api
}

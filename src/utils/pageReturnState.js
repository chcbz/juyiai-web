/* eslint-disable no-control-regex -- Protocol rejects control bytes in identifiers and bearer tokens. */
import { validMaterialVersion } from './personalWorkspaceProtocol.js'

export const PAGE_RETURN_PREFIX = 'cyf:wechat-import:'
export const PAGE_RETURN_AGE = 24 * 60 * 60 * 1000
export const returnId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
export const validReturnReference = item => item && typeof item.fileId === 'string' && item.fileId.length > 0 && item.fileId.length <= 100 && !/\s|[\x00-\x1f\x7f]/.test(item.fileId) && validMaterialVersion(item.version)
const refsValid = refs => Array.isArray(refs) && refs.length <= 32 && refs.every(validReturnReference)
export const returnRefs = refs => refs.map(({ fileId, version }) => ({ fileId, version }))
const clone = value => JSON.parse(JSON.stringify(value))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fail = message => { throw new Error(message) }
export const returnTarget = source => ({ kind: source.kind, mode: source.kind === 'chat' ? source.mode : null,
  conversationId: source.kind === 'chat' ? source.conversationId || null : null, taskId: source.kind === 'chat' ? source.taskId || null : null,
  agentId: source.kind === 'chat' ? source.agentId || null : null, surface: 'material-picker' })
export const returnTargetKey = (owner, target) => JSON.stringify([owner, target.kind, target.mode || null, target.conversationId || null, target.taskId || null, target.agentId || null, target.surface])
const validTarget = target => target?.surface === 'material-picker' && (target.kind === 'home' || target.kind === 'chat' &&
  ['public', 'private', 'bounty'].includes(target.mode) && typeof target.conversationId === 'string' && !!target.conversationId &&
  (target.mode !== 'bounty' || !!target.taskId) && (target.mode !== 'private' || !!target.agentId))
const discussionContext = value => ({ mentionAgentIds: Array.isArray(value?.mentionAgentIds) ? value.mentionAgentIds.filter(id => typeof id === 'string') : [],
  outgoingMetadata: { inputRefs: Array.isArray(value?.outgoingMetadata?.inputRefs) ? value.outgoingMetadata.inputRefs.filter(ref => typeof ref?.type === 'string' && typeof ref?.id === 'string').map(({ type, id }) => ({ type, id })) : [],
    ...Object.fromEntries(['libraryCitationId', 'librarySourceType'].filter(key => typeof value?.outgoingMetadata?.[key] === 'string').map(key => [key, value.outgoingMetadata[key]])) } })
export const returnSnapshot = (source, scope, selected, staged) => ({ draft: source.draft, scope,
  committedSelection: returnRefs(selected), stagedSelection: returnRefs(staged),
  materialContext: source.kind === 'chat' ? { typedMaterialScope: source.typedMaterialScope || 'TASK_DEFAULT', draftMaterialScope: source.draftMaterialScope || 'TASK_DEFAULT',
    typedSourceIds: source.typedSourceIds || [], draftSourceIds: source.draftSourceIds || [] } : null,
  discussionContext: source.kind === 'chat' ? discussionContext(source.discussionContext) : null })
const validIntent = item => item && returnId(item.key) && ['task', 'conversation'].includes(item.parentKind) && typeof item.parentId === 'string' && !!item.parentId &&
  validReturnReference(item) && ['CREATE', 'DELETE'].includes(item.action) && ['INPUT', 'REFERENCE'].includes(item.role) &&
  ['PREPARED', 'SENDING', 'UNKNOWN', 'PROCESSING', 'COMMITTED', 'REJECTED'].includes(item.state) &&
  (item.action !== 'DELETE' || typeof item.relationId === 'string' && !!item.relationId && typeof item.ifMatch === 'string' && !/[\r\n]/.test(item.ifMatch))
const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string')
const validContexts = scene => (!scene.materialContext || ['typedMaterialScope', 'draftMaterialScope'].every(key => ['TASK_DEFAULT', 'EXPLICIT', 'NONE'].includes(scene.materialContext[key])) && ['typedSourceIds', 'draftSourceIds'].every(key => ids(scene.materialContext[key]))) &&
  (!scene.discussionContext || ids(scene.discussionContext.mentionAgentIds) && Array.isArray(scene.discussionContext.outgoingMetadata?.inputRefs) && scene.discussionContext.outgoingMetadata.inputRefs.every(ref => typeof ref?.type === 'string' && typeof ref?.id === 'string'))
const validScene = scene => scene && validContexts(scene) && typeof scene.draft === 'string' && refsValid(scene.committedSelection) && refsValid(scene.stagedSelection) && (!scene.writeIntents || Array.isArray(scene.writeIntents) && scene.writeIntents.every(validIntent))
const phases = ['PREPARED', 'HANDED_OFF', 'RESULT_RECEIVED', 'RESULT_ACCEPTED', 'FINISHED', 'ABANDONED']
const statuses = ['complete', 'partial', 'cancelled', 'unconfirmed']
export const returnScene = record => record.checkpoint || { ...clone(record.snapshot), revision: record.sourceRevision,
  pickerOpen: true, resultApplied: false, acceptedRequestId: null, writeIntents: [], confirmation: 'idle' }

/** Small, local handoff store. Readback detects observable races; it is deliberately not a CAS. */
export function createPageReturnStore (host = window) {
  const now = () => Date.now()
  const uuid = () => host.crypto.randomUUID()
  const store = () => host.localStorage
  const key = id => PAGE_RETURN_PREFIX + id
  const draftKey = (owner, target) => PAGE_RETURN_PREFIX + 'draft:' + encodeURIComponent(returnTargetKey(owner, target))
  const readJSON = name => { const value = store().getItem(name); try { return value ? JSON.parse(value) : null } catch { return null } }
  const write = (name, value) => {
    const text = JSON.stringify(value)
    store().setItem(name, text)
    if (store().getItem(name) !== text) fail('本地现场保存冲突，请保留当前页面后重试。')
    return clone(value)
  }
  const live = value => Number.isFinite(value?.createdAt) && value.createdAt <= now() && now() - value.createdAt <= PAGE_RETURN_AGE && value.expiresAt > now()
  const source = (owner, target) => {
    const value = readJSON(draftKey(owner, target))
    return value?.version === 1 && value.owner === owner && live(value) && validScene(value) && validTarget(value.target) && returnId(value.revision) &&
      returnTargetKey(owner, value.target) === returnTargetKey(owner, target) ? value : null
  }
  const saveSource = (owner, target, scene, expectedRevision) => {
    const old = source(owner, target)
    if (expectedRevision !== undefined && (old?.revision || null) !== expectedRevision) fail('当前草稿已在其他页面修改，未覆盖。')
    if (!owner || !validTarget(target) || !validScene(scene)) fail('来源现场不完整，未保存。')
    const createdAt = old?.createdAt || now()
    return write(draftKey(owner, target), { ...clone(scene), version: 1, owner, target: clone(target), revision: uuid(), createdAt,
      expiresAt: old?.expiresAt || createdAt + PAGE_RETURN_AGE })
  }
  const read = (id, owner) => {
    if (!returnId(id) || !owner) return null
    let record = readJSON(key(id))
    // Legacy v0 is converted once; the v1 disk record intentionally has no top-level source.
    if (record && record.version === undefined && record.requestId === id && record.source?.owner === owner &&
      typeof record.source.draft === 'string' && typeof record.scope === 'string' && refsValid(record.selected) && refsValid(record.staged) &&
      Number.isInteger(record.remaining) && record.remaining > 0 && record.remaining + record.staged.length === 32 &&
      Number.isFinite(record.createdAt) && record.createdAt <= now() && now() - record.createdAt <= PAGE_RETURN_AGE && validTarget(returnTarget(record.source))) {
      record = { version: 1, requestId: id, operation: 'wechat.material.import', owner, createdAt: record.createdAt, expiresAt: record.createdAt + PAGE_RETURN_AGE,
        target: returnTarget(record.source), sourceRevision: uuid(), snapshot: returnSnapshot(record.source, record.scope, record.selected, record.staged),
        phase: 'HANDED_OFF', result: null, checkpoint: null, updatedAt: now(), supersededBy: null }
      write(key(id), record)
    }
    if (!record || record.version !== 1 || record.operation !== 'wechat.material.import' || record.requestId !== id || record.owner !== owner ||
      !live(record) || !validTarget(record.target) || !returnId(record.sourceRevision) || !validScene(record.snapshot) || typeof record.snapshot.scope !== 'string' ||
      record.snapshot.stagedSelection.length >= 32 || !phases.includes(record.phase) || record.checkpoint && !validScene(record.checkpoint) || record.result && (!statuses.includes(record.result.status) || !refsValid(record.result.references))) return null
    return record
  }
  const update = (record, patch) => {
    const actual = read(record.requestId, record.owner)
    if (!actual || !equal(actual, record)) fail('返回现场已变化，请重新读取，未覆盖原记录。')
    return write(key(record.requestId), { ...actual, ...clone(patch), updatedAt: now() })
  }
  const prepare = ({ source: context, scope, selected, staged, scene }) => {
    const owner = context.owner, target = returnTarget(context)
    if (!validTarget(target) || !owner || typeof scope !== 'string' || !scope || !refsValid(selected) || !refsValid(staged) || staged.length >= 32) fail('原页面上下文未就绪。')
    const previous = source(owner, target)
    const snapshot = returnSnapshot(context, scope, selected, staged)
    const revision = uuid(), requestId = uuid(), createdAt = now()
    if (!validScene(snapshot)) fail('原页面上下文不完整，未离开。')
    const prior = previous?.activeRequestId ? read(previous.activeRequestId, owner) : null
    if (prior?.checkpoint?.writeIntents?.some(intent => !['COMMITTED', 'REJECTED'].includes(intent.state))) fail('原关联结果尚未确认，请先核对。')
    const record = write(key(requestId), { version: 1, requestId, operation: 'wechat.material.import', owner, target, sourceRevision: revision,
      createdAt, expiresAt: createdAt + PAGE_RETURN_AGE, snapshot, phase: 'PREPARED', result: null, checkpoint: null, supersededBy: null, updatedAt: createdAt })
    write(draftKey(owner, target), { ...snapshot, ...clone(scene || {}), version: 1, owner, target, revision, createdAt, expiresAt: record.expiresAt,
      activeRequestId: requestId, acceptedRequestId: null, pickerOpen: true, writeIntents: [], confirmation: 'idle' })
    if (prior && prior.requestId !== requestId && !['FINISHED', 'ABANDONED'].includes(prior.phase)) update(prior, { phase: 'ABANDONED', supersededBy: requestId })
    return record
  }
  const receive = (record, result) => {
    if (!statuses.includes(result?.status) || !refsValid(result.references) || result.references.length > 32 - record.snapshot.stagedSelection.length) fail('微信返回参数无效。')
    const normalized = { status: result.status, references: returnRefs(result.references) }
    if (record.result && !equal(record.result, normalized)) fail('同一次返回包含不同结果，已保留首次结果。')
    if (record.supersededBy || source(record.owner, record.target)?.activeRequestId && source(record.owner, record.target).activeRequestId !== record.requestId) fail('这次返回已被后续选择替代，未覆盖当前现场。')
    return record.result ? record : update(record, { result: normalized, phase: 'RESULT_RECEIVED' })
  }
  const checkpoint = (record, scene) => {
    if (!validScene(scene)) fail('当前现场不完整，未保存。')
    return update(record, { checkpoint: clone(scene), phase: 'RESULT_ACCEPTED' })
  }
  const finish = (record, scene, cancelled = false, expectedRevision) => {
    if (!equal(read(record.requestId, record.owner), record) || record.supersededBy) fail('原现场已变化，未覆盖后续操作。')
    if ([...(record.checkpoint?.writeIntents || []), ...(scene.writeIntents || [])].some(intent => !['COMMITTED', 'REJECTED'].includes(intent.state))) fail('关联结果尚未确认，原现场仍保留。')
    const old = source(record.owner, record.target)
    if (old?.activeRequestId && old.activeRequestId !== record.requestId) fail('已有后续选择，未覆盖当前现场。')
    if (expectedRevision !== undefined ? (old?.revision || null) !== expectedRevision : old && old.revision !== record.sourceRevision && old.revision !== record.checkpoint?.revision && scene.revision !== old.revision) fail('当前草稿已变化，请先核对，未覆盖。')
    const saved = saveSource(record.owner, record.target, { ...scene, acceptedRequestId: record.requestId, activeRequestId: null, pickerOpen: false }, old?.revision || null)
    // Source acceptance is durable before terminal handoff. Keep terminal receipt until expiry.
    return update(record, { checkpoint: saved, phase: cancelled ? 'ABANDONED' : 'FINISHED' })
  }
  const list = owner => Object.keys(store()).filter(name => returnId(name.slice(PAGE_RETURN_PREFIX.length)) && name.startsWith(PAGE_RETURN_PREFIX))
    .map(name => read(name.slice(PAGE_RETURN_PREFIX.length), owner)).filter(value => value && !['FINISHED', 'ABANDONED'].includes(value.phase))
  return { uuid, read, update, source, saveSource, prepare, receive, checkpoint, finish, list }
}

/* eslint-disable no-control-regex -- Protocol rejects control bytes in identifiers and bearer tokens. */
import { ensureMiniProgramBridge, nativeOrientationFromLocation } from './miniProgramBridge.js'
import { inMiniProgram, validateReturnTarget } from './miniProgramFileBridge.js'
import { registerIdentityCleanup } from './identityLifecycle.js'
import { createPageReturnStore, returnScene, validReturnReference } from './pageReturnState.js'

const PREFIX = 'cyf:wechat-import:'
const KEYS = ['wechatImport', 'wechatFiles', 'wechatState']
export const validImportReference = validReturnReference
const storage = host => host.localStorage
export const clearWechatImport = (host, requestId) => {
  storage(host).removeItem(PREFIX + requestId)
  const url = new URL(host.location.href)
  if (url.searchParams.get('wechatImport') === requestId) {
    KEYS.forEach(key => url.searchParams.delete(key))
    try { host.history?.replaceState(host.history.state, '', url.href) } catch { /* consumed storage is authoritative; a stale URL cannot replay it */ }
  }
}
registerIdentityCleanup(() => {
  try {
    const host = globalThis.window
    const store = storage(host)
    for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key)
  } catch { /* storage can be disabled */ }
})
// Only an explicit callback changes startup. Pending records require a user action.
export const hasWechatImportReturn = host => {
  try { return KEYS.some(key => new URL(host.location.href).searchParams.has(key)) } catch { return false }
}
export const wechatReturnView = record => {
  const scene = returnScene(record)
  return { ...record, source: { ...record.target, owner: record.owner, draft: scene.draft,
    taskId: record.target.taskId || '', agentId: record.target.agentId || '', conversationId: record.target.conversationId || '',
    ...scene.materialContext, discussionContext: scene.discussionContext }, scope: record.snapshot.scope,
  selected: scene.committedSelection, staged: scene.stagedSelection,
  references: scene.resultApplied ? [] : record.result?.references || [], status: record.result?.status || 'unconfirmed' }
}
export const resolveWechatImport = (host, owner) => {
  const params = new URL(host.location.href).searchParams
  if (!params.has('wechatImport') || !params.has('wechatFiles') || !params.has('wechatState') || KEYS.some(key => params.getAll(key).length !== 1)) throw new Error('微信返回参数缺失或重复，原现场未被覆盖。')
  const store = createPageReturnStore(host)
  const record = store.read(params.get('wechatImport'), owner)
  if (!record) throw new Error('原现场不存在、已过期或不属于当前身份。')
  let references
  try { references = JSON.parse(params.get('wechatFiles')) } catch { throw new Error('微信返回资料格式无效。') }
  return store.receive(record, { status: params.get('wechatState'), references })
}
export const readWechatImport = (host, owner) => {
  try { return wechatReturnView(resolveWechatImport(host, owner)) } catch { return null }
}
export const clearWechatReturnQuery = host => {
  const url = new URL(host.location.href)
  KEYS.forEach(key => url.searchParams.delete(key))
  host.history?.replaceState(host.history.state, '', url.href)
}
export const requestWechatMaterials = async ({ host = window, token, webPolicy, source, scope, selected = [], staged = [], scene, getSource, getScene, isCurrent = () => true }) => {
  if (!inMiniProgram(host)) throw new Error('请在聚义微信小程序中使用微信选取。')
  if (!source?.owner || !['home', 'chat'].includes(source.kind) || typeof source.draft !== 'string' || typeof source.owner !== 'string' || typeof scope !== 'string' || !scope ||
      !Array.isArray(selected) || !Array.isArray(staged) || !selected.every(validImportReference) || !staged.every(validImportReference) || staged.length >= 32 || selected.length > 32 ||
      typeof token !== 'string' || !token.trim() || /[\x00-\x20\x7f]/.test(token)) throw new Error('身份或资料上下文未就绪，请稍后重试。')
  const current = () => { if (!isCurrent()) throw new DOMException('身份或页面已变化。', 'AbortError') }
  current()
  const url = new URL(host.location.href)
  KEYS.forEach(key => url.searchParams.delete(key))
  const returnUrl = validateReturnTarget(url.href, host.location.href, webPolicy)
  const bridge = await ensureMiniProgramBridge({ host, document: host.document })
  current()
  if (!bridge?.postMessage || !bridge?.redirectTo) throw new Error('当前小程序未提供微信资料桥接，请升级后重试。')
  const store = createPageReturnStore(host)
  source = JSON.parse(JSON.stringify(getSource?.() || source))
  const record = store.prepare({ source, scope, selected, staged, scene: getScene?.() || scene })
  const requestId = record.requestId
  const remaining = 32 - staged.length
  current()
  bridge.postMessage({ data: { protocolVersion: 1, requestId, messageType: 'file.import', data: { token, count: remaining, returnUrl } } })
  const orientation = nativeOrientationFromLocation(returnUrl) === 'landscape' ? 'landscape' : 'portrait'
  // Destruction flushes bindmessage; navigateTo alone is not a synchronous message channel.
  await new Promise((resolve, reject) => bridge.redirectTo({
    url: '/pages/import/index?requestId=' + requestId + '&returnUrl=' + encodeURIComponent(returnUrl) + '&returnLabel=' + encodeURIComponent('返回选择资料') + '&orientation=' + orientation,
    success: resolve,
    fail: () => { reject(new Error('微信资料页未能打开；原草稿保留。请确认已更新小程序。')) }
  }))
  // PREPARED remains recoverable if native destruction precedes this callback.
  const saved = store.read(requestId, source.owner)
  if (saved?.phase === 'PREPARED') store.update(saved, { phase: 'HANDED_OFF' })
  return requestId
}

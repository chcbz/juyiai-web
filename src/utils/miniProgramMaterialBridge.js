import { ensureMiniProgramBridge, nativeOrientationFromLocation } from './miniProgramBridge.js'
import { inMiniProgram, validateReturnTarget } from './miniProgramFileBridge.js'
import { registerIdentityCleanup } from './identityLifecycle.js'
import { validMaterialVersion } from './personalWorkspaceProtocol.js'

const PREFIX = 'cyf:wechat-import:'
const MAX_AGE = 24 * 60 * 60 * 1000
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const KEYS = ['wechatImport', 'wechatFiles', 'wechatState']
let activeResume = ''
export const validImportReference = item => item && typeof item.fileId === 'string' && item.fileId.length > 0 && item.fileId.length <= 100 &&
  !/\s|[\x00-\x1f\x7f]/.test(item.fileId) && validMaterialVersion(item.version)
const copyRefs = items => items.map(({ fileId, version }) => ({ fileId, version }))
const storage = host => host.localStorage
export const clearWechatImport = (host, requestId) => {
  storage(host).removeItem(PREFIX + requestId)
  if (activeResume === requestId) activeResume = ''
  const url = new URL(host.location.href)
  if (url.searchParams.get('wechatImport') === requestId) {
    KEYS.forEach(key => url.searchParams.delete(key))
    try { host.history?.replaceState(host.history.state, '', url.href) } catch { /* consumed storage is authoritative; a stale URL cannot replay it */ }
  }
}
registerIdentityCleanup(() => {
  activeResume = ''
  try {
    const host = globalThis.window
    const store = storage(host)
    for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key)
  } catch { /* storage can be disabled */ }
})
export const readWechatImport = (host, owner) => {
  const params = new URL(host.location.href).searchParams
  if (params.has('wechatImport') ? !params.has('wechatFiles') || !params.has('wechatState') : KEYS.some(key => params.has(key))) return null
  if (KEYS.some(key => params.getAll(key).length > 1)) return null
  let requestId = params.get('wechatImport')
  // A native system-back/app termination may not carry a callback URL. Only a
  // still-pending same-owner mini-program handoff can restore its original draft.
  if (!requestId && inMiniProgram(host)) {
    try {
      const store = storage(host)
      const candidates = Object.keys(store).filter(key => key.startsWith(PREFIX)).map(key => {
        try { return JSON.parse(store.getItem(key)) } catch { return null }
      }).filter(record => record?.source?.owner === owner && Date.now() - record.createdAt <= MAX_AGE)
      requestId = candidates.sort((a, b) => b.createdAt - a.createdAt)[0]?.requestId
    } catch { return null }
  }
  if (!ID.test(requestId || '')) return null
  let record, references
  try {
    record = JSON.parse(storage(host).getItem(PREFIX + requestId) || 'null')
    references = JSON.parse(params.get('wechatFiles') || '[]')
  } catch { return null }
  if (!record || record.requestId !== requestId || record.source?.owner !== owner || !owner ||
      !Number.isFinite(record.createdAt) || record.createdAt > Date.now() || Date.now() - record.createdAt > MAX_AGE ||
      !['home', 'chat'].includes(record.source.kind) || typeof record.source.draft !== 'string' ||
      typeof record.scope !== 'string' || !Array.isArray(record.selected) || !Array.isArray(record.staged) ||
      !Number.isInteger(record.remaining) || record.remaining < 1 || record.remaining + record.staged.length !== 32 ||
      record.selected.length > 32 || record.staged.length > 32 || !record.selected.every(validImportReference) || !record.staged.every(validImportReference) ||
      !Array.isArray(references) || references.length > record.remaining || !references.every(validImportReference) ||
      !['complete', 'cancelled', 'partial', 'unconfirmed'].includes(params.get('wechatState') || 'unconfirmed')) return null
  return { ...record, references: copyRefs(references), status: params.get('wechatState') || 'unconfirmed' }
}
export const activateWechatImport = (host, requestId) => {
  activeResume = requestId
  host.dispatchEvent(new host.Event('cyf:wechat-import-ready'))
}
export const isWechatImportActive = requestId => requestId === activeResume
export const requestWechatMaterials = async ({ host = window, token, webPolicy, source, scope, selected = [], staged = [], isCurrent = () => true }) => {
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
  const requestId = host.crypto.randomUUID()
  const remaining = 32 - staged.length
  const record = { requestId, createdAt: Date.now(), source, scope, selected: copyRefs(selected), staged: copyRefs(staged), remaining }
  // Fail before navigation if draft preservation is unavailable. Never persist the bearer.
  storage(host).setItem(PREFIX + requestId, JSON.stringify(record))
  if (storage(host).getItem(PREFIX + requestId) !== JSON.stringify(record)) throw new Error('无法保存原页面草稿，未打开微信选取。')
  current()
  bridge.postMessage({ data: { protocolVersion: 1, requestId, messageType: 'file.import', data: { token, count: remaining, returnUrl } } })
  const orientation = nativeOrientationFromLocation(returnUrl) === 'landscape' ? 'landscape' : 'portrait'
  // Destruction flushes bindmessage; navigateTo alone is not a synchronous message channel.
  await new Promise((resolve, reject) => bridge.redirectTo({
    url: '/pages/import/index?requestId=' + requestId + '&returnUrl=' + encodeURIComponent(returnUrl) + '&returnLabel=' + encodeURIComponent('返回选择资料') + '&orientation=' + orientation,
    success: resolve,
    fail: () => { storage(host).removeItem(PREFIX + requestId); reject(new Error('微信资料页未能打开；原草稿保留。请确认已更新小程序。')) }
  }))
  return requestId
}

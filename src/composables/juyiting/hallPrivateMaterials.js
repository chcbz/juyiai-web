import { validMaterialVersion } from './materialVersion.js'

// User-selected immutable versions only; never infer authority from conversation history.
export const freezePrivateMaterialRefs = (refs = [], conversationId = null) => {
  if (!Array.isArray(refs)) throw new TypeError('请选择有效的资料版本')
  const selected = new Map()
  for (const ref of refs) {
    let value
    if (ref?.kind === 'WORKSPACE_VERSION' && typeof ref.fileId === 'string' && ref.fileId && validMaterialVersion(ref.version)) {
      value = { kind: ref.kind, fileId: ref.fileId, version: ref.version }
    } else if (ref?.kind === 'CURRENT_CONVERSATION_ASSET' && conversationId && typeof ref.assetId === 'string' && ref.assetId &&
        typeof ref.revision === 'string' && /^[1-9][0-9]{0,18}$/.test(ref.revision) && BigInt(ref.revision) <= 9223372036854775807n) {
      value = { kind: ref.kind, assetId: ref.assetId, revision: ref.revision }
    } else {
      throw new TypeError('资料引用已失效，请重新选择固定版本')
    }
    const key = JSON.stringify(value)
    if (!selected.has(key)) selected.set(key, Object.freeze(value))
  }
  if (selected.size > 32) throw new TypeError('每条消息最多选择32份资料')
  return Object.freeze([...selected.values()])
}

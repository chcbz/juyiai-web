import { computed, onBeforeUnmount, shallowRef, ref, watch } from 'vue'
import { filePreviewKind, previewMime } from '../utils/filePreview.js'

export function useFilePreview (source) {
  const state = ref('idle')
  const message = ref('')
  const blob = shallowRef(null)
  const text = ref('')
  const url = ref('')
  const kind = computed(() => filePreviewKind(source.value?.mimeType, source.value?.filename))
  let generation = 0
  let controller = null
  function clear () {
    generation++
    controller?.abort()
    controller = null
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = ''; blob.value = null; text.value = ''; message.value = ''; state.value = 'idle'
  }
  async function load () {
    clear()
    const currentSource = source.value
    if (!currentSource?.key || typeof currentSource.load !== 'function') return
    if (!kind.value) { state.value = 'unsupported'; return }
    const current = generation
    const pending = new AbortController()
    controller = pending
    state.value = 'loading'
    try {
      const value = await currentSource.load({ signal: pending.signal })
      if (current !== generation || pending.signal.aborted) return
      if (!(value instanceof Blob)) throw new Error('文件内容响应无效。')
      const expected = previewMime(currentSource.mimeType)
      const actual = previewMime(value.type)
      if (expected && expected !== 'application/octet-stream' && actual && actual !== 'application/octet-stream' && actual !== expected) throw new Error('文件信息不一致，暂时无法预览。')
      const content = ['text', 'html', 'markdown'].includes(kind.value) ? await value.text() : ''
      if (current !== generation || pending.signal.aborted) return
      blob.value = value
      text.value = content
      if (['image', 'audio', 'video'].includes(kind.value)) url.value = URL.createObjectURL(value)
      if (content.includes('\ufffd')) message.value = '部分字符无法按UTF-8解码；原文件未被修改。'
      state.value = 'ready'
    } catch (error) {
      if (current !== generation || pending.signal.aborted || error?.name === 'AbortError') return
      message.value = [401, 403, 404].includes(error?.status) ? '当前身份或文件已不可访问。' : (error?.message || '原文件暂时无法预览。')
      state.value = 'error'
    } finally { if (current === generation) controller = null }
  }
  function fail (error) { clear(); message.value = typeof error === 'string' ? error : '浏览器无法展示此文件，原文件未被修改。'; state.value = 'error' }
  watch(() => source.value?.key, load, { immediate: true, flush: 'sync' })
  onBeforeUnmount(clear)
  return { state, message, blob, text, url, kind, load, fail }
}

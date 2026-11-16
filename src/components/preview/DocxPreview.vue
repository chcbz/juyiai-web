<template>
  <p v-if="loading" role="status">正在解析Word原文件…</p>
  <p v-else-if="error" role="alert">{{ error }}</p>
  <template v-else>
    <p class="docx-note">保留页式排版，窄屏可在文档内横向滚动；复杂对象可能无法完整展示。</p>
    <RichDocumentPreview :text="html" kind="docx" :title="title" />
  </template>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import RichDocumentPreview from '../outputs/RichDocumentPreview.vue'
import { assertOfficeContainer, normalizeEmbeddedImageMime } from '../../utils/filePreview.js'
const emit = defineEmits(['error'])
const props = defineProps({ blob: { type: Blob, required: true }, title: { type: String, default: '' } })
const html = ref(''); const loading = ref(false); const error = ref('')
watch(error, value => { if (value) emit('error', value) })
let generation = 0
watch(() => props.blob, async blob => {
  const current = ++generation
  html.value = ''; error.value = ''; loading.value = true
  try {
    const bytes = await blob.arrayBuffer()
    if (current !== generation) return
    assertOfficeContainer(bytes)
    const { renderAsync } = await import('docx-preview')
    if (current !== generation) return
    const body = document.createElement('div'); const styles = document.createElement('div')
    await renderAsync(bytes, body, styles, { renderAltChunks: false, ignoreFonts: true, useBase64URL: true })
    if (current !== generation) return
    normalizeEmbeddedImageMime(body)
    // Never attach untrusted output to the application DOM; existing sanitizer owns that boundary.
    html.value = styles.innerHTML + body.innerHTML
  } catch (cause) {
    if (current === generation) error.value = cause?.message?.startsWith('此文件采用') ? cause.message : 'Word原文件无法解析，可能已损坏或采用不支持的格式。'
  } finally { if (current === generation) loading.value = false }
}, { immediate: true })
onBeforeUnmount(() => { generation++; html.value = '' })
</script>
<style scoped>
.docx-note { color: var(--hall-text-muted, #68716b); font-size: 13px; }
</style>

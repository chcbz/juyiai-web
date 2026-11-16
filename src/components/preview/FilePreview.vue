<template>
  <section class="file-preview" :aria-label="source?.filename || '文件预览'">
    <p v-if="state === 'loading'" role="status">正在读取固定版本原文件…</p>
    <p v-else-if="state === 'unsupported'" role="status">此格式不支持在线预览。</p>
    <div v-else-if="state === 'ready'" :key="source.key" class="file-preview-content">
      <DocxPreview
        v-if="kind === 'docx'"
        :blob="blob"
        :title="source.filename"
        @error="fail"
      />
      <SpreadsheetPreview v-else-if="kind === 'xlsx'" :blob="blob" @error="fail" />
      <RichDocumentPreview
        v-else-if="kind === 'html' || kind === 'markdown'"
        :text="text"
        :kind="kind"
        :title="source.filename"
      />
      <PdfDocumentPreview v-else-if="kind === 'pdf'" :blob="blob" />
      <pre v-else-if="kind === 'text'" v-text="text || '文件内容为空。'"></pre>
      <button
        v-else-if="kind === 'image' && expandableImage"
        type="button"
        class="preview-image-button"
        aria-label="放大查看图片"
        @click="openImage"
      ><img :src="url" :alt="source.filename || '文件图片'" @error="fail" /></button>
      <img
        v-else-if="kind === 'image'"
        :src="url"
        :alt="source.filename || '文件图片'"
        @error="fail"
      />
      <audio
        v-else-if="kind === 'audio'"
        :src="url"
        controls
        controlslist="nodownload"
        preload="none"
        @error="fail"
      ></audio>
      <video
        v-else-if="kind === 'video'"
        :src="url"
        controls
        controlslist="nodownload"
        preload="none"
        @error="fail"
      ></video>
    </div>
    <Teleport to="body">
      <dialog
        v-if="expanded && state === 'ready' && kind === 'image'"
        ref="imageDialog"
        class="file-image-dialog"
        aria-label="放大查看图片"
        @cancel.prevent="closeImage"
        @click="closeImageOnBackdrop"
      >
        <button type="button" @click="closeImage">关闭</button>
        <img :src="url" :alt="source.filename || '文件图片'" @error="fail" />
      </dialog>
    </Teleport>
    <p v-if="message" :role="state === 'error' ? 'alert' : 'status'">{{ message }}</p>
    <button v-if="state === 'error'" type="button" @click="load">重新读取此版本</button>
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onErrorCaptured, ref, watch } from 'vue'
import { useFilePreview } from '../../composables/useFilePreview.js'
import RichDocumentPreview from '../outputs/RichDocumentPreview.vue'
const DocxPreview = defineAsyncComponent(() => import('./DocxPreview.vue'))
const SpreadsheetPreview = defineAsyncComponent(() => import('./SpreadsheetPreview.vue'))
const PdfDocumentPreview = defineAsyncComponent(() => import('../workspace/PdfDocumentPreview.vue'))
const props = defineProps({ source: { type: Object, default: null }, expandableImage: { type: Boolean, default: false } })
const { state, message, blob, text, url, kind, load, fail } = useFilePreview(computed(() => props.source))
const expanded = ref(false)
const imageDialog = ref(null)
let returnFocus = null
const closeImage = () => {
  expanded.value = false
  if (returnFocus?.isConnected) returnFocus.focus()
  returnFocus = null
}
const closeImageOnBackdrop = event => { if (event.target === imageDialog.value) closeImage() }
const openImage = async () => {
  returnFocus = document.activeElement
  expanded.value = true
  await nextTick()
  if (!expanded.value) return
  imageDialog.value?.showModal?.()
  imageDialog.value?.querySelector('button')?.focus()
}
watch([() => props.source?.key, state], closeImage, { flush: 'sync' })
onBeforeUnmount(closeImage)
// Lazy chunk failures are recoverable at the same fixed-version read boundary.
onErrorCaptured(() => { fail(); return false })
</script>
<style scoped>
.file-preview { width: 100%; min-width: 0; max-width: 100%; overflow: hidden; }
.file-preview-content { min-width: 0; }
.file-preview pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.file-preview img,.file-preview video { display: block; max-width: 100%; max-height: 60dvh; object-fit: contain; }
.file-preview audio { max-width: 100%; }
.file-preview p { color: var(--hall-text-muted, #68716b); font-size: 13px; }
.file-preview button { min-height: 44px; font: inherit; }
.preview-image-button { display: block; max-width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
.preview-image-button:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: 2px; }
.file-image-dialog { box-sizing: border-box; width: min(960px, calc(100vw - 32px)); max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); padding: 16px; border: 1px solid var(--hall-border, #e3e5dc); border-radius: 12px; background: var(--hall-surface, #fffefa); }
.file-image-dialog::backdrop { background: #242e2baa; }
.file-image-dialog img { display: block; max-width: 100%; max-height: 80dvh; margin: auto; object-fit: contain; }
.file-image-dialog button { min-height: 44px; font: inherit; }
</style>

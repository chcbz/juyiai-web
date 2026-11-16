<template>
  <span class="material-thumbnail" aria-hidden="true">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      alt=""
      @error="fail"
    />
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    ><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6" /></svg>
  </span>
</template>

<script setup>
import { computed, watch } from 'vue'
import { usePersonalWorkspace } from '@/composables/usePersonalWorkspace'
import { useFilePreview } from '../../composables/useFilePreview.js'
import { filePreviewKind } from '../../utils/filePreview.js'

const props = defineProps({
  fileId: { type: String, required: true },
  version: { type: String, required: true },
  identityKey: { type: String, required: true }
})
// This card owns its source/URL; opening another viewer cannot revoke it.
const context = computed(() => JSON.stringify([props.identityKey, props.fileId, props.version]))
const workspace = usePersonalWorkspace({ identityEpoch: context })
const source = computed(() => workspace.preview.value?.source || null)
const { url: imageUrl, fail } = useFilePreview(source)
watch(context, async key => {
  const detail = await workspace.select(props.fileId)
  if (key !== context.value) return
  const version = detail?.versions?.find(item => String(item.version) === props.version)
  if (filePreviewKind(version?.contentMimeType, version?.originalFilename) === 'image') {
    await workspace.previewVersion(props.version)
  }
}, { immediate: true, flush: 'sync' })
</script>

<style scoped>
.material-thumbnail { display: flex; align-items: center; justify-content: center; flex: 0 0 40px; width: 40px; height: 40px; background: var(--hall-surface-muted, #f5f4f0); border-radius: 6px; }
.material-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
.material-thumbnail svg { width: 24px; height: 24px; }
</style>

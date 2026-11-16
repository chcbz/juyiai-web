<template>
  <section v-if="item" class="output-preview" :aria-label="`${item.title} 预览`">
    <FilePreview :source="source" />
  </section>
</template>
<script setup>
import { computed } from 'vue'
import FilePreview from '../preview/FilePreview.vue'
const props = defineProps({ item: { type: Object, default: null }, load: { type: Function, required: true }, contextKey: { type: String, default: '' } })
const source = computed(() => {
  const item = props.item
  if (!item) return null
  return {
    key: JSON.stringify([props.contextKey, item.artifactId, item.artifactVersion, item.fileRef?.fileId, item.fileRef?.fileVersion]),
    filename: item.filename || item.title,
    mimeType: item.mimeType,
    load: ({ signal }) => props.load(item, { signal })
  }
})
</script>
<style scoped>
.output-preview { margin-top: 8px; max-height: 60dvh; overflow: auto; padding: 8px; min-width: 0; background: var(--hall-surface, #fffefa); }
</style>

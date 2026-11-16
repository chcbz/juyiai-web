<template>
  <section class="private-discussion-panel discussion-panel">
    <ChatPanel
      ref="chatPanel"
      discussion-variant="private"
      empty-text="可以向这位好汉提问或讨论想法。"
      placeholder="向这位好汉提问或讨论想法…"
      :show-target-picker="false"
      :subtitle="privateSubtitle"
      title="密议"
      v-bind="props"
      @restore-discussion-context="$emit('restore-discussion-context', $event)"
      @update:draft="$emit('update:draft', $event)"
      @cancel-deliberation="$emit('cancel-deliberation', $event)"
      @clear-target="$emit('clear-target', $event)"
      @delete-conversation="$emit('delete-conversation', $event)"
      @load-history="$emit('load-history')"
      @load-more-history="$emit('load-more-history')"
      @load-older-messages="$emit('load-older-messages')"
      @retain-message-windows="$emit('retain-message-windows', $event)"
      @load-message-window="$emit('load-message-window', $event)"
      @load-messages="$emit('load-messages')"
      @mention-agent="$emit('mention-agent', $event)"
      @new-conversation="$emit('new-conversation')"
      @open-workspace="$emit('open-workspace')"
      @retry-conversation="$emit('retry-conversation')"
      @select-conversation="$emit('select-conversation', $event)"
      @send-message="$emit('send-message', $event)"
      @update:material-refs="$emit('update:material-refs', $event)"
      @voice-apply="$emit('voice-apply', $event)"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import ChatPanel from './ChatPanel.vue'
import { discussionPanelProps, discussionPanelEmits } from './discussionPanelContract.js'

const props = defineProps(discussionPanelProps)

defineEmits(discussionPanelEmits)
const chatPanel = ref(null)
defineExpose({
  materialDraft: () => chatPanel.value?.materialDraft(),
  prepareMaterialDraft: inputs => chatPanel.value?.prepareMaterialDraft(inputs),
  applyMaterialDraft: inputs => chatPanel.value?.applyMaterialDraft(inputs)
})

const privateSubtitle = computed(() => {
  return props.targetText || '当前好汉'
})

</script>

<style scoped>
.discussion-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: #fffaf0;
}

</style>

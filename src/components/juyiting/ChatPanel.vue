<template>
  <div class="chat-panel discussion-surface" :class="`discussion-${discussionVariant}`">
    <div class="panel-toolbar">
      <div class="context-summary">
        <strong>{{ title }}</strong>
        <small>{{ resolvedSubtitle }}</small>
        <em>{{ displayStatus }}</em>
      </div>
      <div class="toolbar-actions">
        <slot name="toolbar-actions"></slot>
        <button
          class="icon-button hall-tool"
          type="button"
          title="刷新议事记录"
          aria-label="刷新议事记录"
          :disabled="conversationBusy || voice?.voiceInteractionLocked"
          @click="$emit('load-messages')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          ><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2" /></svg>
        </button>
        <button
          ref="historyButtonRef"
          class="icon-button hall-tool"
          type="button"
          title="议事记录"
          aria-label="议事记录"
          :aria-expanded="historyOpen ? 'true' : 'false'"
          :disabled="Boolean(conversationHistoryDeletingId) || voice?.voiceInteractionLocked"
          @click="toggleHistory"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          ><path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2" /></svg>
        </button>
        <button
          v-if="!serverTaskCompleted && !isTaskDiscussion"
          class="icon-button primary hall-tool"
          type="button"
          title="新对话"
          aria-label="新对话"
          :disabled="conversationBusy || voice?.voiceInteractionLocked"
          @click="$emit('new-conversation')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          ><path d="M12 5v14M5 12h14" /></svg>
        </button>

      </div>
    </div>



    <slot name="after-toolbar"></slot>
    <HallConversationHistory
      v-if="historyOpen"
      ref="historyRef"
      :dismiss-trigger="historyButtonRef"
      :conversations="conversationHistory"
      :read-only="serverTaskCompleted || isTaskDiscussion"
      :deleting-id="conversationHistoryDeletingId"
      :disabled="conversationBusy || voice?.voiceInteractionLocked"
      :error="conversationHistoryError"
      :has-more="conversationHistoryHasMore"
      :loading="conversationHistoryLoading"
      :selected-id="conversationId"
      @dismiss="closeHistory"
      @delete="!serverTaskCompleted && !isTaskDiscussion && $emit('delete-conversation', $event)"
      @load-more="$emit('load-more-history')"
      @select="$emit('select-conversation', $event)"
    />

    <div v-if="conversationLoadError" class="conversation-load-error" role="alert">
      <span>{{ conversationLoadError }}</span>
      <button type="button" :disabled="conversationBusy || voice?.voiceInteractionLocked" @click="$emit('retry-conversation')">重试</button>
    </div>

    <div ref="messageBoxRef" class="hall-messages" @scroll.passive="trackMessageScroll">
      <div v-if="messagePageHasMore || messagePageError" class="message-history-page">
        <button type="button" :disabled="messagePageLoading" @click="loadOlderMessages">
          {{ messagePageLoading ? '正在加载…' : messagePageError ? '重试加载更早消息' : '加载更早消息' }}
        </button>
        <p v-if="messagePageError" role="alert">{{ messagePageError }}</p>
      </div>
      <HallMessageWindow
        :pages="messageWindows"
        :messages="displayedMessages"
        :pinned-ids="pinnedHistoryMessageIds"
        :scroller="messageBoxRef"
        :scope="`${materialIdentityKey}\u0000${conversationId}`"
        :loading="messageWindowLoading"
        :errors="messageWindowErrors"
        @retain="$emit('retain-message-windows', $event)"
        @load="$emit('load-message-window', $event)"
      >
        <template #default="{ message }">
          <div
            class="hall-message"
            :class="[message.sender, { 'is-streaming': message.streaming }]"
          >
            <div class="message-head">
              <strong>{{ senderText(message) }}</strong>
              <span v-if="message.streaming" class="message-state">正在回复…</span>
            </div>
            <div
              v-if="discussionReplyStatus(message)"
              class="discussion-turn-progress"
              role="status"
              aria-live="polite"
            >
              <span>{{ discussionReplyStatus(message) }}</span>
            </div>
            <p v-if="message.typedDisplayUnavailable" role="status">结构化成果暂不可用，原回复正文仍可阅读。</p>
            <p v-if="message.turnAwaitingType && !message.streaming" role="status">正在读取答复…</p>
            <div v-if="discussionMessageText(message)" class="message-content" v-html="renderMarkdown(discussionMessageText(message))"></div>
            <div v-if="isTaskDiscussion && message.typedTaskId === taskId && message.typedSourceSelectors?.length" class="message-parts" aria-label="本条消息资料">
              <article v-for="(source, index) in message.typedSourceSelectors" :key="index" class="task-material-reference">
                <template v-if="source.kind === 'TASK_LINKED_WORKSPACE_VERSION'">
                  <strong>{{ materialName(source) }}</strong><span>版本 {{ source.version }} · {{ source.purpose === 'INPUT' ? '输入资料' : '参考资料' }}</span>
                </template>
                <template v-else><strong>会话资料</strong><span>修订 {{ source.assetRevision }}</span></template>
              </article>
            </div>
            <BountyTextSelectionArchive
              v-if="isTaskDiscussion && discussionMessageText(message)"
              :conversation-id="conversationId"
              :identity-key="materialIdentityKey"
              :message="message.turnOriginal || message"
            />
            <template v-for="delivery in message.turnDeliveries || []" :key="delivery.localId">
              <div v-if="discussionDeliveryText(delivery)" class="message-content" v-html="renderMarkdown(discussionDeliveryText(delivery))"></div>
              <BountyTextSelectionArchive
                v-if="discussionDeliveryText(delivery)"
                :conversation-id="conversationId"
                :identity-key="materialIdentityKey"
                :message="delivery.turnOriginal || delivery"
              />
            </template>
            <HallMessageParts
              :discussion-variant="discussionVariant"
              :parts="message.parts"
              :conversation-id="conversationId"
              :identity-key="materialIdentityKey"
              :identity-scope="identityScope"
            >
              <template #output-actions="{ part }">
                <button
                  v-if="canReviewMessageOutputs && outputForPart(message, part)"
                  type="button"
                  class="message-output-accept"
                  :disabled="outputReviewBusy || conversationBusy || voice?.voiceInteractionLocked"
                  @click="reviewMessageOutput(outputForPart(message, part))"
                >验收此版</button>
              </template>
            </HallMessageParts>
            <div
              v-for="output in textOutputsFor(message)"
              :key="`${output.requestId}:${output.messageSource.turnId}:${output.messageSource.messageId}`"
              class="message-output-actions"
              role="group"
              aria-label="文字成果操作"
            >
              <button
                type="button"
                aria-label="预览文字成果"
                title="预览文字成果"
                @click="textOutputPreview = output"
              >预览</button>
              <button
                v-if="canReviewMessageOutputs"
                type="button"
                class="message-output-accept"
                :disabled="outputReviewBusy || conversationBusy || voice?.voiceInteractionLocked"
                @click="reviewMessageOutput(output)"
              >验收此版</button>
            </div>
            <BountyTypedOutcomeCard
              v-for="projection in typedForMessage(message)"
              :key="projection.key"
              :projection="projection"
              :body-rendered="typedBodyRendered(message, projection)"
              :read-only="serverTaskCompleted"
              @reply="!serverTaskCompleted && $emit('typed-reply', $event)"
            />
            <slot name="turn-actions" :request-ids="message.turnRequestIds || []"></slot>
            <small v-if="message.statusText && !message.turnProjections?.length && !message.turnControlRequest && !message.turnActionRequest && !message.turnAwaitingType" class="message-status">{{ message.statusText }}</small>
          </div>
        </template>
      </HallMessageWindow>
      <slot name="bounty-results"></slot>
      <p v-if="discussionFooterStatus(deliberationStatus, isTaskDiscussion) && !serverTaskCompleted" class="deliberation-status" :role="deliberationStatus.startsWith('停止失败') ? 'alert' : 'status'">{{ deliberationStatus }}</p>
      <div v-if="isAwaitingReply && !serverTaskCompleted" class="hall-message SYSTEM is-pending">
        <strong>{{ pendingAuthor }}</strong>
        <div class="message-content" v-html="renderMarkdown(pendingLabel)"></div>
      </div>
      <div v-if="!messages.length && !messageWindows.length" class="empty-list">{{ emptyText }}</div>


    </div>

    <button
      v-if="hasUnseenMessages"
      type="button"
      class="new-messages-button"
      @click="followLatestMessages"
    >查看新消息 ↓</button>

    <Teleport to="body">
      <dialog
        v-if="textOutputPreview"
        ref="textOutputDialog"
        class="message-output-preview"
        aria-label="文字成果预览"
        @cancel.prevent="textOutputPreview = null"
        @click="closeTextOutputPreview"
      >
        <header><strong>文字成果预览</strong><button type="button" aria-label="关闭预览" @click="textOutputPreview = null">×</button></header>
        <pre>{{ textOutputPreview.text }}</pre>
      </dialog>
    </Teleport>
    <HallChatComposer
      v-if="!serverTaskCompleted"
      ref="composerRef"
      :compact="discussionVariant === 'bounty'"
      :agents="agents"
      :durable-cancel-target="durableCancelTarget"
      :reply-cancellation-state="replyCancellationState"
      :discussion-variant="discussionVariant"
      :draft="draft"
      :has-typed-attachments="typedEnabled && discussionVariant === 'bounty' && typedSourceSelectors.length > 0"
      :interaction-locked="conversationBusy || serverTaskCompleted || materialSelectionBusy || materialActionBusy || materialUploadBusy"
      :send-blocked="materialWriteUnresolved || materialUploadPending || pendingMaterials.length > 0"
      :actions-disabled="serverTaskCompleted"
      :is-awaiting-reply="isAwaitingReply"
      :is-streaming="isStreaming"
      :mention-label="mentionLabel"
      :placeholder="placeholder"
      :selected-agent="selectedAgent"
      :target-text="targetText"
      :typed-pending-question="typedPendingQuestion"
      :context-key="`${materialIdentityKey}\u0000${taskId}\u0000${conversationId}`"
      :voice="voice"
      :materials-open="materialPickerOpen"
      @cancel-deliberation="$emit('cancel-deliberation', $event)"
      @clear-target="$emit('clear-target', $event)"
      @mention-agent="$emit('mention-agent', $event)"
      @send-message="$emit('send-message', isPrivateDiscussion ? { materialRefs: privateMaterialRefs } : typedEnabled && discussionVariant === 'bounty' ? { sourceSelectors: typedSourceSelectors, materialScope: typedMaterialScope } : undefined)"
      @update:draft="$emit('update:draft', $event)"
      @voice-apply="$emit('voice-apply', $event)"
      @open-tools="closeHistory"
      @close-materials="materialPickerOpen = false"
      @open-materials="toggleMaterialPicker"
      :wechat-available="workspace.wechatSupported === true && Boolean(conversationId)"
      @import-wechat="importWechatMaterials"
      @import-images="importMaterialImages"
    >
      <template #attachments>
        <div
          v-if="composerMaterials.length"
          class="composer-attachment-strip"
          tabindex="0"
          aria-label="已选资料，可横向滚动"
        >
          <article v-for="link in composerMaterials" :key="`${link.fileId}:${link.version}`" class="composer-attachment-card">
            <HallMaterialThumbnail :file-id="link.fileId" :version="link.version" :identity-key="materialIdentityKey" />
            <span class="composer-attachment-name"><strong :title="materialName(link)">{{ materialName(link) }}</strong><small>固定版本 v{{ link.version }}</small></span>
            <button
              type="button"
              :aria-label="`预览 ${materialName(link)}`"
              class="hall-tool"
              :title="`预览 ${materialName(link)}`"
              @click="previewMaterial(link)"
            ><svg
              class="hall-control-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            ><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button>
            <button
              type="button"
              :disabled="materialSelectionBusy || materialActionBusy || materialUploadBusy || conversationBusy || serverTaskCompleted"
              :aria-label="`移除 ${materialName(link)}`"
              class="hall-tool"
              :title="`移除 ${materialName(link)}`"
              @click="removeMaterialReference(link)"
            ><svg
              class="hall-control-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            ><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          </article>
        </div>
      </template>
      <template #materials>
        <p v-if="materialPickerLoading" class="material-reference-state" role="status">正在读取资料…</p>
        <HallMaterialPicker
          v-if="!serverTaskCompleted"
          ref="materialPickerRef"
          dialog-only
          :model-value="pickerMaterials"
          :identity-epoch="identityEpoch"
          :wechat-context="wechatContext"
          :wechat-disabled="materialWriteUnresolved || materialUploadPending || pendingMaterials.length > 0 || Boolean(voice?.voiceInteractionLocked) || isStreaming || isAwaitingReply"
          :confirm-selection="completeMaterials"
          @restore-wechat-draft="emit('update:draft', $event)"
          @restore-wechat-context="restoreWechatMaterialContext"
          :identity-scope="`${identityScope}\u0000${taskId}\u0000${conversationId}`"
          :enabled="hasMaterialScope && !serverTaskCompleted"
          :disabled="materialSelectionBusy || materialActionBusy || conversationBusy || serverTaskCompleted"
          @import-materials="attachMaterials"
          @upload-busy="materialUploadBusy = $event"
          @upload-pending="materialUploadPending = $event"
        >
          <template #context>
            <WorkspaceWriteRecovery :pending="selectedMaterialDirectory.pendingWrites.value" @retry="selectedMaterialDirectory.retryWrite" />
            <p v-if="selectedMaterialDirectory.writeNotice.value" role="status">{{ selectedMaterialDirectory.writeNotice.value }}</p>
            <p v-if="materialError" class="material-reference-error" role="alert">{{ materialError }}</p>
            <details v-if="isTaskDiscussion" class="material-use-settings">
              <summary>本事项资料与使用范围<span v-if="activeMaterialLinks.length"> · {{ activeMaterialLinks.length }} 份</span></summary>
              <label v-if="typedEnabled" class="typed-material-scope">资料范围
                <select v-model="draftMaterialScope" aria-label="资料范围">
                  <option value="TASK_DEFAULT">本事项资料</option>
                  <option value="EXPLICIT">仅本条消息</option>
                  <option value="NONE">本条消息不附带资料</option>
                </select>
              </label>
              <p v-if="!activeMaterialLinks.length" class="material-reference-state">暂未关联资料，可在下方选择或上传。</p>
              <ul v-else class="material-use-list">
                <li v-for="link in activeMaterialLinks" :key="link.relationId || `${link.fileId}:${link.version}`">
                  <label v-if="typedEnabled && draftMaterialScope === 'EXPLICIT'">
                    <input type="checkbox" :checked="draftSourceIds.has(`${link.fileId}\u0000${link.version}`)" @change="toggleDraftSource(link, $event.target.checked)" />
                    {{ materialName(link) }} · v{{ link.version }}
                  </label>
                  <span v-else>{{ materialName(link) }} · v{{ link.version }}</span>
                </li>
              </ul>
              <p class="material-reference-notice">完成后应用本次选择；取消不改变原有资料与使用范围。</p>
            </details>
          </template>
        </HallMaterialPicker>
        <div v-if="materialSelectionBusy || pendingMaterials.length" class="material-link-status" role="status">
          <span v-if="materialSelectionBusy">正在关联所选资料…</span>
          <template v-else>
            <span>部分资料尚未关联，已有选择保留。</span>
            <button type="button" @click="toggleMaterialPicker">查看并继续</button>
          </template>
        </div>
        <p v-if="materialPickerOpen && !hasMaterialScope" class="material-reference-notice" role="status">{{ isTaskDiscussion ? '未确认当前事项标识，不能读取或展示资料。' : '请先发送一条消息建立议事，再从资料中选择引用。' }}</p>
        <p v-if="materialError" class="material-reference-error" role="alert">{{ materialError }}</p>
        <WorkspaceWriteRecovery :pending="selectedMaterialDirectory.pendingWrites.value" @retry="selectedMaterialDirectory.retryWrite" />
        <p v-if="selectedMaterialDirectory.writeNotice.value" role="status">{{ selectedMaterialDirectory.writeNotice.value }}</p>
      </template>
    </HallChatComposer>
  </div>
</template>

<script setup>
import { useHallReturnReceiver } from '../../composables/juyiting/useHallPageReturn.js'
import { returnSnapshot } from '../../utils/pageReturnState.js'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import HallMessageParts from './HallMessageParts.vue'
import HallMessageWindow from './HallMessageWindow.vue'
import { projectHallTask } from '../../composables/juyiting/hallTaskPresentation.js'
import BountyTextSelectionArchive from './BountyTextSelectionArchive.vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import HallChatComposer from './HallChatComposer.vue'
import HallMaterialPicker from './HallMaterialPicker.vue'
import HallMaterialThumbnail from './HallMaterialThumbnail.vue'
import HallConversationHistory from './HallConversationHistory.vue'
import BountyTypedOutcomeCard from './BountyTypedOutcomeCard.vue'
import { discussionTurns, discussionDeliveryText, discussionReplyStatus, discussionMessageText, discussionFooterStatus } from '../../composables/juyiting/hallDiscussionTurns.js'
import WorkspaceWriteRecovery from '../personal-workspace/WorkspaceWriteRecovery.vue'
import { usePersonalWorkspace } from '../../composables/usePersonalWorkspace.js'
import { usePersonalWorkspaceConversationLinks } from '../../composables/usePersonalWorkspaceConversationLinks.js'
import { usePersonalWorkspaceTaskLinks } from '../../composables/usePersonalWorkspaceTaskLinks.js'

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  sanitize: false
})

const props = defineProps({
  agents: { type: Array, default: () => [] },
  connectionStatus: { type: String, default: '' },
  conversationHistory: { type: Array, default: () => [] },
  conversationHistoryDeletingId: { type: String, default: '' },
  conversationHistoryError: { type: String, default: '' },
  conversationHistoryHasMore: { type: Boolean, default: false },
  conversationHistoryLoading: { type: Boolean, default: false },
  conversationLoadError: { type: String, default: '' },
  conversationBusy: { type: Boolean, default: false },
  deliberationStatus: { type: String, default: '' },
  durableCancelTarget: { type: Object, default: null },
  replyCancellationState: { type: Object, default: null },
  conversationId: { type: String, default: '' },
  discussionVariant: { type: String, default: 'public' },
  matterReadOnly: { type: Boolean, default: false },
  draft: { type: String, default: '' },
  discussionContext: { type: Object, default: () => ({ mentionAgentIds: [], outgoingMetadata: { inputRefs: [] } }) },
  emptyText: { type: String, default: '还没有议事记录，可以先提问。' },
  eventStreamRecovering: { type: Boolean, default: false },
  isAwaitingReply: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
  identityEpoch: { type: [Number, String], default: 0 },
  identityScope: { type: String, default: '' },
  mentionLabel: { type: Function, required: true },
  messages: { type: Array, default: () => [] },
  messageWindows: { type: Array, default: () => [] },
  messageWindowLoading: { type: Object, default: () => new Set() },
  messageWindowErrors: { type: Object, default: () => ({}) },
  messagePageHasMore: { type: Boolean, default: false },
  messagePageLoading: { type: Boolean, default: false },
  messagePageError: { type: String, default: '' },
  pendingAgentName: { type: String, default: '' },
  placeholder: { type: String, default: '向聚义传话，或 @某位好汉' },
  selectedAgent: { type: Object, default: null },
  selectedTask: { type: Object, default: null },
  senderText: { type: Function, required: true },
  scopeHint: { type: String, default: 'public' },
  subtitle: { type: String, default: '' },
  title: { type: String, default: '议事' },
  targetText: { type: String, default: '众好汉' },
  voice: { type: Object, default: null },
  outputCandidates: { type: Array, default: () => [] },
  outputReviewEnabled: { type: Boolean, default: false },
  outputReviewBusy: { type: Boolean, default: false },
  typedOutcomes: { type: Array, default: () => [] },
  typedPendingQuestion: { type: Object, default: null },
  typedEnabled: { type: Boolean, default: false }
})

const emit = defineEmits([
  'cancel-deliberation',
  'clear-target',
  'delete-conversation',
  'load-history',
  'load-more-history',
  'load-messages',
  'load-older-messages',
  'retain-message-windows',
  'load-message-window',
  'mention-agent',
  'new-conversation',
  'open-workspace',
  'retry-conversation',
  'select-conversation',
  'send-message',
  'update:draft',
  'update:material-refs',
  'restore-discussion-context',
  'voice-apply',
  'typed-reply',
  'accept-output',
])

const messageBoxRef = ref(null)
const historyOpen = ref(false)
const historyButtonRef = ref(null)
const historyRef = ref(null)
const composerRef = ref(null)
const materialPickerOpen = ref(false)
const pendingAuthor = '聚义'
const materialIdentityKey = computed(() => `${props.identityEpoch}\u0000${props.identityScope}`)
const taskId = computed(() => String(props.selectedTask?.id || '').trim())
const serverTaskCompleted = computed(() => props.discussionVariant === 'bounty' &&
  (props.matterReadOnly || ['completed', 'failed', 'cancelled', 'archived'].includes(props.selectedTask?.status)))
const typedForMessage = message => props.typedOutcomes.filter(projection =>
  [message, ...(message.turnDeliveries || [])].some(row => projection?.outcome?.assistantMessageId === String(row?.localId || '')) && !message.turnProjections?.includes(projection))

// Suppress only an identical answer; distinct typed text must remain visible.
const typedBodyRendered = (message, projection) => {
  const row = [message, ...(message.turnDeliveries || [])].find(row => String(row.localId || '') === projection?.outcome?.assistantMessageId) || message
  return Boolean(row.content) && (
    ['ACTION_REQUEST', 'REVISION_REQUEST', 'SUBMISSION_REQUEST'].includes(projection?.outcome?.kind) ||
    String(row.content).trim() === String(projection?.outcome?.text || '').trim()
  )
}

const isTaskDiscussion = computed(() => props.discussionVariant === 'bounty')
const isPrivateDiscussion = computed(() => props.discussionVariant === 'private')
const privateSelectedMaterials = ref([])
const privateMaterialRefs = computed(() => privateSelectedMaterials.value.map(({ fileId, version }) => ({ kind: 'WORKSPACE_VERSION', fileId, version })))
watch(privateMaterialRefs, refs => emit('update:material-refs', refs), { flush: 'sync', immediate: true })
const displayedMessages = computed(() => !isTaskDiscussion.value ? props.messages : discussionTurns({
  messages: props.messages, projections: props.typedOutcomes, conversationId: props.conversationId, taskId: taskId.value
}))
const canReviewMessageOutputs = computed(() => isTaskDiscussion.value && props.outputReviewEnabled && !serverTaskCompleted.value)
const isAgentMessage = message => ['AGENT', 'ASSISTANT'].includes(message?.sender)
const outputForPart = (message, part) => {
  if (!isTaskDiscussion.value || !isAgentMessage(message) || part?.state !== 'ready' || !part.assetId) return null
  const matches = props.outputCandidates.filter(item => item.assetRef?.assetId === part.assetId && item.assetRef.revision === String(part.revision))
  // No newest/title fallback: ambiguous references stay in the explicit selection dialog.
  return matches.length === 1 ? matches[0] : null
}
const textOutputsFor = message => !isTaskDiscussion.value || !isAgentMessage(message) ? [] : props.outputCandidates.filter(item =>
  [message, ...(message.turnDeliveries || [])].some(row => item.messageSource?.messageId === String(row.localId || '')) && item.taskId === taskId.value)
const reviewMessageOutput = item => {
  if (canReviewMessageOutputs.value && !props.outputReviewBusy && !props.conversationBusy && !props.voice?.voiceInteractionLocked && props.outputCandidates.includes(item)) emit('accept-output', item)
}
const textOutputPreview = ref(null)
const pinnedHistoryMessageIds = computed(() => props.typedOutcomes.filter(projection =>
  props.typedPendingQuestion && projection.outcome?.outcomeId === props.typedPendingQuestion?.parentOutcomeId
).map(projection => projection.outcome.assistantMessageId).concat(textOutputPreview.value?.messageSource?.messageId || []))
const textOutputDialog = ref(null)
let textPreviewReturnFocus = null
const closeTextOutputPreview = event => { if (event.target === textOutputDialog.value) textOutputPreview.value = null }
watch(textOutputPreview, async item => {
  if (item) {
    textPreviewReturnFocus = document.activeElement
    await nextTick()
    if (!textOutputPreview.value) return
    textOutputDialog.value?.showModal?.()
    textOutputDialog.value?.querySelector('button')?.focus()
  } else {
    await nextTick()
    if (textPreviewReturnFocus?.isConnected) textPreviewReturnFocus.focus()
  }
})
watch(() => `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`, () => { textOutputPreview.value = null }, { flush: 'sync' })

let returnReceiver = null
const materialReady = ref(false)
const persistence = { enabled: () => returnReceiver?.intents.enabled() || false, read: () => returnReceiver?.intents.read() || [], save: value => returnReceiver?.intents.save(value) }
const workspace = usePersonalWorkspace({ identityEpoch: materialIdentityKey })
const conversationMaterialLinks = usePersonalWorkspaceConversationLinks({
  conversationId: () => props.conversationId,
  identityEpoch: materialIdentityKey, persistence
})
const taskMaterialLinks = usePersonalWorkspaceTaskLinks({
  taskId,
  identityEpoch: materialIdentityKey, persistence
})
const materialNames = ref({})
const pendingMaterials = ref([])
const materialPickerRef = ref(null)
const draftMaterialScope = ref('TASK_DEFAULT')
const draftSourceIds = ref(new Set())
const materialSelectionBusy = ref(false)
const materialUploadBusy = ref(false)
const materialUploadPending = ref(false)
const materialPickerLoading = ref(false)
let materialRefresh = null
let materialSelectionGeneration = 0
const typedSelectedSourceIds = ref(new Set())
const hasMaterialScope = computed(() => isTaskDiscussion.value ? Boolean(taskId.value) : isPrivateDiscussion.value || Boolean(props.conversationId))
// UI, staging and recovery are shared; only the authorized association scope differs.
const selectedMaterialDirectory = computed(() => isTaskDiscussion.value ? taskMaterialLinks : conversationMaterialLinks)
const materialWriteUnresolved = computed(() => selectedMaterialDirectory.value.pendingWrites.value.length > 0)
const materialActionBusy = computed(() => ['saving', 'removing'].includes(selectedMaterialDirectory.value.actionState.value))
const materialError = computed(() => selectedMaterialDirectory.value.error.value || workspace.error.value)
const activeMaterialLinks = computed(() => selectedMaterialDirectory.value.links.value.filter(link => link.state === 'ACTIVE' &&
  (isTaskDiscussion.value ? ['INPUT', 'REFERENCE'].includes(link.role) : link.role === 'REFERENCE')))
const composerMaterials = computed(() => isPrivateDiscussion.value ? privateSelectedMaterials.value : activeMaterialLinks.value)
const materialName = link => link.displayName || materialNames.value[link.fileId] || workspace.items.value.find(file => file.fileId === link.fileId)?.displayName || `资料 ${link.fileId}`
const pickerMaterials = computed(() => [...new Map([
  ...activeMaterialLinks.value.map(link => ({ fileId: link.fileId, version: link.version, displayName: materialName(link) })),
  ...privateSelectedMaterials.value,
  ...pendingMaterials.value
].map(material => [`${material.fileId}:${material.version}`, material])).values()])
const previewMaterial = link => materialPickerRef.value?.preview?.({ ...link, displayName: materialName(link) })
const wechatContext = computed(() => ({ kind: 'chat', owner: props.identityScope, mode: props.discussionVariant,
  taskId: taskId.value, conversationId: props.conversationId, agentId: props.selectedAgent?.agentId || '', draft: props.draft,
  typedMaterialScope: typedMaterialScope.value, typedSourceIds: [...typedSelectedSourceIds.value],
  draftMaterialScope: draftMaterialScope.value, draftSourceIds: [...draftSourceIds.value], discussionContext: props.discussionContext }))
const restoreWechatMaterialContext = source => {
  if (serverTaskCompleted.value || source.owner !== props.identityScope || source.conversationId !== props.conversationId || source.taskId !== taskId.value) return
  const allowedScopes = ['TASK_DEFAULT', 'EXPLICIT', 'NONE']
  if (allowedScopes.includes(source.typedMaterialScope)) typedMaterialScope.value = source.typedMaterialScope
  if (allowedScopes.includes(source.draftMaterialScope)) draftMaterialScope.value = source.draftMaterialScope
  emit('restore-discussion-context', source.discussionContext)
  const ids = values => new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])
  typedSelectedSourceIds.value = ids(source.typedSourceIds)
  draftSourceIds.value = ids(source.draftSourceIds)
}
const importWechatMaterials = async () => {
  if (!hasMaterialScope.value || serverTaskCompleted.value || props.conversationBusy || materialSelectionBusy.value || materialActionBusy.value || materialWriteUnresolved.value || materialUploadPending.value || pendingMaterials.value.length || props.voice?.voiceInteractionLocked || props.isStreaming || props.isAwaitingReply) return
  await toggleMaterialPicker()
  if (!serverTaskCompleted.value && !props.conversationBusy) await materialPickerRef.value?.importWechat?.()
}
const importMaterialImages = files => {
  if (!hasMaterialScope.value) { materialPickerOpen.value = true; return }
  void materialPickerRef.value?.importImages?.(files)
}
const typedMaterialScope = ref('TASK_DEFAULT')
const typedSourceSelectors = computed(() => (typedMaterialScope.value === 'NONE' ? [] : activeMaterialLinks.value).filter(link => typedSelectedSourceIds.value.has(`${link.fileId}\u0000${link.version}`) ).map(link => ({ kind: 'TASK_LINKED_WORKSPACE_VERSION', fileId: link.fileId, version: String(link.version), purpose: link.role })))
const toggleDraftSource = (link, selected) => {
  if (!props.typedEnabled || !link || !['INPUT', 'REFERENCE'].includes(link.role)) return
  const next = new Set(draftSourceIds.value); const key = `${link.fileId}\u0000${link.version}`
  if (selected) next.add(key); else next.delete(key)
  draftSourceIds.value = next
}
const resolveMaterialNames = async operationKey => {
  for (const link of activeMaterialLinks.value) {
    if (materialNames.value[link.fileId] || workspace.items.value.some(file => file.fileId === link.fileId)) continue
    const detail = await workspace.select(link.fileId)
    if (operationKey !== `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`) return
    if (detail?.file?.state === 'ACTIVE' && detail.file.fileId === link.fileId) {
      materialNames.value = { ...materialNames.value, [link.fileId]: detail.file.displayName }
    }
  }
}
const refreshMaterialReferences = () => {
  // A first PRIVATE draft has no server association or conversation to load.
  if (isPrivateDiscussion.value && !props.conversationId) return workspace.refresh({ state: 'ACTIVE' })
  if (!hasMaterialScope.value) return Promise.resolve(false)
  const operationKey = `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`
  if (materialRefresh?.key === operationKey) return materialRefresh.promise
  const directory = selectedMaterialDirectory.value
  const request = { key: operationKey, promise: null }
  request.promise = (async () => {
    const [, loaded] = await Promise.all([workspace.refresh({ state: 'ACTIVE' }), directory.load()])
    const cursors = new Set()
    while (loaded && directory.nextCursor.value) {
      const cursor = directory.nextCursor.value
      if (cursors.has(cursor) || !await directory.loadMore()) return false
      cursors.add(cursor)
    }
    if (!loaded || operationKey !== `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`) return false
    await resolveMaterialNames(operationKey)
    return operationKey === `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`
  })().finally(() => { if (materialRefresh === request) materialRefresh = null })
  materialRefresh = request
  return request.promise
}
const toggleMaterialPicker = async () => {
  if (serverTaskCompleted.value) { materialPickerOpen.value = false; return }
  if (materialPickerLoading.value) return
  if (!hasMaterialScope.value) { materialPickerOpen.value = true; return }
  materialPickerOpen.value = false
  draftMaterialScope.value = typedMaterialScope.value
  draftSourceIds.value = new Set(typedSelectedSourceIds.value)
  const generation = materialSelectionGeneration
  materialPickerLoading.value = true
  try {
    if (!await refreshMaterialReferences() || generation !== materialSelectionGeneration || serverTaskCompleted.value) return
    await materialPickerRef.value?.open?.()
  } finally { if (generation === materialSelectionGeneration) materialPickerLoading.value = false }
}
const completeMaterials = async (materials, baseline = pickerMaterials.value) => {
  if (serverTaskCompleted.value || materialSelectionBusy.value || !hasMaterialScope.value) return 'stale'
  typedMaterialScope.value = draftMaterialScope.value
  typedSelectedSourceIds.value = new Set(draftSourceIds.value)
  return attachMaterials(materials, true, baseline)
}
const attachMaterials = async (materials, reconcile = false, baseline = []) => {
  if (serverTaskCompleted.value || materialSelectionBusy.value || !hasMaterialScope.value) return 'stale'
  // Initial PRIVATE selection is local. The native admission transaction alone creates
  // its conversation and freezes input authority when the user actually sends.
  if (isPrivateDiscussion.value && !props.conversationId) {
    const selected = reconcile ? materials : [...privateSelectedMaterials.value, ...materials]
    privateSelectedMaterials.value = [...new Map(selected.map(material => [`${material.fileId}:${material.version}`, { ...material }])).values()]
    return 'confirmed'
  }
  const directory = selectedMaterialDirectory.value
  const operationKey = `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`
  const generation = ++materialSelectionGeneration
  const current = () => generation === materialSelectionGeneration && operationKey === `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}` && !serverTaskCompleted.value
  pendingMaterials.value = materials.map(material => ({ ...material }))
  materialSelectionBusy.value = true
  try {
    // Complete directory before computing absence; a failed page is never an empty page.
    if (!await directory.load() || !current()) return 'failed'
    const cursors = new Set()
    while (directory.nextCursor.value) {
      const cursor = directory.nextCursor.value
      if (cursors.has(cursor) || !await directory.loadMore() || !current()) return 'failed'
      cursors.add(cursor)
    }
    if (directory.pendingWrites.value.length) return 'unknown'
    const key = item => JSON.stringify([item.fileId, item.version])
    const before = new Set(baseline.map(key)), selected = new Set(materials.map(key))
    const additions = reconcile ? materials.filter(item => !before.has(key(item))) : materials
    for (const material of additions) {
      if (!current()) return 'stale'
      const existing = activeMaterialLinks.value.find(link => key(link) === key(material))
      const link = existing || await directory.attach({ fileId: material.fileId, version: material.version, role: 'REFERENCE' })
      if (!current()) return 'stale'
      if (!link || link.state !== 'ACTIVE') return directory.pendingWrites.value.length ? 'unknown' : 'failed'
      materialNames.value = { ...materialNames.value, [material.fileId]: material.displayName }
      if (!existing && props.typedEnabled && typedMaterialScope.value === 'EXPLICIT') typedSelectedSourceIds.value = new Set([...typedSelectedSourceIds.value, `${link.fileId}\u0000${link.version}`])
    }
    if (reconcile) {
      // Only B-S belongs to this edit; never remove another writer's concurrent additions.
      for (const original of baseline.filter(item => !selected.has(key(item)))) {
        if (!current()) return 'stale'
        const link = activeMaterialLinks.value.find(item => key(item) === key(original))
        if (link && !await directory.detach(link)) return directory.pendingWrites.value.length ? 'unknown' : 'failed'
      }
    }
    if (!current()) return 'stale'
    if (isPrivateDiscussion.value) {
      const selected = reconcile ? materials : [...privateSelectedMaterials.value, ...materials]
      privateSelectedMaterials.value = [...new Map(selected.map(material => [`${material.fileId}:${material.version}`, { ...material }])).values()]
    }
    pendingMaterials.value = []
    return 'confirmed'
  } finally { if (current()) materialSelectionBusy.value = false }
}
const removeMaterialReference = async link => {
  if (!link || serverTaskCompleted.value || materialSelectionBusy.value || materialActionBusy.value || props.conversationBusy || materialUploadBusy.value) return
  if (isPrivateDiscussion.value) {
    // Removing a request attachment does not revoke a historical association.
    privateSelectedMaterials.value = privateSelectedMaterials.value.filter(item => item.fileId !== link.fileId || item.version !== link.version)
    return
  }
  await selectedMaterialDirectory.value.detach(link)
}
const closeHistory = () => {
  if (!historyRef.value?.dismissBlocked) historyOpen.value = false
}
const toggleHistory = () => {
  if (historyRef.value?.dismissBlocked) return
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) {
    composerRef.value?.closeTools?.()
    emit('load-history')
  }
}
const taskText = computed(() => props.selectedTask?.title || '未选榜文')
const resolvedSubtitle = computed(() => {
  if (props.subtitle) return props.subtitle
  if (props.discussionVariant === 'bounty') return taskText.value
  if (props.discussionVariant === 'private') return props.targetText
  if (props.selectedTask) return taskText.value
  if (props.selectedAgent) return props.targetText
  return props.scopeHint === 'public' ? '未指定好汉时，由宋江安排回复。' : props.scopeHint
})
const displayStatus = computed(() => {
  if (serverTaskCompleted.value) return ({ completed: '事项已完成', cancelled: '事项已取消', failed: '事项未完成', archived: '事项已归档' })[props.selectedTask?.status] || props.connectionStatus || '事项只读'
  if (props.eventStreamRecovering) return '正在恢复连接'
  if (props.discussionVariant === 'bounty' && props.selectedTask) return projectHallTask({ task: props.selectedTask }).label
  return props.connectionStatus || (props.isAwaitingReply ? pendingLabel.value : '连接正常')
})
const pendingLabel = computed(() => {
  if (props.pendingAgentName) return `${props.pendingAgentName} 正在回复…`
  return '正在整理回报...'
})
const renderMarkdown = (content = '') => DOMPurify.sanitize(marked(String(content || '')))

const loadOlderMessages = () => {
  if (props.messagePageLoading) return
  followingMessages.value = false
  emit('load-older-messages')
}
const followingMessages = ref(true)
const hasUnseenMessages = ref(false)
const trackMessageScroll = () => {
  const box = messageBoxRef.value
  if (!box) return
  // One rendered line tolerates rounding and keeps an intentional upward scroll stable.
  const line = parseFloat(window.getComputedStyle(box).lineHeight) || 24
  followingMessages.value = box.scrollHeight - box.clientHeight - box.scrollTop <= line
  if (followingMessages.value) hasUnseenMessages.value = false
}
const followLatestMessages = () => {
  followingMessages.value = true
  hasUnseenMessages.value = false
  const box = messageBoxRef.value
  if (box) box.scrollTop = box.scrollHeight
}
watch(() => props.messages, () => {
  if (props.messagePageLoading) return
  if (!followingMessages.value) { hasUnseenMessages.value = true; return }
  nextTick(() => { if (followingMessages.value) followLatestMessages() })
}, { deep: true })
watch(() => `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`, () => {
  followingMessages.value = true
  hasUnseenMessages.value = false
  nextTick(followLatestMessages)
})

watch(() => `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}\u0000${serverTaskCompleted.value}\u0000${isPrivateDiscussion.value ? props.selectedAgent?.agentId : ''}`, () => {
  historyOpen.value = false
  materialPickerOpen.value = false
  materialNames.value = {}
  materialSelectionGeneration++
  materialSelectionBusy.value = false
  materialUploadBusy.value = false
  materialUploadPending.value = false
  materialPickerLoading.value = false
  materialRefresh = null
  pendingMaterials.value = []
  privateSelectedMaterials.value = []
  typedSelectedSourceIds.value = new Set()
  typedMaterialScope.value = 'TASK_DEFAULT'
  draftMaterialScope.value = 'TASK_DEFAULT'
  draftSourceIds.value = new Set()
  materialReady.value = serverTaskCompleted.value
  if (hasMaterialScope.value && !serverTaskCompleted.value) {
    const key = `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`
    void refreshMaterialReferences().finally(() => { if (key === `${materialIdentityKey.value}\u0000${taskId.value}\u0000${props.conversationId}`) materialReady.value = true })
  }
}, { flush: 'sync', immediate: true })
returnReceiver = useHallReturnReceiver({
  context: () => wechatContext.value,
  scene: () => returnSnapshot(wechatContext.value, `${props.identityScope}\u0000${taskId.value}\u0000${props.conversationId}`, pickerMaterials.value, pickerMaterials.value),
  apply: scene => {
    emit('update:draft', scene.draft)
    restoreWechatMaterialContext({ ...wechatContext.value, ...scene.materialContext, discussionContext: scene.discussionContext })
  },
  ready: () => materialReady.value && !!props.identityScope && !!props.conversationId,
  readOnly: () => serverTaskCompleted.value || props.conversationBusy || props.isStreaming || props.isAwaitingReply
})
watch(serverTaskCompleted, (terminal, previous) => {
  if (!terminal) return
  materialPickerOpen.value = false
  if (!previous) props.voice?.cancel?.()
}, { flush: 'sync', immediate: true })
// Parent owns navigation, identity and draft-conflict confirmation. These methods
// only prepare/apply local selections; they never create associations or executions.
const materialDraft = () => ({
  scope: isTaskDiscussion.value ? typedMaterialScope.value : 'EXPLICIT',
  inputs: (isPrivateDiscussion.value ? privateSelectedMaterials.value : typedSourceSelectors.value).map(({ fileId, version }) => ({ fileId, version }))
})
const canApplyMaterialDraft = inputs => !serverTaskCompleted.value && !props.conversationBusy &&
  !props.isStreaming && !props.isAwaitingReply && !props.voice?.voiceInteractionLocked &&
  !materialWriteUnresolved.value && !materialUploadPending.value && !materialSelectionBusy.value &&
  !materialUploadBusy.value && !materialActionBusy.value && !pendingMaterials.value.length &&
  (!isTaskDiscussion.value || inputs.every(input => activeMaterialLinks.value.some(link => link.fileId === input.fileId && link.version === input.version)))
const prepareMaterialDraft = async inputs => {
  const generation = materialSelectionGeneration
  if (isTaskDiscussion.value && !await refreshMaterialReferences()) return null
  if (generation !== materialSelectionGeneration || !canApplyMaterialDraft(inputs)) return null
  return inputs.map(input => ({ ...input }))
}
const applyMaterialDraft = inputs => {
  if (!canApplyMaterialDraft(inputs)) return false
  if (isPrivateDiscussion.value) privateSelectedMaterials.value = inputs.map(input => ({ ...input }))
  else {
    typedMaterialScope.value = inputs.length ? 'EXPLICIT' : 'NONE'
    typedSelectedSourceIds.value = new Set(inputs.map(input => `${input.fileId}\u0000${input.version}`))
  }
  return true
}
defineExpose({ materialDraft, prepareMaterialDraft, applyMaterialDraft })
onBeforeUnmount(() => {
  if (isPrivateDiscussion.value) emit('update:material-refs', [])
  materialSelectionGeneration++
  workspace.dispose()
  conversationMaterialLinks.dispose()
  taskMaterialLinks.dispose()
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: #fffaf0;
}

button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.panel-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid rgba(116, 75, 35, 0.12);
  color: #765f40;
  font-size: 12px;
}

.context-summary {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  min-width: 0;
  gap: 8px;
}

.context-summary strong {
  flex: 0 0 auto;
  color: #3f2815;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.context-summary small,
.context-summary em {
  max-width: 100%;
  overflow: hidden;
  color: #8a6f4b;
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-summary em {
  flex: 0 0 auto;
  color: #9a6e40;
}

.toolbar-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  min-width: 0;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  flex: 0 0 auto;
  border-radius: 8px;
  background: transparent;
  color: #4a3423;
  white-space: nowrap;
}

.icon-button svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.icon-button:hover:not(:disabled) {
  background: #f2e8d8;
}

.icon-button:focus-visible {
  outline: 2px solid #7f4a22;
  outline-offset: 2px;
}

.workspace-entry {
  width: auto;
  gap: 4px;
  padding: 0 8px;
  background: #ead3a9;
  color: #5d361c;
  font-size: 12px;
}

.material-reference-entry {
  width: auto;
  gap: 4px;
  padding: 0 8px;
  background: #e7dbc4;
  color: #604323;
  font-size: 12px;
}

.material-reference-entry span {
  white-space: nowrap;
}

.material-link-status { display: flex; gap: 8px; padding: 6px 10px; font-size: 12px; color: #806441; }
.material-link-status button { color: #7f4a22; text-decoration: underline; }
.material-use-settings summary { cursor: pointer; color: #654122; }
.material-use-list { margin: 8px 0; padding-left: 18px; font-size: 13px; }
.material-use-list li + li { margin-top: 6px; }

.material-reference-picker {
  flex: 0 0 auto;
  max-height: min(42vh, 270px);
  overflow-y: auto;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(116, 75, 35, 0.16);
  background: #f8eedc;
  color: #4a3423;
}

.material-reference-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.material-reference-heading strong,
.material-reference-heading small {
  display: block;
}

.material-reference-heading strong {
  font-size: 13px;
}

.material-reference-heading small,
.material-reference-notice,
.material-reference-state,
.material-reference-error {
  margin: 3px 0 0;
  color: #806441;
  font-size: 12px;
  line-height: 1.45;
}

.material-reference-heading > button {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  background: transparent;
  color: #765f40;
}

.material-reference-error {
  color: #a23f32;
}

.material-reference-state button {
  margin-left: 4px;
  color: #7f4a22;
  text-decoration: underline;
}

.material-reference-list {
  display: grid;
  gap: 6px;
  margin: 9px 0 0;
  padding: 0;
  list-style: none;
}

.material-reference-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid rgba(116, 75, 35, 0.14);
  border-radius: 7px;
  background: #fffaf0;
}

.material-reference-file {
  min-width: 0;
  flex: 1;
}

.material-reference-file strong,
.material-reference-file small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-reference-file strong {
  font-size: 12px;
}

.material-reference-file small {
  margin-top: 2px;
  color: #8a6f4b;
  font-size: 11px;
}

.material-reference-list li > button,
.active-material-references > button {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: 5px;
  background: #e8d3ad;
  color: #623e20;
  font-size: 12px;
}

.material-reference-list li > button.material-reference-linked {
  background: #eee4d2;
  color: #765f40;
}

.active-material-references {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  color: #806441;
  font-size: 12px;
}

.active-material-references > button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
}

.active-material-references :deep(.var-icon) {
  font-size: 13px;
}

.workspace-entry span {
  white-space: nowrap;
}

.icon-button.primary {
  color: #6d3f1f;
}

.conversation-load-error {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #fff0ea;
  color: #a23f32;
  font-size: 12px;
}

.conversation-load-error button {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid currentColor;
  border-radius: 5px;
  background: transparent;
  color: inherit;
}

.hall-messages {
  flex: 1;
  min-height: 0;
  padding: 14px 16px;
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(239, 224, 198, 0.44), rgba(255, 250, 240, 0) 82px),
    #fbf3e4;
}

.hall-message {
  max-width: 88%;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff8e8;
  color: #4a3423;
  box-shadow: 0 1px 0 rgba(71, 44, 23, 0.08);
}

.hall-message.USER {
  margin-left: auto;
  background: #e8f2ed;
}

.hall-message.AGENT,
.hall-message.SYSTEM {
  margin-right: auto;
  background: #fffdf6;
}

.hall-message.is-pending {
  border: 1px dashed #c8a96e;
}

.hall-message.is-streaming {
  box-shadow: inset 3px 0 0 #7f4a22;
}

.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.message-head strong {
  font-size: 13px;
}

.message-state,
.deliberation-status { margin: 8px 12px; color: var(--color-warning, #a66b16); font-size: 12px; }

.message-status {
  color: #8a6f4b;
  font-size: 12px;
}

.message-content {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.55;
}

.message-content :deep(*) {
  max-width: 100%;
}

.message-content :deep(p),
.message-content :deep(ul),
.message-content :deep(ol),
.message-content :deep(blockquote),
.message-content :deep(pre),
.message-content :deep(table) {
  margin: 0 0 8px;
}

.message-content :deep(:first-child) {
  margin-top: 0;
}

.message-content :deep(:last-child) {
  margin-bottom: 0;
}

.message-content :deep(ul),
.message-content :deep(ol) {
  padding-left: 20px;
}

.message-content :deep(li + li) {
  margin-top: 3px;
}

.message-content :deep(a) {
  color: #7f4a22;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-content :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(127, 74, 34, 0.1);
  color: #3f2815;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}

.message-content :deep(pre) {
  overflow-x: auto;
  padding: 8px 10px;
  border: 1px solid rgba(116, 75, 35, 0.16);
  border-radius: 8px;
  background: #f5ead6;
  white-space: pre;
}

.message-content :deep(pre code) {
  padding: 0;
  background: transparent;
  white-space: pre;
}

.message-content :deep(blockquote) {
  padding-left: 10px;
  border-left: 3px solid #c8a96e;
  color: #765f40;
}

.message-content :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}

.message-content :deep(th),
.message-content :deep(td) {
  padding: 5px 8px;
  border: 1px solid rgba(116, 75, 35, 0.2);
}

.message-content :deep(th) {
  background: #f5ead6;
  font-weight: 700;
}

.empty-list {
  display: grid;
  min-height: 140px;
  place-items: center;
  color: #a88b62;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 640px) {
  .panel-toolbar {
    align-items: center;
  }

  .context-summary {
    flex-wrap: wrap;
    gap: 2px 6px;
  }

  .context-summary strong {
    flex-shrink: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .context-summary em {
    display: none;
  }

  .hall-message {
    max-width: 94%;
  }
}
.composer-attachment-strip { display: flex; flex: 1 0 100%; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; gap: 8px; padding: 6px 2px; overflow-x: auto; scrollbar-width: none; }
.composer-attachment-strip::-webkit-scrollbar { display: none; }
.composer-attachment-strip:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: -2px; }
.composer-attachment-card { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; max-width: 300px; padding: 8px; background: var(--hall-surface, #fffefa); border: 1px solid var(--hall-border, #e3e5dc); border-radius: 8px; }
.composer-attachment-name { display: flex; flex-direction: column; min-width: 0; }
.composer-attachment-name strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.composer-attachment-name small { font-size: 11px; color: var(--hall-text-muted, #68716b); }
.composer-attachment-card button { min-height: 44px; flex-shrink: 0; padding: 4px; background: transparent; font-size: 12px; }
</style>

<style scoped>
.task-material-directory{display:grid;gap:8px}.task-material-reference{display:grid;gap:5px;padding:10px 12px;border:1px solid #d8ded8;border-radius:8px;background:#f6faf7}.task-material-reference>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.task-material-reference strong,.task-material-reference small{overflow-wrap:anywhere}.task-material-reference small{color:#5f746b;font-size:11px}.task-material-reference p{margin:0;color:#5b6963;font-size:12px;line-height:1.55}.material-reference-notice{line-height:1.55}
.composer-attachment-strip { display: flex; flex: 1 0 100%; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; gap: 8px; padding: 6px 2px; overflow-x: auto; scrollbar-width: none; }
.composer-attachment-strip::-webkit-scrollbar { display: none; }
.composer-attachment-strip:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: -2px; }
.composer-attachment-card { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; max-width: 300px; padding: 8px; background: var(--hall-surface, #fffefa); border: 1px solid var(--hall-border, #e3e5dc); border-radius: 8px; }
.composer-attachment-name { display: flex; flex-direction: column; min-width: 0; }
.composer-attachment-name strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.composer-attachment-name small { font-size: 11px; color: var(--hall-text-muted, #68716b); }
.composer-attachment-card button { min-height: 44px; flex-shrink: 0; padding: 4px; background: transparent; font-size: 12px; }
</style>

<style scoped>
.message-output-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.message-output-actions button, .message-output-accept { min-height: 40px; padding: 6px 12px; border: 1px solid var(--hall-border, #e3e5dc); border-radius: 7px; font: inherit; cursor: pointer; }
.message-output-accept { background: var(--hall-brand, #923f30); color: var(--hall-surface, #fffefa); }
.message-output-accept:disabled { opacity: .65; cursor: not-allowed; }
.message-output-preview { width: min(800px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); box-sizing: border-box; border: 1px solid var(--hall-border, #e3e5dc); border-radius: 12px; padding: 16px; background: var(--hall-surface, #fffefa); color: var(--hall-text, #242e2b); }
.message-output-preview::backdrop { background: #242e2baa; }
.message-output-preview header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.message-output-preview header button { min-width: 40px; min-height: 40px; border: 0; background: transparent; color: inherit; font-size: 24px; cursor: pointer; }
.message-output-preview pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.composer-attachment-strip { display: flex; flex: 1 0 100%; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; gap: 8px; padding: 6px 2px; overflow-x: auto; scrollbar-width: none; }
.composer-attachment-strip::-webkit-scrollbar { display: none; }
.composer-attachment-strip:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: -2px; }
.composer-attachment-card { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; max-width: 300px; padding: 8px; background: var(--hall-surface, #fffefa); border: 1px solid var(--hall-border, #e3e5dc); border-radius: 8px; }
.composer-attachment-name { display: flex; flex-direction: column; min-width: 0; }
.composer-attachment-name strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.composer-attachment-name small { font-size: 11px; color: var(--hall-text-muted, #68716b); }
.composer-attachment-card button { min-height: 44px; flex-shrink: 0; padding: 4px; background: transparent; font-size: 12px; }
</style>

<style scoped>
.discussion-turn-progress { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; color: var(--hall-text-muted, #68716b); font-size: 12px; }
.composer-attachment-strip { display: flex; flex: 1 0 100%; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; gap: 8px; padding: 6px 2px; overflow-x: auto; scrollbar-width: none; }
.composer-attachment-strip::-webkit-scrollbar { display: none; }
.composer-attachment-strip:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: -2px; }
.composer-attachment-card { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; max-width: 300px; padding: 8px; background: var(--hall-surface, #fffefa); border: 1px solid var(--hall-border, #e3e5dc); border-radius: 8px; }
.composer-attachment-name { display: flex; flex-direction: column; min-width: 0; }
.composer-attachment-name strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.composer-attachment-name small { font-size: 11px; color: var(--hall-text-muted, #68716b); }
.composer-attachment-card button { min-height: 44px; flex-shrink: 0; padding: 4px; background: transparent; font-size: 12px; }
</style>

<style scoped>
.new-messages-button { align-self: center; padding: 5px 12px; border: 1px solid #d8d8ce; border-radius: 18px; background: #fffefa; color: #315746; cursor: pointer; }
</style>

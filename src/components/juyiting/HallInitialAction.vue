<template>
  <section aria-label="首次交付方式">
    <button v-if="state === 'CLOSED'" type="button" @click="read">查看首次交付方式</button>
    <fieldset v-else-if="state === 'OPEN'">
      <legend>首次交付方式（未选择）</legend>
      <p>仅使用本地资料，不调用技能。选择后，当前需求和材料下不可更改；不会开始办理。</p>
      <button v-for="(label, choice) in options" :key="choice" type="button" @click="choose(choice)">固定为{{ label }}</button>
    </fieldset>
    <p v-else role="status">{{ message }}
      <button v-if="state === 'UNKNOWN'" type="button" @click="submit">重试原选择</button>
      <button v-if="['ERROR', 'CHANGED'].includes(state)" type="button" @click="read">重新核对交付方式</button>
    </p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { agentApi } from '../../composables/useHttp.js'
import { resolveRequestId } from '../../composables/useRequestRum.js'

// Parent keys this editor by authority, task revision and candidate. No request until opened.
const props = defineProps({ taskId: { type: String, required: true }, taskVersion: { type: String, required: true }, agentId: { type: String, required: true } })
const options = { LOCAL_ANSWER: '本地答复', LOCAL_TEXT_FILE: '本地文本文件' }
const state = ref('CLOSED'), fixed = ref('')
let version, pending, active
const uri = () => `/tasks/${encodeURIComponent(props.taskId)}/initial-actions/${encodeURIComponent(props.agentId)}`
const message = computed(() => ({ READING: '正在核对首次交付方式…', SAVING: '正在固定选择…', FIXED: `已固定：${fixed.value}。可重新取价。`,
  UNKNOWN: '尚未确认保存结果，请重试原选择。', ERROR: '暂时无法读取交付方式。', CHANGED: '事项或选择已变化，请核对当前详情。', DENIED: '当前不可设置交付方式。' })[state.value])
onBeforeUnmount(() => { active?.abort(); active = null })
function valid (v) {
  return v?.agentId === props.agentId && v.taskVersion === props.taskVersion && typeof v.selectionVersion === 'string' && /^[0-9a-f]{64}$/.test(v.selectionVersion)
}
function failure (e, writing) {
  if ([401,403,404].includes(e?.status)) { pending = null; state.value = 'DENIED' }
  else if (e?.status === 409) { pending = null; state.value = 'CHANGED' }
  else state.value = writing ? 'UNKNOWN' : 'ERROR'
}
async function read () {
  if (active) return
  const req = new AbortController(); active = req; state.value = 'READING'
  try {
    const v = await agentApi.get(uri(), {}, { autoLoading: false, signal: req.signal })
    if (active !== req) return
    if (!valid(v) || !(v.choice === null || v.choice === 'OTHER_FIXED' || Object.hasOwn(options, v.choice))) { state.value = 'CHANGED'; return }
    version = v.selectionVersion
    fixed.value = options[v.choice] || '其他已固定方式'
    state.value = v.choice === null ? 'OPEN' : 'FIXED'
  } catch (e) { if (active === req) failure(e, false) } finally { if (active === req) active = null }
}
function choose (choice) {
  if (state.value !== 'OPEN' || !Object.hasOwn(options, choice)) return
  pending = { body: { selectionVersion: version, choice }, key: resolveRequestId() }; return submit()
}
async function submit () {
  if (active || !pending) return
  const req = new AbortController(); active = req; state.value = 'SAVING'
  try {
    const v = await agentApi.put(uri(), pending.body, { autoLoading: false, signal: req.signal, headers: { 'Idempotency-Key': pending.key } })
    if (active !== req) return
    if (!valid(v) || v.choice !== pending.body.choice || v.selectionVersion !== pending.body.selectionVersion) { state.value = 'UNKNOWN'; return }
    // A replay proves the original write, not that its material/requirement binding is still current.
    active = null; pending = null; await read()
  } catch (e) { if (active === req) failure(e, true) } finally { if (active === req) active = null }
}
</script>

<template>
  <section aria-label="首次交付方式">
    <button v-if="state === 'CLOSED'" type="button" @click="read">查看首次交付方式</button>
    <fieldset v-else-if="state === 'OPEN'">
      <legend>首次交付方式（未选择）</legend>
      <p>可选择本地办理，或指定承办人的已安装技能。固定后当前需求和材料下不可更改；此操作不派单、不扣费。</p>
      <button v-for="(label, choice) in options" :key="choice" type="button" @click="choose(choice)">固定为{{ label }}</button>
      <button v-if="skills === null" type="button" :disabled="skillsBusy" @click="loadSkills">{{ skillsBusy ? '正在读取技能…' : '查看可选技能' }}</button>
      <p v-if="skillError" role="status">暂时无法读取技能，可以重试。</p>
      <template v-if="skills?.length">
        <label>办理技能<select v-model="selectedRef"><option value="" disabled>请选择技能</option><option v-for="item in skills" :key="item.ref" :value="item.ref">{{ item.title }}</option></select></label>
        <label>期望交付格式<input v-model.trim="mime" list="task-initial-artifact-types" placeholder="例如 image/png" /></label>
        <datalist id="task-initial-artifact-types"><option value="image/png">PNG 图片</option><option value="application/pdf">PDF 文档</option><option value="text/plain">纯文本</option></datalist>
        <button type="button" :disabled="!validSkill" @click="chooseSkill">固定技能及交付格式</button>
      </template>
      <p v-else-if="skills !== null">当前没有可选择的已安装技能。</p>
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
const skills = ref(null), skillsBusy = ref(false), skillError = ref(false), selectedRef = ref(''), mime = ref('')
const validSkill = computed(() => skills.value?.some(v => v.ref === selectedRef.value) && mime.value.length <= 127 && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mime.value))
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
  skills.value = null; selectedRef.value = ''; mime.value = ''; skillError.value = false
  const req = new AbortController(); active = req; state.value = 'READING'
  try {
    const v = await agentApi.get(uri(), {}, { autoLoading: false, signal: req.signal })
    if (active !== req) return
    if (!valid(v) || !(v.choice === null || v.choice === 'OTHER_FIXED' || v.choice === 'INSTALLED_SKILL' || Object.hasOwn(options, v.choice))) { state.value = 'CHANGED'; return }
    version = v.selectionVersion
    fixed.value = v.choice === 'INSTALLED_SKILL' ? '指定技能及交付格式' : options[v.choice] || '其他已固定方式'
    state.value = v.choice === null ? 'OPEN' : 'FIXED'
  } catch (e) { if (active === req) failure(e, false) } finally { if (active === req) active = null }
}
async function loadSkills () {
  if (active || state.value !== 'OPEN') return
  const req = new AbortController(); active = req; skillsBusy.value = true; skillError.value = false
  try {
    const rows = await agentApi.get(uri() + '/skill-options', {}, { autoLoading: false, signal: req.signal })
    if (active !== req) return
    if (!Array.isArray(rows) || !rows.every(v => /^[a-f0-9]{64}$/.test(v?.ref) && typeof v.title === 'string')) throw new Error('Invalid skill choices')
    skills.value = rows
  } catch { if (active === req) skillError.value = true } finally { if (active === req) { skillsBusy.value = false; active = null } }
}
function chooseSkill () {
  if (active || state.value !== 'OPEN' || !validSkill.value) return
  pending = { body: { selectionVersion: version, choice: 'INSTALLED_SKILL', optionRef: selectedRef.value, mimeType: mime.value }, key: resolveRequestId() }; return submit()
}
function choose (choice) {
  if (active || state.value !== 'OPEN' || !Object.hasOwn(options, choice)) return
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

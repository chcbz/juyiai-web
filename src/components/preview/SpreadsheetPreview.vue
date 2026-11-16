<template>
  <section class="spreadsheet-preview">
    <p v-if="loading" role="status">正在解析Excel原文件…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-else-if="!loading">
      <p class="sheet-note">只读预览：公式使用文件保存的结果，未重新计算。图表、透视表、复杂条件格式等内容未展示。</p>
      <p v-if="!sheets.length" role="status">没有可见的工作表。</p>
      <template v-else>
        <label class="sheet-selector">工作表 <select v-model="selected" @change="changeSheet"><option v-for="item in sheets" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <div
          ref="viewport"
          class="sheet-viewport"
          tabindex="0"
          role="region"
          aria-label="工作表内容，可横向和纵向滚动"
          @scroll="scheduleView"
        >
          <div class="sheet-canvas" :style="{ width: `${width}px`, height: `${height}px` }">
            <div
              v-for="cell in cells"
              :key="cell.key"
              class="sheet-cell"
              :style="{ ...cell.style, left: `${cell.left}px`, top: `${cell.top}px`, width: `${cell.width}px`, height: `${cell.height}px` }"
              :aria-label="`第${cell.row}行第${cell.col}列：${cell.text}`"
              :title="cell.formula ? `=${cell.formula}（保存结果未重算）` : cell.text"
            >
              <span v-if="cell.runs"><span v-for="(run, index) in cell.runs" :key="index" :style="run.style">{{ run.text }}</span></span>
              <span v-else>{{ cell.text }}</span>
            </div>
          </div>
        </div>
        <p v-if="cells.some(cell => cell.historical)" class="sheet-note">1900年3月前的日期可能受历史日期系统影响，请核对原文件。</p>
        <p v-if="cells.some(cell => cell.formatFailed)" class="sheet-note">部分数字格式不支持，已显示原始数值。</p>
      </template>
    </template>
  </section>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { themeColors } from '../../utils/spreadsheetPreview.js'
import { assertOfficeContainer } from '../../utils/filePreview.js'
const emit = defineEmits(['error'])
const props = defineProps({ blob: { type: Blob, required: true } })
const loading = ref(false); const error = ref(''); const sheets = shallowRef([]); const selected = ref(null)
const cells = shallowRef([]); const width = ref(0); const height = ref(0); const viewport = ref(null)
watch(error, value => { if (value) emit('error', value) })
let worker = null; let generation = 0; let requestId = 0; let frame = null; let resize = null; let theme = []
function clear () {
  generation++; requestId++; worker?.terminate(); worker = null; resize?.disconnect(); resize = null
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null; cells.value = []; sheets.value = []; selected.value = null; width.value = 0; height.value = 0; theme = []
}
function requestView () {
  frame = null
  const el = viewport.value
  if (!el || !worker || selected.value === null) return
  worker.postMessage({ type: 'view', requestId: ++requestId, sheetId: selected.value, theme, box: { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight } })
}
function scheduleView () { if (frame === null) frame = requestAnimationFrame(requestView) }
function changeSheet () {
  requestId++; cells.value = []; width.value = 0; height.value = 0
  if (viewport.value) { viewport.value.scrollLeft = 0; viewport.value.scrollTop = 0 }
  scheduleView()
}
watch(() => props.blob, async blob => {
  clear()
  const current = generation
  loading.value = true; error.value = ''
  try {
    const bytes = await blob.arrayBuffer()
    if (current !== generation) return
    assertOfficeContainer(bytes)
    worker = new Worker(new URL('../../workers/spreadsheetPreview.worker.js', import.meta.url), { type: 'module' })
    worker.onerror = () => { if (current === generation) { error.value = 'Excel预览未能完成，请关闭后重新打开。'; loading.value = false; worker?.terminate(); worker = null } }
    worker.onmessage = async ({ data }) => {
      if (current !== generation) return
      if (data.type === 'loaded') {
        theme = themeColors(data.themeXml); sheets.value = data.sheets; selected.value = data.sheets[0]?.id ?? null; loading.value = false
        await nextTick()
        if (current !== generation) return
        if (viewport.value) { resize = new ResizeObserver(scheduleView); resize.observe(viewport.value); requestView() }
      } else if (data.type === 'view' && data.requestId === requestId && data.sheetId === selected.value) {
        cells.value = data.cells; width.value = data.width; height.value = data.height
      } else if (data.type === 'error' && (data.requestId == null || data.requestId === requestId)) {
        error.value = data.message; loading.value = false; cells.value = []; worker?.terminate(); worker = null
      }
    }
    worker.postMessage({ type: 'load', bytes }, [bytes])
  } catch (cause) { if (current === generation) { loading.value = false; error.value = cause?.message || 'Excel预览无法启动。' } }
}, { immediate: true })
onBeforeUnmount(clear)
</script>
<style scoped>
.spreadsheet-preview { width: 100%; min-width: 0; }
.sheet-note { color: var(--hall-text-muted, #68716b); font-size: 13px; }
.sheet-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sheet-selector select { min-height: 44px; max-width: 75%; font: inherit; }
.sheet-viewport { position: relative; overflow: auto; width: 100%; height: 360px; max-height: 55dvh; border: 1px solid #ccd2c5; box-sizing: border-box; background: white; }
.sheet-canvas { position: relative; }
.sheet-cell { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; padding: 2px 4px; border: 1px solid #ddd; color: #242e2b; font-size: 11pt; line-height: 1.2; }
.sheet-viewport:focus-visible { outline: 2px solid var(--hall-brand, #923f30); }
</style>

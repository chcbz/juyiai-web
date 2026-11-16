import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { selectionKey } from '../src/composables/juyiting/hallSelectedOutputs.js'

const hall = readFileSync(new URL('../src/components/world/JuyiHall.vue', import.meta.url), 'utf8')
const gallery = readFileSync(new URL('../src/components/juyiting/BountyExecutionOutputs.vue', import.meta.url), 'utf8')
const item = n => ({ requestId: `request-${n}`, stepId: 'step', outputId: 'output_1', sha256: String(n).repeat(64), contentMimeType: 'image/png' })
const routing = load => {
  const preview = ref(null), open = ref(true)
  const code = hall.slice(hall.indexOf('const acceptSelectedOutputPreview ='), hall.indexOf('watch(() => selectedOutputReview.open.value'))
  const api = new Function('selectedOutputPreview', 'selectedOutputReview', 'selectionKey', 'bountyDiscussionRef', `${code};return { accept: acceptSelectedOutputPreview, preview: previewSelectedOutput }`)(preview, { open }, selectionKey, { value: { previewSelected: load } })
  return { ...api, state: preview, open }
}

describe('actual selected preview routing and late-result isolation', () => {
  it('never attaches a late A image or mismatched digest to B, and collapse discards late completion', async () => {
    const jobs = []; const h = routing(value => new Promise(resolve => jobs.push({ value, resolve })))
    const a = item(1), b = item(2)
    const first = h.preview(a), second = h.preview(b)
    expect(h.state.value.loading).to.equal(true)
    h.accept({ item: a, url: 'blob:a' }); expect(h.state.value.item.requestId).to.equal(b.requestId)
    h.accept({ item: { ...b, sha256: 'wrong' }, url: 'blob:wrong' }); expect(h.state.value.loading).to.equal(true)
    h.accept({ item: b, url: 'blob:b' }); expect(h.state.value.url).to.equal('blob:b')
    jobs[0].resolve(); jobs[1].resolve(); await Promise.all([first, second])
    expect(h.state.value.url).to.equal('blob:b')
    await h.preview(null); h.accept({ item: b, url: 'blob:late' }); expect(h.state.value).to.equal(null)
  })
  it('shows missing/failed-loader feedback and ignores results after close', async () => {
    const h = routing(async () => { throw Error('network') })
    await h.preview(item(1)); expect(h.state.value.loading).to.equal(false); expect(h.state.value.error).to.include('不会换用其他版本')
    h.open.value = false; h.accept({ item: item(1), url: 'blob:old' }); expect(h.state.value.url).to.equal(undefined)
  })
  it('routes only the exact current gallery item to the shared source loader', () => {
    const items = ref([item(1), item(2)]), emitted = []
    const code = gallery.slice(gallery.indexOf('const previewSelected ='), gallery.indexOf('defineExpose({ previewSelected'))
    const api = new Function('allItems', 'outputItemKey', 'previewSource', 'emit',
      `${code}; return { previewSelected }`)(items, selectionKey,
      value => ({ key: selectionKey(value), mimeType: value.contentMimeType }), (...args) => emitted.push(args))
    api.previewSelected({ ...items.value[0], sha256: 'wrong' })
    expect(emitted).to.have.length(0)
    api.previewSelected(items.value[1])
    expect(emitted).to.have.length(1)
    expect(emitted[0][1].item).to.equal(items.value[1])
    expect(emitted[0][1].source.key).to.equal(selectionKey(items.value[1]))
    const old = items.value[0]; items.value = []
    api.previewSelected(old)
    expect(emitted).to.have.length(1)
    // Async bytes are owned by FilePreview; its actual lifecycle tests cover
    // A/B switching and close, while the parent routing cases above fence events.
  })
})

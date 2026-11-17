import { useFilePreview } from '../src/composables/useFilePreview.js'
import { usePersonalWorkspace } from '../src/composables/usePersonalWorkspace.js'
import * as pageReturn from '../src/composables/juyiting/useHallPageReturn.js'
import * as returnState from '../src/utils/pageReturnState.js'
import { FilePreview } from './helpers/file-preview-component.js'
import { filePreviewKind, previewMime } from '../src/utils/filePreview.js'
import * as taskPresentation from '../src/composables/juyiting/hallTaskPresentation.js'
import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { validMaterialVersion } from '../src/composables/juyiting/materialVersion.js'
import * as turns from '../src/composables/juyiting/hallDiscussionTurns.js'

const compile = (name, deps) => {
  const { descriptor } = parse(readFileSync(new URL(`../src/components/juyiting/${name}.vue`, import.meta.url), 'utf8'))
  const code = compileScript(descriptor, { id: name, inlineTemplate: true }).content
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?\s*$/gm, (_, names) => `var { ${names.replace(/\s+as\s+/g, ': ')} } = Vue`)
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, names) => `var { ${names} } = deps`)
    .replace(/^import\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, name) => `var ${name} = deps.${name}`)
    .replace(/^import\s+FilePreview\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace('export default', 'return')
  return new Function('Vue', 'deps', 'FilePreview', code)(Vue, { FilePreview, filePreviewKind, previewMime, useFilePreview, ...pageReturn, ...returnState, ...deps }, FilePreview)
}
const receipt = (id = 'photo') => ({ file: { fileId: id, displayName: `${id}.png`, state: 'ACTIVE' }, version: { fileId: id, version: '1', contentMimeType: 'image/png' }, operation: { state: 'COMMITTED' } })
const settle = async () => { await flushPromises(); await Vue.nextTick() }
const workspace = () => ({ items: Vue.ref([]), listState: Vue.ref('empty'), nextCursor: Vue.ref(null), detail: Vue.ref(null), preview: Vue.ref({ kind: 'none' }), pendingWrites: Vue.ref([]), loading: Vue.ref(false), error: Vue.ref(''), actionState: Vue.ref('idle'), writeNotice: Vue.ref(''),
  refresh: async () => true, loadMore: async () => {}, closeDetail() {}, dispose() {}, upload: async () => receipt(), retryWrite: async () => receipt(), select: async () => null })
const stub = { render: () => null }
const picker = state => compile('HallMaterialPicker', { usePersonalWorkspace: () => state, validMaterialVersion, PdfDocumentPreview: stub })
const mountPicker = state => mount(picker(state), { attachTo: document.body, props: { identityScope: 'owner/thread-a', dialogOnly: true }, global: { stubs: { 'var-icon': true } } })

describe('material picker automatic cursor paging', () => {
  let originalObserver, observers, wrapper
  beforeEach(() => {
    originalObserver = globalThis.IntersectionObserver
    observers = []
    globalThis.IntersectionObserver = class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this) }
      observe(target) { this.target = target }
      disconnect() { this.disconnected = true }
      intersect(visible = true) { this.callback([{ target: this.target, isIntersecting: visible }]) }
    }
  })
  afterEach(() => {
    wrapper?.unmount(); wrapper = null
    if (originalObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = originalObserver
  })
  const ready = () => {
    const state = workspace()
    state.items.value = [{ fileId: 'file-1', displayName: '第一份.pdf', latestVersion: '1' }]
    state.listState.value = 'ready'; state.nextCursor.value = 'page-2'
    return state
  }
  it('observes the actual scroll pane, appends one page at a time and stops at the last cursor', async () => {
    const state = ready(); let calls = 0
    state.loadMore = async options => { expect(options).to.deep.equal({ state: 'ACTIVE' }); calls++; state.loading.value = true }
    wrapper = mountPicker(state)
    expect(observers).to.have.length(0)
    await wrapper.vm.open(); await settle()
    const first = observers.at(-1)
    expect(first.options.root).to.equal(document.querySelector('.quick-material-list-pane'))
    expect(first.options.rootMargin).to.equal('0px 0px 120px 0px')
    expect(first.target).to.equal(document.querySelector('.quick-material-list-status'))
    expect([...document.querySelectorAll('.quick-material-picker button')].some(button => button.textContent.trim() === '加载更多')).to.equal(false)
    first.intersect(false); expect(calls).to.equal(0)
    first.intersect(); first.intersect(); await settle()
    expect(calls).to.equal(1); expect(first.disconnected).to.equal(true)
    expect(document.querySelector('.quick-material-list-status').textContent).to.include('正在加载更多资料')
    state.items.value.push({ fileId: 'file-2', displayName: '第二份.docx', latestVersion: '2' })
    state.nextCursor.value = 'page-3'; state.loading.value = false; await settle()
    expect(document.querySelectorAll('.quick-material-files button')).to.have.length(2)
    observers.at(-1).intersect(); await settle(); expect(calls).to.equal(2)
    state.nextCursor.value = null; state.loading.value = false; await settle()
    const count = observers.length
    observers.at(-1).intersect(); await settle()
    expect(observers).to.have.length(count); expect(calls).to.equal(2)
    expect(document.querySelector('.quick-material-list-status').textContent).to.include('已加载全部资料')
  })
  it('keeps the page and fixed selection on failure and waits for explicit retry', async () => {
    const state = ready(); let calls = 0
    state.loadMore = async () => {
      calls++; state.loading.value = true
      await Promise.resolve()
      state.error.value = '网络断开'; state.listState.value = 'error'; state.loading.value = false
      return false
    }
    wrapper = mount(picker(state), { attachTo: document.body, props: { identityScope: 'owner', modelValue: [{ fileId: 'file-1', version: '1', displayName: '第一份.pdf' }] } })
    await wrapper.vm.open(); await settle()
    const observer = observers.at(-1); observer.intersect(); await settle()
    observer.intersect(); await settle(); expect(calls).to.equal(1)
    expect(state.nextCursor.value).to.equal('page-2')
    expect(document.querySelectorAll('.quick-material-files button')).to.have.length(1)
    expect(document.querySelector('.quick-material-list-status').textContent).to.include('网络断开')
    expect(wrapper.emitted('update:modelValue')).to.equal(undefined)
    state.loadMore = async () => { calls++; state.listState.value = 'ready'; state.error.value = ''; state.nextCursor.value = null; return true }
    document.querySelector('.quick-material-list-status button').click(); await settle()
    expect(calls).to.equal(2)
    expect(document.querySelector('.quick-material-list-status').textContent).to.include('已加载全部资料')
  })
  it('disconnects on close and unmount and ignores previously queued observer callbacks', async () => {
    const state = ready(); let calls = 0
    state.loadMore = async () => { calls++ }
    wrapper = mountPicker(state); await wrapper.vm.open(); await settle()
    const first = observers.at(-1)
    document.querySelector('.quick-material-back').click(); await settle()
    expect(first.disconnected).to.equal(true)
    first.intersect(); expect(calls).to.equal(0)
    await wrapper.vm.open(); await settle()
    const second = observers.at(-1)
    wrapper.unmount(); wrapper = null
    expect(second.disconnected).to.equal(true)
    second.intersect(); expect(calls).to.equal(0)
  })
  it('pauses in mobile preview and resumes on return to the list', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    try {
      const state = ready()
      state.select = async () => { state.detail.value = { file: { ...state.items.value[0], state: 'ACTIVE' }, latestVersion: { version: '1' }, versions: [{ version: '1' }] }; return state.detail.value }
      state.previewVersion = async () => true
      wrapper = mountPicker(state); await wrapper.vm.open(); await settle()
      const first = observers.at(-1)
      document.querySelector('.quick-material-files button').click(); await settle()
      document.querySelector('.quick-material-preview-toggle').click(); await settle()
      expect(first.disconnected).to.equal(true)
      const count = observers.length
      first.intersect(); await settle(); expect(observers).to.have.length(count)
      document.querySelector('.quick-material-back').click(); await settle()
      expect(observers.length).to.be.greaterThan(count)
    } finally { window.matchMedia = originalMatchMedia }
  })
  it('retains manual loading only for browsers without IntersectionObserver', async () => {
    delete globalThis.IntersectionObserver
    const state = ready(); let calls = 0
    state.loadMore = async () => { calls++; state.nextCursor.value = null; return true }
    wrapper = mountPicker(state); await wrapper.vm.open(); await settle()
    const button = document.querySelector('.quick-material-list-status button')
    expect(button.textContent).to.equal('加载更多'); button.click(); await settle()
    expect(calls).to.equal(1)
  })
  for (const readOnly of [false, true]) it(`renders exactly one working preview per linked file (readOnly=${readOnly})`, async () => {
    const state = ready(); let selected = 0
    state.select = async fileId => { expect(fileId).to.equal('file-1'); selected++; return null }
    wrapper = mount(picker(state), { props: { identityScope: 'owner', readOnly, modelValue: [{ fileId: 'file-1', version: '1', displayName: '第一份.pdf' }] } })
    expect(wrapper.findAll('[aria-label="预览所选资料"]')).to.have.length(1)
    expect(wrapper.findAll('[aria-label^="移除"]')).to.have.length(readOnly ? 0 : 1)
    await wrapper.get('[aria-label="预览所选资料"]').trigger('click'); await settle()
    expect(selected).to.equal(1)
  })
})

describe('shared discussion material import receipts', () => {
  it('returns cancellation focus to an explicitly supplied pre-load trigger', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger)
    const state = workspace(), wrapper = mountPicker(state)
    try {
      document.body.focus()
      await wrapper.vm.open(trigger); await settle()
      const cancel = [...document.querySelectorAll('.quick-material-picker button')].find(button => button.textContent.trim() === '取消')
      cancel.click(); await settle()
      expect(document.activeElement).to.equal(trigger)
    } finally { wrapper.unmount(); trigger.remove() }
  })

  it('keeps click-event callers returning focus to the current trigger', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
    const wrapper = mountPicker(workspace())
    try {
      await wrapper.vm.open(new window.MouseEvent('click')); await settle()
      const cancel = [...document.querySelectorAll('.quick-material-picker button')].find(button => button.textContent.trim() === '取消')
      cancel.click(); await settle()
      expect(document.activeElement).to.equal(trigger)
    } finally { wrapper.unmount(); trigger.remove() }
  })

  it('imports authoritative fixed versions without opening a picker or sending a message', async () => {
    const state = workspace(), wrapper = mountPicker(state)
    try {
      await wrapper.vm.importImages([{ name: 'photo.png' }]); await settle()
      expect(wrapper.emitted('import-materials')[0][0]).to.deep.equal([{ fileId: 'photo', version: '1', displayName: 'photo.png', contentMimeType: 'image/png' }])
      expect(wrapper.emitted('update:modelValue')).to.equal(undefined)
      expect(document.querySelector('dialog')).to.equal(null)
    } finally { wrapper.unmount() }
  })
  it('unknown uploads are checked, not re-uploaded; confirmed files alone enter the draft', async () => {
    const state = workspace(); let uploads = 0, checks = 0
    state.upload = async () => { uploads++; state.pendingWrites.value = [{ target: 'CREATE' }]; return null }
    state.retryWrite = async target => { expect(target).to.equal('CREATE'); checks++; state.pendingWrites.value = []; return receipt() }
    const wrapper = mountPicker(state)
    try {
      await wrapper.vm.importImages([{ name: 'photo.png' }]); await settle()
      expect(wrapper.emitted('import-materials')).to.equal(undefined)
      await wrapper.vm.importImages([{ name: 'photo.png' }])
      expect(uploads).to.equal(1)
      await wrapper.get('.quick-material-import-status button').trigger('click'); await settle()
      expect(checks).to.equal(1); expect(uploads).to.equal(1)
      expect(wrapper.emitted('import-materials')[0][0][0].fileId).to.equal('photo')
      expect(wrapper.emitted('upload-busy').at(-1)).to.deep.equal([false])
    } finally { wrapper.unmount() }
  })
  it('does not adopt late results after changing identity/scope', async () => {
    const state = workspace(); let resolve
    state.upload = () => new Promise(done => { resolve = done })
    const wrapper = mountPicker(state)
    try {
      const pending = wrapper.vm.importImages([{ name: 'photo.png' }])
      await wrapper.setProps({ identityScope: 'owner/thread-b' })
      resolve(receipt()); await pending; await settle()
      expect(wrapper.emitted('import-materials')).to.equal(undefined)
    } finally { wrapper.unmount() }
  })
  it('retains committed partial imports when the next file fails', async () => {
    const state = workspace(); let calls = 0
    state.upload = async () => ++calls === 1 ? receipt() : null
    const wrapper = mountPicker(state)
    try {
      await wrapper.vm.importImages([{ name: 'first.png' }, { name: 'second.png' }]); await settle()
      expect(wrapper.emitted('import-materials')[0][0]).to.have.length(1)
      expect(wrapper.text()).to.include('上传结果尚未确认')
    } finally { wrapper.unmount() }
  })

  it('keeps preview/add in one text action group and an accessible upload icon without changing fixed references', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    const state = workspace(), previews = []
    state.items.value = [{ fileId: 'notes', displayName: '说明.txt', latestVersion: '2', state: 'ACTIVE' }]
    state.select = async () => {
      const detail = { file: state.items.value[0], latestVersion: { version: '2' }, versions: [{ fileId: 'notes', version: '2', contentMimeType: 'text/plain' }] }
      state.detail.value = detail
      return detail
    }
    state.previewVersion = async version => { previews.push(version); state.preview.value = { kind: 'text', text: '固定资料' } }
    const wrapper = mountPicker(state)
    try {
      await wrapper.vm.open(); await settle()
      document.querySelector('[data-file-id="notes"]').click(); await settle()
      const row = document.querySelector('.quick-material-version-actions')
      const toggle = row.querySelector('.quick-material-preview-toggle')
      expect(toggle.textContent).to.equal('预览')
      expect(row.querySelector('svg, var-icon')).to.equal(null)
      expect(row.querySelector('.hall-tool')).to.equal(null)
      const upload = document.querySelector('.quick-material-upload')
      expect(upload.classList.contains('hall-tool')).to.equal(true)
      expect(upload.textContent.trim()).to.equal('')
      expect(upload.querySelector('svg').getAttribute('aria-hidden')).to.equal('true')
      const input = upload.querySelector('input[type="file"]')
      expect(input.getAttribute('aria-label')).to.equal('上传资料')
      expect(input.multiple).to.equal(true)
      input.focus(); expect(document.activeElement).to.equal(input)
      toggle.click(); await settle()
      expect(toggle.textContent).to.equal('收起预览')
      expect(toggle.getAttribute('aria-expanded')).to.equal('true')
      expect(previews).to.deep.equal(['2'])
      row.querySelector('.primary').click(); await settle()
      expect(row.querySelector('.primary').textContent).to.equal('已添加')
      expect(row.querySelector('.primary').disabled).to.equal(true)
      state.items.value = [{ ...state.items.value[0], latestVersion: '3' }]
      state.pendingWrites.value = [{ target: 'CREATE' }]; await settle()
      expect(input.disabled).to.equal(true)
      document.querySelector('.quick-material-confirm').click(); await settle()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).to.deep.equal([{ fileId: 'notes', version: '2', displayName: '说明.txt', contentMimeType: 'text/plain' }])
    } finally { wrapper.unmount(); window.matchMedia = originalMatchMedia }
  })

})

const directory = () => {
  const links = Vue.ref([]), calls = []
  return { ...workspace(), links, calls, load: async () => true,
    attach: async material => { calls.push(['attach', material]); const link = { ...material, relationId: `link-${material.fileId}`, state: 'ACTIVE' }; links.value.push(link); return link },
    detach: async link => { calls.push(['detach', link.fileId]); links.value = links.value.filter(item => item.relationId !== link.relationId); return true } }
}
const panel = variant => {
  const state = workspace(), conversation = directory(), task = directory()
  state.items.value = [{ fileId: 'photo', latestVersion: '1', displayName: 'photo.png', state: 'ACTIVE' }]
  state.select = async fileId => {
    const detail = { file: state.items.value.find(file => file.fileId === fileId), latestVersion: { version: '1' }, versions: [{ fileId, version: '1', contentMimeType: 'image/png' }] }
    state.detail.value = detail
    return detail
  }
  state.previewVersion = async () => { state.preview.value = { kind: 'unsupported', message: '测试替身不读取真实文件' } }
  const deps = { ...taskPresentation, ...turns, usePersonalWorkspace: () => state, usePersonalWorkspaceConversationLinks: () => conversation, usePersonalWorkspaceTaskLinks: () => task,
    marked: Object.assign(x => x, { setOptions() {} }), DOMPurify: { sanitize: x => x }, HallMessageParts: stub, HallMessageWindow: stub, BountyTextSelectionArchive: stub,
    HallMaterialThumbnail: stub, HallConversationHistory: stub, BountyTypedOutcomeCard: stub, WorkspaceWriteRecovery: stub, HallVoiceControls: stub }
  deps.HallChatComposer = compile('HallChatComposer', deps)
  deps.HallMaterialPicker = picker(state)
  const wrapper = mount(compile('ChatPanel', deps), { attachTo: document.body, props: { discussionVariant: variant, conversationId: 'thread-a', selectedTask: { id: 'task-a' }, identityScope: 'owner', draft: '原有草稿', mentionLabel: () => '', senderText: () => '' }, global: { stubs: { 'var-icon': true } } })
  return { wrapper, conversation, task, state, Picker: deps.HallMaterialPicker }
}
describe('same production picker and attachment semantics in every discussion', () => {
  for (const variant of ['public', 'private', 'bounty']) it(`${variant}: common modal, cancellation, import and detach use the scoped adapter`, async () => {
    const { wrapper, conversation, task, Picker } = panel(variant)
    const selected = variant === 'bounty' ? task : conversation
    try {
      await settle()
      await wrapper.get('.composer-add-materials').trigger('click'); await settle()
      expect(document.querySelector('dialog[open]')).not.to.equal(null)
      const pickerWrapper = wrapper.findComponent(Picker)
      const click = async selector => { document.querySelector(selector).click(); await settle() }
      await click('.quick-material-files button')
      await click('.quick-material-version-actions .primary')
      await click('.quick-material-back')
      expect(selected.calls).to.have.length(0)
      expect(pickerWrapper.emitted('update:modelValue')).to.equal(undefined)
      await wrapper.get('.composer-add-materials').trigger('click'); await settle()
      await click('.quick-material-files button')
      await click('.quick-material-version-actions .primary')
      await click('.quick-material-confirm')
      expect(selected.calls[0][0]).to.equal('attach')
      expect((variant === 'bounty' ? conversation : task).calls).to.have.length(0)
      expect(wrapper.get('.composer-input-area .composer-attachment-strip').attributes('tabindex')).to.equal('0')
      expect(wrapper.get('.composer-attachment-card').text()).to.include('photo.png')
      await wrapper.get('[aria-label="移除 photo.png"]').trigger('click'); await settle()
      if (variant === 'private') expect(selected.calls.filter(call => call[0] === 'detach')).to.have.length(0)
      else expect(selected.calls.at(-1)).to.deep.equal(['detach', 'photo'])
      expect(wrapper.find('.composer-attachment-card').exists()).to.equal(false)
      expect(wrapper.emitted('send-message')).to.equal(undefined)
      expect(wrapper.props('draft')).to.equal('原有草稿')
    } finally { wrapper.unmount() }
  })
})

describe('upload recovery leaves tools reachable', () => {
  it('blocks sending an unknown upload but allows checking it and opening the shared selector', async () => {
    const { wrapper, state, Picker, conversation } = panel('private')
    let uploads = 0
    state.upload = async () => { uploads++; state.pendingWrites.value = [{ target: 'CREATE' }]; return null }
    state.retryWrite = async () => { state.pendingWrites.value = []; return receipt() }
    try {
      await settle()
      await wrapper.findComponent(Picker).vm.$.exposed.importImages([{ name: 'photo.png' }]); await settle()
      expect(wrapper.get('.composer-send').attributes('disabled')).to.equal('')
      expect(wrapper.get('.composer-add-materials').attributes('disabled')).to.equal(undefined)
      await wrapper.get('.quick-material-import-status button').trigger('click'); await settle()
      expect(uploads).to.equal(1)
      expect(conversation.calls[0]).to.deep.equal(['attach', { fileId: 'photo', version: '1', role: 'REFERENCE' }])
      expect(wrapper.get('.composer-send').attributes('disabled')).to.equal(undefined)
      expect(wrapper.get('.composer-attachment-card').text()).to.include('photo.png')
      expect(wrapper.emitted('send-message')).to.equal(undefined)
    } finally { wrapper.unmount() }
  })
  it('dialog-only identity resets never emit a user-confirmed empty selection', async () => {
    const state = workspace(), wrapper = mountPicker(state)
    try {
      await wrapper.setProps({ modelValue: [{ fileId: 'photo', version: '1' }] })
      await wrapper.setProps({ identityScope: 'owner/other-thread' })
      expect(wrapper.emitted('update:modelValue')).to.equal(undefined)
    } finally { wrapper.unmount() }
  })
})

describe('fixed-version attachment thumbnails', () => {
  const mountThumbnail = (mime = 'image/png') => {
    const calls = []
    const version = { fileId: 'photo', version: '1', originalFilename: 'photo.png', contentMimeType: mime, byteLength: '5', sha256: 'a'.repeat(64), createdAt: 1 }
    const api = { execute: async options => {
      calls.push(options)
      if (options.url.endsWith('/content')) return new Blob(['photo'], { type: mime })
      return { file: { fileId: 'photo', sourceKind: 'UPLOAD', displayName: 'photo', mediaFamily: 'IMAGE', state: 'ACTIVE', metadataRevision: '1', latestVersion: '1', createdAt: 1, capabilities: {} }, latestVersion: version, versions: [version], relations: [], derivation: [] }
    } }
    const component = compile('HallMaterialThumbnail', { usePersonalWorkspace: options => usePersonalWorkspace({ ...options, api }) })
    return { calls, wrapper: mount(component, { props: { fileId: 'photo', version: '1', identityKey: 'owner/thread-a' } }) }
  }
  it('reads the fixed original image and discards it immediately when identity changes', async () => {
    const { wrapper, calls } = mountThumbnail()
    try {
      await settle()
      expect(wrapper.find('img').exists()).to.equal(true)
      expect(calls.filter(call => call.url.endsWith('/content')).map(call => call.url))
        .to.deep.equal(['/personal-workspace/files/photo/versions/1/content'])
      expect(calls.every(call => call.method === 'GET' && !call.url.includes('/preview'))).to.equal(true)
      await wrapper.setProps({ identityKey: 'other-owner/thread-b', version: '2' })
      await settle()
      expect(wrapper.find('img').exists()).to.equal(false)
      expect(wrapper.find('svg').exists()).to.equal(true)
      expect(calls.filter(call => call.url.endsWith('/content'))).to.have.length(1)
    } finally { wrapper.unmount() }
  })
  it('does not fetch Office bytes for a thumbnail', async () => {
    const { wrapper, calls } = mountThumbnail('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    try {
      await settle()
      expect(wrapper.find('svg').exists()).to.equal(true)
      expect(calls.some(call => call.url.endsWith('/content'))).to.equal(false)
    } finally { wrapper.unmount() }
  })
  it('falls back to its icon after image decoding fails', async () => {
    const { wrapper } = mountThumbnail()
    try {
      await settle(); await wrapper.get('img').trigger('error'); await settle()
      expect(wrapper.find('img').exists()).to.equal(false)
      expect(wrapper.find('svg').exists()).to.equal(true)
    } finally { wrapper.unmount() }
  })
})

describe('task-only source scope stays explicit', () => {
  it('does not reselect an existing file that was unchecked for this message', async () => {
    const { wrapper, task } = panel('bounty')
    task.links.value = [{ fileId: 'photo', version: '1', relationId: 'existing-photo', role: 'REFERENCE', state: 'ACTIVE' }]
    try {
      await wrapper.setProps({ typedEnabled: true }); await settle()
      await wrapper.get('.composer-add-materials').trigger('click'); await settle()
      const select = document.querySelector('[aria-label="资料范围"]')
      select.value = 'EXPLICIT'; select.dispatchEvent(new window.Event('change', { bubbles: true })); await settle()
      expect(document.querySelector('.material-use-list input').checked).to.equal(false)
      document.querySelector('.quick-material-confirm').click(); await settle()
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('send-message')[0][0]).to.deep.equal({ sourceSelectors: [], materialScope: 'EXPLICIT' })
      expect(task.links.value).to.have.length(1)
      expect(task.calls).to.have.length(0)
    } finally { wrapper.unmount() }
  })
})

describe('differential selection preserves concurrent work', () => {
  for (const variant of ['private', 'bounty']) it(`${variant}: removes only original B-S, not a concurrent addition`, async () => {
    const { wrapper, task, conversation, state } = panel(variant)
    const selected = variant === 'bounty' ? task : conversation
    selected.links.value = [{ fileId: 'old', version: '1', role: 'REFERENCE', relationId: 'old-link', state: 'ACTIVE' }]
    state.items.value.push({ fileId: 'old', latestVersion: '1', displayName: 'old', state: 'ACTIVE' })
    try {
      await settle(); await wrapper.get('.composer-add-materials').trigger('click'); await settle()
      selected.links.value.push({ fileId: 'concurrent', version: '1', role: 'REFERENCE', relationId: 'other-link', state: 'ACTIVE' })
      document.querySelector('.quick-material-count').click(); await settle()
      document.querySelector('.quick-material-draft li button').click(); await settle()
      document.querySelector('.quick-material-confirm').click(); await settle()
      expect(selected.calls).to.deep.equal([['detach', 'old']])
      expect(selected.links.value.map(link => link.fileId)).to.deep.equal(['concurrent'])
    } finally { wrapper.unmount() }
  })
})


describe('PRIVATE first-send material staging', () => {
  it('selects fixed versions with no conversation/association write and forwards them on explicit send', async () => {
    const { wrapper, state, Picker, conversation, task } = panel('private')
    try {
      await settle()
      let loads = 0
      conversation.load = async () => { loads++; return true }
      await wrapper.setProps({ conversationId: '', selectedTask: null, selectedAgent: { agentId: 'a' } })
      await settle()
      await wrapper.findComponent(Picker).vm.$.exposed.importImages([{ name: 'photo.png' }]); await settle()
      expect(loads).to.equal(0)
      expect(conversation.calls).to.have.length(0)
      expect(task.calls).to.have.length(0)
      expect(wrapper.get('.composer-attachment-card').text()).to.include('photo.png')
      expect(wrapper.emitted('send-message')).to.equal(undefined)
      await wrapper.get('.composer-send').trigger('click')
      expect(wrapper.emitted('send-message').at(-1)).to.deep.equal([{ materialRefs: [{ kind: 'WORKSPACE_VERSION', fileId: 'photo', version: '1' }] }])
      state.items.value[0].latestVersion = '2'
      expect(wrapper.emitted('update:material-refs').at(-1)[0][0].version).to.equal('1')
      await wrapper.setProps({ selectedAgent: { agentId: 'b' } }); await settle()
      expect(wrapper.find('.composer-attachment-card').exists()).to.equal(false)
      expect(wrapper.emitted('update:material-refs').at(-1)).to.deep.equal([[]])
    } finally { wrapper.unmount() }
  })
  it('does not silently send all historical conversation associations', async () => {
    const { wrapper, conversation } = panel('private')
    try {
      conversation.links.value = [{ relationId: 'old', fileId: 'old-file', version: '7', role: 'REFERENCE', state: 'ACTIVE' }]
      await settle()
      await wrapper.get('.composer-send').trigger('click')
      expect(wrapper.emitted('send-message').at(-1)).to.deep.equal([{ materialRefs: [] }])
      expect(wrapper.find('.composer-attachment-card').exists()).to.equal(false)
    } finally { wrapper.unmount() }
  })
})

describe('local material handoff does not admit execution', () => {
  it('stages a PRIVATE fixed version without writing associations or sending', async () => {
    const { wrapper, conversation, task } = panel('private')
    try {
      await wrapper.setProps({ conversationId: '', selectedAgent: { agentId: 'agent-a' } })
      await settle()
      const refs = [{ fileId: 'photo', version: '1' }]
      expect(await wrapper.vm.prepareMaterialDraft(refs)).to.deep.equal(refs)
      expect(wrapper.vm.applyMaterialDraft(refs)).to.equal(true)
      refs[0].version = '9'
      expect(wrapper.vm.materialDraft()).to.deep.equal({ scope: 'EXPLICIT', inputs: [{ fileId: 'photo', version: '1' }] })
      expect(conversation.calls).to.deep.equal([])
      expect(task.calls).to.deep.equal([])
      expect(wrapper.emitted('send-message')).to.equal(undefined)
      await wrapper.setProps({ selectedAgent: { agentId: 'agent-b' } })
      expect(wrapper.vm.materialDraft().inputs).to.deep.equal([])
    } finally { wrapper.unmount() }
  })

  it('requires exact TASK linked versions and rechecks removal between prepare and apply', async () => {
    const { wrapper, task } = panel('bounty')
    try {
      task.links.value = [{ fileId: 'photo', version: '1', role: 'INPUT', state: 'ACTIVE' }]
      await settle()
      expect(await wrapper.vm.prepareMaterialDraft([{ fileId: 'photo', version: '2' }])).to.equal(null)
      const prepared = await wrapper.vm.prepareMaterialDraft([{ fileId: 'photo', version: '1' }])
      expect(prepared).to.deep.equal([{ fileId: 'photo', version: '1' }])
      task.links.value = []
      expect(wrapper.vm.applyMaterialDraft(prepared)).to.equal(false)
      expect(task.calls).to.deep.equal([])
      expect(wrapper.emitted('send-message')).to.equal(undefined)
    } finally { wrapper.unmount() }
  })

  for (const locked of [{ conversationBusy: true }, { isStreaming: true }, { isAwaitingReply: true }, { voice: { voiceInteractionLocked: true } }]) {
    it(`does not replace a private material draft while ${Object.keys(locked)[0]}`, async () => {
      const { wrapper } = panel('private')
      try {
        await settle()
        const refs = [{ fileId: 'photo', version: '1' }]
        expect(wrapper.vm.applyMaterialDraft(refs)).to.equal(true)
        await wrapper.setProps(locked)
        expect(await wrapper.vm.prepareMaterialDraft([])).to.equal(null)
        expect(wrapper.vm.applyMaterialDraft([])).to.equal(false)
        expect(wrapper.vm.materialDraft().inputs).to.deep.equal(refs)
      } finally { wrapper.unmount() }
    })
  }

  it('does not replace materials during upload or association writes', async () => {
    const { wrapper, conversation, Picker } = panel('private')
    try {
      await settle()
      wrapper.findComponent(Picker).vm.$emit('upload-busy', true)
      await settle()
      expect(wrapper.vm.applyMaterialDraft([{ fileId: 'photo', version: '1' }])).to.equal(false)
      wrapper.findComponent(Picker).vm.$emit('upload-busy', false)
      conversation.actionState.value = 'saving'
      await settle()
      expect(wrapper.vm.applyMaterialDraft([{ fileId: 'photo', version: '1' }])).to.equal(false)
      conversation.actionState.value = 'idle'
      await settle()
      expect(wrapper.vm.applyMaterialDraft([{ fileId: 'photo', version: '1' }])).to.equal(true)
    } finally { wrapper.unmount() }
  })
})

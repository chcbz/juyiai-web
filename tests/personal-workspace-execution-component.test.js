import { FilePreview, originalFilePreview } from './helpers/file-preview-component.js'
import { filePreviewKind, previewMime } from '../src/utils/filePreview.js'
import { workspaceByteText, validMaterialVersion } from '../src/utils/personalWorkspaceProtocol.js'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'mocha'
import * as Vue from 'vue'
import { compileScript, parse } from '@vue/compiler-sfc'
import { mount, flushPromises } from '@vue/test-utils'
import { deliveryTypeText } from '../src/utils/executionFormats.js'

for (const name of ['Element', 'HTMLElement', 'SVGElement', 'Node']) { if (!globalThis[name] && globalThis.window?.[name]) Object.defineProperty(globalThis, name, { value: globalThis.window[name], configurable: true }) }

const source = readFileSync(new URL('../src/components/workspace/PersonalWorkspace.vue', import.meta.url), 'utf8')
const hallSource = readFileSync(new URL('../src/components/world/JuyiHall.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'PersonalWorkspace.vue' })
let script = compileScript(descriptor, { id: 'personal-workspace-execution-component', inlineTemplate: true }).content
script = script
  .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?\s*$/gm, (_, names) => `var { ${names.replace(/\s+as\s+/g, ': ')} } = Vue`)
  .replace(/^import\s+\{\s*useApiStore\s*\}\s+from\s+['"]@\/stores\/api['"];?\s*$/gm, 'var { useApiStore } = deps')
  .replace(/^import\s+\{\s*useGlobalStore\s*\}\s+from\s+['"]@\/stores\/global['"];?\s*$/gm, 'var { useGlobalStore } = deps')
  .replace(/^import\s+\{\s*savePersonalWorkspaceBlob,\s*usePersonalWorkspace\s*\}\s+from\s+['"]@\/composables\/usePersonalWorkspace['"];?\s*$/gm, 'var { savePersonalWorkspaceBlob, usePersonalWorkspace } = deps')
  .replace(/^import\s+\{\s*usePersonalWorkspaceExecutionHistory\s*\}\s+from\s+['"]@\/composables\/usePersonalWorkspaceExecution['"];?\s*$/gm, 'var { usePersonalWorkspaceExecutionHistory } = deps')
  .replace(/^import\s+\{\s*deliveryTypeText\s*\}\s+from\s+['"]@\/utils\/executionFormats['"];?\s*$/gm, 'var { deliveryTypeText } = deps')
  .replace(/^import\s+\{\s*workspaceByteText,\s*validMaterialVersion\s*\}\s+from\s+['"]@\/utils\/personalWorkspaceProtocol['"];?\s*$/gm, 'var { workspaceByteText, validMaterialVersion } = deps')
  .replace(/^import\s+WorkspaceWriteRecovery\s+from\s+['"][^'"]+['"];?\s*$/gm, "var WorkspaceWriteRecovery = { template: '<section />', props: ['pending'], emits: ['retry'] }")
  .replace(/^import\s+PdfDocumentPreview\s+from\s+['"][^'"]+['"];?\s*$/gm, "var PdfDocumentPreview = { name: 'PdfDocumentPreview', template: '<section />', props: ['blob'] }")
  .replace(/^import\s+RichDocumentPreview\s+from\s+['"][^'"]+['"];?\s*$/gm, "var RichDocumentPreview = { name: 'RichDocumentPreview', template: '<section />', props: ['text', 'kind', 'title'] }")
  .replace(/^import\s+FilePreview\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace('export default', 'return')

const workspaceMock = () => {
  const detail = Vue.ref(null)
  const workspace = {
    hasMoreVersions: Vue.ref(false), versionsState: Vue.ref('idle'), versionsError: Vue.ref(''), writeNotice: Vue.ref(''), detailRetryFileId: Vue.ref(null),
    items: Vue.ref([{ fileId: 'file_1', displayName: '案卷.txt', mediaFamily: 'TEXT', originKind: 'USER_UPLOAD', latestVersion: '1', state: 'ACTIVE' }]), loading: Vue.ref(false), nextCursor: Vue.ref(null), listState: Vue.ref('ready'), error: Vue.ref(''), lastOperation: Vue.ref(null), actionState: Vue.ref('idle'), preview: Vue.ref({ kind: 'none' }), detail,
    pendingWrites: Vue.ref([]), confirmationStale: Vue.ref(false), retryWrite: async () => null, closeDetail: () => { detail.value = null }, refresh: async () => true, loadMore: async () => false, revokePreview: () => {}, upload: async () => null, rename: async () => null, appendVersion: async () => null, previewVersion: async () => null, selectPreviewPart: () => false, download: async () => null, usage: async () => null, trash: async () => null, restore: async () => null, dispose: () => {}
  }
  workspace.select = async fileId => { const value = { file: { fileId, displayName: '案卷.txt', state: 'ACTIVE', latestVersion: '1' }, latestVersion: { version: '1' }, versions: [{ version: '1', originalFilename: '案卷.txt', byteLength: '1', createdAt: 1, contentMimeType: 'text/plain' }] }; detail.value = value; return value }
  return workspace
}
const executionMock = () => ({
  agents: Vue.ref([{ agentId: 'agent_1', name: '林冲' }]), rosterState: Vue.ref('ready'), rosterError: Vue.ref(''), selectedAgentId: Vue.ref('agent_1'), selectedAgent: Vue.ref({ agentId: 'agent_1', name: '林冲' }),
  execution: Vue.ref(null), detailState: Vue.ref('idle'), error: Vue.ref(''), history: Vue.ref([{ executionId: 'exec_old', targetAgentId: 'agent_1', state: 'FAILED', createdAt: 1 }]), historyState: Vue.ref('ready'), historyError: Vue.ref(''), historyNextCursor: Vue.ref(null),
  loadAgents: async () => [], loadHistory: async () => [], selectAgent: () => true, selectHistoryExecution: async () => null, dispose() {}
})

describe('workspace document category and upload selector', () => {
  it('labels DOCUMENT generically and offers supported JSON in the actual upload input', async () => {
    const workspace = workspaceMock(), execution = executionMock()
    workspace.items.value = ['a.json', 'a.md', 'a.html', 'a.docx'].map((name, i) => ({ fileId: `doc_${i}`, displayName: name, mediaFamily: 'DOCUMENT', originKind: 'USER_UPLOAD', latestVersion: '1', state: 'ACTIVE' }))
    const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion,
      deliveryTypeText, useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
      useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
      usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: () => {}
    })
    const wrapper = mount(component, { props: { embedded: true } })
    try {
      await flushPromises()
      for (const row of wrapper.findAll('.treasure-file-row')) {
        assert.equal(row.get('.file-family-label').text(), '文档')
        assert.equal(row.get('.file-list-copy p').text(), '本人上传 · v1')
        assert.ok(!row.text().includes('Word'))
      }
      await wrapper.get('button[aria-label="上传资料"]').trigger('click')
      const accept = wrapper.get('input[type="file"]').attributes('accept').split(',')
      for (const type of ['.json', 'application/json', '.png', '.pdf', '.docx']) assert.ok(accept.includes(type), type)
    } finally { wrapper.unmount() }
  })
})

describe('personal workspace execution receipt presentation', () => {
  it('opens the exact embedded file through the full-row native control and preserves disabled states', async () => {
    const workspace = workspaceMock(); const execution = executionMock()
    const selected = []
    const select = workspace.select
    workspace.select = async id => { selected.push(id); return select(id) }
    const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion,
      deliveryTypeText, useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
      useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
      usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: () => {}
    })
    const wrapper = mount(component, { props: { embedded: true, detailAllowed: false } })
    try {
      await flushPromises()
      const button = () => wrapper.get('.treasure-file-open')
      assert.equal(button().element.tagName, 'BUTTON')
      assert.equal(button().attributes('aria-label'), '查看文件：案卷.txt')
      assert.equal(button().get('svg.hall-control-icon path').attributes('d'), 'm9 5 7 7-7 7')
      assert.equal(button().get('svg').attributes('aria-hidden'), 'true')
      assert.equal(button().element.disabled, true)
      await button().trigger('click')
      assert.deepEqual(selected, [])
      await wrapper.setProps({ detailAllowed: true })
      workspace.actionState.value = 'loading-detail'; await Vue.nextTick()
      assert.equal(button().element.disabled, true)
      await button().trigger('click')
      assert.deepEqual(selected, [])
      workspace.actionState.value = 'idle'; await Vue.nextTick()
      assert.equal(button().element.disabled, false)
      assert.ok(source.includes('.treasure-file-row { position:relative;'))
      assert.ok(source.includes('.treasure-file-row > button.treasure-file-open { position:static;'))
      assert.ok(source.includes(".treasure-file-row > .treasure-file-open::after { content:''; position:absolute; inset:0;"))
      await button().trigger('click'); await flushPromises()
      assert.deepEqual(selected, ['file_1'])
      assert.equal(wrapper.get('.treasure-content').attributes('data-view'), 'preview')
      assert.equal(wrapper.get('.treasure-file-heading h2').text(), '案卷.txt')
    } finally { wrapper.unmount() }
  })

  for (const embedded of [true, false]) {
    it(`renders rich documents in ${embedded ? 'embedded' : 'full'} workspace without image fallback`, async () => {
      const workspace = workspaceMock(); const execution = executionMock()
      workspace.previewVersion = async () => { workspace.preview.value = originalFilePreview('text/markdown', '# 文件'); return workspace.preview.value }
      const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion,
        deliveryTypeText, useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
        useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
        usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: () => {}
      })
      const wrapper = mount(component, { props: { embedded } })
      try {
        await flushPromises()
        if (embedded) await wrapper.get('.treasure-file-row button').trigger('click')
        else {
          await wrapper.findAll('.box-actions button').find(button => button.text().includes('资料柜')).trigger('click')
          await wrapper.get('.file-row').trigger('click'); await flushPromises()
          await wrapper.findAll('.detail-tabs button').find(button => button.text() === '版本与预览').trigger('click')
          await wrapper.get('.version-actions button[aria-label^="预览"]').trigger('click')
        }
        await flushPromises()
        if (!embedded) {
          const accept = wrapper.find('input[type="file"]').attributes('accept')
          for (const extension of ['.html', '.htm', '.md', '.markdown']) assert.ok(accept.split(',').includes(extension))
        }
        assert.match(wrapper.get('iframe').attributes('srcdoc'), /<h1>文件<\/h1>/)
      } finally { wrapper.unmount() }
    })

    it(`renders authorized audio with controls and no autoplay in ${embedded ? 'embedded' : 'full'} workspace`, async () => {
      const workspace = workspaceMock(); const execution = executionMock()
      workspace.items.value[0].mediaFamily = 'AUDIO'
      const select = workspace.select
      workspace.select = async id => {
        const value = await select(id)
        value.file.displayName = 'song.mp3'
        value.versions[0].contentMimeType = 'audio/mpeg'
        value.versions[0].originalFilename = 'song.mp3'
        return value
      }
      workspace.previewVersion = async () => { workspace.preview.value = originalFilePreview('audio/mpeg', 'audio'); return workspace.preview.value }
      const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion,
        deliveryTypeText, useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
        useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
        usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: () => {}
      })
      const wrapper = mount(component, { props: { embedded } })
      try {
        await flushPromises()
        if (embedded) await wrapper.get('.treasure-file-row button').trigger('click')
        else {
          await wrapper.findAll('.box-actions button').find(button => button.text().includes('资料柜')).trigger('click')
          await wrapper.get('.file-row').trigger('click'); await flushPromises()
          await wrapper.findAll('.detail-tabs button').find(button => button.text() === '版本与预览').trigger('click')
          await wrapper.get('.version-actions button[aria-label^="预览"]').trigger('click')
        }
        await flushPromises()
        const audio = wrapper.get('audio'); const firstAudioUrl = audio.attributes('src')
        assert.match(audio.attributes('src'), /^blob:/)
        assert.doesNotMatch(wrapper.text(), /预览内容不完整/)
        assert.equal(audio.attributes('controls'), '')
        assert.equal(audio.attributes('preload'), 'none')
        assert.equal(audio.attributes('autoplay'), undefined)
        workspace.preview.value = originalFilePreview('audio/mpeg', 'next audio', 'owner:file:2')
        await flushPromises()
        assert.notEqual(wrapper.get('audio').attributes('src'), firstAudioUrl)
        const pdf = new Blob(['%PDF-fixture'], { type: 'application/pdf' })
        workspace.preview.value = originalFilePreview('application/pdf', pdf, 'owner:pdf:1')
        await flushPromises()
        assert.equal(wrapper.findComponent({ name: 'PdfDocumentPreview' }).props('blob'), pdf)
        workspace.preview.value = { kind: 'none' }
        await Vue.nextTick()
        assert.equal(wrapper.findComponent({ name: 'PdfDocumentPreview' }).exists(), false)
      } finally { wrapper.unmount() }
    })
  }

  it('replaces direct execution with a local PRIVATE prefill and keeps history read-only', async () => {
    const workspace = workspaceMock(), execution = executionMock()
    const component = new Function('Vue', 'deps', 'FilePreview', script)(Vue, {
      workspaceByteText, validMaterialVersion, FilePreview, filePreviewKind, previewMime,
      useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
      useGlobalStore: () => ({ user: { id: 'owner-a' } }),
      usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob() {}
    }, FilePreview)
    const wrapper = mount(component)
    try {
      await wrapper.findAll('.box-actions button')[1].trigger('click')
      const form = wrapper.get('.delivery-modal')
      assert.equal(form.find('.delivery-receipt').exists(), false)
      assert.equal(form.findAll('select').length, 1)
      assert.match(form.text(), /历史记录（只读）/)
      await form.get('textarea').setValue('请整理一份说明')
      await form.findAll('button').find(button => button.text() === '在密议中处理').trigger('click')
      assert.deepEqual(wrapper.emitted('open-deliberation'), [[{ mode: 'PRIVATE', taskId: null, targetAgentId: 'agent_1', instruction: '请整理一份说明', inputs: [] }]])
      assert.equal(form.get('textarea').element.value, '请整理一份说明')
      assert.doesNotMatch(form.text(), /撤销本次输入|确认修改并执行|生成交付件/)
    } finally { wrapper.unmount() }
  })

  it('prototype embeds light file rows, replaces the active layer and returns to the fixed source file', async () => {
    const workspace = workspaceMock()
    const execution = executionMock()
    let executionLoads = 0
    execution.loadAgents = execution.loadCapabilities = execution.recover = async () => { executionLoads += 1 }
    const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion,
      deliveryTypeText,
      useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
      useGlobalStore: () => ({ user: { id: 'owner-a' } }),
      usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: () => {}
    })
    const wrapper = mount(component, { attachTo: document.body, props: { embedded: true } })
    try {
      await Vue.nextTick()
      await wrapper.setProps({ compact: true })
      assert.equal(wrapper.classes().includes('is-compact-hall'), true)
      assert.equal(wrapper.find('input[type="file"]').exists(), false)
      assert.equal(wrapper.findAll('.treasure-tabs button').length, 4)
      assert.equal(wrapper.find('.treasure-search').exists(), true)
      assert.equal(wrapper.find('.box-modal').exists(), false)
      assert.equal(wrapper.find('.delivery-modal').exists(), false)
      assert.equal(executionLoads, 0)
      const list = wrapper.find('.treasure-file-list').element
      wrapper.element.scrollTop = 47
      await wrapper.setProps({ detailAllowed: false })
      assert.equal(wrapper.find('.treasure-file-row button').element.disabled, true)
      assert.match(hallSource, /<PersonalWorkspace[\s\S]*?:detail-allowed="true"[\s\S]*?embedded/)
      await wrapper.find('.treasure-file-row button').trigger('click')
      assert.equal(workspace.detail.value, null)
      await wrapper.setProps({ detailAllowed: true })
      await wrapper.find('.treasure-file-row button').trigger('click')
      await flushPromises(); await Vue.nextTick()
      assert.equal(wrapper.find('.treasure-content').attributes('data-view'), 'preview')
      assert.equal(wrapper.find('.treasure-version-tools').exists(), true)
      assert.equal(wrapper.find('.treasure-version-tools label span').text(), '版本')
      assert.equal(wrapper.find('.treasure-version-tools select').element.value, '1')
      assert.match(source, /\.treasure-tabs button:hover[^{]*\{[^}]*background:transparent!important/)
      assert.equal(list.isConnected, false)
      assert.equal(wrapper.find('.treasure-file-list').exists(), false)
      assert.equal(wrapper.text().includes('办事笺'), false)
      workspace.detail.value.versions.push({ version: '2', originalFilename: '新版本.txt', contentMimeType: 'text/plain' })
      workspace.detail.value.file.latestVersion = 2
      await wrapper.findAll('button').find(button => button.text() === '用此资料提需求').trigger('click')
      assert.deepEqual(wrapper.emitted('start-draft')[0][0], {
        originRef: 'juyiting:file', sourceRef: { sourceType: 'FILE', sourceId: 'file_1', version: '1' },
        inputs: [{ fileId: 'file_1', version: '1' }]
      })
      assert.equal(workspace.detail.value.file.latestVersion, 2)
      assert.equal(executionLoads, 0)
      assert.equal(wrapper.vm.canGoBack, true)
      assert.equal(wrapper.vm.back(), true)
      await Vue.nextTick()
      assert.equal(wrapper.find('.treasure-content').attributes('data-view'), 'list')
      assert.equal(wrapper.find('.treasure-file-list').exists(), true)
      assert.equal(wrapper.element.scrollTop, 47)
      assert.equal(document.activeElement, wrapper.find('.treasure-file-row button').element)
      assert.equal(wrapper.vm.back(), false)
    } finally {
      wrapper.unmount()
    }
  })

  it('prototype keeps cursor continuation honest and management is a third logical layer with inline recycle confirmation', async () => {
    const workspace = workspaceMock(); const calls = []; workspace.nextCursor.value = 'next-page'
    workspace.loadMore = async () => { calls.push('more'); workspace.items.value.push({ fileId: 'out-1', displayName: '成果.pdf', originKind: 'AGENT_DELIVERY', latestVersion: '1', state: 'ACTIVE' }); workspace.nextCursor.value = null }
    workspace.usage = async () => ({ fileId: 'a', impactRevision: '1', counts: { taskReferences: '1', conversationReferences: '0', activeInputGrants: '0' } })
    workspace.trash = async value => { calls.push(value); return { state: 'TRASHED' } }
    const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion, deliveryTypeText, useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }), useGlobalStore: () => ({ user: { id: 'owner-a' } }), usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: executionMock, savePersonalWorkspaceBlob: () => {} })
    const wrapper = mount(component, { props: { embedded: true } })
    const click = async text => { await wrapper.findAll('button').find(b => b.text() === text).trigger('click'); await Vue.nextTick(); await Vue.nextTick() }
    try {
      await Vue.nextTick(); await click('成果')
      assert.match(wrapper.text(), /向下滚动自动加载/)
      assert.equal(wrapper.find('.treasure-file-row').exists(), false)
      await workspace.loadMore(); await Vue.nextTick(); assert.match(wrapper.text(), /成果.pdf/)
      await wrapper.get('.treasure-file-row button[aria-label^="查看文件"]').trigger('click'); await flushPromises(); await Vue.nextTick(); assert.equal(wrapper.vm.logicalDepth, 2)
      await wrapper.get('[aria-label="更多文件管理"]').trigger('click'); await Vue.nextTick(); assert.equal(wrapper.vm.logicalDepth, 3)
      assert.equal(wrapper.find('.treasure-preview').exists(), false)
      await click('移入回收站'); assert.match(wrapper.text(), /任务引用 1 条；议事引用 0 条；现存输入授权 0 条/)
      assert.equal(calls.length, 1)
      await click('取消'); assert.equal(calls.length, 1)
      await click('移入回收站'); await click('移入回收站'); assert.equal(calls.length, 2)
      assert.equal(wrapper.find('.treasure-content').attributes('data-view'), 'list')
    } finally { wrapper.unmount() }
  })

})

describe('workspace download view lifetime', () => {
  const prepare = async saver => {
    const workspace = workspaceMock(), execution = executionMock()
    const apiStore = Vue.reactive({ authorizationGeneration: 1, oauthClientId: 'web-client' })
    const component = ((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, { workspaceByteText, validMaterialVersion, deliveryTypeText,
      useApiStore: () => apiStore, useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
      usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: () => execution, savePersonalWorkspaceBlob: saver })
    const wrapper = mount(component, { props: { embedded: true } }); await flushPromises()
    await wrapper.get('.treasure-file-row button').trigger('click'); await flushPromises()
    return { workspace, wrapper, apiStore, download: () => wrapper.get('button[aria-label="下载 v1"]').trigger('click') }
  }
  it('awaits the saver and renders bridge failures for the exact selected version', async () => {
    let rejectSave, saving
    const entered = new Promise(resolve => { saving = resolve })
    const h = await prepare(options => { assert.equal(options.isCurrent(), true); saving(); return new Promise((resolve, reject) => { rejectSave = reject }) })
    const versions = []; h.workspace.download = async version => { versions.push(version); return { blob: new Blob(['a']), filename: 'fixed-v1.txt' } }
    try {
      await h.download(); await entered
      rejectSave(new Error('原生桥接失败')); await flushPromises()
      assert.deepEqual(versions, ['1']); assert.equal(h.workspace.error.value, '原生桥接失败'); assert.match(h.wrapper.text(), /原生桥接失败/)
    } finally { h.wrapper.unmount() }
  })
  for (const stage of ['download', 'bridge']) for (const change of ['identity', 'unmount']) it(`fences ${change} during ${stage} without posting or overwriting workspace error`, async () => {
    let resolveDownload, rejectSave, guard, saves = 0
    const h = await prepare(options => { saves++; guard = options.isCurrent; return new Promise((resolve, reject) => { rejectSave = reject }) })
    h.workspace.download = () => stage === 'download' ? new Promise(resolve => { resolveDownload = resolve }) : Promise.resolve({ blob: new Blob(['a']), filename: 'v1.txt' })
    await h.download(); await flushPromises()
    if (change === 'identity') { h.apiStore.authorizationGeneration++; await Vue.nextTick() } else h.wrapper.unmount()
    h.workspace.error.value = 'new view error'
    if (stage === 'download') { resolveDownload({ blob: new Blob(['old']), filename: 'v1.txt' }) }
    else { assert.equal(guard(), false); rejectSave(new Error('late bridge failure')) }
    await flushPromises(); assert.equal(h.workspace.error.value, 'new view error'); assert.equal(saves, stage === 'download' ? 0 : 1)
    if (change !== 'unmount') h.wrapper.unmount()
  })
})

// The four embedded tabs share one pagination boundary and the existing request owner.
describe('personal workspace automatic file pagination', () => {
  const mountList = workspace => mount(((vue, deps) => new Function('Vue', 'deps', 'FilePreview', script)(vue, { FilePreview, filePreviewKind, previewMime, ...deps }, FilePreview))(Vue, {
    workspaceByteText, validMaterialVersion, deliveryTypeText,
    useApiStore: () => ({ authorizationGeneration: 1, oauthClientId: 'web-client' }),
    useGlobalStore: () => ({ user: { id: 'owner-a', tenantId: 'tenant-a' } }),
    usePersonalWorkspace: () => workspace, usePersonalWorkspaceExecutionHistory: executionMock,
    savePersonalWorkspaceBlob: () => {}
  }), { props: { embedded: true } })

  for (const label of ['全部', '资料', '成果', '回收站']) {
    it(`automatically appends, pauses on error and retries the same cursor in ${label}`, async () => {
      const previous = globalThis.IntersectionObserver
      const observers = []
      globalThis.IntersectionObserver = class {
        constructor (callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
        observe (target) { this.target = target }
        disconnect () { this.disconnected = true }
      }
      const workspace = workspaceMock()
      workspace.nextCursor.value = 'cursor-next'
      const calls = []
      workspace.loadMore = async filters => { calls.push(filters); workspace.loading.value = true; return true }
      let wrapper
      try {
        wrapper = mountList(workspace)
        await flushPromises()
        const tab = wrapper.findAll('.treasure-tabs button').find(button => button.text() === label)
        await tab.trigger('click'); await flushPromises()
        assert.equal(wrapper.text().includes('读取更多文件'), false)
        assert.equal(wrapper.find('.treasure-empty').exists(), false)
        const first = observers.at(-1)
        first.callback([{ isIntersecting: false }]); assert.equal(calls.length, 0)
        first.callback([{ isIntersecting: true }])
        first.callback([{ isIntersecting: true }])
        await flushPromises()
        assert.equal(calls.length, 1)
        assert.equal(calls[0].state, label === '回收站' ? 'TRASHED' : 'ACTIVE')
        assert.equal(first.disconnected, true)
        assert.equal(wrapper.get('.treasure-list-status').text(), '正在加载更多资料…')
        workspace.listState.value = 'error'; workspace.loading.value = false
        await flushPromises()
        assert.equal(wrapper.find('.treasure-list-status').exists(), false)
        assert.ok(wrapper.text().includes('案卷.txt') || label === '成果')
        const count = observers.length
        await Vue.nextTick(); assert.equal(observers.length, count)
        await wrapper.get('[role="alert"] button').trigger('click')
        assert.equal(calls.length, 2)
        assert.equal(workspace.nextCursor.value, 'cursor-next')
        workspace.listState.value = 'ready'; workspace.loading.value = false
        await flushPromises()
        assert.ok(observers.length > count, 're-arms the observer to fill a still-visible list end')
        // No matching category is a genuine empty state only after the last page.
        workspace.nextCursor.value = null
        await flushPromises()
        if (label === '成果') assert.equal(wrapper.find('.treasure-empty').exists(), true)
        else assert.equal(wrapper.get('.treasure-list-status').text(), '已显示全部资料')
      } finally {
        wrapper?.unmount()
        assert.ok(observers.every(observer => observer.disconnected))
        if (previous === undefined) delete globalThis.IntersectionObserver
        else globalThis.IntersectionObserver = previous
      }
    })
  }
})

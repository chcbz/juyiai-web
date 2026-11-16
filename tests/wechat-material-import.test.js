import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createMiniRuntimeLoader } from './helpers/miniProgramRuntime.js'
import { requestWechatMaterials, readWechatImport, activateWechatImport, isWechatImportActive, clearWechatImport } from '../src/utils/miniProgramMaterialBridge.js'
import { compileScript, parse } from '@vue/compiler-sfc'
import { mount, flushPromises } from '@vue/test-utils'
import * as Vue from 'vue'
import { validMaterialVersion } from '../src/composables/juyiting/materialVersion.js'
import { stopIdentityBoundWork } from '../src/utils/identityLifecycle.js'

const config = JSON.parse(readFileSync(new URL('../miniprogram/juyiting/utils/app-config.json', import.meta.url), 'utf8'))
const miniRoot = fileURLToPath(new URL('../miniprogram/juyiting/', import.meta.url))
const id = '69f021ba-5fc0-4b54-9f40-1467aa7ab26d'
const reference = { fileId: 'pws_existing', version: '1' }
class Storage {
  setItem(key, value) { this[key] = String(value) }
  getItem(key) { return this[key] ?? null }
  removeItem(key) { delete this[key] }
}
const createHost = () => {
  const messages = [], navigations = []
  const host = { __wxjs_environment: 'miniprogram', navigator: {}, document: {}, localStorage: new Storage(),
    location: { href: 'https://kit.chaoyoufan.cn/juyiting?nativeOrientation=landscape#chat' }, crypto: { randomUUID: () => id },
    history: { state: null, replaceState(_state, _title, url) { host.location.href = url } },
    wx: { miniProgram: { postMessage: message => messages.push(message), redirectTo: options => { navigations.push(options); options.success() } } } }
  return { host, messages, navigations }
}
const request = (host, overrides = {}) => requestWechatMaterials({ host, token: 'test-token', webPolicy: config.webPolicy,
  source: { kind: 'home', owner: 'owner-a', draft: '未发送目标' }, scope: 'owner-a', selected: [reference], staged: [reference], ...overrides })
const callback = (host, refs = [reference], state = 'complete') => {
  const url = new URL(host.location.href)
  url.searchParams.set('wechatImport', id); url.searchParams.set('wechatFiles', JSON.stringify(refs)); url.searchParams.set('wechatState', state)
  host.location.href = url.href
}
const settle = async () => { await flushPromises(); await Vue.nextTick() }
const native = () => {
  const state = { pendingImports: Object.create(null), consumedImports: Object.create(null) }
  const uploads = [], navigation = [], copied = [], removed = []
  let choose
  const fs = { mkdir: options => options.success(), copyFile: options => { copied.push(options); options.success() },
    unlink: options => { removed.push(options.filePath); options.success?.() }, rmdir() {} }
  const wx = { env: { USER_DATA_PATH: '/owned' }, getFileSystemManager: () => fs,
    chooseMessageFile: options => { choose = options }, uploadFile: options => { uploads.push(options); return { abort() {} } },
    redirectTo: options => navigation.push(options), navigateBack() {} }
  const load = relative => createMiniRuntimeLoader(miniRoot)(relative, { wx, getApp: () => ({ globalData: state }), setInterval, clearInterval, setTimeout, clearTimeout })
  const { acceptImportMessages } = load('utils/import-messages.js')
  const page = load('utils/import-page.js').createImportPage(config)
  page.data = { ...page.data }; page.setData = value => Object.assign(page.data, value)
  const source = 'https://kit.chaoyoufan.cn/juyiting?nativeOrientation=landscape#chat'
  const message = { protocolVersion: 1, requestId: id, messageType: 'file.import', data: { token: 'test-token', count: 3, returnUrl: source } }
  const accept = value => acceptImportMessages({ detail: { data: [value] } }, state, config)
  const start = () => { accept(message); page.onLoad({ requestId: id, returnUrl: encodeURIComponent(source), returnLabel: encodeURIComponent('返回选择资料'), orientation: 'landscape' }) }
  const respond = (index, alter = () => {}) => {
    const options = uploads[index], key = options.header['X-Request-Id'], fileId = 'pws_' + index
    const response = { statusCode: 200, header: { 'X-Request-Id': key }, data: JSON.stringify({ protocolVersion: 1, requestId: key, code: 'E0', msg: '', data: {
      operation: { state: 'COMMITTED' }, file: { fileId, state: 'ACTIVE' }, version: { fileId, version: '1' } } }) }
    alter(response); options.success(response)
  }
  return { state, wx, page, uploads, navigation, copied, removed, load, start, accept, message, respond, choose: () => choose }
}

describe('WeChat material H5 handoff', () => {
  it('preserves draft before destruction; never persists bearer or puts it in navigation', async () => {
    const { host, messages, navigations } = createHost(); expect(await request(host)).to.equal(id)
    expect(messages[0].data).to.include({ protocolVersion: 1, messageType: 'file.import', requestId: id })
    expect(messages[0].data.data.count).to.equal(31)
    expect(navigations[0].url).to.include('/pages/import/index?').and.include('orientation=landscape')
    expect(navigations[0].url).not.to.include('test-token').and.not.to.include(encodeURIComponent('未发送目标'))
    expect(JSON.stringify(host.localStorage)).not.to.include('test-token')
    callback(host); expect(readWechatImport(host, 'owner-b')).to.equal(null)
    expect(readWechatImport(host, 'owner-a').source.draft).to.equal('未发送目标')
    clearWechatImport(host, id); expect(host.location.href).not.to.include('wechatImport'); expect(Object.keys(host.localStorage)).to.have.length(0)
  })
  it('system-back recovers only same-owner pending mini-program snapshots, without confirmed new refs', async () => {
    const { host } = createHost(); await request(host)
    expect(readWechatImport(host, 'owner-a').status).to.equal('unconfirmed')
    expect(readWechatImport(host, 'owner-a').references).to.deep.equal([])
    host.__wxjs_environment = ''; expect(readWechatImport(host, 'owner-a')).to.equal(null)
  })
  it('rejects numeric versions, excessive results, repeated query and expired records', async () => {
    const { host } = createHost(); await request(host)
    for (const refs of [[{ ...reference, version: 1 }], Array(32).fill(reference)]) { callback(host, refs); expect(readWechatImport(host, 'owner-a')).to.equal(null) }
    callback(host); const url = new URL(host.location.href); url.searchParams.append('wechatImport', id); host.location.href = url.href
    expect(readWechatImport(host, 'owner-a')).to.equal(null)
    url.searchParams.delete('wechatImport'); host.location.href = url.href; callback(host)
    const saved = JSON.parse(host.localStorage.getItem('cyf:wechat-import:' + id)); saved.createdAt = 0
    host.localStorage.setItem('cyf:wechat-import:' + id, JSON.stringify(saved)); expect(readWechatImport(host, 'owner-a')).to.equal(null)
  })
  it('does not hand off when unsupported, identity changes or local preservation fails', async () => {
    for (const mutate of [host => { host.__wxjs_environment = '' }, host => { host.localStorage.setItem = () => { throw Error('storage disabled') } }]) {
      const { host, messages } = createHost(); mutate(host)
      let failed = false; try { await request(host) } catch { failed = true }
      expect(failed).to.equal(true); expect(messages).to.have.length(0)
    }
    const { host, messages } = createHost(); let error
    try { await request(host, { isCurrent: () => false }) } catch (cause) { error = cause }
    expect(error.name).to.equal('AbortError'); expect(messages).to.have.length(0)
  })
  it('drops abandoned handoff on navigation failure but leaves the caller live', async () => {
    const { host } = createHost(); host.wx.miniProgram.redirectTo = options => options.fail()
    let error; try { await request(host) } catch (cause) { error = cause }
    expect(error.message).to.include('未能打开'); expect(Object.keys(host.localStorage)).to.have.length(0)
  })
  it('clears only its namespace on logout', () => {
    localStorage.setItem('cyf:wechat-import:' + id, '{}'); localStorage.setItem('unrelated-draft', 'keep')
    stopIdentityBoundWork(); expect(localStorage.getItem('cyf:wechat-import:' + id)).to.equal(null)
    expect(localStorage.getItem('unrelated-draft')).to.equal('keep'); localStorage.removeItem('unrelated-draft')
  })
})

describe('native WeChat material selector', () => {
  it('generates the strict common envelope decoder from its canonical H5 source', () => {
    const source = readFileSync(new URL('../src/utils/apiEnvelope.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    const expected = '// Generated from src/utils/apiEnvelope.js; do not edit.\n' + source.replace(/^export /gm, '') + '\nmodule.exports = { parseStrictJson, decodeHttpResponse }\n'
    expect(readFileSync(new URL('../miniprogram/juyiting/utils/api-envelope.js', import.meta.url), 'utf8')).to.equal(expected)
  })
  it('validates origin/count/protocol; consumes once; opens the chooser only on user action', () => {
    const n = native()
    for (const invalid of [{ protocolVersion: 2 }, { data: { ...n.message.data, count: 33 } }, { data: { ...n.message.data, returnUrl: 'https://evil.invalid/' } }]) {
      n.accept({ ...n.message, ...invalid }); expect(Object.keys(n.state.pendingImports)).to.have.length(0)
    }
    n.start(); try { expect(n.page.data.ready).to.equal(true); n.accept(n.message); expect(Object.keys(n.state.pendingImports)).to.have.length(0); expect(n.choose()).to.equal(undefined) } finally { n.page.onUnload() }
  })
  it('uploads docs/images via the fixed API, preserving filename extension and return references only', async () => {
    const n = native(); n.start()
    try {
      n.page.chooseFiles(); expect(n.choose()).to.include({ count: 3, type: 'all' })
      n.choose().success({ tempFiles: [{ path: '/temp/a', name: '计划.docx' }, { path: '/temp/b', name: '图片.png' }] }); await settle()
      expect(n.uploads[0].url).to.equal(config.importUploadUrl); expect(n.uploads[0].filePath).to.match(/计划\.docx$/)
      expect(n.uploads[0].header).to.include({ Authorization: 'Bearer test-token', 'Idempotency-Key': id + ':0' })
      n.respond(0); await settle(); n.respond(1); await settle()
      expect(n.page.data.files.map(file => file.state)).to.deep.equal(['committed', 'committed'])
      n.page.returnToSource(); const url = new URL(decodeURIComponent(n.navigation[0].url.split('?url=')[1]))
      expect(JSON.parse(url.searchParams.get('wechatFiles'))).to.deep.equal([{ fileId: 'pws_0', version: '1' }, { fileId: 'pws_1', version: '1' }])
      expect(url.searchParams.get('wechatState')).to.equal('complete'); expect(url.hash).to.equal('#chat')
      expect(url.href).not.to.include('test-token').and.not.to.include(encodeURIComponent('计划'))
    } finally { n.page.onUnload() }
    expect(n.removed).to.have.length(2); expect(n.page.record).to.equal(null)
  })
  it('retains partial success and retries identical path/key, never the committed predecessor', async () => {
    const n = native(); n.start()
    try {
      n.page.chooseFiles(); n.choose().success({ tempFiles: [{ path: '/a', name: 'a.txt' }, { path: '/b', name: 'b.txt' }] }); await settle()
      n.respond(0); await settle(); n.uploads[1].fail(Error('network')); await settle()
      expect(n.page.data.files.map(file => file.state)).to.deep.equal(['committed', 'unknown'])
      const retry = n.page.uploadFiles(); await settle()
      expect(n.uploads[2].header['Idempotency-Key']).to.equal(n.uploads[1].header['Idempotency-Key'])
      expect(n.uploads[2].filePath).to.equal(n.uploads[1].filePath); expect(n.copied).to.have.length(2)
      n.respond(2); await retry; expect(n.page.data.files.map(file => file.state)).to.deep.equal(['committed', 'committed'])
    } finally { n.page.onUnload() }
  })
  it('rejects pending, numeric versions, duplicate envelope fields and missing correlation headers', async () => {
    for (const alter of [r => { r.data = r.data.replace('COMMITTED', 'PROCESSING') }, r => { r.data = r.data.replace('"version":"1"', '"version":1') }, r => { r.data = r.data.replace('"code":"E0"', '"code":"E0","code":"E0"') }, r => { r.header = {} }]) {
      const n = native(); n.start()
      try {
        n.page.chooseFiles(); n.choose().success({ tempFiles: [{ path: '/a', name: 'a.txt' }] }); await settle()
        n.respond(0, alter); await settle(); expect(n.page.data.files[0].state).to.equal('unknown')
        n.page.returnToSource(); expect(decodeURIComponent(n.navigation[0].url)).to.include('wechatState=unconfirmed')
      } finally { n.page.onUnload() }
    }
  })
  it('cancels without uploading, explains unsupported platforms, owns no unrelated paths', () => {
    const n = native(); n.start()
    try {
      n.page.chooseFiles(); n.choose().fail({ errMsg: 'chooseMessageFile:fail cancel' }); expect(n.uploads).to.have.length(0)
      expect(n.page.data.message).to.include('已取消'); delete n.wx.chooseMessageFile; n.page.chooseFiles(); expect(n.page.data.message).to.include('不支持')
      const { ownImportDirectory } = n.load('utils/import-files.js')
      expect(ownImportDirectory('juyiting-import-' + id + '-0', 'juyiting-')).to.equal(true)
      for (const name of ['other-' + id + '-0', 'juyiting-import-' + id + '-32', 'juyiting-import-' + id + '-0/../private']) expect(ownImportDirectory(name, 'juyiting-')).to.equal(false)
    } finally { n.page.onUnload() }
  })
})

const compile = (name, deps) => {
  const { descriptor } = parse(readFileSync(new URL('../src/components/juyiting/' + name + '.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: name, inlineTemplate: true }).content
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?\s*$/gm, (_, names) => `var { ${names.replace(/\s+as\s+/g, ': ')} } = Vue`)
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, names) => `var { ${names} } = deps`)
    .replace(/^import\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, name) => `var ${name} = deps.${name}`)
    .replace('export default', 'return')
  return new Function('Vue', 'deps', script)(Vue, deps)
}
const workspace = () => ({ items: Vue.ref([]), listState: Vue.ref('empty'), nextCursor: Vue.ref(null), detail: Vue.ref(null), preview: Vue.ref({ kind: 'none' }), pendingWrites: Vue.ref([]), loading: Vue.ref(false), error: Vue.ref(''), actionState: Vue.ref('idle'), writeNotice: Vue.ref(''),
  refresh: async () => true, closeDetail() {}, dispose() {}, select: async fileId => ({ file: { fileId, displayName: fileId + '.txt', state: 'ACTIVE' }, versions: [{ fileId, version: '1', contentMimeType: 'text/plain' }] }) })

describe('actual Vue material and composer controls', () => {
  it('ACL-reads fixed versions, restores original selection/text and stages new refs until Complete', async () => {
    const { host } = createHost(); await request(host); callback(host, [{ fileId: 'pws_new', version: '1' }])
    const state = { ...workspace(), wechatSupported: true, readWechatImport: owner => readWechatImport(host, owner), isWechatImportActive, clearWechatImport: value => clearWechatImport(host, value) }
    const Picker = compile('HallMaterialPicker', { usePersonalWorkspace: () => state, validMaterialVersion })
    const wrapper = mount(Picker, { attachTo: document.body, props: { identityScope: 'owner-a', wechatContext: { kind: 'home', owner: 'owner-a', draft: '' } } })
    try {
      activateWechatImport(window, id); await settle()
      expect(wrapper.emitted('restore-wechat-draft')).to.deep.equal([['未发送目标']]); expect(wrapper.emitted('import-materials')).to.equal(undefined)
      expect(wrapper.emitted('update:modelValue')[0][0].map(file => file.fileId)).to.deep.equal(['pws_existing'])
      expect(document.querySelector('.quick-material-confirm').textContent).to.include('2')
      expect(document.querySelectorAll('.quick-material-selection-row input')).to.have.length(3)
      expect(document.querySelector('.quick-material-selection-row input').accept).to.equal('')
      expect(document.querySelector('.quick-material-wechat')).not.to.equal(null)
      document.querySelector('.quick-material-confirm').click(); await settle()
      expect(wrapper.emitted('update:modelValue').at(-1)[0].map(file => file.fileId)).to.deep.equal(['pws_existing', 'pws_new'])
    } finally { wrapper.unmount() }
  })
  it('shows retryable read failure without silently adopting unauthorized versions', async () => {
    const { host } = createHost(); await request(host); callback(host)
    const state = { ...workspace(), readWechatImport: owner => readWechatImport(host, owner), isWechatImportActive, clearWechatImport: value => clearWechatImport(host, value), select: async () => null }
    const wrapper = mount(compile('HallMaterialPicker', { usePersonalWorkspace: () => state, validMaterialVersion }), { attachTo: document.body, props: { identityScope: 'owner-a', wechatContext: { kind: 'home', owner: 'owner-a', draft: '' } } })
    try {
      activateWechatImport(window, id); await settle(); expect(wrapper.emitted('update:modelValue')).to.equal(undefined)
      expect(wrapper.emitted('restore-wechat-draft')).to.deep.equal([['未发送目标']])
      expect(document.querySelector('.quick-material-confirm').disabled).to.equal(true)
      expect(document.querySelector('.quick-material-upload-status').textContent).to.include('暂不可读取'); expect(readWechatImport(host, 'owner-a')).not.to.equal(null)
    } finally { wrapper.unmount(); clearWechatImport(host, id) }
  })
  it('orders text-only 44px composer actions; hides WeChat outside the mini-program', async () => {
    const original = window.matchMedia; window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    const wrapper = mount(compile('HallChatComposer', { HallVoiceControls: { render: () => null } }), { props: { mentionLabel: () => '', wechatAvailable: true, draft: '原草稿' }, global: { stubs: { 'var-icon': true } } })
    try {
      await wrapper.get('.composer-add-materials').trigger('click')
      expect(wrapper.findAll('.composer-material-actions button').map(button => button.text())).to.deep.equal(['拍照', '相册', '微信', '资料'])
      expect(wrapper.findAll('.composer-material-actions svg')).to.have.length(0)
      await wrapper.findAll('.composer-material-actions button')[2].trigger('click'); expect(wrapper.emitted('import-wechat')).to.deep.equal([[]]); expect(wrapper.emitted('send-message')).to.equal(undefined)
      await wrapper.setProps({ wechatAvailable: false }); await wrapper.get('.composer-add-materials').trigger('click')
      expect(wrapper.findAll('.composer-material-actions button').map(button => button.text())).to.deep.equal(['拍照', '相册', '资料'])
      expect(readFileSync(new URL('../src/components/juyiting/HallChatComposer.vue', import.meta.url), 'utf8')).to.match(/\.composer-material-actions button \{[^}]*min-height: 44px/)
    } finally { wrapper.unmount(); window.matchMedia = original }
  })
  it('compiles affected SFCs without a production build', () => {
    for (const file of ['juyiting/HallMaterialPicker', 'juyiting/HallChatComposer', 'juyiting/ChatPanel', 'juyiting/HallOverview', 'world/JuyiHall']) {
      const { descriptor, errors } = parse(readFileSync(new URL('../src/components/' + file + '.vue', import.meta.url), 'utf8'))
      expect(errors).to.deep.equal([]); expect(() => compileScript(descriptor, { id: file, inlineTemplate: true })).not.to.throw()
    }
  })
})

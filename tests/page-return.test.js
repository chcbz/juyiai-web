import { expect } from 'chai'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import * as state from '../src/utils/pageReturnState.js'
import * as coordination from '../src/composables/juyiting/useHallPageReturn.js'
import { resolveWechatImport, hasWechatImportReturn } from '../src/utils/miniProgramMaterialBridge.js'
import { usePersonalWorkspaceWriteIntent } from '../src/composables/usePersonalWorkspaceWriteIntent.js'
import { validMaterialVersion } from '../src/composables/juyiting/materialVersion.js'

class Storage {
  setItem(key, value) { this[key] = String(value) }
  getItem(key) { return this[key] ?? null }
  removeItem(key) { delete this[key] }
}
const fixture = (mode = 'home') => {
  const host = { localStorage: new Storage(), crypto: { randomUUID }, location: { href: 'https://kit.chaoyoufan.cn/juyiting?nativeOrientation=landscape#original' },
    history: { replaceState(_a, _b, url) { host.location.href = url } } }
  const context = mode === 'home' ? { kind: 'home', owner: 'owner', draft: '原草稿' } : { kind: 'chat', owner: 'owner', draft: '原草稿', mode, conversationId: 'thread-original', taskId: mode === 'bounty' ? 'task-original' : '', agentId: mode === 'private' ? 'agent-original' : '' }
  const store = state.createPageReturnStore(host)
  const old = { fileId: 'old', version: '1' }, imported = { fileId: 'new', version: '2147483647' }
  const record = store.prepare({ source: context, scope: 'owner', selected: [old], staged: [old] })
  const callback = (refs = [imported], status = 'complete', id = record.requestId) => {
    const url = new URL(host.location.href)
    url.searchParams.set('wechatImport', id); url.searchParams.set('wechatFiles', JSON.stringify(refs)); url.searchParams.set('wechatState', status)
    host.location.href = url.href
  }
  return { host, context, store, record, callback, old, imported }
}
const settle = async () => { await flushPromises(); await Vue.nextTick(); await flushPromises() }
const compile = (name, deps = {}) => {
  const { descriptor } = parse(readFileSync(new URL(`../src/components/juyiting/${name}.vue`, import.meta.url), 'utf8'))
  const code = compileScript(descriptor, { id: name, inlineTemplate: true }).content
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?\s*$/gm, (_, names) => `var { ${names.replace(/\s+as\s+/g, ': ')} } = Vue`)
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, names) => `var { ${names} } = deps`)
    .replace(/^import\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, name) => `var ${name} = deps.${name}`)
    .replace('export default', 'return')
  return new Function('Vue', 'deps', code)(Vue, { ...state, ...coordination, ...deps })
}
const workspace = () => ({ items: Vue.ref([]), listState: Vue.ref('empty'), nextCursor: Vue.ref(null), detail: Vue.ref(null), preview: Vue.ref({ kind: 'none' }), pendingWrites: Vue.ref([]), loading: Vue.ref(false), error: Vue.ref(''), actionState: Vue.ref('idle'),
  refresh: async () => true, closeDetail() {}, dispose() {}, select: async fileId => ({ file: { fileId, displayName: fileId, state: 'ACTIVE' }, versions: [{ fileId, version: fileId === 'new' ? '2147483647' : '1', contentMimeType: 'text/plain' }] }) })

function mountReturn (f, { currentDraft = '', readOnly = false, confirm, workspaceState = workspace(), prepare = async () => {}, delayedReceiver = false } = {}) {
  let coordinator, receiver
  const text = Vue.ref(currentDraft), selected = Vue.ref([]), ready = Vue.ref(!delayedReceiver), visible = Vue.ref(true)
  const Picker = compile('HallMaterialPicker', { usePersonalWorkspace: () => workspaceState, validMaterialVersion })
  const Page = { setup() {
    receiver = coordination.useHallReturnReceiver({ context: () => ({ ...f.context, draft: text.value }),
      scene: () => ({ draft: text.value, committedSelection: selected.value, stagedSelection: selected.value, materialContext: null, discussionContext: null }),
      apply: scene => { text.value = scene.draft; selected.value = scene.committedSelection }, ready: () => ready.value, readOnly: () => readOnly })
    return () => Vue.h(Picker, { modelValue: selected.value, 'onUpdate:modelValue': value => { selected.value = value }, confirmSelection: confirm,
      wechatContext: { ...f.context, draft: text.value }, identityScope: 'owner', readOnly })
  } }
  const Host = { setup() {
    coordinator = coordination.useHallPageReturn({ host: f.host, owner: () => 'owner', epoch: () => 1, prepareTarget: prepare })
    return () => visible.value ? Vue.h(Page) : null
  } }
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, Picker, text, selected, ready, visible, workspaceState, get coordinator() { return coordinator }, get receiver() { return receiver } }
}

describe('page return durable store', () => {
  it('canonicalizes nullable target fields without changing the picker scope', () => {
    const f = fixture('public')
    expect(state.returnTargetKey('owner', state.returnTarget(f.context))).to.equal(state.returnTargetKey('owner', state.returnTarget({ ...f.context, taskId: null, agentId: null })))
    expect(f.record.snapshot.scope).to.equal('owner')
    expect(f.host.localStorage.getItem(state.PAGE_RETURN_PREFIX + f.record.requestId)).not.to.include('"source":')
  })
  it('accepts PREPARED callback, preserves exact versions and rejects numeric versions', () => {
    const f = fixture(); f.callback()
    expect(resolveWechatImport(f.host, 'owner').result.references).to.deep.equal([f.imported])
    f.callback([{ ...f.imported, version: 1 }])
    expect(() => resolveWechatImport(f.host, 'owner')).to.throw('参数无效')
  })
  it('requires explicit ID, identity and unique callback fields', () => {
    const f = fixture()
    expect(hasWechatImportReturn(f.host)).to.equal(false)
    expect(f.store.list('owner')).to.have.length(1)
    expect(f.store.list('other')).to.have.length(0)
    f.callback(); expect(() => resolveWechatImport(f.host, 'other')).to.throw('当前身份')
    const duplicate = new URL(f.host.location.href); duplicate.searchParams.append('wechatState', 'partial'); f.host.location.href = duplicate.href
    expect(() => resolveWechatImport(f.host, 'owner')).to.throw('重复')
  })
  it('persists first result and refuses same-ID different results', () => {
    const f = fixture(); f.callback()
    const first = resolveWechatImport(f.host, 'owner')
    expect(resolveWechatImport(f.host, 'owner')).to.deep.equal(first)
    f.callback([], 'cancelled')
    expect(() => resolveWechatImport(f.host, 'owner')).to.throw('不同结果')
    expect(f.store.read(f.record.requestId, 'owner').result).to.deep.equal(first.result)
  })
  it('migrates a validated legacy fixture; new records cannot satisfy the legacy source reader', () => {
    const f = fixture('private')
    f.host.localStorage.setItem(state.PAGE_RETURN_PREFIX + f.record.requestId, JSON.stringify({ requestId: f.record.requestId, createdAt: Date.now(), source: f.context, scope: 'owner', selected: [f.old], staged: [f.old], remaining: 31 }))
    const converted = f.store.read(f.record.requestId, 'owner')
    expect(converted.version).to.equal(1)
    expect(converted.snapshot.discussionContext).to.deep.equal({ mentionAgentIds: [], outgoingMetadata: { inputRefs: [] } })
    expect(JSON.parse(f.host.localStorage.getItem(state.PAGE_RETURN_PREFIX + f.record.requestId)).source).to.equal(undefined)
  })
  it('rejects expired/unknown/corrupt records, never treats draft keys as handoffs', () => {
    const f = fixture()
    for (const patch of [{ version: 2 }, { createdAt: 0 }, { expiresAt: 0 }, { operation: 'other' }, { snapshot: {} }]) {
      f.host.localStorage.setItem(state.PAGE_RETURN_PREFIX + f.record.requestId, JSON.stringify({ ...f.record, ...patch }))
      expect(f.store.read(f.record.requestId, 'owner')).to.equal(null)
    }
    expect(f.store.list('owner')).to.deep.equal([])
  })
  it('supersedes A only after B and its source are durable; stale A cannot apply', () => {
    const f = fixture()
    const b = f.store.prepare({ source: f.context, scope: 'owner', selected: [f.old], staged: [f.imported] })
    expect(f.store.source('owner', b.target).activeRequestId).to.equal(b.requestId)
    expect(f.store.read(f.record.requestId, 'owner').supersededBy).to.equal(b.requestId)
    f.callback(); expect(() => resolveWechatImport(f.host, 'owner')).to.throw('后续选择')
    expect(b.snapshot.stagedSelection).to.deep.equal([f.imported])
  })
  it('detects stale record/source writes without overwriting', () => {
    const f = fixture()
    const stale = f.store.source('owner', f.record.target)
    f.store.saveSource('owner', f.record.target, { ...stale, draft: '另一个窗口' }, stale.revision)
    expect(() => f.store.saveSource('owner', f.record.target, stale, stale.revision)).to.throw('其他页面')
    f.store.update(f.record, { phase: 'HANDED_OFF' })
    expect(() => f.store.update(f.record, { phase: 'FINISHED' })).to.throw('已变化')
  })
  it('saves empty post-send source before terminal state; failed terminal write leaves authoritative acceptance', () => {
    const f = fixture(); f.callback()
    const record = resolveWechatImport(f.host, 'owner')
    const realSet = f.host.localStorage.setItem.bind(f.host.localStorage)
    f.host.localStorage.setItem = (key, value) => { if (key === state.PAGE_RETURN_PREFIX + record.requestId) throw Error('quota'); realSet(key, value) }
    expect(() => f.store.finish(record, { ...state.returnScene(record), draft: '', pickerOpen: false })).to.throw('quota')
    expect(f.store.source('owner', record.target)).to.include({ draft: '', acceptedRequestId: record.requestId })
    expect(f.store.read(record.requestId, 'owner').phase).to.equal('RESULT_RECEIVED')
  })
})

describe('page return real picker and scoped coordinator', () => {
  it('delivers after receiver readiness, does not send/associate, survives removal and refresh', async () => {
    const f = fixture(); f.callback()
    let h = mountReturn(f, { delayedReceiver: true })
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('waiting')
      expect(h.text.value).to.equal('')
      h.ready.value = true; await settle()
      expect(h.text.value).to.equal('原草稿')
      expect(h.coordinator.status.value).to.equal('ready')
      expect(f.store.read(f.record.requestId, 'owner').phase).to.equal('RESULT_ACCEPTED')
      const remove = [...document.querySelectorAll('.quick-material-draft li')].find(item => item.textContent.includes('new'))?.querySelector('button')
      expect(remove).not.to.equal(undefined); remove.click(); await settle()
      expect(f.store.read(f.record.requestId, 'owner').checkpoint.stagedSelection).to.deep.equal([f.old])
      h.text.value = '继续编辑'; await settle()
      h.wrapper.unmount(); h = mountReturn(f)
      await h.coordinator.start(); await settle()
      expect(h.text.value).to.equal('继续编辑')
      expect(document.querySelector('.quick-material-confirm').textContent).to.include('1')
    } finally { h.wrapper.unmount() }
  })
  it('keeps unreadable references removable, blocks Complete until removed, no latest substitution', async () => {
    const f = fixture(); f.callback()
    const ws = workspace(); ws.select = async () => null
    const h = mountReturn(f, { workspaceState: ws })
    try {
      await h.coordinator.start(); await settle()
      expect(h.text.value).to.equal('原草稿')
      expect(document.querySelector('.quick-material-confirm').disabled).to.equal(true)
      for (const button of document.querySelectorAll('.quick-material-draft li button')) button.click()
      await settle()
      expect(f.store.read(f.record.requestId, 'owner').checkpoint.stagedSelection).to.deep.equal([])
      expect(document.querySelector('.quick-material-confirm').disabled).to.equal(false)
    } finally { h.wrapper.unmount() }
  })
  it('awaits confirmation while disabled and retains original record on unknown result', async () => {
    const f = fixture(); f.callback()
    let resolve, confirms = 0
    const h = mountReturn(f, { confirm: () => { confirms++; return new Promise(done => { resolve = done }) } })
    try {
      await h.coordinator.start(); await settle()
      document.querySelector('.quick-material-confirm').click(); await settle()
      expect(confirms).to.equal(1)
      expect(document.querySelector('dialog')).not.to.equal(null)
      expect(f.store.read(f.record.requestId, 'owner').phase).to.equal('RESULT_ACCEPTED')
      resolve('unknown'); await settle()
      expect(document.querySelector('dialog')).not.to.equal(null)
      document.querySelector('.quick-material-confirm').click(); await settle(); resolve('confirmed'); await settle()
      expect(f.store.read(f.record.requestId, 'owner').phase).to.equal('FINISHED')
      expect(f.host.location.href).to.include('nativeOrientation=landscape#original').and.not.to.include('wechatImport')
    } finally { h.wrapper.unmount() }
  })
  it('conflicts with a real newer draft and does not overwrite before explicit choice', async () => {
    const f = fixture(); f.callback()
    const h = mountReturn(f, { currentDraft: '新草稿' })
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('conflict'); expect(h.text.value).to.equal('新草稿')
      await h.coordinator.keepCurrent(); await settle()
      expect(f.store.source('owner', f.record.target).draft).to.equal('新草稿')
    } finally { h.wrapper.unmount() }
  })
  it('shows read-only saved scene without waiting for a writable picker', async () => {
    const f = fixture('bounty'); f.callback()
    const h = mountReturn(f, { readOnly: true })
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('readonly'); expect(h.text.value).to.equal('原草稿')
      expect(document.querySelector('dialog')).to.equal(null)
    } finally { h.wrapper.unmount() }
  })
  it('ignores delayed target resolution after user leaves', async () => {
    const f = fixture(); f.callback(); let resolve
    const h = mountReturn(f, { prepare: () => new Promise(done => { resolve = done }) })
    try {
      const flight = h.coordinator.start(); h.coordinator.leave(); resolve(); await flight; await settle()
      expect(h.coordinator.status.value).to.equal('idle'); expect(h.text.value).to.equal('')
    } finally { h.wrapper.unmount() }
  })
})

describe('page return initialization and accepted version lifecycle', () => {
  for (const mode of ['home', 'public', 'private', 'bounty']) {
    for (const cancelled of [true, false]) it(`${mode}: initialization before delivery cannot replace the leaving scene (${cancelled ? 'cancel' : 'files'})`, async () => {
      const f = fixture(mode); f.callback(cancelled ? [] : [f.imported], cancelled ? 'cancelled' : 'complete')
      const h = mountReturn(f, { delayedReceiver: true })
      try {
        await h.coordinator.start(); await settle()
        expect(h.coordinator.status.value).to.equal('waiting')
        // Full-page restoration makes the receiver ready before queued delivery;
        // synchronous child initialization resets material arrays in that same turn.
        h.ready.value = true
        h.selected.value = []
        h.receiver.save()
        expect(f.store.source('owner', f.record.target).revision).to.equal(f.record.sourceRevision)
        expect(f.store.source('owner', f.record.target).pickerOpen).to.equal(true)
        expect(h.receiver.candidate.dirty).to.equal(false)
        await settle()
        expect(h.coordinator.status.value).to.equal('ready')
        expect(h.text.value).to.equal('原草稿')
        expect(f.store.read(f.record.requestId, 'owner').checkpoint.stagedSelection).to.deep.equal(cancelled ? [f.old] : [f.old, f.imported])
      } finally { h.wrapper.unmount() }
    })
  }
  it('does not advance a source revision for an identical durable save', () => {
    const f = fixture(), old = f.store.source('owner', f.record.target)
    expect(f.store.saveSource('owner', f.record.target, old, old.revision)).to.deep.equal(old)
    expect(() => f.store.saveSource('owner', f.record.target, old, randomUUID())).to.throw('其他页面')
  })
  it('recovers an existing UI-only revision difference without a false conflict', async () => {
    const f = fixture(); f.callback()
    const old = f.store.source('owner', f.record.target)
    const saved = f.store.saveSource('owner', f.record.target, { ...old, pickerOpen: false }, old.revision)
    expect(saved.revision).not.to.equal(old.revision)
    const h = mountReturn(f)
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('ready')
      expect(h.text.value).to.equal('原草稿')
    } finally { h.wrapper.unmount() }
  })
  for (const adopt of [false, true]) it(`${adopt ? 'restored' : 'current'} choice synchronizes the revision before subsequent edits`, async () => {
    const f = fixture(); f.callback()
    const h = mountReturn(f, { currentDraft: '当前稿' })
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('conflict')
      const revision = f.store.source('owner', f.record.target).revision
      h.receiver.save() // blocked UI / late initialization cannot overwrite either choice
      expect(f.store.source('owner', f.record.target).revision).to.equal(revision)
      if (adopt) await h.coordinator.useRestored()
      else await h.coordinator.keepCurrent()
      await settle()
      expect(h.coordinator.status.value).to.equal(adopt ? 'ready' : 'idle')
      expect(h.text.value).to.equal(adopt ? '原草稿' : '当前稿')
      expect(h.receiver.candidate.revision).to.equal(f.store.source('owner', f.record.target).revision)
      h.text.value = '' // deleting all text remains a real edit
      await settle()
      h.receiver.save()
      expect(h.coordinator.error.value).to.equal('')
      expect(f.store.source('owner', f.record.target).draft).to.equal('')
      h.text.value = '继续编辑'; await settle()
      expect(f.store.source('owner', f.record.target).draft).to.equal('继续编辑')
    } finally { h.wrapper.unmount() }
  })
  it('still detects another page removing material without changing the text', async () => {
    const f = fixture(); f.callback()
    const old = f.store.source('owner', f.record.target)
    f.store.saveSource('owner', f.record.target, { ...old, stagedSelection: [] }, old.revision)
    const h = mountReturn(f)
    try {
      await h.coordinator.start(); await settle()
      expect(h.coordinator.status.value).to.equal('conflict')
      expect(f.store.source('owner', f.record.target).stagedSelection).to.deep.equal([])
      await h.coordinator.keepCurrent(); await settle()
      expect(f.store.source('owner', f.record.target).stagedSelection).to.deep.equal([])
      expect(h.coordinator.status.value).to.equal('idle')
    } finally { h.wrapper.unmount() }
  })
})

describe('page return durable association intentions', () => {
  const descriptor = { parentKind: 'conversation', parentId: 'thread', action: 'CREATE', fileId: 'file', version: '1', role: 'REFERENCE', relationId: null, ifMatch: null }
  it('persists original key before request, reload retries with the same key/input, never auto-sends', async () => {
    let saved = [], calls = []
    const persistence = { enabled: () => true, read: () => saved, save: value => { saved = JSON.parse(JSON.stringify(value)) } }
    let writes = usePersonalWorkspaceWriteIntent({ persistence, parentKind: 'conversation' })
    const options = { target: JSON.stringify(['thread','file']), input: ['CREATE','1','REFERENCE'], descriptor, execute: async key => { calls.push(key); expect(saved[0].key).to.equal(key); throw Error('network') } }
    try { await writes.run(options) } catch {}
    expect(saved[0].state).to.equal('UNKNOWN')
    writes.clear(); writes = usePersonalWorkspaceWriteIntent({ persistence, parentKind: 'conversation' })
    expect(calls).to.have.length(1); expect(writes.pending.value).to.have.length(1)
    await writes.run({ ...options, execute: async key => { calls.push(key); return 'ok' } })
    expect(calls[0]).to.equal(calls[1]); expect(saved[0].state).to.equal('COMMITTED')
  })
  it('storage failure prevents request; committed local-save failure never labels server result unknown', async () => {
    let saved = [], calls = 0, block = true
    const persistence = { enabled: () => true, read: () => saved, save: value => { if (block || value.some(item => item.state === 'COMMITTED')) throw Error('quota'); saved = JSON.parse(JSON.stringify(value)) } }
    const writes = usePersonalWorkspaceWriteIntent({ persistence, parentKind: 'conversation' })
    const options = { target: '["thread","file"]', input: ['CREATE','1','REFERENCE'], descriptor, execute: async () => { calls++; return 'ok' } }
    try { await writes.run(options) } catch {}
    expect(calls).to.equal(0)
    block = false
    try { await writes.run(options) } catch {}
    expect(calls).to.equal(1)
    expect(saved[0].state).to.equal('SENDING') // retained for idempotent recovery, not deleted
    expect(writes.pending.value).to.have.length(0) // known in-memory COMMITTED, never reclassified UNKNOWN
  })
})


describe('page return completion and read races', () => {
  it('persists user removals during a slow fixed-version read, before any unload', async () => {
    const f = fixture(); f.callback(); let done
    const ws = workspace(); ws.select = () => new Promise(resolve => { done = resolve })
    const h = mountReturn(f, { workspaceState: ws })
    try {
      const flight = h.coordinator.start(); await settle()
      const remove = document.querySelector('.quick-material-draft li button')
      remove.click(); await settle()
      expect(f.store.read(f.record.requestId, 'owner').checkpoint.stagedSelection).to.deep.equal([f.imported])
      h.coordinator.leave(); done(null); await flight
    } finally { h.wrapper.unmount() }
  })
  for (const cancelled of [true, false]) it(`does not revive cleared text on a repeated ${cancelled ? 'cancelled' : 'completed'} callback`, async () => {
    const f = fixture(); f.callback()
    let h = mountReturn(f)
    try {
      await h.coordinator.start(); await settle()
      h.receiver.finish({ committedSelection: [], stagedSelection: [], pickerOpen: false }, cancelled)
      h.text.value = ''; await settle()
      expect(f.store.source('owner', f.record.target).draft).to.equal('')
      h.wrapper.unmount(); f.callback(); h = mountReturn(f)
      await h.coordinator.start(); await settle()
      expect(h.text.value).to.equal('')
      expect(h.coordinator.status.value).to.equal('finished')
      expect(document.querySelector('dialog')).to.equal(null)
    } finally { h.wrapper.unmount() }
  })
  it('rejects finishing against a concurrently changed accepted source', async () => {
    const f = fixture(); f.callback(); const h = mountReturn(f)
    try {
      await h.coordinator.start(); await settle()
      const original = f.store.source('owner', f.record.target)
      f.store.saveSource('owner', f.record.target, { ...original, draft: '另一页面的新稿' }, original.revision)
      expect(() => h.receiver.finish({ pickerOpen: false })).to.throw('草稿已变化')
      expect(f.store.source('owner', f.record.target).draft).to.equal('另一页面的新稿')
    } finally { h.wrapper.unmount() }
  })
  it('projects only consumed discussion metadata into a new snapshot', () => {
    const f = fixture('public')
    const record = f.store.prepare({ source: { ...f.context, discussionContext: { mentionAgentIds: ['agent'], outgoingMetadata: { inputRefs: [{ type: 'LIBRARY', id: 'entry', token: 'secret' }], token: 'secret', libraryCitationId: 'entry' } } }, scope: 'owner', selected: [], staged: [] })
    expect(JSON.stringify(record)).not.to.include('secret')
    expect(record.snapshot.discussionContext.outgoingMetadata.inputRefs).to.deep.equal([{ type: 'LIBRARY', id: 'entry' }])
  })
})


describe('page return paused picker', () => {
  it('keeps an unfinished selection when leaving and explicitly reopening the selector', async () => {
    const f = fixture(); f.callback(); const h = mountReturn(f, { confirm: async () => 'unknown' })
    try {
      await h.coordinator.start(); await settle()
      document.querySelector('.quick-material-confirm').click(); await settle()
      const pause = [...document.querySelectorAll('dialog button')].find(button => button.textContent === '暂存离开')
      pause.click(); await settle()
      expect(document.querySelector('dialog')).to.equal(null)
      expect(f.store.read(f.record.requestId, 'owner').phase).to.equal('RESULT_ACCEPTED')
      expect(f.store.source('owner', f.record.target).stagedSelection).to.deep.equal([f.old, f.imported])
      await h.wrapper.findComponent(h.Picker).vm.$.exposed.open(); await settle()
      expect(document.querySelector('.quick-material-confirm').textContent).to.include('2')
    } finally { h.wrapper.unmount() }
  })
})

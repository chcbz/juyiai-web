const reply = (options, data, headers) => { options.onSuccess?.(data, { headers }); return data }
import { strict as assert } from 'node:assert'
import { describe, it } from 'mocha'
import { ref } from 'vue'
import { usePersonalWorkspace } from '../src/composables/usePersonalWorkspace.js'

const fileView = (overrides = {}) => ({ fileId: 'pws_file', sourceKind: 'UPLOAD', displayName: 'notes.txt', mediaFamily: 'TEXT', state: 'ACTIVE', metadataRevision: '1', latestVersion: '1', createdAt: 1, capabilities: {}, ...overrides })
const versionView = (overrides = {}) => ({ fileId: 'pws_file', version: '1', originalFilename: 'notes.txt', contentMimeType: 'text/plain', byteLength: '5', sha256: 'a'.repeat(64), createdAt: 1, ...overrides })
const deferred = () => { let resolve; const promise = new Promise(res => { resolve = res }); return { promise, resolve } }
const browserFile = (name, type, body = 'hello') => {
  const blob = new Blob([body], { type })
  Object.defineProperty(blob, 'name', { value: name })
  return blob
}

describe('personal workspace browser adapter', () => {
  it('sends a multipart owner-scoped upload with an idempotency key and then reads its exact detail', async () => {
    const calls = []
    const api = { execute: async options => {
      calls.push(options)
      if (options.method === 'POST') return ({ operation: { operationId: 'pwo_1', state: 'COMMITTED', fileId: 'pws_file', fileVersion: '1' }, file: fileView(), version: versionView() })
      return reply(options, { file: fileView(), latestVersion: versionView(), versions: [versionView()], relations: [], derivation: [] }, { etag: '"pws_file:1"' })
    } }
    const workspace = usePersonalWorkspace({ api, identityEpoch: ref('owner-a') })
    const result = await workspace.upload(browserFile('notes.txt', 'text/plain'), '项目笔记')

    assert.equal(result.file.fileId, 'pws_file')
    assert.equal(calls[0].url, '/personal-workspace/files')
    assert.equal(calls[0].method, 'POST')
    assert.ok(calls[0].data instanceof FormData)
    assert.ok(typeof calls[0].headers['Idempotency-Key'] === 'string' && calls[0].headers['Idempotency-Key'].length > 0)
    assert.equal(calls[1].url, '/personal-workspace/files/pws_file')
    assert.equal(workspace.detail.value.etag, '"pws_file:1"')
    workspace.dispose()
  })

  it('accepts legacy rows without originKind so a web rollout does not hide pre-migration files', async () => {
    const api = { execute: async () => (({ items: [fileView({ originKind: undefined })], nextCursor: null, hasMore: false })) }
    const workspace = usePersonalWorkspace({ api, identityEpoch: ref('owner-a') })

    assert.equal(await workspace.refresh({ state: 'ACTIVE' }), true)
    assert.equal(workspace.items.value[0].originKind, undefined)
    workspace.dispose()
  })

  it('rejects an untrusted workspace origin enum rather than rendering a fabricated source', async () => {
    const api = { execute: async () => (({ items: [fileView({ originKind: 'OTHER_OWNER' })], nextCursor: null, hasMore: false })) }
    const workspace = usePersonalWorkspace({ api, identityEpoch: ref('owner-a') })

    assert.equal(await workspace.refresh({ state: 'ACTIVE' }), false)
    assert.equal(workspace.listState.value, 'error')
    workspace.dispose()
  })

  it('drops a late list response after the authenticated identity epoch changes', async () => {
    const epoch = ref('owner-a')
    const wait = deferred()
    const workspace = usePersonalWorkspace({ api: { execute: () => wait.promise }, identityEpoch: epoch })
    const pending = workspace.refresh({ state: 'ACTIVE' })
    epoch.value = 'owner-b'
    wait.resolve(({ items: [fileView()], nextCursor: null, hasMore: false }))
    await pending

    assert.deepEqual(workspace.items.value, [])
    assert.equal(workspace.listState.value, 'idle')
    workspace.dispose()
  })

})

describe('fixed-version original preview sources', () => {
  for (const [filename, mime] of [
    ['poster.png', 'image/png'], ['document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['page.html', 'text/html'],
    ['notes.md', 'text/markdown'], ['legacy.md', 'text/plain'], ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
  ]) it(`returns a lazy authorized original-file source for ${filename}`, async () => {
    const calls = []; const original = new Blob(['original bytes'], { type: mime })
    const version = versionView({ originalFilename: filename, contentMimeType: mime })
    const workspace = usePersonalWorkspace({ api: { execute: async options => {
      calls.push(options)
      if (options.url.endsWith('/content')) return original
      return reply(options, { file: fileView({ displayName: filename }), latestVersion: version, versions: [version], relations: [], derivation: [] }, { etag: '"pws_file:1"' })
    } } })
    try {
      await workspace.select('pws_file')
      const preview = await workspace.previewVersion('1')
      assert.equal(preview.kind, 'file'); assert.equal(preview.source.mimeType, mime)
      assert.equal(preview.source.filename, filename); assert.equal(calls.length, 1)
      const pending = new AbortController()
      assert.equal(await preview.source.load({ signal: pending.signal }), original)
      assert.equal(calls.at(-1).url, '/personal-workspace/files/pws_file/versions/1/content')
      assert.equal(calls.at(-1).needAuth, true)
      assert.equal(calls.some(call => call.url.includes('/preview')), false)
      workspace.revokePreview()
      await assert.rejects(preview.source.load({}), { name: 'AbortError' })
    } finally { workspace.dispose() }
  })
  it('forwards cancellation to the original read without fetching another version', async () => {
    const pending = deferred(); let signal
    const workspace = usePersonalWorkspace({ api: { execute: async options => {
      if (options.url.endsWith('/content')) { signal = options.signal; return pending.promise }
      return reply(options, { file: fileView(), latestVersion: versionView(), versions: [versionView()], relations: [], derivation: [] })
    } } })
    try {
      await workspace.select('pws_file'); const source = (await workspace.previewVersion('1')).source
      const controller = new AbortController(); const reading = source.load({ signal: controller.signal })
      const rejected = assert.rejects(reading, { name: 'AbortError' })
      controller.abort(); assert.equal(signal.aborted, true)
      pending.resolve(new Blob(['late'], { type: 'text/plain' })); await rejected
    } finally { workspace.dispose() }
  })
  it('does not release late content after an identity change', async () => {
    const pending = deferred(); const epoch = ref('owner-a')
    const workspace = usePersonalWorkspace({ identityEpoch: epoch, api: { execute: async options => {
      if (options.url.endsWith('/content')) return pending.promise
      return reply(options, { file: fileView(), latestVersion: versionView(), versions: [versionView()], relations: [], derivation: [] })
    } } })
    try {
      await workspace.select('pws_file'); const source = (await workspace.previewVersion('1')).source
      const reading = source.load({}); const rejected = assert.rejects(reading, { name: 'AbortError' })
      epoch.value = 'owner-b'; pending.resolve(new Blob(['secret'], { type: 'text/plain' })); await rejected
      assert.equal(workspace.preview.value.kind, 'none')
    } finally { workspace.dispose() }
  })
})

describe('common image material uploads', () => {
  for (const [extension, mime] of [['jpg','image/jpeg'],['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp'],['gif','image/gif'],['bmp','image/bmp'],['tif','image/tiff'],['tiff','image/tiff'],['heic','image/heic'],['heif','image/heif'],['avif','image/avif']]) {
    it(`accepts ${extension} without changing the original material`, async () => {
      const calls = []
      const file = fileView({ mediaFamily: 'IMAGE', displayName: `original.${extension}` })
      const version = versionView({ originalFilename: `original.${extension}`, contentMimeType: mime })
      const api = { execute: async options => {
        calls.push(options)
        if (options.method === 'POST') return reply(options, { file, version })
        return reply(options, { file, latestVersion: version, versions: [version], relations: [], derivation: [] }, { etag: '"pws_file:1"' })
      } }
      const workspace = usePersonalWorkspace({ api, identityEpoch: ref('image-test-owner') })
      try {
        await workspace.upload(browserFile(`original.${extension}`, mime), '测试图片')
        assert.equal(calls[0].method, 'POST')
        const uploaded = calls[0].data.get('file')
        assert.equal(uploaded.type, mime)
        assert.equal(await uploaded.text(), 'hello')
      } finally { workspace.dispose() }
    })
  }
})

import { strict as assert } from 'node:assert'
import { describe, it } from 'mocha'
import { ref } from 'vue'
import { usePersonalWorkspace, PERSONAL_WORKSPACE_MIME_TYPES } from '../src/composables/usePersonalWorkspace.js'

const formats = [
  ['sound.mp3', 'audio/mpeg'], ['sound.ogg', 'audio/ogg'], ['sound.oga', 'audio/ogg'],
  ['sound.wav', 'audio/wav'], ['sound.m4a', 'audio/mp4'], ['sound.mp4', 'audio/mp4'],
  ['sound.webm', 'audio/webm'], ['bird.webp', 'image/webp'], ['bird.gif', 'image/gif']
]
const detail = (filename, mime, fileId = 'file-a') => {
  const version = { fileId, version: '1', originalFilename: filename, contentMimeType: mime, byteLength: '5', sha256: 'a'.repeat(64), createdAt: 1 }
  return { file: { fileId, sourceKind: 'UPLOAD', displayName: filename, mediaFamily: mime.startsWith('audio/') ? 'AUDIO' : 'IMAGE', state: 'ACTIVE', metadataRevision: '1', latestVersion: '1', createdAt: 1, capabilities: {} }, latestVersion: version, versions: [version], relations: [], derivation: [] }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

describe('workspace original multimedia transport', () => {
  for (const [filename, mime] of formats) it(`uploads and reads original ${filename} without derived parts`, async () => {
    assert.ok(PERSONAL_WORKSPACE_MIME_TYPES.includes(mime))
    const value = detail(filename, mime); const calls = []; const original = new Blob(['bytes'], { type: mime })
    const workspace = usePersonalWorkspace({ api: { execute: async options => {
      calls.push(options)
      if (options.method === 'POST') return { operation: { operationId: 'op-a', state: 'COMMITTED' }, file: value.file, version: value.latestVersion }
      if (options.url.endsWith('/content')) return original
      return value
    } } })
    try {
      const candidate = new Blob(['bytes'], { type: mime }); Object.defineProperty(candidate, 'name', { value: filename })
      assert.ok(await workspace.upload(candidate)); assert.equal(calls[0].data.get('file').type, mime)
      const preview = await workspace.previewVersion('1')
      assert.equal(preview.kind, 'file'); assert.equal(await preview.source.load({}), original)
      assert.equal(calls.some(call => call.url.includes('/preview')), false)
    } finally { workspace.dispose() }
  })
  it('forwards the AUDIO directory filter without acquiring execution authority', async () => {
    const calls = []
    const workspace = usePersonalWorkspace({ api: { execute: async options => { calls.push(options); return { items: [], nextCursor: null, hasMore: false } } } })
    try {
      assert.equal(await workspace.refresh({ mediaFamily: 'AUDIO' }), true)
      assert.equal(calls[0].params.mediaFamily, 'AUDIO'); assert.ok(calls.every(call => call.method === 'GET'))
    } finally { workspace.dispose() }
  })
  for (const [filename, type, expected] of [
    ['page.html', 'text/html', 'text/html'], ['icon.svg', 'image/svg+xml', 'image/svg+xml'],
    ['archive.zip', 'application/zip', 'application/zip'], ['video.mp4', 'video/mp4', 'video/mp4'],
    ['renamed.mp3', 'text/html', 'text/html'], ['README', '', 'application/octet-stream'],
    ['data.custom', '', 'application/octet-stream'], ['data.custom', 'application/x-custom', 'application/x-custom']
  ]) it(`preserves upload MIME for ${filename} independently of preview support`, async () => {
    const calls = []; const value = detail(filename, expected)
    const workspace = usePersonalWorkspace({ api: { execute: async options => {
      calls.push(options)
      if (options.method === 'POST') return { operation: { operationId: 'op-a', state: 'COMMITTED' }, file: value.file, version: value.latestVersion }
      return value
    } } })
    try {
      assert.ok(await workspace.upload(new File(['opaque'], filename, { type })))
      assert.equal(calls[0].data.get('file').type, expected)
    } finally { workspace.dispose() }
  })
  it('rejects late old-file bytes and keeps the new fixed source', async () => {
    const old = deferred()
    const workspace = usePersonalWorkspace({ api: { execute: async options => {
      if (options.url.endsWith('/content')) return options.url.includes('file-a/') ? old.promise : new Blob(['current'], { type: 'audio/wav' })
      return detail('sound.wav', 'audio/wav', options.url.endsWith('file-b') ? 'file-b' : 'file-a')
    } } })
    try {
      await workspace.select('file-a'); const source = (await workspace.previewVersion('1')).source
      const pending = source.load({}); const rejected = assert.rejects(pending, { name: 'AbortError' })
      await workspace.select('file-b'); const current = (await workspace.previewVersion('1')).source
      old.resolve(new Blob(['stale'], { type: 'audio/wav' })); await rejected
      assert.equal(workspace.preview.value.source.key, current.key)
      assert.equal(await (await current.load({})).text(), 'current')
    } finally { workspace.dispose() }
  })
  it('late preceding-file detail cannot retarget current selection', async () => {
    const old = deferred()
    const workspace = usePersonalWorkspace({ api: { execute: options => options.url.endsWith('file-a') ? old.promise : Promise.resolve(detail('current.wav', 'audio/wav', 'file-b')) } })
    try {
      const preceding = workspace.select('file-a'); await workspace.select('file-b')
      old.resolve(detail('stale.wav', 'audio/wav', 'file-a')); assert.equal(await preceding, null)
      assert.equal(workspace.detail.value.file.fileId, 'file-b')
    } finally { workspace.dispose() }
  })
  it('keeps original PDF bytes and invalidates the source on identity switch', async () => {
    const epoch = ref('owner-a'); const calls = []; const pdf = new Blob(['%PDF-original'], { type: 'application/pdf' })
    const workspace = usePersonalWorkspace({ identityEpoch: epoch, api: { execute: async options => {
      calls.push(options.url)
      return options.url.endsWith('/content') ? pdf : detail('file.pdf', 'application/pdf')
    } } })
    try {
      await workspace.select('file-a'); const preview = await workspace.previewVersion('1')
      assert.equal(await preview.source.load({}), pdf); assert.ok(calls.every(url => !url.includes('/preview')))
      epoch.value = 'owner-b'; assert.equal(workspace.preview.value.kind, 'none')
      await assert.rejects(preview.source.load({}), { name: 'AbortError' })
    } finally { workspace.dispose() }
  })
})

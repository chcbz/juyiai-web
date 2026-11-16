import { strict as assert } from 'node:assert'
import { describe, it } from 'mocha'
import { createApp, nextTick, shallowRef } from 'vue'
import { useFilePreview } from '../src/composables/useFilePreview.js'
import { filePreviewKind, previewMime, assertOfficeContainer, normalizeEmbeddedImageMime } from '../src/utils/filePreview.js'
import { color, cellStyle, displayValue, sheetGeometry, project } from '../src/utils/spreadsheetPreview.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const flush = async () => { for (let i = 0; i < 6; i++) await nextTick() }
const harness = initial => {
  const source = shallowRef(initial)
  let preview
  const app = createApp({ setup () { preview = useFilePreview(source); return () => null } })
  app.mount(document.createElement('div'))
  return { source, preview, close: () => app.unmount() }
}

describe('shared original-file preview lifecycle', () => {
  it('never fetches unsupported legacy formats', async () => {
    let calls = 0
    const h = harness({ key: 'owner:doc:1', filename: 'old.doc', mimeType: 'application/msword', load: () => { calls++; throw Error('must not fetch') } })
    try { await flush(); assert.equal(h.preview.state.value, 'unsupported'); assert.equal(calls, 0) } finally { h.close() }
  })
  it('aborts a previous identity and rejects its late bytes', async () => {
    const delayed = deferred(); let oldSignal
    const h = harness({ key: 'owner-a:file:1', filename: 'secret.txt', mimeType: 'text/plain', load: ({ signal }) => { oldSignal = signal; return delayed.promise } })
    try {
      h.source.value = { key: 'owner-b:file:1', filename: 'current.txt', mimeType: 'text/plain', load: async () => new Blob(['current'], { type: 'text/plain' }) }
      await flush()
      assert.equal(oldSignal.aborted, true)
      delayed.resolve(new Blob(['secret'], { type: 'text/plain' })); await flush()
      assert.equal(h.preview.text.value, 'current'); assert.equal(h.preview.state.value, 'ready')
    } finally { h.close() }
  })
  it('retries the same source after an authorization/read error, never an execution POST', async () => {
    let calls = 0
    const h = harness({ key: 'owner:file:7', filename: 'fixed.txt', mimeType: 'text/plain', load: async () => {
      if (++calls === 1) throw Object.assign(Error('denied'), { status: 403 })
      return new Blob(['v7'], { type: 'text/plain' })
    } })
    try {
      await flush(); assert.equal(h.preview.state.value, 'error'); assert.match(h.preview.message.value, /身份/)
      await h.preview.load(); assert.equal(h.preview.text.value, 'v7'); assert.equal(calls, 2)
    } finally { h.close() }
  })
  it('does not expose mismatched active MIME as an audio resource', async () => {
    const h = harness({ key: 'owner:audio:1', filename: 'voice.mp3', mimeType: 'audio/mpeg', load: async () => new Blob(['<script>bad()</script>'], { type: 'text/html' }) })
    try { await flush(); assert.equal(h.preview.state.value, 'error'); assert.equal(h.preview.url.value, '') } finally { h.close() }
  })
  it('revokes owned image URLs on source changes and unmount', async () => {
    const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL; const revoked = []; let n = 0
    URL.createObjectURL = () => `blob:preview-${++n}`; URL.revokeObjectURL = url => revoked.push(url)
    const make = key => ({ key, filename: 'photo.png', mimeType: 'image/png', load: async () => new Blob(['bytes'], { type: 'image/png' }) })
    const h = harness(make('a'))
    try {
      await flush(); h.source.value = make('b'); await flush()
      assert.deepEqual(revoked, ['blob:preview-1'])
      h.close(); assert.deepEqual(revoked, ['blob:preview-1', 'blob:preview-2'])
    } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
  })
})

describe('format presentation, not conversion', () => {
  it('uses authoritative MIME except the documented generic fallback', () => {
    assert.equal(previewMime('Image/JPG; charset=binary'), 'image/jpeg')
    assert.equal(filePreviewKind('application/octet-stream', 'report.docx'), 'docx')
    assert.equal(filePreviewKind('text/plain', 'report.xlsx'), 'xlsx')
    assert.equal(filePreviewKind('text/html', 'report.docx'), 'html')
    assert.equal(filePreviewKind('application/json', 'data.json'), 'text')
    assert.equal(filePreviewKind('text/csv; charset=utf-8', 'data.csv'), 'text')
    assert.equal(filePreviewKind('application/octet-stream', 'data.csv'), 'text')
    assert.equal(filePreviewKind('', 'data.txt'), 'text')
    assert.equal(filePreviewKind('application/msword', 'data.csv'), '')
    assert.equal(filePreviewKind('application/msword', 'report.docx'), '')
    assert.equal(filePreviewKind('application/vnd.ms-excel', 'report.xls'), '')
    assert.equal(filePreviewKind('image/svg+xml', 'active.svg'), '')
  })
  it('rejects OLE/protected containers without mutating input', () => {
    const bytes = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    assert.throws(() => assertOfficeContainer(bytes.buffer), /受保护或旧版/)
    assert.equal(bytes[0], 0xd0)
  })
  it('normalizes only signature-confirmed generated raster URLs', () => {
    const body = document.createElement('div')
    body.innerHTML = `<img src="data:application/octet-stream;base64,${btoa('\x89PNG\r\n\x1a\nrest')}"><img src="data:application/octet-stream;base64,${btoa('<svg/>')}">`
    normalizeEmbeddedImageMime(body)
    assert.match(body.children[0].getAttribute('src'), /^data:image\/png/)
    assert.match(body.children[1].getAttribute('src'), /^data:application\/octet-stream/)
  })
  it('retains formula zero/false/errors without executing formulas', () => {
    const SSF = { format: () => { throw Error('not required') } }
    assert.equal(displayValue({ formula: 'A1-A1', result: 0 }, false, SSF).text, '0')
    assert.equal(displayValue({ formula: 'A1=A2', result: false }, false, SSF).text, 'FALSE')
    assert.equal(displayValue({ formula: '1/0', result: { error: '#DIV/0!' } }, false, SSF).text, '#DIV/0!')
    assert.match(displayValue({ formula: 'REMOTE()' }, false, SSF).text, /未计算/)
    assert.equal(color({ indexed: 2 }), '#FF0000')
    assert.equal(color({ theme: 0, tint: 0.5 }, ['000000']), '#808080')
  })
  it('keeps General alignment type-sensitive without overriding explicit alignment', () => {
    assert.equal(cellStyle({ value: 123.45 }).textAlign, 'right')
    assert.equal(cellStyle({ formula: 'A1-A1', result: 0 }).textAlign, 'right')
    assert.equal(cellStyle({ value: new Date('2026-11-16T00:00:00Z') }).textAlign, 'right')
    assert.equal(cellStyle({ value: '00123' }).textAlign, 'left')
    assert.equal(cellStyle({ value: false }).textAlign, 'center')
    assert.equal(cellStyle({ formula: '1/0', result: { error: '#DIV/0!' } }).textAlign, 'center')
    assert.equal(cellStyle({ value: 123, alignment: { horizontal: 'left' } }).textAlign, 'left')
  })
  it('inherits cell fonts in rich runs unless a run explicitly overrides them', () => {
    const sheet = { rowCount: 1, columnCount: 1, properties: {}, model: {}, getCell: () => ({
      font: { name: 'Times New Roman', size: 16, color: { argb: 'FFFF0000' } },
      value: { richText: [{ text: 'Inherited' }, { text: 'Bold', font: { bold: true } }] }
    }) }
    const view = project(sheet, sheetGeometry(sheet), { top: 0, left: 0, width: 100, height: 30 }, false, {}, [])
    assert.equal(view.cells[0].style.fontSize, '16pt')
    assert.equal(view.cells[0].style.color, '#FF0000')
    assert.deepEqual(view.cells[0].runs[0].style, {})
    assert.deepEqual(view.cells[0].runs[1].style, { fontWeight: 'bold' })
  })
  it('projects sparse million-row spans and merged anchors without dense traversal', () => {
    let reads = 0
    const sheet = { rowCount: 1000000, columnCount: 4, properties: {}, model: {
      rows: [{ number: 2, hidden: true }], cols: [{ min: 2, max: 2, hidden: true }], merges: ['A1:C3']
    }, getCell (r, c) { reads++; return { value: `${r}:${c}` } } }
    const geometry = sheetGeometry(sheet)
    assert.ok(geometry.rows.segments.length < 5)
    const view = project(sheet, geometry, { top: 20, left: 64, width: 128, height: 40 }, false, { format: String }, [])
    assert.equal(view.cells[0].key, '1:1'); assert.equal(view.cells[0].top, 0)
    assert.ok(reads < 20)
    assert.equal(view.cells.filter(cell => cell.key === '1:1').length, 1)
  })
})

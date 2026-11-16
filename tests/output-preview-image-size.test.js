import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { outputPreviewKind as policy } from '../src/composables/useOutputs.js'

describe('Formal output shared original preview policy', () => {
  it('previews the real revised PNG and JPEG above the text threshold', () => {
    for (const mimeType of ['image/png', 'image/jpeg']) {
      assert.equal(policy({ mimeType, byteLength: 1429926 }), 'image')
      assert.equal(policy({ mimeType, byteLength: 64 * 1024 * 1024 }), 'image')
    }
  })
  it('rejects invalid or out-of-contract lengths before choosing a decoder', () => {
    for (const byteLength of [undefined, null, -1, 1.5, NaN, Infinity, '1429926']) {
      assert.equal(policy({ mimeType: 'image/png', byteLength }), 'none')
    }
  })
  it('uses shared original formats without arbitrary size thresholds', () => {
    for (const mimeType of ['text/plain']) {
      assert.notEqual(policy({ mimeType, byteLength: 1024 * 1024 }), 'none')
      assert.equal(policy({ mimeType, byteLength: 1024 * 1024 + 1 }), 'text')
    }
    assert.equal(policy({ mimeType: 'application/pdf', byteLength: 1429926 }), 'pdf')
    assert.equal(policy({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', byteLength: 1429926 }), 'docx')
  })
  it('does not preview PowerPoint files even when server metadata advertises preview', () => {
    for (const mimeType of ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint']) {
      assert.equal(policy({ mimeType, byteLength: 1024, canPreview: true }), 'none')
    }
  })
  it('does not enable SVG or unknown formats as raster images', () => {
    for (const mimeType of ['image/svg+xml', 'application/octet-stream']) assert.equal(policy({ mimeType, byteLength: 1429926 }), 'none')
  })
  it('delegates rendering to the shared preview instead of duplicating decoding policy', () => {
    const renderer = readFileSync(new URL('../src/components/outputs/OutputPreview.vue', import.meta.url), 'utf8')
    assert.match(renderer, /<FilePreview/)
    assert.doesNotMatch(renderer, /width > 4096|16_000_000|URL\.createObjectURL/)
    // Shared MIME, cancellation and URL lifetime are exercised with real Vue
    // lifecycles in file-preview.test.js, not copied into this caller.
  })
})

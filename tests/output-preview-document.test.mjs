import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const source = read('composables/useOutputs.js')
assert.match(source, /async preview[\s\S]*return this.download\(request\)/)
assert.match(source, /deliverables\/\$\{encodeURIComponent\(artifactId\)\}\/versions\/\$\{artifactVersion\}\/content/)
assert.match(source, /personal-workspace\/files\/\$\{encodeURIComponent\(fileId\)\}\/versions\/\$\{fileVersion\}\/content/)
assert.doesNotMatch(source, /preview\/parts|view: 'parts'|storageUri|EXTRACTED_TEXT/)
for (const component of ['outputs/OutputPreview', 'workspace/PersonalWorkspace', 'juyiting/HallMaterialPicker', 'juyiting/HallMessageMedia', 'juyiting/HallDraftEditor', 'juyiting/BountyExecutionOutputs']) {
  const text = read(`components/${component}.vue`)
  assert.match(text, /<FilePreview/)
  assert.doesNotMatch(text, /selectPreviewPart|kind === 'parts'/)
}
const word = read('components/preview/DocxPreview.vue')
assert.match(word, /renderAltChunks: false/)
assert.match(word, /normalizeEmbeddedImageMime\(body\)/)
assert.match(word, /RichDocumentPreview/)
assert.doesNotMatch(word, /allow-scripts|postMessage|v-html/)
console.log('Original-file preview source wiring checked (not a runtime acceptance test)')

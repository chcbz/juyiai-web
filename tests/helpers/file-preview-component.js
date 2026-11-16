// Compile the real shared viewer for the existing non-bundling component harness.
// Office/PDF parsers are separate browser integrations; this harness retains the
// real source lifecycle and HTML/Markdown/image/audio/text rendering.
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { useFilePreview } from '../../src/composables/useFilePreview.js'
import { richDocumentSource } from '../../src/utils/richDocumentPreview.js'

const compile = (path, imports, rewrite = value => value) => {
  const { descriptor } = parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const source = rewrite(compileScript(descriptor, { id: 'original-file-test', inlineTemplate: true }).content)
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, names, key) => `const { ${names.replace(/\s+as\s+/g, ': ')} } = imports[${JSON.stringify(key)}]`)
    .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, key) => `const ${name} = imports[${JSON.stringify(key)}]`)
    .replace('export default', 'return')
  return new Function('imports', source)({ vue: Vue, ...imports })
}
export const RichDocumentPreview = compile('../../src/components/outputs/RichDocumentPreview.vue', { '../../utils/richDocumentPreview.js': { richDocumentSource } })
export const FilePreview = compile('../../src/components/preview/FilePreview.vue', {
  '../../composables/useFilePreview.js': { useFilePreview },
  '../outputs/RichDocumentPreview.vue': RichDocumentPreview
}, source => source.replace(/const (DocxPreview|SpreadsheetPreview|PdfDocumentPreview) = defineAsyncComponent\([^\n]+/g,
  (_, name) => `const ${name} = { name: '${name}', props: ['blob', 'title'], template: '<section class="${name === 'PdfDocumentPreview' ? 'pdf-preview-stub pdf-preview-test-slot' : 'office-preview-test-slot'}" />' }`))

export const originalFilePreview = (mimeType, bytes, key = 'owner:file:1', filename = 'original') => ({
  kind: 'file', message: '', source: { key, filename, mimeType,
    load: async () => bytes instanceof Blob ? bytes : new Blob([bytes], { type: mimeType }) }
})

import { readFileSync, writeFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/utils/apiEnvelope.js', import.meta.url), 'utf8')
const output = '// Generated from src/utils/apiEnvelope.js; do not edit.\n' + source.replace(/^export /gm, '') + '\nmodule.exports = { parseStrictJson, decodeHttpResponse }\n'
writeFileSync(new URL('../miniprogram/juyiting/utils/api-envelope.js', import.meta.url), output)

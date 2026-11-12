import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import configure from '../vite.config.js'

test('local configuration needs no distributed certificate and supports explicit private TLS files', () => {
  const names = ['VITE_DEV_HTTPS_KEY', 'VITE_DEV_HTTPS_CERT', 'VITE_DEV_HTTPS_PASSPHRASE']
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]))
  const dir = mkdtempSync(join(tmpdir(), 'juyiai-tls-'))
  try {
    names.forEach(name => delete process.env[name])
    assert.equal(configure({ mode: 'migration-test' }).server.https, undefined)
    writeFileSync(join(dir, 'key'), 'fixture-key')
    writeFileSync(join(dir, 'cert'), 'fixture-cert')
    process.env.VITE_DEV_HTTPS_KEY = join(dir, 'key')
    process.env.VITE_DEV_HTTPS_CERT = join(dir, 'cert')
    const tls = configure({ mode: 'migration-test' }).server.https
    assert.equal(tls.key.toString(), 'fixture-key')
    assert.equal(tls.cert.toString(), 'fixture-cert')
    assert.equal(tls.passphrase, undefined)
    process.env.VITE_DEV_HTTPS_PASSPHRASE = 'fixture-passphrase'
    assert.equal(configure({ mode: 'migration-test' }).server.https.passphrase, 'fixture-passphrase')
  } finally {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name]
      else process.env[name] = before[name]
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

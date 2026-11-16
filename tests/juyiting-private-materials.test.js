import { expect } from 'chai'
import { freezePrivateMaterialRefs } from '../src/composables/juyiting/hallPrivateMaterials.js'
import { captureHallVoiceSnapshot } from '../src/composables/juyiting/useHallVoiceConversation.js'

const file = (fileId = 'file-a', version = '3') => ({ kind: 'WORKSPACE_VERSION', fileId, version })
const asset = { kind: 'CURRENT_CONVERSATION_ASSET', assetId: 'asset-a', revision: '9223372036854775807' }

describe('PRIVATE fixed material intent', () => {
  it('freezes exact versions, strips presentation data and deduplicates in user order', () => {
    const input = [{ ...file(), displayName: 'budget.xlsx' }, file('file-b'), file()]
    const result = freezePrivateMaterialRefs(input)
    input[0].version = '4'
    input.push(file('file-c'))
    expect(result).to.deep.equal([file(), file('file-b')])
    expect(Object.isFrozen(result)).to.equal(true)
    expect(Object.isFrozen(result[0])).to.equal(true)
  })
  it('permits empty materials but never latest or noncanonical versions', () => {
    expect(freezePrivateMaterialRefs()).to.deep.equal([])
    for (const version of ['latest', '03', '0', 3, '2147483648']) {
      expect(() => freezePrivateMaterialRefs([file('file-a', version)])).to.throw(TypeError)
    }
    expect(() => freezePrivateMaterialRefs(null)).to.throw(TypeError)
  })
  it('requires an existing conversation for a precise asset revision', () => {
    expect(() => freezePrivateMaterialRefs([asset])).to.throw(TypeError)
    expect(freezePrivateMaterialRefs([asset], '42')).to.deep.equal([asset])
    expect(() => freezePrivateMaterialRefs([{ ...asset, revision: '9223372036854775808' }], '42')).to.throw(TypeError)
  })
  it('bounds distinct selections, not duplicate representations', () => {
    expect(freezePrivateMaterialRefs(Array.from({ length: 33 }, () => file()))).to.have.length(1)
    expect(() => freezePrivateMaterialRefs(Array.from({ length: 33 }, (_, i) => file(`file-${i}`)))).to.throw(TypeError)
  })
  it('voice CAS binds material versions and retains an immutable original snapshot', () => {
    const context = { conversationId: '', conversationScopeType: 'private', conversationScopeKey: 'agent:a', mode: 'private',
      targetAgentIds: ['a'], participantAgentIds: ['a'], materialRefs: [file()] }
    const snapshot = captureHallVoiceSnapshot({ context, draft: '整理这份表格', draftRevision: 1 })
    context.materialRefs[0].version = '4'
    expect(snapshot.materialRefs).to.deep.equal([file()])
    expect(captureHallVoiceSnapshot({ context, draft: snapshot.draft, draftRevision: 1 }).cas).not.to.equal(snapshot.cas)
  })
})

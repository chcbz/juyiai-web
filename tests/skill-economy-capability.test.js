import { expect } from 'chai'
import { readFileSync } from 'node:fs'

const capabilitySource = readFileSync(new URL('../src/utils/economyPreviewCapability.js', import.meta.url), 'utf8')
const capability = new Function('economyApi', capabilitySource.replace(/^import .*$/m, '').replace(/export /g, '') + '\nreturn { readEconomyCapability, loadEconomyPreviewCapability, isEconomyPreviewCapability, isSkillMarketplaceCapability }')({})
const routerSource = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const guardsSource = routerSource.slice(routerSource.indexOf('const capabilityRouteGuard ='), routerSource.indexOf('export default ['))
const guards = loader => new Function('loadEconomyPreviewCapability', 'isEconomyPreviewCapability', 'isSkillMarketplaceCapability', 'economyPreviewBuildEnabled', guardsSource + '\nreturn { capabilityRouteGuard }')(loader, capability.isEconomyPreviewCapability, capability.isSkillMarketplaceCapability, false)
const available = { economyPreviewEnabled: false, skillMarketplaceEnabled: true, principalScopeSha256: 'a'.repeat(64) }

describe('skill capability is independent from economic preview', () => {
  it('opens the skill route independently and leaves wallet availability to its page', async () => {
    expect(capability.isEconomyPreviewCapability(available)).to.equal(false)
    expect(capability.isSkillMarketplaceCapability(available)).to.equal(true)
    const route = guards(async () => available)
    expect(await route.capabilityRouteGuard(capability.isSkillMarketplaceCapability)).to.equal(true)
    expect(routerSource).to.include('beforeEnter: () => capabilityRouteGuard(isSkillMarketplaceCapability)')
    expect(routerSource).not.to.include('beforeEnter: economyPreviewRouteGuard')
  })
  it('still rejects a disabled skill service, invalid scope, or failed capability request', async () => {
    for (const value of [null, { ...available, skillMarketplaceEnabled: false }, { ...available, principalScopeSha256: '' }]) {
      expect(capability.isSkillMarketplaceCapability(value)).to.equal(false)
      expect(await guards(async () => value).capabilityRouteGuard(capability.isSkillMarketplaceCapability)).to.deep.equal({ name: 'UserProfile' })
    }
    expect(await guards(async () => { throw new Error('unavailable') }).capabilityRouteGuard(capability.isSkillMarketplaceCapability)).to.deep.equal({ name: 'UserProfile' })
  })
})


describe('hosting capability actual decoder contract', () => {
  it('preserves the current four-field API response and its setup switch', () => {
    const current = { ...available, economyPreviewEnabled: true, hostingSetupEnabled: true }
    expect(capability.readEconomyCapability(current)).to.equal(current)
    expect(capability.isEconomyPreviewCapability(current)).to.equal(true)
    expect(capability.isSkillMarketplaceCapability(current)).to.equal(true)
  })
  it('keeps older responses usable without inventing setup authorization', () => {
    expect(capability.readEconomyCapability(available)).to.equal(available)
    expect(capability.readEconomyCapability(available).hostingSetupEnabled).to.equal(undefined)
    expect(capability.readEconomyCapability({ ...available, hostingSetupEnabled: false }).hostingSetupEnabled).to.equal(false)
  })
  it('ignores harmless added metadata but rejects malformed known flags and identity', () => {
    expect(capability.readEconomyCapability({ ...available, description: 'additive metadata' })).not.to.equal(null)
    for (const hostingSetupEnabled of [null, 'true', 1, {}, []]) {
      expect(capability.readEconomyCapability({ ...available, hostingSetupEnabled })).to.equal(null)
    }
    expect(capability.readEconomyCapability({ ...available, hostingSetupEnabled: true, principalScopeSha256: '' })).to.equal(null)
  })
})

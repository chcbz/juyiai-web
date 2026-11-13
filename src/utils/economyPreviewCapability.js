import { economyApi } from '@/composables/useHttp'

export const readEconomyCapability = capability =>
  capability && typeof capability === 'object' && !Array.isArray(capability) &&
  typeof capability.economyPreviewEnabled === 'boolean' &&
  (!Object.hasOwn(capability, 'hostingSetupEnabled') || typeof capability.hostingSetupEnabled === 'boolean') &&
  typeof capability.skillMarketplaceEnabled === 'boolean' && typeof capability.principalScopeSha256 === 'string' &&
  /^[0-9a-f]{64}$/.test(capability.principalScopeSha256) ? capability : null

export const isEconomyPreviewCapability = capability => readEconomyCapability(capability)?.economyPreviewEnabled === true
export const isSkillMarketplaceCapability = capability => readEconomyCapability(capability)?.skillMarketplaceEnabled === true

/**
 * Capability API: GET /economy/capabilities. Missing or malformed data is
 * deliberately disabled; no wallet response or browser identity is a fallback.
 */
export const loadEconomyPreviewCapability = async ({ signal } = {}) =>
  readEconomyCapability(await economyApi.get('/capabilities', undefined, { autoLoading: false, signal }))

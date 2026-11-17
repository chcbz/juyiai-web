import { expect } from 'chai'
import { createPinia, setActivePinia } from 'pinia'
import { useApiStore } from '../../src/stores/api.js'
import { useGlobalStore } from '../../src/stores/global.js'

const putToken = () => localStorage.setItem('api_token', JSON.stringify({ data: 'retained-token', expTime: Date.now() + 60000 }))
const wire = (status, headers, data = null) => new Response(JSON.stringify({
  protocolVersion: 1, requestId: headers['X-Request-Id'], code: status === 200 ? 'E0' : 'DENIED', msg: 'test', data
}), { status, headers: { 'X-Request-Id': headers['X-Request-Id'] } })

describe('Profile hydration shared reauthentication', () => {
  let originalFetch, store, starts, requests
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    putToken()
    originalFetch = global.fetch
    store = useApiStore()
    store.baseUrl = 'https://api.example'
    starts = 0
    requests = 0
    store.beginAuthorization = async () => { starts++; return true }
  })
  afterEach(() => { global.fetch = originalFetch; localStorage.clear() })

  for (const empty of [false, true]) {
    it(`reauthenticates on ${empty ? 'empty' : 'enveloped'} profile 401 without replay`, async () => {
      global.fetch = async (_url, { headers }) => {
        requests++
        return empty ? new Response(null, { status: 401 }) : wire(401, headers)
      }
      const [result] = await Promise.allSettled([store.getUserInfo()])
      expect(result.status).to.equal('rejected')
      expect(result.reason.status).to.equal(401)
      expect(localStorage.getItem('api_token')).to.equal(null)
      expect(starts).to.equal(1)
      expect(requests).to.equal(1)
      expect(useGlobalStore().user.id).to.equal(null)
    })
  }

  it('coalesces concurrent profile 401s and never replays', async () => {
    let release
    store.beginAuthorization = () => { starts++; return new Promise(resolve => { release = resolve }) }
    global.fetch = async () => { requests++; return new Response(null, { status: 401 }) }
    const pending = Promise.allSettled([store.getUserInfo(), store.getUserInfo()])
    for (let i = 0; i < 30 && !release; i++) await new Promise(resolve => setTimeout(resolve, 0))
    expect(starts).to.equal(1)
    release(true)
    const results = await pending
    expect(results.every(result => result.reason?.status === 401)).to.equal(true)
    expect(requests).to.equal(2)
    expect(starts).to.equal(1)
  })

  for (const kind of ['403', 'network']) {
    it(`does not reauthenticate for ${kind}`, async () => {
      global.fetch = async (_url, { headers }) => {
        if (kind === 'network') throw new TypeError('network unavailable')
        return wire(403, headers)
      }
      const [result] = await Promise.allSettled([store.getUserInfo()])
      expect(result.status).to.equal('rejected')
      expect(starts).to.equal(0)
      expect(localStorage.getItem('api_token')).not.to.equal(null)
    })
  }

  it('does not reauthenticate or clear a new token for a late 401 after identity switch', async () => {
    let respond
    global.fetch = () => new Promise(resolve => { respond = resolve })
    const pending = Promise.allSettled([store.getUserInfo()])
    for (let i = 0; i < 30 && !respond; i++) await new Promise(resolve => setTimeout(resolve, 0))
    store.clearIdentity()
    putToken()
    respond(new Response(null, { status: 401 }))
    const [result] = await pending
    expect(result.reason.name).to.equal('AbortError')
    expect(starts).to.equal(0)
    expect(localStorage.getItem('api_token')).not.to.equal(null)
  })

  it('hydrates a valid profile through the shared request', async () => {
    global.fetch = async (url, { headers }) => {
      expect(url).to.equal('https://api.example/user/my')
      expect(headers.Authorization).to.equal('Bearer retained-token')
      return wire(200, headers, { id: 5, tenantId: '0', jiacn: 'hero' })
    }
    expect((await store.getUserInfo()).id).to.equal(5)
    expect(useGlobalStore().user.id).to.equal(5)
    expect(starts).to.equal(0)
  })
})

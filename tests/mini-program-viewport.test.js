import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { JSDOM, ResourceLoader } from 'jsdom'

const entry = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const asset = 'mini-program-viewport.v2.js'
const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile MicroMessenger/8.0.60'
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) MicroMessenger/8.0.60 miniProgram'
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MicroMessenger/4.0 miniProgram'

const boot = ({ ua = android + ' miniProgram', env, url = 'https://example.test/' } = {}) => {
  const dom = new JSDOM(entry, { url, runScripts: 'outside-only' })
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: ua })
  dom.window.__wxjs_environment = env
  const script = dom.window.document.querySelector(`script[src$="${asset}"]`)
  if (script) dom.window.eval(readFileSync(new URL('../public/' + asset, import.meta.url), 'utf8'))
  return dom
}
const content = dom => dom.window.document.querySelector('meta[name="viewport"]').content
const assertFixed = dom => {
  expect(content(dom)).to.include('minimum-scale=1')
  expect(content(dom)).to.include('maximum-scale=1')
  expect(content(dom)).to.include('user-scalable=no')
}

describe('Mini-program fixed app viewport policy', () => {
  for (const miniProgram of [true, false]) {
    it(`executes the actual external head script before app startup (miniProgram=${miniProgram})`, async () => {
      class PolicyLoader extends ResourceLoader {
        fetch(url) {
          return url.endsWith(asset)
            ? Promise.resolve(readFileSync(new URL('../public/' + asset, import.meta.url)))
            : null
        }
      }
      const html = entry.replace('<script type="module" src="/src/main.js"></script>',
        `<script>window.viewportAtAppStart = document.querySelector('meta[name="viewport"]').content</script>`)
      const dom = new JSDOM(html, {
        url: 'https://example.test/', resources: new PolicyLoader(), runScripts: 'dangerously',
        beforeParse(window) {
          Object.defineProperty(window.navigator, 'userAgent', { value: android + (miniProgram ? ' miniProgram' : '') })
        }
      })
      try {
        await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }))
        expect(dom.window.viewportAtAppStart).to.equal(content(dom))
        if (miniProgram) assertFixed(dom)
        else expect(content(dom)).to.equal('width=device-width,initial-scale=1.0')
      } finally { dom.window.close() }
    })
  }

  for (const orientation of ['portrait', 'landscape']) {
    it(`fixes page scale before app startup on ${orientation} entry`, () => {
      const dom = boot({ url: `https://example.test/?nativeOrientation=${orientation}` })
      try { assertFixed(dom) } finally { dom.window.close() }
    })
  }

  for (const [label, ua, env] of [
    ['Android browser', android.replace('MicroMessenger/8.0.60', 'Chrome/130'), undefined],
    ['ordinary WeChat page', android, undefined],
    ['ordinary iOS WeChat page', ios.replace(' miniProgram', ''), undefined],
    ['ordinary desktop browser', desktop.replace(' miniProgram', ''), undefined]
  ]) {
    it(`preserves zoom for ${label}, even with an orientation query`, () => {
      const dom = boot({ ua, env, url: 'https://example.test/?nativeOrientation=portrait' })
      try { expect(content(dom)).to.equal('width=device-width,initial-scale=1.0') } finally { dom.window.close() }
    })
  }

  for (const [label, ua] of [['iOS', ios], ['desktop', desktop]]) {
    for (const useEnvironment of [false, true]) {
      it(`fixes the application viewport on ${label} via ${useEnvironment ? 'injected environment' : 'UA'}`, () => {
        const dom = boot({
          ua: useEnvironment ? ua.replace(' miniProgram', '') : ua,
          env: useEnvironment ? 'miniprogram' : undefined
        })
        try { assertFixed(dom) } finally { dom.window.close() }
      })
    }
  }

  it('accepts the injected environment when UA has no miniProgram suffix', () => {
    const dom = boot({ ua: android, env: 'miniprogram' })
    try { assertFixed(dom) } finally { dom.window.close() }
  })

  for (const event of ['WeixinJSBridgeReady', 'DOMContentLoaded']) {
    it(`applies a late environment at ${event} without duplicate directives`, () => {
      const dom = boot({ ua: android })
      try {
        expect(content(dom)).not.to.include('user-scalable')
        dom.window.__wxjs_environment = 'miniprogram'
        dom.window.document.dispatchEvent(new dom.window.Event(event))
        assertFixed(dom)
        dom.window.document.dispatchEvent(new dom.window.Event('WeixinJSBridgeReady'))
        expect(content(dom).match(/user-scalable/g)).to.have.length(1)
      } finally { dom.window.close() }
    })
  }

  it('loads synchronously after viewport and before the app, sharing the prototype policy', () => {
    const dom = boot()
    try {
      const script = dom.window.document.querySelector(`head > script[src$="${asset}"]`)
      expect(script, 'parser-blocking head policy').not.to.equal(null)
      expect(script.type).to.equal('')
      expect(script.hasAttribute('async') || script.hasAttribute('defer')).to.equal(false)
      expect(entry.indexOf('name="viewport"')).to.be.lessThan(entry.indexOf(asset))
      expect(entry.indexOf(asset)).to.be.lessThan(entry.indexOf('/src/main.js'))
      const prototype = readFileSync(new URL('../prototypes/juyiting/index.html', import.meta.url), 'utf8')
      expect(prototype).to.include(`src="/${asset}"`)
    } finally { dom.window.close() }
  })
})

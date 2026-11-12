import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createMiniRuntimeLoader } from './helpers/miniProgramRuntime.js'
import { createRouter, createMemoryHistory } from 'vue-router'
import { publicEntryTarget } from '../src/utils/publicEntryNavigation.js'
import { nativeOrientationFromLocation } from '../src/composables/juyiting/miniProgramOrientation.js'

global.history = global.window?.history

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('public entry navigation and intent', () => {
  it('keeps ordinary web routes free of native markers', () => {
    expect(publicEntryTarget('/demo')).to.deep.equal({ path: '/demo', query: {} })
    expect(publicEntryTarget('/juyiting', {}, { template: 'research' })).to.deep.equal({
      path: '/juyiting', query: { template: 'research' }
    })
  })

  it('preserves portrait across home, demo, back, workbench and an auth return URL', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['/', '/demo', '/juyiting'].map(path => ({ path, component: { render: () => null } }))
    })
    await router.push('/?nativeOrientation=portrait&entry=direct&token=must-not-forward')
    for (const path of ['/demo', '/', '/demo', '/juyiting']) {
      await router.push(publicEntryTarget(path, router.currentRoute.value.query,
        path === '/juyiting' ? { template: 'content' } : {}))
      expect(router.currentRoute.value.query.nativeOrientation).to.equal('portrait')
      expect(router.currentRoute.value.query).not.to.have.property('token')
    }
    const returnPath = router.currentRoute.value.fullPath
    expect(router.currentRoute.value.query.template).to.equal('content')
    await router.push('/')
    await router.push(returnPath)
    expect(nativeOrientationFromLocation(`https://kit.chaoyoufan.cn${router.currentRoute.value.fullPath}`)).to.equal('portrait')
  })

  it('does not propagate invalid orientation, array query values, tokens or arbitrary return targets', () => {
    for (const nativeOrientation of ['auto', 'landscape', ['portrait'], null]) {
      expect(publicEntryTarget('/demo', { nativeOrientation, entry: 'direct', token: 'secret' }).query).to.deep.equal({})
    }
    expect(publicEntryTarget('/demo', {
      nativeOrientation: 'portrait', entry: ['direct'], access_token: 'secret', redirect: 'https://other.test'
    }).query).to.deep.equal({ nativeOrientation: 'portrait' })
    expect(publicEntryTarget('/juyiting', { nativeOrientation: 'portrait', entry: 'fallback' }).query)
      .to.deep.equal({ nativeOrientation: 'portrait', entry: 'fallback' })
  })

  it('uses explicit product, demo and workbench labels and does not present static steps as live execution', () => {
    const home = source('src/components/public/PublicLanding.vue')
    const demo = source('src/components/public/GuestDemo.vue')
    expect(home).to.include('免登录看示例')
    expect(home).to.include('进入工作台')
    expect(home).to.include('示例预览 · 非真实执行')
    expect(home).not.to.include('立即体验')
    expect(demo).to.include('返回产品介绍')
    expect(demo).to.include('不是真实 AI 执行')
    expect(demo).to.include('示例交付清单 · 非现场生成')
    expect(demo).not.to.include('任务正在')
    expect(demo).not.to.include('已完成 ·')
    for (const content of [home, demo]) {
      expect(content).not.to.match(/\bto="\/(?:demo|juyiting)?"/)
      expect(content).to.include('publicEntryTarget(')
    }
  })
})

// Explicit paired-checkout validation. No hard-coded Windows path or production code fixture.
const miniProject = process.env.MINIPROGRAM_PROJECT
;(miniProject ? describe : describe.skip)('paired Mini Program entry contract', () => {
  const loadPage = name => {
    let page
    createMiniRuntimeLoader(miniProject)(`pages/${name}/index.js`, {
      Page: value => { page = value }
    })
    page.setData = data => Object.assign(page.data, data)
    return page
  }
  it('opens root on cold launch while carrying native portrait context', () => {
    const page = loadPage('index')
    expect(page.data.url).to.equal('') // Do not load the cold-launch URL before parameter validation.
    page.onLoad()
    const initial = page.data.url
    const url = new URL(page.data.url)
    expect(url.origin).to.equal('https://kit.chaoyoufan.cn')
    expect(url.pathname).to.equal('/')
    expect(url.searchParams.get('nativeOrientation')).to.equal('portrait')
    page.onLoad({ entry: 'https://malicious.test', token: 'secret' })
    expect(page.data.url).to.equal(initial)
  })
  it('keeps native landscape and portrait recovery in the workbench, not the introduction', () => {
    const portrait = loadPage('index')
    portrait.onLoad({ entry: 'fallback' })
    expect(new URL(portrait.data.url).pathname).to.equal('/juyiting')
    const landscape = loadPage('landscape')
    landscape.onLoad({ entry: 'portrait' })
    const url = new URL(landscape.data.url)
    expect(url.pathname).to.equal('/juyiting')
    expect(url.searchParams.get('nativeOrientation')).to.equal('landscape')
    expect(url.searchParams.get('entry')).to.equal('portrait')
    const app = JSON.parse(readFileSync(join(miniProject, 'app.json'), 'utf8'))
    for (const [name, orientation] of [['index', 'portrait'], ['landscape', 'landscape']]) {
      expect(app.pages).to.include(`pages/${name}/index`)
      const config = JSON.parse(readFileSync(join(miniProject, `pages/${name}/index.json`), 'utf8'))
      expect(config.pageOrientation).to.equal(orientation)
      expect(config.navigationStyle).to.equal('custom')
    }
  })
})

// Execute the actual Vue SFCs, not a duplicate demo state machine.
describe('public entry rendered interactions', () => {
  let mount, nextTick, Demo, Home, originalSuiteScroll
  before(async () => {
    originalSuiteScroll = window.HTMLElement.prototype.scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = () => {}
    global.Element = window.Element
    global.SVGElement = window.SVGElement
    global.Node = window.Node
    ;({ mount } = await import('@vue/test-utils'))
    ;({ nextTick } = await import('vue'))
    const { parse, compileScript } = await import('@vue/compiler-sfc')
    const compileUrl = async file => {
      const { descriptor } = parse(source(file), { filename: file })
      const result = compileScript(descriptor, { id: file, inlineTemplate: true })
      let code = result.content
      for (const match of [...code.matchAll(/from (['"])([^'"]+)\1/g)]) {
        const name = match[2]
        let target
        if (name.endsWith('.vue')) target = await compileUrl(join(dirname(file), name))
        else if (name.startsWith('@/')) target = pathToFileURL(resolve('src', name.slice(2) + (name.endsWith('.js') ? '' : '.js'))).href
        else if (name.startsWith('.')) target = pathToFileURL(resolve(dirname(file), name)).href
        else target = pathToFileURL(createRequire(import.meta.url).resolve(name)).href
        code = code.replace(match[0], `from '${target}'`)
      }
      return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    }
    const compile = async file => (await import(await compileUrl(file))).default
    Demo = await compile('src/components/public/GuestDemo.vue')
    Home = await compile('src/components/public/PublicLanding.vue')
  })

  after(() => {
    if (originalSuiteScroll) window.HTMLElement.prototype.scrollIntoView = originalSuiteScroll
    else delete window.HTMLElement.prototype.scrollIntoView
  })

  const routerAt = async path => {
    const router = createRouter({ history: createMemoryHistory(),
      routes: ['/', '/demo', '/juyiting'].map(path => ({ path, component: { render: () => null } })) })
    await router.push(path)
    return router
  }

  it('renders unambiguous home links that retain the native host marker', async () => {
    const router = await routerAt('/?nativeOrientation=portrait&entry=direct')
    const wrapper = mount(Home, { global: { plugins: [router], stubs: { 'var-icon': true } } })
    try {
      expect(wrapper.get('.primary-action').attributes('href')).to.equal('/demo?nativeOrientation=portrait&entry=direct')
      expect(wrapper.get('.secondary-action').attributes('href')).to.equal('/juyiting?nativeOrientation=portrait&entry=direct')
      expect(wrapper.text()).to.include('非真实执行')
    } finally { wrapper.unmount() }
  })

  it('matches actual workbench navigation and guards empty demand', async () => {
    const { hallWorkbenchTabs } = await import('../src/constants/hallWorkbenchNavigation.js')
    expect(hallWorkbenchTabs.map(tab => tab.label)).to.deep.equal(['办事', '事项', '资料', '我的'])
    expect(source('src/components/world/JuyiHall.vue')).to.include('const workbenchPrimaryTabs = hallWorkbenchTabs')
    const router = await routerAt('/demo')
    const wrapper = mount(Demo, { global: { plugins: [router], stubs: { 'var-icon': true } } })
    try {
      await wrapper.get('textarea').setValue('   ')
      expect(wrapper.get('button.next-action').attributes('disabled')).to.not.equal(undefined)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.find('.recommendation-stage').exists()).to.equal(false)
    } finally { wrapper.unmount() }
  })

  for (const outcome of ['accept', 'cancel']) {
    it(`keeps reservation local and releases it on ${outcome}, then resets on restart`, async () => {
      const router = await routerAt('/demo?access_token=do-not-forward')
      const wrapper = mount(Demo, { global: { plugins: [router], stubs: { 'var-icon': true } } })
      try {
        await wrapper.get('.template-stage form').trigger('submit')
        await wrapper.findAll('.agent-choice')[1].trigger('click')
        await wrapper.get('button.next-action').trigger('click')
        expect(wrapper.get('.matter-aside').text()).to.include('预占18 文')
        await wrapper.get('.reply-form textarea').setValue('<script>example</script>')
        await wrapper.get('.reply-form').trigger('submit')
        expect(wrapper.find('.discussion-messages script').exists()).to.equal(false)
        expect(wrapper.get('.discussion-messages').text()).to.include('<script>example</script>')
        expect(wrapper.get('.reply-form textarea').element.value).to.equal('')
        await wrapper.get('button.next-action').trigger('click')
        expect(wrapper.find('.accept-action').exists()).to.equal(true)
        expect(wrapper.get('.matter-aside').text()).to.include('预占18 文')
        await wrapper.findAll('.demo-sidebar nav button')[2].trigger('click')
        expect(wrapper.get('.resources-stage').text()).to.include('v1')
        await wrapper.findAll('.demo-sidebar nav button')[1].trigger('click')
        if (outcome === 'accept') await wrapper.get('.accept-action').trigger('click')
        else await wrapper.get('.cancel-action').trigger('click')
        expect(wrapper.get('.matter-aside').text()).to.include('预占0 文')
        expect(wrapper.get('.matter-aside').text()).to.include(`已结算${outcome === 'accept' ? 18 : 0} 文`)
        expect(wrapper.find('.accept-action').exists()).to.equal(false)
        expect(wrapper.find('.cancel-action').exists()).to.equal(false)
        expect(wrapper.get('.link-action').attributes('href')).not.to.include('access_token')
        await wrapper.get('.result-stage .quiet-action').trigger('click')
        expect(wrapper.get('.matter-aside').text()).to.include('可用100 文')
        expect(wrapper.find('.template-stage').exists()).to.equal(true)
      } finally { wrapper.unmount() }
    })
  }

  it('cancels before assignment without inventing an assignee or settlement', async () => {
    const router = await routerAt('/demo')
    const wrapper = mount(Demo, { global: { plugins: [router], stubs: { 'var-icon': true } } })
    try {
      await wrapper.get('.template-stage form').trigger('submit')
      await wrapper.get('.cancel-action').trigger('click')
      expect(wrapper.get('.matter-aside').text()).to.include('承办人待确认')
      expect(wrapper.get('.matter-aside').text()).to.include('可用100 文')
      expect(wrapper.find('.result-card').exists()).to.equal(false)
      await wrapper.findAll('.demo-sidebar nav button')[3].trigger('click')
      await wrapper.findAll('.mine-grid button')[0].trigger('click')
      expect(wrapper.get('.feature-note').text()).to.include('未读取账号')
    } finally { wrapper.unmount() }
  })

  for (const [index, id] of ['research', 'content', 'collaboration'].entries()) {
    it(`walks ${id} through all steps, restores focus and retains template + orientation handoff`, async () => {
      const router = await routerAt('/demo?nativeOrientation=portrait&entry=direct')
      const originalScroll = window.HTMLElement.prototype.scrollIntoView
      let scrolls = 0
      window.HTMLElement.prototype.scrollIntoView = function () { scrolls++ }
      const wrapper = mount(Demo, { attachTo: document.body, global: { plugins: [router], stubs: { 'var-icon': true } } })
      try {
        await wrapper.findAll('.template-card')[index].trigger('click')
        expect(wrapper.findAll('.template-card')[index].attributes('aria-pressed')).to.equal('true')
        for (let step = 2; step <= 4; step++) {
          if (step === 2) await wrapper.get('.template-stage form').trigger('submit')
          else await wrapper.get('button.next-action').trigger('click')
          await nextTick()
          expect(wrapper.findAll('.stepper li')[step - 1].attributes('aria-current')).to.equal('step')
          expect(document.activeElement).to.equal(wrapper.get('.demo-workspace h2').element)
        }
        expect(scrolls).to.equal(3)
        expect(wrapper.get('.result-card').text()).to.include('非现场生成')
        expect(wrapper.get('.link-action').attributes('href'))
          .to.equal(`/juyiting?template=${id}&nativeOrientation=portrait&entry=direct`)
        await wrapper.findAll('.quiet-action')[0].trigger('click')
        expect(wrapper.get('.execution-stage').exists()).to.equal(true)
        await wrapper.get('button.next-action').trigger('click')
        await wrapper.findAll('.quiet-action')[1].trigger('click')
        expect(wrapper.findAll('.template-card')[index].attributes('aria-pressed')).to.equal('true')
      } finally {
        wrapper.unmount()
        if (originalScroll) window.HTMLElement.prototype.scrollIntoView = originalScroll
        else delete window.HTMLElement.prototype.scrollIntoView
      }
    })
  }
})

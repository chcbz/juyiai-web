import * as assigneeCandidates from '../src/composables/juyiting/hallAssigneeCandidates.js'
import * as taskPresentation from '../src/composables/juyiting/hallTaskPresentation.js'
import * as ordinaryCancellation from '../src/composables/juyiting/useHallOrdinaryCancellation.js'
import { readFileSync } from 'node:fs'
import { expect } from 'chai'
import { parse, compileScript } from '@vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import * as Vue from 'vue'
import * as silver from '../src/utils/wenAmount.js'

const source = readFileSync(new URL('../src/components/juyiting/BountyPanel.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const Empty = Vue.defineComponent({ render: () => Vue.h('span') })
const imports = new Proxy({ vue: Vue, '@/composables/juyiting/hallAssigneeCandidates.js': assigneeCandidates, '../../composables/juyiting/hallTaskPresentation.js': taskPresentation, '../../composables/juyiting/useHallOrdinaryCancellation.js': ordinaryCancellation, '@/utils/wenAmount': silver }, { get: (target, name) => target[name] || Empty })
const code = compileScript(descriptor, { id: 'bounty-toolbar-test', inlineTemplate: true }).content
  .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, names, path) =>
    `const { ${names.replace(/\s+as\s+/g, ': ')} } = imports[${JSON.stringify(path)}]`)
  .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, path) => `const ${name} = imports[${JSON.stringify(path)}]`)
  .replace('export default', 'return')
const Panel = new Function('imports', code)(imports)
const props = {
  embeddedHall: true, taskAgentOptions: [{ agentId: 'agent-a', displayName: '同名Agent' }, { agentId: 'agent-b', displayName: '同名Agent' }],
  abilityText: () => '', canAssign: () => false, formatTime: () => '', portraitName: () => '', portraitStyle: () => ({}),
  taskAgentMatchScore: () => 0, taskStateClass: () => '', taskStatusCount: () => 0, taskStatusText: () => ''
}

describe('Bounty task toolbar', () => {
  it('shows only search, assignee filter and accessible refresh in the embedded toolbar', async () => {
    const wrapper = mount(Panel, { props })
    try {
      const toolbar = wrapper.get('.panel-toolbar')
      expect(toolbar.findAll('button')).to.have.length(1)
      expect(toolbar.text()).not.to.include('提出需求')
      expect(toolbar.find('.task-draft-actions').exists()).to.equal(false)
      expect(wrapper.find('.task-create-form').exists()).to.equal(false)
      expect(toolbar.get('input').attributes('aria-label')).to.equal('搜索事项名称或编号')
      expect(toolbar.get('select').attributes('aria-label')).to.equal('按承办人筛选')
      expect(toolbar.get('select').findAll('option').map(option => option.text())).to.deep.equal([
        '全部承办人', '同名Agent', '同名Agent'
      ])
      expect(toolbar.get('select').findAll('option').map(option => option.element.value)).to.deep.equal([
        '', 'agent-a', 'agent-b'
      ])
      await toolbar.get('input').setValue(' 434 ')
      expect(wrapper.emitted('update:taskKeyword').at(-1)).to.deep.equal(['434'])
      await toolbar.get('input').trigger('keydown.enter')
      await toolbar.get('select').setValue('agent-b')
      expect(wrapper.emitted('update:taskAgentFilter').at(-1)).to.deep.equal(['agent-b'])
      await toolbar.get('[aria-label="刷新事项"]').trigger('click')
      expect(wrapper.emitted('load-tasks')).to.have.length(3)
      expect(wrapper.emitted('create-task')).to.equal(undefined)
    } finally { wrapper.unmount() }
  })

  it('waits for Chinese composition before changing the filter or searching', async () => {
    const wrapper = mount(Panel, { props })
    try {
      const field = wrapper.get('input[type=search]')
      expect(field.attributes('enterkeyhint')).to.equal('search')
      await field.trigger('compositionstart')
      field.element.value = 'ban'
      await field.trigger('input')
      await field.trigger('keydown.enter', { isComposing: true })
      expect(wrapper.emitted('update:taskKeyword')).to.equal(undefined)
      expect(wrapper.emitted('load-tasks')).to.equal(undefined)
      field.element.value = '办理'
      // Vue dispatches a native input on compositionend; use the mounted DOM's Event realm.
      const EventCtor = globalThis.Event
      try { globalThis.Event = window.Event; await field.trigger('compositionend') }
      finally { globalThis.Event = EventCtor }
      expect(wrapper.emitted('update:taskKeyword')).to.deep.equal([['办理']])
      await field.trigger('keyup.enter')
      expect(wrapper.emitted('load-tasks')).to.equal(undefined)
      await field.trigger('keydown.enter')
      expect(wrapper.emitted('load-tasks')).to.have.length(1)
    } finally { wrapper.unmount() }
  })

  for (const embeddedHall of [true, false]) it(`has no creation form or exposed creation method (embedded=${embeddedHall})`, () => {
    const wrapper = mount(Panel, { props: { ...props, embeddedHall } })
    try {
      expect(wrapper.vm.openCreateRequirement).to.equal(undefined)
      expect(wrapper.find('form').exists()).to.equal(false)
      expect(wrapper.find('.task-draft-actions').exists()).to.equal(false)
      expect(wrapper.text()).not.to.include('提出需求')
      expect(wrapper.emitted('create-task')).to.equal(undefined)
      expect(source).not.to.include('submitCreateTask')
    } finally { wrapper.unmount() }
  })

  it('clears only the search and assignee on a miss, keeps the phase and reloads once', async () => {
    const wrapper = mount(Panel, { attachTo: document.body, props: { ...props, taskKeyword: '不存在', taskAgentFilter: 'agent-a',
      taskStatusFilter: 'IN_PROGRESS', taskStatusFilters: [{ value: 'IN_PROGRESS', label: '进行中' }] } })
    try {
      const clear = wrapper.get('.empty-list button')
      expect(clear.text()).to.equal('清除关键词和承办人')
      await clear.trigger('click')
      expect(wrapper.emitted('update:taskKeyword')).to.deep.equal([['']])
      expect(wrapper.emitted('update:taskAgentFilter')).to.deep.equal([['']])
      expect(wrapper.emitted('set-status-filter')).to.equal(undefined)
      expect(wrapper.emitted('load-tasks')).to.have.length(1)
      expect(document.activeElement).to.equal(wrapper.get('.task-status-tabs button.active').element)
      await wrapper.setProps({ taskKeyword: '', taskAgentFilter: '' })
      expect(wrapper.get('.empty-list').text()).to.equal('目前没有「进行中」事项。')
      await wrapper.setProps({ hasMore: true })
      expect(wrapper.find('.empty-list').exists()).to.equal(false)
    } finally { wrapper.unmount() }
  })

  it('reveals a focused status within the strip without scrolling the document', async () => {
    const wrapper = mount(Panel, { props })
    try {
      const strip = wrapper.get('.task-status-tabs')
      const last = strip.findAll('button').at(-1)
      strip.element.getBoundingClientRect = () => ({ left: 16, right: 353 })
      last.element.getBoundingClientRect = () => ({ left: 317, right: 401 })
      await last.trigger('focusin')
      expect(strip.element.scrollLeft).to.equal(48)
    } finally { wrapper.unmount() }
  })

  it('gives toolbar controls independent grid cells without obsolete creation styles', () => {
    const css = descriptor.styles[0].content
    expect(css).to.include('grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) 44px')
    expect(css).to.include('.task-search { display: contents; }')
    expect(css).not.to.match(/\.task-search input,[^{}]*\.task-material-picker\s*\{/)
    expect(css).not.to.include('.task-create-form')
  })
})

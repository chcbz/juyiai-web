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
  it('keeps the draft local until search, independently of assignee filtering', async () => {
    const wrapper = mount(Panel, { props })
    try {
      const toolbar = wrapper.get('.panel-toolbar')
      expect(toolbar.findAll('button')).to.have.length(1)
      const form = toolbar.get('form[role=search]')
      const submit = toolbar.get(':scope > button[type=submit]')
      expect(submit.text()).to.equal('搜索')
      expect(submit.element.form).to.equal(form.element)
      expect(form.find('select').exists()).to.equal(false)
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
      expect(wrapper.emitted('update:taskKeyword')).to.equal(undefined)
      expect(wrapper.emitted('load-tasks')).to.equal(undefined)
      await toolbar.get('select').setValue('agent-b')
      expect(wrapper.emitted('update:taskAgentFilter').at(-1)).to.deep.equal(['agent-b'])
      expect(wrapper.emitted('update:taskKeyword')).to.equal(undefined)
      expect(wrapper.emitted('load-tasks')).to.have.length(1)
      await form.trigger('submit')
      expect(wrapper.emitted('update:taskKeyword')).to.deep.equal([['434']])
      expect(wrapper.emitted('load-tasks')).to.have.length(2)
      await wrapper.setProps({ taskKeyword: '434' })
      expect(toolbar.get('.task-search-applied').text()).to.equal('已搜索：434')
      await toolbar.get('input').setValue('new draft')
      expect(toolbar.get('.task-search-applied').text()).to.equal('已搜索：434')
      await wrapper.setProps({ identityScope: 'another-scope' })
      expect(toolbar.get('input').element.value).to.equal('434')
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
      await wrapper.get('form.task-search').trigger('submit')
      expect(wrapper.emitted('update:taskKeyword')).to.equal(undefined)
      expect(wrapper.emitted('load-tasks')).to.equal(undefined)
      field.element.value = '办理'
      // Vue dispatches a native input on compositionend; use the mounted DOM's Event realm.
      const EventCtor = globalThis.Event
      try { globalThis.Event = window.Event; await field.trigger('compositionend') }
      finally { globalThis.Event = EventCtor }
      expect(wrapper.emitted('update:taskKeyword')).to.equal(undefined)
      await field.trigger('keyup.enter')
      expect(wrapper.emitted('load-tasks')).to.equal(undefined)
      await wrapper.get('form.task-search').trigger('submit')
      expect(wrapper.emitted('update:taskKeyword')).to.deep.equal([['办理']])
      expect(wrapper.emitted('load-tasks')).to.have.length(1)
    } finally { wrapper.unmount() }
  })

  for (const embeddedHall of [true, false]) it(`has no creation form or exposed creation method (embedded=${embeddedHall})`, () => {
    const wrapper = mount(Panel, { props: { ...props, embeddedHall } })
    try {
      expect(wrapper.vm.openCreateRequirement).to.equal(undefined)
      expect(wrapper.findAll('form').map(form => form.attributes('role'))).to.deep.equal(['search'])
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

  it('focuses the detail return button and restores the originating row, not the first row', async () => {
    const tasks = ['a', 'b'].map(id => ({ id, title: id, status: 'open' }))
    const w = mount(Panel, { attachTo: document.body, props: { ...props, tasks } })
    try {
      const row = w.findAll('.task-card')[1]
      await row.trigger('keydown.space')
      expect(document.activeElement).to.equal(w.get('.bounty-back-button').element)
      w.vm.back()
      await Vue.nextTick()
      expect(document.activeElement).to.equal(row.element)
      expect(w.emitted('select-task').at(-1)).to.deep.equal([null, { fromTaskList: true }])
      await row.trigger('click')
      await w.setProps({ tasks: [] })
      await w.get('.bounty-back-button').trigger('click')
      expect(document.activeElement).to.equal(w.get('select').element)
      w.vm.openTask(tasks[0])
      await Vue.nextTick()
      w.vm.back()
      expect(w.emitted('select-task').at(-1)).to.deep.equal([null])
    } finally { w.unmount() }
  })

  it('groups history and reconciliation with their own counts and mutually exclusive selection', async () => {
    const taskStatusFilters = [{ value: 'COMPLETED', label: '已完成' }, { value: 'HISTORY', label: '历史' }, { value: 'UNKNOWN', label: '待核对' }]
    const w = mount(Panel, { props: { ...props, taskStatusFilters, taskStatusFilter: 'HISTORY', taskStatusCount: phase => phase === 'HISTORY' ? 123 : 0 } })
    try {
      const group = w.get('[role="group"][aria-label="其他事项状态"]')
      expect(group.find(':scope > span').exists()).to.equal(false)
      const [history, unknown] = group.findAll('button')
      expect(history.get('small').text()).to.equal('123')
      expect(unknown.get('small').text()).to.equal('0')
      await unknown.trigger('click')
      expect(w.emitted('set-status-filter')).to.deep.equal([['UNKNOWN']])
      await w.setProps({ taskStatusFilter: 'UNKNOWN' })
      expect(group.findAll('[aria-pressed="true"]').map(b => b.element)).to.deep.equal([unknown.element])
      await w.setProps({ taskStatusFilter: 'COMPLETED' })
      expect(w.get('.task-secondary-filters').element.style.display).to.equal('none')
    } finally { w.unmount() }
  })

  it('opens and closes other states without applying a choice, and labels a collapsed selection', async () => {
    const taskStatusFilters = [{ value: 'COMPLETED', label: '已完成' }, { value: 'HISTORY', label: '历史' }, { value: 'UNKNOWN', label: '待核对' }]
    const w = mount(Panel, { props: { ...props, taskStatusFilter: 'COMPLETED', taskStatusFilters, taskStatusCount: () => 123 } })
    try {
      const toggle = w.get('.panel-toolbar .task-status-secondary')
      const group = w.get('.task-secondary-filters')
      expect(toggle.element.nextElementSibling).to.equal(w.get('.task-search-submit').element)
      expect(toggle.attributes('aria-controls')).to.equal(group.attributes('id'))
      expect(toggle.attributes('aria-expanded')).to.equal('false')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).to.equal('true')
      expect(group.find('[aria-pressed="true"]').exists()).to.equal(false)
      expect(w.emitted('set-status-filter')).to.equal(undefined)
      expect(w.emitted('load-tasks')).to.equal(undefined)
      await group.findAll('button')[1].trigger('click')
      expect(w.emitted('set-status-filter')).to.deep.equal([['UNKNOWN']])
      await w.setProps({ taskStatusFilter: 'UNKNOWN' })
      await toggle.trigger('click')
      expect(toggle.text()).to.equal('状态：待核对')
      expect(toggle.attributes('aria-expanded')).to.equal('false')
      expect(w.emitted('set-status-filter')).to.have.length(1)
    } finally { w.unmount() }
  })

  it('marks list and counts busy without copy or a false empty state, and keeps errors actionable', async () => {
    const w = mount(Panel, { props: { ...props, loading: true, countsLoading: true } })
    try {
      const body = w.get('.task-panel-body')
      const statuses = w.get('.task-status-tabs')
      expect(w.find('.task-refresh').exists()).to.equal(false)
      expect(body.attributes('aria-busy')).to.equal('true')
      expect(statuses.attributes('aria-busy')).to.equal('true')
      expect(w.find('.empty-list').exists()).to.equal(false)
      expect(w.find('.task-data-state').exists()).to.equal(false)
      await w.setProps({ loading: false, errorMessage: '事项连接失败' })
      expect(body.attributes('aria-busy')).to.equal('false')
      expect(w.get('[role="alert"]').text()).to.equal('事项连接失败')
      await w.get('.task-pagination-status button').trigger('click')
      expect(w.emitted('load-tasks')).to.have.length(1)
      await w.setProps({ countsLoading: false, countsErrorMessage: '计数暂不可用' })
      expect(statuses.attributes('aria-busy')).to.equal('false')
      expect(w.findAll('[role="alert"]').map(a => a.text())).to.deep.equal(['事项连接失败', '计数暂不可用'])
      await w.setProps({ errorMessage: '' })
      await w.get('.task-count-error button').trigger('click')
      expect(w.emitted('load-tasks')).to.have.length(2)
      await w.setProps({ countsErrorMessage: '' })
      expect(w.find('.empty-list').exists()).to.equal(true)
    } finally { w.unmount() }
  })

  it('gives toolbar controls independent grid cells without obsolete creation styles', () => {
    const css = descriptor.styles[0].content
    expect(css).to.include('grid-template-columns: minmax(0, 1fr) minmax(0, .55fr) auto auto;')
    expect(css).to.include('grid-template-columns: minmax(0, 1fr) auto auto;')
    expect(css).not.to.match(/\.task-search input,[^{}]*\.task-material-picker\s*\{/)
    expect(css).not.to.include('.task-create-form')
  })
})

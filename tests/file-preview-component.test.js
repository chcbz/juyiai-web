import { strict as assert } from 'node:assert'
import { describe, it } from 'mocha'
import { mount, flushPromises } from '@vue/test-utils'
import { FilePreview } from './helpers/file-preview-component.js'

const imageSource = key => ({ key, filename: '图片.png', mimeType: 'image/png', load: async () => new Blob(['image'], { type: 'image/png' }) })
describe('shared original-file image interaction', () => {
  it('enlarges the same authenticated bytes, restores focus and clears on source changes', async () => {
    let reads = 0
    const source = imageSource('owner-a:file:1')
    source.load = async () => { reads++; return new Blob(['image'], { type: 'image/png' }) }
    const wrapper = mount(FilePreview, { attachTo: document.body, props: { source, expandableImage: true } })
    try {
      await flushPromises()
      const button = wrapper.get('button[aria-label="放大查看图片"]')
      button.element.focus(); await button.trigger('click'); await flushPromises()
      const dialog = document.querySelector('dialog[aria-label="放大查看图片"]')
      assert.ok(dialog)
      assert.equal(dialog.querySelector('img').src, wrapper.get('img').element.src)
      assert.equal(reads, 1)
      dialog.dispatchEvent(new window.Event('cancel', { cancelable: true })); await flushPromises()
      assert.equal(document.querySelector('dialog'), null)
      assert.equal(document.activeElement, button.element)
      await button.trigger('click'); await flushPromises()
      await wrapper.setProps({ source: imageSource('owner-b:file:1') }); await flushPromises()
      assert.equal(document.querySelector('dialog'), null)
    } finally { wrapper.unmount() }
  })
  it('does not create a second image interaction inside the conversation preview dialog', async () => {
    const wrapper = mount(FilePreview, { props: { source: imageSource('owner:file:1') } })
    try {
      await flushPromises()
      assert.ok(wrapper.find('img').exists())
      assert.equal(wrapper.find('button[aria-label="放大查看图片"]').exists(), false)
    } finally { wrapper.unmount() }
  })
  it('renders CSV as literal text without interpreting markup', async () => {
    const text = '<script>bad()</script>,0,false\n"中文",1,2'
    const wrapper = mount(FilePreview, { props: { source: { key: 'csv:1', filename: 'table.csv', mimeType: 'text/csv', load: async () => new Blob([text], { type: 'text/csv' }) } } })
    try {
      await flushPromises()
      assert.equal(wrapper.get('pre').text(), text)
      assert.equal(wrapper.find('script').exists(), false)
    } finally { wrapper.unmount() }
  })
})

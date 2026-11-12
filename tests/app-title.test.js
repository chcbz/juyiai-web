import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const appTitle = env.match(/^VITE_APP_TITLE=(.+)$/m)[1]
const watcher = source.match(/watch\(\(\) => globalStore.title, ([\s\S]+?)\n<\/script>/)[1]

const renderTitle = title => {
  const document = { title: 'previous page' }
  const callback = watcher.replaceAll('import.meta.env.VITE_APP_TITLE', 'configuredTitle')
  runInNewContext(`watch(${callback}`, {
    configuredTitle: appTitle,
    document,
    watch: (update, options) => {
      expect(options.immediate).to.equal(true)
      update(title)
    }
  })
  return document.title
}

describe('Browser tab product title', () => {
  it('uses the product name instead of the starter kit name', () => {
    expect(appTitle).to.equal('聚义 · AI 协作工作台')
  })

  it('keeps public metadata, install name and key screens on the current brand', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
    expect(manifest.short_name).to.equal('聚义')
    for (const file of ['index.html', 'public/manifest.webmanifest', 'public/reset-cache.html', 'src/components/world/JuyiHall.vue', 'src/components/juyiting/HallMinePage.vue', 'src/components/juyiting/HallHelpCenter.vue', 'src/components/juyiting/HallOverview.vue', 'src/components/UserProfile.vue', 'src/components/OAuthCallback.vue', 'src/i18n/application.yml']) {
      const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
      expect(text, file).to.include('聚义')
      expect(text, file).not.to.include('聚义厅')
    }
  })

  it('does not repeat the hall or full product name', () => {
    for (const title of ['聚义', appTitle, '', undefined]) {
      expect(renderTitle(title)).to.equal(appTitle)
    }
  })

  it('keeps individual pages identifiable and resets on navigation', () => {
    expect(renderTitle('好汉名册')).to.equal('好汉名册 - ' + appTitle)
    expect(renderTitle('聚义')).to.equal(appTitle)
  })
})

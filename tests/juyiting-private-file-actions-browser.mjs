/** Real component/layout and original-blob download diagnostic; all backend I/O is a fixture. */
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchChrome, evaluate, waitForExpression, stopChrome } from '../scripts/juyiting/e13/lib/cdp-harness.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const httpFixture = `export const createApi=()=>({execute:async options=>{window.__reads=(window.__reads||0)+1;return new Blob(['NATIVE_PRIVATE_DOWNLOAD_OK'],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}});`
const archiveFixture = `import {ref} from 'vue';export const useHallConversationArchive=()=>{const state=ref('idle');return {statusFor:()=>({state:state.value}),save:async()=>{state.value='saved'},check:()=>{}}};`
const page = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px sans-serif;background:#fffefa}.bubble{box-sizing:border-box;max-width:360px;width:calc(100% - 32px);padding:12px;margin:16px;background:#f1f2e9}</style><div id="app" class="bubble"></div><script type="module">
import {createApp,h} from 'vue';import Parts from '/src/components/juyiting/HallMessageParts.vue';
window.__downloads=[];const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.hasAttribute('download')){window.__downloads.push({name:this.download,url:this.href,bytes:fetch(this.href).then(r=>r.text()).then(text=>{window.__downloadText=text})})}else original.call(this)};
const parts=['NATIVE6_MATERIAL_V2.xlsx','a.xlsx'].map((filename,i)=>({partId:'part-'+i,assetId:'asset-'+i,revision:'1',kind:'file',state:'ready',filename,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
createApp({render:()=>h(Parts,{parts,discussionVariant:'private',conversationId:'conversation-1',identityKey:'owner-a',identityScope:'owner-a'})}).mount('#app');</script>`
const server = await createServer({ root, configFile: false, cacheDir: process.env.PRIVATE_ACTIONS_CACHE || `/var/tmp/cyf-private-actions-vite-${process.pid}`, plugins: [{ name: 'private-actions-fixture', enforce: 'pre',
  resolveId(id) { if (id.endsWith('/useHttp.js')) return '\0private-http'; if (id.endsWith('/useHallConversationArchive.js')) return '\0private-archive' },
  load(id) { if (id === '\0private-http') return httpFixture; if (id === '\0private-archive') return archiveFixture },
  configureServer(server) { server.middlewares.use('/private-actions-diagnostic', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/private-actions-diagnostic', page)) }) }
}, vue()], server: { host: '127.0.0.1', port: 18594, strictPort: true }, optimizeDeps: { entries: [], include: ['vue'] } })
let browser
const errors = [], checks = []
try {
  await server.listen(); browser = await launchChrome({ debugPort: 19594 })
  const { cdp } = browser
  cdp.on('Runtime.exceptionThrown', value => errors.push(value.exceptionDetails?.exception?.description || value.exceptionDetails?.text))
  const evidence = process.env.PRIVATE_ACTIONS_EVIDENCE || `/var/tmp/cyf-private-actions-${process.pid}`
  await mkdir(evidence, { recursive: true })
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:18594/private-actions-diagnostic' })
    await waitForExpression(cdp, `document.querySelectorAll('.part-download-button').length===2`, 90000)
    const rows = await evaluate(cdp, `[...document.querySelectorAll('.media-actions')].map(row=>[...row.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {text:button.textContent.trim(),top:r.top,bottom:r.bottom,right:r.right}}))`)
    for (const row of rows) { assert.deepEqual(row.map(b=>b.text),['预览','保存','下载']); assert.ok(Math.max(...row.map(b=>b.top))-Math.min(...row.map(b=>b.top))<1) }
    await evaluate(cdp, `document.querySelector('.part-save-button').click()`)
    await waitForExpression(cdp, `document.querySelector('.part-save-button').textContent==='已保存'`)
    await evaluate(cdp, `document.querySelector('.part-download-button').click()`)
    await waitForExpression(cdp, `window.__downloadText==='NATIVE_PRIVATE_DOWNLOAD_OK'`)
    const download = await evaluate(cdp, `({name:window.__downloads[0].name,reads:window.__reads,text:window.__downloadText,overflow:document.documentElement.scrollWidth>innerWidth})`)
    assert.equal(download.name,'NATIVE6_MATERIAL_V2.xlsx'); assert.equal(download.reads,1); assert.equal(download.overflow,false)
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(`${evidence}/private-actions-${width}.png`, Buffer.from(screenshot.data,'base64'))
    checks.push({ width,height,rows,download })
  }
  assert.deepEqual(errors,[])
  await writeFile(`${evidence}/browser.json`,JSON.stringify({at:new Date().toISOString(),checks,errors,scope:'real components; API/archive fixture; not physical WeChat'},null,2))
  console.log(`Private actions browser diagnostic passed: ${evidence}/browser.json`)
} finally { if (browser) { browser.cdp.close(); await stopChrome(browser.chrome,browser.userDataDir) } await server.close() }

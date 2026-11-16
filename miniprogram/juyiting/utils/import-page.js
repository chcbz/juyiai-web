const { ID } = require('./file-messages')
const { readReturnTarget, returnRoute } = require('./navigation')
const { decodeHttpResponse } = require('./api-envelope')
const { prepareImportFile, releaseImportFiles } = require('./import-files')
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) &&
  (value.length < 19 || (value.length === 19 && value <= '9223372036854775807'))
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/\s|[\x00-\x1f\x7f]/.test(value)
const committedReference = value => {
  if (value?.operation?.state !== 'COMMITTED' || value?.file?.state !== 'ACTIVE' || !validId(value.file.fileId) ||
      value.version?.fileId !== value.file.fileId || !decimal(value.version.version) || value.version.version === '0' || value.version.version.length > 10 || (value.version.version.length === 10 && value.version.version > '2147483647')) return null
  return { fileId: value.file.fileId, version: value.version.version }
}
const createImportPage = config => ({
  data: { ready: false, busy: false, chosen: false, files: [], message: '正在连接聚义…', returnLabel: '返回选择资料', canRetry: false, needsAction: false },
  onLoad(options = {}) {
    this.disposed = false
    this.pageReady = false
    this.chooserOpened = false
    this.requestId = options.requestId
    this.returnTarget = readReturnTarget(options, config.webPolicy)
    this.files = []
    if (!ID.test(this.requestId || '') || !this.returnTarget || !/^https:\/\/[^/?#]+\/agent\/personal-workspace\/files$/.test(config.importUploadUrl || '')) {
      this.setData({ needsAction: true, message: '资料请求或上传地址无效，请返回重试。' }); return
    }
    this.waitNotice = setTimeout(() => { if (!this.disposed && !this.record) this.setData({ needsAction: true, message: '尚未收到资料请求，可返回后重试；原草稿保留。' }) }, 3000)
    this.waitTimer = setInterval(() => this.consume(), 100)
    this.consume()
  },
  onReady() {
    this.pageReady = true
    this.openChooser()
  },
  openChooser() {
    if (!this.pageReady || !this.record || this.disposed || this.chooserOpened) return
    this.chooserOpened = true
    this.chooseFiles()
  },
  consume() {
    if (this.disposed || this.record) return
    const state = getApp().globalData
    const record = state.pendingImports?.[this.requestId]
    if (!record) return
    delete state.pendingImports[this.requestId]
    state.consumedImports ||= Object.create(null)
    state.consumedImports[this.requestId] = Date.now()
    clearInterval(this.waitTimer)
    clearTimeout(this.waitNotice)
    if (Date.now() - record.receivedAt > 30000 || record.returnUrl !== this.returnTarget.url) {
      this.setData({ needsAction: true, message: '资料请求已过期或来源不匹配，请返回重试。' }); return
    }
    this.record = record
    this.setData({ ready: true, needsAction: false, message: '', returnLabel: this.returnTarget.label })
    this.openChooser()
  },
  chooseFiles() {
    if (!this.record || this.disposed || this.data.busy || this.data.chosen) return
    if (typeof wx.chooseMessageFile !== 'function') { this.setData({ needsAction: true, message: '当前微信版本不支持从聊天选择资料，请升级微信。' }); return }
    this.setData({ busy: true, needsAction: false, message: '' })
    wx.chooseMessageFile({ count: this.record.count, type: 'all',
      success: result => {
        if (this.disposed) return
        const files = result.tempFiles
        if (!Array.isArray(files) || !files.length || files.length > this.record.count || files.some(file => typeof file.path !== 'string' || !file.path || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255)) {
          this.setData({ busy: false, needsAction: true, message: '微信返回的资料无效，未上传。' }); return
        }
        this.files = files.map((file, index) => ({ path: file.path, name: file.name, key: this.requestId + ':' + index, state: 'waiting', reference: null }))
        this.setData({ chosen: true, busy: false })
        this.uploadFiles()
      },
      fail: error => {
        if (this.disposed) return
        this.setData({ busy: false })
        if (/cancel/i.test(error?.errMsg || '')) this.returnToSource()
        else this.setData({ needsAction: true, message: '微信资料选择失败，请重试。' })
      }
    })
  },
  renderFiles(message = '') {
    if (this.disposed) return
    this.setData({ files: this.files.map(file => ({ name: file.name, state: file.state, label: ({ waiting: '待上传', uploading: '上传中', committed: '已上传', unknown: '结果未确认' })[file.state] })),
      message, canRetry: this.files.some(file => file.state === 'unknown' || file.state === 'waiting') })
  },
  async uploadFiles() {
    if (!this.record || this.disposed || this.data.busy || this.returning) return
    this.setData({ busy: true, needsAction: false, message: '' })
    for (const file of this.files) {
      if (this.disposed || file.state === 'committed') continue
      file.state = 'uploading'; this.renderFiles()
      let submitted = false
      try {
        await prepareImportFile(file, config, this.requestId, this.files.indexOf(file))
        if (this.disposed) { releaseImportFiles([file]); return }
        const response = await new Promise((resolve, reject) => {
          submitted = true
          this.uploadTask = wx.uploadFile({ url: config.importUploadUrl, filePath: file.ownedPath, name: 'file',
            formData: { displayName: file.name },
            header: { Authorization: 'Bearer ' + this.record.token, 'Idempotency-Key': file.key, 'X-Request-Id': file.key },
            success: resolve, fail: reject })
        })
        this.uploadTask = null
        if (this.disposed) return
        const header = Object.entries(response.header || {}).find(([name]) => name.toLowerCase() === 'x-request-id')?.[1]
        const { value } = decodeHttpResponse(response.data, { status: response.statusCode, requestId: file.key, responseRequestId: header ?? null })
        const reference = committedReference(value)
        if (!reference) throw new Error('unconfirmed')
        file.reference = reference; file.state = 'committed'
      } catch {
        file.state = submitted ? 'unknown' : 'waiting'
        this.renderFiles('上传结果尚未确认，请点击“核对原上传”使用同一请求重试；不要重新选择上传。')
        break
      }
    }
    if (!this.disposed) {
      const incomplete = this.files.some(file => file.state !== 'committed')
      this.setData({ busy: false, needsAction: incomplete })
      this.renderFiles(incomplete ? '部分资料未完成或上传结果尚未确认；可核对原上传，或返回后到资料列表核对。不要重复上传同一资料。' : '资料已上传，正在返回…')
      if (!incomplete) this.returnToSource()
    }
  },
  returnToSource() {
    if (this.disposed || this.data.busy || this.returning) return
    if (!this.returnTarget) { wx.navigateBack({ delta: 1, fail: () => {} }); return }
    this.returning = true
    const references = this.files.filter(file => file.reference).map(file => file.reference)
    const unknown = this.files.some(file => file.state === 'unknown')
    const state = unknown ? 'unconfirmed' : references.length === this.files.length && references.length ? 'complete' : references.length ? 'partial' : 'cancelled'
    const hashAt = this.returnTarget.url.indexOf('#')
    const hash = hashAt < 0 ? '' : this.returnTarget.url.slice(hashAt)
    const base = hashAt < 0 ? this.returnTarget.url : this.returnTarget.url.slice(0, hashAt)
    const url = base + (base.includes('?') ? '&' : '?') + 'wechatImport=' + this.requestId + '&wechatFiles=' + encodeURIComponent(JSON.stringify(references)) + '&wechatState=' + state + hash
    wx.redirectTo({ url: returnRoute({ ...this.returnTarget, url }), fail: () => {
      this.returning = false
      if (!this.disposed) this.setData({ needsAction: true, message: '返回失败，请重试。已上传资料不会重复上传。' })
    } })
  },
  onUnload() {
    this.disposed = true
    clearInterval(this.waitTimer)
    clearTimeout(this.waitNotice)
    this.uploadTask?.abort?.()
    releaseImportFiles(this.files)
    this.record = null
    const state = getApp().globalData
    if (state.pendingImports) delete state.pendingImports[this.requestId]
    this.files = []
  }
})
module.exports = { createImportPage, committedReference }

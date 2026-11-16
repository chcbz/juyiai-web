const { ID } = require('./file-messages')
const { validateWebUrl } = require('./navigation')
const acceptImportMessages = (event, state, config) => {
  if (!Array.isArray(event?.detail?.data)) return
  state.pendingImports ||= Object.create(null)
  state.consumedImports ||= Object.create(null)
  for (const [id, record] of Object.entries(state.pendingImports)) if (Date.now() - record.receivedAt > 30000) delete state.pendingImports[id]
  for (const [id, time] of Object.entries(state.consumedImports)) if (Date.now() - time > 5 * 60 * 1000) delete state.consumedImports[id]
  for (const item of event.detail.data) {
    const message = item?.messageType ? item : item?.data
    const data = message?.data
    if (message?.protocolVersion !== 1 || message.messageType !== 'file.import' || !ID.test(message.requestId || '') ||
        !data || typeof data.token !== 'string' || !data.token.trim() || /[\x00-\x20\x7f]/.test(data.token) ||
        !Number.isInteger(data.count) || data.count < 1 || data.count > 32 || !validateWebUrl(data.returnUrl, config.webPolicy) ||
        state.consumedImports[message.requestId] || state.pendingImports[message.requestId]) continue
    // One active import handoff; credentials live only in native memory.
    if (Object.keys(state.pendingImports).length) continue
    state.pendingImports[message.requestId] = { requestId: message.requestId, token: data.token, count: data.count, returnUrl: data.returnUrl, receivedAt: Date.now() }
  }
}
module.exports = { acceptImportMessages }

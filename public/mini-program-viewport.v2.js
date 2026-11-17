// Runs before the app: mini-programs use a fixed application viewport.
// Keep ordinary browser accessibility zoom and app-owned image/document zoom.
;(function () {
  var ua = window.navigator.userAgent || ''

  function applyViewport() {
    if (window.__wxjs_environment !== 'miniprogram' && !/\bminiProgram\b/i.test(ua)) return
    var viewport = document.querySelector('meta[name="viewport"]')
    if (!viewport) return
    var content = viewport.getAttribute('content') || 'width=device-width,initial-scale=1.0'
    var directives = content.split(',').filter(function (value) {
      return !/^\s*(minimum-scale|maximum-scale|user-scalable)\s*=/i.test(value)
    })
    viewport.setAttribute('content', directives.concat([
      'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no'
    ]).join(','))
  }

  applyViewport()
  // Some WeChat versions inject the environment only when their bridge is ready.
  document.addEventListener('WeixinJSBridgeReady', applyViewport, { once: true })
  document.addEventListener('DOMContentLoaded', applyViewport, { once: true })
})()

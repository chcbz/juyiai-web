// Preview the public-demo direction inside the existing, offline workbench prototype.
(() => {
  if (new URLSearchParams(location.search).get('guestDemo') !== '1') return
  const addNotice = () => {
    if (document.getElementById('guest-demo-preview-note')) return
    const note = document.createElement('aside')
    note.id = 'guest-demo-preview-note'
    note.setAttribute('aria-label', '公开 Demo 原型说明')
    note.textContent = '公开 Demo 方案 · 本地示例：提出需求 → 确认承办与报价 → 议事 → 查看成果与验收。无真实执行或扣费。'
    document.body.append(note)
  }
  new MutationObserver(addNotice).observe(document.body, { childList: true })
  addNotice()
})()

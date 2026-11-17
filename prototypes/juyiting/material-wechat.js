// Offline interaction only: fixtures never access WeChat, camera or production APIs.
'use strict';
(() => {
  const environment = new URLSearchParams(location.search).get('materialSource') === 'browser' ? 'browser' : 'wechat';
  const sources = {
    chat: { title: '从微信聊天选择', note: '点击“微信”直接进入此选择器，无中间确认页。选择聊天中的图片或文件；这里只是离线示意，不会读取真实聊天。', files: [
      { key: 'brief', name: '春游活动说明.pdf', type: 'pdf', url: 'assets/observation-guide.pdf', pages: 3, parts: ['活动目标：认识身边的鸟类。', '准备观察手册，分组记录。', '汇总观察结果与活动建议。'], size: '248 KB' },
      { key: 'photo', name: '聊天图片.svg', type: 'image', url: 'assets/bird-v1.svg', size: '图片示意' },
      { key: 'notes', name: '活动需求.txt', type: 'text', text: '请根据活动资料整理一份亲子自然观察方案，包含物料与时间安排。', size: '文本示意' }
    ] },

  };
  const wechatIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.5c0 4.4-4 8-9 8a10.8 10.8 0 0 1-3.7-.7L3 21l1.4-4.2A7.4 7.4 0 0 1 2.5 12c0-4.4 4-8 9-8s9 3.2 9 7.5Z"/><circle cx="8" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="15" cy="11.5" r=".8" fill="currentColor" stroke="none"/></svg>';
  const originalComposerActions = renderComposerMaterialActions;
  renderComposerMaterialActions = function (panel, locked) {
    originalComposerActions(panel, locked);
    const actions = panel?.querySelector('.composer-material-actions');
    if (!actions) return;
    actions.querySelectorAll('svg').forEach(icon => icon.remove());
    if (environment !== 'wechat') return;
    const disabled = locked || conversation().materialImportPending;
    actions.classList.add('has-wechat-source');
    actions.querySelector('[data-action="complete-material-library"]').insertAdjacentHTML('beforebegin', `<button type="button" data-composer-wechat aria-label="从微信聊天选择文件或图片" ${disabled ? 'disabled' : ''}><span>微信</span></button>`);
  };
  const originalRender = renderMaterialPicker;
  function control(label, action, attributes = '') {
    return `<button type="button" data-material-import="${action}" ${attributes}>${label}</button>`;
  }
  renderMaterialPicker = function (...args) {
    document.querySelectorAll('.material-picker-dialog > [inert]').forEach(node => { node.inert = false; });
    document.querySelector('.material-import-panel')?.remove();
    originalRender(...args);
    const d = $('.material-picker-dialog');
    if (!d || !picker) return;
    // Keep system upload/camera/album intact; WeChat is a separate fourth action.
    const native = environment === 'wechat';
    const entry = $('.material-upload-button', d);
    if (entry) {
      const label = (title, icon, attributes = '') => `<label class="material-upload-button" title="${title}">${icon}<input type="file" data-local-files aria-label="${title}" ${attributes} ${picker.uploading ? 'disabled' : ''}></label>`;
      entry.outerHTML = label('上传资料', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 16v5h14v-5"/></svg>' , 'multiple')
        + label('拍照', composerMaterialIcon('camera'), 'accept="image/*" capture="environment"')
        + label('从相册选择', composerMaterialIcon('album'), 'accept="image/*" multiple')
        + (native ? `<button type="button" class="material-upload-button material-wechat-button" data-wechat-entry aria-label="从微信聊天选择文件或图片" title="从微信聊天选择文件或图片" ${picker.uploading ? 'disabled' : ''}>${wechatIcon}</button>` : '');
    }
    if (picker.uploading) $('[data-action="confirm-materials"]', d).disabled = true;
    if (picker.importSource) paintSource(d);
  };
  function paintSource(d) {
    d.querySelector('.material-import-panel')?.remove();
    Array.from(d.children).forEach(node => { node.inert = true; });
    const source = sources[picker.importSource];
    const chosen = picker.importChosen || [];
    const busy = !!picker.uploading;
    d.insertAdjacentHTML('beforeend', `<section class="material-import-panel" aria-label="${source.title}离线演示"><header><h3>${source.title}</h3>${control('取消', 'cancel')}</header><p class="material-import-note">${source.note}</p><div class="material-import-files">${source.files.map(f => `<label class="material-import-file">${f.type === 'image' ? `<img src="${f.url}" alt="${esc(f.name)}示意">` : '<span class="material-import-file-icon" aria-hidden="true">文</span>'}<span><strong>${esc(f.name)}</strong><small>${f.size}</small></span><input type="checkbox" data-material-fixture="${f.key}" aria-label="选择 ${esc(f.name)}" ${chosen.includes(f.key) ? 'checked' : ''} ${busy ? 'disabled' : ''}></label>`).join('')}</div><p class="material-import-status" role="status">${esc(picker.importStatus || (chosen.length ? `已选 ${chosen.length} 份，上传后加入当前暂选。` : '请先选择资料。'))}</p><footer><small>仅示例文件 · 不会真实上传</small><div>${control('模拟上传失败', 'failure', busy || !chosen.length ? 'disabled' : '')}${control(busy ? '正在模拟上传…' : `上传并选中（${chosen.length}）`, 'upload', `class="mmd-primary" ${busy || !chosen.length ? 'disabled' : ''}`)}</div></footer></section>`);
  }
  function showReturnState(done) {
    const mode = new URLSearchParams(location.search).get('returnDemo') || 'ready';
    const view = document.createElement('dialog');
    view.className = 'wechat-return-status';
    view.setAttribute('aria-label', '返回原页面离线演示');
    const messages = { ready: '正在恢复原议事与资料…', error: '原议事暂不可读取，未创建替代会话。', conflict: '当前草稿与离开前不同，请选择保留哪一份。', unknown: '部分结果未确认，不会自动上传或关联。', pending: '有未恢复现场，请主动选择恢复。' };
    const text = document.createElement('p'); text.textContent = messages[mode] || messages.ready; view.append(text);
    document.body.append(view); view.showModal();
    const previous = Array.from(document.body.children).filter(node => node !== view && !['SCRIPT', 'LINK'].includes(node.tagName)).map(node => [node, node.inert, node.style.visibility]);
    previous.forEach(([node]) => { node.inert = true; node.style.visibility = 'hidden'; });
    const close = restore => { view.close(); view.remove(); previous.forEach(([node, inert, visibility]) => { node.inert = inert; node.style.visibility = visibility; }); if (restore) done(); };
    const button = (label, action) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.onclick = action; view.append(el); };
    // Initialization/UI-only changes are not another business draft.
    if (mode === 'ready' || mode === 'initializing') { queueMicrotask(() => close(true)); return; }
    button(mode === 'conflict' ? '采用恢复稿' : mode === 'pending' ? '恢复原现场' : '重试读取', () => close(true));
    button(mode === 'conflict' ? '保留当前稿' : mode === 'unknown' ? '暂存离开' : '暂不恢复', () => close(false));
  }
  function cancelImport() {
    picker.uploading = false;
    picker.importSource = null;
    picker.importGeneration = (picker.importGeneration || 0) + 1;
    showReturnState(() => { renderMaterialPicker(); $('[data-wechat-entry]')?.focus(); });
  }
  function upload(fail) {
    const current = picker;
    const d = $('.material-picker-dialog');
    const source = sources[current.importSource];
    const selected = source.files.filter(f => current.importChosen.includes(f.key));
    if (!selected.length || current.uploading) return;
    const generation = current.importGeneration = (current.importGeneration || 0) + 1;
    current.uploading = true;
    current.importStatus = '正在模拟上传，请稍候…';
    renderMaterialPicker();
    setTimeout(() => {
      if (!d.isConnected || picker !== current || current.importGeneration !== generation) return;
      current.uploading = false;
      if (fail) {
        current.importStatus = '上传失败（演示）。未新增资料，原有选择已保留，可重试或取消。';
        renderMaterialPicker();
        return;
      }
      const added = selected.map(({ key, size, ...file }) => ({ ...file, id: 'wechat-demo-' + Date.now() + '-' + (++serial), version: 1, note: '微信来源 · 仅离线示例' }));
      const previousFiles = [...state.localFiles];
      state.localFiles.push(...added);
      if (!persist()) {
        state.localFiles = previousFiles;
        current.importStatus = '本地原型保存失败，原有选择保留，请重试。';
        renderMaterialPicker();
        return;
      }
      current.ids = [...new Set([...current.ids, ...added.map(f => f.id)])];
      current.selected = added[0].id;
      current.preview = false;
      current.previewDismissed = false;
      current.importSource = null;
      current.uploadStatus = `已模拟上传 ${added.length} 份并选中，点击“完成”带回。取消选材仅放弃引用，不删除已保存的示例资料。`;
      showReturnState(() => {
        renderMaterialPicker();
        $('[data-action="picker-select"][data-id="' + added[0].id + '"]', d)?.scrollIntoView({ block: 'nearest' });
        $('[data-action="confirm-materials"]', d)?.focus({ preventScroll: true });
      });
    }, 550);
  }
  document.addEventListener('click', event => {
    const composerEntry = event.target.closest('[data-composer-wechat]');
    if (composerEntry) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const ctx = conversation();
      if (composerEntry.disabled || ctx.pending || ctx.materialImportPending || ctx.task?.complete || ctx.task?.cancelled) return;
      openMaterials('chat');
      picker.importSource = 'chat'; picker.importChosen = []; picker.importStatus = '';
      renderMaterialPicker(); $('.material-import-panel input')?.focus();
      return;
    }
    const entry = event.target.closest('[data-wechat-entry]');
    if (entry && picker && !picker.uploading) {
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.importSource = 'chat'; picker.importChosen = []; picker.importStatus = '';
      renderMaterialPicker(); $('.material-import-panel input')?.focus();
      return;
    }
    const target = event.target.closest('[data-material-import]');
    if (!target || !picker) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = target.dataset.materialImport;
    if (action === 'cancel') cancelImport();
    else if (action === 'upload' || action === 'failure') upload(action === 'failure');
  }, true);
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-material-fixture]') || !picker) return;
    const key = event.target.dataset.materialFixture;
    picker.importChosen = event.target.checked ? [...new Set([...picker.importChosen, key])] : picker.importChosen.filter(id => id !== key);
    picker.importStatus = '';
    paintSource($('.material-picker-dialog'));
    $('[data-material-fixture="' + key + '"]')?.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker?.importSource && $('.material-import-panel')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelImport();
    }
  }, true);
  const initialPanel = $('.chat-panel');
  if (initialPanel) {
    const ctx = conversation();
    renderComposerMaterialActions(initialPanel, ctx.pending || !!(ctx.task?.complete || ctx.task?.cancelled));
  }
})();

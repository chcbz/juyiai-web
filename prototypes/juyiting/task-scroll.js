'use strict';
// Offline matters-list paging; no API or task writes.
(() => {
  const original = render;
  let observer;
  let generation = 0;
  render = function () {
    observer?.disconnect();
    const current = ++generation;
    original();
    if (page !== 'tasks') return;
    const list = $('.task-list');
    if (!list) return;
    const seed = [...list.querySelectorAll('.task-card')];
    if (!seed.length) return;
    const footer = document.createElement('p');
    footer.className = 'task-page-sentinel';
    footer.hidden = seed.every(row => row.hidden);
    footer.setAttribute('aria-hidden', 'true');
    list.append(footer);
    let batch = 0;
    observer = new IntersectionObserver(async entries => {
      if (footer.hidden || !entries.some(entry => entry.isIntersecting) || batch >= 3) return;
      observer.unobserve(footer);
      footer.innerHTML = '<span class="task-page-spinner"></span>';
      await new Promise(resolve => setTimeout(resolve, 250));
      if (current !== generation) return;
      footer.replaceChildren();
      const visible = seed.filter(row => !row.hidden);
      if (!visible.length) { observer.observe(footer); return; }
      batch += 1;
      visible.forEach(row => {
        const clone = row.cloneNode(true);
        clone.inert = true;
        clone.style.pointerEvents = 'none';
        const title = clone.querySelector('strong');
        if (title) title.textContent = `分页示例 ${batch} · ${title.textContent}`;
        footer.before(clone);
      });
      if (batch < 3) observer.observe(footer);
      else {
        footer.removeAttribute('aria-hidden');
        footer.setAttribute('role', 'status');
        footer.textContent = '已显示全部事项（离线示例）';
      }
    }, { rootMargin: '0px 0px 120px 0px' });
    observer.observe(footer);
  };
  if (page === 'tasks') render();
})();

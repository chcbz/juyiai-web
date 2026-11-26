/* Recommendation R1: offline examples only; never calls a model or dispatches a task. */
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('scenario') !== 'assignee-recommendation') return;
  document.body.classList.add('model-recommendation-page');
  let stage = 'READY', manual = '', alternatives = null;
  const labels = { LOADING:'推荐中', READY:'推荐完成', NO_MATCH:'暂无合适推荐', NO_CANDIDATES:'暂无可承办候选', ERROR:'推荐暂不可用', STALE:'推荐已过期' };
  if (labels[params.get('recommendationState')]) stage = params.get('recommendationState');
  // Local fixtures only. One selected agent, one intent; retry preserves its identity.
  let budget = null, sequence = 0, editing = '', failed = false;
  const choices = new Map();
  const choicePanel = name => editing !== name ? '<button type="button" data-open-choice>查看首次交付方式</button>' : choices.has(name) ? `<p role="status">已固定：${choices.get(name)}。可重新取价。</p>` : failed ? '<button type="button" data-choice-retry>重试原选择</button>' : '<fieldset><legend>首次交付方式（未选择）</legend><p>仅使用本地资料，不调用技能。选择后，当前需求和材料下不可更改；不会开始办理。</p><button type="button" data-choice="本地答复">固定为本地答复</button> <button type="button" data-choice="本地文本文件">固定为本地文本文件</button></fieldset>';
  let pending = null;
  function estimate(name, retry = false) {
    const intent = retry ? budget : {name, key:`demo-key-${++sequence}`, requestId:`demo-request-${sequence}`};
    budget = intent;
    intent.status = 'LOADING';
    setTimeout(() => {
      if (budget !== intent || page !== 'detail') return;
      intent.status = !retry && params.get('budgetState') === 'ERROR' ? 'ERROR' :
        name === '林冲' && params.get('budgetState') !== 'UNAVAILABLE' ? 'AVAILABLE' : 'FALLBACK';
      render();
    }, 350);
  }
  const originalRender = render;
  render = function () {
    if (page !== 'detail') { budget = null; manual = ''; alternatives = null; }
    originalRender();
  };
  // The roster selects a person, it does not confirm or reserve the quote.
  const baseRoster = renderAgents;
  renderAgents = function () {
    baseRoster();
    const action = document.querySelector('.point-and-deliberate');
    if (!action) return;
    const name = ['林冲','吴用'].find(n => state.selectedAgent?.name?.includes(n));
    action.textContent = '查看事项预算'; action.dataset.action = 'review-budget';
    action.disabled = !name || stage === 'NO_CANDIDATES' || params.get('fundedHistory') === 'true';
    action.dataset.reviewCandidate = name || '';
  };
  const previous = renderDetail;
  renderDetail = function () {
    previous();
    document.body.classList.add('model-recommendation-page');
    const card = document.querySelector('.matter-advice-card'); if (!card) return;
    if (params.get('fundedHistory') === 'true') {
      const materials = document.querySelector('.task-material-links');
      materials?.querySelectorAll('.matter-edit-button').forEach(button => button.remove());
      const hint = materials?.querySelector('.mmd-muted'); if (hint) hint.textContent = '历史资料与成果仅供查阅，不再修改需求或追加执行。';
      card.innerHTML = '<div class="matter-advice-heading"><span>历史资金榜</span><strong>仅供查阅</strong></div><h3>原资金榜事项</h3><p>旧资金榜已停止创建、领令、恢复、退款和结算操作；历史记录仍可查阅。</p><p>原请求结果未知时，不会自动重发，不会按新规则补价执行。</p><button type="button" data-history-settlement>查看历史结算示例</button><p data-history-receipt hidden>原始历史结算：总额100文，成本3文，平台费2文，好汉所得95文。仅为离线示例。</p>';
      return;
    }
    const candidates = stage === 'NO_CANDIDATES' ? [] : [{name:'林冲',mine:true,status:'在线',level:'高',reason:'具备识图能力，适合读取成绩图片并整理统计。'},{name:'吴用',mine:false,status:'离线',level:'资料不足',reason:'尚无公开能力介绍，可自行选择后交办。'}];
    const visible = candidates;
    const selected = manual || (stage === 'READY' ? '林冲' : '');
    const expanded = alternatives ?? (!selected && stage !== 'LOADING');
    const selectedAgent = candidates.find(a => a.name === selected);
    if (editing && editing !== selected) { editing = ''; failed = false; pending = null; }
    if (!selectedAgent) budget = null;
    else if (selectedAgent.name !== budget?.name) estimate(selectedAgent.name);
    const price = !budget ? '' : ({LOADING:'正在估算预算…', FALLBACK:'事项报价：1文 · 确认承办时预占，验收后扣除', AVAILABLE:'事项报价：13文 · 确认承办时预占，验收后扣除', UNAVAILABLE:params.get('budgetReason') === 'BILLING_ROUTE_MISSING' ? '暂无法报价：计费配置尚未就绪。如有「查看首次交付方式」，请先核对。配置就绪后点「重新取价」；仍无报价时可换人或联系平台。' : '暂不可估算', ERROR:'预算暂不可用，可重试'})[budget.status];
    card.innerHTML = `<div class="matter-advice-heading"><span>事项进展</span><strong>待确认承办</strong></div><h3>统计一下成绩</h3><p>请根据上传的成绩图片整理统计。</p><dl><div><dt>${manual?'已选承办':'推荐承办'}</dt><dd>${selected||(stage==='LOADING'?'正在推荐…':'请选择承办人')}</dd></div>${selectedAgent?`<div><dt>所属用户 / 当前状态</dt><dd>${selectedAgent.mine?'我的':'外部'} · ${selectedAgent.status}</dd></div>`:''}</dl>${selectedAgent?`<p class="model-selected-reason">${selectedAgent.reason}</p>${choicePanel(selected)}<p><span role="status" data-budget-state="${budget.status}">${price}</span>${budget.status==='ERROR'?'<button type="button" data-budget-retry>重试预算</button>':['AVAILABLE','UNAVAILABLE'].includes(budget.status)?'<button type="button" data-budget-renew>重新取价</button>':''}</p>`:''}${['LOADING','ERROR','STALE'].includes(stage)?`<section class="model-recommendation-demo" aria-live="polite"><div class="model-recommendation-status" role="status">${stage==='LOADING'?'<span class="model-recommendation-spinner" aria-hidden="true"></span>':''}<strong>${stage==='LOADING'?'正在为你挑选合适的好汉…':labels[stage]}</strong></div>${stage==='LOADING'?'<p class="model-recommendation-hint">推荐期间仍可手动选择承办人。</p>':'<button type="button" data-model-retry>重新推荐</button>'}</section>`:''}<button type="button" data-model-alternatives aria-expanded="${expanded}">${expanded?'收起候选列表':selected?'更换承办人':'选择承办人'}</button>${expanded?`<div class="model-manual-options">${visible.map(a=>`<button type="button" data-model-candidate="${a.name}" aria-pressed="${selected===a.name}"><span class="model-candidate-avatar" aria-hidden="true">${a.name.slice(0,1)}</span><span><strong>${a.name}</strong><small>${a.mine?'我的':'外部'} · ${a.status}</small>${stage!=='LOADING'?`<small class="model-recommendation-level">${stage==='NO_MATCH'?'匹配较低':a.level==='资料不足'?'资料不足':'优先推荐'}</small><small>${stage==='NO_MATCH'?'现有能力与这项需求不太匹配，仍可手选。':a.reason}</small>`:''}</span><span aria-hidden="true">${selected===a.name?'✓':''}</span></button>`).join('')||'<p role="status">暂无可选承办人。</p>'}</div>`:''}<div class="matter-primary-actions"><button type="button" class="matter-primary-action" data-model-confirm ${!['AVAILABLE','FALLBACK'].includes(budget?.status)?'disabled':''}>${selected?`确认由${selected}承办`:'请选择承办人'}</button></div>${stage==='NO_CANDIDATES'?'<p role="status">暂未寻得可领令的好汉。</p>':''}<p class="draft-hint">离线演示：人物、能力和13文报价均为合成示例，不执行、不预占、不扣费。</p><details><summary>切换演示状态</summary><div class="model-state-options">${Object.entries(labels).map(([key,label])=>`<button type="button" data-recommendation-stage="${key}" aria-pressed="${key===stage}">${label}</button>`).join('')}</div></details>`;
  };
  document.addEventListener('click', e => {
    const b=e.target.closest('button'); if(!b)return;
    if (b.dataset.action === 'review-budget') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!b.disabled && b.dataset.reviewCandidate) { manual = b.dataset.reviewCandidate; alternatives = false; go('detail'); }
      return;
    }
    if(b.hasAttribute('data-open-choice') && budget){editing=budget.name;render();return;}
    if((b.dataset.choice || b.hasAttribute('data-choice-retry')) && budget?.name===editing && !choices.has(editing)){
      pending=pending || b.dataset.choice;
      if(!failed && params.get('choiceState')==='ERROR'){failed=true;}else{choices.set(editing,pending);failed=false;pending=null;}
      render();return;
    }
    if(b.hasAttribute('data-history-settlement')){e.preventDefault();e.stopImmediatePropagation();document.querySelector('[data-history-receipt]').hidden=false;return;}
    if(b.dataset.recommendationStage){stage=b.dataset.recommendationStage;if(stage==='NO_CANDIDATES')manual='';alternatives=null;render();}
    if(b.hasAttribute('data-model-alternatives')){alternatives=b.getAttribute('aria-expanded')!=='true';render();document.querySelector('[data-model-alternatives]')?.focus();}
    if(b.dataset.modelCandidate){manual=b.dataset.modelCandidate;alternatives=false;render();document.querySelector('[data-model-alternatives]')?.focus();}
    if(b.hasAttribute('data-model-retry')){stage='LOADING';render();}
    if(b.hasAttribute('data-budget-retry') && budget?.status==='ERROR'){estimate(budget.name,true);render();}
    if(b.hasAttribute('data-budget-renew') && budget){estimate(budget.name);render();}
    if(b.hasAttribute('data-model-confirm') && ['AVAILABLE','FALLBACK'].includes(budget?.status))toast(params.get('funds') === 'insufficient' ? '可用文余额不足，无法确认承办；本次未预占费用。' : '离线演示：仅确认选择，未发送真实任务。');
  }, true);
  state.task={title:'统计一下成绩',description:'请根据上传的成绩图片整理统计。',files:[],complete:false};
  state.agent=null; render();
})();

// Offline presentation prototype, not a production Markdown parser.
function prototypeDocumentKind(a){
 const mime=String(a.mime||'').split(';')[0].toLowerCase(),name=a.originalName||a.name||'';
 return mime==='text/html'?'html':['text/markdown','text/x-markdown'].includes(mime)?'markdown':/\.html?$/i.test(name)?'html':/\.(md|markdown)$/i.test(name)?'markdown':'';
}
function prototypeDocumentText(a){
 // Previous prototype uploads kept the original bytes but only placeholder text.
 // Recover those local bytes without refetching or discarding the user's selection.
 const url=String(a.url||'');
 if(url.startsWith('data:')){try{const comma=url.indexOf(','),payload=url.slice(comma+1);return /;base64$/i.test(url.slice(0,comma))?new TextDecoder().decode(Uint8Array.from(atob(payload),c=>c.charCodeAt(0))):decodeURIComponent(payload);}catch{/* Keep known text if a local data URL is unreadable. */}}
 return String(a.text||'');
}
function prototypeDocumentPreview(a){
 const markdown=prototypeDocumentKind(a)==='markdown';
 const text=prototypeDocumentText(a);
 let html=markdown?esc(text).replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>'):text;
 const doc=new DOMParser().parseFromString(html,'text/html');
 for(const node of doc.querySelectorAll('script,iframe,object,embed,link,base,meta,form,input,button,svg,math'))node.remove();
 for(const node of doc.querySelectorAll('*'))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||['href','src','srcset','action','formaction','target'].includes(attr.name))node.removeAttribute(attr.name);
 const csp="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";
 const source=`<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><meta charset="utf-8"><style>body{margin:16px;font:15px/1.65 system-ui;overflow-wrap:anywhere}pre{white-space:pre-wrap}table{max-width:100%}</style>${doc.head.innerHTML}${doc.body.innerHTML}`;
 return `<section class="document-preview"><p>静态文档预览 · 脚本和外部资源不运行，下载可查看原文件。</p><iframe title="${esc(a.name)}预览" sandbox="" referrerpolicy="no-referrer" srcdoc="${esc(source)}" style="display:block;width:100%;height:360px;border:1px solid #deddd6;background:white"></iframe>${!text?'<p role="status">文件内容为空。</p>':''}</section>`;
}

// NF-1: same prototype entry, explicit fixed samples; no Office parser/API/Agent calls.
document.addEventListener('DOMContentLoaded', () => {
 if (new URLSearchParams(location.search).get('scenario') !== 'original-files') return;
 const sample = { origin:'discussion', kind:'xlsx', state:'ready', sheet:0, generation:0, stage:'running' };
 let opener = null;
 const names={discussion:'议事预览',picker:'资料选择',workspace:'资料详情',deliverable:'成果与验收记录'};
 const select=(name,items)=>`<label>${name}<select data-nf-field="${items.field}">${items.values.map(([v,t])=>`<option value="${v}"${sample[items.field]===v?' selected':''}>${t}</option>`).join('')}</select></label>`;
 function controls(){
  document.getElementById('nf-prototype-controls')?.remove();
  const el=document.createElement('section');el.id='nf-prototype-controls';el.className='nf-controls';el.setAttribute('aria-label','原文件预览原型场景');
  el.innerHTML=`<details open><summary>原文件预览 · 离线交互样本</summary><p>模拟展示，不调用后台、不解析Office文件。</p><div class="nf-controls-grid">${select('入口',{field:'origin',values:Object.entries(names)})}${select('文件',{field:'kind',values:[['xlsx','Excel格式样本'],['docx','Word排版样本'],['html','HTML安全样本'],['xls','旧XLS不支持']]})}${select('状态',{field:'state',values:[['ready','可展示'],['loading','加载中'],['error','解析失败'],['protected','受保护'],['denied','无权访问'],['unsupported','不支持'],['partial','部分格式未展示']]})}</div><div class="nf-actions"><button type="button" data-nf-action="open">打开原文件预览</button><button type="button" data-nf-action="handoff">查看带入议事交互</button></div><p role="status" id="nf-request-status">吴用：已收到回复内容 · 请求仍在处理中</p><button type="button" data-nf-action="request-state">模拟权威完成状态</button><small>消息到达不弹“已回话”，不提前完成。</small></details>`;
  document.body.append(el);
 }
 function spreadsheet(){
  return `<div class="nf-sheet-tabs" role="tablist" aria-label="工作表">${['预算','公式说明'].map((s,i)=>`<button type="button" role="tab" aria-selected="${sample.sheet===i}" data-nf-action="sheet" data-sheet="${i}">${s}</button>`).join('')}</div><div class="nf-table-scroll" tabindex="0" role="region" aria-label="工作表内容（可横向滚动）">${sample.sheet===0?'<table class="nf-sheet"><caption>预算 · 合并、边框、颜色、行高列宽及数字格式示例</caption><tbody><tr><th colspan="4" class="nf-merged">办公采购预算 · 2026年11月</th></tr><tr><th>项目</th><th>金额</th><th>比例</th><th>日期</th></tr><tr><td>杯子采购<br><small>自动换行</small></td><td class="nf-money">¥1,234.50</td><td class="nf-percent">25.00%</td><td>2026-11-16</td></tr><tr class="nf-tall"><td>原表保留行高</td><td class="nf-money">¥0.00</td><td class="nf-percent">0.00%</td><td>原始格式示意</td></tr><tr><td colspan="4">隐藏行、列和隐藏工作表不在默认视图展开。</td></tr></tbody></table>':'<table class="nf-sheet"><caption>公式只读 · 不执行计算</caption><thead><tr><th>公式</th><th>显示结果</th><th>说明</th></tr></thead><tbody><tr><td>=SUM(B2:B3)</td><td>¥1,234.50</td><td>文件保存的结果，未重算</td></tr><tr><td>=B5*0</td><td>0</td><td>零是有效保存结果</td></tr><tr><td>=A1&gt;0</td><td>FALSE</td><td>false不是缺少缓存</td></tr><tr><td>=NOW()</td><td>=NOW()</td><td>无保存结果，未计算</td></tr></tbody></table>'}</div><p class="nf-note">展示文件保存值，公式未重新计算；图表等复杂对象不保证完整展示。此处为手工固定样本，不是ExcelJS解析结果。</p>`;
 }
 function content(){
  if(sample.state==='loading')return '<p role="status">正在读取固定版本原文件…</p><button type="button" data-nf-action="loaded">模拟读取完成</button><button type="button" data-nf-action="cancel">取消加载并关闭</button>';
  if(sample.state==='denied')return '<p role="alert">无权访问此文件或文件不可见，已清除预览内容。</p>';
  if(sample.state==='error')return '<p role="alert">原文件暂时无法预览，文件内容未被修改。</p><button type="button" data-nf-action="retry">重新读取此版本</button>';
  if(sample.state==='protected')return '<p role="status">受保护文件暂不支持在线预览。</p>';
  if(sample.state==='unsupported'||sample.kind==='xls')return '<p role="status">此格式不支持在线预览。</p>';
  const notice=sample.state==='partial'?'<p class="nf-warning" role="status">部分内容未展示：图表、复杂条件格式等不在本次预览范围。</p>':'';
  if(sample.kind==='xlsx')return notice+spreadsheet();
  if(sample.kind==='docx')return notice+'<p class="nf-note">保留原页式排版；窄屏可在文档内横向滚动。</p><div class="nf-word-scroll" tabindex="0" role="region" aria-label="Word文档（可横向滚动）"><article class="nf-doc nf-word-page"><h2>办公用品采购建议</h2><p>本页为Word排版交互样本，保留标题、段落、表格与图片位置。</p><table><tr><th>项目</th><th>要求</th></tr><tr><td>杯子</td><td>易清洗、适合日常使用</td></tr></table><figure><div class="nf-image-placeholder" role="img" aria-label="文档图片位置样本">文档图片位置</div><figcaption>原型占位，不代表真实DOCX渲染。</figcaption></figure></article></div>';
  return '<article class="nf-doc"><h2>HTML静态预览样本</h2><p>脚本、外链图片、表单及主动网络不运行。</p><code>&lt;script&gt; 示例只作为文本显示 &lt;/script&gt;</code><p>产品仍使用既有DOMPurify与隔离组件；此处不执行用户HTML。</p></article>';
 }
 function openPreview(){
  const previous=document.querySelector('.nf-preview-dialog');previous?.close();previous?.remove();
  sample.generation++;
  const canDownload=['workspace','deliverable'].includes(sample.origin)&&sample.state!=='denied';
  const d=dialog(`${names[sample.origin]} · 样本.${sample.kind}`,`<div class="nf-preview-meta">固定版本 v2 · 预览不修改原文件</div><div class="nf-preview-body">${content()}</div>`,canDownload?'<button type="button" data-nf-action="download">下载原文件（演示）</button>':'');
  d.classList.add('nf-preview-dialog');
  d.addEventListener('close',()=>{sample.generation++;opener?.focus();},{once:true});
 }
 controls();
 // Existing page navigation re-renders the shell; reattach scenario controls afterwards.
 const baseRender=render;render=function(){baseRender();controls();};
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const d=document.querySelector('.nf-preview-dialog[open]');if(!d)return;
  e.preventDefault();e.stopImmediatePropagation();d.close();d.remove();opener?.focus();
 },true);
 document.addEventListener('change',e=>{
  const key=e.target.dataset.nfField;if(!key)return;
  sample[key]=e.target.value;sample.sheet=0;
  if(document.querySelector('.nf-preview-dialog'))openPreview();
 });
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-nf-action]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  const action=b.dataset.nfAction;
  if(action==='open'){opener=b;openPreview();}
  if(action==='sheet'){sample.sheet=Number(b.dataset.sheet);openPreview();document.querySelector(`.nf-sheet-tabs [data-sheet="${sample.sheet}"]`)?.focus();}
  if(action==='retry'){sample.state='loading';openPreview();}
  if(action==='loaded'){sample.state='ready';openPreview();}
  if(action==='cancel'){const d=b.closest('dialog');d?.close();d?.remove();}
  if(action==='download'){b.insertAdjacentHTML('afterend','<p role="status">离线原型不下载或制造虚假Office文件。</p>');b.disabled=true;}
  if(action==='request-state'){sample.stage=sample.stage==='running'?'completed':'running';document.getElementById('nf-request-status').textContent=sample.stage==='running'?'吴用：已收到回复内容 · 请求仍在处理中':'权威请求状态已完成（模拟），不是由消息到达推断';}
  if(action==='handoff'){
   opener=b;const d=dialog('带入议事 · 草稿冲突', '<p>目标议事已有未发送草稿。替换前双方内容都保留；这里只预填，不调用Agent、不新建事项。</p><label>来源<input readonly value="固定资料v2 + 请分析这份清单"></label><label>目标<input readonly value="原议事未发送草稿"></label><p>资料详情带入密议；事项资料带入原事项议事。身份或事项变化则接管失效。</p>', '<button type="button" data-nf-action="keep">保留当前草稿</button><button type="button" data-nf-action="replace">替换为带入内容</button>');
   d.addEventListener('close',()=>opener?.focus(),{once:true});
  }
  if(action==='keep'||action==='replace'){
   const d=b.closest('dialog');d.querySelector('footer')?.remove();d.querySelector('section')?.remove();
   d.insertAdjacentHTML('beforeend',`<p role="status">${action==='keep'?'已保留原草稿，来源指令与资料未清除。':'已预填至原议事，等待用户点击发送；未创建执行。'}</p>`);
   b.parentElement?.querySelectorAll('button').forEach(x=>x.disabled=true);
  }
 },true);
});

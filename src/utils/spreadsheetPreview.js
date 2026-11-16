// Local presentation only: no workbook edits, formula evaluation, network access or business state.
export function themeColors (xml) {
  if (!xml || /<!DOCTYPE|<!ENTITY/i.test(xml)) return []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0]
  if (!scheme) return []
  const byName = Object.fromEntries(Array.from(scheme.children, n => [n.localName, n.firstElementChild]))
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(name => {
    const n = byName[name]
    const value = n?.localName === 'sysClr' ? n.getAttribute('lastClr') : n?.getAttribute('val')
    return /^[a-f\d]{6}$/i.test(value || '') ? value.toUpperCase() : null
  })
}
const indexed = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080','9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF','000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF','00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99','3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696','003366','339966','003300','333300','993300','993366','333399','333333']
export function color (value, theme = []) {
  if (!value) return undefined
  let hex = /^[a-f\d]{8}$/i.test(value.argb || '') ? value.argb.slice(2) : /^[a-f\d]{6}$/i.test(value.argb || '') ? value.argb : Number.isInteger(value.theme) ? theme[value.theme] : indexed[value.indexed]
  if (!hex || !/^[a-f\d]{6}$/i.test(hex)) return undefined
  const tint = Number(value.tint || 0)
  // Excel tint modifies HSL luminance, not each RGB channel independently.
  if (tint && tint >= -1 && tint <= 1) {
    let [r,g,b] = hex.match(/../g).map(x => parseInt(x,16)/255)
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
    let l=(max+min)/2, h=0, s=0
    if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=((h*60)%360+360)%360}
    l=tint<0?l*(1+tint):l*(1-tint)+tint
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2
    ;[r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x]
    hex=[r,g,b].map(v => Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')
  }
  return '#'+hex
}
const borderStyles = { thin:'1px solid', medium:'2px solid', thick:'3px solid', dotted:'1px dotted', dashed:'1px dashed', double:'3px double', hair:'1px solid', dashDot:'1px dashed', dashDotDot:'1px dashed', mediumDashed:'2px dashed', mediumDashDot:'2px dashed', mediumDashDotDot:'2px dashed', slantDashDot:'2px dashed' }
function fontStyle (font = {}, theme) {
  const style = {}
  if(font.size && Number.isFinite(font.size))style.fontSize=font.size+'pt'
  if (font.name) style.fontFamily=['Arial','Calibri','Times New Roman','Courier New','SimSun','Microsoft YaHei','Noto Sans CJK SC'].includes(font.name)?`"${font.name}",system-ui,sans-serif`:'system-ui,sans-serif'
  if(font.bold)style.fontWeight='bold'
  if(font.italic)style.fontStyle='italic'
  if(font.underline)style.textDecoration='underline'
  if(font.strike)style.textDecoration=(style.textDecoration||'')+' line-through'
  style.color=color(font.color,theme)
  return Object.fromEntries(Object.entries(style).filter(([,v]) => v!==undefined))
}
export function cellStyle (cell, theme) {
  const fill=cell.fill||{}, align=cell.alignment||{}, style=fontStyle(cell.font,theme)
  if(fill.type==='pattern'&&fill.pattern==='solid')style.backgroundColor=color(fill.fgColor,theme)
  const value = cell.formula ? cell.result : cell.value
  style.textAlign = ['left','right','center','justify'].includes(align.horizontal)
    ? align.horizontal
    : typeof value === 'number' || value instanceof Date ? 'right'
      : typeof value === 'boolean' || value?.error ? 'center' : 'left'
  style.whiteSpace=align.wrapText?'pre-wrap':'pre'
  style.justifyContent=align.vertical==='top'?'flex-start':align.vertical==='middle'?'center':'flex-end'
  for(const side of ['top','right','bottom','left']){
    const edge=cell.border?.[side];if(borderStyles[edge?.style])style['border'+side[0].toUpperCase()+side.slice(1)]=borderStyles[edge.style]+' '+(color(edge.color,theme)||'#333333')
  }
  return Object.fromEntries(Object.entries(style).filter(([,v]) => v!==undefined))
}
export function displayValue (cell, date1904, SSF) {
  const formula=cell.formula
  let value=formula?cell.result:cell.value
  if(formula&&value===undefined)return {text:'='+formula+'（未计算）',formula,cached:false}
  if(value==null)return {text:'',formula,cached:!!formula}
  if(value.error)value=value.error
  if(value.richText)value=value.richText.map(x => x.text).join('')
  if(value.text!==undefined)value=value.text
  let historical=false
  if(value instanceof Date){
    historical=value.getTime()<Date.UTC(1900,2,1)
    value=(value.getTime()-Date.UTC(1899,11,30))/86400000-(date1904?1462:0)
  }
  let text=typeof value==='boolean'?(value?'TRUE':'FALSE'):String(value)
  if(typeof value==='number'&&cell.numFmt){try{text=SSF.format(cell.numFmt,value,{date1904})}catch{return {text,formula,cached:!!formula,formatFailed:true}}}
  return {text,formula,cached:!!formula,historical}
}
// Sparse axis: never materialize absent rows merely because a last cell is far away.
function axis (count, defaultSize, ranges) {
  const sorted=ranges.filter(x => x.start<=count&&x.size!==defaultSize).sort((a,b) => a.start-b.start)
  const segments=[];let next=1,offset=0
  for(const range of [...sorted,{start:count+1,end:count+1,size:0}]){
    if(range.start>next){segments.push({start:next,end:range.start-1,size:defaultSize,offset});offset+=(range.start-next)*defaultSize}
    const end=Math.min(range.end,count)
    if(end>=range.start){segments.push({start:range.start,end,size:range.size,offset});offset+=(end-range.start+1)*range.size}
    next=end+1
  }
  return {count,total:offset,segments}
}
export function axisOffset (axis, index) {
  if(index>=axis.count)return axis.total
  const n=index+1;let low=0,high=axis.segments.length-1
  while(low<high){const mid=Math.floor((low+high)/2);if(axis.segments[mid].end<n)low=mid+1;else high=mid}
  const seg=axis.segments[low];return seg?seg.offset+(n-seg.start)*seg.size:0
}
const address = value => {const m=/^([A-Z]+)([1-9]\d*)$/.exec(value);if(!m)throw Error('Invalid merge address');let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return {row:Number(m[2]),col:c}}
export function sheetGeometry (sheet) {
  const model=sheet.model
  const merges=(model.merges||[]).map(text => {const [first,last]=text.split(':').map(address);return {top:first.row,left:first.col,bottom:last.row,right:last.col}})
  const rowCount=merges.reduce((n,m) => Math.max(n,m.bottom),Math.max(sheet.rowCount,1)),colCount=merges.reduce((n,m) => Math.max(n,m.right),Math.max(sheet.columnCount,1))
  const defaultRow=(sheet.properties.defaultRowHeight||15)*96/72, defaultCol=Math.floor((sheet.properties.defaultColWidth||8.43)*7+5)
  const rows=axis(rowCount,defaultRow,(model.rows||[]).map(r => ({start:r.number,end:r.number,size:r.hidden?0:(r.height||sheet.properties.defaultRowHeight||15)*96/72})))
  const cols=axis(colCount,defaultCol,(model.cols||[]).map(c => ({start:c.min,end:c.max,size:c.hidden?0:Math.floor((c.width||sheet.properties.defaultColWidth||8.43)*7+5)})))
  return {rows,cols,merges}
}
function windowIndices (axis, start, end) {
  const result=[]
  for(const seg of axis.segments){
    if(!seg.size||seg.offset>=end||seg.offset+(seg.end-seg.start+1)*seg.size<=start)continue
    const first=Math.max(seg.start,seg.start+Math.floor((start-seg.offset)/seg.size)),last=Math.min(seg.end,seg.start+Math.ceil((end-seg.offset)/seg.size)-1)
    for(let i=first;i<=last;i++)result.push(i)
  }
  return result
}
export function project (sheet, geometry, box, date1904, SSF, theme) {
  const {rows,cols,merges}=geometry, output=[],seen=new Set()
  const rs=windowIndices(rows,box.top,box.top+box.height),cs=windowIndices(cols,box.left,box.left+box.width)
  for(const row of rs)for(const col of cs){
    const merged=merges.find(m => row>=m.top&&row<=m.bottom&&col>=m.left&&col<=m.right)
    const r=merged?.top||row,c=merged?.left||col,bottom=merged?.bottom||row,right=merged?.right||col,key=r+':'+c
    if(seen.has(key))continue;seen.add(key)
    const cell=sheet.getCell(r,c)
    output.push({key,row:r,col:c,left:axisOffset(cols,c-1),top:axisOffset(rows,r-1),width:axisOffset(cols,right)-axisOffset(cols,c-1),height:axisOffset(rows,bottom)-axisOffset(rows,r-1),...displayValue(cell,date1904,SSF),runs:cell.value?.richText?.map(run => ({text:String(run.text||''),style:fontStyle(run.font,theme)})),style:cellStyle(cell,theme)})
  }
  return {cells:output,width:cols.total,height:rows.total}
}

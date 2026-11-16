import ExcelJS from 'exceljs'
import * as SSF from 'ssf'
import { sheetGeometry, project } from '../utils/spreadsheetPreview.js'

let workbook = null
let sheet = null
let geometry = null
let theme = []
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(data.bytes)
      self.postMessage({ type: 'loaded', sheets: workbook.worksheets.filter(item => item.state === 'visible').map(item => ({ id: item.id, name: item.name })), themeXml: workbook.model.themes?.theme1 || '' })
    } else if (data.type === 'view' && workbook) {
      const selected = workbook.getWorksheet(data.sheetId)
      if (!selected || selected.state !== 'visible') throw new Error('工作表不可见。')
      if (selected !== sheet) { sheet = selected; geometry = sheetGeometry(sheet) }
      theme = data.theme || theme
      self.postMessage({ type: 'view', requestId: data.requestId, sheetId: sheet.id, ...project(sheet, geometry, data.box, workbook.properties.date1904, SSF, theme) })
    }
  } catch {
    self.postMessage({ type: 'error', requestId: data.requestId, message: 'Excel原文件无法解析，可能已损坏或采用不支持的格式。' })
  }
}

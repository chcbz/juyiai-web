import { richDocumentKind } from './richDocumentPreview.js'

export const previewMime = value => {
  const mime = String(value || '').split(';', 1)[0].trim().toLowerCase()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}
export function filePreviewKind (mime, filename = '') {
  const type = previewMime(mime)
  const rich = richDocumentKind(type, filename)
  if (rich) return rich
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (!type || type === 'application/octet-stream' || type === 'text/plain') {
    if (/\.docx$/i.test(filename)) return 'docx'
    if (/\.xlsx$/i.test(filename)) return 'xlsx'
  }
  if (type === 'application/pdf') return 'pdf'
  if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/heif', 'image/tiff'].includes(type)) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (['text/plain', 'text/csv', 'application/json'].includes(type)) return 'text'
  if ((!type || type === 'application/octet-stream') && /\.(txt|csv|json)$/i.test(filename)) return 'text'
  return ''
}

// This changes only the generated data URL label, never the original document bytes.
export function normalizeEmbeddedImageMime (body) {
  for (const img of body.querySelectorAll('img')) {
    const match = /^data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)$/.exec(img.getAttribute('src') || '')
    if (!match) continue
    const bytes = atob(match[1].slice(0, 32))
    const mime = bytes.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
      : bytes.startsWith('\xff\xd8\xff') ? 'image/jpeg'
        : /^GIF8[79]a/.test(bytes) ? 'image/gif'
          : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' ? 'image/webp' : ''
    if (mime) img.setAttribute('src', `data:${mime};base64,${match[1]}`)
  }
}

export function assertOfficeContainer (bytes) {
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8))
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => header[i] === b)) {
    throw new Error('此文件采用受保护或旧版容器，暂不支持在线预览。')
  }
}

const { ID } = require('./file-messages')
const { safeName } = require('./download-page')
const ownImportDirectory = (name, prefix) => {
  if (!name.startsWith(prefix + 'import-')) return false
  const suffix = name.slice((prefix + 'import-').length)
  return ID.test(suffix.slice(0, 36)) && /^-(?:[0-9]|[12][0-9]|3[01])$/.test(suffix.slice(36))
}
const prepareImportFile = async (file, config, requestId, index) => {
  if (file.ownedPath) return
  const fs = wx.getFileSystemManager()
  const name = config.filePrefix + 'import-' + requestId + '-' + index
  if (!ownImportDirectory(name, config.filePrefix)) throw new Error('Invalid import path')
  const directory = wx.env.USER_DATA_PATH + '/' + name
  await new Promise((resolve, reject) => fs.mkdir({ dirPath: directory, recursive: true, success: resolve, fail: reject }))
  file.ownedDirectory = directory
  const path = directory + '/' + safeName(file.name, '')
  await new Promise((resolve, reject) => fs.copyFile({ srcPath: file.path, destPath: path, success: resolve, fail: reject }))
  file.ownedPath = path
}
const releaseImportFiles = files => {
  const fs = wx.getFileSystemManager()
  for (const file of files) {
    const removeDirectory = () => { if (file.ownedDirectory) fs.rmdir({ dirPath: file.ownedDirectory, fail: () => {} }) }
    if (file.ownedPath) fs.unlink({ filePath: file.ownedPath, success: removeDirectory, fail: () => {} })
    else removeDirectory()
  }
}
const cleanOrphanImports = (files, root, config, state) => {
  const fs = wx.getFileSystemManager()
  for (const name of files) {
    if (!ownImportDirectory(name, config.filePrefix)) continue
    const id = name.slice((config.filePrefix + 'import-').length, (config.filePrefix + 'import-').length + 36)
    const current = () => state.pendingImports?.[id] || state.consumedImports?.[id]
    if (current()) continue
    const directory = root + '/' + name
    fs.readdir({ dirPath: directory, success: ({ files: children }) => {
      if (current()) return
      // Only direct regular owned copies, never recurse through arbitrary paths.
      for (const child of children) {
        if (!child || child === '.' || child === '..' || /[\/\\\x00-\x1f]/.test(child)) continue
        fs.unlink({ filePath: directory + '/' + child, success: () => { if (!current()) fs.rmdir({ dirPath: directory, fail: () => {} }) }, fail: () => {} })
      }
      if (!children.length) fs.rmdir({ dirPath: directory, fail: () => {} })
    }, fail: () => {} })
  }
}
module.exports = { ownImportDirectory, prepareImportFile, releaseImportFiles, cleanOrphanImports }

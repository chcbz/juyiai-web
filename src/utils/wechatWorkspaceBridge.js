import { useApiStore } from '../stores/api.js'
import config from '../../miniprogram/juyiting/utils/app-config.json'
import { inMiniProgram } from './miniProgramFileBridge.js'
import { requestWechatMaterials } from './miniProgramMaterialBridge.js'

// Workspace transport adapter; never initiates a conversation association or send.
export const createWechatWorkspaceBridge = () => ({
  wechatSupported: inMiniProgram(globalThis.window),
  async importWechat(options) {
    const api = useApiStore()
    const generation = api.authorizationGeneration

    const selected = options.selected.map(item => ({ ...item }))
    const staged = options.staged.map(item => ({ ...item }))
    const token = await api.token()
    const source = JSON.parse(JSON.stringify(options.getSource?.() || options.source))
    return requestWechatMaterials({ ...options, source, selected, staged, token, webPolicy: config.webPolicy,
      isCurrent: () => generation === api.authorizationGeneration && options.isCurrent() })
  }
})

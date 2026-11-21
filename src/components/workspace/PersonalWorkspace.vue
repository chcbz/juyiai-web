<template>
  <main ref="workspaceRoot" class="personal-workspace" :class="{ 'is-hall-treasure': embedded, 'is-compact-hall': embedded && compact }">
    <header v-if="!embedded" class="workspace-header">
      <div><p class="workspace-eyebrow">聚义 · 内堂收纳</p><h1>百宝箱</h1><p>打开一件事，再专心办完它。</p></div>
      <p class="workspace-header-note">资料只在你明确提交时，才会授权给所选 Agent。</p>
    </header>

    <section v-if="embedded" class="treasure-content" :data-view="treasureView">
      <template v-if="treasureView === 'list'">
        <div class="treasure-intro"><div><h2>我的资料</h2><p>按文件名查找，打开后可预览和选择版本。</p></div><button class="treasure-primary hall-tool" type="button" @click="treasureView = 'upload'" aria-label="上传资料" title="上传资料"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5"/></svg></button></div>
        <nav ref="categoryNav" class="treasure-tabs" aria-label="百宝箱分类"><button v-for="tab in treasureTabs" :key="tab.key" type="button" :aria-pressed="treasureTab === tab.key" @click="changeTreasureTab(tab.key)">{{ tab.label }}</button></nav>
        <form class="treasure-search" @submit.prevent="submitTreasureSearch"><label><span class="sr-only">搜索文件名称</span><input ref="searchField" v-model="query" enterkeyhint="search" maxlength="100" placeholder="搜索文件名称" /></label><button type="submit" :disabled="workspace.loading.value" class="hall-tool" aria-label="搜索文件名称" title="搜索文件名称"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form>
        <div v-if="appliedSearch" class="file-search-context">
          <span>当前搜索：<strong>{{ appliedSearch }}</strong></span>
          <button type="button" @click="clearTreasureSearch">清除搜索</button>
        </div>
        <p v-if="workspace.listState.value === 'loading'" role="status">正在翻看资料…</p>
        <div ref="fileListRef" class="treasure-file-list">
          <div v-for="file in treasureFiles" :key="file.fileId" class="treasure-file-row">
            <span class="file-family-label" :data-family="file.mediaFamily">{{ familyText(file.mediaFamily) }}</span>
            <div class="file-list-copy"><strong>{{ file.displayName }}</strong><p>{{ originText(file.originKind) }} · v{{ file.latestVersion }}</p></div>
            <button type="button" :data-file-id="file.fileId" :disabled="!detailAllowed || workspace.actionState.value === 'loading-detail'" @click="openTreasureFile(file.fileId)" class="hall-row-link treasure-file-open" :aria-label="`查看文件：${file.displayName}`" :title="`查看文件：${file.displayName}`"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg></button></div>
        </div>
        <div v-if="listEmpty" class="treasure-empty">
          <p role="status">{{ emptyListMessage }}</p>
          <button v-if="otherFilesAvailable" type="button" @click="showAllFiles">查看全部文件</button>
        </div>
        <p v-if="workspace.listState.value === 'error'" role="alert">文件暂未完整读取，已读取的文件会保留。<button type="button" :disabled="workspace.loading.value" @click="workspace.nextCursor.value ? loadMore() : refresh()">重试加载</button></p>
        <p
          v-else-if="workspace.nextCursor.value"
          ref="listEndRef"
          class="treasure-list-status"
          role="status"
        >{{ workspace.loading.value ? '正在加载更多资料…' : '向下滚动自动加载' }}</p>
        <p v-else-if="!workspace.loading.value && treasureFiles.length" class="treasure-list-status" role="status">已显示全部资料</p>
      </template>
      <form v-else-if="treasureView === 'upload'" class="treasure-form" @submit.prevent="uploadTreasure">
        <p>上传后可在草稿里选用；上传本身不会把资料交给好汉。</p>
        <label><span>选择资料</span><input type="file" :accept="acceptTypes" @change="onUploadFile" /></label>
        <label><span>显示名称（可选）</span><input v-model="uploadDisplayName" maxlength="255" placeholder="留空使用文件名称" /></label>
        <p v-if="uploadFile">{{ uploadFile.name }} · {{ byteText(uploadFile.size) }}</p>
        <div class="treasure-actions"><button type="button" @click="back">取消</button><button class="treasure-primary" type="submit" :disabled="!uploadFile || workspace.actionState.value === 'uploading'">{{ workspace.actionState.value === 'uploading' ? '正在上传…' : '确认上传' }}</button></div>
      </form>
      <template v-else-if="workspace.detail.value">
        <div class="treasure-file-heading"><div><h2 ref="detailTitleRef" tabindex="-1">{{ workspace.detail.value.file.displayName }}</h2><p>{{ originText(workspace.detail.value.file.originKind) }} · {{ workspace.detail.value.file.state === 'TRASHED' ? '已回收' : '资料由你管理' }}</p></div><button v-if="treasureView === 'preview'" type="button" @click="treasureView = 'manage'" class="hall-tool" aria-label="更多文件管理" title="更多文件管理"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></div>
        <template v-if="treasureView === 'preview'">
          <div class="treasure-preview-tools treasure-version-tools"><label><span class="treasure-version-label">版本</span><select v-model="selectedVersion" @change="preview(selectedVersion)"><option v-for="version in workspace.detail.value.versions" :key="version.version" :value="version.version">v{{ version.version }} · {{ version.originalFilename }}</option></select></label><button type="button" @click="download(selectedVersion)" class="hall-tool" :aria-label="`下载 v${selectedVersion}`" :title="`下载 v${selectedVersion}`"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg></button></div>
          <template v-if="workspace.hasMoreVersions.value"><button type="button" :disabled="workspace.versionsState.value === 'loading'" @click="workspace.loadMoreVersions">{{ workspace.versionsState.value === 'loading' ? '正在读取历史版本…' : '读取更早版本' }}</button></template><p v-if="workspace.versionsError.value" role="alert">{{ workspace.versionsError.value }}</p>
          <p class="treasure-note">当前查看版本 {{ selectedVersion }}；上传新版本不会替换已提交事项中的资料。</p>
          <section class="treasure-preview" aria-label="文件预览" aria-live="polite">
            <p v-if="workspace.actionState.value === 'loading-preview'">正在读取预览…</p>
            <FilePreview v-else-if="workspace.preview.value.kind === 'file'" :source="workspace.preview.value.source" />
            <p v-else>{{ workspace.preview.value.message || '请选择固定版本预览。' }}</p>
          </section>
          <details v-if="workspace.detail.value.file.state === 'ACTIVE'" class="treasure-form" @toggle="loadProcessingAgents">
            <summary>在密议中处理此资料</summary>
        <label><span>已有好汉</span><select :value="execution.selectedAgentId.value" :disabled="execution.rosterState.value === 'loading'" @change="selectExecutionAgent($event.target.value)"><option value="">请选择自家好汉</option><option v-for="agent in execution.agents.value" :key="agent.agentId" :value="agent.agentId">{{ agent.name }}</option></select></label>
        <p v-if="execution.rosterError.value" class="workspace-error" role="alert">{{ execution.rosterError.value }}</p>
            <label><span>处理说明</span><textarea v-model="executionInstruction" maxlength="4000" placeholder="说明需要怎样处理此版本。"></textarea></label>
            <button type="button" :disabled="!canCreateExecution || !selectedExecutionVersion" @click="openProcessingConversation(executionInstruction, [{ fileId: workspace.detail.value.file.fileId, version: selectedVersion }])">在密议中处理</button>
          </details>
          <div class="treasure-actions"><button v-if="workspace.detail.value.file.state === 'ACTIVE'" class="treasure-primary" type="button" @click="useForDraft">用此资料提需求</button><button v-else type="button" @click="treasureView = 'manage'">恢复文件</button></div>
        </template>
        <section v-else class="treasure-management">
          <template v-if="workspace.detail.value.file.state === 'ACTIVE'">
            <form class="treasure-form" @submit.prevent="rename"><label><span>文件名称</span><input v-model="renameValue" maxlength="255" /></label><button type="submit" :disabled="workspace.actionState.value === 'saving'">保存名称</button></form>
            <div class="treasure-form"><label><span>上传新版本</span><input type="file" :accept="acceptTypes" @change="onVersionFile" /></label><p>旧版本及已有事项的资料引用会保留。</p><p v-if="!nextVersion" role="status">已达到文件版本上限。</p><button type="button" :disabled="!versionFile || !nextVersion || workspace.actionState.value === 'appending-version'" @click="appendVersion">上传为新版本</button></div>
            <div class="treasure-manage-danger"><button v-if="!trashUsage" type="button" @click="prepareTrash">移入回收站</button><div v-else role="group" aria-label="回收确认"><p>{{ trashConfirmationText(trashUsage) }}</p><div class="treasure-actions"><button type="button" @click="trashUsage = null">取消</button><button type="button" :disabled="workspace.actionState.value === 'saving'" @click="confirmTrash">移入回收站</button></div></div></div>
          </template>
          <template v-else><p>恢复后可继续在资料列表中使用。本版不提供永久删除。</p><button class="treasure-primary" type="button" @click="restoreTreasure">恢复文件</button></template>
        </section>
      </template>
    </section>

    <section v-if="!embedded" class="modal-stage" :class="{ 'has-child-modal': activeModal !== 'home', 'has-detail-modal': activeModal === 'detail' }" aria-label="百宝箱多层弹窗">
      <section
        v-if="!embedded"
        class="babao-modal box-modal"
        :class="{ recessed: activeModal !== 'home' }"
        aria-labelledby="babao-box-title"
      >
        <p class="section-kicker">第一层 · 箱面</p><h2 id="babao-box-title">这一箱，先办哪一件？</h2>
        <p class="modal-copy">百宝箱只保留入口；资料、密议处理和文件详情在下一层分别打开。</p>
        <div class="box-actions">
          <button type="button" @click="openModal('library')"><span>资料柜</span><small>{{ workspace.items.value.length ? `已读入 ${workspace.items.value.length} 份资料` : '查看、收纳和取用资料' }}</small></button>
          <button type="button" @click="openModal('delivery')"><span>密议处理</span><small>选择好汉并带入处理说明</small></button>
          <button type="button" :disabled="!workspace.items.value.length" @click="openRecentFile"><span>继续办事</span><small>取出最近一份资料，进入办事笺</small></button>
        </div>
        <div class="box-footnote"><span>已选资料 {{ executionMaterials.length }} 份</span><span>最近执行：{{ recentExecutionText }}</span></div>
      </section>

      <section
        v-if="isLibraryModal"
        v-show="!embedded || activeModal === 'library'"
        :inert="embedded && activeModal !== 'library' ? '' : null"
        :aria-hidden="embedded && activeModal !== 'library' ? 'true' : null"
        class="babao-modal child-modal library-modal"
        :class="{ recessed: activeModal === 'detail' }"
        aria-labelledby="workspace-files-title"
      >
        <div class="modal-heading"><div><p v-if="!embedded" class="section-kicker">第二层 · 资料柜</p><h2 id="workspace-files-title">{{ state === 'TRASHED' ? '回收站' : '我的文件' }}</h2><p>选择资料，查看固定版本、预览及来源。</p></div><button
          v-if="!embedded"
          type="button"
          class="quiet-action"
          @click="backToBox"
        >返回箱面</button></div>
        <div class="library-tools">
          <label class="file-picker"><span>添入资料</span><input type="file" :accept="acceptTypes" @change="onUploadFile" /></label>
          <label class="inline-name"><span class="sr-only">显示名（可选）</span><input v-model="uploadDisplayName" maxlength="255" placeholder="显示名（可选）" /></label>
          <button type="button" :disabled="!uploadFile || workspace.actionState.value === 'uploading'" @click="upload">{{ workspace.actionState.value === 'uploading' ? '收入箱中…' : '收入百宝箱' }}</button>
        </div>
        <p v-if="uploadFile" class="selected-file">待收入：{{ uploadFile.name }}（{{ byteText(uploadFile.size) }}）</p>
        <form class="filters" @submit.prevent="refresh"><label><span>搜索</span><input v-model="query" maxlength="100" placeholder="按显示名搜索" /></label><label><span>类型</span><select v-model="mediaFamily"><option value="">全部类型</option><option value="IMAGE">图片</option><option value="AUDIO">音频</option><option value="TEXT">文本</option><option value="DOCUMENT">文档</option><option value="SPREADSHEET">Excel 表格</option><option value="PRESENTATION">PPT 演示</option><option value="PDF">PDF</option></select></label><div class="filter-actions"><button type="submit">筛选</button><button type="button" :class="{ active: state === 'ACTIVE' }" @click="switchState('ACTIVE')">文件</button><button type="button" :class="{ active: state === 'TRASHED' }" @click="switchState('TRASHED')">回收站</button></div></form>
        <p v-if="workspace.listState.value === 'loading'" class="workspace-note" role="status">正在翻看资料…</p><p v-else-if="workspace.listState.value === 'empty'" class="workspace-empty">{{ state === 'TRASHED' ? '回收站为空。' : embedded ? '还没有文件。可先添入资料。' : '还没有文件。可先添入资料，或返回箱面打开交付台。' }}</p>
        <div v-else ref="fileListRef" class="file-list"><button
          v-for="file in workspace.items.value"
          :key="file.fileId"
          :data-file-id="file.fileId"
          type="button"
          class="file-row"
          :disabled="embedded && !detailAllowed"
          @click="openFile(file.fileId)"
        ><span class="file-icon" aria-hidden="true">{{ iconFor(file.mediaFamily) }}</span><span class="file-summary"><strong>{{ file.displayName }}</strong><small>v{{ file.latestVersion }} · {{ familyText(file.mediaFamily) }} · {{ originText(file.originKind) }}</small></span><span class="file-state">取出</span></button></div>
        <p v-if="embedded && !detailAllowed" class="workspace-note">请先返回，再打开文件详情。</p>
        <button
          v-if="workspace.nextCursor.value"
          type="button"
          class="load-more quiet-action"
          :disabled="workspace.loading.value"
          @click="loadMore"
        >加载更多</button>
      </section>

      <section v-if="!embedded && activeModal === 'delivery'" class="babao-modal child-modal delivery-modal" aria-labelledby="workspace-generation-title">
        <div class="modal-heading"><h2 id="workspace-generation-title">在密议中处理</h2><button type="button" @click="backToBox">返回箱面</button></div>
        <label><span>已有好汉</span><select :value="execution.selectedAgentId.value" :disabled="execution.rosterState.value === 'loading'" @change="selectExecutionAgent($event.target.value)"><option value="">请选择自家好汉</option><option v-for="agent in execution.agents.value" :key="agent.agentId" :value="agent.agentId">{{ agent.name }}</option></select></label>
        <p v-if="execution.rosterError.value" class="workspace-error" role="alert">{{ execution.rosterError.value }}</p>
        <label><span>处理说明</span><textarea v-model="generationInstruction" maxlength="4000" placeholder="说明需要怎样处理，可不选资料。"></textarea></label>
        <p>只带入密议，不自动发送。文件由会话持有，需要时再保存到个人资料。</p>
        <button type="button" :disabled="!canCreateGeneration" @click="openProcessingConversation(generationInstruction, [])">在密议中处理</button>
        <details class="execution-history" aria-label="历史执行记录"><summary>历史记录（只读）</summary>
          <button type="button" :disabled="execution.historyState.value === 'loading'" @click="execution.loadHistory()">刷新记录</button>
          <p v-if="execution.historyError.value" role="alert">{{ execution.historyError.value }}</p>
          <p v-if="execution.historyState.value === 'empty'">暂无历史记录。</p>
          <ul><li v-for="item in execution.history.value" :key="item.executionId"><button type="button" @click="chooseHistoryExecution(item.executionId)">{{ executionStateText(item.state) }} · {{ formatDate(item.createdAt) }}</button></li></ul>
          <button v-if="execution.historyNextCursor.value" type="button" :disabled="execution.historyState.value === 'loading'" @click="loadMoreExecutionHistory">读取更早记录</button>
          <p v-if="execution.execution.value">历史状态：{{ executionStateText(execution.execution.value.state) }}。仅供查阅，不恢复旧执行。</p>
          <p v-if="execution.error.value" role="alert">{{ execution.error.value }}</p>
        </details>
      </section>

      <section v-if="activeModal === 'detail' && workspace.detail.value" class="babao-modal detail-modal" aria-labelledby="workspace-detail-title">
        <div class="modal-heading"><div><p v-if="!embedded" class="section-kicker">第三层 · 文件详情</p><h2 id="workspace-detail-title" ref="detailTitleRef" tabindex="-1">{{ workspace.detail.value.file.displayName }}</h2><p>{{ embedded ? '旧版本仍可查看，上传新版本不会替换已交办的资料。' : '每次只处理一个角度：概况、版本或办事笺。' }}</p></div><button type="button" class="quiet-action" @click="backToLibrary">返回资料柜</button></div>
        <button v-if="embedded && workspace.detail.value.file.state === 'ACTIVE'" type="button" @click="useForDraft">使用当前固定版本起草交办</button>
        <nav class="detail-tabs" aria-label="文件详情操作"><button type="button" :class="{ active: detailPane === 'summary' }" @click="detailPane = 'summary'">概况</button><button type="button" :class="{ active: detailPane === 'versions' }" @click="detailPane = 'versions'">版本与预览</button><button
          v-if="!embedded && workspace.detail.value.file.state === 'ACTIVE'"
          type="button"
          :class="{ active: detailPane === 'execution' }"
          @click="detailPane = 'execution'"
        >办事笺</button></nav>
        <section v-if="detailPane === 'summary'" class="detail-pane"><dl class="file-details"><div><dt>最新版本</dt><dd>v{{ workspace.detail.value.file.latestVersion }}</dd></div><div><dt>状态</dt><dd>{{ workspace.detail.value.file.state === 'TRASHED' ? '回收站' : '可用' }}</dd></div><div><dt>来源</dt><dd>{{ originText(workspace.detail.value.file.originKind) }}</dd></div></dl><template v-if="workspace.detail.value.file.state === 'ACTIVE'"><form class="inline-form" @submit.prevent="rename"><label><span>显示名</span><input v-model="renameValue" maxlength="255" /></label><button type="submit" :disabled="workspace.actionState.value === 'saving'">保存名称</button></form><div class="version-upload"><label class="file-picker"><span>追加新版本</span><input type="file" :accept="acceptTypes" @change="onVersionFile" /></label><span v-if="versionFile && nextVersion">将创建 v{{ nextVersion }}：{{ versionFile.name }}</span><button type="button" :disabled="!versionFile || !nextVersion || workspace.actionState.value === 'appending-version'" @click="appendVersion">上传为新版本</button></div></template><div class="danger-zone"><template v-if="workspace.detail.value.file.state === 'ACTIVE'"><p>移入回收站后仍可恢复。</p><button
          type="button"
          class="danger"
          :disabled="workspace.actionState.value === 'saving'"
          @click="trash"
        >移入回收站</button></template><template v-else><p>本版不提供永久删除。</p><button type="button" :disabled="workspace.actionState.value === 'saving'" @click="restore">恢复文件</button></template></div></section>
        <section v-else-if="detailPane === 'versions'" class="detail-pane"><template v-if="workspace.hasMoreVersions.value"><button type="button" :disabled="workspace.versionsState.value === 'loading'" @click="workspace.loadMoreVersions">{{ workspace.versionsState.value === 'loading' ? '正在读取历史版本…' : '读取更早版本' }}</button></template><p v-if="workspace.versionsError.value" role="alert">{{ workspace.versionsError.value }}</p><div
          v-for="version in workspace.detail.value.versions"
          :key="version.version"
          class="version-row"
          :class="{ active: selectedVersion === version.version }"
        ><button type="button" @click="selectedVersion = version.version">v{{ version.version }}</button><span>{{ version.originalFilename }}</span><small>{{ byteText(version.byteLength) }} · {{ formatDate(version.createdAt) }}</small><div class="version-actions"><button
          v-if="!embedded"
          type="button"
          :disabled="!canAddVersionAsMaterial(version)"
          @click="addExecutionMaterial({ fileId: workspace.detail.value.file.fileId, version: version.version, displayName: workspace.detail.value.file.displayName, contentMimeType: version.contentMimeType })"
        >{{ isExecutionMaterial(workspace.detail.value.file.fileId) ? '已选资料' : '加入资料' }}</button><button type="button" @click="preview(version.version)" class="hall-tool" :aria-label="`预览 v${version.version}`" :title="`预览 v${version.version}`"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button><button type="button" @click="download(version.version)" class="hall-tool" :aria-label="`下载 v${version.version}`" :title="`下载 v${version.version}`"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg></button></div></div><section class="workspace-preview" aria-label="固定版本预览">
          <FilePreview v-if="workspace.preview.value.kind === 'file'" :source="workspace.preview.value.source" />
          <p v-else>{{ workspace.preview.value.message || '请选择固定版本预览。' }}</p>
        </section></section>
        <section v-else class="detail-pane execution-pane">
          <p>选择固定资料，只在密议发送时授权使用。</p>
          <button type="button" :disabled="!canAddSelectedMaterial" @click="addSelectedMaterial">加入当前版本</button>
          <div class="material-actions"><button v-for="item in executionMaterials" :key="item.fileId" type="button" @click="removeExecutionMaterial(item.fileId)">{{ materialLabel(item) }} ×</button></div>
        <label><span>已有好汉</span><select :value="execution.selectedAgentId.value" :disabled="execution.rosterState.value === 'loading'" @change="selectExecutionAgent($event.target.value)"><option value="">请选择自家好汉</option><option v-for="agent in execution.agents.value" :key="agent.agentId" :value="agent.agentId">{{ agent.name }}</option></select></label>
        <p v-if="execution.rosterError.value" class="workspace-error" role="alert">{{ execution.rosterError.value }}</p>
          <label><span>处理说明</span><textarea v-model="executionInstruction" maxlength="4000" placeholder="说明需要怎样处理所选资料。"></textarea></label>
          <button type="button" :disabled="!canCreateExecution" @click="openProcessingConversation(executionInstruction, executionMaterials)">在密议中处理</button>
        </section>
      </section>
    </section>
    <WorkspaceWriteRecovery :pending="workspace.pendingWrites.value" @retry="workspace.retryWrite" />
    <p v-if="workspace.writeNotice.value" class="workspace-note workspace-page-message" role="status">{{ workspace.writeNotice.value }} <template v-if="workspace.detailRetryFileId.value"><button type="button" :disabled="workspace.actionState.value === 'loading-detail'" @click="retrySavedDetail">重新加载</button></template></p>
    <p v-if="workspace.error.value" class="workspace-error workspace-page-message" role="alert">{{ workspace.error.value }}</p>
  </main>
</template>

<script setup>
import FilePreview from '../preview/FilePreview.vue'
import WorkspaceWriteRecovery from '@/components/personal-workspace/WorkspaceWriteRecovery.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApiStore } from '@/stores/api'
import { useGlobalStore } from '@/stores/global'
import { savePersonalWorkspaceBlob, usePersonalWorkspace } from '@/composables/usePersonalWorkspace'
import { usePersonalWorkspaceExecutionHistory } from '@/composables/usePersonalWorkspaceExecution'
import { workspaceByteText, validMaterialVersion } from '@/utils/personalWorkspaceProtocol'

const { embedded, detailAllowed, compact } = defineProps({
  compact: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  detailAllowed: { type: Boolean, default: true }
})
const emit = defineEmits(['start-draft', 'open-deliberation'])
const useForDraft = () => {
  const file = workspace.detail.value?.file
  if (file?.state !== 'ACTIVE' || !selectedExecutionVersion.value) return
  emit('start-draft', {
    originRef: 'juyiting:file',
    sourceRef: { sourceType: 'FILE', sourceId: file.fileId, version: selectedVersion.value },
    inputs: [{ fileId: file.fileId, version: selectedVersion.value }]
  })
}
const apiStore = useApiStore()
const globalStore = useGlobalStore()
const identityEpoch = computed(() => apiStore.authorizationGeneration)
const executionIdentityScope = computed(() => {
  const owner = String(globalStore.user?.id || globalStore.user?.openid || globalStore.getUserId || globalStore.getOpenid || '').trim()
  const client = String(apiStore.oauthClientId || '').trim()
  const tenant = String(globalStore.user?.tenantId || globalStore.user?.tenantCode || globalStore.user?.tenant || '').trim()
  return owner && client ? [tenant, client, owner].filter(Boolean).join('\u0000') : ''
})
const workspace = usePersonalWorkspace({ identityEpoch })
const execution = usePersonalWorkspaceExecutionHistory({ identityEpoch, identityScope: executionIdentityScope })
const query = ref('')
const appliedSearch = ref('')
const searchField = ref(null)
const mediaFamily = ref('')
const state = ref('ACTIVE')
const activeModal = ref(embedded ? 'library' : 'home')
const detailPane = ref('summary')
const isLibraryModal = computed(() => activeModal.value === 'library' || activeModal.value === 'detail')
let viewGeneration = 0
let disposed = false
const viewSnapshot = () => ({ generation: viewGeneration, epoch: identityEpoch.value })
const ownsView = snapshot => !disposed && snapshot.generation === viewGeneration && snapshot.epoch === identityEpoch.value
const selectedId = ref('')
const selectedVersion = ref('1')
const uploadFile = ref(null)
const versionFile = ref(null)
const uploadDisplayName = ref('')
const renameValue = ref('')
const executionInstruction = ref('')
const generationInstruction = ref('')
const executionMaterials = ref([])
const selectedExecutionVersion = computed(() => workspace.detail.value?.versions?.find(version => version.version === selectedVersion.value) || null)
const canAddSelectedMaterial = computed(() => Boolean(workspace.detail.value?.file?.state === 'ACTIVE' && selectedExecutionVersion.value && !executionMaterials.value.some(item => item.fileId === workspace.detail.value.file.fileId)))
const canCreateExecution = computed(() => Boolean(execution.selectedAgent.value && executionInstruction.value.trim()))
const canCreateGeneration = computed(() => Boolean(execution.selectedAgent.value && generationInstruction.value.trim()))
const recentExecutionText = computed(() => {
  if (execution.historyState.value === 'loading' || execution.historyState.value === 'idle') return '查询中…'
  if (execution.historyState.value === 'error') return '查询失败'
  const recent = execution.history.value[0]
  return recent ? executionStateText(recent.state) : '暂无'
})
const acceptTypes = '.json,application/json,.html,.htm,.md,.markdown,text/html,text/markdown,text/x-markdown,.webp,.gif,.mp3,.ogg,.oga,.wav,.m4a,.mp4,.webm,image/webp,image/gif,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm,.png,.jpg,.jpeg,.txt,.pdf,.docx,.xlsx,.pptx,image/png,image/jpeg,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation'

const byteText = workspaceByteText
const nextVersion = computed(() => { const value = workspace.detail.value?.file.latestVersion; return validMaterialVersion(value) && BigInt(value) < 2147483647n ? String(BigInt(value) + 1n) : null })
const formatDate = value => Number.isFinite(value) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '时间未知'
const familyText = value => ({ IMAGE: '图片', AUDIO: '音频', TEXT: '文本', DOCUMENT: '文档', SPREADSHEET: 'Excel 表格', PRESENTATION: 'PPT 演示', PDF: 'PDF' })[value] || '文件'
const originText = value => ({ USER_UPLOAD: '本人上传', AGENT_DELIVERY: 'Agent 生成' })[value] || '来源待确认'
const executionStateText = value => ({ QUEUED: '已接受，等待结果', OUTPUT_COMMITTED: '历史结果已保存', RESULT_COMMITTED: '历史结果已提交', FAILED: '处理失败', CANCELLED: '已取消', INPUTS_REVOKED: '输入已撤销', UNKNOWN: '提交结果待确认' })[value] || '状态待确认'
const iconFor = value => ({ IMAGE: '🖼', AUDIO: '🎵', TEXT: '📝', DOCUMENT: '📄', SPREADSHEET: '📊', PRESENTATION: '📽', PDF: '📕' })[value] || '📁'
const currentFilters = () => ({ q: embedded ? appliedSearch.value : query.value.trim(), mediaFamily: mediaFamily.value, state: state.value })
const refresh = () => workspace.refresh(currentFilters())
const submitTreasureSearch = () => {
  appliedSearch.value = query.value.trim()
  return refresh()
}
const clearTreasureSearch = () => {
  query.value = ''
  searchField.value?.focus()
  return submitTreasureSearch()
}
const loadMore = () => workspace.loadMore(currentFilters())
const switchState = next => { if (state.value === next) return; state.value = next; closeDetail(); void refresh() }
const openModal = modal => { activeModal.value = modal; if (modal !== 'detail') closeDetail() }
const backToBox = () => { closeDetail(); activeModal.value = embedded ? 'library' : 'home' }
const fileListRef = ref(null)
const detailTitleRef = ref(null)
const backToLibrary = () => {
  const fileId = selectedId.value
  closeDetail()
  activeModal.value = 'library'
  nextTick(() => {
    const row = [...(fileListRef.value?.querySelectorAll('[data-file-id]') || [])]
      .find(element => element.dataset.fileId === fileId)
    row?.focus({ preventScroll: true })
  })
}
const openFile = async fileId => {
  if (embedded && !detailAllowed) return null
  const detail = await select(fileId)
  if (detail && (!embedded || detailAllowed)) {
    detailPane.value = 'summary'
    activeModal.value = 'detail'
    await nextTick()
    detailTitleRef.value?.focus({ preventScroll: true })
  }
  return detail
}
const openRecentFile = () => { const recent = workspace.items.value[0]; if (recent) void openFile(recent.fileId) }
const onUploadFile = event => { uploadFile.value = event.target.files?.[0] || null }
const onVersionFile = event => { versionFile.value = event.target.files?.[0] || null }
const upload = async () => {
  const snapshot = viewSnapshot(), file = uploadFile.value, name = uploadDisplayName.value
  const result = await workspace.upload(file, name)
  if (!result || !ownsView(snapshot)) return
  if (uploadFile.value === file) uploadFile.value = null
  if (uploadDisplayName.value === name) uploadDisplayName.value = ''
  activeModal.value = 'library'; selectedId.value = result.file.fileId; selectedVersion.value = result.version.version
  await refresh()
}
const select = async fileId => {
  viewGeneration += 1
  trashUsage.value = null
  const snapshot = viewSnapshot()
  const detail = await workspace.select(fileId)
  if (!detail || !ownsView(snapshot)) return null
  selectedId.value = fileId; selectedVersion.value = detail.latestVersion.version; renameValue.value = detail.file.displayName; versionFile.value = null
  return detail
}
const closeDetail = () => { viewGeneration += 1; selectedId.value = ''; versionFile.value = null; trashUsage.value = null; workspace.closeDetail() }
const retrySavedDetail = async () => {
  const snapshot = viewSnapshot()
  const detail = await workspace.retryDetail()
  if (detail && ownsView(snapshot)) { selectedId.value = detail.file.fileId; selectedVersion.value = detail.latestVersion.version; renameValue.value = detail.file.displayName }
}
const rename = async () => {
  const snapshot = viewSnapshot(), name = renameValue.value
  const result = await workspace.rename(name)
  if (result && ownsView(snapshot) && renameValue.value === name) renameValue.value = result.displayName
}
const appendVersion = async () => {
  const snapshot = viewSnapshot(), file = versionFile.value
  const result = await workspace.appendVersion(file)
  if (result && ownsView(snapshot)) { if (versionFile.value === file) versionFile.value = null; selectedVersion.value = result.version.version; await refresh() }
}
const preview = version => { selectedVersion.value = version; void workspace.previewVersion(version) }
const download = async version => {
  const snapshot = viewSnapshot(), fileId = selectedId.value, selection = selectedVersion.value
  const exactVersion = version
  const isCurrent = () => ownsView(snapshot) && fileId === selectedId.value && selection === selectedVersion.value
  try {
    if (!isCurrent()) return
    const result = await workspace.download(exactVersion)
    if (!result || !isCurrent()) return
    await savePersonalWorkspaceBlob({ ...result, isCurrent })
    if (!isCurrent()) return
  } catch (error) {
    if (isCurrent() && error?.name !== 'AbortError') workspace.error.value = error?.message || '下载未完成，请重试。'
  }
}
const trash = async () => {
  const snapshot = viewSnapshot()
  const usage = await workspace.usage()
  if (!usage || !ownsView(snapshot)) return
  const message = trashConfirmationText(usage)
  if (!globalThis.confirm?.(message)) return
  const result = await workspace.trash(usage)
  if (result && ownsView(snapshot)) { closeDetail(); await refresh() }
}
const restore = async () => { const snapshot = viewSnapshot(); const result = await workspace.restore(); if (result && ownsView(snapshot)) { closeDetail(); await refresh() } }
const loadExecutionAgents = () => execution.loadAgents()
const loadProcessingAgents = event => { if (event.target.open && ['idle', 'error'].includes(execution.rosterState.value)) void loadExecutionAgents() }
const selectExecutionAgent = agentId => execution.selectAgent(agentId)
const materialLabel = item => `${item.displayName || item.fileId} · v${item.version}`
const isExecutionMaterial = fileId => executionMaterials.value.some(item => item.fileId === fileId)
const canAddVersionAsMaterial = version => Boolean(validMaterialVersion(version?.version) && !isExecutionMaterial(workspace.detail.value.file.fileId))
const addExecutionMaterial = item => {
  if (!item?.fileId || !validMaterialVersion(item.version) || isExecutionMaterial(item.fileId) || executionMaterials.value.length >= 32) return
  executionMaterials.value = [...executionMaterials.value, { fileId: item.fileId, version: item.version, displayName: item.displayName }]
}
const addSelectedMaterial = () => addExecutionMaterial({ fileId: workspace.detail.value.file.fileId, version: selectedVersion.value, displayName: workspace.detail.value.file.displayName, contentMimeType: selectedExecutionVersion.value?.contentMimeType })
const removeExecutionMaterial = fileId => { executionMaterials.value = executionMaterials.value.filter(item => item.fileId !== fileId) }
const openProcessingConversation = (instruction, inputs) => {
  if (!execution.selectedAgent.value || !instruction.trim()) return false
  emit('open-deliberation', { mode: 'PRIVATE', taskId: null, targetAgentId: execution.selectedAgentId.value,
    instruction, inputs: inputs.map(({ fileId, version }) => ({ fileId, version })) })
  return true
}
const chooseHistoryExecution = executionId => execution.selectHistoryExecution(executionId)
const loadMoreExecutionHistory = () => { const cursor = execution.historyNextCursor.value; return cursor ? execution.loadHistory({ beforeCreatedAt: cursor.createdAt, beforeExecutionId: cursor.executionId, append: true, adopt: false }) : Promise.resolve([]) }

const workspaceRoot = ref(null)
let treasureListScroll = 0
const treasureView = ref('list')
const treasureTab = ref('all')
const treasureTabs = [{ key: 'all', label: '全部' }, { key: 'materials', label: '资料' }, { key: 'results', label: '成果' }, { key: 'trash', label: '回收站' }]
// The server supports state/query but not originKind. Never declare a category
// empty while the unfiltered cursor still has pages; keep loading at the list end.
const treasureFiles = computed(() => workspace.items.value.filter(file => treasureTab.value === 'materials' ? file.originKind === 'USER_UPLOAD' : treasureTab.value === 'results' ? file.originKind === 'AGENT_DELIVERY' : true))
const categoryNav = ref(null)
const listEmpty = computed(() => !workspace.loading.value && !workspace.nextCursor.value &&
  ['ready', 'empty'].includes(workspace.listState.value) && !treasureFiles.value.length)
const emptyListMessage = computed(() => appliedSearch.value ? '没有找到匹配的文件。' : ({
  materials: '还没有自己上传的资料。', results: '还没有收到 Agent 交付的文件。', trash: '回收站为空。'
})[treasureTab.value] || '还没有文件。可用右上角的上传按钮添加资料。')
const otherFilesAvailable = computed(() => !appliedSearch.value &&
  ['materials', 'results'].includes(treasureTab.value) && workspace.items.value.length > 0)
const showAllFiles = async () => {
  changeTreasureTab('all')
  await nextTick()
  categoryNav.value?.querySelector('[aria-pressed="true"]')?.focus()
}
const listEndRef = ref(null)
let listObserver = null
const stopListObserver = () => { listObserver?.disconnect(); listObserver = null }
watch([listEndRef, workspace.loading, workspace.nextCursor, workspace.listState, treasureTab, treasureView], () => {
  stopListObserver()
  if (!listEndRef.value || workspace.loading.value || workspace.listState.value === 'error' || !workspace.nextCursor.value) return
  if (typeof IntersectionObserver === 'undefined') return
  const observer = new IntersectionObserver(entries => {
    if (listObserver !== observer || !entries.some(entry => entry.isIntersecting) || workspace.loading.value || workspace.listState.value === 'error') return
    stopListObserver()
    void loadMore()
  }, { rootMargin: '0px 0px 120px 0px' })
  listObserver = observer
  observer.observe(listEndRef.value)
}, { flush: 'post' })
const trashUsage = ref(null)
const trashConfirmationText = usage => `确认将“${workspace.detail.value?.file.displayName || ''}”移入回收站？仍可恢复。任务引用 ${usage.counts.taskReferences} 条；议事引用 ${usage.counts.conversationReferences} 条；现存输入授权 ${usage.counts.activeInputGrants} 条。已有固定版本引用和输入授权保留，本操作不会撤销授权。`
watch(workspace.confirmationStale, stale => { if (stale) trashUsage.value = null }, { flush: 'sync' })
const changeTreasureTab = key => {
  treasureTab.value = key
  const next = key === 'trash' ? 'TRASHED' : 'ACTIVE'
  if (state.value !== next) { state.value = next; void refresh() }
}
const openTreasureFile = async fileId => {
  treasureListScroll = workspaceRoot.value?.scrollTop || 0
  const detail = await openFile(fileId)
  if (!detail || !detailAllowed) return
  treasureView.value = 'preview'
  preview(selectedVersion.value)
  await nextTick()
  detailTitleRef.value?.focus({ preventScroll: true })
}
const uploadTreasure = async () => {
  const snapshot = viewSnapshot(), file = uploadFile.value, name = uploadDisplayName.value
  const result = await workspace.upload(file, name)
  if (!result || !ownsView(snapshot)) return
  if (uploadFile.value === file) uploadFile.value = null
  if (uploadDisplayName.value === name) uploadDisplayName.value = ''
  treasureView.value = 'list'; activeModal.value = 'library'
  treasureTab.value = 'all'; state.value = 'ACTIVE'; query.value = ''; appliedSearch.value = ''; await refresh()
}
const prepareTrash = async () => { const snapshot = viewSnapshot(); const usage = await workspace.usage(); if (ownsView(snapshot)) trashUsage.value = usage }
const confirmTrash = async () => {
  if (!trashUsage.value) return
  const snapshot = viewSnapshot()
  const result = await workspace.trash(trashUsage.value)
  if (result && ownsView(snapshot)) { trashUsage.value = null; treasureView.value = 'list'; backToLibrary(); await refresh() }
}
const restoreTreasure = async () => {
  const snapshot = viewSnapshot()
  const result = await workspace.restore()
  if (result && ownsView(snapshot)) { treasureView.value = 'list'; backToLibrary(); await refresh() }
}
const canGoBack = computed(() => embedded ? treasureView.value !== 'list' : activeModal.value === 'detail')
const logicalDepth = computed(() => !embedded || treasureView.value === 'list' ? 1 : treasureView.value === 'manage' ? 3 : 2)
const windowTitle = computed(() => !embedded ? '' : ({ list: '资料', upload: '上传资料', preview: '资料详情', manage: '文件管理' })[treasureView.value])
const back = () => {
  if (!canGoBack.value) return false
  if (embedded && treasureView.value === 'manage') { treasureView.value = 'preview'; trashUsage.value = null; return true }
  treasureView.value = 'list'; trashUsage.value = null
  backToLibrary()
  nextTick(() => { if (workspaceRoot.value) workspaceRoot.value.scrollTop = treasureListScroll })
  return true
}
watch(identityEpoch, () => { executionInstruction.value = ''; generationInstruction.value = ''; executionMaterials.value = []; treasureView.value = 'list'; treasureTab.value = 'all'; trashUsage.value = null; uploadFile.value = null; versionFile.value = null; query.value = ''; appliedSearch.value = ''; uploadDisplayName.value = ''; renameValue.value = ''; selectedId.value = ''; activeModal.value = embedded ? 'library' : 'home' })
defineExpose({ canGoBack, back, logicalDepth, windowTitle })

onMounted(() => {
  void refresh()
  if (!embedded) {
    void loadExecutionAgents()
    void execution.loadHistory()
  }
})
onBeforeUnmount(() => { disposed = true; viewGeneration++; stopListObserver(); workspace.dispose(); execution.dispose() })
</script>

<style scoped src="../juyiting/hall-view-tabs.css"></style>

<style scoped>
.treasure-list-status { padding: 16px; text-align: center; color: var(--hall-text-muted, #68716b); }
/* In Hall this is content of the one work window, not an app behind stacked cards. */
.is-hall-treasure .modal-stage {
  min-height: 0;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.is-hall-treasure .babao-modal {
  position: static;
  overflow: visible;
  padding: 12px;
  box-shadow: none;
}
.is-hall-treasure .babao-modal.recessed {
  filter: none;
  opacity: 1;
  transform: none;
}

.personal-workspace { --treasure-ink: #3f2818; --treasure-muted: #806542; --treasure-wood: #6d3f1f; --treasure-wood-dark: #452817; --treasure-line: #d7c3a2; --treasure-paper: #fff8e8; --treasure-red: #8c2f20; flex:1; min-width:0; overflow:auto; padding:20px; color:var(--treasure-ink); background:radial-gradient(circle at 14% 0,rgba(255,255,255,.7),transparent 27%),linear-gradient(135deg,rgba(114,70,35,.12),transparent 36%),#e7d5b5; }
.personal-workspace.is-hall-treasure { min-height:0; border-top:2px solid rgba(109,63,31,.5); box-shadow:inset 0 10px 22px rgba(64,37,20,.1); }
.workspace-header,.modal-stage,.workspace-page-message,.workspace-receipt { max-width:920px; margin-inline:auto; }
.workspace-header { display:flex; align-items:end; justify-content:space-between; gap:24px; padding:8px 4px 18px; }
.workspace-header h1 { margin:5px 0; color:var(--treasure-wood-dark); font-family:serif; font-size:clamp(26px,4vw,34px); letter-spacing:.16em; }
.workspace-header p { margin:0; color:var(--treasure-muted); line-height:1.65; }
.workspace-eyebrow,.section-kicker { color:var(--treasure-red)!important; font-size:12px; font-weight:700; letter-spacing:.12em; }
.workspace-header-note { max-width:260px; padding-left:15px; border-left:2px solid #b88940; font-size:13px; }
.modal-stage { position:relative; min-height:550px; padding:28px; overflow:hidden; border:1px solid var(--treasure-line); border-radius:8px; background:linear-gradient(90deg,rgba(136,90,45,.06) 1px,transparent 1px) 0 0 / 28px 28px,linear-gradient(rgba(136,90,45,.04) 1px,transparent 1px) 0 0 / 28px 28px,var(--treasure-paper); box-shadow:0 4px 0 rgba(86,47,25,.12),0 12px 28px rgba(65,39,21,.14); }
.babao-modal { position:absolute; inset:28px; overflow:auto; padding:26px; border:1px solid #c7aa7b; border-radius:8px; background:linear-gradient(135deg,rgba(255,252,243,.98),rgba(246,230,196,.97)); box-shadow:0 14px 32px rgba(66,39,21,.2); transition:opacity .18s ease,transform .18s ease,filter .18s ease; }
.box-modal { display:flex; flex-direction:column; justify-content:center; max-width:690px; margin:auto; }
.child-modal { z-index:2; inset:18px 40px; }
.detail-modal { z-index:3; inset:8px 18px; background:linear-gradient(135deg,#fffdf5,#f3e1bd); }
.babao-modal.recessed { pointer-events:none; filter:blur(2px) saturate(.72); opacity:.38; transform:scale(.965); }
.box-modal h2,.modal-heading h2 { margin:5px 0 7px; color:var(--treasure-wood-dark); font-family:serif; letter-spacing:.07em; }
.modal-copy,.modal-heading p,.workspace-note { color:var(--treasure-muted); font-size:13px; line-height:1.65; }
.modal-copy { margin:0; }
.box-actions { display:grid; gap:10px; margin:24px 0 16px; }
.box-actions button { display:grid; gap:3px; min-height:68px; padding:12px 16px; text-align:left; }
.box-actions button span { font-family:serif; font-size:18px; letter-spacing:.05em; }.box-actions button small { color:#f5dfaf; }
.box-footnote { display:flex; flex-wrap:wrap; gap:12px; color:var(--treasure-muted); font-size:12px; }
.modal-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:15px; border-bottom:1px solid rgba(191,159,108,.52); }
.modal-heading p { margin:0; }
.personal-workspace button { min-height:35px; padding:0 11px; border:1px solid #56331b; border-radius:5px; background:linear-gradient(#82502a,var(--treasure-wood)); box-shadow:inset 0 1px rgba(255,239,194,.3),0 1px 1px rgba(74,42,20,.24); color:#fff8e8; cursor:pointer; font:inherit; }.personal-workspace button:hover { background:linear-gradient(#956033,#59331b); }.personal-workspace button:disabled { cursor:not-allowed; opacity:.58; }.personal-workspace button:focus-visible,.personal-workspace input:focus-visible,.personal-workspace select:focus-visible,.personal-workspace textarea:focus-visible { outline:2px solid #bd8633; outline-offset:2px; }
.quiet-action { border-color:#b99761!important; background:rgba(255,248,232,.9)!important; box-shadow:none!important; color:#654122!important; }.quiet-action:hover { background:#f1dfb6!important; }
.library-tools,.inline-form,.version-upload { display:flex; flex-wrap:wrap; align-items:end; gap:8px; margin-top:16px; }.library-tools { padding-bottom:15px; border-bottom:1px solid rgba(191,159,108,.42); }.personal-workspace label { display:grid; gap:6px; margin-top:14px; color:#644526; font-size:13px; font-weight:700; }.library-tools label,.inline-form label { margin:0; }.personal-workspace input,.personal-workspace select,.personal-workspace textarea { min-height:37px; padding:0 10px; border:1px solid #c5a978; border-radius:4px; background:rgba(255,253,246,.9); box-shadow:inset 0 1px 3px rgba(88,51,25,.1); color:var(--treasure-ink); font:inherit; }.personal-workspace textarea { min-height:104px; padding:10px; resize:vertical; }
.file-picker { display:inline-flex!important; width:fit-content; position:relative; overflow:hidden; margin:0!important; padding:8px 11px; border:1px dashed #9a6d36; border-radius:4px; background:#f5e8c7; color:#5a3519!important; cursor:pointer; }.file-picker input { position:absolute; inset:0; opacity:0; cursor:pointer; }.inline-name { display:block!important; }.inline-name input { width:min(190px,36vw); }.selected-file { color:#694b2a; font-size:13px; }
.filters { display:grid; grid-template-columns:minmax(0,1fr) 150px auto; align-items:end; gap:10px; margin:15px 0 10px; padding:12px 0; border-bottom:1px solid rgba(191,159,108,.5); }.filters label { margin:0; }.filter-actions,.actions,.version-actions,.material-actions { display:flex; flex-wrap:wrap; gap:7px; }.filter-actions .active,.detail-tabs .active { border-color:#412516; background:#442717; color:#fff8e8; }
.file-list { display:grid; gap:7px; }.file-row { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; width:100%; border-color:#dac69f!important; background:rgba(255,253,246,.58)!important; color:var(--treasure-ink)!important; text-align:left; }.file-row:hover { border-color:#a8773a!important; background:#f7e9ca!important; }.file-icon { color:var(--treasure-red); font-size:17px; }.file-summary { display:grid; min-width:0; gap:3px; }.file-summary strong,.file-summary small,.version-row > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.file-summary small,.file-state,.version-row small { color:var(--treasure-muted); font-size:12px; }.workspace-empty { padding:24px 0; color:var(--treasure-muted); }.load-more { margin-top:11px; }
.composer-steps { display:flex; flex-wrap:wrap; gap:6px; padding:0; margin:17px 0 2px; list-style:none; counter-reset:composer-step; }.composer-steps li { padding:5px 9px; border:1px solid rgba(184,137,64,.58); border-radius:999px; color:#644526; font-size:12px; }.composer-steps li::before { counter-increment:composer-step; content:counter(composer-step) ' · '; color:var(--treasure-red); font-weight:700; }.consent-note { padding-left:10px; border-left:2px solid #c59a55; }.actions { margin-top:14px; }
.detail-tabs { display:flex; gap:7px; margin:16px 0; padding-bottom:12px; border-bottom:1px solid rgba(191,159,108,.5); }.detail-tabs button { background:rgba(255,248,232,.82); color:#654122; box-shadow:none; border-color:#b99761; }.detail-pane { max-width:760px; margin:auto; }.file-details { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:15px 0; }.file-details div { padding:9px; border:1px solid rgba(202,177,130,.5); border-radius:4px; background:rgba(244,230,201,.62); }.file-details dt { color:var(--treasure-muted); font-size:12px; }.file-details dd { margin:4px 0 0; color:#4b2d19; word-break:break-word; }.version-upload { align-items:center; }.version-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; align-items:center; gap:9px; padding:9px 0; border-bottom:1px solid #decba7; }.version-row.active { margin-inline:-8px; padding-inline:8px; background:#f2e1b9; }.version-actions { justify-content:flex-end; }
.preview { margin-top:15px; overflow:auto; border:1px solid #d4bc91; border-radius:4px; background:#f5e8cc; }.preview pre { margin:0; padding:12px; white-space:pre-wrap; overflow-wrap:anywhere; color:#4d301d; }.preview img { display:block; max-width:100%; max-height:380px; margin:auto; object-fit:contain; }.preview p { padding:12px; color:var(--treasure-muted); }.preview-navigation { display:flex; align-items:center; gap:8px; padding:10px 12px 0; color:#654122; }.preview-navigation button { min-height:30px; padding:0 8px; }
.execution-pane { max-width:600px; }.execution-history summary { cursor:pointer; color:var(--treasure-wood-dark); font-family:serif; font-weight:700; }.execution-history[open] summary { margin-bottom:12px; }.history-content { padding-top:2px; }.delivery-receipt { margin-top:18px; }.receipt-title { margin:0; color:var(--treasure-wood-dark); font-family:serif; font-weight:700; }.execution-history { margin-top:18px; padding-top:14px; border-top:1px solid var(--treasure-line); }.history-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--treasure-wood-dark); }.history-heading .quiet-action { min-height:30px; }.history-list { display:grid; gap:7px; margin-top:10px; }.history-row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; text-align:left; border-color:#dac69f!important; background:rgba(255,253,246,.58)!important; color:var(--treasure-ink)!important; }.history-row.active { border-color:#a8773a!important; background:#f2e1b9!important; }.history-row span { display:grid; gap:2px; min-width:0; }.history-row small { color:var(--treasure-muted); overflow-wrap:anywhere; }.execution-status { margin-top:15px; padding-top:15px; border-top:1px solid var(--treasure-line); }.execution-notice { margin-top:14px; padding:11px; border:1px solid #9da877; border-radius:4px; background:#e8efd6; color:#405322; }.danger-zone { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-top:20px; padding-top:15px; border-top:1px solid var(--treasure-line); }.danger-zone p { margin:0; color:var(--treasure-muted); }.danger-zone .danger { border-color:#76271c; background:linear-gradient(#9d3e2b,var(--treasure-red)); }
.workspace-error { padding:11px; border:1px solid #c88174; border-radius:4px; background:#f7e1d9; color:#7e271c; }.workspace-page-message { margin-top:14px; }.workspace-receipt { margin-top:12px; padding:8px 12px; border-left:3px solid #b88940; background:rgba(255,248,232,.72); color:#694b2a; font-size:14px; }.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-height:500px) and (min-width:701px) { .personal-workspace.is-progress-view { padding:8px 14px; }.personal-workspace.is-progress-view .workspace-header { display:none; }.personal-workspace.is-progress-view .modal-stage { height:calc(100vh - 16px); min-height:0; padding:10px; }.personal-workspace.is-progress-view .babao-modal { inset:10px; padding:14px; }.personal-workspace.is-progress-view .delivery-modal .modal-heading { padding-bottom:7px; }.personal-workspace.is-progress-view .delivery-modal .section-kicker,.personal-workspace.is-progress-view .delivery-modal .modal-heading p { display:none; }.personal-workspace.is-progress-view .delivery-receipt { margin-top:8px; padding-top:0; border-top:0; }.personal-workspace.is-progress-view .delivery-receipt .file-details { margin:8px 0; }.personal-workspace.is-progress-view .execution-history { margin-top:10px; padding-top:9px; } }
@media (max-width:700px) { .personal-workspace { padding:13px; }.workspace-header { align-items:flex-start; flex-direction:column; gap:7px; }.workspace-header-note { max-width:none; }.modal-stage { min-height:580px; padding:15px; }.babao-modal { inset:15px; padding:18px; }.child-modal { inset:8px; }.detail-modal { inset:0; }.filters { grid-template-columns:1fr; }.file-details { grid-template-columns:1fr; }.version-row { grid-template-columns:auto minmax(0,1fr); }.version-row small,.version-actions { grid-column:2; justify-content:flex-start; }.file-state { display:none; }.modal-heading { flex-direction:column; }.inline-name input { width:100%; } }
/* A03: one content scroller; compact the file tools, not their actions. */
.personal-workspace.is-compact-hall { padding:8px; }
.is-compact-hall .babao-modal { padding:8px; }
.is-compact-hall .modal-heading { gap:8px; padding-bottom:6px; }
.is-compact-hall .modal-heading h2 { margin:0; font-size:18px; }
.is-compact-hall .modal-heading p { display:none; }
.is-compact-hall .library-tools { margin-top:6px; padding-bottom:6px; }
.is-compact-hall .filters { margin:6px 0; padding:6px 0; }
/* Embedded treasure follows the approved list → preview → management flow. */
.personal-workspace.is-hall-treasure { padding:28px 30px; background:#fff9ed; border-top:0; box-shadow:none; font-size:16px; }
.treasure-content { max-width:100%; margin:0; }
.treasure-content h2 { font-size:22px; line-height:1.45; font-weight:500; margin:0 0 6px; overflow-wrap:anywhere; }
.treasure-file-heading h2:focus { outline:none; }.treasure-file-heading h2:focus-visible { padding-left:9px; border-left:3px solid var(--treasure-red); }
.treasure-content p { margin:6px 0; color:#7b634b; font-size:14px; line-height:1.6; }
.treasure-intro,.treasure-file-heading { display:flex; gap:16px; align-items:center; justify-content:space-between; margin-bottom:20px; }
.treasure-content button { min-height:44px; padding:8px 14px; font:inherit; background:transparent; color:#533922; border:1px solid #d5bd98; border-radius:4px; box-shadow:none; cursor:pointer; }
.treasure-content button:focus-visible,.treasure-content input:focus-visible,.treasure-content select:focus-visible { outline:3px solid #bf8045; outline-offset:2px; }
.treasure-content button:disabled { opacity:.5; cursor:default; }
.treasure-content button.treasure-primary { background:#8d402c; color:#fff9ee; border-color:#8d402c; }
.treasure-tabs { display:flex; gap:8px; border-bottom:1px solid #d6bf99; margin-bottom:18px; }
.treasure-tabs button,.treasure-tabs button:hover,.treasure-tabs button[aria-pressed=true] { border:0; border-radius:0; background:transparent!important; box-shadow:none!important; }
.treasure-tabs button[aria-pressed=true] { border-bottom:2px solid var(--hall-brand,#8d402c); color:var(--hall-brand,#8d402c); }
.treasure-search { display:flex; align-items:stretch; gap:12px; min-height:44px; margin:18px 0 12px; }
.treasure-search label { display:flex; flex:0 1 min(360px,100%); width:min(360px,100%); min-width:0; margin:0; }
.treasure-content input:not([type=file]),.treasure-content select { padding:10px 12px; min-height:44px; box-sizing:border-box; border:1px solid #d5bd98; border-radius:4px; font:inherit; color:#513922; background:#fffdf8; max-width:100%; }
.treasure-search input,.treasure-search>button { box-sizing:border-box; height:44px; min-height:44px; margin:0; }
.treasure-search input { width:100%; }
.treasure-file-row { position:relative; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:20px 0; border-bottom:1px solid #d6bf99; }
.treasure-file-row > button.treasure-file-open { position:static; display:inline-flex; align-items:center; justify-content:center; width:44px; min-width:44px; height:44px; padding:0; border:0; background:transparent; box-shadow:none; }
.treasure-file-row > .treasure-file-open::after { content:''; position:absolute; inset:0; cursor:pointer; }
.treasure-file-row > .treasure-file-open:disabled::after { cursor:default; }
.treasure-file-row > .treasure-file-open:focus-visible::after { outline:2px solid var(--treasure-red); outline-offset:2px; border-radius:4px; }
@media (hover:hover) { .treasure-file-row:has(> .treasure-file-open:not(:disabled):hover) { background:var(--work-surface-subtle,#f3f3ed); } }
.treasure-file-row>div { min-width:0; overflow-wrap:anywhere; }.treasure-file-row button,.treasure-intro>button { flex:0 0 auto; }
.treasure-empty { padding:28px 0; }.treasure-form { display:grid; gap:18px; max-width:680px; margin:20px 0; }.treasure-form label { display:grid; gap:8px; }.treasure-form>button { justify-self:start; }
.treasure-preview-tools,.treasure-actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }.treasure-actions { justify-content:flex-end; margin-top:24px; padding-top:18px; border-top:1px solid #d6bf99; }.treasure-preview-tools label { display:flex; gap:8px; align-items:center; min-width:0; }.treasure-preview-tools select { max-width:min(520px,60vw); }.treasure-version-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:10px;row-gap:6px;width:100%;align-items:stretch}.treasure-version-tools label{display:contents}.treasure-version-label{grid-column:1/-1;grid-row:1}.treasure-version-tools select{grid-column:1;grid-row:2;width:100%;max-width:none;min-width:0}.treasure-version-tools>button{grid-column:2;grid-row:2;align-self:stretch;white-space:nowrap}
.treasure-preview { min-height:140px; margin-top:14px; padding:18px; border:1px solid #dfd2bd; border-radius:8px; background:#fffdf8; }.treasure-preview pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; }.treasure-preview img { max-width:100%; height:auto; }.treasure-manage-danger { margin-top:32px; padding-top:20px; border-top:1px solid #d6bf99; }
@media(max-width:600px) { .personal-workspace.is-hall-treasure { padding:20px 16px; }.treasure-intro { align-items:flex-start; }.treasure-content h2 { font-size:19px; }.treasure-tabs { gap:4px;overflow-x:auto; }.treasure-tabs button { flex:none;padding:8px 12px;white-space:nowrap; }.treasure-version-tools{column-gap:8px;row-gap:5px}.treasure-file-row { padding:16px 0; } }
/* A keyboard-shortened phone is still the same list, not a wide compact panel. */
@media(max-width:600px) { .is-hall-treasure .treasure-search input:not([type=file]) { font-size:max(16px,1rem); } }
@media(max-height:500px) and (min-width:601px) { .personal-workspace.is-hall-treasure { padding:16px 20px; }.treasure-intro,.treasure-file-heading { margin-bottom:12px; }.treasure-tabs { margin-bottom:10px; }.treasure-file-row { padding:12px 0; } }

.is-hall-treasure .treasure-file-list:not(:empty) { border:1px solid #d9dfd7; border-radius:12px; background:#fffefa; }
.is-hall-treasure .treasure-file-list .treasure-file-row { gap:12px; padding:9px 12px; border-bottom:1px solid #e0e4dc; }
.is-hall-treasure .treasure-file-row:last-child { border-bottom:0; }
.is-hall-treasure .treasure-file-row:first-child { border-radius:11px 11px 0 0; }
.is-hall-treasure .treasure-file-row:last-child { border-radius:0 0 11px 11px; }
.is-hall-treasure .file-family-label { display:grid; place-content:center; flex:0 0 52px; min-height:38px; box-sizing:border-box; padding:3px; border-radius:8px; background:#eaf0e9; color:#345643; text-align:center; font:600 12px/1.3 system-ui,sans-serif; }
.is-hall-treasure [data-family="PDF"] { background:#f8eae4; color:#843e30; }
.is-hall-treasure [data-family="IMAGE"] { background:#e6eff5; color:#2e526a; }
.is-hall-treasure [data-family="AUDIO"] { background:#efeaf5; color:#5e4973; }
.is-hall-treasure .file-list-copy { flex:1; min-width:0; overflow-wrap:anywhere; }
.is-hall-treasure .file-list-copy strong { font-size:16px; line-height:1.45; }
.is-hall-treasure .file-list-copy p { margin:3px 0 0; color:#59665c; font-size:13px; }
.is-hall-treasure .treasure-intro h2 { margin:0; font-size:clamp(21px,2vw,26px); line-height:1.3; }
.is-hall-treasure .treasure-intro p { margin:6px 0 0; color:#59665c; }


.file-search-context { display:flex; gap:12px; align-items:center; justify-content:space-between; margin:0 0 10px; padding:0 8px 0 12px; background:#f0f3ee; color:#374e41; border-radius:8px; font-size:14px; }
.file-search-context span { min-width:0; overflow-wrap:anywhere; }
.file-search-context button { flex:none; min-height:44px; padding:0 8px; border:0; background:transparent; color:#80402e; text-decoration:underline; }
</style>

<style scoped>
/* Fixed-version selection and its download action are one responsive tool row. */
.treasure-version-tools { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
.treasure-version-tools label { display: flex; align-items: center; flex: 1 1 0; min-width: 0; margin: 0; gap: 8px; }
.treasure-version-tools .treasure-version-label { flex: 0 0 auto; }
.treasure-version-tools select { flex: 1 1 0; width: 0; min-width: 0; max-width: none; min-height: 44px; }
.treasure-version-tools > button { flex: 0 0 44px; align-self: center; margin: 0; }
</style>

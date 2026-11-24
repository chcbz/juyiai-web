<template>
  <div class="bounty-panel" :class="{ 'is-hall-embedded': embeddedHall }">
    <div
      v-show="!embeddedHall || !detailTask"
      :inert="embeddedHall && detailTask ? '' : null"
      :aria-hidden="embeddedHall && detailTask ? 'true' : null"
      class="bounty-source"
    >
      <div class="panel-toolbar">
        <form class="task-search" role="search" aria-label="查找事项" @submit.prevent="submitKeyword">
          <input
            v-model="searchDraft"
            type="search"
            enterkeyhint="search"
            aria-label="搜索事项名称或编号"
            placeholder="名称或编号"
            @compositionstart="searchComposing = true"
            @compositionend="searchComposing = false"
            @blur="searchComposing = false"
            @keydown.enter="guardSearchEnter"
          />
          <button class="task-search-submit" type="submit">搜索</button>
        </form>
        <select
          ref="agentFilterControl"
          class="task-assignee"
          :value="taskAgentFilter"
          aria-label="按承办人筛选"
          @change="$emit('update:taskAgentFilter', $event.target.value); $emit('load-tasks')"
        >
          <option value="">全部承办人</option>
          <option v-for="agent in taskAgentOptions" :key="agent.agentId" :value="agent.agentId">{{ agent.displayName }}</option>
        </select>
        <button
          v-if="secondaryStatusFilters.length"
          ref="secondaryStatusToggle"
          type="button"
          class="hall-filter task-status-secondary"
          :class="{ active: secondaryStatusActive }"
          :aria-controls="secondaryStatusId"
          :aria-expanded="secondaryStatusExpanded"
          @click="secondaryStatusExpanded = !secondaryStatusExpanded"
        >
          {{ secondaryStatusActive ? `状态：${statusLabel}` : '其他状态' }}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        <button class="task-refresh hall-tool" type="button" aria-label="刷新事项" title="刷新事项" :aria-busy="(loading && !hasMore) || countsLoading" @click="$emit('load-tasks')"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></svg></button>
        <p class="task-search-applied" role="status">{{ taskKeyword ? `已搜索：${taskKeyword}` : '' }}</p>
      </div>

      <section v-if="requirementCreateState && requirementCreateState.status !== 'IDLE'" class="requirement-create-recovery" role="status">
        <strong>需求保存结果待确认</strong>
        <template v-if="requirementCreateState.intent">
          <p>原事项：{{ requirementCreateState.intent.body.title }}</p>
          <p>原需求：{{ requirementCreateState.intent.body.description || '未填写' }}</p>
          <p>精确资料：{{ requirementCreateInputSummary }}</p>
          <p>当前编辑稿不会替换原需求；核对不会再次创建或启动 Agent。</p>
          <button type="button" :disabled="requirementCreateBusy" @click="$emit('check-requirement-create')">查询保存结果</button>
          <button v-if="!requirementCreateState.intent.receipt" type="button" :disabled="requirementCreateBusy" @click="$emit('resume-requirement-create')">继续原保存操作</button>
        </template>
        <p v-if="requirementCreateState.error">{{ requirementCreateState.error }}</p>
      </section>

      <section v-if="fundedCreateRecovery" class="funded-create-recovery requirement-create-recovery" role="status">
        <strong>历史资金榜请求（仅供查阅）</strong>
        <p>原榜文名目：{{ fundedCreateRecovery.body.title }}</p>
        <p>原榜文缘由：{{ fundedCreateRecovery.body.description || '未填写' }}</p>
        <p>原所需本领：{{ fundedRecoveryAbilities }}</p>
        <p>原结算规则：{{ fundedCreateRecovery.body.settlementPolicy || '未填写' }}</p>
        <p>原总额：{{ fundedCreateRecovery.body.grossBountyAmountWen }} 文。</p>
        <p>旧资金榜已停止操作；原结果仍待核对，不会重发、转换或删除此记录。</p>
      </section>

      <p v-if="!loading && errorMessage" class="task-data-state is-error" role="alert">{{ errorMessage }}</p>
      <p v-if="!countsLoading && countsErrorMessage && countsErrorMessage !== errorMessage" class="task-data-state is-error" role="alert">{{ countsErrorMessage }}</p>

      <div ref="statusStrip" class="task-status-tabs" role="group" aria-label="事项状态" :aria-busy="countsLoading">
        <button
          v-for="item in primaryStatusFilters"
          :key="item.value"
          :class="{ active: taskStatusFilter === item.value }"
          type="button"
          class="hall-filter"
          :aria-pressed="taskStatusFilter === item.value"
          @click="selectPrimaryStatus(item.value)"
        >
          <span>{{ item.label }}</span>
          <small>{{ taskStatusCount(item.value) }}</small>
        </button>
      </div>

      <div v-if="secondaryStatusFilters.length" v-show="secondaryStatusExpanded" :id="secondaryStatusId" ref="secondaryStatusGroup" class="task-secondary-filters" role="group" aria-label="其他事项状态" :aria-busy="countsLoading">
        <button
          v-for="item in secondaryStatusFilters"
          :key="item.value"
          type="button"
          class="hall-filter"
          :aria-pressed="taskStatusFilter === item.value"
          @click="selectStatus(item.value)"
        >{{ item.label }} <small>{{ taskStatusCount(item.value) }}</small></button>
      </div>
      <div class="task-panel-body" :aria-busy="loading">
        <div class="task-list">
          <article
            v-for="task in tasks"
            :key="task.id"
            class="task-card"
            :class="{ selected: selectedTask?.id === task.id }"
            :role="embeddedHall ? 'button' : undefined"
            :tabindex="embeddedHall && detailAllowed ? 0 : undefined"
            :aria-disabled="embeddedHall && !detailAllowed ? 'true' : undefined"
            :aria-label="embeddedHall ? `查看事项：${task.title}，${taskStatusText(task)}` : undefined"
            @keydown.enter.self.prevent="embeddedHall && openTask(task, $event.currentTarget)"
            @keydown.space.self.prevent="embeddedHall && openTask(task, $event.currentTarget)"
            @click="openTask(task, $event.currentTarget)"
          >
            <div class="task-head">
              <strong>{{ task.title }}</strong>
              <span :class="taskStateClass(task)">{{ taskStatusText(task) }}</span>
            </div>
            <p v-if="!embeddedHall || (task.description?.trim() && task.description.trim() !== task.title?.trim())" class="task-excerpt">{{ task.description || '榜文尚未写明缘由' }}</p>
            <div class="task-meta">
              <span v-if="task.assignedAgentName">承办：{{ task.assignedAgentName }}</span>
              <span>{{ embeddedHall ? '#' : '' }}{{ task.id }}</span>
              <span v-if="task.updatedAt">{{ formatTime(task.updatedAt) }}</span>
              <template v-if="embeddedHall"><span v-for="ability in task.requiredAbilities" :key="ability" class="task-skill">{{ ability }}</span></template>
            </div>
            <p v-if="isFundedTask(task)" class="funding-summary">已托管：{{ formatMoney(task.funding.remainingWen || task.funding.grossBountyAmountWen) }}</p>
            <div v-if="!embeddedHall" class="ability-tags">
              <span v-for="ability in task.requiredAbilities || []" :key="ability">{{ ability }}</span>
              <span v-if="!(task.requiredAbilities || []).length">未指定能力要求</span>
            </div>
          </article>
          <p v-if="errorMessage" class="task-pagination-status"><button type="button" :disabled="loading" @click="$emit(hasMore ? 'load-more-tasks' : 'load-tasks')">重试加载</button></p>
          <div v-else-if="hasMore" ref="taskListEnd" class="task-page-sentinel" aria-hidden="true">
            <span v-if="loading" class="task-page-spinner" />
          </div>
          <p v-else-if="!loading && tasks.length" class="task-pagination-status" role="status">已显示全部事项</p>
          <div v-if="!loading && !errorMessage && !hasMore && !tasks.length" class="empty-list">
            <p role="status">{{ clearFiltersLabel ? '没有符合当前筛选条件的事项。' : statusLabel ? `目前没有「${statusLabel}」事项。` : '还没有事项。可在「办事」页开始第一件事。' }}</p>
            <button v-if="clearFiltersLabel" type="button" class="hall-action-surface" @click="clearListFilters">{{ clearFiltersLabel }}</button>
          </div>
        </div>
      </div>

    </div>
    <transition name="modal">
      <div v-if="detailTask" class="bounty-modal-overlay" :class="{ 'is-embedded-page': embeddedHall }" @click.self="embeddedHall ? null : closeTask()">
        <section class="bounty-modal" :role="embeddedHall ? 'region' : 'dialog'" :aria-label="embeddedHall ? '事项详情' : null" :aria-modal="embeddedHall ? null : 'true'">
          <div class="bounty-modal-header">
            <button v-if="embeddedHall" ref="detailBackButton" type="button" class="bounty-back-button hall-tool" @click="closeTask" aria-label="返回事项列表" title="返回事项列表"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7"/></svg></button>
            <h3>{{ embeddedHall ? '事项详情' : '榜文点将' }}</h3>
            <button v-if="!embeddedHall" class="modal-close hall-tool" @click="closeTask" aria-label="关闭事项详情" title="关闭事项详情"><svg class="hall-control-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </div>

          <div class="bounty-modal-body">
            <div class="modal-task-info">
              <section v-if="embeddedHall || (pointAndStartForDetail && !isTerminalMatter(detailTask))" class="matter-advice-card" aria-label="事项进展">
                <template v-if="embeddedHall">
                  <div class="matter-advice-heading"><span>事项进展</span><strong>{{ simpleMatterStatus(detailTask) }}</strong></div>
                  <div class="matter-edit-row"><h3>{{ detailTask.title }}</h3><button v-if="canEditRequirement" type="button" class="matter-edit-button" aria-label="修改事项标题" title="修改事项标题" :disabled="requirementEditBusy" @click="requirementEditor?.open('title')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1 12-12-5-5L3 14l-1 8Z"/></svg></button></div>
                  <div class="matter-edit-row matter-description-row"><p class="matter-request">{{ detailTask.description }}</p><button v-if="canEditRequirement" type="button" class="matter-edit-button" aria-label="修改需求描述" title="修改需求描述" :disabled="requirementEditBusy" @click="requirementEditor?.open('description')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1 12-12-5-5L3 14l-1 8Z"/></svg></button></div>
                  <dl>
                    <div><dt>{{ hasTaskAction(detailTask, 'ASSIGN') ? (matterCandidateId ? '已选承办' : '推荐承办') : '承办好汉' }}</dt><dd>{{ matterAgent ? agentDisplayName(matterAgent) : (detailTask.assignedAgentName || (taskAssigneeIds(detailTask).length ? '承办信息待核对' : (hasTaskAction(detailTask, 'ASSIGN') ? (recommendationState.state === 'LOADING' ? '正在推荐…' : '请选择承办人') : '尚未确认'))) }}</dd></div>
                    <div v-if="matterAgent"><dt>所属用户 / 当前状态</dt><dd>{{ assigneeProviderText(matterAgent) }} · {{ assigneeAvailabilityText(matterAgent) }}</dd></div>
                    <div><dt>资料 / 成果</dt><dd>{{ matterResourceSummary?.taskId === String(detailTask.id) ? (['completed', 'archived'].includes(detailTask.status) ? `${matterResourceSummary.materials} 份资料 · 成果见验收记录` : `${matterResourceSummary.materials} 份资料 · ${matterResultCount ?? matterResourceSummary.outputs} 份${matterResultCount == null ? '成果引用' : '成果'}`) : '见下方资料与成果' }}</dd></div>
                  </dl>
                  <p v-if="hasTaskAction(detailTask, 'ASSIGN') && matterAgent?.recommendationReason" class="matter-selected-reason">{{ matterAgent.recommendationReason }}</p>
                  <HallInitialAction v-if="budgetTarget" :key="JSON.stringify([identityScope, authorizationGeneration, detailTask.id, detailTask.taskVersion, budgetTarget])"
                    :task-id="detailTask.id" :task-version="detailTask.taskVersion" :agent-id="budgetTarget" />
                  <p v-if="hasTaskAction(detailTask, 'ASSIGN') && matterAgent && !isFundedTask(detailTask)" class="matter-quote" role="status">{{ budgetStatusText || taskQuoteText(selectedQuote) }}<template v-if="isAvailableTaskQuote(selectedQuote)"> · 确认承办时预占，验收后扣除</template> <button v-if="budgetAction" type="button" @click="emit('request-budget', detailTask, matterAgent.agentId, budgetAction.mode)">{{ budgetAction.label }}</button></p>
                </template>
                <section
                  v-if="pointAndStartForDetail && !isTerminalMatter(detailTask)"
                  :key="`${identityScope}:${authorizationGeneration}:${detailTask.id}:${pointAndStartForDetail.status}`"
                  class="matter-send-status"
                  :class="{ 'is-warning': pointAndStartNeedsCheck && pointAndStartForDetail.status !== 'FAILED', 'is-failed': pointAndStartForDetail.status === 'FAILED' }"
                  aria-label="需求发送状态"
                >
                  <p v-if="pointAndStartNeedsCheck || pointAndStartPreparing" role="status">{{ pointAndStartRecoveryHint }}</p>
                  <p v-if="pointAndStartForDetail.status === 'FAILED' && pointAndStartForDetail.error" role="alert">失败原因：{{ pointAndStartForDetail.error }}</p>
                  <div v-if="pointAndStartNeedsCheck || ['PREPARING', 'CONFIRMED'].includes(pointAndStartForDetail.status)" class="matter-send-actions">
                    <button type="button" :disabled="pointAndStartBusy" @click="$emit('check-point-and-start', detailTask)">查询发送结果</button>
                    <button
                      v-if="pointAndStartForDetail.status === 'UNKNOWN'"
                      type="button"
                      :disabled="pointAndStartBusy"
                      @click="$emit('resume-point-and-start', detailTask)"
                    >继续原请求</button>
                  </div>
                  <p v-if="pointAndStartForDetail.status === 'UNKNOWN'" class="matter-send-note">继续原请求将沿用原提交信息恢复，不创建新的需求。</p>
                  <details class="matter-send-details">
                    <summary>{{ pointAndStartForDetail.status === 'HISTORICAL' ? '历史指派信息' : '提交信息' }}</summary>
                    <p>发送状态：{{ pointAndStartRecoveryTitle }}</p>
                    <p>承办好汉：{{ pointAndStartAgentName }}</p>
                    <p>本次资料：{{ pointAndStartInputCount }}。</p>

                    <p v-if="pointAndStartForDetail.error && pointAndStartForDetail.status !== 'FAILED'">查询说明：{{ pointAndStartForDetail.error }}</p>
                  </details>
                </section>
                <template v-if="embeddedHall">
                  <template v-if="hasTaskAction(detailTask, 'ASSIGN')">
                  <section v-if="['LOADING', 'ERROR', 'STALE', 'DEGRADED'].includes(recommendationState.state)" class="matter-recommendation" :aria-busy="recommendationState.state === 'LOADING'" aria-label="智能推荐" aria-live="polite">

                    <div class="recommendation-status" role="status">
                      <span v-if="recommendationState.state === 'LOADING'" class="recommendation-spinner" aria-hidden="true" />
                      <span>{{ recommendationStateText(recommendationState.state) }}</span>
                    </div>
                    <p v-if="recommendationState.state === 'LOADING'" class="recommendation-hint">推荐期间仍可手动选择承办人。</p>
                    <button v-if="recommendationState.state !== 'LOADING'" type="button" :disabled="pointAndStartBusy" @click="$emit('refresh-recommendation')">重新推荐</button>
                  </section>

                    <button
                      type="button"
                      ref="matterCandidateToggle"
                      class="matter-agent-toggle"
                      :aria-expanded="showMatterCandidates"
                      :disabled="requirementEditBusy || pointAndStartBusy || Boolean(pointAndStartForDetail)"
                      @click="showMatterCandidates = !showMatterCandidates"
                    >{{ showMatterCandidates ? '收起候选列表' : (matterAgent ? '更换承办人' : '选择承办人') }}</button>
                    <div v-if="showMatterCandidates" class="matter-candidate-picker">
                      <div class="matter-candidates" aria-label="承办候选">
                      <button
                        v-for="agent in matterCandidates"
                        :key="agent.agentId"
                        class="matter-candidate-card"
                        type="button"
                        :aria-pressed="matterAgent?.agentId === agent.agentId"
                        :disabled="requirementEditBusy || pointAndStartBusy || Boolean(pointAndStartForDetail) || !canAssign(detailTask, agent)"
                        @click="selectMatterCandidate(agent)"
                      ><span class="matter-candidate-avatar" aria-hidden="true">{{ agentDisplayName(agent).slice(0, 1) }}</span><span class="matter-candidate-copy"><strong>{{ agentDisplayName(agent) }}</strong><small>{{ assigneeProviderText(agent) }} · {{ assigneeAvailabilityText(agent) }}</small><small v-if="agent.recommendationLevel" class="recommendation-level" :data-level="agent.recommendationLevel">{{ recommendationLevelText(agent.recommendationLevel) }}</small><small>{{ agent.recommendationReason || '可手动选择承办' }}</small></span><span class="matter-candidate-check" aria-hidden="true">{{ matterAgent?.agentId === agent.agentId ? '✓' : '' }}</span></button>
                      </div>
                      <button
                        v-if="candidatesNextAfterAgentId"
                        type="button"
                        :disabled="candidatesLoading"
                        @click="$emit('more-candidates')"
                      >加载更多候选</button>
                    </div>
                    <p v-if="candidatesLoading" role="status">正在读取承办候选…</p>
                    <p v-if="candidatesError" role="alert">{{ candidatesError }}</p>
                    <button
                      type="button"
                      class="matter-primary-action"
                      :disabled="!canConfirmAgent(matterAgent)"
                      @click="confirmAgent(matterAgent)"
                    >{{ matterAgent ? `确认由${agentDisplayName(matterAgent)}承办` : '请选择承办人' }}</button>
                  </template>
                  <template v-else>
                    <p v-if="detailTask.status === 'completed'" class="matter-fee-note">事项已完成，可查看已验收成果和历史议事；不能继续修改或重复验收。</p>
                    <p v-else-if="!isTerminalMatter(detailTask)" class="matter-fee-note">补充要求、查看结果和提出修改，都在原议事中继续。</p>
                    <button
                      v-if="['completed', 'archived'].includes(detailTask.status)"
                      type="button"
                      class="matter-secondary-action"
                      @click="$emit('view-discussion-history', detailTask)"
                    >查看议事记录</button>
                    <button
                      v-if="taskPresentation(detailTask).phase === 'PENDING_ACCEPTANCE' && hasTaskAction(detailTask, 'DISCUSS')"
                      type="button"
                      class="matter-primary-action"
                      @click="$emit('review-delivery', detailTask)"
                    >查看成果并验收</button>
                    <button
                      v-if="hasTaskAction(detailTask, 'DISCUSS') && assignedAgentForTask(detailTask)"
                      type="button"
                      :class="taskPresentation(detailTask).phase === 'PENDING_ACCEPTANCE' ? 'matter-secondary-action' : 'matter-primary-action'"
                      @click="$emit('discuss-task', detailTask, assignedAgentForTask(detailTask))"
                    >继续议事</button>
                  </template>
                  <button
                    v-if="detailTask.status === 'completed' && taskPresentation(detailTask).phase === 'COMPLETED'"
                    type="button"
                    class="matter-archive-action"
                    @click="$emit('archive-task', detailTask)"
                  >收入案卷</button>
                  <p v-else-if="detailTask.status === 'archived'" class="matter-archive-note">已归档，可在“办事 → 已归档”中查看。</p>
                </template>
              </section>
              <p v-if="taskPresentation(detailTask).readOnly && !isTerminalMatter(detailTask)" role="status">{{ taskPresentation(detailTask).reason }}；暂仅可查看，刷新核对后再操作。</p>
              <div v-if="!embeddedHall" class="task-detail-head">
                <div>
                  <strong>{{ detailTask.title }}</strong>
                  <small>{{ detailTask.id }} / {{ taskStatusText(detailTask) }}</small>
                </div>
                <span :class="taskStateClass(detailTask)">{{ taskStatusText(detailTask) }}</span>
              </div>

              <p v-if="!embeddedHall">{{ detailTask.description || '榜文尚未写明缘由' }}</p>
              <section v-if="!embeddedHall" class="workspace-shortcut" aria-label="榜文百宝箱入口">
                <div>
                  <strong>资料与交付</strong>
                  <p>资料和成果可在议事中查看与预览，在事项详情核对本次成果并验收。</p>
                </div>
                <button type="button" @click="$emit('open-workspace')">打开百宝箱</button>
              </section>
              <TaskMaterialLinks
                v-if="detailTask?.id && !embeddedHall && canActOnTask(detailTask)"
                :key="detailTask.id"
                :task-id="detailTask.id"
                :target-agent-id="assignedAgentForTask(detailTask)?.agentId || ''"
                :identity-epoch="authorizationGeneration"
                :identity-scope="identityScope"
                :default-instruction="detailTask.description || detailTask.title"
                @open-deliberation="$emit('open-deliberation', $event)"
              />

              <section
                v-if="canCancelOrdinaryTask(detailTask) || cancellationUnresolved"
                class="ordinary-cancellation"
                aria-label="普通事项取消"
              >
                <p>取消事项将释放全部预占费用，关闭后续执行；已有记录和成果保留。已发出的外部调用可能仍产生平台成本，不会向你补扣。</p>
                <button
                  type="button"
                  class="ordinary-cancel-action"
                  :disabled="cancellationBusy || showCancellationDialog || cancellationSubmitting"
                  @click="requestCancellation"
                >
                  {{ cancellationState?.taskId === detailTask.id && cancellationState.status === 'unresolved' ? '核对原取消结果' : '取消事项' }}
                </button>
                <p v-if="cancellationState?.taskId === detailTask.id && cancellationState.status === 'unresolved'" role="status">结果尚未确认；只核对原事项，不重复提交取消。</p>
              </section>

              <section v-if="isFundedTask(detailTask)" class="funded-preview-details" aria-label="资金悬赏详情">
                <p class="funding-summary">已托管：{{ formatMoney(detailTask.funding.remainingWen || detailTask.funding.grossBountyAmountWen) }}</p>
                <p>旧资金榜仅供查阅，不再创建、领令、恢复、退款或结算。</p>
                <button type="button" class="funded-detail-button" @click="$emit('load-settlement', detailTask)">查看结算详情</button>
                <pre v-if="detailTask.settlement" class="settlement-detail">{{ JSON.stringify(detailTask.settlement, null, 2) }}</pre>
              </section>

              <TeamRecommendationPanel
                v-if="!embeddedHall && canActOnTask(detailTask)"
                :task="detailTask"
                :authorization-generation="authorizationGeneration"
              />

              <p v-if="detailTask.status === 'cancelled'" role="status">事项已取消；历史指派与成果保留，不再继续办理。</p>
              <HallRequirementEditor v-if="embeddedHall && detailTask && hasTaskAction(detailTask, 'ASSIGN')"
                ref="requirementEditor" :task="detailTask" :enabled="canEditRequirement"
                :identity-scope="identityScope" :identity-epoch="authorizationGeneration"
                @busy="requirementEditBusy = $event" @saved="requirementSaved" />
              <HallTaskResources
                v-if="embeddedHall && resourcesActive"
                :key="`${identityScope}:${authorizationGeneration}:${detailTask.id}:${detailTask.taskVersion}`"
                :task-id="String(detailTask.id)"
                :identity-scope="identityScope"
                :identity-epoch="authorizationGeneration"
                :result-count="matterResultCount"
                :completed="['completed', 'archived'].includes(detailTask.status)"
                @summary="matterResourceSummary = $event"
              ><template #actions><button v-if="canEditRequirement" type="button" ref="requirementMaterialTrigger" class="matter-edit-button" aria-label="选择资料" title="选择资料" :disabled="requirementEditBusy" @click="requirementEditor?.open('files', () => requirementMaterialTrigger)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 12l-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8"/></svg></button></template></HallTaskResources>
              <section v-if="!embeddedHall || taskPresentation(detailTask).readOnly || taskPresentation(detailTask).phase === 'COMPLETED'" class="matter-resources" aria-label="资料与成果">
                <button type="button" class="matter-results-action" @click="$emit('open-formal-results', detailTask)">{{ ['completed', 'archived'].includes(detailTask.status) ? '查看成果与验收记录' : embeddedHall || taskPresentation(detailTask).readOnly ? '查看历史成果' : '查看正式成果与验收' }}</button>
              </section>
              <WorkItemPlanPanel v-if="!embeddedHall && canActOnTask(detailTask)" :task="detailTask" :enabled="workItemPlanEnabled" :authorization-generation="authorizationGeneration" />

              <div v-if="!embeddedHall" class="ability-tags">
                <span v-for="ability in detailTask.requiredAbilities || []" :key="ability">{{ ability }}</span>
                <span v-if="!(detailTask.requiredAbilities || []).length">未指定能力要求</span>
              </div>

              <div v-if="!embeddedHall && canActOnTask(detailTask)" class="task-operation-grid">
                <button
                  :aria-label="agentDisplayName(selectedAgent) ? `点当前好汉 ${agentDisplayName(selectedAgent)} 领令` : '先择好汉再点将'"
                  :disabled="isFundedTask(detailTask) || !canConfirmAgent(selectedAgent)"
                  :title="agentDisplayName(selectedAgent) ? `点当前好汉领令：${agentDisplayName(selectedAgent)}` : '先择好汉再点将'"
                  @click="confirmAgent(selectedAgent)"
                 class="hall-business-action">
                  <span class="hall-business-label">{{ agentDisplayName(selectedAgent) ? '点将当前' : '选择好汉' }}</span>
                </button>
                <button
                  aria-label="密议"
                  title="与当前好汉密议"
                  @click="$emit('brief-selected-task', detailTask, selectedAgent)"
                 class="hall-business-action">
                  <span class="hall-business-label">密议</span>
                </button>
                <button
                  class="discuss-task-button hall-business-action"
                  type="button"
                  aria-label="进入议事"
                  :disabled="!hasTaskAction(detailTask, 'DISCUSS') || !taskAssigneeIds(detailTask).length"
                  :title="!taskAssigneeIds(detailTask).length ? unassignedDiscussHint : '进入该悬赏的既有议事入口'"
                  @click="$emit('discuss-task', detailTask, assignedAgentForTask(detailTask))"
                >
                  <span class="hall-business-label">进入议事</span>
                </button>
                <button
                  class="archive-task-button hall-business-action"
                  type="button"
                  aria-label="收入案卷"
                  title="收入案卷"
                  @click="$emit('archive-task', detailTask)"
                >
                  <span class="hall-business-label">收入案卷</span>
                </button>
              </div>
              <p v-if="!embeddedHall && !taskAssigneeIds(detailTask).length" class="task-operation-hint">
                {{ unassignedDiscussHint }}
              </p>
            </div>

            <div v-if="!embeddedHall && canActOnTask(detailTask)" class="modal-agent-scroll">
              <div class="section-label">可点好汉</div>
              <section class="matter-recommendation" :aria-busy="recommendationState.state === 'LOADING'" aria-label="智能推荐" aria-live="polite">

                <div class="recommendation-status" role="status">
                      <span v-if="recommendationState.state === 'LOADING'" class="recommendation-spinner" aria-hidden="true" />
                      <span>{{ recommendationStateText(recommendationState.state) }}</span>
                    </div>
                    <p v-if="recommendationState.state === 'LOADING'" class="recommendation-hint">推荐期间仍可手动选择承办人。</p>
                <button type="button" :disabled="recommendationState.state === 'LOADING' || requirementEditBusy || pointAndStartBusy" @click="$emit('refresh-recommendation')">重新推荐</button>
              </section>
              <div
                v-for="agent in matterCandidates"
                :key="agent.agentId"
                class="recommended-agent-row"
                :class="{ active: selectedAgent?.agentId === agent.agentId }"
              >
                <button class="recommended-agent-main" type="button" @click="$emit('select-agent', agent)">
                  <span class="mini-avatar portrait-avatar" :style="portraitStyle(agent)" :title="portraitName(agent)"></span>
                  <span>
                    <strong>{{ agentDisplayName(agent) }}</strong>
                    <small>{{ abilityText(agent) }}</small>
                  </span>
                  <em>{{ recommendationLevelText(agent.recommendationLevel) || '手动选择' }}</em>
                </button>
                <p v-if="recommendationReason(agent)" class="recommendation-reason">
                  {{ recommendationReason(agent) }}
                </p>
                <p v-for="evidence in agent.recommendationEvidence || []" :key="evidence.id" class="recommendation-reason">{{ evidence.label }}：{{ evidence.description }}</p>
                <p v-for="gap in agent.recommendationGaps || []" :key="gap" class="recommendation-reason">待核实：{{ gap }}</p>
                <div class="recommended-agent-actions">
                  <button
                    type="button"
                    :aria-label="`选定 ${agentDisplayName(agent)}`"
                    :title="`选定 ${agentDisplayName(agent)}`"
                    @click="$emit('select-agent', agent)"
                   class="hall-business-action">
                    <span class="hall-business-label">选定</span>
                  </button>
                  <button
                    type="button"
                    :aria-label="`点 ${agentDisplayName(agent)} 领令`"
                    :disabled="!canConfirmAgent(agent)"
                    :title="`点 ${agentDisplayName(agent)} 领令`"
                    @click="confirmAgent(agent)"
                   class="hall-business-action">
                    <span class="hall-business-label">点将</span>
                  </button>
                  <button
                    type="button"
                    :aria-label="`与 ${agentDisplayName(agent)} 密议`"
                    :title="`与 ${agentDisplayName(agent)} 密议`"
                    @click="$emit('brief-selected-task', detailTask, agent)"
                   class="hall-business-action">
                    <span class="hall-business-label">密议</span>
                  </button>
                </div>
              </div>
            </div>
            <section v-if="showNoAssigneeRecruitment" class="no-agent-recruitment" role="status">
              <p>暂未寻得可领令的好汉。</p>
              <button type="button" @click="$emit('recruit-agent', detailTask)">去招贤令</button>
            </section>
          </div>
        </section>
      </div>
    </transition>
    <var-dialog
      v-model:show="showCancellationDialog"
      title="确认取消事项？"
      :message="`即将申请取消“${cancellationCandidate?.task.title || '原事项'}”。全部预占费用将释放，记录和成果保留；已发出的外部调用不保证立即停止。确认后关闭后续执行；若结果未确认，只核对原结果，不重复提交。`"
      confirm-button-text="确认取消事项"
      cancel-button-text="保留事项"
      confirm-button-text-type="danger"
      @confirm="confirmCancellation"
      @cancel="dismissCancellation"
      @close="dismissCancellation"
    />
  </div>
</template>

<script setup>
import { isRecommendedLevel, recommendationLevelText, isAvailableTaskQuote, taskQuoteText } from '../../composables/juyiting/hallAssigneeRecommendation.js'
const recommendationStateText = state => ({
  IDLE: '可以选择一位好汉来承办。', LOADING: '正在为你挑选合适的好汉…',
  READY: '推荐已备好，看看哪位更合适。',
  DEGRADED: '部分推荐依据暂不可用，仍可查看候选并手动选择。',
  NO_MATCH: '暂未找到特别合适的人选，你仍可查看理由并手动选择。',
  NO_CANDIDATES: '暂无可承办候选，请核对接单范围和可用状态。',
  ERROR: '智能推荐暂不可用，可重试或手动选择承办。',
  STALE: '事项或能力已变化，请重新推荐；原推荐不再使用。'
}[state] || '智能推荐暂不可用。')

import { assignedTaskTarget, assigneeProviderText, assigneeAvailabilityText } from '@/composables/juyiting/hallAssigneeCandidates.js'
import { projectHallTask } from '../../composables/juyiting/hallTaskPresentation.js'
import { canCancelOrdinaryTask, ordinaryTaskVersion, isTerminalMatter } from '../../composables/juyiting/useHallOrdinaryCancellation.js'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import HallInitialAction from './HallInitialAction.vue'
import HallRequirementEditor from './HallRequirementEditor.vue'
import HallTaskResources from './HallTaskResources.vue'
import WorkItemPlanPanel from './WorkItemPlanPanel.vue'
import TeamRecommendationPanel from './TeamRecommendationPanel.vue'
import TaskMaterialLinks from '@/components/personal-workspace/TaskMaterialLinks.vue'
import { formatWen, isCanonicalWenAmount } from '@/utils/wenAmount'

const props = defineProps({
  embeddedHall: { type: Boolean, default: false },
  resourcesActive: { type: Boolean, default: true },
  resourceReviewContext: { type: Object, default: null },
  detailAllowed: { type: Boolean, default: true },
  tasks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  countsLoading: { type: Boolean, default: false },
  countsErrorMessage: { type: String, default: '' },
  selectedTask: { type: Object, default: null },
  selectedAgent: { type: Object, default: null },
  assigneeCandidates: { type: Array, default: () => [] },
  candidatesTaskId: { type: String, default: null },
  candidatesLoading: { type: Boolean, default: false },
  candidatesError: { type: String, default: '' },
  candidatesNextAfterAgentId: { type: String, default: null },
  operableAgents: { type: Array, default: () => [] },
  recommendedAgents: { type: Array, default: () => [] },
  taskBudget: { type: Object, default: () => ({ state: 'IDLE' }) },
  recommendationState: { type: Object, default: () => ({ state: 'IDLE', result: null }) },
  taskAgentOptions: { type: Array, default: () => [] },
  taskStatusFilters: { type: Array, default: () => [] },
  taskAgentFilter: { type: String, default: '' },
  taskKeyword: { type: String, default: '' },
  taskStatusFilter: { type: String, default: '' },
  workItemPlanEnabled: { type: Boolean, default: false },
  authorizationGeneration: { type: Number, default: 0 },
  identityScope: { type: String, default: '' },
  fundedCreateRecovery: { type: Object, default: null },
  requirementCreateState: { type: Object, default: null },
  requirementCreateBusy: { type: Boolean, default: false },
  pointAndStartState: { type: Object, default: null },
  pointAndStartBusy: { type: Boolean, default: false },
  cancellationBusy: { type: Boolean, default: false },
  cancellationState: { type: Object, default: null },
  abilityText: { type: Function, required: true },
  canAssign: { type: Function, required: true },
  formatTime: { type: Function, required: true },
  portraitName: { type: Function, required: true },
  portraitStyle: { type: Function, required: true },
  taskStateClass: { type: Function, required: true },
  taskStatusCount: { type: Function, required: true },
  taskStatusText: { type: Function, required: true }
})

const emit = defineEmits([
  'assign-task',
  'request-budget', 'clear-budget',
  'refresh-recommendation',
  'requirement-saved',
  'refresh-candidates',
  'more-candidates',
  'archive-task',
  'brief-selected-task',
  'cancel-task',
  'recruit-agent',
  'check-requirement-create',
  'resume-requirement-create',
  'open-formal-results',
  'review-delivery',
  'mark-changed',
  'check-point-and-start',
  'resume-point-and-start',
  'discuss-task',
  'view-discussion-history',
  'load-settlement',
  'open-workspace',
  'open-deliberation',
  'load-tasks',
  'load-more-tasks',
  'select-agent',
  'select-task',
  'set-status-filter',
  'update:taskAgentFilter',
  'update:taskKeyword'
])

// Editable text is local until submit; pagination, refresh and other filters use the parent query.
const searchDraft = ref(props.taskKeyword)
const searchComposing = ref(false)
watch(() => props.taskKeyword, keyword => { searchDraft.value = keyword })
const guardSearchEnter = event => {
  if (!event.isComposing && !searchComposing.value && (event.keyCode === 229 || event.repeat)) event.preventDefault()
}
const submitKeyword = () => {
  if (searchComposing.value) return
  const keyword = searchDraft.value.trim()
  searchDraft.value = keyword
  if (keyword !== props.taskKeyword) emit('update:taskKeyword', keyword)
  emit('load-tasks')
}

const modalTask = ref(null)
const detailBackButton = ref(null)
let listOpener = null
const requirementCreateInputSummary = computed(() => {
  const intent = props.requirementCreateState?.intent
  const refs = (intent?.schemaVersion === 2 ? intent.body?.attachments : intent?.body?.inputRefs) || []
  return refs.length ? refs.map(item => `${item.fileId} v${item.version}`).join('、') : '无资料'
})
watch(() => [props.identityScope, props.authorizationGeneration], () => {
  listOpener = null
  searchDraft.value = props.taskKeyword
  searchComposing.value = false
  modalTask.value = null
}, { flush: 'sync' })
const detailTask = computed(() => modalTask.value)
const taskListEnd = ref(null)
let taskListObserver = null
const stopTaskListObserver = () => { taskListObserver?.disconnect(); taskListObserver = null }
watch([taskListEnd, () => props.loading, () => props.hasMore, () => props.errorMessage, () => props.resourcesActive, detailTask], () => {
  stopTaskListObserver()
  if (!taskListEnd.value || props.loading || !props.hasMore || props.errorMessage || !props.resourcesActive || detailTask.value) return
  if (typeof IntersectionObserver === 'undefined') return
  const observer = new IntersectionObserver(entries => {
    if (taskListObserver !== observer || !entries.some(entry => entry.isIntersecting)) return
    stopTaskListObserver()
    emit('load-more-tasks')
  }, { rootMargin: '0px 0px 120px 0px' })
  taskListObserver = observer
  observer.observe(taskListEnd.value)
}, { flush: 'post' })
onBeforeUnmount(stopTaskListObserver)
// Display only the already-validated context for this exact task revision; never grant acceptance here.
const matterResultCount = computed(() => {
  const task = detailTask.value, context = props.resourceReviewContext
  if (!task || context?.taskId !== String(task.id) || context.taskState !== String(task.status).toUpperCase() ||
      (task.taskVersion != null && String(task.taskVersion) !== context.taskVersion)) return null
  // An absent active batch does not mean archived/accepted history is empty.
  if (['completed', 'archived'].includes(task.status)) return null
  return context.currentDelivery?.items?.filter(item => item.displayRole === 'RESULT').length ?? 0
})
const matterResourceSummary = ref(null)
watch(() => [detailTask.value?.id, props.identityScope, props.authorizationGeneration], () => { matterResourceSummary.value = null }, { flush: 'sync' })
const showCancellationDialog = ref(false)
const cancellationCandidate = ref(null)
const cancellationSubmitting = ref(false)
const cancellationUnresolved = computed(() => props.cancellationState?.taskId === detailTask.value?.id && props.cancellationState?.status === 'unresolved')
const cancellationFence = computed(() => JSON.stringify([props.identityScope, props.authorizationGeneration,
  props.detailAllowed, props.selectedTask?.id, detailTask.value?.id, ordinaryTaskVersion(detailTask.value),
  detailTask.value?.status, detailTask.value?.phase, detailTask.value?.startedAt, detailTask.value?.completedAt,
  detailTask.value?.funding, detailTask.value?.reward]))
const dismissCancellation = () => { showCancellationDialog.value = false; cancellationCandidate.value = null }
watch(cancellationFence, () => { dismissCancellation(); cancellationSubmitting.value = false }, { flush: 'sync' })
watch(() => [props.cancellationBusy, props.cancellationState], () => {
  if (!props.cancellationBusy) cancellationSubmitting.value = false
}, { flush: 'sync' })
onBeforeUnmount(dismissCancellation)
const requestCancellation = () => {
  if (!props.identityScope || !props.detailAllowed || props.cancellationBusy || cancellationSubmitting.value ||
      showCancellationDialog.value || !detailTask.value) return false
  // Uncertainty belongs to the existing scoped cancellation client. This path
  // only checks its original record; it must not create another POST intent.
  if (cancellationUnresolved.value) {
    cancellationSubmitting.value = true
    emit('cancel-task', detailTask.value)
    return true
  }
  if (!canCancelOrdinaryTask(detailTask.value)) return false
  const task = JSON.parse(JSON.stringify(detailTask.value))
  task.taskVersion = ordinaryTaskVersion(task)
  cancellationCandidate.value = Object.freeze({ task, fence: cancellationFence.value })
  showCancellationDialog.value = true
  return true
}
const confirmCancellation = () => {
  const candidate = cancellationCandidate.value
  dismissCancellation()
  if (!candidate || candidate.fence !== cancellationFence.value || props.cancellationBusy ||
      cancellationSubmitting.value || !canCancelOrdinaryTask(detailTask.value)) return false
  cancellationSubmitting.value = true
  emit('cancel-task', candidate.task)
  return true
}
const pointAndStartForDetail = computed(() => {
  const state = props.pointAndStartState
  return state?.intent?.taskId === detailTask.value?.id && state.intent?.body ? state : null
})
const pointAndStartRecoveryTitle = computed(() => ({
  SENDING: '正在发送需求',
  CONFIRMED: '已发送',
  COST_CONSENT_PENDING: '历史请求待费用确认',
  UNKNOWN: '发送结果待确认',
  PREPARING: '正在准备会话',
  ADMITTED: '需求已发送',
  ATTACHED: '已进入悬赏议事',
  HISTORICAL: '历史指派',
  FAILED: '需求未能发送'
}[pointAndStartForDetail.value?.status] || '发送状态待核对'))
const pointAndStartRecoveryHint = computed(() => ({
  SENDING: '正在发送需求…请勿重复提交。',
  CONFIRMED: '已发送，正在查询进度，请勿重复提交。',
  COST_CONSENT_PENDING: '此历史请求涉及费用确认，请使用原费用确认流程；不会通过此处重发。',
  UNKNOWN: '发送结果暂未确认，请先查询，避免重复提交。',
  PREPARING: '正在准备议事…需求已保存，无需重复提交。',
  ADMITTED: '需求已发送，可从事项操作进入原议事。',
  ATTACHED: '可在会话中查看答复或继续修改。',
  HISTORICAL: '本次指派已结束，可查看历史记录。',
  FAILED: '需求未能发送。原需求和资料已保留，请查询发送结果核对详情。'
}[pointAndStartForDetail.value?.status] || '发送状态暂无法识别，请查询发送结果，不要重复提交。'))
const pointAndStartPreparing = computed(() => ['SENDING', 'PREPARING', 'CONFIRMED'].includes(pointAndStartForDetail.value?.status))
const pointAndStartNeedsCheck = computed(() => !['ADMITTED', 'ATTACHED', 'PREPARING', 'HISTORICAL', 'SENDING', 'CONFIRMED'].includes(pointAndStartForDetail.value?.status))
const pointAndStartAgentName = computed(() => {
  const body = pointAndStartForDetail.value?.intent?.body
  const id = body?.targetAgentId || body?.agentId
  const agent = [...props.operableAgents, ...props.recommendedAgents, ...props.assigneeCandidates].find(item => item.agentId === id)
  return agent ? agentDisplayName(agent) : id || '待核对'
})
const pointAndStartInputCount = computed(() => {
  const state = pointAndStartForDetail.value
  const refs = state?.projection?.inputs || state?.intent?.projection?.inputs || state?.intent?.body?.inputRefs
  return Array.isArray(refs) ? `${refs.length} 份资料` : '资料信息待核对'
})
const pointAndStartInputSummary = computed(() => {
  const state = pointAndStartForDetail.value
  const refs = state?.projection?.inputs || state?.intent?.projection?.inputs || state?.intent?.body?.inputRefs
  if (!refs) return '本次需求添加的资料'
  return refs.length ? refs.map(ref => `${ref.fileId} v${ref.version}`).join('、') : '无资料'
})
// The parent is the only authority for task-scoped discussion/workspace facts.  A
// detail may never borrow the context of whichever task was previously selected.
const assignedAgentForTask = task => {
  if (task?.funding?.mode !== 'FUNDED_SINGLE_AGENT') return assignedTaskTarget(task)
  const ids = taskAssigneeIds(task)
  return ids.length === 1 ? props.operableAgents.find(agent => agent.agentId === ids[0]) || null : null
}
const assignableRecommendedAgents = computed(() => props.recommendedAgents.filter(agent => props.canAssign(detailTask.value, agent)))
const matterCandidateId = ref('')
const matterCandidateExpansion = ref(null)
const matterCandidateToggle = ref(null)
const matterCandidates = computed(() => {
  const seen = new Set()
  return [...assignableRecommendedAgents.value, ...props.assigneeCandidates]
    .filter(agent => agent?.agentId && props.canAssign(detailTask.value, agent) && !seen.has(agent.agentId) && seen.add(agent.agentId))
})
const showNoAssigneeRecruitment = computed(() => hasTaskAction(detailTask.value, 'ASSIGN') &&
  !matterCandidates.value.length && !props.candidatesLoading && !props.candidatesError &&
  !props.candidatesNextAfterAgentId && (isFundedTask(detailTask.value)
    ? props.recommendationState.state === 'NO_CANDIDATES'
    : props.candidatesTaskId === detailTask.value?.id))
const matterAgent = computed(() => {
  if (!hasTaskAction(detailTask.value, 'ASSIGN')) return assignedAgentForTask(detailTask.value)
  return matterCandidateId.value ? matterCandidates.value.find(agent => agent.agentId === matterCandidateId.value) || null : assignableRecommendedAgents.value.find(agent => isRecommendedLevel(agent.recommendationLevel)) || null
})
const showMatterCandidates = computed({
  get: () => matterCandidateExpansion.value ?? (!matterAgent.value && props.recommendationState.state !== 'LOADING'),
  set: value => { matterCandidateExpansion.value = value }
})
const selectMatterCandidate = async agent => {
  if (requirementEditBusy.value || props.pointAndStartBusy || pointAndStartForDetail.value || !props.canAssign(detailTask.value, agent)) return
  matterCandidateId.value = agent.agentId
  matterCandidateExpansion.value = false
  await nextTick()
  matterCandidateToggle.value?.focus()
}
watch(() => [props.identityScope, props.authorizationGeneration, detailTask.value?.id, detailTask.value?.taskVersion], () => { matterCandidateId.value = ''; matterCandidateExpansion.value = null }, { flush: 'sync' })
const canConfirmAgent = agent => Boolean(agent && !requirementEditBusy.value &&
  !props.pointAndStartBusy && !pointAndStartForDetail.value && hasTaskAction(detailTask.value, 'ASSIGN') && props.canAssign(detailTask.value, agent) &&
  (isFundedTask(detailTask.value) || (agent.agentId === budgetTarget.value && isAvailableTaskQuote(selectedQuote.value))))
const confirmAgent = agent => {
  if (!canConfirmAgent(agent)) return
  emit('assign-task', detailTask.value, { ...agent, taskQuote: selectedQuote.value })
}
const statusStrip = ref(null)
const secondaryStatusGroup = ref(null)
const secondaryStatusToggle = ref(null)
const secondaryStatusId = useId()
const agentFilterControl = ref(null)
const statusLabel = computed(() => props.taskStatusFilters.find(item => item.value === props.taskStatusFilter)?.label)
const clearFiltersLabel = computed(() => props.taskKeyword
  ? (props.taskAgentFilter ? '清除关键词和承办人' : '清除关键词')
  : (props.taskAgentFilter ? '清除承办人' : ''))
const clearListFilters = () => {
  searchDraft.value = ''
  if (props.taskKeyword) emit('update:taskKeyword', '')
  if (props.taskAgentFilter) emit('update:taskAgentFilter', '')
  emit('load-tasks')
  const control = secondaryStatusActive.value
    ? (secondaryStatusExpanded.value && secondaryStatusGroup.value?.querySelector('[aria-pressed="true"]')) || secondaryStatusToggle.value
    : statusStrip.value?.querySelector('[aria-pressed="true"]') || agentFilterControl.value
  control?.focus()
}
const primaryStatusFilters = computed(() => props.taskStatusFilters.filter(item => !['HISTORY', 'UNKNOWN'].includes(item.value)))
const secondaryStatusFilters = computed(() => props.taskStatusFilters.filter(item => ['HISTORY', 'UNKNOWN'].includes(item.value)))
const secondaryStatusActive = computed(() => ['HISTORY', 'UNKNOWN'].includes(props.taskStatusFilter))
const secondaryStatusExpanded = ref(secondaryStatusActive.value)
watch(() => props.taskStatusFilter, () => { secondaryStatusExpanded.value = secondaryStatusActive.value })
watch(() => [props.identityScope, props.authorizationGeneration], () => { secondaryStatusExpanded.value = secondaryStatusActive.value })
const selectStatus = value => { if (value !== props.taskStatusFilter) emit('set-status-filter', value) }
const selectPrimaryStatus = value => {
  secondaryStatusExpanded.value = false
  selectStatus(value)
}
const simpleMatterStatus = task => props.taskStatusText(task)
const taskPresentation = task => projectHallTask({ task })
const hasTaskAction = (task, action) => taskPresentation(task).actions.includes(action)
const canActOnTask = task => hasTaskAction(task, 'ASSIGN') || hasTaskAction(task, 'DISCUSS')
const requirementEditor = ref(null)
const requirementMaterialTrigger = ref(null)
const requirementEditBusy = ref(false)
const canEditRequirement = computed(() => props.embeddedHall && hasTaskAction(detailTask.value, 'ASSIGN') &&
  !isFundedTask(detailTask.value) && !props.pointAndStartBusy && !pointAndStartForDetail.value)
const requirementSaved = view => {
  if (view.changed !== false) { matterCandidateId.value = ''; matterCandidateExpansion.value = null }
  emit('requirement-saved', view)
}
watch(() => [props.identityScope, props.authorizationGeneration, detailTask.value?.id], () => { requirementEditBusy.value = false }, { flush: 'sync' })

watch(matterAgent, (agent, previous) => {
  if (!agent && previous) matterCandidateExpansion.value = null
})

const fundedRecoveryAbilities = computed(() => {
  const abilities = props.fundedCreateRecovery?.body?.requiredAbilities
  return Array.isArray(abilities) ? abilities.join('、') || '未填写' : abilities || '未填写'
})
const unassignedDiscussHint = '此榜文尚未点将，暂不可开议'
const isFundedTask = task => task?.funding?.mode === 'FUNDED_SINGLE_AGENT'
const budgetTarget = computed(() => props.resourcesActive && props.embeddedHall &&
  !isFundedTask(detailTask.value) && hasTaskAction(detailTask.value, 'ASSIGN') ? matterAgent.value?.agentId || null : null)
const currentBudget = computed(() => budgetTarget.value && props.taskBudget.agentId === budgetTarget.value &&
  props.taskBudget.taskId === detailTask.value?.id && props.taskBudget.taskVersion === detailTask.value?.taskVersion ? props.taskBudget : null)
const selectedQuote = computed(() => currentBudget.value?.state === currentBudget.value?.quote?.state ? currentBudget.value?.quote : null)
const budgetStatusText = computed(() => ({ LOADING: '正在估算预算…', ERROR: '预算暂不可用，可重试',
  REFRESHING: '事项已变化，正在核对', REFRESH_FAILED: '事项核对失败', STALE: '事项已变化，请重新取价', INACCESSIBLE: '当前不可取价，请核对访问权限' })[currentBudget.value?.state])
const budgetAction = computed(() => ({ ERROR: { mode: 'retry', label: '重试预算' }, REFRESH_FAILED: { mode: 'refresh', label: '重新核对事项' },
  ...Object.fromEntries(['AVAILABLE', 'UNAVAILABLE', 'STALE'].map(s => [s, { mode: 'renew', label: '重新取价' }])) })[currentBudget.value?.state])
watch([budgetTarget, () => detailTask.value?.id, () => detailTask.value?.taskVersion, () => props.identityScope, () => props.authorizationGeneration], () => {
  if (budgetTarget.value) emit('request-budget', detailTask.value, budgetTarget.value)
  else emit('clear-budget')
}, { immediate: true })
onBeforeUnmount(() => emit('clear-budget'))
const formatMoney = value => formatWen(typeof value === 'string' && isCanonicalWenAmount(value) ? value : '0')
const agentDisplayName = (agent) => agent?.displayName || agent?.name || agent?.personaName || agent?.agentId || ''
const recommendationReason = (agent) => agent?.recommendationReason || ''
const taskAssigneeIds = (task) => {
  if (!task) return []
  if (Array.isArray(task.assignedAgentIds)) return task.assignedAgentIds
  return task.assignedAgentId ? [task.assignedAgentId] : []
}

const openTask = (task, trigger, preferredAgentId = null) => {
  if (props.embeddedHall && !props.detailAllowed && !modalTask.value) return false
  listOpener = props.embeddedHall ? trigger ?? null : null
  modalTask.value = task
  if (preferredAgentId) { matterCandidateId.value = preferredAgentId; matterCandidateExpansion.value = false }
  emit('select-task', task)
  if (listOpener) nextTick(() => {
    if (props.resourcesActive && listOpener === trigger && modalTask.value?.id === task.id) {
      detailBackButton.value?.focus({ preventScroll: true })
    }
  })
}

const closeTask = () => {
  const origin = listOpener
  modalTask.value = null
  if (!origin) {
    emit('select-task', null)
    return
  }
  emit('select-task', null, { fromTaskList: true })
  nextTick(() => {
    if (listOpener !== origin || modalTask.value) return
    listOpener = null
    if (!props.resourcesActive || !props.detailAllowed) return
    const target = origin.isConnected ? origin : statusStrip.value?.querySelector('[aria-pressed="true"]') || agentFilterControl.value
    target?.focus({ preventScroll: true })
  })
}
watch(() => props.resourcesActive, active => { if (!active) listOpener = null }, { flush: 'sync' })

watch(() => props.selectedTask, (task) => {
  if (!task) {
    modalTask.value = null
    return
  }

  if (modalTask.value?.id === task.id) {
    modalTask.value = task
  }
})
const canGoBack = computed(() => Boolean(modalTask.value))
const back = () => {
  if (!canGoBack.value) return false
  closeTask()
  return true
}
defineExpose({ openTask, canGoBack, back })
</script>
<style scoped>
.task-pagination-status { padding: 16px; text-align: center; color: var(--hall-text-muted, #68716b); }
.task-page-sentinel { display: grid; place-items: center; min-height: 28px; }
.task-page-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  color: var(--hall-brand, #923f30);
}
@media (prefers-reduced-motion: no-preference) {
  .task-page-spinner, .task-refresh[aria-busy="true"] svg { animation: task-list-spin .85s linear infinite; }
}
@keyframes task-list-spin { to { transform: rotate(1turn); } }
.bounty-panel {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  flex-direction: column;
  overflow: hidden;
}

/* The list needs a bounded flex parent so it can own scrolling inside the Hall panel. */
.bounty-source {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.ordinary-cancellation {
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 16px 0;
  padding-top: 16px;
  border-top: 1px solid var(--hall-border, #eadfd4);
}

.ordinary-cancellation > p {
  margin: 0;
  color: var(--hall-text-secondary, #68716b);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.ordinary-cancel-action {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 9px 14px;
  border: 1px solid var(--hall-brand, #923f30);
  border-radius: 8px;
  background: var(--hall-surface, #fffefa);
  color: var(--hall-brand, #923f30);
  font-weight: 500;
  white-space: normal;
  overflow-wrap: anywhere;
}
.ordinary-cancel-action:hover:not(:disabled) { background: #f6eee8; border-color: #793326; }
.ordinary-cancel-action:focus-visible { outline: 3px solid #923f3080; outline-offset: 3px; }
.ordinary-cancel-action:disabled { opacity: .55; cursor: not-allowed; }

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.panel-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, .55fr) auto 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 16px 4px;
  color: #765f40;
  font-size: 13px;
}

.panel-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  background: #efe0c6;
  color: #4a3423;
}

.task-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.panel-toolbar .task-search-submit {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--hall-brand, #923f30);
  border-radius: var(--hall-radius-sm, 8px);
  background: var(--hall-surface-brand, #f6eee8);
  color: var(--hall-brand, #923f30);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
}
.task-search-applied {
  grid-column: 1 / -1;
  min-width: 0;
  margin: 0;
  color: var(--hall-text-muted, #59665c);
  font-size: .875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Keep the empty status region in the accessibility tree without taking up a row. */
.task-search-applied:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; }
@media (max-width: 520px) {
  .panel-toolbar { grid-template-columns: minmax(0, 1fr) auto 44px; }
  .task-search { grid-column: 1 / -1; }
}

.task-search input,
.task-assignee {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 44px;
  padding: 0 10px;
  border: 1px solid var(--hall-border-strong, #d7c3a2);
  border-radius: 8px;
  background: var(--work-paper, #fffdf6);
  color: var(--work-ink, #3f2815);
  font: inherit;
}

.task-search input:focus-visible,
.task-assignee:focus-visible,
.task-search-submit:focus-visible,
.task-status-secondary:focus-visible,
.task-refresh:focus-visible {
  outline: 2px solid var(--work-brand, #a44330);
  outline-offset: 2px;
}

.panel-toolbar .task-refresh {
  grid-column: -2 / -1;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--work-line, #d7c3a2);
}

.requirement-create-recovery {
  flex: 0 1 auto;
  min-height: 0;
  max-height: min(35vh, 14rem);
  margin: 0 16px 12px;
  padding: 10px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  border: 1px solid #b99358;
  border-radius: 8px;
  background: #fff4da;
  color: #4a3423;
}

.requirement-create-recovery p { margin: 6px 0; }
.requirement-create-recovery button { margin-right: 8px; padding: 6px 10px; border-radius: 6px; }

.task-data-state {
  margin: 0 16px 8px;
  color: #765f40;
  font-size: 13px;
}

.task-data-state.is-error { color: #b3261e; }

.task-status-tabs {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  flex: 0 0 auto;
  gap: 8px;
  padding: 0 12px 12px;
}

.task-status-tabs button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 8px;
  background: #efe0c6;
  color: #4a3423;
  max-width: 100%;
}

.panel-toolbar .task-status-secondary {
  min-height: 44px;
  padding: 0 8px;
  gap: 4px;
  font-size: .8125rem;
  white-space: nowrap;
}
.panel-toolbar .task-status-secondary.active { background: var(--hall-surface-brand, #f6eee8); color: var(--hall-brand, #923f30); }
.panel-toolbar .task-refresh[aria-busy="true"] { color: var(--hall-brand, #923f30); }
.task-status-secondary svg { flex: none; }
.task-status-secondary[aria-expanded="true"] svg { transform: rotate(180deg); }
.task-status-tabs button:focus-visible { outline: 2px solid var(--hall-brand, #8d2d22); outline-offset: -2px; }

.task-status-tabs button.active {
  background: #7c1f1b;
  color: #fff8e8;
}

.task-status-tabs small {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  font-size: .75rem;
  font-variant-numeric: tabular-nums;
}

.task-panel-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0 12px 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.task-list {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0;
  -webkit-overflow-scrolling: touch;
}

.task-card {
  box-sizing: border-box;
  max-width: 100%;
  padding: 12px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: #f7ecd7;
}

.task-card.selected {
  background: #ead3a9;
}

.task-card p {
  color: #765f40;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.task-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}

.task-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-head span {
  font-size: 12px;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
  color: #8b6b44;
  font-size: 12px;
}

.ability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.ability-tags span {
  padding: 3px 7px;
  border-radius: 8px;
  background: rgba(35, 72, 62, 0.12);
  color: #23483e;
  font-size: 12px;
}

.task-detail-card {
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  padding: 12px;
  box-sizing: border-box;
  overflow: auto;
  border-radius: 8px;
  background: #f4e2c3;
}

.task-detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  margin-bottom: 10px;
}

.task-detail-head > div {
  min-width: 0;
}

.task-detail-head strong,
.task-detail-head small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail-head small {
  margin-top: 3px;
  color: #765f40;
  font-size: 12px;
}

.task-operation-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}

.task-operation-grid button {
  position: relative;
  display: inline-grid;
  place-items: center;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 8px;
  background: #7c1f1b;
  color: #fff8e8;
  line-height: 1;
}

.task-operation-grid button + button {
  background: #23483e;
}

.task-operation-grid button:disabled,
.recommended-agent-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.count-badge {
  position: absolute;
  right: -4px;
  top: -5px;
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border: 1px solid #fff8e8;
  border-radius: 999px;
  background: #d8a33a;
  color: #2f261c;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.task-operation-hint {
  margin: -2px 0 10px;
  color: #8a5d26;
  font-size: 12px;
}

.recommended-agents {
  display: grid;
  gap: 8px;
}

.section-label {
  color: #765f40;
  font-size: 12px;
  font-weight: 700;
}

.recommended-agent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  background: #f7ecd7;
}

.recommended-agent-row.active {
  outline: 2px solid #7c1f1b;
}

.recommended-agent-main {
  display: grid;
  grid-template-columns: 22px 38px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 253, 246, 0.72);
  color: #2f261c;
  text-align: left;
}

.recommended-agent-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  width: 100%;
}

.recommendation-reason {
  grid-column: 1 / -1;
  margin: -2px 4px 0 68px;
  overflow-wrap: anywhere;
}

.recommended-agent-actions button {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-width: 30px;
  padding: 0;
  border-radius: 7px;
  background: #efe0c6;
  color: #4a3423;
  line-height: 1;
}

.no-agent-recruitment { display: grid; gap: 8px; margin: 12px 0; padding: 12px; border: 1px solid #d4bd97; border-radius: 6px; background: #fff8e7; }
.no-agent-recruitment p { margin: 0; }
.no-agent-recruitment button { justify-self: start; }
.recommended-agent-actions button:nth-child(2) {
  background: #7c1f1b;
  color: #fff8e8;
}

.recommended-agents strong,
.recommended-agents small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommended-agents small,
.recommended-agents p {
  color: #765f40;
  font-size: 12px;
}

.recommended-agents em {
  white-space: nowrap;
  font-style: normal;
  color: #23483e;
  font-weight: 700;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.mini-avatar {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #7c1f1b;
  color: #fff4d4;
  font-weight: 700;
}

.portrait-avatar {
  position: relative;
  overflow: hidden;
  background-repeat: no-repeat;
  background-color: #7c1f1b;
  box-shadow:
    inset 0 0 0 2px rgba(255, 244, 212, 0.72),
    inset 0 -4px 0 rgba(0, 0, 0, 0.14);
}

.portrait-avatar::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 35% 23%, rgba(255, 255, 255, 0.22), transparent 34%);
  pointer-events: none;
}

.task-state-open,
.task-state-planning,
.task-state-assigned,
.task-state-running,
.task-state-reviewing,
.task-state-blocked,
.task-state-done,
.task-state-failed,
.task-state-cancelled,
.task-state-archived,
.task-state-unknown {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.task-state-open,
.task-state-planning {
  background: rgba(124, 31, 27, 0.12);
  color: #7c1f1b;
}

.task-state-assigned,
.task-state-running,
.task-state-reviewing {
  background: rgba(154, 91, 0, 0.14);
  color: #875200;
}

.task-state-blocked,
.task-state-unknown {
  background: rgba(111, 78, 35, 0.14);
  color: #6f4e23;
}

.task-state-done,
.task-state-archived {
  background: rgba(46, 125, 50, 0.14);
  color: #2e7d32;
}

.task-state-failed,
.task-state-cancelled {
  background: rgba(179, 38, 30, 0.14);
  color: #b3261e;
}

.empty-list {
  padding: 16px;
  color: #765f40;
}

/* Modal Styles */
.bounty-modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: transparent;
  padding: 16px;
  isolation: isolate;
  contain: layout paint;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}

.bounty-modal-overlay,
.bounty-modal,
.bounty-modal * {
  box-sizing: border-box;
}

.bounty-modal-overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(15, 10, 6, 0.72);
  opacity: 1;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  pointer-events: none;
}

.bounty-modal {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: min(90vh, 720px);
  border: 1px solid rgba(255, 240, 202, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(155deg, #fdf6ea 0%, #f2e0bd 100%);
  color: #2f261c;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.18),
    0 18px 48px rgba(0, 0, 0, 0.42);
  overflow: hidden;
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transform-origin: center bottom;
  backface-visibility: hidden;
  contain: layout paint;
  will-change: transform, opacity;
  isolation: isolate;
}

.bounty-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(124, 31, 27, 0.16);
  background: linear-gradient(135deg, rgba(124, 31, 27, 0.06), transparent);
}

.bounty-modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #7c1f1b;
}

.modal-close {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(124, 31, 27, 0.1);
  color: #7c1f1b;
  transition: background 0.18s;
}

.modal-close:hover {
  background: rgba(124, 31, 27, 0.2);
}

.bounty-modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
}

.workspace-shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0;
  padding: 12px;
  border: 1px solid #d7c3a2;
  border-radius: 8px;
  background: #fff8e8;
}

.workspace-shortcut strong,
.workspace-shortcut p {
  display: block;
  margin: 0;
}

.workspace-shortcut p {
  margin-top: 3px;
  color: #765f40;
  font-size: 12px;
}

.workspace-shortcut button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  background: #6d3f1f;
  color: #fff8e8;
}

.modal-task-info {
  flex: 0 0 auto;
  padding: 14px 16px 0;
}

.modal-agent-scroll {
  flex: 0 0 auto;
  margin-top: 12px;
  padding: 0 16px 16px;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: none;
}

.modal-enter-active::before,
.modal-leave-active::before {
  transition: opacity 0.16s ease-out;
  will-change: opacity;
}

.modal-enter-active .bounty-modal,
.modal-leave-active .bounty-modal {
  transition:
    transform 0.18s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.14s ease-out;
  will-change: transform, opacity;
}

.modal-enter-from::before,
.modal-leave-to::before {
  opacity: 0;
}

.modal-enter-from .bounty-modal {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

.modal-leave-to .bounty-modal {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active::before,
  .modal-leave-active::before,
  .modal-enter-active .bounty-modal,
  .modal-leave-active .bounty-modal {
    transition: none;
  }
}

@media (max-width: 900px) {
  .bounty-modal-overlay {
    padding: 10px;
  }

  .task-panel-body {
    grid-template-columns: 1fr;
  }

  .task-panel-body {
    overflow: auto;
  }

  .task-list,
  .task-detail-card {
    overflow: visible;
  }

  .task-operation-grid {
    justify-content: flex-start;
  }

  .recommended-agent-row {
    grid-template-columns: 1fr;
  }

  .recommended-agent-main {
    grid-template-columns: 22px 38px minmax(0, 1fr) auto;
  }

  .recommended-agent-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    justify-content: stretch;
  }

  .recommended-agent-actions button {
    width: 100%;
    min-width: 0;
    height: 34px;
  }

  .bounty-modal {
    width: 100%;
    max-width: 100%;
    max-height: 100%;
  }
}

/* ECO-V0 funded-preview additions; legacy bounty layout stays intact. */
.funding-summary { margin: 8px 0 0; color: #75430b !important; font-weight: 700; }
.funded-preview-details { margin: 10px 0; padding: 10px; border-radius: 8px; background: #fff3cc; color: #6b4a12; font-size: 12px; }
.funded-preview-details p { margin: 6px 0; }
.funded-detail-button { margin: 4px 6px 4px 0; padding: 7px 9px; border-radius: 7px; background: #7c1f1b; color: #fff8e8; font-size: 12px; }
.quote-summary { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(117, 67, 11, .22); }
.settlement-detail { max-height: 180px; margin: 8px 0 0; overflow: auto; white-space: pre-wrap; font-size: 11px; }

.is-hall-embedded .bounty-modal-overlay {
  position: static;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  contain: none;
  transform: none;
}
.is-hall-embedded .bounty-modal-overlay::before { display: none; }
.is-hall-embedded .bounty-modal {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  max-width: none;
  max-height: 100%;
  box-shadow: none;
}
.matter-send-status { margin: 12px 0; min-width: 0; font-size: 13px; color: var(--hall-text-muted, #68716b); overflow-wrap: anywhere; }
.matter-send-status p { margin: 6px 0; }
.matter-send-status.is-warning { padding: 12px; border: 1px solid #d6bb7f; border-radius: 8px; background: #fff9e9; color: var(--hall-warning, #87551c); }
.matter-send-status.is-failed { color: var(--hall-danger, #a13f35); }
.matter-send-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.matter-send-actions button { min-height: 44px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--hall-border, #e3e5dc); border-radius: 7px; background: var(--hall-surface, #fffefa); color: inherit; font: inherit; cursor: pointer; }
.matter-send-actions button:disabled { cursor: wait; opacity: .6; }
.matter-send-details { margin-top: 10px; color: var(--hall-text-muted, #68716b); }
.matter-send-details summary { cursor: pointer; min-height: 32px; }
.matter-send-details summary:focus-visible, .matter-send-actions button:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: 2px; }
.matter-send-note { font-size: 12px; }
.matter-candidates,.task-secondary-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.matter-candidates button,.task-secondary-filters button,.matter-agent-toggle,.matter-secondary-action{min-height:44px;padding:8px 12px;border:1px solid var(--hall-border,#e3e5dc);border-radius:8px;background:var(--hall-surface,#fffefa);color:var(--hall-text,#242e2b)}.matter-candidates button[aria-pressed="true"],.task-secondary-filters button[aria-pressed="true"]{border-color:var(--hall-brand,#923f30);color:var(--hall-brand,#923f30)}.matter-agent-toggle{margin-bottom:10px}.matter-secondary-action{width:100%;margin-top:8px}.matter-advice-card h3{margin:12px 0;overflow-wrap:anywhere}
.matter-resources h4{margin:12px 0 6px}.matter-resources p{color:var(--hall-text-muted,#68716b);font-size:13px;line-height:1.5}
.matter-candidates button { min-width: 0; max-width: 100%; text-align: left; overflow-wrap: anywhere; }
.matter-candidates button small { display: block; font-size: 12px; color: var(--hall-text-muted, #68716b); }
.matter-selected-reason{margin:0;color:var(--hall-muted,#68716b);font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.matter-advice-card dd,.matter-primary-action{overflow-wrap:anywhere;white-space:normal}
.matter-edit-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.matter-edit-row h3,.matter-edit-row .matter-request{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.matter-description-row{align-items:flex-start}.matter-edit-button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;min-height:38px;padding:8px}

.is-hall-embedded .task-panel-body { container-type: inline-size; }
.is-hall-embedded .task-head strong { font-size:16px; line-height:1.45; white-space:normal; overflow-wrap:anywhere; }
.is-hall-embedded .task-head span { align-self:start; }
.is-hall-embedded .task-card .task-excerpt { margin:6px 0; font-size:13px; line-height:1.5; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
.is-hall-embedded .task-meta { align-items:center; gap:4px 10px; margin-top:8px; overflow-wrap:anywhere; }
.is-hall-embedded .task-skill { padding:2px 7px; border-radius:5px; background:#edf2ec; color:#395644; }
.is-hall-embedded .task-card:focus-visible { outline:2px solid #964637; outline-offset:-3px; }
@container (min-width: 850px) {
  .is-hall-embedded .task-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-content:start; gap:0 12px; }
  .is-hall-embedded .task-list > :not(.task-card) { grid-column:1 / -1; }
}


/* Secondary choices share the list gutter and stay compact on wide screens. */
.is-hall-embedded .task-secondary-filters {
  display:grid; grid-template-columns:repeat(2,minmax(0,9rem)); gap:8px;
  margin:0 20px 8px; padding:0; min-width:0; border:0;
}
.is-hall-embedded .task-secondary-filters button {
  display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:0;
  min-height:44px; margin:0; padding:4px 8px; color:var(--hall-text-muted,#59665c);
}
.is-hall-embedded .task-secondary-filters button::before {
  content:''; box-sizing:border-box; width:6px; height:10px; border:solid transparent;
  border-width:0 2px 2px 0; transform:translateY(-1px) rotate(45deg);
}
.is-hall-embedded .task-secondary-filters button[aria-pressed="true"] { font-weight:600; }
.is-hall-embedded .task-secondary-filters button[aria-pressed="true"]::before { border-color:currentColor; }
.is-hall-embedded .task-secondary-filters small { font-variant-numeric:tabular-nums; }
@media(max-width:760px) { .is-hall-embedded .task-secondary-filters { margin-inline:16px; } }
@media(max-width:480px) { .is-hall-embedded .task-secondary-filters { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>

<style scoped>
.bounty-modal-overlay.is-embedded-page{position:static;display:block;width:100%;height:auto;min-height:100%;padding:0;background:#f5f4f0;overflow:visible}.bounty-modal-overlay.is-embedded-page .bounty-modal{width:100%;max-width:none;min-height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:#f5f4f0}.bounty-modal-overlay.is-embedded-page .bounty-modal-header{position:sticky;top:0;z-index:3;min-height:48px;padding:6px 16px;border-bottom:1px solid #e3e5dc;background:#fffefa}.bounty-modal-overlay.is-embedded-page .bounty-modal-header h3{font-size:17px;font-weight:500}.bounty-back-button{min-height:44px;padding:0 4px 0 0;border:0!important;background:transparent!important;color:#923f30!important;font:500 14px/1 inherit;cursor:pointer;white-space:nowrap}.bounty-modal-overlay.is-embedded-page .bounty-modal-header h3{flex:1;margin:0;color:#242e2b;text-align:left}.bounty-modal-overlay.is-embedded-page .bounty-modal-body{padding:0 0 96px}.bounty-modal-overlay.is-embedded-page .modal-task-info{padding:16px 16px 0}.matter-advice-card{display:grid;gap:12px;padding:16px;border:1px solid #eadfd4;border-radius:12px;background:#fffefa}.matter-advice-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.matter-advice-heading span{color:#923f30;font-size:13px;font-weight:600}.matter-advice-heading strong{padding:4px 8px;border-radius:999px;background:#f9efde;color:#87551c;font-size:12px}.matter-request{margin:0!important;padding-bottom:12px;border-bottom:1px solid #ece5dd;font-size:16px!important;line-height:1.75!important;color:#242e2b!important}.matter-advice-card dl{display:grid;gap:9px;margin:0}.matter-advice-card dl div{display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px}.matter-advice-card dt{color:#68716b;font-size:12px}.matter-advice-card dd{margin:0;font-size:13px}.matter-fee-note{margin:0!important;padding:11px 12px;border-left:3px solid #c7a092;border-radius:8px;background:#f6eee8;color:#65473f!important;font-size:13px!important;line-height:1.65!important}.matter-agent-actions{display:flex;gap:8px;flex-wrap:wrap}.matter-primary-action,.matter-results-action{width:100%;min-height:46px;border-radius:8px!important;background:#923f30!important;color:#fffefa!important;border-color:#923f30!important}.matter-results-action{margin-top:16px}.matter-archive-action{width:100%;min-height:44px;border:1px solid #923f30!important;border-radius:8px!important;background:#fffefa!important;color:#923f30!important;font-weight:600}.matter-archive-note{margin:0!important;padding:10px;border-radius:8px;background:#eef5ec;color:#36643b!important;font-size:13px!important}.matter-agent-actions button{min-height:44px;padding:8px 14px;background:#923f30!important;color:#fffefa!important;border-color:#923f30!important}@media(max-width:620px){.bounty-modal-overlay.is-embedded-page .bounty-modal-body{display:block}.bounty-modal-overlay.is-embedded-page .modal-task-info{padding:12px 12px 0}.bounty-modal-overlay.is-embedded-page .modal-agent-scroll{margin-top:14px;max-height:none}.matter-advice-card dl div{grid-template-columns:64px minmax(0,1fr)}}
.matter-candidates,.task-secondary-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.matter-candidates button,.task-secondary-filters button,.matter-agent-toggle,.matter-secondary-action{min-height:44px;padding:8px 12px;border:1px solid var(--hall-border,#e3e5dc);border-radius:8px;background:var(--hall-surface,#fffefa);color:var(--hall-text,#242e2b)}.matter-candidates button[aria-pressed="true"],.task-secondary-filters button[aria-pressed="true"]{border-color:var(--hall-brand,#923f30);color:var(--hall-brand,#923f30)}.matter-agent-toggle{margin-bottom:10px}.matter-secondary-action{width:100%;margin-top:8px}.matter-advice-card h3{margin:12px 0;overflow-wrap:anywhere}
.matter-resources h4{margin:12px 0 6px}.matter-resources p{color:var(--hall-text-muted,#68716b);font-size:13px;line-height:1.5}
.matter-candidates button { min-width: 0; max-width: 100%; text-align: left; overflow-wrap: anywhere; }
.matter-candidates button small { display: block; font-size: 12px; color: var(--hall-text-muted, #68716b); }

/* Same inline candidate cards as the commission prototype; do not conflate no advice with no candidates. */
.matter-candidate-picker { min-width:0; }
.matter-candidates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:stretch; }
.matter-candidates .matter-candidate-card { display:flex; align-items:center; gap:12px; width:100%; padding:12px; }
.matter-candidates .matter-candidate-card[aria-pressed="true"] { background:var(--hall-surface-brand,#f6eee8); }
.matter-candidate-avatar { flex:none; display:grid; place-items:center; width:36px; height:36px; border-radius:50%; background:var(--hall-surface-subtle,#f3f3ed); }
.matter-candidate-copy { flex:1; min-width:0; }
.matter-candidate-check { flex:none; width:16px; }
.matter-candidate-picker button:focus-visible { outline:2px solid var(--hall-brand,#923f30); outline-offset:3px; }
.matter-recommendation { padding:12px; border-radius:10px; background:var(--hall-surface-subtle,#f8f6ef); }
.recommendation-status { display:flex; align-items:center; gap:10px; line-height:1.6; }
.recommendation-hint { margin:8px 0; font-size:13px; color:var(--hall-muted,#788178); }
.matter-candidate-copy .recommendation-level { font-weight:600; color:var(--hall-brand,#923f30); }
.matter-candidate-copy .recommendation-level[data-level="UNKNOWN"], .matter-candidate-copy .recommendation-level[data-level="LOW"] { color:var(--hall-muted,#788178); }
.recommendation-spinner { display:inline-block; flex:none; width:20px; height:20px; border:2px solid var(--hall-border,#e3e5dc); border-top-color:var(--hall-brand,#923f30); border-radius:50%; animation:recommendation-spin 1s linear infinite; }
@keyframes recommendation-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .recommendation-spinner { animation:none; } }
@media(max-width:720px) { .matter-candidates { grid-template-columns:1fr; } }
.matter-selected-reason{margin:0;color:var(--hall-muted,#68716b);font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.matter-advice-card dd,.matter-primary-action{overflow-wrap:anywhere;white-space:normal}
/* Unfilled edit tools, including touch hover; preserve their existing hit areas. */
.matter-edit-button,
.matter-edit-button:hover:not(:disabled) { background: transparent; border: 1px solid transparent; box-shadow: none; color: var(--hall-text-muted, #68716b); cursor: pointer; }
.matter-edit-button:focus-visible { outline: 2px solid var(--hall-brand, #923f30); outline-offset: 2px; }
.matter-edit-button:disabled { opacity: .55; cursor: default; }
</style>

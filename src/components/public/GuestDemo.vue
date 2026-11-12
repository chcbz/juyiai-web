<template>
  <main class="guest-demo">
    <aside class="demo-sidebar" aria-label="工作台侧栏">
      <button class="demo-brand" type="button" @click="activeTab = 'overview'"><span class="demo-seal">聚</span><span>聚义<small>一起，把事情办成。</small></span></button>
      <p class="nav-caption">我的工作空间</p>
      <nav aria-label="工作台主导航"><button
        v-for="tab in hallWorkbenchTabs"
        :key="tab.panel"
        type="button"
        :aria-current="activeTab === tab.panel ? 'page' : undefined"
        @click="activeTab = tab.panel"
      ><var-icon :name="tab.icon" /><span>{{ tab.label }}</span></button></nav>
      <div class="sidebar-bottom"><span>访客体验 · 示例账号</span><RouterLink :to="homeTarget">← 返回产品介绍</RouterLink><RouterLink :to="loginTarget">登录，使用自己的工作台 →</RouterLink></div>
    </aside>
    <div class="demo-main">
      <header class="demo-header"><div><span>我的工作空间</span><span aria-hidden="true"> / </span><strong>{{ activeTabLabel }}</strong></div><RouterLink :to="loginTarget">进入工作台 →</RouterLink></header>
      <div class="demo-notice"><strong>全程本地模拟</strong><span>这不是真实 AI 执行。不会调用真实 AI，也不会创建或保存任务；人物、报价、余额和成果均为示例。</span></div>
      <section ref="workspace" class="demo-workspace" aria-live="polite">
        <template v-if="activeTab === 'overview' || activeTab === 'tasks'">
          <header v-if="currentStep === 1" class="workspace-heading"><p>聚义 · 轻量工作台</p><h2 tabindex="-1">今天，想办成什么事？</h2><span>先体验一件事，从需求到承办、议事与验收。</span></header>
          <header v-else class="matter-heading"><div><small>示例事项 · 不保存到账号</small><h2 tabindex="-1">{{ selectedTemplate.result.title }}</h2></div><span class="status-chip">{{ statusLabel }}</span></header>
          <ol class="stepper" aria-label="体验步骤"><li
            v-for="step in guestDemoSteps"
            :key="step.id"
            :class="{ active: currentStep === step.id, complete: currentStep > step.id }"
            :aria-current="currentStep === step.id ? 'step' : undefined"
          ><span>{{ step.id }}</span>{{ step.label }}</li></ol>
          <div class="demo-columns">
            <div class="matter-content">
              <section v-if="currentStep === 1" class="template-stage surface">
                <h3>你想办成什么事？</h3><p class="muted">选择一个示例，也可以修改需求；点击开始后先看报价，不会自动承办。</p>
                <div class="template-grid"><button
                  v-for="template in guestDemoTemplates"
                  :key="template.id"
                  class="template-card"
                  type="button"
                  :aria-pressed="selectedTemplate.id === template.id"
                  @click="chooseTemplate(template)"
                ><strong>{{ template.eyebrow.split('（')[0] }}</strong><small>{{ template.title }}</small></button></div>
                <form @submit.prevent="start"><label class="field">需求描述<textarea
                  v-model="requirement"
                  rows="4"
                  maxlength="200"
                  placeholder="说说你的目标与交付要求"
                ></textarea></label><div class="stage-actions"><small class="muted">仅在此页面演示 · 刷新后重置</small><button class="next-action primary" type="submit" :disabled="!requirement.trim()">开始办事</button></div></form>
              </section>
              <section v-else-if="currentStep === 2" class="recommendation-stage surface">
                <div class="section-title"><BountyActionIcon name="assign" /><h3>选择承办人</h3></div><p class="requirement-copy">{{ requirement }}</p><p class="muted">推荐不等于授权执行。选定一位好汉，核对报价后再确认承办。</p>
                <div class="agent-list"><button
                  v-for="agent in guestDemoAgents"
                  :key="agent.id"
                  type="button"
                  class="agent-choice"
                  :aria-pressed="selectedAgentId === agent.id"
                  @click="selectedAgentId = agent.id"
                ><img :src="`/juyiting-portraits/${agent.id}.svg`" alt="" /><span><strong>{{ agent.name }} <small v-if="agent.id === selectedTemplate.agentId">示例推荐</small></strong><small>{{ agent.role }}</small><small>示例报价 {{ agent.quoteWen }} 文</small></span><span aria-hidden="true">{{ selectedAgentId === agent.id ? '✓' : '○' }}</span></button></div>
                <p class="quote-note">固定演示价，不是实时模型估价。确认后仅在本页面模拟预占 {{ selectedAgent.quoteWen }} 文。</p>
                <div class="stage-actions"><button type="button" class="quiet-action" @click="currentStep = 1">修改需求</button><button type="button" class="next-action primary" @click="confirmAssignment">确认由{{ selectedAgent.name }}承办</button></div>
              </section>
              <section v-else-if="currentStep === 3" class="execution-stage surface discussion-stage">
                <div class="section-title"><BountyActionIcon name="discuss" /><h3>事项议事 <small>承办：{{ selectedAgent.name }}</small></h3></div>
                <div class="discussion-messages" aria-label="示例议事消息"><article class="user-message"><small>我 · 示例需求</small><p>{{ requirement }}</p></article><BountyTypedOutcomeCard :projection="{ outcome: { kind: 'ANSWER', text: selectedTemplate.sampleReply } }" read-only /><article v-for="(message, index) in messages" :key="index" :class="message.role === 'user' ? 'user-message' : 'agent-message'"><small>{{ message.role === 'user' ? '我' : selectedAgent.name }} · 本地示例</small><p>{{ message.text }}</p></article></div>
                <form class="reply-form" @submit.prevent="sendReply"><label class="field">补充要求<textarea
                  v-model="reply"
                  rows="2"
                  maxlength="1000"
                  placeholder="例如：请补充一份交付检查表（仅本地演示）"
                ></textarea></label><button type="submit" :disabled="!reply.trim()">发送示例消息</button></form>
                <div class="stage-actions"><span class="muted">不模拟后台生成进度，直接查看预置成果。</span><button type="button" class="next-action primary" @click="showResult">查看示例成果</button></div>
              </section>
              <section v-else class="result-stage surface">
                <template v-if="status !== 'CANCELLED'">
                  <div class="section-title"><BountyActionIcon name="archive" /><h3>{{ status === 'ACCEPTED' ? '已验收 · 本地示例' : '成果待验收' }}</h3></div>
                  <p>{{ selectedTemplate.result.summary }}</p><div class="result-card"><strong>{{ selectedTemplate.result.title }} · v1</strong><small>示例交付清单 · 非现场生成</small><ul><li v-for="item in selectedTemplate.result.items" :key="item">{{ item }}</li></ul></div>
                  <p v-if="status === 'ACCEPTED'" class="receipt" role="status">模拟验收完成，已结算 {{ selectedAgent.quoteWen }} 文，预占归零。真实账号没有扣费。</p>
                  <template v-else><p class="muted">查看成果不会自动验收。真实使用时，请先核对交付内容与版本。</p><button type="button" class="primary accept-action" @click="status = 'ACCEPTED'">确认验收（模拟）</button></template>
                </template>
                <template v-else><h3>事项已取消 · 本地示例</h3><p>模拟预占已释放，真实账号没有扣费。</p></template>
                <div class="stage-actions"><button
                  v-if="status === 'REVIEW'"
                  type="button"
                  class="quiet-action"
                  @click="currentStep = 3; status = 'ASSIGNED'"
                >返回议事，补充修改</button><button type="button" class="quiet-action" @click="restart">重新体验</button><RouterLink class="link-action" :to="loginTarget">进入工作台，处理自己的任务 →</RouterLink></div>
              </section>
            </div>
            <aside class="matter-aside surface" aria-label="示例事项摘要"><h3>事项摘要</h3><dl><div><dt>状态</dt><dd>{{ statusLabel }}</dd></div><div><dt>承办人</dt><dd>{{ !confirmed ? '待确认' : selectedAgent.name }}</dd></div><div><dt>示例报价</dt><dd>{{ currentStep === 1 ? '待估价' : `${selectedAgent.quoteWen} 文` }}</dd></div></dl><h3>示例钱袋</h3><dl><div><dt>可用</dt><dd>{{ 100 - reserved - settled }} 文</dd></div><div><dt>预占</dt><dd>{{ reserved }} 文</dd></div><div><dt>已结算</dt><dd>{{ settled }} 文</dd></div></dl><p class="muted">初始 100 文仅为演示数字，不是注册赠送或真实余额。取消释放，验收结算。</p><button
              v-if="currentStep > 1 && !terminal"
              class="cancel-action"
              type="button"
              @click="cancel"
            >取消示例事项</button><p class="muted">由选定承办人跟进，不预设自动组成三人团队。</p></aside>
          </div>
        </template>
        <section v-else-if="activeTab === 'treasure'" class="surface resources-stage"><h2 tabindex="-1">资料</h2><p>真实工作台在这里管理资料与成果。Demo 仅展示当前事项的预置交付清单，不上传、不访问个人文件。</p><template v-if="currentStep === 4 && status !== 'CANCELLED'"><div class="result-card"><strong>{{ selectedTemplate.result.title }} · v1</strong><ul><li v-for="item in selectedTemplate.result.items" :key="item">{{ item }}</li></ul><small>示例内容，不是已生成的下载文件</small></div><button type="button" @click="activeTab = 'tasks'">返回事项查看</button></template><template v-else><p class="empty-state">还没有演示成果。先完成承办与议事步骤。</p><button type="button" @click="activeTab = 'overview'">去办事</button></template></section>
        <template v-else><HallMinePage
          @open="explainFeature"
          @map="explainFeature('map')"
          @profile="explainFeature('profile')"
          @help="explainFeature('help')"
        /><p v-if="featureNote" class="feature-note surface" role="status">{{ featureNote }} <RouterLink :to="loginTarget">进入工作台 →</RouterLink></p></template>
      </section>
      <footer class="guest-note">演示状态只保留在当前页面；进入工作台仅带入所选模板，不迁移本页修改或议事。<RouterLink :to="homeTarget">返回产品介绍</RouterLink></footer>
    </div>
    <nav class="demo-mobile-nav" aria-label="移动端导航"><button
      v-for="tab in hallWorkbenchTabs"
      :key="tab.panel"
      type="button"
      :aria-current="activeTab === tab.panel ? 'page' : undefined"
      @click="activeTab = tab.panel"
    ><var-icon :name="tab.icon" /><span>{{ tab.label }}</span></button></nav>
  </main>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { publicEntryTarget } from '@/utils/publicEntryNavigation'
import { guestDemoSteps, guestDemoTemplates, guestDemoAgents } from '@/constants/publicBetaDemo'
import { hallWorkbenchTabs } from '@/constants/hallWorkbenchNavigation'
import BountyActionIcon from '../juyiting/BountyActionIcon.vue'
import BountyTypedOutcomeCard from '../juyiting/BountyTypedOutcomeCard.vue'
import HallMinePage from '../juyiting/HallMinePage.vue'

const route = useRoute()
const homeTarget = computed(() => publicEntryTarget('/', route.query))
const allowedGuestDemoTemplateIds = new Set(['research', 'content', 'collaboration'])
const selectedTemplate = ref(guestDemoTemplates[0])
const selectedAgentId = ref(selectedTemplate.value.agentId)
const selectedAgent = computed(() => guestDemoAgents.find(agent => agent.id === selectedAgentId.value))
const requirement = ref(selectedTemplate.value.prompt)
const currentStep = ref(1)
const status = ref('DRAFT')
const confirmed = ref(false)
const activeTab = ref('overview')
const activeTabLabel = computed(() => hallWorkbenchTabs.find(tab => tab.panel === activeTab.value)?.label)
const workspace = ref(null)
const reply = ref('')
const messages = ref([])
const featureNote = ref('')
const terminal = computed(() => ['ACCEPTED', 'CANCELLED'].includes(status.value))
const statusLabel = computed(() => ({ DRAFT: currentStep.value === 1 ? '待填写需求' : '待确认承办', ASSIGNED: '进行中 · 示例', REVIEW: '待验收 · 示例', ACCEPTED: '已验收 · 示例', CANCELLED: '已取消 · 示例' })[status.value])
const reserved = computed(() => ['ASSIGNED', 'REVIEW'].includes(status.value) ? selectedAgent.value.quoteWen : 0)
const settled = computed(() => status.value === 'ACCEPTED' ? selectedAgent.value.quoteWen : 0)
const loginTarget = computed(() => {
  const id = selectedTemplate.value?.id
  return publicEntryTarget('/juyiting', route.query, allowedGuestDemoTemplateIds.has(id) ? { template: id } : {})
})
watch([currentStep, activeTab], async () => {
  await nextTick()
  workspace.value?.querySelector('h2')?.focus({ preventScroll: true })
  workspace.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
})
const chooseTemplate = template => {
  selectedTemplate.value = template
  selectedAgentId.value = template.agentId
  requirement.value = template.prompt
}
const start = () => { if (requirement.value.trim()) currentStep.value = 2 }
const confirmAssignment = () => { confirmed.value = true; status.value = 'ASSIGNED'; currentStep.value = 3 }
const showResult = () => { status.value = 'REVIEW'; currentStep.value = 4 }
const sendReply = () => {
  if (!reply.value.trim()) return
  messages.value.push({ role: 'user', text: reply.value.trim() }, { role: 'agent', text: '示例回复：已收到补充。这里不调用模型；请继续查看预置成果。' })
  reply.value = ''
}
const cancel = () => { status.value = 'CANCELLED'; currentStep.value = 4 }
const restart = () => {
  confirmed.value = false; status.value = 'DRAFT'; currentStep.value = 1; activeTab.value = 'overview'
  selectedAgentId.value = selectedTemplate.value.agentId
  requirement.value = selectedTemplate.value.prompt
  messages.value = []; reply.value = ''; featureNote.value = ''
}
const explainFeature = feature => {
  const label = { agents: '好汉名册与能力', library: '典籍阁', messages: '真实待办提醒', map: '厅中实景', profile: '个人中心与钱袋', help: '完整帮助与反馈' }[feature]
  featureNote.value = `${label}需进入实际工作台体验。此处未读取账号、未执行任何操作。`
}
</script>

<style scoped>
.guest-demo{--hall-surface:#fffefa;--hall-text:#242e2b;--hall-text-muted:#68716b;--hall-brand:#923f30;display:flex;width:100%;max-width:100%;min-height:100%;background:#f5f4f0;color:var(--hall-text);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;overflow-wrap:anywhere}
.guest-demo *{box-sizing:border-box;min-width:0}.guest-demo button,.guest-demo textarea{font:inherit}.guest-demo button{min-height:44px;padding:9px 14px;border:1px solid #e3e5dc;border-radius:8px;background:#fffefa;color:#242e2b;cursor:pointer}.guest-demo button:disabled{opacity:.5;cursor:not-allowed}.guest-demo button:hover:not(:disabled){background:#f6eee8}.guest-demo a{color:#923f30;text-underline-offset:4px}.guest-demo :focus-visible{outline:2px solid #923f30;outline-offset:3px}.guest-demo h2{font:500 26px/1.5 "Noto Serif CJK SC","Songti SC",serif;margin:6px 0}.guest-demo h3{margin:0 0 10px;font-size:16px}.guest-demo p{margin:8px 0 14px}.guest-demo small{font-size:12px}.muted{color:#68716b}.demo-sidebar{flex:0 0 218px;padding:24px 16px;background:#fffefa;border-right:1px solid #e3e5dc;display:flex;flex-direction:column}.demo-sidebar .demo-brand{display:flex;gap:12px;text-align:left;align-items:center;border:0;background:none;font-size:22px}.demo-brand small{display:block;color:#68716b}.demo-seal{width:40px;height:40px;background:#923f30;color:#fffefa;border-radius:10px;text-align:center;line-height:40px}.nav-caption{font-size:12px;color:#68716b;padding:20px 12px 0}.demo-sidebar nav{display:grid;gap:6px}.demo-sidebar nav button{display:flex;gap:12px;text-align:left;border:0;background:transparent}.demo-sidebar nav button[aria-current],.demo-mobile-nav button[aria-current]{background:#f6eee8;color:#923f30}.sidebar-bottom{display:grid;gap:12px;margin-top:auto;padding-top:40px;font-size:12px;color:#68716b}.demo-main{flex:1;max-width:100%;min-width:0}.demo-header{min-height:64px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 28px;border-bottom:1px solid #e3e5dc;background:#fffefa;flex-wrap:wrap}.demo-header span{color:#68716b}.demo-notice{display:flex;gap:10px;flex-wrap:wrap;padding:12px 28px;background:#f6eee8;color:#714235;font-size:12px}.demo-notice strong{white-space:nowrap}.demo-workspace{max-width:1180px;margin:auto;padding:28px}.workspace-heading>p{color:#923f30;font-size:12px;margin:0}.workspace-heading>span{color:#68716b}.matter-heading{display:flex;justify-content:space-between;gap:12px;align-items:center}.matter-heading small{color:#68716b}.status-chip{border:1px solid #d6c5a7;border-radius:20px;padding:4px 10px;color:#765c30;background:#fff9ed;font-size:12px;white-space:nowrap}.stepper{display:flex;gap:24px;flex-wrap:wrap;list-style:none;margin:24px 0;padding:0;color:#68716b;font-size:12px}.stepper li{display:flex;gap:8px;align-items:center}.stepper li>span{border:1px solid #d7d9d0;border-radius:50%;width:24px;height:24px;text-align:center;line-height:22px}.stepper .active{color:#923f30;font-weight:600}.stepper .active>span{background:#923f30;border-color:#923f30;color:white}.stepper .complete>span{background:#ebe9e2}.demo-columns{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:20px;align-items:start}.surface{padding:24px;border:1px solid #e3e5dc;border-radius:12px;background:#fffefa}.template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0}.template-card{text-align:left!important;display:grid;gap:8px}.template-card small{color:#68716b}.guest-demo button[aria-pressed="true"]{border-color:#b16e5e;background:#f6eee8}.field{display:grid;gap:8px;margin:18px 0;color:#4d524c}.field textarea{display:block;width:100%;max-width:100%;border:1px solid #d9dcd1;border-radius:8px;padding:12px;resize:vertical;background:#fff;color:#242e2b}.stage-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px}.guest-demo .primary{background:#923f30;border-color:#923f30;color:#fff}.guest-demo .primary:hover:not(:disabled){background:#7a3327}.requirement-copy{padding:12px;background:#f3f3ed;border-radius:8px;white-space:pre-wrap}.section-title{display:flex;align-items:center;gap:10px;margin-bottom:12px}.section-title h3{margin:0}.section-title h3 small{font-weight:400;color:#68716b}.section-title :deep(.bounty-action-icon){width:28px;height:28px}.agent-list{display:grid;gap:10px}.agent-choice{display:flex;align-items:center;gap:12px;text-align:left}.agent-choice img{width:44px;height:44px;object-fit:contain;border-radius:50%;background:#ede8df}.agent-choice>span:nth-child(2){flex:1;display:grid;gap:2px}.agent-choice small{display:block;color:#68716b}.agent-choice strong small{display:inline;color:#923f30}.quote-note{color:#765c30;font-size:12px;margin-top:16px!important}.matter-aside h3{font-size:14px}.matter-aside dl{margin:0 0 22px}.matter-aside dl>div{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.matter-aside dt{color:#68716b}.matter-aside dd{margin:0}.matter-aside p{font-size:12px}.matter-aside .cancel-action{width:100%;margin-bottom:18px}.discussion-messages{display:grid;gap:12px;max-height:380px;overflow:auto}.discussion-messages article{padding:12px;border-radius:10px;white-space:pre-wrap}.user-message{margin-left:24px;background:#f3f3ed}.agent-message{margin-right:24px;background:#f2faf5;border:1px solid #b8d4c6}.discussion-messages small{color:#68716b}.discussion-messages p{margin-bottom:0}.reply-form{border-top:1px solid #e3e5dc;margin-top:18px}.result-card{padding:18px;background:#f3f3ed;border-radius:8px}.result-card>small{display:block;margin-top:6px;color:#68716b}.result-card li{margin:8px 0}.receipt{padding:12px;color:#2e6854;background:#edf5ee;border-radius:8px}.result-stage .muted{margin-top:16px}.resources-stage{max-width:820px}.empty-state{padding:24px;color:#68716b;background:#f3f3ed;border-radius:8px}.feature-note{margin:0 16px 20px}.guest-note{padding:0 28px 24px;color:#59645e;font-size:12px}.demo-mobile-nav{display:none}
@media(max-width:1100px){.demo-columns{grid-template-columns:minmax(0,1fr)}.matter-aside{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}.matter-aside h3,.matter-aside>p,.matter-aside>.cancel-action{grid-column:1/-1}.matter-aside dl{margin-bottom:8px}}
@media(max-width:760px){.demo-sidebar{display:none}.demo-main{padding-bottom:calc(64px + env(safe-area-inset-bottom))}.demo-header,.demo-notice{padding:12px 16px}.demo-workspace{padding:20px 16px}.guest-demo h2{font-size:23px}.surface{padding:18px}.template-grid{grid-template-columns:1fr}.template-card{gap:3px}.stepper{gap:10px;justify-content:space-between}.stepper li{gap:5px}.stepper li>span{width:20px;height:20px;line-height:18px}.matter-heading{align-items:flex-start;flex-direction:column;gap:5px}.demo-mobile-nav{position:fixed;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:6px 8px calc(6px + env(safe-area-inset-bottom));background:#fffefa;border-top:1px solid #e3e5dc;z-index:5}.demo-mobile-nav button{display:grid;justify-items:center;gap:2px;border:0;background:transparent;padding:5px;font-size:12px}.guest-note{padding:0 16px 16px}.stage-actions .primary{width:100%}.demo-workspace :deep(.hall-mine-page){padding:0 0 20px}.matter-aside{display:block}}
</style>

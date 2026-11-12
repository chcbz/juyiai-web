// Synthetic examples only. Keep template IDs stable for the existing sign-in handoff.
export const guestDemoSteps = [
  {
    'id': 1,
    'label': '提出需求'
  },
  {
    'id': 2,
    'label': '确认承办'
  },
  {
    'id': 3,
    'label': '议事'
  },
  {
    'id': 4,
    'label': '成果与验收'
  }
]

export const guestDemoAgents = [
  {
    'id': 'wuyong',
    'name': '吴用',
    'role': '资料研究与方案梳理',
    'quoteWen': 13
  },
  {
    'id': 'xiaorang',
    'name': '萧让',
    'role': '文案与交付说明',
    'quoteWen': 18
  },
  {
    'id': 'likui',
    'name': '李逵',
    'role': '代码与工具执行',
    'quoteWen': 16
  }
]

export const guestDemoTemplates = [
  {
    'id': 'research',
    'eyebrow': '资料研究（智囊调研）',
    'title': '把分散的信息整理成可执行的结论',
    'prompt': '比较三种市场进入方案，给出风险、证据和下一步建议。',
    'result': {
      'title': '市场进入研究简报',
      'summary': '包含方案对比、关键证据、风险清单和可直接复用的决策模板。',
      'items': [
        '三种方案对比表',
        '证据与来源清单',
        '本周行动建议'
      ]
    },
    'agentId': 'wuyong',
    'sampleReply': '我会按方案、依据、风险和建议整理对比。下面的内容是预置示例；真实事项需要结合你提供的资料核对。'
  },
  {
    'id': 'content',
    'eyebrow': '内容生产（文案工坊）',
    'title': '从一个主题到一套可发布内容',
    'prompt': '围绕新品发布，准备一篇长文、三条短帖和一份发布检查表。',
    'result': {
      'title': '新品发布内容包',
      'summary': '一套可编辑、可复用的发布素材，减少重复起草和多人对齐成本。',
      'items': [
        '发布长文初稿',
        '三条渠道短帖',
        '发布前检查表'
      ]
    },
    'agentId': 'xiaorang',
    'sampleReply': '我会先统一受众和信息主线，再整理长文、短帖与检查表。下面可以补充要求，或查看预置的交付示例。'
  },
  {
    'id': 'collaboration',
    'eyebrow': '项目与代码协作（工坊协作）',
    'title': '让需求、实现和验收在同一条线上推进',
    'prompt': '为一个新功能拆分任务、评估实现方案，并整理可验收的交付说明。',
    'result': {
      'title': '功能协作交付包',
      'summary': '团队可继续编辑的任务分解、实现说明和验收清单。',
      'items': [
        '任务分解与负责人建议',
        '实现步骤与风险提示',
        '验收与交接清单'
      ]
    },
    'agentId': 'likui',
    'sampleReply': '我会先明确范围与验收点，再整理实现步骤和风险。示例不连接代码仓，也不会修改或部署任何程序。'
  }
]

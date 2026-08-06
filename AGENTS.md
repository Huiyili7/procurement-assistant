# UI 设计指南

> **设计类型**: App 设计（应用架构设计）
> **确认检查**: 本指南适用于可交互的应用/网站/工具。

> ℹ️ Section 1-2 为设计意图与决策上下文。Code agent 实现时以 Section 3 及之后的具体参数为准。

## 1. Design Archetype (设计原型)

### 1.1 内容理解

- **目标用户**: xTool 机械部工程师（需求提出者）、采购执行人，日常办公使用，需要高效完成采购提报和任务处理
- **核心目的**: 为研发工程师提供便捷的对话式采购需求提报入口，为采购执行人提供任务管理平台，实现自动化采购需求流转
- **期望情绪**: 专业、高效、可信、清爽，让研发采购流程像聊天一样简单
- **需避免的感受**: 复杂、繁琐、混乱、低效率，避免过度装饰干扰工作

### 1.2 设计语言

- **Aesthetic Direction**: 企业级工具应用，采用现代简约的专业风格，保持清晰的信息层级，聚焦核心任务
- **Visual Signature**: 
  1. 沉稳工业蓝主色调，传递专业信任感
  2. 清晰的卡片分层，突出对话和任务信息
  3. 适度圆角和柔和阴影，保持现代感但不过度装饰
  4. 紧凑但不拥挤的信息密度，适合数据列表和状态展示
- **Emotional Tone**: 专业高效 — 服务于企业内部研发采购流程，需要体现工程领域的专业性和流程把控能力
- **Design Style**: Soft Blocks 柔色块 — 后台管理系统需要清晰的区块划分，柔色块层次提供良好可读性，同时保持专业感
- **Application Type**: Admin（后台管理系统）- 多角色任务管理，需要侧边栏导航和列表展示

## 2. Design Principles (设计理念)

1. **效率优先**: 让工程师快速提报需求，让采购执行人快速处理任务，信息层级清晰，减少点击次数
2. **专业可信**: 配色和排版体现企业内部系统的专业性，建立用户对流程的信任感
3. **状态清晰**: 采购状态流转是核心，每个状态必须有清晰的视觉区分，突出待处理和超时任务
4. **对话友好**: 需求收集采用对话式交互，聊天界面需要有清晰的区分度和良好的可读性
5. **响应及时**: 每个交互都有明确的视觉反馈，校验错误即时提示，进度一目了然

## 3. Color System (色彩系统)

**配色设计理由**：机械研发采购系统需要传递专业和信任感，选择沉稳的工业蓝作为主色，低饱和度背景减轻长时间使用的视觉疲劳，状态色清晰区分不同采购阶段。

### 3.1 主题颜色

| 角色               | CSS 变量               | Tailwind Class            | HSL 值    
| ------------------ | ---------------------- | ------------------------- | ---------- | 
| bg                 | `--background`         | `bg-background`           | `hsl(215 25% 97%)` |
| card               | `--card`               | `bg-card`                 | `hsl(0 0% 100%)` |
| text               | `--foreground`         | `text-foreground`         | `hsl(215 45% 15%)` |
| textMuted          | `--muted-foreground`   | `text-muted-foreground`   | `hsl(215 20% 45%)` |
| primary            | `--primary`            | `bg-primary`              | `hsl(210 92% 45%)` |
| primary-foreground | `--primary-foreground` | `text-primary-foreground` | `hsl(0 0% 100%)` |
| accent             | `--accent`             | `bg-accent`               | `hsl(210 30% 95%)` |
| accent-foreground  | `--accent-foreground`  | `text-accent-foreground`  | `hsl(215 45% 15%)` |
| border             | `--border`             | `border-border`           | `hsl(215 20% 88%)` |

### 3.2 Sidebar 颜色（仅当使用 Sidebar 导航时定义）

| 角色                       | CSS 变量                       | Tailwind Class                    | HSL 值     | 设计说明                         |
| -------------------------- | ------------------------------ | --------------------------------- | ---------- | -------------------------------- |
| sidebar                    | `--sidebar`                    | `bg-sidebar`                      | `hsl(215 40% 18%)` | Sidebar 背景色，深蓝底色形成对比 |
| sidebar-foreground         | `--sidebar-foreground`         | `text-sidebar-foreground`         | `hsl(210 20% 90%)` | Sidebar 文字色，对比度 ≥ 4.5:1   |
| sidebar-primary            | `--sidebar-primary`            | `bg-sidebar-primary`              | `hsl(210 92% 45%)` | 激活态背景色，与主色保持一致     |
| sidebar-primary-foreground | `--sidebar-primary-foreground` | `text-sidebar-primary-foreground` | `hsl(0 0% 100%)` | 激活态文字色，白色对比度充足     |
| sidebar-accent             | `--sidebar-accent`             | `bg-sidebar-accent`               | `hsl(215 35% 25%)` | Hover 态背景，深蓝底色上浅化     |
| sidebar-accent-foreground  | `--sidebar-accent-foreground`  | `text-sidebar-accent-foreground`  | `hsl(210 20% 90%)` | Hover 态文字保持浅色              |
| sidebar-border             | `--sidebar-border`             | `border-sidebar-border`           | `hsl(215 30% 30%)` | Sidebar 边框，融入背景但可见     |
| sidebar-ring               | `--sidebar-ring`               | `ring-sidebar-ring`               | `hsl(210 92% 45%)` | 聚焦环颜色与主色一致              |

### 3.4 语义颜色（可选）

| 状态 | 颜色值 | 用途 |
| ---- | ------ | ---- |
| 待采购 | `hsl(36 100% 50%)` | 橙色，提醒处理 |
| 采购中 | `hsl(210 92% 45%)` | 蓝色，表示进行中 |
| 待收货 | `hsl(150 80% 40%)` | 绿色，接近完成 |
| 已完成 | `hsl(160 85% 35%)` | 深绿，完成状态 |
| 已取消 | `hsl(0 0% 60%)` | 灰色，取消状态 |
| 人工处理中 | `hsl(290 70% 50%)` | 紫色，标识特殊状态 |
| 超时/错误 | `hsl(0 85% 50%)` | 红色，突出超时任务 |

**对比度检查**：所有状态标签文字在白色背景上对比度均 ≥ 4.5:1，满足 WCAG 标准。

## 4. Typography (字体排版)

- **Heading**: 思源黑体 + Inter + system-ui
- **Body**: 思源黑体 + Inter + system-ui
- **字体导入**: 使用系统字体栈，无需引入外部字体

**排版层级**:
- 页面标题: `text-2xl font-bold`
- 区块标题: `text-lg font-semibold`
- 正文: `text-base` (16px)
- 次要文字/列表辅助信息: `text-sm text-muted-foreground`
- 标签/小字: `text-xs`
- 行高: 正文 `leading-relaxed`, 标题 `leading-tight`

## 5. Layout Strategy (布局策略)

### 5.1 结构方向

**导航策略**：功能模块分为四大页面（采购提交、我的采购、任务管理、需求详情），角色权限清晰，功能模块较多需要持久导航 → 采用侧边栏布局，桌面端固定侧边栏，移动端折叠为抽屉。

**页面架构特征**：
- 数据密集型后台应用，需要适度紧凑布局提高信息密度
- 左侧侧边栏导航，右侧主内容区独立滚动
- 列表页采用筛选区 + 列表区结构，详情页采用信息卡片分组展示
- 对话式需求收集页左侧对话区 + 右侧进度预览区，桌面端双栏布局，移动端单列堆叠

### 5.2 响应式原则

**断点策略**:
- 桌面端 (>1024px): 显示完整侧边栏，双栏布局（对话+进度）
- 平板 (768px-1024px): 侧边栏可折叠，单栏布局
- 移动端 (<768px): 侧边栏默认折叠为抽屉，所有内容单列展示，进度区放在对话区下方

**内容密度**:
- 移动端单列展示，增大可点击区域最小 48px
- 桌面端双栏/多列展示，提高信息展示效率
- 表格列表在移动端横向滚动，保持数据完整性

**最大宽度**:
- 后台整体容器 `max-w-[1600px]` 居中，充分利用大屏幕空间
- 表单/对话区域限制 `max-w-2xl` 保持良好阅读宽度

## 6. Visual Language (视觉语言)

**形态特征**:
- 柔色块分层 — `rounded-lg` (8px) 圆角，卡片 `shadow-sm` 柔和阴影
- 区块之间用留白和细微边框分隔，不使用强烈对比
- 对话气泡区分用户消息和机器人消息：用户消息 `bg-primary text-primary-foreground`，机器人消息 `bg-card border border-border`
- 状态标签采用胶囊形状 `rounded-full`，清晰标识不同采购状态

**装饰策略**:
- 极简设计，不使用额外装饰元素
- 仅在页面空白处可以使用极淡的蓝色几何装饰点缀，不干扰内容阅读
- 通过卡片阴影、色块层次建立视觉深度，不依赖装饰图片

**动效原则**:
- 快速响应，动效时长 150-200ms，营造干脆利落的办公体验
- 侧边栏展开/折叠使用平滑过渡
- 悬停状态有明确背景色变化，点击反馈明显
- 新消息插入有轻微淡入动画，不干扰当前操作

**可及性保障**:
- ✅ 正文文字对比度 ≥ 7:1，满足 WCAG AA+ 标准
- ✅ 大号标题对比度 ≥ 10:1
- ✅ 状态标签对比度均 ≥ 4.5:1
- ✅ 交互元素（按钮、可点击列表项）都有明确的 hover/focus 反馈
- ✅ 焦点环可见，符合键盘可访问性要求

## 7. Backend Architecture (后端架构)

- **模块**: ProcurementModule（采购需求管理） / VisitorRecordModule（访客记录）
- **数据库**: PostgreSQL + Drizzle ORM，表 `procurement_requirement` / `procurement_status_log` / `project_info` / `visitor_record`
- **P1 新增API**: `GET /projects`(项目列表查询) / `GET /invoice-reminder`(发票提醒) / `POST /batch`(批量创建)
- **P1 新增功能**: 项目代号自动补全(F-103) / 发票要求自动提醒(F-105) / 批量物料需求(F-106)
- **飞书集成**: FeishuService（HTTP 方式直接调用飞书 Open API）
  - 多维表格写入: app_token=`AyQSb3pe2asBMes3QJYc1VyjnYc`, table_id=`tbl3DUuMgWI3r0v5`
  - 凭证: 使用自建飞书应用，appId=`cli_a97af2fb97399bb4`
- **插件实例**:
  - `send_procurement_demand_feishu_notice_1`: 采购需求飞书通知
  - `send_procurement_transfer_manual_notice_1`: 转人工经办人通知
  - `procurement_feishu_group_create_1`: 飞书群组创建
  - `procurement_demand_sync_to_bitable_1` / `procurement_demand_write_to_bitable_1`: 多维表格插件（备用，当前用FeishuService直调）
  - `procurement_info_structured_extraction_1`: 文本对话结构化提取（8字段）
  - `procurement_screenshot_info_extraction_1`: 采购截图AI识别（itemName/itemBrandModel/packageSize/annotatedQuantity/purchasePortions/platform，仅提取红框标注内容）
- **收集字段**（前端对话流程）: 物料名称/规格型号/商品链接/采购份数/项目代号/联系电话/收货地址（额外说明不在对话中提问，仅在采购单预览中可编辑）（库存核查/特殊要求/预估价格/发票要求/期望到货时间不再收集，由系统自动填默认值）
- **表单模式规格明细**: 每个商品卡片包含「商品链接 + 物料名称 + 规格明细列表」，规格明细为多行「规格型号 + 采购份数」，支持动态增删行和规格；多个商品卡片之间共享项目/物流信息，提交时同一商品的多行规格合并为一条采购记录，规格型号拼接为「型号A(份数)、型号B(份数)」格式，采购份数累加总和
- **截图识别**: 对话区支持上传采购截图（淘宝/京东等商品页），调用AI图片识别插件自动提取物料名称、规格型号、每份包含个数、用户标注的采购总数量，并自动计算采购份数。仅识别红框标注/红色箭头指向的内容，忽略未标注选项
- **物料种类自动补全**: 82个预设类别（压敏纸/防松螺母/弹簧/联轴器/仪器设备/装配工具/轴承等），输入时模糊匹配弹出建议，不在列表中的可自由输入。常量定义在 `client/src/pages/ProcurementSubmit/materialCategories.ts`
- **自动默认值**: inventoryChecked=true + inventoryChecker=当前用户, invoiceRequired=true, expectedDelivery=3天后
- **转人工逻辑**: 发飞书通知给谢绍星（含提报人信息，提示私聊联系提报人），同时创建飞书群组；前端提供飞书私聊链接 `https://applink.feishu.cn/client/chat/open?openId=ou_fc4428bea42f61ce441a8baeae4141d1` 供用户直接点击跳转
- **关键常量**: DEFAULT_ASSIGNEE = HUMAN_HANDLER_ID = `1786247695118416`（谢绍星 suda ID）
- **日期解析**: 支持"5月20号"等中文日期格式，由ProcurementService.parseDate()处理
- **多维表格字段类型**（实际飞书表格，非插件推断）:
  - Text: 申请人/购买内容
  - Number: 价格
  - DateTime: 日期
  - SingleSelect: 物料种类/归属项目/购物平台
- **访客记录**: 用户登录后自动记录访问，仅admin角色可查看访客列表
  - API: `POST /api/visitor-records`(记录访问) / `GET /api/visitor-records`(管理员查看，@CanRole(['admin']))
- **RBAC角色**: `admin`（管理员）— 可查看访客记录，前端侧边栏导航用 `<CanRole>` 控制
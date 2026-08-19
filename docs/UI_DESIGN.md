# 超人家族任务清单 UI 设计系统

## 1. Design Read

```yaml
artifact: mobile-first PWA family task app
audience: 爸爸、妈妈、6-7 岁小柚子
visual-language: 温暖克制的家庭工具，小柚子页带梦幻童趣
mode: greenfield
visual-variance: 5
motion-intensity: 3
information-density: 7
asset-dependence: 4
brand-fidelity: 6
```

## 2. 设计定位问题

### Narrative Role

- 首页：家庭任务工作台，强调逾期、今天和近期任务。
- 清单页：全局时间线，强调查找、筛选和不遗漏。
- 小柚子页：成长激励空间，强调任务完成、小红花和梦幻小精灵。
- 任务详情页：协作确认空间，强调完整信息和明确操作。

### Viewing Distance

- 主要为手机 10cm-40cm 阅读。
- 字号不追求极大，但必须舒适清楚。
- 操作按钮适合拇指点击。

### Visual Temperature

- 首页 / 清单页：温暖、清爽、可靠。
- 小柚子页：柔和、梦幻、轻微游戏感。
- 提醒页：清楚、有重点，但不制造焦虑。

### Capacity Check

- 任务卡需要完整展示备注，不能过度压缩。
- 首页需要能看逾期、今天、明天、后天、本周，但首屏不堆满。
- 首页隐藏已完成任务；清单页保留已完成任务，并以划线表现完成状态。
- 小柚子相关任务只在小柚子页展示；小柚子页已完成任务也保留划线，不隐藏。
- 小柚子登录后默认进入小柚子页，导航更简化，只保留小柚子和我的。
- 小柚子的我的页是成长摘要，不做成人设置页结构，只展示小红花、精灵等级和退出登录。
- 筛选项放入抽屉，保持主列表简洁。

## 3. Design Decisions

### Color Palette

- Background: `#F8F4EC` warm ivory
- Surface: `#FFFDF8` soft paper
- Text primary: `#24302F` deep warm green-black
- Text secondary: `#66736F`
- Primary: `#4F9D8F` calm teal
- Primary soft: `#DDEFEA`
- Accent warm: `#F2B56B` small red-flower warmth
- Accent coral: `#E86F61` overdue / urgent
- Child magic: `#9A7BEA` used lightly on 小柚子页
- Border: `#E7DED2`

### Typography

- Body: system UI stack, optimized for Chinese readability.
- Heading: same family with stronger weight, avoiding decorative fonts.
- Numeric/date labels: tabular numbers where useful.

### Spacing

- Base unit: 4px.
- Common spacing: 8 / 12 / 16 / 20 / 24.
- Mobile page horizontal padding: 16px.
- Card internal padding: 14-16px.

### Border Radius

- App containers: 12px.
- Task cards: 10px.
- Buttons and inputs: 10px.
- Small chips: 999px only for compact metadata labels.

### Shadow

- Mostly flat.
- Card elevation: subtle `0 8px 24px rgba(61, 50, 36, 0.06)`.
- Overlays: slightly stronger shadow.

### Motion

- Short, quiet transitions: 140-220ms.
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- 小柚子页的小精灵反馈可以使用轻微 bounce / glow。
- Respect reduced motion.

## 4. Component Direction

### Task Card

展示字段：

- 标题
- 完整备注
- 负责人
- 完成时间
- 优先级
- 重复规则
- 小红花奖励
- 完成 / 待确认状态

提醒规则不放在任务卡片上，只在任务详情中展示。

不展示：

- 创建人
- 历史编辑记录

视觉规则：

- 备注完整展示，不做默认折叠。
- 逾期卡片使用珊瑚色提示边或状态条。
- 待确认任务使用轻紫色或暖黄色提示。
- 待确认任务卡片内增加独立确认区域，按钮文案为 `确认并发小红花`。
- 操作按钮保持清楚，不挤压信息。
- 小红花字段只在负责人包含小柚子时出现；大人任务不显示这个字段。

### Bottom Navigation

- 首页
- 清单
- 小柚子
- 我的

### 小柚子页

- 比成人页更柔和。
- 使用小红花、星光、小精灵元素。
- 仍保持信息清楚，不做过度儿童化。

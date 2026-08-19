# 数据模型与 API

## 1. 数据模型

### users

- `id`
- `username`
- `password_hash`
- `display_name`
- `role`: `mom` / `dad` / `child`
- `avatar`
- `created_at`
- `updated_at`

### tasks

- `id`
- `title`
- `note`
- `category`: `family` / `personal` / `child_study`
- `creator_id`
- `priority`: `urgent` / `important` / `normal`
- `due_at`
- `remind_at`
- `status`: `todo` / `done` / `pending_reward`
- `completed_by`
- `completed_at`
- `reward_stars`
- `reward_status`: `none` / `pending` / `confirmed`
- `repeat_enabled`
- `repeat_rule`
- `repeat_until`
- `series_id`
- `deleted_at`
- `deleted_by`
- `created_at`
- `updated_at`

### task_owners

- `task_id`
- `user_id`

### task_occurrences

- `id`
- `task_id`
- `series_id`
- `occurrence_date`
- `due_at`
- `remind_at`
- `status`
- `completed_by`
- `completed_at`
- `override_data`
- `created_at`
- `updated_at`

### task_comments

- `id`
- `task_id`
- `user_id`
- `content`
- `created_at`
- 当前 JSON 版本会保存新评论的 `createdAt`，并兼容旧数据里的 `createdAtLabel`。
- `updated_at`

### reward_logs

- `id`
- `task_id`
- `user_id`
- `stars_change`
- `action`: `grant` / `revoke` / `adjust` / `feed_pet`
- `confirmed_by`
- `confirmed_at`
- `created_at`

### pet_state

- `id`
- `child_id`
- `level`
- `happiness`
- `stars_balance`
- `fed_today`
- `updated_at`

### reminder_logs

- `id`
- `task_id`
- `target_user_id`
- `remind_type`: `before_due` / `overdue` / `reward_pending` / `custom`
- `scheduled_for`
- `sent_at`
- `read_at`
- `status`

### audit_logs

- `id`
- `user_id`
- `entity_type`
- `entity_id`
- `action`
- `before_data`
- `after_data`
- `created_at`

## 2. API

当前代码已先实现一版 JSON 持久化 API，用于对齐前端交互、权限规则和部署前的数据安全。任务、回收站和密码哈希默认保存在 `data/` 目录；部署时可以通过 `SUPER_FAMILY_DATA_DIR` 指向持久化目录。目标数据目录为空时，首次读取会自动创建基础 JSON 文件；已有文件损坏时不会被默认数据覆盖。后续接入 Prisma/PostgreSQL 时，接口路径尽量保持不变。

所有 `/api/*` 响应都会设置 `Cache-Control: no-store, max-age=0`，避免手机、浏览器或代理缓存旧任务、旧提醒或敏感响应。
所有写入接口的 JSON 请求体限制为 64KB，超出会返回 `INVALID_JSON_BODY`，避免异常大请求影响家庭服务稳定性。

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `GET /api/me`

当前登录规则：

- 身份通过 `userId` 选择：`mom` / `dad` / `child`。
- 初始密码为 `123456`，修改后会保存为 bcrypt 哈希。
- 登录、修改密码和命令行重置密码都会忽略密码前后的空格，减少手机输入误触导致的登录失败。
- 支持在设置页修改当前身份密码；保存到 `data/user-store.json`，服务重启后不丢失。
- 修改密码后会刷新当前登录 cookie，其他旧登录 cookie 会失效。
- 成功修改密码前会自动生成一次手动备份，包含任务、账号和小精灵数据。
- 登录成功后写入带签名的 HttpOnly、SameSite=Lax cookie：`super_family_user_id`，生产环境启用 Secure。
- 连续输错密码会返回 `TOO_MANY_LOGIN_ATTEMPTS`，响应体包含 `retryAfterSeconds`，并带 `Retry-After` 响应头；真实身份按身份限速，无效身份会进入统一限速池。
- API 只通过 cookie 识别当前操作者，不接受请求头伪装身份。
- 正式部署建议设置 `AUTH_SECRET` 环境变量，用于 cookie 签名。

### 当前本地数据文件

- `SUPER_FAMILY_DATA_DIR` 可以通过环境变量、`.env.local` 或 `.env` 配置；应用和命令行数据工具都会读取它，避免页面和备份/恢复脚本使用不同数据目录。
- `data/task-store.json`：任务和回收站。
- `data/user-store.json`：密码哈希和提醒设置。
- `data/pet-store.json`：小精灵喂养进度。
- 每次写入会生成 `.bak` 和最多 10 份自动快照。
- 服务运行中如果通过命令行恢复或外部替换 JSON 文件，任务、账号和小精灵 store 会在下一次 API 读写前自动重新载入磁盘数据，避免旧内存状态覆盖恢复结果。
- `npm run data:backup` 可手动备份。
- `npm run data:check` 可检查数据结构。
- `npm run data:repair` 可预览修复异常数据。
- `npm run data:repair -- --write` 会先备份再写入修复结果。
- `npm run data:restore-latest -- task-store.json` 可从最近快照恢复。
- `npm run data:restore-manual -- list` 可查看手动备份。
- `npm run data:restore-manual -- latest` 可从最近手动备份整包恢复任务、账号和小精灵数据；恢复前会自动创建一份 `before-manual-restore` 备份。

### Tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/restore`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/uncomplete`
- `POST /api/tasks/:id/comments`
- `POST /api/tasks/:id/confirm-reward`

查询参数：

- `range`
- `date`
- `category`
- `owner`
- `creator`
- `status`
- `priority`
- `repeat`
- `search`

### Repeating Tasks

- `PUT /api/tasks/:id`
- 编辑重复任务时，请求体可携带 `updateScope: "single" | "series"`。
- `single` 表示仅编辑本次；`series` 表示同步当前和后续未完成的同系列任务。

当前实现：

- 任务可保存 `repeatWeekdays`，表示每周哪些天重复。
- 可保存 `repeatUntil`，不填表示一直重复。
- 普通重复任务被勾选完成后，后端自动生成下一次任务。
- 小柚子重复任务先进入 `pending_reward`；爸爸或妈妈确认完成后，才自动生成下一次任务。
- `pending_reward` 状态可通过取消完成恢复为 `todo`，用于处理误点。
- 取消完成时，会撤回由该次完成自动生成、且仍处于未完成且没有评论的下一次任务，减少误点造成的重复数据。
- “本次和后续”会同步标题、备注、分类、负责人、优先级、提醒、重复规则和小红花奖励，同时保留每一次任务自己的任务日期和最晚完成日期。

### Reminders

- `GET /api/reminders`
- `GET /api/settings`
- `PUT /api/settings`

当前实现：

- `GET /api/reminders` 需要登录。
- 普通任务默认提醒负责人；当前登录人只看到自己负责的逾期/到期提醒。
- 小柚子待确认任务提醒给爸爸和妈妈可见。
- 小柚子只可见自己负责的任务提醒，不显示待确认提醒。
- 返回逾期任务、今日需要提前提醒的任务和小柚子待确认任务。
- 提醒设置保存到 `data/user-store.json`。
- 首页提醒铃和提醒页会按当前身份的提醒设置过滤显示。

### Rewards

- `POST /api/tasks/:id/confirm-reward`
- `POST /api/tasks/:id/uncomplete`
- `POST /api/pet/feed`
- `GET /api/pet`

当前实现：

- 小红花余额 = 初始 12 朵 + 已确认的小柚子任务奖励 - 已喂给小精灵的鲜花。
- `GET /api/pet` 返回当前喂养进度和小红花余额。
- `POST /api/pet/feed` 每次消耗 1 朵小红花，并保存到 `data/pet-store.json`。
- 喂养后通过 SSE 推送 `pet_changed`，其他页面会自动刷新。

### Data Safety

- `GET /api/health`
- `POST /api/backups`

当前实现：

- `GET /api/health` 对未登录和非妈妈身份只返回基础存活状态。
- 妈妈调用 `GET /api/health` 时会返回当前数据目录、数据目录写入权限、手动备份状态、最近备份包含的数据文件、是否建议整理旧手动备份、任务、账号、小精灵数据文件状态，以及登录密钥是否已配置。
- `POST /api/backups` 仅妈妈可用，会创建一份手动数据备份。
- 清空回收站前会自动创建一次手动数据备份，降低误操作风险。

### Trash

- `GET /api/trash`
- `DELETE /api/trash`
- `DELETE /api/trash` 清空当前身份可管理的回收站任务，执行前自动备份当前数据。

### Realtime

- `GET /api/events`

当前实现：

- `GET /api/events` 需要登录。
- 使用 SSE 推送 `tasks_changed` 事件。
- 前端在事件流连接、重连或出错后会重新拉取一次服务端状态，减少断线期间漏刷新。
- 任意任务新增、编辑、删除、恢复、完成、取消完成、评论、小红花确认或清空回收站后广播 `tasks_changed`。
- 小精灵喂养后广播 `pet_changed`。
- 前端收到事件后重新拉取 `/api/tasks` 和 `/api/trash`。
- 目前为单 Node 进程内存事件总线；多实例部署时需要替换为数据库通知、Redis Pub/Sub 或消息队列。

## 3. 权限规则摘要

- 妈妈可操作所有任务。
- 爸爸可编辑和删除自己创建的任务。
- 小柚子只可查看自己的任务和学习计划。
- 可见成员都可完成任务。
- 爸爸和妈妈可确认小柚子奖励。
- 回收站只展示当前身份可管理的任务；妈妈可恢复/清空全部，其他身份只能恢复/清空自己创建的任务。

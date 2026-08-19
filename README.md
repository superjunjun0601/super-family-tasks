# 超人家族任务清单

手机优先的家庭任务 PWA，覆盖家庭待办、个人任务、小柚子学习计划、小红花奖励和小精灵养成。

## 当前能力

- PRD、技术方案和发布检查清单已整理在 `docs/`。
- Next.js + TypeScript + Tailwind 应用已可本地运行。
- Prisma 数据模型已保留；本地默认使用 JSON，配置 `DATABASE_URL` 后自动使用 PostgreSQL。
- PWA manifest 和轻量 service worker 已创建。
- 首页、清单、小柚子、我的、设置、回收站已具备可点击交互。
- 支持登录、退出、修改密码；登录态保存在 HttpOnly cookie，成功修改密码前会自动生成一次手动备份。
- 登录有轻量防试错保护：同一身份连续输错多次会短暂等待 1 分钟再试。
- 支持新增任务、查看详情、编辑任务、评论、完成/待确认、删除到回收站、恢复和清空回收站。
- 清空回收站前会自动创建一次手动备份，减少误操作风险。
- 支持每周指定日期重复；任务完成后自动生成下一次，小柚子任务会在爸爸/妈妈确认后生成下一次。
- 任务、回收站、密码、提醒设置和小精灵喂养进度会保存到本地 `data/`，服务重启后不会丢失。

## PWA

当前 PWA 只做基础安装体验：

- `public/manifest.webmanifest` 提供应用名称、SVG 图标、192/512 PNG 图标、主题色和竖屏显示。
- `public/sw.js` 只缓存 manifest 和图标；页面保持网络优先，避免手机上长期看到旧界面。
- API 请求不缓存，避免任务数据被旧缓存影响。
- 开发预览会主动清理旧 service worker 和 PWA 缓存，包括手机同 Wi-Fi 打开的局域网地址，减少本地调试时看到旧页面的概率。

## 本地运行

```bash
npm install
npm run app:trial-check
npm run app:preview
```

电脑本机打开：

```text
http://localhost:3035/
```

`app:preview` 默认固定使用 3035 端口；如果这个应用已经在 3035 上运行，会直接提示当前链接，不会再开一个新端口。手机试用时，让手机和电脑连同一个 Wi-Fi，然后打开命令行里显示的 `手机同 Wi-Fi` 地址。

如果浏览器链接打不开，可以先查当前运行状态：

```bash
npm run app:status
```

这个命令会检查 3035 上是不是超人家族任务清单，并重新打印电脑和手机同 Wi-Fi 的访问地址。
如果命令提示当前环境无法访问本机检查地址，但浏览器能打开打印出的地址，通常说明服务本身正常，只是当前终端环境限制了端口探测。

## 本地数据

当前版本优先保证简单稳定，数据保存到本地 JSON 文件：

- `data/task-store.json`：任务和回收站
- `data/user-store.json`：账号密码哈希和提醒设置
- `data/pet-store.json`：小精灵喂养进度

正式部署建议设置 `AUTH_SECRET` 环境变量，用于登录 cookie 签名。可以用下面命令生成：

```bash
npm run auth:secret
```

如果部署平台会替换项目目录，可以设置 `SUPER_FAMILY_DATA_DIR`，把数据放到一个持久化目录；不设置时默认继续使用项目里的 `data/`。应用和命令行数据工具都会读取环境变量，也会按 `.env.local`、`.env` 的顺序读取这个配置，避免页面和备份脚本使用不同数据目录。
如果目标数据目录是空的，应用首次读取对应数据时会自动创建基础 JSON 文件；如果文件存在但损坏，不会用默认数据覆盖，需要走备份或修复流程。

每次保存会先写入唯一临时文件并刷盘，再原子替换主 JSON，并尽量同步数据目录；恢复快照、整包恢复、重置密码和数据修复也使用同类耐久写入。保存前会自动生成 `.bak` 和最多 10 份时间戳快照。读取顺序是：主文件、`.bak`、最近快照、初始数据。

查看快照：

```bash
npm run data:list -- task-store.json
npm run data:list -- user-store.json
npm run data:list -- pet-store.json
```

手动备份当前数据：

```bash
npm run data:backup
```

备份会放在数据目录的 `manual-backups/时间戳/`，适合部署前、搬机器前或大改前留一份；如果极短时间内出现同名备份目录，会自动追加序号，不覆盖旧备份。备份文件和 README 写入后也会尽量刷盘，降低刚备份完就断电时的风险。
妈妈账号也可以在应用里进入 `我的 -> 设置 -> 数据安全`，查看数据状态、确认数据目录可写、查看手动备份数量和最近备份，并点击手动备份。

检查当前数据：

```bash
npm run data:check
```

如果账号还在使用默认密码 `123456`，或手动备份太久没做、最近备份缺少关键数据文件、手动备份积累太多，数据自检会提醒，但不会阻断应用运行，也不会自动删除旧备份。

检查应用健康状态：

```bash
npm run app:doctor
```

这会同时检查数据目录读写权限、数据文件、必要资源和 TypeScript 类型。

交给家人试用前的一键检查：

```bash
npm run app:trial-check
```

它会检查真实数据和代码健康，再用临时数据跑完整冒烟测试，最后确认临时测试没有污染类型配置。

自动跑一遍登录、修改密码、实时更新、任务校验、创建任务、评论、小柚子待确认、小红花、小精灵喂养、权限、提醒设置、重复任务、回收站、手动备份和整包恢复链路：

```bash
npm run app:smoke
```

这个命令使用临时数据目录和独立端口，不会改真实任务数据。
成功后会清理临时数据和 `.next-smoke` 缓存；失败时会保留现场方便排查。

正式部署前运行包含构建的检查：

```bash
npm run app:release-check
```

这个命令会先跑试用完整检查，再使用独立的 `.next-doctor-build` 缓存目录做生产构建检查；它不会打乱当前 `app:preview` 预览缓存，也不会生成正式启动用的 `.next`。

生成正式构建：

```bash
npm run app:build
```

这个命令会先确认 3035 上没有正在运行的超人家族任务清单，再做隔离健康检查，最后生成 `npm run app:start` 使用的 `.next`。如果本地还开着 `npm run app:preview` 或 `npm run app:start`，脚本会提示先停掉再正式构建。

正式启动：

```bash
npm run app:start
```

这个命令会检查 `.next/BUILD_ID`、数据目录读写权限和端口占用，再启动 `next start`。默认端口是 3035，也可以用 `SUPER_FAMILY_START_PORT` 或 `PORT` 指定。

### 云服务器部署

项目提供了 Docker Compose 配置。准备 Linux 云服务器、域名和 HTTPS 后，在服务器项目目录执行：

```bash
cp .env.production.example .env.production
# 填写 AUTH_SECRET，并把 Caddyfile 中的 tasks.example.com 换成真实域名
docker compose up -d --build
```

详细步骤见 `docs/DEPLOYMENT.md` 的“云服务器推荐方式：Docker Compose”。

预览修复异常数据：

```bash
npm run data:repair
```

确认写入修复：

```bash
npm run data:repair -- --write
```

修复写入前会自动生成一份 `data/manual-backups/时间戳-before-repair/` 备份。

恢复最近快照：

```bash
npm run data:restore-latest -- task-store.json
```

也可以把 `task-store.json` 换成 `user-store.json` 或 `pet-store.json`。
恢复前会自动保留一份带时间戳的 `.before-restore` 文件。
服务运行中恢复或替换 JSON 文件后，下一次 API 读写会自动重新载入磁盘数据。

查看和恢复手动备份整包：

```bash
npm run data:restore-manual -- list
npm run data:restore-manual -- latest
```

手动备份恢复会把任务、账号、小精灵数据一起恢复；恢复前会自动再生成一份 `before-manual-restore` 备份，方便反悔。

忘记密码时重置指定身份密码：

```bash
npm run user:reset-password -- mom 123456
```

身份 id 分别是：`mom`（妈妈）、`dad`（爸爸）、`child`（小柚子）。
重置前会自动生成一次手动备份，并额外保留一份带时间戳的 `.before-password-reset` 文件。

## Vercel + PostgreSQL

Vercel 部署时不要依赖项目目录里的 JSON 文件。配置 `DATABASE_URL` 后，任务、回收站、账号密码、提醒、小精灵和评论会写入 PostgreSQL；前端使用约 30 秒轮询刷新，不依赖单机内存 SSE。

首次部署前，在本地保留当前数据并准备数据库：

```bash
cp .env.example .env
npm run prisma:push
npm run db:import-json
```

然后把项目导入 Vercel，并设置：

```text
DATABASE_URL
AUTH_SECRET
```

Vercel 的 Build Command 使用 `npm run vercel-build`。完整步骤见 `docs/DEPLOYMENT.md`。

## 文档

- `docs/PRD.md`
- `docs/TECHNICAL_DESIGN.md`
- `docs/DATA_AND_API.md`
- `docs/UI_DESIGN.md`
- `docs/DEPLOYMENT.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/TRIAL_GUIDE.md`

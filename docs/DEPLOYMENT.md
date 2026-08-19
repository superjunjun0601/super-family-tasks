# 部署说明

推荐使用 Vercel + PostgreSQL：Next.js 前端和 API 部署到 Vercel，任务等业务状态保存到 PostgreSQL。项目仍保留 JSON fallback，方便本地开发和云服务器部署。

## 0. Vercel 推荐部署

### 0.1 准备 PostgreSQL

可以使用 Vercel Marketplace 中的 Neon、Supabase 等 PostgreSQL 服务。创建数据库后复制连接字符串，运行时使用带 `sslmode=require` 的连接地址。

### 0.2 把当前本地数据导入数据库

在项目根目录配置数据库连接：

```bash
cp .env.example .env
```

填写 `DATABASE_URL` 后执行：

```bash
npm run prisma:push
npm run db:import-json
```

导入脚本会读取当前 `data/task-store.json`、`data/user-store.json` 和 `data/pet-store.json`，不会修改原 JSON 文件。重复执行会更新对应的数据库状态。

### 0.3 部署到 Vercel

将项目导入 Vercel，设置以下环境变量：

```text
DATABASE_URL
AUTH_SECRET
```

Build Command 使用：

```bash
npm run vercel-build
```

项目已经提供 `vercel.json`。部署后打开 Vercel 域名，使用原来的三个账号登录验证任务、密码、提醒和小精灵数据。

### 0.4 日常数据安全

Vercel 不提供可靠的本地文件写入，因此正式环境的备份应使用 PostgreSQL 提供商的备份/分支功能，或定期导出 `AppState` 表。应用里的“手动备份”在 PostgreSQL 模式下只返回数据库持久化提示，不会把备份写入 Vercel 临时磁盘。

## 1. 云服务器 JSON 部署

## 1. 部署前准备

1. 确认本地数据没问题。

```bash
npm run app:doctor
```

2. 手动备份一次。

```bash
npm run data:backup
```

3. 准备正式环境变量。先生成登录密钥：

```bash
npm run auth:secret
```

然后至少设置：

```bash
AUTH_SECRET="一段足够长的随机字符串"
```

`AUTH_SECRET` 用来签名登录 cookie。换服务器、重启服务都没关系，但正式使用后不要随便改；改了以后大家需要重新登录。

如果代码目录会在发布时被替换，建议同时设置：

```bash
SUPER_FAMILY_DATA_DIR="/var/lib/super-family-tasks"
```

不设置时，应用默认把数据保存在项目目录的 `data/`。应用和命令行数据工具都会读取环境变量，也会按 `.env.local`、`.env` 的顺序读取 `SUPER_FAMILY_DATA_DIR`，确保备份、恢复、自检和页面使用同一个数据目录。
如果目标数据目录是空的，应用首次读取对应数据时会自动创建基础 JSON 文件。
部署账号必须能读写这个目录；可以用 `npm run app:doctor` 或妈妈账号里的 `我的 -> 设置 -> 数据安全` 查看写入权限是否正常。

## 2. 服务器运行

安装依赖：

```bash
npm install
```

发布前检查：

```bash
npm run app:release-check
```

这个检查会先跑试用完整检查，再使用独立的 `.next-doctor-build` 缓存目录做生产构建验证；适合在本地预览还开着时做发布前验证，它不会生成 `npm run app:start` 需要的正式 `.next`。

正式构建：

```bash
npm run app:build
```

这个命令会先确认默认端口上没有正在运行的超人家族任务清单，再跑上面的隔离健康检查，最后生成真正用于启动的 `.next`。如果本地还开着 `npm run app:preview` 或 `npm run app:start`，脚本会提示先停掉再正式构建。

启动：

```bash
npm run app:start
```

`app:start` 会检查正式构建产物、数据目录读写权限和端口占用；如果缺少 `.next/BUILD_ID`，会提示先运行 `npm run app:build`。默认端口是 3035，也可以通过 `SUPER_FAMILY_START_PORT` 或 `PORT` 指定。

如果服务器前面有 Nginx 或宝塔面板，把域名反向代理到 `http://127.0.0.1:3035`。

## 2.1 云服务器推荐方式：Docker Compose

项目根目录提供了 `Dockerfile`、`docker-compose.yml` 和 `Caddyfile`，可以部署到一台普通 Linux 云服务器。

准备条件：

- 一台能运行 Docker 的 Linux 云服务器。
- 一个域名，并把 A 记录指向服务器公网 IP。
- 云服务器安全组放行 TCP `80` 和 `443`。

在服务器的项目目录执行：

```bash
cp .env.production.example .env.production
```

运行 `npm run auth:secret` 生成随机密钥，把输出填入 `.env.production` 的 `AUTH_SECRET`。再将 `Caddyfile` 中的 `tasks.example.com` 换成真实域名。

把本地现有的 `data/` 上传到服务器项目目录，再启动：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

之后通过 `https://你的域名/` 访问。

应用数据挂载在服务器的 `./data`，镜像重建不会清空数据。Caddy 负责把 HTTPS 请求转发给应用；部署完成后要保留 Caddy 的 Docker volume，避免证书状态丢失。

日常备份：

```bash
docker compose exec app npm run data:backup
```

更新代码：

```bash
docker compose up -d --build
```

如果服务器发布流程会替换项目目录，务必把 `data/` 改为独立持久化磁盘目录后再挂载。

## 3. 数据目录

最重要的是保住数据目录。默认是项目里的 `data/`；如果设置了 `SUPER_FAMILY_DATA_DIR`，就以那个目录为准。

- `data/task-store.json`：任务和回收站
- `data/user-store.json`：账号密码哈希和提醒设置
- `data/pet-store.json`：小精灵喂养进度
- `data/backups/`：自动快照
- `data/manual-backups/`：手动备份

部署平台如果会清空代码目录，需要把数据目录挂到持久化磁盘，或者每次发布前后手动备份/恢复。
如果 JSON 文件存在但损坏，应用不会用默认数据覆盖它，请先从备份恢复，或运行 `npm run data:repair` 查看修复建议。
如果健康检查提示数据目录不可写，先修复目录权限再继续使用，否则新增任务、修改密码、备份和清空回收站都可能失败。

PWA 只缓存 manifest 和图标，动态页面和 API 都走网络请求。这样每次发布后，手机网页或桌面 PWA 会更快拿到新版本，不容易卡在旧界面。开发预览会主动清理旧 service worker 和 PWA 缓存，包括手机同 Wi-Fi 打开的局域网地址；正式域名才注册 PWA。

## 4. 日常维护

查看健康状态：

```bash
npm run app:doctor
```

忘记密码时重置：

```bash
npm run user:reset-password -- mom 新密码
```

重置前会自动生成一次手动备份，并额外保留一份 `user-store.json.*.before-password-reset` 文件。

身份 id：

- `mom`：妈妈
- `dad`：爸爸
- `child`：小柚子

恢复最近快照：

```bash
npm run data:restore-latest -- task-store.json
```

也可以把文件名换成 `user-store.json` 或 `pet-store.json`。

恢复最近手动备份整包：

```bash
npm run data:restore-manual -- latest
```

这个命令会恢复任务、账号和小精灵数据；恢复前会自动再留一份手动备份。

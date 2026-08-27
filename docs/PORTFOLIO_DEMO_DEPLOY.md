# 面试作品版部署

这套配置用于在同一台服务器上额外跑一个“面试作品版”，和正式使用版隔离。

- 正式版数据目录：`data/`
- 作品版数据目录：`data-demo/`
- 正式版访问：继续使用原来的域名或服务器 80/443
- 作品版访问：`http://服务器IP:3036`
- 作品版默认密码：妈妈、爸爸、小柚子都是 `123456`

## 本地准备

生成或重置作品版演示数据：

```bash
SUPER_FAMILY_DATA_DIR=data-demo npm run demo:seed
```

本地预览作品版：

```bash
sudo docker-compose -f docker-compose.demo.yml -p super-family-tasks-demo up -d --build
```

打开：

```text
http://localhost:3036
```

## 服务器部署

在服务器上克隆一份独立目录：

```bash
cd ~
git clone https://github.com/superjunjun0601/super-family-tasks.git super-family-tasks-demo
cd ~/super-family-tasks-demo
```

生成作品版演示数据：

```bash
SUPER_FAMILY_DATA_DIR=data-demo npm run demo:seed
```

启动作品版：

```bash
sudo docker-compose -f docker-compose.demo.yml -p super-family-tasks-demo up -d --build
```

检查状态：

```bash
sudo docker-compose -f docker-compose.demo.yml -p super-family-tasks-demo ps
```

访问：

```text
http://服务器IP:3036
```

## 后续更新作品版代码

```bash
cd ~/super-family-tasks-demo
git pull origin main
sudo docker-compose -f docker-compose.demo.yml -p super-family-tasks-demo up -d --build
```

如果只是更新代码，不要重新运行 `demo:seed`，否则作品版演示数据会被重置。

## 重置作品版演示数据

作品版可以随时重置，不影响正式版：

```bash
cd ~/super-family-tasks-demo
SUPER_FAMILY_DATA_DIR=data-demo npm run demo:seed
sudo docker-compose -f docker-compose.demo.yml -p super-family-tasks-demo up -d --force-recreate
```

不要在正式版目录 `~/super-family-tasks` 里运行这条重置命令。

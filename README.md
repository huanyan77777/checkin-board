# 六部门互动签到板（第一版）

这是一个签到应用，

## 本地运行

```bash
node server.js
```

打开：

- `http://127.0.0.1:4318/`：手机签到页
- `http://127.0.0.1:4318/screen`：现场大屏
- `http://127.0.0.1:4318/admin`：控制台

数据存储使用 SQLite WAL，数据库位于 `DATA_DIR`，不能放在可被 Nginx 直接访问的 `public` 下。

## Linux 部署

1. 将本目录打包上传到 `/opt/checkin-board/current`。
2. 运行 `deploy/install-alinux3.sh` 安装 Node.js、创建 `checkin` 用户和数据目录；或使用 Docker Compose。
3. 创建 `/opt/checkin-board/shared/.env`：

```env
PORT=4318
DATA_DIR=/opt/checkin-board/shared/data
ADMIN_TOKEN=请替换为至少32位随机字符串
EVENT_NAME=北京邮电大学学生会骨干志愿者大会
CHECKIN_OPEN=false
```

4. 安装 `deploy/checkin-board.service`：

```bash
sudo cp deploy/checkin-board.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now checkin-board
curl http://127.0.0.1:4318/health
```

5. 为 `checkin.你的域名` 添加 DNS A 记录，复制 `deploy/nginx-checkin.conf.example` 为 Nginx 配置，替换域名和证书路径，检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

6. 在手机移动网络和微信内分别打开签到地址，确认 HTTPS、提交和大屏实时更新。

## Docker 部署

```bash
cp .env.example .env
openssl rand -hex 32   # 将结果写入 .env 的 ADMIN_TOKEN
docker compose up -d --build
docker compose logs -f checkin
curl http://127.0.0.1:4318/health
```

Docker 数据保存在命名卷 `checkin_data` 中。升级时执行 `docker compose build --no-cache && docker compose up -d`，回滚时保留上一份镜像标签。

如果使用 `/opt/checkin-board/shared/.env` 保存生产配置（推荐），Docker Compose 会从 `../shared/.env` 读取它；文件中的 `DATA_DIR` 应写为容器路径 `/data`，不要写宿主机路径。只有本地临时运行时才使用项目目录下的 `.env`。

## API 摘要

- `GET /api/config`：公开活动状态和大屏数据
- `GET /api/events`：SSE 实时事件流
- `POST /api/checkins`：公开签到（JSON：`name`, `department`）
- `POST /api/admin/open`、`/close`：管理员开关
- `DELETE /api/admin/checkins/:id`：撤销签到
- `GET /api/admin/export.csv`：管理员导出
- `POST /api/admin/roster`：管理员导入已规范化名单 JSON

## 安全边界

- 应用仅监听 `127.0.0.1:4318`，安全组不开放 4318。
- `ADMIN_TOKEN` 只放服务端 `.env`，不写进前端或二维码。
- WordPress 目录和数据库不参与签到数据存储。
- 活动结束后先导出数据，再关闭签到入口或停止服务。

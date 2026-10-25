# 部署、迁移与恢复

## 生产拓扑

现有 Nginx 负责 HTTPS、前端静态文件和 `/api/` 代理；Compose 运行 Flask + Gunicorn，连接现有 MySQL。服务端业务数据、会话、设备凭证摘要、内容快照和回执均在 MySQL；API 容器无需数据卷。

生产要求 MySQL 8.0+、InnoDB、utf8mb4，以及支持 `!reset` 的 Docker Compose 2.24.4+。集成测试基线为 MySQL 8.4。容器使用非 root 用户、只读文件系统、受限临时目录和两个 Gunicorn worker。

## 首次安装

1. 在现有数据库创建独立库及账号。账号只需业务库权限；迁移账号需要该库的建表、索引和修改权限，不需要全局权限。

```sql
CREATE DATABASE ctx CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE USER 'ctx_user'@'适当的来源地址' IDENTIFIED BY '独立的随机密码';
GRANT ALL PRIVILEGES ON ctx.* TO 'ctx_user'@'适当的来源地址';
```

2. 复制根目录 `.env.example` 为 `.env`，设置真实数据库 URL、域名和稳定密钥。可以用 `python -c "import secrets; print(secrets.token_urlsafe(48))"` 生成密钥。数据库用户名、密码中的 URL 特殊字符需要百分号编码。
3. 设置 `CTX_ENV=production`、`PUBLIC_URL=https://实际域名`、`TRUSTED_HOSTS=实际域名` 和 `PROXY_HOPS=1`。缺少关键参数、使用示例密钥或使用 SQLite 时应用拒绝启动。
4. 构建后端，单独运行迁移，再启动服务：

```sh
docker compose build api
docker compose run --rm api flask --app ctx_server:create_app db upgrade
docker compose up -d api
docker compose ps
docker compose logs --tail 100 api
```

应用入口只进行有限次数连接检查，不自动迁移。迁移失败时先处理错误，不能通过跳过迁移启动业务服务。

5. 构建管理端：在 `frontend` 中执行 `npm ci`、`npm run build`，将 `frontend/dist` 的内容放入 Nginx 静态目录。也可在仓库根目录使用固定 Node 镜像导出：

```sh
docker build -f frontend/Dockerfile --target export --output type=local,dest=dist/frontend .
```

6. 将 `deploy/nginx.conf.example` 中域名、证书路径、静态目录及上游地址替换为真实值；运行现有环境的 `nginx -t`，通过后重载 Nginx。进入 HTTPS 页面注册，并使用模拟设备完成一次发布。

## 两种网络接入方式

### Nginx 和 MySQL 位于宿主机

使用默认 `compose.yaml`。API 只发布在 `127.0.0.1:8000`；Nginx 代理到该地址。容器通过 `host.docker.internal` 连接宿主机 MySQL。

MySQL 需要监听容器能够访问的宿主机地址，例如 Docker 网桥地址，并允许对应来源连接。宿主机的 `127.0.0.1` 仅属于宿主机，容器不能通过 `host.docker.internal` 访问仅监听回环地址的 MySQL。

### Nginx 和 MySQL 位于 Docker

将三个服务接入同一个受信网络；在 `.env` 设置现有网络名 `CTX_SHARED_NETWORK`，数据库 URL 使用现有 MySQL 服务名：

```sh
docker compose -f compose.yaml -f compose.network.yaml build api
docker compose -f compose.yaml -f compose.network.yaml run --rm api flask --app ctx_server:create_app db upgrade
docker compose -f compose.yaml -f compose.network.yaml up -d api
```

该覆盖配置取消宿主机端口发布，Nginx 上游改为 `http://ctx-api:8000`。所有后续运行、迁移和运维命令都要保留相同的两个 `-f` 参数。

后端信任一个代理跳数，Nginx 配置覆盖传入的转发头。生产 API 只能由可信 Nginx 和运维健康检查访问；不得把 API 端口直接暴露公网。

## 常用配置

| 变量 | 默认值或要求 |
|---|---|
| `CTX_ENV` | 本地 `development`；生产必须 `production` |
| `DATABASE_URL` | 生产 `mysql+pymysql://...`，包含独立库名 |
| `SECRET_KEY` | 生产至少 32 字符，固定保存并备份 |
| `PUBLIC_URL` | 生产 HTTPS 公开地址 |
| `TRUSTED_HOSTS` | 允许的主机名，逗号分隔，不含协议 |
| `PROXY_HOPS` | 本地 0；生产单层 Nginx 为 1 |
| `WEB_WORKERS` | 2，每 worker 两个线程 |
| `DB_POOL_SIZE` | 每 worker 5，允许额外 2 个连接 |
| `API_BIND` / `API_PORT` | 宿主机模式默认 `127.0.0.1:8000` |
| `CTX_ENV_FILE` | Compose 服务环境文件，默认 `.env` |

会话标识、设备凭证、配对码和验证码使用 `SECRET_KEY` 参与摘要。更换密钥会使旧会话、设备凭证和配对码失效，需要重新登录与配对；恢复时必须使用与数据库备份匹配的密钥。

## 账号与定期清理

```sh
docker compose run --rm api flask --app ctx_server:create_app accounts create teacher
docker compose run --rm api flask --app ctx_server:create_app accounts reset-password teacher
docker compose run --rm api flask --app ctx_server:create_app accounts disable teacher
docker compose run --rm api flask --app ctx_server:create_app accounts enable teacher
docker compose run --rm api flask --app ctx_server:create_app cleanup
```

密码通过隐藏输入读取。重置密码撤销全部浏览器会话；停用账号同时禁止设备认证。可将 `cleanup` 加入现有运维调度，每日清理过期临时记录；发布版本和回执历史不会被清理。

## 更新与回退

1. 记录当前 Git 版本、后端镜像 ID 和前端静态文件版本，备份数据库与 `.env`。
2. 暂停写入入口，构建新镜像，用新镜像单独执行 `db upgrade`。
3. 更新后端，确认健康检查通过，再切换完整的前端构建目录。
4. 通过真实 HTTPS 地址检查登录、设备列表和模拟同步，再恢复入口。

`pool_pre_ping` 会在连接取用时检查失效连接；连接检查有限重试。执行中的事务断线返回错误，不自动重放可能已经提交的写请求。客户端按幂等键或原回执重试。

应用回退优先使用兼容数据库结构的旧镜像。数据库回退要先在隔离环境验证；本项目初始迁移的 `downgrade base` 会删除所有业务表，不能用于保留数据的生产回滚。

## 数据库备份与恢复

使用独立、受限权限的 MySQL 客户端配置文件保存连接信息，避免把生产密码放在命令参数中。Linux 示例：

```ini
[client]
host=数据库地址
user=备份账号
password=备份密码
default-character-set=utf8mb4
```

备份业务库并单独安全保存 `.env`：

```sh
mysqldump --defaults-extra-file=/root/.ctx-db.cnf --single-transaction --no-tablespaces --hex-blob --set-gtid-purged=OFF --result-file=/backup/ctx.sql ctx
```

先向空的隔离库恢复，核对 `alembic_version`、账号、资源、发布和已应用状态，再决定生产切换：

```sh
mysql --defaults-extra-file=/root/.ctx-restore.cnf ctx_restore < /backup/ctx.sql
```

Windows 使用 `mysqldump --result-file=...`，避免旧 PowerShell 文本重定向改变 SQL 编码。恢复可通过 MySQL 客户端的 `source` 命令执行 SQL 文件。

## 健康检查与故障定位

- `/api/v1/health/live`：进程能够处理请求。
- `/api/v1/health/ready`：数据库可访问，基础业务表存在。
- 生产健康检查必须经过 HTTPS，或在受信内网携带正确 Host 和 `X-Forwarded-Proto: https`；Compose 已配置内网检查。
- API 日志包含请求 ID、路由、状态和耗时，不输出请求体、Cookie、密码或设备凭证。
- 查询故障时关联响应的 `X-Request-ID` 与日志。设备“在线”和“已应用”相互独立，应分别检查。

当前机器 Docker Desktop 启动失败，因此镜像构建及 Compose 运行验收尚未通过；已完成的实际检查记录见 `IMPLEMENTATION.md`。独立 MySQL 验证不代表 Docker 部署已经通过。

# CTX-Server

ClassTopLand Next 的账号、设备、课表与展示配置管理服务。提供 Flask API、Vue 管理端、不可变发布历史和可持久化的模拟设备。

首版支持用户名密码注册、图形验证码、设备配对和分组、原生 JSON 档案导入、网页课表档案新建与编辑、课程条／外观／桌面倒计时配置、发布预览、双通道应用回执和回滚。每个账号的数据独立；设备离线时保留最后成功应用的内容。

## 本地启动

需要 Python 3.13+、Node.js 24、MySQL 8.0+。Python 3.14 和 MySQL 8.4.6 已在本机验证。SQLite 只用于快速开发和非并发测试，不能替代 MySQL 验收。

在仓库根目录执行以下 PowerShell 命令：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-deps --no-build-isolation -e backend
```

开发锁文件同时固定 setuptools 和 wheel，安装本项目时不需要重新解析运行依赖。

配置一个已创建的开发数据库，然后执行迁移并启动 API：

```powershell
$env:CTX_ENV = 'development'
$env:DATABASE_URL = 'mysql+pymysql://ctx_user:your-password@127.0.0.1:3306/ctx_dev?charset=utf8mb4'
$env:SECRET_KEY = 'development-only-change-before-deploy'
Set-Location backend
..\.venv\Scripts\python.exe -m flask --app ctx_server:create_app db upgrade
..\.venv\Scripts\python.exe -m flask --app ctx_server:create_app run --host 127.0.0.1 --port 5000
```

在另一个终端启动前端：

```powershell
Set-Location frontend
npm ci
npm run dev
```

打开 [本地管理端](http://127.0.0.1:5173)，注册账号，生成配对码。Vite 将 `/api/` 代理到 `127.0.0.1:5000`，浏览器不直接连接后端端口。

已有 Docker 引擎时，可先启动一次性的测试数据库：

```powershell
docker compose -f compose.test.yaml up -d --wait
```

对应数据库地址见 `backend/.env.example`。`compose.test.yaml` 使用临时内存存储，仅用于开发和测试。

## 模拟一台设备

从网页取得配对码后，在仓库根目录执行：

```powershell
.\.venv\Scripts\python.exe -m ctx_server.simulator --server http://127.0.0.1:5000 --state-dir .device-state/classroom-1 --pair ABCDEFGH2345 --once
.\.venv\Scripts\python.exe -m ctx_server.simulator --server http://127.0.0.1:5000 --state-dir .device-state/classroom-1
```

在网页导入或新建 `examples/profiles/minimal.json` 对应的课表档案、保存展示配置并发布，模拟设备会下载、保存并发送回执。状态目录包含设备凭证和最后应用内容，应保留在该设备上；同一目录不能同时运行两个模拟进程。

故障演示使用 `--block-local-edit`、`--fail-save`、`--drop-receipt`、`--repeat-receipt` 或 `--offline`。去掉故障参数并重新运行即可验证恢复。`--drop-receipt` 保留待发送回执，下一次正常启动会先补发。

## 测试和构建

```powershell
# 快速测试；MySQL 专项会明确跳过
.\.venv\Scripts\python.exe -m pytest backend/tests -q

# 真实数据库验证：仅使用名称含 test 的隔离数据库，测试会清空其中的业务表
$env:TEST_DATABASE_URL = 'mysql+pymysql://ctx_test:ctx-test-password@127.0.0.1:33306/ctx_test?charset=utf8mb4'
$env:TEST_MIGRATION_DATABASE_URL = 'mysql+pymysql://ctx_test:ctx-test-password@127.0.0.1:33306/ctx_migration_test?charset=utf8mb4'
.\.venv\Scripts\python.exe -m pytest backend/tests -q

Set-Location frontend
npm test
npm run build
npx playwright install chromium
$env:E2E_DATABASE_URL = 'mysql+pymysql://ctx_test:ctx-test-password@127.0.0.1:33306/ctx_e2e_test?charset=utf8mb4'
npm run test:e2e
```

浏览器测试独立使用 5001／5174 端口；未设置 `E2E_DATABASE_URL` 时使用隔离 SQLite 文件。验证码测试通过测试进程直接准备数据库记录，生产 HTTP 接口不存在固定验证码或测试后门。

## 文档与目录

- [部署、迁移和备份恢复](docs/DEPLOYMENT.md)
- [API 使用与事务规则](docs/API.md)
- [设备协议和 Qt 接入](docs/DEVICE_PROTOCOL.md)
- [原生档案与展示配置](docs/FORMATS.md)
- [实现结构与验收记录](docs/IMPLEMENTATION.md)
- [OpenAPI](contracts/openapi.json)，运行时也可读取 `/api/v1/openapi.json`
- `backend/ctx_server/`：认证、模型、业务服务、校验及模拟设备。
- `frontend/`：中文管理界面；`frontend/src/wire.ts` 由后端契约生成。

更新协议后，在 `backend` 目录运行 `python -m flask --app ctx_server:create_app export-contracts --output ../contracts`，再在 `frontend` 执行 `npm run contracts` 并提交生成结果。

本次交付不修改 ClassTopLand Next 的 C++ 代码。真实 Qt 客户端仍需按协议完成接入和实际保存、草稿冲突验证。

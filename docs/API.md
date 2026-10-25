# API 与业务规则

接口以 `/api/v1` 为前缀。完整请求／响应结构见 `contracts/openapi.json`，由运行时校验模型生成，`/api/v1/openapi.json` 返回相同定义。

## 响应与认证

成功返回 `{ "data": ... }`。版本及草稿内容下载直接返回 UTF-8 JSON 字节，不包含 `data` 包装。错误格式：

```json
{"error":{"code":"revision_conflict","message":"草稿已被修改，请重新载入后合并","details":{"current_revision":2},"request_id":"请求追踪标识"}}
```

主要状态码：401 未认证／凭证撤销，403 CSRF 失败，404 对象不存在或不属于当前账号，409 修订／幂等／发布预览冲突，413 超过 2 MiB，422 内容校验失败，429 限流，503 数据库暂时不可用。

### 浏览器会话

1. `GET /auth/csrf` 建立匿名会话，并返回 `csrf_token`。
2. 注册前 `GET /auth/captcha` 返回 `id` 和 PNG data URL，验证码 3 分钟内有效。
3. `POST /auth/register` 提交用户名、密码、`captcha_id` 和 `captcha_answer`，头部附 `X-CSRF-Token`。
4. 登录使用 `POST /auth/login`；用户名忽略大小写。账号在 15 分钟窗口累计三次密码失败后，需要图形验证码。
5. 注册／登录成功会轮换 Cookie 和 CSRF token。后续浏览器写操作继续携带返回的新 token。
6. 退出立即撤销当前会话；修改密码和命令行重置密码撤销该账号所有浏览器会话。

同一会话调用 `/auth/csrf` 得到稳定 token，适合多个浏览器标签页。Cookie 中只有随机标识，数据库只保存其摘要。生产启用 Secure、HttpOnly、SameSite=Lax，有效期 7 天。

### 设备

配对后使用 `Authorization: Bearer <device_secret>`，不依赖 Cookie 或 CSRF。凭证只能同步自己、提交自己的回执和下载曾分配给自己的发布内容。访问管理接口仍需要浏览器会话。

## 资源与草稿

`POST /resources` 或 `/resources/import`：

```json
{"name":"高一课表","kind":"profile","content":{"version":1,"profile":{"name":"高一","subjects":[],"timeLines":[],"schedules":[]}}}
```

返回 `resource` 和 `warnings`，新草稿修订为 1。`POST /resources/validate` 接受 `kind` 和 `content`，只校验和规范化，不保存。前端使用它保证非法输入不会进入课表渲染：导入文件先校验，网页在线编辑在保存前也会校验一次，`PATCH` 仍执行同一套规范化。

`PATCH /resources/{id}` 必须带当前 `revision`；可更新 `name`、`content`、`archived`。任何成功更新都会增加修订号。过期修订返回 409，不覆盖现有草稿。

列表默认只显示未归档资源，`archived=true` 查询归档内容。归档不删除历史发布。`GET /resources/{id}/preview?date=2026-10-26` 按已保存档案预览指定日期；可用 `schedule_id` 明确选择课表，日期特殊安排仍拥有最高优先级。

## 预览、发布与回滚

先 `POST /releases/preview`：

```json
{"resources":[{"id":"32位资源ID","revision":1}],"device_ids":["32位设备ID"],"group_ids":[],"note":"下周课表"}
```

一次最多包含一个 `profile` 和一个 `display_config`。服务端校验全部归属、修订和撤销状态，将分组展开去重，并返回实际设备名单、规范化内容和 `preview_token`。没有目标或超过 1000 台设备会被拒绝。

随后以相同请求体 `POST /releases`，携带：

```text
X-CSRF-Token: 当前会话token
Idempotency-Key: 本次操作生成并保留的随机ID，最多64字符
X-Preview-Token: 预览返回值
```

如果草稿或分组成员变化，要求重新预览。同一幂等键、相同请求体返回原发布结果；同一键用于不同请求返回 409。请求超时后应保留并复用原幂等键，避免重复发布。

发布在账号行锁保护的事务中生成不可变版本、固定目标分配和设备当前目标。成员变化、配对和发布遵循相同锁顺序。任何失败整体回滚，双资源发布不会出现只更新其中一个服务端目标的情况。

`GET /releases/{id}` 返回每个目标的最新尝试结果，`superseded` 标记设备是否已有后续目标。离线不会抹掉历史结果。

回滚先请求 `POST /releases/{id}/rollback/preview`，再请求 `/rollback`，请求体为 `device_ids`、`group_ids`、`note`，头部要求与正常发布相同。历史字节被原样复制到新发布；分配代次继续增加。

## 分页、筛选与限流

列表使用 `page` 和 `page_size`，默认 1／20，每页最多 100。返回 `items`、`total`、`page` 和 `page_size`。

- 设备：`q`、`group_id`、`revoked=false`。
- 资源：`q`、`kind`、`archived=true|false`。
- 发布：`device_id`。

数据库保存共享的固定窗口限流桶，失败请求的计数不会因业务事务回滚而丢失。注册每 IP 10 分钟 5 次；登录每 IP 5 分钟 30 次、每用户名 5 分钟 15 次；配对每 IP 每分钟 10 次、每个码 10 分钟 10 次。429 包含 `Retry-After`。敏感临时记录通过 `cleanup` 清理。

## 可运行的管理请求示例

下面示例适用于已通过网页注册的测试账号：

```python
import requests

api = "http://127.0.0.1:5000/api/v1"
session = requests.Session()
csrf = session.get(api + "/auth/csrf").json()["data"]["csrf_token"]
response = session.post(api + "/auth/login", headers={"X-CSRF-Token": csrf},
                        json={"username": "teacher", "password": "your-test-password"})
response.raise_for_status()
csrf = response.json()["data"]["csrf_token"]
response = session.post(api + "/pairing-codes", headers={"X-CSRF-Token": csrf},
                        json={"name": "一班教室", "group_id": None})
response.raise_for_status()
print(response.json()["data"]["code"])
```

账号隔离、会话失效、下载归属、幂等请求和事务失败场景均有后端回归测试。

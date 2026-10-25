# 设备协议与 Qt 接入

首版采用 HTTPS 轮询，课表 `profile` 和展示配置 `display_config` 为两个独立通道。模拟设备 `backend/ctx_server/simulator.py` 是可运行的协议参考，不代替 Qt 的真实原子保存验证。

## 配对与凭证

管理员在网页生成 12 字符配对码，有效期 10 分钟，明文只返回一次。设备应先生成 32 字节密码学随机秘密和独立请求 ID，将它们原子写入设备私有状态，再发起配对：

```python
import secrets

claim = {
    "code": "ABCDEFGH2345",
    "claim_id": secrets.token_hex(16),
    "device_secret": secrets.token_urlsafe(32),
    "client_version": "ClassTopLand-Next/版本号",
}
# POST /api/v1/device/pair，JSON 请求体为 claim
```

返回 `{data: {device_id, name}}`，HTTP 201。请求丢失或响应丢失时，使用相同 `code`、`claim_id`、`device_secret` 重试；有效期内返回同一设备，不产生新凭证。换请求 ID 或换秘密再次领取会返回 409。码已过期或撤销时不能重试领取，应重新取得配对码；已成功取得的凭证仍可直接认证。

服务端仅保存秘密摘要。秘密不能出现在 URL、日志、导出档案或主配置的可分享部分中。设备撤销后认证返回 401，停止自动同步并要求重新配对。配对失败后不应不停生成新秘密，否则无法安全识别重试。

使用新配对码重新绑定时，生成并持久化新的设备秘密及请求 ID，清空旧绑定的云端代次和待发送回执；保留最后成功应用的本地内容。新设备的代次从 1 开始，不能沿用旧绑定的代次来跳过新目标。模拟设备通过配对码摘要区分“同一码重试”和“新绑定”。

## 同步

携带 `Authorization: Bearer <device_secret>`，请求 `POST /api/v1/device/sync`：

```json
{
  "client_version":"ClassTopLand-Next/0.1.0",
  "supported_formats":{"profile":[1],"display_config":[1]},
  "applied":{}
}
```

`applied` 可按通道上报 `{generation, version_id}`，但不会替代应用回执，服务端不会仅凭同步上报推进已应用状态。返回示例：

```json
{
  "data": {
    "device_id":"设备ID",
    "server_time":"2026-10-25T01:00:00Z",
    "sync_after_seconds":25,
    "channels": {
      "profile": {
        "kind":"profile",
        "generation":1,
        "assignment_id":"分配ID",
        "target_version_id":"版本ID",
        "applied_version_id":null,
        "applied_generation":0,
        "attempt":0,
        "status":"pending",
        "reason":"",
        "version_id":"版本ID",
        "sha256":"原始UTF-8字节的SHA-256",
        "format_version":1,
        "compatible":true,
        "download_url":"/api/v1/versions/版本ID/content"
      },
      "display_config":null
    }
  }
}
```

未分配的通道为 `null`。格式不兼容时 `compatible=false`、`download_url=null`、原因 `unsupported_format`；不修改本地内容。下次同步应采用服务端的 20～30 秒随机间隔。

服务端接收同步时更新时间；90 秒内为在线，否则为离线。客户端时间不用于决定在线状态。网络失败使用指数退避，建议最长 120 秒；恢复连接后回到服务端正常间隔。

## 下载、应用与回执

1. 按通道比较本地持久化的分配代次，已经成功应用的同一代次不重复覆盖本地数据。
2. 下载 URL 必须属于已配置的 HTTPS 服务，不跟随携带凭证的跨源重定向。
3. 校验响应原始字节的 SHA-256，再解析 JSON 和检查格式版本。不要用重新格式化的 JSON 校验摘要。
4. 检查本地编辑会话及插件布局冲突，满足条件后通过对应管理器保存。
5. 保存成功后持久化已应用标记和待发回执，再提交回执。下载成功不能视为应用成功。

请求 `POST /api/v1/device/receipts`：

```json
{
  "assignment_id":"分配ID",
  "kind":"profile",
  "generation":1,
  "version_id":"版本ID",
  "attempt":1,
  "result":"applied",
  "reason":""
}
```

结果为 `applied`、`failed` 或 `blocked`。建议使用可识别原因 `local_edit`、`plugin_layout_conflict`、`checksum_mismatch`、`validation_failed`、`save_failed`，必要时附简短说明。

每个分配的尝试序号从 1 递增，在尝试前持久化。相同分配、相同尝试、相同内容重试返回原回执；更改同一序号的结果会返回 409。先阻塞后成功必须使用下一尝试序号。

迟到回执保留历史。服务端只让更高尝试更新当前目标状态，只让不低于已记录成功代次的成功回执推进已应用标记。新目标不会被旧回执替换。回滚内容即使与旧版本相同，也有新的分配代次，必须按新代次应用和回执。

## Qt 应用边界

### 档案

- 使用 `ProfileExchange::decode`、档案校验和 `ProfileManager` 的候选提交及原子保存流程。
- 云端档案作为一个专用受管理档案，凭证和云端状态放独立私有文件，不使用远端档案名称直接拼接本地路径。
- 检查档案编辑会话：存在未保存更改时上报 `blocked/local_edit`，不强制关闭、不静默丢弃。用户完成保存或放弃后再尝试。
- 新分配完整替换云端管理的档案，包含 `activeWeekScheduleId`、`dateOverrides`、`reminderRules`，覆盖之前已保存的本地修改。
- 应用后仍允许客户端进行手动选择、调休和过期安排清理。这些本地改变不使同一分配重新应用；下一新分配才覆盖。
- 日期特殊安排的来源验证、当前日期清理继续按客户端现有语义执行；服务端不可变版本不跟随日期自动修改。

### 展示配置

- 将云端配置映射到本机主配置 v2，调用 `ConfigManager` 的候选校验、提交和原子保存，不直接覆盖整个 `MainConfig.json`。
- 只更新允许字段，保留档案路径、UIAccess、插件授权、窗口拦截、屏幕选择和全局提醒。
- 内置组件列表由云端完整管理。设备当前有插件课程条组件时上报 `blocked/plugin_layout_conflict`，在本机解决冲突后重试。
- 倒计时目标是无时区的本地时间，按设备本地时区解释。
- 格式与字段映射见 `FORMATS.md`；课表和展示配置独立应用，一条失败不能阻塞另一条。

### 崩溃恢复

内容文件与状态文件通常不能作为一个文件系统事务提交，应设置独立应用日志：记录待应用分配，原子保存内容，再原子保存应用标记及待发回执，最后发送。

启动时恢复日志：内容已落盘但标记未提交时，可重复执行相同分配的幂等保存；标记已提交而回执未确认时，只补发原回执。磁盘保存失败不得修改内存中的正式已保存状态或云端已应用代次。

模拟设备执行“内容原子写入 → 状态与待发回执原子写入 → 发回执”的流程，并对回执丢失、文件保存失败、阻塞、离线和重启提供测试。

# 数据格式

## 三种不同版本号

| 位置 | 首版格式 | 含义 |
|---|---|---|
| 原生档案根节点 | `version: 1` | Qt `ProfileExchange` 原生 JSON |
| 本地主配置 | `version: 2` | Qt `MainConfig.json`，服务端不整体下发 |
| 云端展示配置 | `schema_version: 1` | CTX 白名单配置载荷 |

不要用主配置的 v2 标识原生档案或云端配置。HTTP API 的 `/v1/` 则是接口版本，独立于上述内容版本。

## 原生 JSON 档案

最小示例位于 `examples/profiles/minimal.json`，完整类型和边界见 `contracts/NativeProfile.schema.json`。服务端使用严格的类型及未知字段拒绝策略，并检查格式外的语义约束。管理端可以在网页中直接新建和编辑这些字段；保存前会复用同一套校验与规范化，网页不会修改 `version` 或生成新的格式版本。

- `profile.name` 为非空名称。
- `subjects` 包含 `name`、`simplifiedName`、`teacher`，科目名称不能重复。
- `timeLines` 包含命名时间线及 `timePoints`。
- `schedules` 为周课表，每张有稳定 `id`、`name`、`mode` 和 `daySchedules`。模式为 `all`／`odd`／`even`；星期为 1～7，周一为 1。
- 课程的 `startTime`、`endTime` 为 `HH:mm:ss`，开始早于结束，同一天或时间线内不能重叠，允许相邻时段。
- `semesterStartDate` 可省略，若提供则为有效 `YYYY-MM-DD`；该日期所在周的周一为第 1 周起点。
- `activeWeekScheduleId` 默认空字符串，表示自动匹配。
- `dateOverrides` 和 `reminderRules` 缺失时补空列表。

周课表 ID 缺失、为空或重复时按 Qt 加载规则生成稳定 ID；无唯一匹配的手动选择会被清空并返回警告。规范化结果保存在草稿中，之后的保存／发布不会继续生成新 ID。其他错误引用不静默修复。

日期特殊安排包含 `date`、`sourceWeekScheduleId`、`sourceWeekday`、`sourceClasses` 和 `classes`。日期不能重复，来源日必须存在，来源快照必须与常规来源课程一致，比较忽略课程列表顺序。过期日期记录可以导入，实际应用时由客户端按当地日期清理。

档案提醒规则保留 Qt 的数字枚举：`course` 为 0 不限／1 科目／2 节次；`timing` 为 0 固定／1 上课／2 下课。时间为 `HH:mm:ss`，偏移范围为 -1439～1439 分钟；固定时刻不能使用课程占位符。缺失科目的规则允许保留，由客户端暂停触发，符合本地规则维护语义。

服务端有明确容量边界：最多 100 张周课表、100 条时间线、1000 科目、每个日课表最多 1000 节、1000 条日期安排和提醒规则；请求总大小仍不得超过 2 MiB。

日期预览优先级为：有效日期特殊安排 → 明确选择或档案手动选择 → 按星期和单双周自动匹配。多个周课表同时匹配时返回冲突说明，不任选第一张。未设置学期日期时，自动匹配到单双周课表会要求补充日期；手动选择可直接使用。

## 云端展示配置

示例位于 `examples/display/default.json`，结构见 `contracts/DisplayConfig.schema.json`：

```json
{
  "schema_version":1,
  "courseBarConfig": {
    "enable":true,"height":49,"componentSpacing":14,
    "components":[{"typeId":"builtin/date","instanceId":"date-main","enabled":true,"settings":{}}]
  },
  "appearanceConfig":{"themeColor":"#1191d3","themeMode":"system","windowEffect":"mica"},
  "desktopCountdownConfig":{"enable":false,"targetDateTime":"","labelTag":"","englishTag":"","showMilliseconds":true,"useLegacyPlacement":true,"rightMargin":24,"bottomMargin":24,"scalePercent":100}
}
```

`appearanceConfig`、`desktopCountdownConfig` 及内部可选字段使用固定默认值；课程条组件列表必须明确提供，空列表表示移除所有内置组件。

| 字段 | 规则 |
|---|---|
| 课程条高度 | 整数 1～1000 |
| 组件间距、课程间距 | 整数 0～100 |
| 组件列表 | 最多 32 项，`instanceId` 非空且唯一 |
| `typeId` | `builtin/date`、`builtin/courseView`、`builtin/countdown`、`builtin/textTip` |
| `settings` | 首版必须为空对象 |
| `text` | 仅文本提示组件，最多 1000 字符 |
| `courseSpacing` | 仅课程查看组件 |
| 主题色 | `#rrggbb` |
| 主题模式 | `system`、`light`、`dark` |
| 窗口效果 | `normal`、`elaMica`、`mica`、`micaAlt`、`acrylic`、`dwmBlur` |
| 倒计时目标 | `YYYY-MM-DDTHH:mm:ss`，无时区；开启时必填 |
| 标题 | 中英文各最多 100 字符 |
| 边距 | 整数 0～10000，原版布局保留但不使用 |
| 缩放 | 整数 50～200 |

云端不接受 `profileName`、`uiAccessEnabled`、插件、窗口拦截、全局提醒、`screenName` 或任意扩展设置。保留本机字段必须在客户端合并时保证，服务端不能替客户端执行本地文件事务。

## 内容摘要

发布内容使用固定键排序、无多余空白的 UTF-8 JSON，禁止非有限数值。摘要对应保存在发布版本中的精确字节。MySQL 中使用文本保存原始发布内容，避免数据库 JSON 重排改变下载字节；草稿仍使用 JSON 列。

草稿、历史版本和设备本地保存文件并非同一对象。设备可使用原生格式重新序列化，但云端版本标记应单独保存，不能通过比对本地文件字节来判断是否需要重复应用。

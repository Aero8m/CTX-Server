<script setup lang="ts">
import { ElMessage } from 'element-plus'

const sections = [
  { id: 'start', label: '先了解使用流程' },
  { id: 'pair', label: '1. 配对与管理设备' },
  { id: 'profile', label: '2. 导入或编辑课表' },
  { id: 'display', label: '3. 设置展示配置' },
  { id: 'publish', label: '4. 预览并发布' },
  { id: 'results', label: '5. 查看应用结果' },
  { id: 'rollback', label: '6. 回滚与日常维护' },
  { id: 'questions', label: '常见问题' },
]
const quickLinks = [
  { step: '01', name: '配对设备', description: '生成配对码，连接设备', to: '/devices' },
  { step: '02', name: '导入或编辑课表', description: '导入 JSON 或直接录入课程', to: '/profiles' },
  { step: '03', name: '配置展示', description: '设置课程条与倒计时', to: '/display' },
  { step: '04', name: '发布内容', description: '确认名单，查看结果', to: '/releases' },
]
const pairCommand = `.\\.venv\\Scripts\\python.exe -m ctx_server.simulator --server "${window.location.origin}" --state-dir .device-state/classroom-1 --pair 这里替换为配对码 --once`
const syncCommand = `.\\.venv\\Scripts\\python.exe -m ctx_server.simulator --server "${window.location.origin}" --state-dir .device-state/classroom-1`

function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const header = document.querySelector('.sidebar')
  const offset = window.innerWidth <= 720 && header ? header.getBoundingClientRect().height + 16 : 24
  window.scrollTo({
    top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  })
}
async function copyCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    ElMessage.success('命令已复制，请先替换配对码并核对服务地址')
  } catch {
    ElMessage.info('请手动选择并复制下方命令')
  }
}
</script>

<template>
  <div class="guide-layout">
    <article class="guide-content">
      <section id="start" class="panel guide-intro">
        <span class="guide-kicker">第一次使用</span>
        <h2>让第一台设备收到你的课表</h2>
        <p>
          先连接设备，再准备课表和展示配置，最后在发布中心确认下发。保存草稿后，还需要创建发布，设备才会收到更新。课表既可以导入
          ClassTopLand Next 导出的 JSON，也可以直接在网页新建和修改。
        </p>
        <div class="guide-quick-links">
          <router-link v-for="item in quickLinks" :key="item.to" :to="item.to" class="guide-quick-link">
            <span class="guide-step">{{ item.step }}</span>
            <strong>{{ item.name }}</strong>
            <span>{{ item.description }}</span>
          </router-link>
        </div>
        <p class="guide-note">
          当前可使用模拟设备体验完整流程。ClassTopLand Next
          桌面客户端的云同步仍待接入；模拟设备用于验证同步和回执，不会直接修改桌面应用。
        </p>
      </section>

      <section id="pair" class="panel guide-section">
        <h2><span>01</span> 配对与管理设备</h2>
        <ol>
          <li>进入「设备管理」，如需按班级或楼层整理设备，先点击「管理分组」，填写分组名称并添加。</li>
          <li>点击「配对设备」，填写易于识别的名称，例如“高一（1）班教室”，并选择所属分组。</li>
          <li>
            点击「生成配对码」。配对码有效期为 10 分钟，只能绑定一台设备；关闭弹窗后无法再次查看，请及时记录。
          </li>
          <li>使用下方模拟设备完成配对，随后保持同步进程运行。回到设备列表，点击刷新确认设备已经出现。</li>
        </ol>
        <p>
          配对码用错或不再使用时，可在当前弹窗中点击「撤销配对码」。设备详情支持重命名、保存分组和撤销设备。
        </p>
        <el-collapse>
          <el-collapse-item title="使用模拟设备体验配对与同步" name="simulator">
            <p>
              在项目根目录的 PowerShell 中执行以下命令，前提是已经安装项目的 Python
              依赖。先将“这里替换为配对码”替换为网页刚生成的实际配对码。
            </p>
            <div class="guide-command-heading">
              <strong>首次配对</strong
              ><el-button text size="small" @click="copyCommand(pairCommand)">复制命令</el-button>
            </div>
            <pre class="guide-command"><code>{{ pairCommand }}</code></pre>
            <div class="guide-command-heading">
              <strong>配对成功后持续同步</strong
              ><el-button text size="small" @click="copyCommand(syncCommand)">复制命令</el-button>
            </div>
            <pre class="guide-command"><code>{{ syncCommand }}</code></pre>
            <p>
              服务地址取自当前网页；远程访问需使用 HTTPS。若你的 API 使用独立入口，请改成实际提供
              <code>/api/v1/</code> 的服务根地址，不要在地址末尾追加接口路径。其他 Python
              环境可将命令开头替换为对应的 Python 可执行文件。
            </p>
            <p>
              每台模拟设备使用独立的
              <code>--state-dir</code>
              目录。后续启动同一设备时保持目录和服务地址一致，不要同时运行两个使用相同目录的进程。按 Ctrl+C
              停止同步，之后可用同一条命令恢复。
            </p>
          </el-collapse-item>
        </el-collapse>
        <router-link class="guide-action" to="/devices">打开设备管理 →</router-link>
      </section>

      <section id="profile" class="panel guide-section">
        <h2><span>02</span> 导入或编辑课表档案</h2>
        <p>
          课表档案有两种来源：导入 ClassTopLand Next 原生
          JSON，或在网页中直接新建。两种方式保存后都会生成可发布的草稿；已有档案也可以随时回到网页修改，不需要导出后再上传。
        </p>

        <h3>导入已有档案</h3>
        <ol>
          <li>进入「课表档案」，点击「导入档案」并选择 JSON 文件。</li>
          <li>
            系统会先校验并规范化内容，通过后才进入编辑器；校验失败时会显示原因，当前正在编辑的内容不会被覆盖。试用时可以选择项目中的
            <code>examples/profiles/minimal.json</code>。
          </li>
          <li>导入后仍可在网页里继续修改课程、科目和日期安排，最后点击「保存草稿」。</li>
        </ol>

        <h3>直接新建档案</h3>
        <ol>
          <li>
            点击「新建档案」，填写「资源名称」和「档案名称」。「资源名称」用于档案列表和发布时选择；「档案名称」写在档案内容里，可以填写班级或校区名称。
          </li>
          <li>
            在「基本信息」设置学期开始日期和手动课表选择。学期开始日期所在周的周一作为第 1
            周起点，单双周匹配会用到它。
          </li>
          <li>
            在「周课表」选择或新建周课表，切换到星期后点击「添加星期一」等按钮，再添加课程并填写科目和起止时间。
          </li>
          <li>按需补充科目、时间线、日期特殊安排和提醒规则，最后点击「保存草稿」。</li>
        </ol>

        <h3>各页签用途</h3>
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th>页签</th>
                <th>可以做什么</th>
                <th>注意</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>基本信息</td>
                <td>修改资源名称、档案名称、学期开始日期和手动选择的周课表。</td>
                <td>手动选择优先于自动匹配；留空时按星期和单双周自动匹配。</td>
              </tr>
              <tr>
                <td>周课表</td>
                <td>新建/删除周课表，设置名称与匹配模式，增删星期和课程。</td>
                <td>
                  时间使用 24
                  小时制；开始必须早于结束，同一天课程不能重叠，首尾相接可以。修改课程后，引用这一天的日期特殊安排会自动更新来源快照。
                </td>
              </tr>
              <tr>
                <td>科目与节次</td>
                <td>维护科目名称、简称、教师，添加时间线和作息时段。</td>
                <td>
                  课程科目可以直接输入，不要求先登记；「补齐缺失科目」可把课程里出现但科目表没有的名称补进来。
                </td>
              </tr>
              <tr>
                <td>日期特殊安排</td>
                <td>为某一天指定来源周课表、来源星期和当天特殊课程，用于调休、换课或临时安排。</td>
                <td>
                  来源快照必须与来源日课程一致；修改来源课程会自动同步。优先级为：日期特殊安排 →
                  手动选择/自动匹配。
                </td>
              </tr>
              <tr>
                <td>提醒规则</td>
                <td>设置提醒名称、文本、星期、课程条件、节次、时机、时间和偏移分钟。</td>
                <td>
                  指定科目提醒必须填写科目；固定时间提醒不能使用
                  <code>{科目}</code> 或 <code>{节次}</code> 占位符。
                </td>
              </tr>
              <tr>
                <td>日期预览</td>
                <td>按已保存草稿查看某一天最终使用的课表。</td>
                <td>预览不会保存修改；存在未保存修改时需要先保存，按钮才可用。</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>保存、预览与未保存修改</h3>
        <ul>
          <li>
            保存前会先做本地检查，再由服务端校验并规范化。发现问题时，弹窗顶部会列出原因和对应页签，点击条目可以跳到需要修改的位置。
          </li>
          <li>
            保存成功后，列表中的「草稿修订」会增加。草稿只是待发布内容，仍需在发布中心创建发布，设备才会收到更新。
          </li>
          <li>
            「下载当前内容」可以备份正在编辑的
            JSON；「撤销更改」会恢复到最后一次保存或打开时的内容。关闭弹窗或导入文件替换内容时，如果有未保存修改，页面会要求确认。
          </li>
          <li>
            如果提示草稿已在其他页面修改，可以下载当前内容备份，或点击「重新载入最新草稿」放弃本地修改。不要在未备份时直接刷新页面。
          </li>
          <li>归档不删除历史版本，也不撤销已经发布的内容；开启「已归档」筛选后可恢复并继续编辑。</li>
        </ul>

        <h3>常见编辑操作</h3>
        <ul>
          <li>
            <strong>修改课程：</strong>周课表 → 选择周和星期 →
            直接修改科目或起止时间；也可以用「添加课程」「按时间排序」整理当天课程。
          </li>
          <li>
            <strong>新增星期：</strong>周课表 → 切换到目标星期 → 点击「添加星期X」→ 添加课程。每张周课表最多 7
            天，每天最多 1000 节。
          </li>
          <li>
            <strong>调休或换课：</strong>日期特殊安排 → 添加 → 选择日期和来源日 →
            修改当天课程。重复日期和无效来源会在保存时提示。
          </li>
          <li>
            <strong>重命名科目：</strong>科目与节次 →
            修改名称后按回车或移出输入框。系统会同步更新课程、特殊安排和指定科目提醒，并提示更新了多少处引用。
          </li>
          <li>
            <strong>删除被引用的星期或周课表：</strong
            >页面会提示将被一并删除的日期特殊安排数量；确认后删除。若只是修改课程，不需要删除来源。
          </li>
        </ul>

        <p class="guide-note">
          首版支持原生 JSON 导入和网页在线编辑；CSES 和旧版 tables.json
          暂未提供。网页不会创建新的档案格式版本，保存时服务端仍执行严格校验。日期预览展示已保存草稿，修改后请先保存；多张周课表同时匹配时，需要明确课表选择。
        </p>
        <router-link class="guide-action" to="/profiles">打开课表档案 →</router-link>
      </section>

      <section id="display" class="panel guide-section">
        <h2><span>03</span> 设置展示配置</h2>
        <ol>
          <li>进入「展示配置」，点击「新建配置」或选择已有配置，填写便于区分的资源名称。</li>
          <li>
            在「课程条」设置启停、高度和组件间距，添加日期、课程查看、倒计时、文本提示组件，用上下箭头调整顺序。
          </li>
          <li>在「外观」选择主题色、明暗模式和窗口效果。上方课程条预览是布局示意，实际效果以客户端为准。</li>
          <li>如需桌面倒计时，开启后填写目标时间和标题，选择毫秒显示、原版布局或自定义边距，并调整缩放。</li>
          <li>点击「保存草稿」，然后前往发布中心下发。</li>
        </ol>
        <p class="guide-note">
          倒计时目标按每台设备的本地时间解释。UIAccess、插件授权、窗口拦截、屏幕选择和全局提醒保留本机设置；设备存在插件课程条组件时，需要先在本机解决布局冲突。
        </p>
        <router-link class="guide-action" to="/display">打开展示配置 →</router-link>
      </section>

      <section id="publish" class="panel guide-section">
        <h2><span>04</span> 预览并发布</h2>
        <ol>
          <li>进入「发布中心」，点击「新建发布」。</li>
          <li>选择一个课表档案、一个展示配置，或只选择其中一种。不选择的类型将保持设备原有目标。</li>
          <li>选择目标设备，也可以按分组批量选择；填写发布说明，例如“第九周课表与期中倒计时”。</li>
          <li>点击「预览发布」，核对实际设备名单，并展开查看实际发布内容。</li>
          <li>点击「确认发布」，随后在发布详情中查看每个设备、每种内容的应用结果。</li>
        </ol>
        <p class="guide-note">
          分组只在本次发布时展开为固定设备名单。之后新配对或移入分组的设备不会自动继承旧发布，需要再次发布。预览后内容或名单有变化时，请重新预览。
        </p>
        <p>
          发布成功表示服务端已记录目标。设备需要继续运行同步进程，通常每 20～30
          秒同步一次；下载、保存和发送回执还需要一定时间。
        </p>
        <router-link class="guide-action" to="/releases">打开发布中心 →</router-link>
      </section>

      <section id="results" class="panel guide-section">
        <h2><span>05</span> 查看设备是否真正应用</h2>
        <p>
          「在线」只说明设备近期与服务端保持连接，不代表更新已经应用。设备超过 90
          秒没有同步会显示离线；课表与展示配置分别显示结果。
        </p>
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>含义与处理方式</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>未分配</td>
                <td>该通道还没有发布目标。前往发布中心选择对应内容和设备。</td>
              </tr>
              <tr>
                <td>待同步</td>
                <td>已经分配，尚未收到当前目标的应用结果。检查同步进程和网络。</td>
              </tr>
              <tr>
                <td>已应用</td>
                <td>设备已报告保存成功。可以核对已应用版本和目标版本。</td>
              </tr>
              <tr>
                <td>应用失败</td>
                <td>下载、校验或保存失败。查看原因，处理后让设备重试。</td>
              </tr>
              <tr>
                <td>已阻塞</td>
                <td>存在本地未保存编辑、格式不兼容或插件布局冲突。解决对应问题后重试。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          点击设备名称或「详情」，查看最后在线时间、客户端版本、两个通道的目标与已应用版本，以及最近应用回执。发布详情会标出「当前目标」或「已有新目标」，方便识别历史发布。
        </p>
        <p>
          设备列表和发布页面每 10 秒刷新，页面切到后台时会暂停刷新。课表成功、配置失败时，只需处理失败的通道。
        </p>
      </section>

      <section id="rollback" class="panel guide-section">
        <h2><span>06</span> 回滚与日常维护</h2>
        <h3>恢复到之前发布的内容</h3>
        <ol>
          <li>在「发布中心」找到需要恢复的历史记录，点击「回滚」。</li>
          <li>重新选择本次目标设备或分组，核对说明并预览。</li>
          <li>点击「确认发布」，等待设备同步并检查结果。</li>
        </ol>
        <p>
          回滚会复制历史内容生成新发布，原记录继续保留。目标设备需要重新选择，并不自动沿用原来的名单；如果原发布同时包含课表与配置，回滚也会恢复这两种内容。
        </p>
        <h3>整理草稿与管理账号</h3>
        <ul>
          <li>
            课表和展示配置都可归档；编辑中的内容可先用「下载当前内容」备份，归档后开启「已归档」筛选可恢复。归档不删除历史版本，也不会撤销已经下发的内容。
          </li>
          <li>
            侧边栏点击用户名进入「账号设置」。修改密码后，所有浏览器会话需要重新登录；忘记密码时联系服务部署者重置。
          </li>
          <li>
            设备不再使用时，在设备详情中撤销凭证。撤销不会清除设备本地已保存内容，重新接入需要新的配对码。
          </li>
        </ul>
      </section>

      <section id="questions" class="panel guide-section">
        <h2>常见问题</h2>
        <el-collapse>
          <el-collapse-item title="为什么保存后设备没有变化？" name="draft">
            <p>
              保存只更新草稿。请到「发布中心」创建发布，确认目标设备已被选中，并保持设备同步。修改草稿不会改变已经发布的版本。
            </p>
          </el-collapse-item>
          <el-collapse-item title="为什么提示草稿已被其他页面修改？" name="conflict">
            <p>
              其他页面已经保存了新修订。网页编辑器会保留当前表单内容：可以先点击「下载当前内容」备份，或复制需要保留的字段，再点击「重新载入最新草稿」放弃本地修改，合并后重新编辑。不要在未备份时直接刷新页面。
            </p>
          </el-collapse-item>
          <el-collapse-item title="保存课表时提示「有内容需要修正」怎么办？" name="profile-issues">
            <p>
              弹窗顶部会列出具体原因和所属页签，点击条目可以跳到对应位置。常见原因包括：科目或名称空白、结束时间不晚于开始时间、同一天课程时间重叠、科目名称或特殊安排日期重复、日期特殊安排的来源周课表/星期不存在或来源快照不一致，以及固定时间提醒使用了
              <code>{科目}</code> 或 <code>{节次}</code> 占位符。修正后再次保存，服务端会重新校验。
            </p>
          </el-collapse-item>
          <el-collapse-item title="为什么删除星期或周课表会影响日期特殊安排？" name="override-source">
            <p>
              日期特殊安排引用某个「来源周课表 +
              星期」的课程快照。删除来源后，这些安排会失去依据，因此页面会提示受影响的条数；确认后会一并删除。如果只是修改课程，不需要删除来源，修改后来源快照会自动同步。
            </p>
          </el-collapse-item>
          <el-collapse-item title="日期预览为什么和刚改的内容不一致？" name="preview-draft">
            <p>
              日期预览读取的是已保存草稿。存在未保存修改时预览按钮不可用；请先点击「保存草稿」，再按日期预览。预览本身不会保存修改。
            </p>
          </el-collapse-item>
          <el-collapse-item title="网页编辑会改变档案或课表 ID 吗？" name="profile-id">
            <p>
              已有周课表和提醒规则的 ID 会保留；新建周课表、提醒规则时由系统生成稳定 ID。网页不提供直接修改 ID
              的入口。旧档案缺少或重复 ID 时，导入校验会按兼容规则修复并返回提示。
            </p>
          </el-collapse-item>
          <el-collapse-item title="设备离线后还能继续使用课表吗？" name="offline">
            <p>
              协议要求设备保留最后成功应用的数据。模拟设备会保留本地文件；真实桌面客户端仍需完成云同步接入。重新联网后继续获取当前目标，不需要每次重新配对。
            </p>
          </el-collapse-item>
          <el-collapse-item title="如何处理 local_edit 或 unsupported_format？" name="blocked">
            <p>
              local_edit 表示本地有未保存草稿，应先在设备上保存或放弃编辑。unsupported_format
              表示客户端不支持内容格式，需要更新兼容的客户端，再同步重试。插件组件冲突也需要在设备本机处理。
            </p>
          </el-collapse-item>
          <el-collapse-item title="配对码过期，或者设备被撤销了怎么办？" name="pairing">
            <p>
              生成新配对码，在设备上重新配对。模拟设备可以保留原状态目录，用新配对码再次运行首次配对命令；它会更换凭证并重新建立云端状态，同时保留最后成功应用的文件。
            </p>
          </el-collapse-item>
          <el-collapse-item title="第一次注册和登录需要准备什么？" name="account">
            <p>
              登录页点击「立即注册」，填写 3～32 位字母、数字或下划线组成的用户名，以及 10～128
              位密码，再填写图形验证码。无需邮箱。验证码可点击刷新，用户名登录时忽略大小写；请求过于频繁时请稍后重试。
            </p>
          </el-collapse-item>
        </el-collapse>
      </section>
    </article>

    <aside class="guide-toc" aria-label="教程目录">
      <p>本页目录</p>
      <a
        v-for="section in sections"
        :key="section.id"
        :href="'#' + section.id"
        @click.prevent="jumpTo(section.id)"
        >{{ section.label }}</a
      >
    </aside>
  </div>
</template>

<style scoped>
.guide-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 28px;
  align-items: start;
}
.guide-content {
  min-width: 0;
}
.guide-content p,
.guide-content li {
  font-size: 14px;
  line-height: 1.9;
  color: #526d7b;
}
.guide-content p {
  margin: 12px 0;
}
.guide-content ol,
.guide-content ul {
  padding-left: 22px;
  margin: 12px 0;
}
.guide-content li + li {
  margin-top: 8px;
}
.guide-content h3 {
  font-size: 15px;
  margin: 24px 0 10px;
}
.guide-intro {
  background: #eff8f5;
  border-color: #d8eae3;
}
.guide-kicker {
  display: block;
  color: #258274;
  font-size: 12px;
  margin-bottom: 12px;
}
.guide-intro h2 {
  font-size: 23px;
  line-height: 1.5;
  margin-bottom: 8px;
}
.guide-quick-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 22px 0;
}
.guide-quick-link {
  display: grid;
  gap: 6px;
  padding: 16px;
  background: #fff;
  border: 1px solid #deebe6;
  border-radius: 10px;
}
.guide-quick-link:hover {
  border-color: #73b6a7;
}
.guide-quick-link strong {
  font-size: 14px;
  color: #25574f;
}
.guide-quick-link > span:last-child {
  font-size: 12px;
  color: #71878f;
}
.guide-step {
  color: #3b9886;
  font-size: 12px;
  letter-spacing: 1px;
}
.guide-section h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.5;
}
.guide-section h2 > span {
  color: #3d9486;
  font-size: 12px;
  background: #edf7f3;
  padding: 4px 7px;
  border-radius: 6px;
}
.guide-content .guide-note {
  padding: 12px 15px;
  background: #f5f8f9;
  border-left: 3px solid #b0cbc6;
  border-radius: 0 7px 7px 0;
  font-size: 13px;
}
.guide-intro .guide-note {
  background: #ffffffa6;
}
.guide-action {
  display: inline-block;
  color: #167c85;
  font-size: 13px;
  font-weight: 600;
  margin-top: 12px;
}
.guide-action:hover {
  text-decoration: underline;
}
.guide-toc {
  position: sticky;
  top: 28px;
  display: grid;
  gap: 4px;
  padding: 16px 0;
}
.guide-toc p {
  font-size: 12px;
  color: #879aa4;
  margin: 0 0 12px 12px;
}
.guide-toc a {
  padding: 9px 12px;
  border-radius: 7px;
  color: #647e8b;
  font-size: 12px;
  line-height: 1.5;
}
.guide-toc a:hover {
  background: #e7f1ee;
  color: #246b60;
}
.guide-command-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.guide-command {
  background: #f3f6f8;
  padding: 14px;
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
  font-size: 12px;
}
.guide-content code {
  font-family: Consolas, monospace;
  overflow-wrap: anywhere;
}
.guide-table-wrap {
  overflow-x: auto;
}
.guide-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
  line-height: 1.8;
}
.guide-table th {
  background: #f5f8f9;
  font-weight: 500;
  color: #718793;
}
.guide-table th,
.guide-table td {
  padding: 12px;
  border-bottom: 1px solid #edf1f3;
  vertical-align: top;
}
.guide-table td {
  color: #526d7b;
}
.guide-table td:first-child {
  white-space: nowrap;
  color: #294f60;
}
.guide-action:focus-visible,
.guide-toc a:focus-visible,
.guide-quick-link:focus-visible {
  outline: 2px solid #167c85;
  outline-offset: 3px;
}
@media (max-width: 1100px) {
  .guide-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .guide-toc {
    position: static;
    grid-row: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
  }
  .guide-toc p {
    flex-basis: 100%;
    margin: 0 0 4px;
  }
  .guide-toc a {
    padding: 7px 10px;
    background: #fff;
    border: 1px solid #e1e9ed;
  }
}
@media (max-width: 720px) {
  .guide-layout {
    gap: 18px;
  }
  .guide-intro h2 {
    font-size: 20px;
  }
  .guide-quick-link {
    padding: 13px;
  }
  .guide-content p,
  .guide-content li {
    font-size: 13px;
  }
  .guide-toc a {
    font-size: 11px;
  }
}
</style>

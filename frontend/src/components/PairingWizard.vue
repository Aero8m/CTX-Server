<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { all, post } from '../api'
import { useRefresh } from '../useRefresh'
import type { Group } from '../types'
import type { PairingView } from '../wire'
import { formatTime } from '../types'
import LoadNotice from './LoadNotice.vue'
const open = defineModel<boolean>({ required: true })
defineProps<{ groups: Group[] }>()
const emit = defineEmits<{ connected: [id: string] }>()
const name = ref(''),
  group = ref(''),
  code = ref(''),
  codeId = ref(''),
  expires = ref(''),
  connectedId = ref(''),
  revoked = ref(false),
  busy = ref(false),
  error = ref(''),
  now = ref(Date.now())
watch(open, (value) => {
  if (value) {
    name.value = ''
    group.value = ''
    code.value = ''
    codeId.value = ''
    expires.value = ''
    connectedId.value = ''
    revoked.value = false
    error.value = ''
    pollError.value = ''
  }
})
const seconds = computed(
  () => Math.max(0, Math.ceil((new Date(expires.value).getTime() - now.value) / 1000)) || 0,
)
const expired = computed(() => !!code.value && seconds.value === 0)
const phase = computed(() => (connectedId.value ? 3 : code.value ? 2 : 0))
let tick: ReturnType<typeof setInterval>
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(tick))
const poll = useRefresh(async (options) => {
  if (!open.value || !codeId.value || connectedId.value || busy.value) return
  const id = codeId.value
  const records = await all<PairingView>('/pairing-codes', options)
  if (id !== codeId.value || !open.value) return
  const record = records.find((item) => item.id === id)
  if (!record) throw new Error('未找到当前配对记录，请重新读取或生成配对码')
  if (record.device_id) {
    connectedId.value = record.device_id
    emit('connected', record.device_id)
  }
  revoked.value = !!record.revoked_at
}, 2000)
const { error: pollError, loading: pollLoading } = poll
async function generate() {
  if (!name.value.trim() || busy.value) {
    error.value = '请填写教室名称'
    return
  }
  busy.value = true
  error.value = ''
  try {
    if (codeId.value && !revoked.value) await post(`/pairing-codes/${codeId.value}/revoke`)
    const result = await post<PairingView>('/pairing-codes', {
      name: name.value.trim(),
      group_id: group.value || null,
    })
    code.value = result.code || ''
    codeId.value = result.id
    expires.value = result.expires_at
    revoked.value = false
    now.value = Date.now()
    pollError.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '生成失败，请重试'
  } finally {
    busy.value = false
  }
}
async function revoke() {
  busy.value = true
  try {
    await post(`/pairing-codes/${codeId.value}/revoke`)
    revoked.value = true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '撤销失败，请重试'
  } finally {
    busy.value = false
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(code.value)
    ElMessage.success('配对码已复制')
  } catch {
    error.value = '无法访问剪贴板，请手动选择并复制配对码'
  }
}
async function close(done?: () => void) {
  if (busy.value) return
  if (code.value && !connectedId.value && !expired.value && !revoked.value) {
    try {
      await ElMessageBox.confirm('关闭后无法再次查看此配对码，请先复制。设备尚未连接。', '暂时关闭连接向导', {
        confirmButtonText: '已记录，关闭',
        cancelButtonText: '继续等待',
      })
    } catch {
      return
    }
  }
  open.value = false
  if (done) done()
}
const server = window.location.origin
</script>
<template>
  <el-dialog
    v-model="open"
    title="连接教室设备"
    width="640px"
    :before-close="close"
    :close-on-click-modal="false"
  >
    <el-steps :active="phase" simple finish-status="success"
      ><el-step title="填写名称" /><el-step title="获取配对码" /><el-step title="等待连接" /><el-step
        title="连接成功"
    /></el-steps>
    <el-alert title="连接能力说明" type="info" :closable="false"
      ><p>
        ClassTopLand Next
        桌面客户端尚未接入云同步。只有支持本项目设备协议的客户端可以配对；当前可使用模拟设备体验完整流程。
      </p></el-alert
    >
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
    <LoadNotice :error="pollError" :loading="pollLoading" @retry="poll" />
    <el-form v-if="!code" label-position="top" :disabled="busy"
      ><el-form-item label="教室名称"
        ><el-input v-model="name" maxlength="100" placeholder="例如：高一（1）班教室" /></el-form-item
      ><el-form-item label="分组（选填，连接后也能调整）"
        ><el-select v-model="group" clearable placeholder="暂不分组"
          ><el-option
            v-for="item in groups"
            :key="item.id"
            :label="item.name"
            :value="item.id" /></el-select></el-form-item
    ></el-form>
    <el-result
      v-else-if="connectedId"
      icon="success"
      title="教室连接成功"
      :sub-title="`${name} 已完成配对，可以发布内容了。`"
    />
    <div v-else class="pairing-wait">
      <div class="pair-code" data-testid="pairing-code">{{ code }}</div>
      <p v-if="revoked" class="field-error">此配对码已撤销，请重新生成。</p>
      <p v-else-if="expired" class="field-error">配对码已过期，请重新生成。</p>
      <template v-else
        ><p role="status">等待教室设备输入配对码…</p>
        <p class="muted">
          {{ Math.floor(seconds / 60) }} 分 {{ seconds % 60 }} 秒后过期 · {{ formatTime(expires) }}
        </p>
        <el-button @click="copy">复制配对码</el-button></template
      >
      <details class="developer-help">
        <summary>开发体验：使用模拟设备</summary>
        <p>在已安装 Python 依赖的项目根目录执行，地址为当前网页入口：</p>
        <pre class="code-block">
.\.venv\Scripts\python.exe -m ctx_server.simulator --server "{{
            server
          }}" --state-dir .device-state/classroom-1 --pair {{ code }}</pre>
        <p class="form-hint">
          每台设备使用独立状态目录；保持命令运行以同步和发送结果。模拟设备不会修改桌面客户端。
        </p>
      </details>
    </div>
    <template #footer
      ><el-button v-if="!connectedId" :disabled="busy" @click="close()">暂时关闭</el-button
      ><el-button v-if="code && !connectedId && !revoked && !expired" :loading="busy" @click="revoke"
        >撤销配对码</el-button
      ><el-button
        v-if="!code || ((expired || revoked) && !connectedId)"
        type="primary"
        :loading="busy"
        @click="generate"
        >{{ code ? '重新生成配对码' : '生成配对码' }}</el-button
      ><el-button v-if="connectedId" type="primary" @click="open = false">完成</el-button></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { all, get, patch, post } from '../api'
import { useRefresh } from '../useRefresh'
import { useUnsaved } from '../useUnsaved'
import type { Device, Group, Page, Release } from '../types'
import { formatTime, kindLabel, statusLabel } from '../types'
import { statusAdvice } from '../workflow'
import ChannelStatus from '../components/ChannelStatus.vue'
import LoadNotice from '../components/LoadNotice.vue'
const route = useRoute(),
  device = ref<Device>(),
  groups = ref<Group[]>([]),
  releases = ref<Release[]>([]),
  groupId = ref(''),
  serverGroup = ref(''),
  saving = ref(false),
  actionError = ref('')
const dirty = computed(() => !!device.value && groupId.value !== serverGroup.value)
useUnsaved(dirty, saving)
const refresh = useRefresh(async (options) => {
  const [d, g, r] = await Promise.all([
    get<Device>(`/devices/${route.params.id}`, options),
    all<Group>('/groups', options),
    get<Page<Release>>(`/releases?device_id=${route.params.id}`, options),
  ])
  if (!dirty.value) groupId.value = d.group_id || ''
  serverGroup.value = d.group_id || ''
  device.value = d
  groups.value = g
  releases.value = r.items
})
const { error, loading, ready } = refresh
async function rename() {
  let name: string
  try {
    const result = await ElMessageBox.prompt('教室名称', '重命名教室', {
      inputValue: device.value!.name,
      inputPattern: /\S/,
      inputErrorMessage: '名称不能为空',
    })
    name = result.value
  } catch {
    return
  }
  try {
    await patch(`/devices/${route.params.id}`, { name })
    await refresh()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '重命名失败'
  }
}
async function saveGroup() {
  saving.value = true
  actionError.value = ''
  try {
    await patch(`/devices/${route.params.id}`, { group_id: groupId.value || null })
    serverGroup.value = groupId.value
    ElMessage.success('分组已更新')
    await refresh()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '保存失败，选择已保留'
  } finally {
    saving.value = false
  }
}
async function revoke() {
  try {
    await ElMessageBox.confirm(
      '撤销后此设备无法再同步，已应用内容会留在本机。重新连接需要配对。',
      '撤销教室设备连接',
      { type: 'warning', confirmButtonText: '确认撤销' },
    )
  } catch {
    return
  }
  try {
    await post(`/devices/${route.params.id}/revoke`)
    await refresh()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '撤销失败'
  }
}
</script>
<template>
  <router-link to="/devices" class="text-link">← 返回教室列表</router-link>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" role="alert" />
  <template v-if="ready && device">
    <section class="panel">
      <div class="section-title">
        <h2>{{ device.name }}</h2>
        <div class="table-actions">
          <el-button @click="rename">重命名</el-button
          ><router-link v-if="!device.revoked_at" :to="`/publish?device=${device.id}`"
            ><el-button type="primary">发布到这里</el-button></router-link
          >
        </div>
      </div>
      <p>
        <el-tag :type="device.online ? 'success' : 'info'">{{
          device.revoked_at ? '连接已撤销' : device.online ? '在线' : '离线'
        }}</el-tag>
        最近同步：{{ formatTime(device.last_seen_at) }}
      </p>
      <p v-if="!device.online && !device.revoked_at" class="form-hint">
        离线时保留最后成功应用的内容，联网后继续接收更新。
      </p>
      <div class="toolbar">
        <el-select v-model="groupId" clearable placeholder="暂不分组" style="width: 220px"
          ><el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id" /></el-select
        ><el-button :loading="saving" :disabled="!dirty" @click="saveGroup">保存分组</el-button>
      </div>
    </section>
    <div class="detail-grid">
      <section v-for="channel in device.channels" :key="channel.kind" class="panel">
        <div class="section-title">
          <h2>{{ kindLabel(channel.kind) }}</h2>
          <ChannelStatus v-if="channel.generation" :channel="channel" /><el-tag v-else type="info"
            >尚未发布</el-tag
          >
        </div>
        <p>
          {{
            channel.generation
              ? statusAdvice(channel.status, channel.reason)
              : '发布内容到这间教室后，这里会显示是否生效。'
          }}
        </p>
        <p v-if="channel.reason" class="field-error">设备报告：{{ channel.reason }}</p>
        <details>
          <summary>技术详情</summary>
          <p class="id-text">目标版本：{{ channel.target_version_id || '—' }}</p>
          <p>目标代次 {{ channel.generation }} · 已应用代次 {{ channel.applied_generation }}</p>
          <p class="id-text">已应用版本：{{ channel.applied_version_id || '—' }}</p>
        </details>
      </section>
    </div>
    <section class="panel">
      <h2>最近发布</h2>
      <router-link v-for="item in releases" :key="item.id" :to="`/releases/${item.id}`" class="release-row"
        ><strong>{{ item.note || '课表与展示更新' }}</strong
        ><span class="muted">{{ formatTime(item.created_at) }} →</span></router-link
      ><el-empty v-if="!releases.length" description="还没有向这间教室发布内容" :image-size="60" />
    </section>
    <details class="panel">
      <summary>连接信息与技术记录</summary>
      <p class="id-text">设备 ID：{{ device.id }}</p>
      <p>客户端版本：{{ device.client_version || '未上报' }}</p>
      <el-table :data="device.receipts || []"
        ><el-table-column label="类型" width="110"
          ><template #default="{ row }">{{ kindLabel(row.kind) }}</template></el-table-column
        ><el-table-column prop="generation" label="代次" width="70" /><el-table-column
          prop="attempt"
          label="尝试"
          width="70"
        /><el-table-column label="结果" width="110"
          ><template #default="{ row }">{{ statusLabel(row.result) }}</template></el-table-column
        ><el-table-column prop="reason" label="设备报告" min-width="150" /><el-table-column
          label="时间"
          min-width="170"
          ><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column
        ></el-table
      ><el-button type="danger" plain :disabled="!!device.revoked_at" @click="revoke">{{
        device.revoked_at ? '连接已撤销' : '撤销设备连接'
      }}</el-button>
    </details>
  </template>
</template>

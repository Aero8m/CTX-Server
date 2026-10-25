<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { all, get, patch, post } from '../api'
import { useRefresh } from '../useRefresh'
import type { Device, Group, Page, Release } from '../types'
import { formatTime, kindLabel, statusLabel } from '../types'
import ChannelStatus from '../components/ChannelStatus.vue'
const route = useRoute(),
  device = ref<Device>(),
  groups = ref<Group[]>([]),
  releases = ref<Release[]>([]),
  groupId = ref(''),
  saving = ref(false)
const refresh = useRefresh(async (options) => {
  device.value = await get(`/devices/${route.params.id}`, options)
  groupId.value = device.value!.group_id || ''
  groups.value = await all('/groups', options)
  releases.value = (await get<Page<Release>>(`/releases?device_id=${route.params.id}`, options)).items
})
async function rename() {
  try {
    const { value } = await ElMessageBox.prompt('新设备名称', '重命名设备', {
      inputValue: device.value!.name,
      inputPattern: /\S/,
      inputErrorMessage: '名称不能为空',
    })
    await patch(`/devices/${route.params.id}`, { name: value })
    await refresh()
  } catch {
    /* Cancel or API handled. */
  }
}
async function saveGroup() {
  saving.value = true
  try {
    await patch(`/devices/${route.params.id}`, { group_id: groupId.value || null })
    ElMessage.success('分组已更新')
    await refresh()
  } finally {
    saving.value = false
  }
}
async function revoke() {
  try {
    await ElMessageBox.confirm(
      '撤销后设备将无法同步或下载，已应用内容仍留在本机。重新接入需重新配对。',
      '撤销设备凭证',
      { type: 'warning', confirmButtonText: '确认撤销' },
    )
    await post(`/devices/${route.params.id}/revoke`)
    await refresh()
  } catch {
    /* Cancel or API handled. */
  }
}
</script>
<template>
  <el-button text @click="$router.push('/devices')" style="margin-bottom: 15px">← 返回设备列表</el-button
  ><template v-if="device"
    ><section class="panel">
      <div class="section-title">
        <h2>{{ device.name }}</h2>
        <div class="table-actions">
          <el-button @click="rename">重命名</el-button
          ><el-button type="danger" plain :disabled="!!device.revoked_at" @click="revoke">{{
            device.revoked_at ? '已撤销' : '撤销设备'
          }}</el-button>
        </div>
      </div>
      <el-descriptions :column="2"
        ><el-descriptions-item label="设备 ID"
          ><span class="id-text">{{ device.id }}</span></el-descriptions-item
        ><el-descriptions-item label="连接状态">{{
          device.revoked_at ? '已撤销' : device.online ? '在线' : '离线'
        }}</el-descriptions-item
        ><el-descriptions-item label="最后在线">{{ formatTime(device.last_seen_at) }}</el-descriptions-item
        ><el-descriptions-item label="客户端版本">{{
          device.client_version || '未上报'
        }}</el-descriptions-item></el-descriptions
      >
      <div class="toolbar" style="margin-top: 15px">
        <el-select v-model="groupId" clearable placeholder="未分组" style="width: 220px"
          ><el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id" /></el-select
        ><el-button :loading="saving" @click="saveGroup">保存分组</el-button>
      </div>
    </section>
    <div class="detail-grid">
      <section v-for="channel in device.channels" :key="channel.kind" class="panel">
        <div class="section-title">
          <h2>{{ kindLabel(channel.kind) }}</h2>
          <ChannelStatus v-if="channel.generation" :channel="channel" /><el-tag v-else type="info"
            >未分配</el-tag
          >
        </div>
        <p class="muted">目标分配代次：{{ channel.generation }}</p>
        <p class="muted">
          目标版本：<span class="id-text">{{ channel.target_version_id || '—' }}</span>
        </p>
        <p class="muted">已应用代次：{{ channel.applied_generation }}</p>
        <p class="muted">
          已应用版本：<span class="id-text">{{ channel.applied_version_id || '—' }}</span>
        </p>
        <el-alert
          v-if="channel.reason"
          :title="channel.reason"
          :type="channel.status === 'failed' ? 'error' : 'warning'"
          :closable="false"
        />
      </section>
    </div>
    <section class="panel">
      <h2>最近应用回执</h2>
      <el-table :data="device.receipts"
        ><el-table-column label="类型" width="120"
          ><template #default="{ row }">{{ kindLabel(row.kind) }}</template></el-table-column
        ><el-table-column prop="generation" label="分配代次" width="100" /><el-table-column
          prop="attempt"
          label="尝试"
          width="80"
        /><el-table-column label="结果" width="120"
          ><template #default="{ row }">{{ statusLabel(row.result) }}</template></el-table-column
        ><el-table-column prop="reason" label="原因" min-width="150" show-overflow-tooltip /><el-table-column
          label="接收时间"
          min-width="180"
          ><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column
        ></el-table
      >
    </section>
    <section class="panel">
      <h2>最近发布</h2>
      <el-table :data="releases"
        ><el-table-column prop="note" label="发布说明" min-width="200" /><el-table-column
          label="时间"
          min-width="180"
          ><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column
        ><el-table-column label="查看" width="90"
          ><template #default="{ row }"
            ><router-link :to="'/releases?id=' + row.id"
              ><el-button link type="primary">详情</el-button></router-link
            ></template
          ></el-table-column
        ></el-table
      >
    </section></template
  >
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError, all, get, post } from '../api'
import type { RequestOptions } from '../api'
import { useRefresh } from '../useRefresh'
import type { Device, Group, Page, Preview, Release, Resource } from '../types'
import { formatTime, kindLabel, statusLabel } from '../types'
import ChannelStatus from '../components/ChannelStatus.vue'
const route = useRoute(),
  items = ref<Release[]>([]),
  page = ref(1),
  total = ref(0),
  resources = ref<Resource[]>([]),
  devices = ref<Device[]>([]),
  groups = ref<Group[]>([])
const compose = ref(false),
  detailOpen = ref(false),
  detail = ref<Release>(),
  rollback = ref<Release>(),
  profileId = ref(''),
  displayId = ref(''),
  deviceIds = ref<string[]>([]),
  groupIds = ref<string[]>([]),
  note = ref(''),
  preview = ref<Preview>(),
  busy = ref(false),
  error = ref('')
let frozenBody: Record<string, unknown> | undefined,
  idempotencyKey = '',
  openedQuery = false
const profileOptions = computed(() => resources.value.filter((r) => r.kind === 'profile'))
const displayOptions = computed(() => resources.value.filter((r) => r.kind === 'display_config'))
const refresh = useRefresh(async (options) => {
  const data = await get<Page<Release>>(`/releases?page=${page.value}`, options)
  items.value = data.items
  total.value = data.total
  if (detailOpen.value && detail.value) detail.value = await get(`/releases/${detail.value.id}`, options)
  if (!openedQuery && route.query.id) {
    openedQuery = true
    await showDetail(String(route.query.id), options)
  }
})
async function showDetail(id: string, options: RequestOptions = {}) {
  detail.value = await get(`/releases/${id}`, options)
  detailOpen.value = true
}
async function openCompose(source?: Release) {
  rollback.value = source
  preview.value = undefined
  frozenBody = undefined
  idempotencyKey = ''
  error.value = ''
  profileId.value = ''
  displayId.value = ''
  deviceIds.value = []
  groupIds.value = []
  note.value = source ? '回滚发布 ' + source.id.slice(0, 8) : ''
  resources.value = await all('/resources')
  devices.value = await all('/devices?revoked=false')
  groups.value = await all('/groups')
  compose.value = true
}
function invalidate() {
  preview.value = undefined
  frozenBody = undefined
  idempotencyKey = ''
}
async function makePreview() {
  const selected = [profileId.value, displayId.value].filter(Boolean).map((id) => {
    const resource = resources.value.find((r) => r.id === id)!
    return { id, revision: resource.revision }
  })
  if (!rollback.value && !selected.length) {
    error.value = '请至少选择一个课表档案或展示配置'
    return
  }
  if (!deviceIds.value.length && !groupIds.value.length) {
    error.value = '请至少选择一台设备或一个分组'
    return
  }
  busy.value = true
  error.value = ''
  try {
    frozenBody = {
      ...(!rollback.value ? { resources: selected } : {}),
      device_ids: [...deviceIds.value],
      group_ids: [...groupIds.value],
      note: note.value,
    }
    const path = rollback.value ? `/releases/${rollback.value.id}/rollback/preview` : '/releases/preview'
    preview.value = await post<Preview>(path, frozenBody)
    idempotencyKey = crypto.randomUUID()
  } catch (reason) {
    if (reason instanceof ApiError) error.value = reason.message
    frozenBody = undefined
  } finally {
    busy.value = false
  }
}
async function confirmPublish() {
  if (!preview.value || !frozenBody || !idempotencyKey) return
  busy.value = true
  error.value = ''
  try {
    const path = rollback.value ? `/releases/${rollback.value.id}/rollback` : '/releases'
    const result = await post<Release>(path, frozenBody, {
      'Idempotency-Key': idempotencyKey,
      'X-Preview-Token': preview.value.preview_token,
    })
    compose.value = false
    ElMessage.success('发布成功，等待设备同步与应用')
    await refresh()
    await showDetail(result.id)
  } catch (reason) {
    if (reason instanceof ApiError) {
      error.value = reason.message
      if (['preview_changed', 'revision_conflict'].includes(reason.code)) invalidate()
    }
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel">
    <div class="section-title">
      <h2>发布记录</h2>
      <el-button type="primary" @click="openCompose()">新建发布</el-button>
    </div>
    <el-table :data="items"
      ><el-table-column label="发布" min-width="200"
        ><template #default="{ row }"
          ><span class="device-name">{{ row.note || '未填写说明' }}</span>
          <div class="id-text">{{ row.id.slice(0, 12) }}</div></template
        ></el-table-column
      ><el-table-column label="内容" min-width="170"
        ><template #default="{ row }"
          ><span v-for="version in row.versions" :key="version.id"
            ><el-tag size="small" type="info" style="margin-right: 5px">{{
              kindLabel(version.kind)
            }}</el-tag></span
          ></template
        ></el-table-column
      ><el-table-column prop="target_count" label="设备数" width="90" /><el-table-column
        label="时间"
        min-width="170"
        ><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column
      ><el-table-column label="操作" width="140"
        ><template #default="{ row }"
          ><div class="table-actions">
            <el-button link type="primary" @click="showDetail(row.id)">详情</el-button
            ><el-button link @click="openCompose(row)">回滚</el-button>
          </div></template
        ></el-table-column
      ><template #empty><el-empty description="还没有发布，准备好草稿后创建第一次发布" /></template
    ></el-table>
  </section>
  <el-pagination
    v-model:current-page="page"
    :total="total"
    :page-size="20"
    layout="prev,pager,next,total"
    @current-change="refresh"
  />
  <el-dialog
    v-model="compose"
    :title="rollback ? '回滚为新发布' : '新建发布'"
    width="850px"
    :close-on-click-modal="!busy"
    :show-close="!busy"
    ><el-alert
      :title="
        rollback
          ? '复制历史内容生成新版本。选择本次目标设备后预览，原发布保持不变。'
          : '课表和展示配置分别应用、分别回执。分组只在此次发布时展开为固定设备名单。'
      "
      type="info"
      :closable="false"
    /><el-form label-position="top" :disabled="busy"
      ><div v-if="!rollback" class="two-columns">
        <el-form-item label="课表档案（可选）"
          ><el-select v-model="profileId" clearable placeholder="不更新课表" @change="invalidate"
            ><el-option
              v-for="resource in profileOptions"
              :key="resource.id"
              :label="`${resource.name} · r${resource.revision}`"
              :value="resource.id" /></el-select></el-form-item
        ><el-form-item label="展示配置（可选）"
          ><el-select v-model="displayId" clearable placeholder="不更新配置" @change="invalidate"
            ><el-option
              v-for="resource in displayOptions"
              :key="resource.id"
              :label="`${resource.name} · r${resource.revision}`"
              :value="resource.id" /></el-select
        ></el-form-item>
      </div>
      <el-form-item label="目标设备"
        ><el-select v-model="deviceIds" multiple filterable placeholder="选择设备" @change="invalidate"
          ><el-option
            v-for="device in devices"
            :key="device.id"
            :label="device.name"
            :value="device.id" /></el-select></el-form-item
      ><el-form-item label="按分组批量选择"
        ><el-select v-model="groupIds" multiple placeholder="选择分组" @change="invalidate"
          ><el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id" /></el-select></el-form-item
      ><el-form-item label="发布说明"
        ><el-input
          v-model="note"
          maxlength="500"
          placeholder="例如：下周课表与高考倒计时"
          @input="invalidate" /></el-form-item
    ></el-form>
    <p v-if="error" role="alert" class="error-details">{{ error }}</p>
    <template v-if="preview"
      ><h3 style="font-size: 15px">确认设备名单 · {{ preview.devices.length }} 台</h3>
      <div class="preview-targets">
        <el-tag v-for="device in preview.devices" :key="device.id" effect="plain"
          >{{ device.name }} <span class="id-text">{{ device.id.slice(0, 6) }}</span></el-tag
        >
      </div>
      <el-collapse
        ><el-collapse-item
          v-for="version in preview.versions"
          :key="version.kind"
          :title="kindLabel(version.kind) + ' · 查看实际发布内容'"
          :name="version.kind"
          ><p class="id-text">SHA-256 {{ version.sha256 }}</p>
          <pre class="code-block">{{ JSON.stringify(version.content, null, 2) }}</pre>
        </el-collapse-item></el-collapse
      >
      <p class="form-hint">
        请核对名单和内容。确认后生成不可变版本，设备通常在 20～30 秒内开始同步。
      </p></template
    ><template #footer
      ><el-button :disabled="busy" @click="compose = false">取消</el-button
      ><el-button :loading="busy" @click="makePreview">{{ preview ? '重新预览' : '预览发布' }}</el-button
      ><el-button v-if="preview" type="primary" :loading="busy" @click="confirmPublish"
        >确认发布</el-button
      ></template
    ></el-dialog
  >
  <el-dialog v-model="detailOpen" title="发布详情" width="1000px"
    ><template v-if="detail"
      ><p>{{ detail.note || '未填写发布说明' }}</p>
      <p class="id-text">{{ detail.id }} · {{ formatTime(detail.created_at) }}</p>
      <el-alert
        v-if="detail.rollback_of"
        :title="'回滚来源：' + detail.rollback_of"
        type="info"
        :closable="false"
      />
      <div class="toolbar">
        <el-tag v-for="version in detail.versions" :key="version.id" type="info"
          >{{ kindLabel(version.kind) }} · {{ version.id.slice(0, 8) }}</el-tag
        >
      </div>
      <el-table :data="detail.targets" row-key="assignment_id"
        ><el-table-column prop="device_name" label="设备" min-width="150" /><el-table-column
          label="类型"
          width="110"
          ><template #default="{ row }">{{ kindLabel(row.kind) }}</template></el-table-column
        ><el-table-column prop="generation" label="代次" width="70" /><el-table-column
          label="结果"
          width="120"
          ><template #default="{ row }"><ChannelStatus :channel="row" /></template></el-table-column
        ><el-table-column label="后续发布" width="100"
          ><template #default="{ row }">{{
            row.superseded ? '已有新目标' : '当前目标'
          }}</template></el-table-column
        ><el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip
      /></el-table>
      <p class="form-hint">历史结果来自该分配的最新尝试回执，不随设备移组改变。</p></template
    ></el-dialog
  >
</template>

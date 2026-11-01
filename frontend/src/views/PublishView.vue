<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { all, ApiError, get, post } from '../api'
import { useRefresh } from '../useRefresh'
import { useUnsaved } from '../useUnsaved'
import type { Device, Group, Preview, Release, Resource } from '../types'
import { kindLabel } from '../types'
import ContentPreview from '../components/ContentPreview.vue'
import LoadNotice from '../components/LoadNotice.vue'
const route = useRoute(),
  router = useRouter()
const restoreId = typeof route.query.restore === 'string' ? route.query.restore : ''
const resources = ref<Resource[]>([]),
  devices = ref<Device[]>([]),
  groups = ref<Group[]>([])
const source = ref<Release>(),
  historical = ref<{ kind: string; content: unknown }[]>([])
const profileId = ref(''),
  displayId = ref(''),
  deviceIds = ref<string[]>([]),
  groupIds = ref<string[]>([]),
  note = ref('')
const step = ref(0),
  preview = ref<Preview>(),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  uncertain = ref(false)
let frozenBody: Record<string, unknown> | undefined,
  idempotencyKey = ''
const refresh = useRefresh(async (options) => {
  const [r, d, g] = await Promise.all([
    all<Resource>('/resources', options),
    all<Device>('/devices?revoked=false', options),
    all<Group>('/groups', options),
  ])
  resources.value = r
  devices.value = d
  groups.value = g
  if (restoreId) {
    const release = await get<Release>(`/releases/${restoreId}`, options)
    const contents = await Promise.all(
      release.versions.map(async (v) => ({
        kind: v.kind,
        content: await get(`/versions/${v.id}/content`, { ...options, raw: true }),
      })),
    )
    source.value = release
    historical.value = contents
    deviceIds.value = [...new Set(release.targets?.map((t) => t.device_id))].filter((id) =>
      d.some((item) => item.id === id),
    )
    note.value = '恢复：' + (release.note || '历史发布内容')
    if (release.targets?.some((t) => !d.some((item) => item.id === t.device_id)))
      notice.value = '部分原教室已撤销，未加入本次名单，请重新核对目标。'
  } else {
    for (const [query, kind, model] of [
      ['profile', 'profile', profileId],
      ['display', 'display_config', displayId],
    ] as const) {
      const id = route.query[query]
      if (typeof id === 'string') {
        const item = r.find((item) => item.id === id && item.kind === kind)
        if (!item) throw new Error('选中的内容不存在或已归档，请返回列表重新选择')
        model.value = item.id
        if (route.query.revision && Number(route.query.revision) !== item.revision)
          notice.value = '内容已有更新，本次将使用最新保存的版本，请重新核对预览。'
      }
    }
    if (typeof route.query.device === 'string') {
      if (!d.some((item) => item.id === route.query.device))
        throw new Error('该教室不存在或已撤销，请返回教室列表重新选择')
      deviceIds.value = [route.query.device]
    }
  }
}, 0)
const { error: loadError, loading, ready } = refresh
const profileOptions = computed(() => resources.value.filter((r) => r.kind === 'profile'))
const displayOptions = computed(() => resources.value.filter((r) => r.kind === 'display_config'))
const selectedDevices = computed(() =>
  devices.value.filter(
    (d) => deviceIds.value.includes(d.id) || (d.group_id && groupIds.value.includes(d.group_id)),
  ),
)
const viaGroup = (device: Device) => !!device.group_id && groupIds.value.includes(device.group_id)
const dirty = computed(() => uncertain.value)
useUnsaved(dirty, busy, '提交结果尚未确认。建议先重试确认；离开后请到发布记录核对，避免重复发布。')
watch(
  [profileId, displayId, deviceIds, groupIds, note],
  () => {
    if (!uncertain.value) {
      preview.value = undefined
      frozenBody = undefined
      idempotencyKey = ''
    }
  },
  { deep: true },
)
function next() {
  error.value = ''
  if (!restoreId && !profileId.value && !displayId.value) {
    error.value = '请选择课表，或选择要更新的客户端配置'
    return
  }
  step.value = 1
}
function previous() {
  step.value -= 1
  error.value = ''
}
async function makePreview() {
  if (busy.value || uncertain.value) return
  error.value = ''
  if (!selectedDevices.value.length) {
    error.value = '请至少选择一间教室'
    return
  }
  busy.value = true
  try {
    // Re-read resource revisions; the server validates the expanded group membership.
    const refs = await Promise.all(
      [profileId.value, displayId.value].filter(Boolean).map(async (id) => {
        const item = await get<Resource>(`/resources/${id}`, { reportError: false })
        return { id, revision: item.revision }
      }),
    )
    frozenBody = {
      ...(!restoreId ? { resources: refs } : {}),
      device_ids: [...deviceIds.value],
      group_ids: [...groupIds.value],
      note: note.value,
    }
    preview.value = await post<Preview>(
      restoreId ? `/releases/${restoreId}/rollback/preview` : '/releases/preview',
      frozenBody,
    )
    idempotencyKey = crypto.randomUUID()
    step.value = 2
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览失败，请重试'
    frozenBody = undefined
  } finally {
    busy.value = false
  }
}
async function confirmPublish() {
  if (busy.value || !preview.value || !frozenBody || !idempotencyKey) return
  busy.value = true
  error.value = ''
  try {
    const result = await post<Release>(
      restoreId ? `/releases/${restoreId}/rollback` : '/releases',
      frozenBody,
      { 'Idempotency-Key': idempotencyKey, 'X-Preview-Token': preview.value.preview_token },
    )
    uncertain.value = false
    busy.value = false
    ElMessage.success('已提交，等待教室同步')
    await router.push(`/releases/${result.id}`)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '提交失败，请重试'
    if (
      reason instanceof ApiError &&
      [
        'preview_changed',
        'revision_conflict',
        'resource_archived',
        'device_revoked',
        'no_targets',
        'not_found',
        'validation_error',
      ].includes(reason.code)
    ) {
      uncertain.value = false
      preview.value = undefined
      frozenBody = undefined
      idempotencyKey = ''
      step.value = 1
      error.value += '。请核对内容和教室，重新预览。'
    } else {
      uncertain.value = true
      error.value += '。暂时无法确认提交结果，请使用下方按钮重试；会沿用同一请求，避免重复发布。'
    }
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <LoadNotice :error="loadError" :loading="loading" @retry="refresh" />
  <section v-if="ready" class="panel publish-panel" :aria-busy="busy">
    <el-steps :active="step" finish-status="success" simple
      ><el-step title="选择内容" /><el-step title="选择教室" /><el-step title="确认发布"
    /></el-steps>
    <el-alert v-if="notice" :title="notice" type="warning" :closable="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" role="alert" />
    <el-alert
      v-if="restoreId"
      title="恢复这次内容会创建一条新发布。请核对历史内容和本次教室名单。"
      type="info"
      :closable="false"
    />
    <div v-if="step === 0" class="wizard-body">
      <template v-if="source"
        ><h2>恢复：{{ source.note || '历史发布内容' }}</h2>
        <ContentPreview v-for="(item, i) in historical" :key="i" :kind="item.kind" :content="item.content"
      /></template>
      <el-form v-else label-position="top">
        <h2>这次要更新什么？</h2>
        <el-form-item label="课表"
          ><el-select
            v-model="profileId"
            clearable
            placeholder="选择课表（也可以只更新客户端配置）"
            data-testid="publish-profile"
            ><el-option
              v-for="item in profileOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></el-select
        ></el-form-item>
        <p v-if="!profileOptions.length">
          <router-link to="/profiles/new" class="text-link">还没有课表，先去新建 →</router-link>
        </p>
        <el-form-item label="客户端配置（可选）"
          ><el-select
            v-model="displayId"
            clearable
            placeholder="不修改教室现有客户端配置"
            data-testid="publish-display"
            ><el-option
              v-for="item in displayOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></el-select
        ></el-form-item>
        <p class="form-hint">
          未选择的内容保持原样。想调整外观？<router-link to="/display" class="text-link"
            >打开我的配置</router-link
          >
        </p>
      </el-form>
    </div>
    <div v-else-if="step === 1" class="wizard-body" :inert="busy || undefined">
      <h2>要发布到哪些教室？</h2>
      <el-checkbox-group v-if="groups.length" v-model="groupIds" class="group-choices"
        ><el-checkbox v-for="group in groups" :key="group.id" :value="group.id"
          >整组：{{ group.name }}</el-checkbox
        ></el-checkbox-group
      >
      <p v-if="groups.length" class="form-hint">按分组选择会在预览时展开为实际名单；确认前请再次核对。</p>
      <el-checkbox-group v-model="deviceIds" class="device-choices"
        ><div v-for="device in devices" :key="device.id" class="device-choice">
          <el-checkbox :value="device.id" :disabled="viaGroup(device)"
            ><strong>{{ device.name }}</strong></el-checkbox
          ><span v-if="viaGroup(device)" class="muted">已随分组选中</span
          ><span class="muted">{{ groups.find((g) => g.id === device.group_id)?.name || '未分组' }}</span
          ><el-tag :type="device.online ? 'success' : 'info'" size="small">{{
            device.online ? '在线' : '离线 · 联网后接收'
          }}</el-tag>
        </div></el-checkbox-group
      >
      <el-empty v-if="!devices.length" description="还没有可发布的教室"
        ><router-link to="/devices?pair=1"
          ><el-button type="primary">连接第一间教室</el-button></router-link
        ></el-empty
      >
      <p>已选择 {{ selectedDevices.length }} 间教室</p>
      <el-form label-position="top"
        ><el-form-item label="发布说明（选填）"
          ><el-input v-model="note" maxlength="500" placeholder="例如：下周课表与考试倒计时" /></el-form-item
      ></el-form>
    </div>
    <div v-else-if="preview" class="wizard-body">
      <h2>确认教室名单 · {{ preview.devices.length }} 间</h2>
      <div class="preview-targets">
        <el-tag v-for="device in preview.devices" :key="device.id" effect="plain">{{ device.name }}</el-tag>
      </div>
      <section v-for="version in preview.versions" :key="version.kind" class="publish-content">
        <ContentPreview :kind="version.kind" :content="version.content" />
        <details>
          <summary>技术详情 · {{ kindLabel(version.kind) }}</summary>
          <p class="id-text">SHA-256 {{ version.sha256 }}</p>
          <pre class="code-block">{{ JSON.stringify(version.content, null, 2) }}</pre>
        </details>
      </section>
      <p class="form-hint">以上是实际发布内容。提交后等待设备同步，收到设备确认才显示“已生效”。</p>
    </div>
    <div class="wizard-footer">
      <el-button v-if="step > 0 && !uncertain" :disabled="busy" @click="previous">上一步</el-button
      ><span class="grow"></span><router-link to="/guide?task=publish" class="text-link">发布帮助</router-link
      ><el-button v-if="step === 0" type="primary" @click="next">下一步：选择教室</el-button
      ><el-button v-else-if="step === 1" type="primary" :loading="busy" @click="makePreview"
        >预览发布</el-button
      ><el-button v-else type="primary" :loading="busy" @click="confirmPublish">{{
        uncertain ? '重试确认提交结果' : '确认发布'
      }}</el-button>
    </div>
  </section>
</template>

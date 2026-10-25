<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { all, get, patch, post, request } from '../api'
import type { RequestOptions } from '../api'
import { useRefresh } from '../useRefresh'
import type { Device, Group, Page } from '../types'
import { formatTime } from '../types'
import ChannelStatus from '../components/ChannelStatus.vue'

const items = ref<Device[]>([]),
  groups = ref<Group[]>([]),
  total = ref(0),
  page = ref(1),
  q = ref(''),
  groupId = ref('')
const busy = ref(false),
  pairing = ref(false),
  manageGroups = ref(false),
  newGroupName = ref(''),
  code = ref(''),
  codeId = ref(''),
  codeExpires = ref('')
const form = reactive({ name: '', group_id: '' })
const onlineCount = computed(() => items.value.filter((d) => d.online).length)
async function load(options: RequestOptions = {}) {
  const data = await get<Page<Device>>(
    `/devices?page=${page.value}&q=${encodeURIComponent(q.value)}${groupId.value ? '&group_id=' + groupId.value : ''}`,
    options,
  )
  items.value = data.items
  total.value = data.total
  groups.value = await all<Group>('/groups', options)
}
const refresh = useRefresh(load)
async function filterChanged() {
  page.value = 1
  await refresh()
}
async function closePairing() {
  pairing.value = false
  await refresh()
}
async function makeCode() {
  if (!form.name.trim()) return ElMessage.warning('请填写设备名称')
  busy.value = true
  try {
    const result = await post<{ code: string; id: string; expires_at: string }>('/pairing-codes', {
      name: form.name,
      group_id: form.group_id || null,
    })
    code.value = result.code
    codeId.value = result.id
    codeExpires.value = result.expires_at
  } finally {
    busy.value = false
  }
}
async function cancelCode() {
  await post(`/pairing-codes/${codeId.value}/revoke`)
  code.value = ''
  ElMessage.success('配对码已撤销')
}
async function addGroup() {
  if (!newGroupName.value.trim()) return
  await post('/groups', { name: newGroupName.value })
  newGroupName.value = ''
  await load()
}
async function renameGroup(group: Group) {
  try {
    const { value } = await ElMessageBox.prompt('填写新的分组名称', '重命名分组', {
      inputValue: group.name,
      inputPattern: /\S/,
      inputErrorMessage: '名称不能为空',
    })
    await patch(`/groups/${group.id}`, { name: value })
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') console.error('Group update failed')
  }
}
async function deleteGroup(group: Group) {
  try {
    await ElMessageBox.confirm('设备将恢复未分组，历史发布不受影响。', `删除「${group.name}」`, {
      type: 'warning',
    })
    await request(`/groups/${group.id}`, { method: 'DELETE' })
    await load()
  } catch {
    /* Cancel or API already reported. */
  }
}
function openPairing() {
  form.name = ''
  form.group_id = ''
  code.value = ''
  pairing.value = true
}
</script>
<template>
  <div class="stats">
    <div class="stat">
      <span class="stat-label">设备总数 · 当前筛选</span
      ><span class="stat-number">{{ total }}<small>台设备</small></span>
    </div>
    <div class="stat">
      <span class="stat-label">当前页在线</span
      ><span class="stat-number" style="color: #238d75">{{ onlineCount }}<small>正在保持连接</small></span>
    </div>
    <div class="stat">
      <span class="stat-label">设备分组</span
      ><span class="stat-number">{{ groups.length }}<small>个分组</small></span>
    </div>
  </div>
  <section class="panel">
    <div class="section-title">
      <h2>我的设备</h2>
      <div class="table-actions">
        <el-button @click="manageGroups = true">管理分组</el-button
        ><el-button type="primary" :icon="Plus" @click="openPairing">配对设备</el-button>
      </div>
    </div>
    <div class="toolbar">
      <el-input
        v-model="q"
        placeholder="搜索设备名称"
        :prefix-icon="Search"
        clearable
        style="width: 240px"
        @keyup.enter="filterChanged"
        @clear="filterChanged"
      /><el-select
        v-model="groupId"
        placeholder="全部分组"
        clearable
        style="width: 180px"
        @change="filterChanged"
        ><el-option
          v-for="group in groups"
          :key="group.id"
          :label="group.name"
          :value="group.id" /></el-select
      ><el-button :icon="Refresh" circle aria-label="刷新设备" @click="refresh" /><span class="grow"></span
      ><span class="muted">每 10 秒更新</span>
    </div>
    <el-table :data="items" row-key="id"
      ><el-table-column label="设备" min-width="175"
        ><template #default="{ row }"
          ><router-link :to="'/devices/' + row.id" class="device-name">{{ row.name }}</router-link>
          <div class="id-text">{{ row.id.slice(0, 12) }}</div></template
        ></el-table-column
      ><el-table-column label="连接" width="105"
        ><template #default="{ row }"
          ><el-tag
            :type="row.revoked_at ? 'danger' : row.online ? 'success' : 'info'"
            size="small"
            effect="plain"
            >{{ row.revoked_at ? '已撤销' : row.online ? '在线' : '离线' }}</el-tag
          ></template
        ></el-table-column
      ><el-table-column label="分组" min-width="110"
        ><template #default="{ row }">{{
          groups.find((g) => g.id === row.group_id)?.name || '未分组'
        }}</template></el-table-column
      ><el-table-column label="课表" width="100"
        ><template #default="{ row }"
          ><ChannelStatus
            :channel="
              row.channels.find((c: any) => c.kind === 'profile' && c.generation > 0)
            " /></template></el-table-column
      ><el-table-column label="展示配置" width="110"
        ><template #default="{ row }"
          ><ChannelStatus
            :channel="
              row.channels.find((c: any) => c.kind === 'display_config' && c.generation > 0)
            " /></template></el-table-column
      ><el-table-column label="最后在线" min-width="170"
        ><template #default="{ row }">{{ formatTime(row.last_seen_at) }}</template></el-table-column
      ><el-table-column width="70"
        ><template #default="{ row }"
          ><router-link :to="'/devices/' + row.id"
            ><el-button link type="primary">详情</el-button></router-link
          ></template
        ></el-table-column
      ><template #empty><el-empty description="还没有设备，生成配对码开始连接" /></template
    ></el-table>
    <el-pagination
      v-model:current-page="page"
      :total="total"
      :page-size="20"
      layout="prev,pager,next,total"
      @current-change="refresh"
    />
  </section>
  <el-dialog v-model="pairing" title="配对新设备" width="480px"
    ><template v-if="!code"
      ><p class="muted">配对码 10 分钟内有效，只能绑定一台设备。</p>
      <el-form label-position="top"
        ><el-form-item label="设备名称"
          ><el-input v-model="form.name" maxlength="100" placeholder="例如：高一（1）班教室" /></el-form-item
        ><el-form-item label="所属分组"
          ><el-select v-model="form.group_id" clearable placeholder="未分组"
            ><el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id" /></el-select></el-form-item></el-form></template
    ><template v-else
      ><div class="pair-code" data-testid="pairing-code">{{ code }}</div>
      <p class="muted">有效期至 {{ formatTime(codeExpires) }}。请在客户端输入此码。</p>
      <el-alert
        title="配对码关闭后无法再次查看，可撤销后重新生成。"
        type="info"
        :closable="false" /></template
    ><template #footer
      ><el-button v-if="code" @click="cancelCode">撤销配对码</el-button
      ><el-button v-else type="primary" :loading="busy" @click="makeCode">生成配对码</el-button
      ><el-button @click="closePairing">{{ code ? '完成' : '取消' }}</el-button></template
    ></el-dialog
  >
  <el-dialog v-model="manageGroups" title="管理设备分组" width="520px"
    ><div class="toolbar">
      <el-input
        v-model="newGroupName"
        maxlength="100"
        placeholder="新分组名称"
        style="flex: 1"
        @keyup.enter="addGroup"
      /><el-button type="primary" @click="addGroup">添加</el-button>
    </div>
    <el-table :data="groups"
      ><el-table-column prop="name" label="分组名称" /><el-table-column label="操作" width="145"
        ><template #default="{ row }"
          ><div class="table-actions">
            <el-button link @click="renameGroup(row)">重命名</el-button
            ><el-button link type="danger" @click="deleteGroup(row)">删除</el-button>
          </div></template
        ></el-table-column
      ></el-table
    ></el-dialog
  >
</template>

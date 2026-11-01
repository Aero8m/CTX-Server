<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { all, get, patch, post, request } from '../api'
import { useRefresh } from '../useRefresh'
import type { Device, Group, Page } from '../types'
import { formatTime } from '../types'
import ChannelStatus from '../components/ChannelStatus.vue'
import PairingWizard from '../components/PairingWizard.vue'
import LoadNotice from '../components/LoadNotice.vue'
const route = useRoute(),
  router = useRouter()
const items = ref<Device[]>([]),
  groups = ref<Group[]>([]),
  total = ref(0),
  page = ref(1),
  q = ref(''),
  groupId = ref(''),
  showRevoked = ref(false)
const pairing = ref(route.query.pair === '1'),
  manageGroups = ref(false),
  newGroupName = ref(''),
  groupBusy = ref(false),
  groupError = ref('')
const onlineCount = computed(() => items.value.filter((d) => d.online && !d.revoked_at).length)
const refresh = useRefresh(async (options) => {
  const [data, g] = await Promise.all([
    get<Page<Device>>(
      `/devices?page=${page.value}&q=${encodeURIComponent(q.value)}${groupId.value ? '&group_id=' + groupId.value : ''}${showRevoked.value ? '' : '&revoked=false'}`,
      options,
    ),
    all<Group>('/groups', options),
  ])
  items.value = data.items
  total.value = data.total
  groups.value = g
})
const { error, loading, ready } = refresh
watch(
  () => route.query.pair,
  (value) => {
    if (value === '1') pairing.value = true
  },
)
watch(pairing, (value) => {
  if (!value && route.query.pair) void router.replace('/devices')
})
function filterChanged() {
  page.value = 1
  void refresh()
}
async function addGroup() {
  if (!newGroupName.value.trim() || groupBusy.value) return
  groupBusy.value = true
  groupError.value = ''
  try {
    await post('/groups', { name: newGroupName.value.trim() })
    newGroupName.value = ''
    await refresh()
  } catch (reason) {
    groupError.value = reason instanceof Error ? reason.message : '添加失败，请重试'
  } finally {
    groupBusy.value = false
  }
}
async function renameGroup(group: Group) {
  let name: string
  try {
    const result = await ElMessageBox.prompt('填写新的分组名称', '重命名分组', {
      inputValue: group.name,
      inputPattern: /\S/,
      inputErrorMessage: '名称不能为空',
    })
    name = result.value
  } catch {
    return
  }
  try {
    await patch(`/groups/${group.id}`, { name })
    await refresh()
  } catch (reason) {
    groupError.value = reason instanceof Error ? reason.message : '重命名失败'
  }
}
async function deleteGroup(group: Group) {
  try {
    await ElMessageBox.confirm('教室会恢复未分组，历史发布不受影响。', `删除「${group.name}」`, {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await request(`/groups/${group.id}`, { method: 'DELETE' })
    await refresh()
  } catch (reason) {
    groupError.value = reason instanceof Error ? reason.message : '删除失败'
  }
}
</script>
<template>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <section class="panel">
    <div class="section-title">
      <div>
        <h2>我的教室</h2>
        <p v-if="ready" class="muted">当前筛选共 {{ total }} 台 · 当前页在线 {{ onlineCount }} 台</p>
      </div>
      <div class="table-actions">
        <el-button @click="manageGroups = true">管理分组</el-button
        ><el-button type="primary" @click="pairing = true">连接教室</el-button>
      </div>
    </div>
    <div class="toolbar">
      <el-input
        v-model="q"
        placeholder="搜索教室名称"
        clearable
        style="max-width: 220px"
        @keyup.enter="filterChanged"
        @clear="filterChanged"
      /><el-select
        v-model="groupId"
        clearable
        placeholder="全部分组"
        style="width: 180px"
        @change="filterChanged"
        ><el-option
          v-for="group in groups"
          :key="group.id"
          :label="group.name"
          :value="group.id" /></el-select
      ><el-switch v-model="showRevoked" active-text="包含已撤销" @change="filterChanged" /><el-button
        :loading="loading"
        @click="refresh"
        >刷新</el-button
      >
    </div>
    <div class="resource-cards">
      <article v-for="item in items" :key="item.id" class="resource-card">
        <div class="section-title">
          <router-link :to="`/devices/${item.id}`" class="device-name">{{ item.name }}</router-link
          ><el-tag :type="item.revoked_at ? 'danger' : item.online ? 'success' : 'info'">{{
            item.revoked_at ? '已撤销' : item.online ? '在线' : '离线'
          }}</el-tag>
        </div>
        <p class="muted">
          {{ groups.find((g) => g.id === item.group_id)?.name || '未分组' }} · 最近同步
          {{ formatTime(item.last_seen_at) }}
        </p>
        <p>
          课表
          <ChannelStatus :channel="item.channels.find((c) => c.kind === 'profile' && c.generation > 0)" /> ·
          客户端配置
          <ChannelStatus
            :channel="item.channels.find((c) => c.kind === 'display_config' && c.generation > 0)"
          />
        </p>
        <div class="table-actions">
          <router-link :to="`/devices/${item.id}`"><el-button>查看教室</el-button></router-link
          ><router-link v-if="!item.revoked_at" :to="`/publish?device=${item.id}`"
            ><el-button type="primary" plain>发布到这里</el-button></router-link
          >
        </div>
      </article>
    </div>
    <el-empty
      v-if="ready && !items.length"
      :description="q || groupId ? '没有符合条件的教室' : '还没有教室，连接后即可发布课表'"
      ><el-button v-if="!q && !groupId" type="primary" @click="pairing = true"
        >连接第一间教室</el-button
      ></el-empty
    >
    <el-pagination
      v-if="total > 20"
      v-model:current-page="page"
      :total="total"
      :page-size="20"
      layout="prev,pager,next,total"
      @current-change="refresh"
    />
  </section>
  <PairingWizard v-model="pairing" :groups="groups" @connected="refresh" />
  <el-dialog v-model="manageGroups" title="管理教室分组" width="520px"
    ><p v-if="groupError" role="alert" class="field-error">{{ groupError }}</p>
    <div class="toolbar">
      <el-input
        v-model="newGroupName"
        maxlength="100"
        placeholder="新分组名称"
        style="flex: 1"
        @keyup.enter="addGroup"
      /><el-button type="primary" :loading="groupBusy" @click="addGroup">添加</el-button>
    </div>
    <el-table :data="groups"
      ><el-table-column prop="name" label="分组名称" /><el-table-column label="操作" width="145"
        ><template #default="{ row }"
          ><el-button link @click="renameGroup(row)">重命名</el-button
          ><el-button link type="danger" @click="deleteGroup(row)">删除</el-button></template
        ></el-table-column
      ></el-table
    ></el-dialog
  >
</template>

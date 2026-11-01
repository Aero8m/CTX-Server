<script setup lang="ts">
import { ref } from 'vue'
import { patch, get } from '../api'
import { useRefresh } from '../useRefresh'
import { ElMessageBox } from 'element-plus'
import type { Page, Resource } from '../types'
import { formatTime } from '../types'
import LoadNotice from '../components/LoadNotice.vue'
const items = ref<Resource[]>([]),
  page = ref(1),
  total = ref(0),
  archived = ref(false),
  q = ref('')
const refresh = useRefresh(async (options) => {
  const result = await get<Page<Resource>>(
    `/resources?kind=display_config&page=${page.value}&archived=${archived.value}&q=${encodeURIComponent(q.value)}`,
    options,
  )
  items.value = result.items
  total.value = result.total
}, 0)
const { error, loading, ready } = refresh
function filterChanged() {
  page.value = 1
  void refresh()
}
async function archive(resource: Resource) {
  try {
    await ElMessageBox.confirm(
      resource.archived ? '恢复后可以继续编辑和发布。' : '归档后暂时不能发布，历史发布内容会保留。',
      resource.archived ? '恢复配置' : '归档配置',
    )
  } catch {
    return
  }
  await patch(`/resources/${resource.id}`, { revision: resource.revision, archived: !resource.archived })
  await refresh()
}
</script>
<template>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <section class="panel">
    <div class="section-title">
      <h2>我的配置</h2>
      <div class="table-actions">
        <router-link to="/display/new"><el-button type="primary">新建配置</el-button></router-link>
      </div>
    </div>
    <div class="toolbar">
      <el-input
        v-model="q"
        placeholder="搜索配置名称"
        clearable
        style="max-width: 260px"
        @keyup.enter="filterChanged"
        @clear="filterChanged"
      /><el-switch v-model="archived" active-text="已归档" @change="filterChanged" />
    </div>
    <div v-if="ready" class="resource-cards">
      <article v-for="item in items" :key="item.id" class="resource-card">
        <router-link :to="`/display/${item.id}/edit`" class="device-name">{{ item.name }}</router-link>
        <p class="muted">更新于 {{ formatTime(item.updated_at) }}</p>
        <div class="table-actions">
          <router-link :to="`/display/${item.id}/edit`"><el-button>编辑</el-button></router-link
          ><router-link v-if="!item.archived" :to="`/publish?display=${item.id}&revision=${item.revision}`"
            ><el-button type="primary" plain>发布</el-button></router-link
          ><a :href="`/api/v1/resources/${item.id}/content`" download><el-button text>下载</el-button></a
          ><el-button text @click="archive(item)">{{ item.archived ? '恢复' : '归档' }}</el-button>
        </div>
      </article>
    </div>
    <el-empty
      v-if="ready && !items.length"
      :description="
        archived ? '没有已归档的配置' : q ? '没有找到匹配的配置' : '还没有配置，先新建一份客户端配置'
      "
      ><div v-if="!archived && !q" class="table-actions">
        <router-link to="/display/new"><el-button type="primary">新建配置</el-button></router-link>
      </div></el-empty
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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { get } from '../api'
import { useRefresh } from '../useRefresh'
import type { Page, Release } from '../types'
import { formatTime, kindLabel } from '../types'
import { resultSummary } from '../workflow'
import LoadNotice from '../components/LoadNotice.vue'
const route = useRoute(),
  router = useRouter(),
  items = ref<Release[]>([]),
  page = ref(1),
  total = ref(0)
const refresh = useRefresh(async (options) => {
  if (typeof route.query.id === 'string') {
    await router.replace(`/releases/${route.query.id}`)
    return
  }
  const result = await get<Page<Release>>(`/releases?page=${page.value}`, options)
  const details = await Promise.all(result.items.map((item) => get<Release>(`/releases/${item.id}`, options)))
  items.value = details
  total.value = result.total
})
const { error, loading, ready } = refresh
</script>
<template>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <section v-if="ready" class="panel">
    <div class="section-title">
      <h2>发布记录</h2>
      <router-link to="/publish"><el-button type="primary">发布到教室</el-button></router-link>
    </div>
    <div v-for="item in items" :key="item.id" class="release-row">
      <div>
        <router-link :to="`/releases/${item.id}`" class="device-name">{{
          item.note || '课表与展示更新'
        }}</router-link>
        <p class="muted">
          {{ formatTime(item.created_at) }} · {{ item.versions.map((v) => kindLabel(v.kind)).join('、') }} ·
          {{ item.target_count }} 间教室
        </p>
        <p>{{ resultSummary(item.targets) }}</p>
      </div>
      <div class="table-actions">
        <router-link :to="`/releases/${item.id}`"><el-button>查看结果</el-button></router-link
        ><router-link :to="`/publish?restore=${item.id}`"
          ><el-button text>恢复这次内容</el-button></router-link
        >
      </div>
    </div>
    <el-empty v-if="!items.length" description="还没有发布，把保存好的课表送到教室吧"
      ><router-link to="/publish"><el-button type="primary">开始第一次发布</el-button></router-link></el-empty
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

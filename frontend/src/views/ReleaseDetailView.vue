<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { all, get } from '../api'
import { useRefresh } from '../useRefresh'
import type { Device, Release } from '../types'
import { formatTime, kindLabel, statusLabel } from '../types'
import { classroomLabels, classroomResults, resultSummary, statusAdvice } from '../workflow'
import LoadNotice from '../components/LoadNotice.vue'
import ContentPreview from '../components/ContentPreview.vue'
const route = useRoute(),
  release = ref<Release>(),
  devices = ref<Device[]>([])
const contents = ref<{ kind: string; content: unknown }[]>([])
let contentsLoaded = false
const refresh = useRefresh(async (options) => {
  const [result, d] = await Promise.all([
    get<Release>(`/releases/${route.params.id}`, options),
    all<Device>('/devices', options),
  ])
  let content = contents.value
  if (!contentsLoaded)
    content = await Promise.all(
      result.versions.map(async (v) => ({
        kind: v.kind,
        content: await get(`/versions/${v.id}/content`, { ...options, raw: true }),
      })),
    )
  release.value = result
  devices.value = d
  contents.value = content
  contentsLoaded = true
})
const { error, loading, ready } = refresh
const classrooms = computed(() => classroomResults(release.value?.targets || []))
function connection(id: string) {
  const device = devices.value.find((d) => d.id === id)
  return device?.revoked_at ? '连接已撤销' : device?.online ? '设备在线' : '设备离线'
}
</script>
<template>
  <router-link to="/releases" class="text-link">← 返回发布记录</router-link>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <template v-if="ready && release">
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>{{ release.note || '课表与展示更新' }}</h2>
          <p class="muted">{{ formatTime(release.created_at) }} · {{ release.target_count }} 间教室</p>
        </div>
        <el-button :loading="loading" @click="refresh">刷新结果</el-button>
      </div>
      <p role="status" data-testid="release-summary">{{ resultSummary(release.targets) }}</p>
      <p class="form-hint">
        已提交。结果每 10 秒更新；仅在本次全部内容都收到成功确认后，教室才计为“已生效”。
      </p>
      <el-alert
        v-if="release.rollback_of"
        title="这是从历史内容创建的新发布。"
        type="info"
        :closable="false"
      />
    </section>
    <section
      v-for="classroom in classrooms"
      :key="classroom.id"
      class="panel classroom-result"
      :data-testid="`result-${classroom.id}`"
    >
      <div class="section-title">
        <router-link :to="`/devices/${classroom.id}`" class="device-name">{{ classroom.name }}</router-link>
        <div class="table-actions">
          <span class="muted">{{ connection(classroom.id) }}</span
          ><el-tag
            :type="
              classroom.status === 'applied'
                ? 'success'
                : classroom.status === 'attention'
                  ? 'danger'
                  : 'info'
            "
            >{{ classroomLabels[classroom.status] }}</el-tag
          >
        </div>
      </div>
      <details>
        <summary>查看课表与客户端配置的结果</summary>
        <div v-for="target in classroom.targets" :key="target.assignment_id" class="channel-result">
          <strong>{{ kindLabel(target.kind) }} · {{ statusLabel(target.status) }}</strong
          ><el-tag v-if="target.superseded" size="small" type="info">已被后续发布替代</el-tag>
          <p>
            {{
              target.superseded
                ? '当前教室已有更新的内容，请到教室详情查看当前目标。'
                : statusAdvice(target.status, target.reason)
            }}
          </p>
          <p v-if="target.reason" class="form-hint">设备报告：{{ target.reason }}</p>
          <details>
            <summary>技术详情</summary>
            <p class="id-text">
              版本 {{ target.version_id }} · 分配代次 {{ target.generation }} · {{ target.assignment_id }}
            </p>
          </details>
        </div>
      </details>
      <p v-if="classroom.status === 'attention'" class="form-hint">
        展开结果查看原因，处理教室设备上的问题后保持同步。
      </p>
    </section>
    <section class="panel">
      <h2>本次发布内容</h2>
      <ContentPreview
        v-for="(item, index) in contents"
        :key="index"
        :kind="item.kind"
        :content="item.content"
      /><router-link :to="`/publish?restore=${release.id}`"><el-button>恢复这次内容</el-button></router-link>
      <p class="form-hint">恢复会重新确认内容与教室名单，并创建一条新发布。</p>
    </section>
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, get, patch, post } from '../api'
import { useRefresh } from '../useRefresh'
import { useUnsaved } from '../useUnsaved'
import { downloadJson } from '../workflow'
import { defaultDisplay, prepareDisplay } from '../display'
import type { Resource } from '../types'
import type { DisplayConfig } from '../wire'
import LoadNotice from '../components/LoadNotice.vue'
import EditorLayout from '../components/EditorLayout.vue'
import DisplayEditor from '../components/DisplayEditor.vue'
import ManagedSettingsEditor from '../components/ManagedSettingsEditor.vue'

const route = useRoute(),
  router = useRouter()
const selected = ref<Resource>(),
  config = ref<DisplayConfig>(defaultDisplay())
const name = ref('新的配置'),
  baseline = ref(''),
  saving = ref(false)
const error = ref(''),
  conflict = ref(false),
  section = ref('appearance')
const items = [
  { id: 'appearance', label: '外观', icon: 'brush' },
  { id: 'coursebar', label: '课程条', icon: 'switch' },
  { id: 'countdown', label: '桌面倒计时', icon: 'timer' },
  { id: 'windows', label: '窗口拦截', icon: 'shield' },
  { id: 'plugins', label: '插件', icon: 'plugin' },
]
const snapshot = () => JSON.stringify({ name: name.value, config: config.value })
const dirty = computed(() => !!baseline.value && snapshot() !== baseline.value)
const confirmDiscard = useUnsaved(dirty, saving)
function apply(resource?: Resource) {
  if (resource && (resource.kind !== 'display_config' || !resource.content))
    throw new Error('该资源不是可编辑的客户端配置')
  selected.value = resource
  name.value = resource?.name || '新的配置'
  config.value = prepareDisplay(resource?.content)
  error.value = ''
  conflict.value = false
  baseline.value = snapshot()
}
const refresh = useRefresh(async (options) => {
  apply(route.params.id ? await get<Resource>(`/resources/${route.params.id}`, options) : undefined)
}, 0)
const { error: loadError, loading, ready } = refresh
watch(
  () => route.params.id,
  () => {
    void refresh()
  },
)
function backup() {
  downloadJson(config.value, 'client-config.json')
}
async function save(publish = false) {
  if (saving.value) return
  if (!name.value.trim()) {
    error.value = '请填写配置名称'
    return
  }
  const invalidRule =
    config.value.windowInterceptionConfig?.rules.findIndex(
      (rule) => !rule.exePath.trim() || !rule.className.trim(),
    ) ?? -1
  if (invalidRule >= 0) {
    section.value = 'windows'
    error.value = `第${invalidRule + 1}条窗口规则需要填写程序路径和窗口类名`
    return
  }
  saving.value = true
  error.value = ''
  try {
    const content = prepareDisplay(config.value)
    const result = selected.value
      ? await patch<{ resource: Resource }>(`/resources/${selected.value.id}`, {
          revision: selected.value.revision,
          name: name.value.trim(),
          content,
        })
      : await post<{ resource: Resource }>('/resources', {
          kind: 'display_config',
          name: name.value.trim(),
          content,
        })
    apply(result.resource)
    ElMessage.success('配置已保存，发布后教室才会收到更新')
    saving.value = false
    if (publish)
      await router.push(`/publish?display=${result.resource.id}&revision=${result.resource.revision}`)
    else if (!route.params.id) await router.replace(`/display/${result.resource.id}/edit`)
  } catch (reason) {
    conflict.value = reason instanceof ApiError && reason.code === 'revision_conflict'
    error.value = conflict.value
      ? '其他页面已修改配置，当前输入已保留。请下载备份后载入最新内容。'
      : reason instanceof Error
        ? reason.message
        : '保存失败，输入已保留'
  } finally {
    saving.value = false
  }
}
async function discard() {
  if (!(await confirmDiscard())) return
  const saved = JSON.parse(baseline.value)
  name.value = saved.name
  config.value = saved.config
  error.value = ''
  conflict.value = false
}
async function reloadLatest() {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm('这会放弃当前输入，请先下载备份。', '载入最新内容')
  } catch {
    return
  }
  try {
    apply(await get<Resource>(`/resources/${selected.value.id}`))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '载入失败'
  }
}
</script>

<template>
  <router-link to="/display" class="text-link">← 返回我的配置</router-link>
  <LoadNotice :error="loadError" :loading="loading" @retry="refresh" />
  <template v-if="ready">
    <el-alert
      v-if="selected?.archived"
      title="这份配置已归档，恢复后才能发布。"
      type="info"
      :closable="false"
    />
    <el-alert v-if="error" :title="error" type="error" :closable="false" role="alert">
      <template v-if="conflict">
        <el-button @click="backup">下载备份</el-button>
        <el-button @click="reloadLatest">载入最新内容</el-button>
      </template>
    </el-alert>
    <section class="panel">
      <el-form label-position="top" class="display-name-form">
        <el-form-item label="配置名称">
          <el-input v-model="name" maxlength="100" :disabled="saving" placeholder="配置名称" />
        </el-form-item>
      </el-form>
    </section>
    <EditorLayout v-model="section" title="配置编辑" :items="items" :disabled="saving" @save="save()">
      <DisplayEditor v-model="config" :section="section" />
      <ManagedSettingsEditor v-model="config" :section="section" />
      <template #footer>
        <span class="editor-state" role="status">{{
          dirty ? '未保存' : selected ? '已保存' : '尚未保存'
        }}</span>
        <el-button :disabled="saving" @click="backup">下载当前表单</el-button>
        <span class="grow"></span>
        <el-button :disabled="!dirty || saving" @click="discard">放弃更改</el-button>
        <el-button :loading="saving" @click="save()">保存</el-button>
        <el-button type="primary" :loading="saving" :disabled="!!selected?.archived" @click="save(true)"
          >保存并发布</el-button
        >
      </template>
    </EditorLayout>
  </template>
</template>

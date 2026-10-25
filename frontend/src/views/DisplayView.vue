<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, all, get, patch, post } from '../api'
import type { Resource } from '../types'
import type { DisplayConfig, Component } from '../wire'
import { componentLabels, defaultDisplay, makeComponent, moveComponent } from '../display'
const resources = ref<Resource[]>([]),
  selectedId = ref(''),
  selected = ref<Resource>(),
  showArchived = ref(false),
  name = ref('默认展示配置'),
  config = ref<DisplayConfig>(defaultDisplay()),
  saving = ref(false),
  error = ref(''),
  addType = ref<Component['typeId']>('builtin/textTip')
async function load() {
  resources.value = await all<Resource>(`/resources?kind=display_config&archived=${showArchived.value}`)
}
async function createNew() {
  selectedId.value = ''
  showArchived.value = false
  await selectConfig()
  await load()
}
async function filterArchived() {
  selectedId.value = ''
  await selectConfig()
  await load()
}
async function selectConfig() {
  if (!selectedId.value) {
    selected.value = undefined
    config.value = defaultDisplay()
    name.value = '新的展示配置'
    error.value = ''
    return
  }
  selected.value = await get<Resource>(`/resources/${selectedId.value}`)
  name.value = selected.value.name
  config.value = structuredClone(toRaw(selected.value.content)) as unknown as DisplayConfig
  error.value = ''
}
async function save() {
  if (!name.value.trim()) return ElMessage.warning('请填写资源名称')
  saving.value = true
  error.value = ''
  try {
    const result = selected.value
      ? await patch<{ resource: Resource }>(`/resources/${selected.value.id}`, {
          revision: selected.value.revision,
          name: name.value,
          content: config.value,
        })
      : await post<{ resource: Resource }>('/resources', {
          name: name.value,
          kind: 'display_config',
          content: config.value,
        })
    selected.value = result.resource
    selectedId.value = result.resource.id
    config.value = result.resource.content as unknown as DisplayConfig
    await load()
    ElMessage.success('展示配置草稿已保存')
  } catch (reason) {
    if (reason instanceof ApiError)
      error.value =
        reason.code === 'revision_conflict'
          ? '草稿已被其他页面修改。当前表单内容保留，请下载备份后重新加载。'
          : JSON.stringify(reason.details || reason.message, null, 2)
  } finally {
    saving.value = false
  }
}
function backup() {
  const blob = new Blob([JSON.stringify(config.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = 'display-config.json'
  a.click()
  URL.revokeObjectURL(url)
}
async function archive() {
  if (!selected.value) return
  try {
    const restore = selected.value.archived
    await ElMessageBox.confirm(
      restore ? '恢复后可重新发布该草稿。' : '归档后不能再发布该草稿，历史版本仍可使用。',
      restore ? '恢复配置' : '归档配置',
    )
    await patch(`/resources/${selected.value.id}`, { revision: selected.value.revision, archived: !restore })
    selectedId.value = ''
    await selectConfig()
    await load()
  } catch {
    /* Cancel or API handled. */
  }
}
onMounted(load)
</script>
<template>
  <section class="panel">
    <div class="toolbar">
      <el-select
        v-model="selectedId"
        placeholder="新建配置"
        clearable
        style="width: 260px"
        @change="selectConfig"
        ><el-option
          v-for="resource in resources"
          :key="resource.id"
          :label="`${resource.name} · r${resource.revision}`"
          :value="resource.id" /></el-select
      ><el-button @click="createNew">新建配置</el-button>
      <el-switch v-model="showArchived" active-text="已归档" @change="filterArchived" />
      <span class="grow"></span><el-button @click="backup">下载当前表单</el-button
      ><el-button v-if="selected" @click="archive">{{ selected.archived ? '恢复' : '归档' }}</el-button
      ><el-button type="primary" :loading="saving" @click="save">保存草稿</el-button>
    </div>
    <el-input v-model="name" maxlength="100" placeholder="配置资源名称" style="max-width: 420px" />
    <pre v-if="error" role="alert" class="error-details">{{ error }}</pre>
  </section>
  <el-alert
    title="配置仅管理展示字段。UIAccess、插件、窗口拦截、屏幕选择和全局提醒保留设备本机设置。存在插件课程条组件时，客户端会阻塞配置应用。"
    type="info"
    :closable="false"
  />
  <div
    class="course-preview"
    :style="{
      background: config.appearanceConfig?.themeMode === 'light' ? '#e5eff3' : '#153d52',
      color: config.appearanceConfig?.themeMode === 'light' ? '#23495c' : 'white',
    }"
  >
    <template v-for="component in config.courseBarConfig.components" :key="component.instanceId"
      ><span v-if="component.enabled">{{
        component.typeId === 'builtin/date'
          ? '10月25日 · 星期日'
          : component.typeId === 'builtin/courseView'
            ? '语文　数学　英语'
            : component.typeId === 'builtin/countdown'
              ? '距下课 12:30'
              : component.text || '文本提示'
      }}</span></template
    ><small>布局示意</small>
  </div>
  <div class="two-columns">
    <section class="panel">
      <h2>课程条</h2>
      <el-form label-position="top"
        ><el-form-item label="启用课程条"><el-switch v-model="config.courseBarConfig.enable" /></el-form-item>
        <div class="toolbar">
          <el-form-item label="高度（逻辑像素）"
            ><el-input-number v-model="config.courseBarConfig.height" :min="1" :max="1000" /></el-form-item
          ><el-form-item label="组件间距"
            ><el-input-number v-model="config.courseBarConfig.componentSpacing" :min="0" :max="100"
          /></el-form-item></div
      ></el-form>
      <TransitionGroup name="component-list" tag="div" class="component-list">
        <div
          v-for="(component, index) in config.courseBarConfig.components"
          :key="component.instanceId"
          class="component-row"
        >
          <el-switch v-model="component.enabled" size="small" /><span
            style="min-width: 60px; font-size: 13px"
            >{{ componentLabels[component.typeId] }}</span
          ><el-input
            v-if="component.typeId === 'builtin/textTip'"
            v-model="component.text"
            placeholder="提示文字"
            maxlength="1000"
          /><el-input-number
            v-if="component.typeId === 'builtin/courseView'"
            v-model="component.courseSpacing"
            :min="0"
            :max="100"
            size="small"
            style="width: 100px"
          /><span class="grow"></span
          ><el-button
            text
            :disabled="index === 0"
            aria-label="上移组件"
            @click="moveComponent(config, index, -1)"
            >↑</el-button
          ><el-button
            text
            :disabled="index === config.courseBarConfig.components.length - 1"
            aria-label="下移组件"
            @click="moveComponent(config, index, 1)"
            >↓</el-button
          ><el-button
            text
            type="danger"
            aria-label="移除组件"
            @click="config.courseBarConfig.components.splice(index, 1)"
            >×</el-button
          >
        </div>
      </TransitionGroup>
      <div class="toolbar">
        <el-select v-model="addType" style="width: 150px"
          ><el-option
            v-for="(label, type) in componentLabels"
            :key="type"
            :label="label"
            :value="type" /></el-select
        ><el-button
          :disabled="config.courseBarConfig.components.length >= 32"
          @click="config.courseBarConfig.components.push(makeComponent(addType))"
          >添加组件</el-button
        >
      </div>
    </section>
    <section v-if="config.appearanceConfig" class="panel">
      <h2>外观</h2>
      <el-form label-position="top"
        ><el-form-item label="主题色"
          ><el-color-picker v-model="config.appearanceConfig.themeColor" color-format="hex" /></el-form-item
        ><el-form-item label="主题模式"
          ><el-radio-group v-model="config.appearanceConfig.themeMode"
            ><el-radio-button value="system">跟随系统</el-radio-button
            ><el-radio-button value="light">浅色</el-radio-button
            ><el-radio-button value="dark">深色</el-radio-button></el-radio-group
          ></el-form-item
        ><el-form-item label="窗口效果"
          ><el-select v-model="config.appearanceConfig.windowEffect"
            ><el-option
              v-for="effect in ['normal', 'elaMica', 'mica', 'micaAlt', 'acrylic', 'dwmBlur']"
              :key="effect"
              :value="effect"
              :label="effect" /></el-select></el-form-item
      ></el-form>
      <p class="form-hint">示意预览不模拟 Windows 窗口材质，实际显示由客户端系统能力决定。</p>
    </section>
  </div>
  <section v-if="config.desktopCountdownConfig" class="panel">
    <h2>桌面倒计时</h2>
    <el-form label-position="top"
      ><el-form-item label="启用桌面倒计时"
        ><el-switch v-model="config.desktopCountdownConfig.enable"
      /></el-form-item>
      <div class="two-columns">
        <el-form-item label="目标时间（各设备本地时间）"
          ><el-date-picker
            v-model="config.desktopCountdownConfig.targetDateTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择日期和时间"
            :clearable="false" /></el-form-item
        ><el-form-item label="显示毫秒"
          ><el-switch v-model="config.desktopCountdownConfig.showMilliseconds" /></el-form-item
        ><el-form-item label="中文标题"
          ><el-input v-model="config.desktopCountdownConfig.labelTag" maxlength="100" /></el-form-item
        ><el-form-item label="英文标题"
          ><el-input v-model="config.desktopCountdownConfig.englishTag" maxlength="100" /></el-form-item
        ><el-form-item label="原版布局"
          ><el-switch v-model="config.desktopCountdownConfig.useLegacyPlacement" /></el-form-item
        ><el-form-item label="缩放百分比"
          ><el-input-number
            v-model="config.desktopCountdownConfig.scalePercent"
            :min="50"
            :max="200" /></el-form-item
        ><el-form-item label="右侧边距"
          ><el-input-number
            v-model="config.desktopCountdownConfig.rightMargin"
            :min="0"
            :max="10000"
            :disabled="config.desktopCountdownConfig.useLegacyPlacement" /></el-form-item
        ><el-form-item label="底部边距"
          ><el-input-number
            v-model="config.desktopCountdownConfig.bottomMargin"
            :min="0"
            :max="10000"
            :disabled="config.desktopCountdownConfig.useLegacyPlacement"
        /></el-form-item></div
    ></el-form>
    <p class="form-hint">目标时间不带时区，按每台设备的本地时间解释。原版布局会保留但不使用自定义边距。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { DisplayConfig, Component } from '../wire'
import { componentLabels, defaultDisplay, makeComponent, moveComponent } from '../display'
const config = defineModel<DisplayConfig>({ required: true })
defineProps<{ section: string }>()
const addType = ref<Component['typeId']>('builtin/textTip'),
  selectedId = ref(''),
  dragging = ref(''),
  settingsOpen = ref(false)
const components = computed(() => config.value.courseBarConfig.components)
const selected = computed(() => components.value.find((item) => item.instanceId === selectedId.value))
const componentList = ref<HTMLElement>()
watch(
  components,
  () => {
    if (!selected.value) selectedId.value = components.value[0]?.instanceId || ''
  },
  { immediate: true, deep: true },
)
const date = computed({
  get: () => config.value.desktopCountdownConfig?.targetDateTime?.slice(0, 10) || '',
  set: (value: string) => {
    if (config.value.desktopCountdownConfig)
      config.value.desktopCountdownConfig.targetDateTime = value ? `${value}T${time.value}` : ''
  },
})
const time = computed({
  get: () => config.value.desktopCountdownConfig?.targetDateTime?.slice(11, 19) || '00:00:00',
  set: (value: string) => {
    if (config.value.desktopCountdownConfig)
      config.value.desktopCountdownConfig.targetDateTime = date.value ? `${date.value}T${value}` : ''
  },
})
function add() {
  if (components.value.length >= 32) return
  const item = makeComponent(addType.value)
  components.value.push(item)
  selectedId.value = item.instanceId
}
function openSettings(id: string) {
  selectedId.value = id
  settingsOpen.value = true
}
function startDrag(event: DragEvent, id: string) {
  dragging.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function drop(id: string) {
  const from = components.value.findIndex((item) => item.instanceId === dragging.value),
    to = components.value.findIndex((item) => item.instanceId === id)
  dragging.value = ''
  if (from < 0 || to < 0 || from === to) return
  const [item] = components.value.splice(from, 1)
  components.value.splice(to, 0, item!)
  selectedId.value = item!.instanceId
}
async function locate(id: string) {
  selectedId.value = id
  await nextTick()
  Array.from(componentList.value?.querySelectorAll<HTMLElement>('[data-component-id]') || [])
    .find((element) => element.dataset.componentId === id)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
async function reset() {
  try {
    await ElMessageBox.confirm('恢复课程条的默认高度、间距和组件？保存后生效。', '恢复默认')
  } catch {
    return
  }
  config.value.courseBarConfig = defaultDisplay().courseBarConfig
}
function sample(item: Component) {
  if (item.typeId === 'builtin/date') return '周一 11/02'
  if (item.typeId === 'builtin/courseView') return '语文　数学　英语'
  if (item.typeId === 'builtin/countdown') return '00:35:00'
  return item.text || '文本提示'
}
</script>

<template>
  <div v-show="section === 'coursebar'">
    <section class="panel client-card">
      <h3>基本设置</h3>
      <div class="client-setting-row">
        <label for="coursebar-enable">启用课程条</label
        ><el-switch id="coursebar-enable" v-model="config.courseBarConfig.enable" aria-label="启用课程条" />
      </div>
      <div class="client-setting-row">
        <label for="coursebar-height">课程条高度<small>逻辑像素（px）</small></label
        ><el-input-number
          id="coursebar-height"
          v-model="config.courseBarConfig.height"
          :min="1"
          :max="1000"
          :precision="0"
        />
      </div>
      <div class="client-setting-row">
        <label for="component-spacing"
          >控件间距<small>以 49 px 栏高为基准，随高度缩放；0 表示无间距。</small></label
        ><el-input-number
          id="component-spacing"
          v-model="config.courseBarConfig.componentSpacing"
          :min="0"
          :max="100"
          :precision="0"
        />
      </div>
    </section>
    <section class="panel client-card">
      <h3>布局预览</h3>
      <p v-if="!config.courseBarConfig.enable" class="form-hint">课程条已关闭</p>
      <p v-else-if="!components.some((item) => item.enabled)" class="form-hint">暂无启用的组件</p>
      <div
        class="client-layout-preview"
        aria-label="课程条布局预览"
        :style="{
          gap: `${Math.max(4, ((config.courseBarConfig.componentSpacing || 0) * (config.courseBarConfig.height || 49)) / 49)}px`,
        }"
      >
        <span class="preview-collapse">收起</span>
        <TransitionGroup name="component-list" tag="div" class="preview-components">
          <button
            v-for="item in components.filter((component) => component.enabled)"
            :key="item.instanceId"
            type="button"
            class="preview-component"
            :class="{ selected: item.instanceId === selectedId }"
            draggable="true"
            :aria-label="`预览${componentLabels[item.typeId]}`"
            :aria-pressed="item.instanceId === selectedId"
            @click="locate(item.instanceId)"
            @dragstart="startDrag($event, item.instanceId)"
            @dragover.prevent
            @drop.prevent="drop(item.instanceId)"
            @dragend="dragging = ''"
          >
            {{ componentLabels[item.typeId] }}<br /><small>{{ sample(item) }}</small>
          </button>
        </TransitionGroup>
      </div>
      <p class="form-hint">拖动调整顺序，点击定位组件；仅显示已启用的组件。此处为布局示意。</p>
    </section>
    <section class="panel client-card">
      <h3>组件管理</h3>
      <div class="client-toolbar">
        <label>添加组件</label
        ><el-select v-model="addType" aria-label="添加的组件类型"
          ><el-option
            v-for="(label, type) in componentLabels"
            :key="type"
            :label="label"
            :value="type" /></el-select
        ><el-button type="primary" :disabled="components.length >= 32" @click="add">添加</el-button>
      </div>
      <div ref="componentList" aria-label="课程条组件列表">
        <TransitionGroup name="component-list" tag="div" class="component-list">
          <div v-for="(item, index) in components" :key="item.instanceId" class="component-entry">
            <div
              class="client-component-row"
              :class="{ selected: selectedId === item.instanceId }"
              :data-component-id="item.instanceId"
              draggable="true"
              @click="selectedId = item.instanceId"
              @dragstart="startDrag($event, item.instanceId)"
              @dragover.prevent
              @drop.prevent="drop(item.instanceId)"
              @dragend="dragging = ''"
            >
              <span class="component-grip" aria-hidden="true">⠿</span
              ><el-switch
                v-model="item.enabled"
                :aria-label="`启用第${index + 1}个${componentLabels[item.typeId]}组件`"
              />
              <span class="component-name">{{ componentLabels[item.typeId] }}</span>
              <el-button v-if="item.typeId === 'builtin/courseView'" @click="openSettings(item.instanceId)"
                >设置</el-button
              >
              <el-button
                :disabled="index === 0"
                :aria-label="`上移第${index + 1}个组件`"
                @click="moveComponent(config, index, -1)"
                >↑</el-button
              >
              <el-button
                :disabled="index === components.length - 1"
                :aria-label="`下移第${index + 1}个组件`"
                @click="moveComponent(config, index, 1)"
                >↓</el-button
              >
              <el-button :aria-label="`移除第${index + 1}个组件`" @click="components.splice(index, 1)"
                >移除</el-button
              >
            </div>
            <div v-if="item.typeId === 'builtin/textTip'" class="client-component-options">
              <el-input v-model="item.text" aria-label="提示文字" placeholder="提示文字" maxlength="1000" />
            </div>
          </div>
        </TransitionGroup>
      </div>
      <el-empty v-if="!components.length" description="暂无组件" :image-size="60" />
    </section>
    <div class="client-toolbar"><span class="grow"></span><el-button @click="reset">恢复默认</el-button></div>
  </div>
  <div v-show="section === 'appearance'" v-if="config.appearanceConfig">
    <section class="panel client-card">
      <div class="client-setting-row">
        <label for="display-theme-color">主题色</label
        ><el-color-picker
          id="display-theme-color"
          v-model="config.appearanceConfig.themeColor"
          color-format="hex"
          :predefine="['#1191d3', '#0078d4', '#8764b8', '#e74856', '#10893e', '#ff8c00']"
        />
      </div>
    </section>
    <section class="panel client-card">
      <div class="client-setting-row">
        <label for="display-theme-mode">深浅模式</label
        ><el-select id="display-theme-mode" v-model="config.appearanceConfig.themeMode"
          ><el-option label="跟随系统" value="system" /><el-option label="浅色" value="light" /><el-option
            label="深色"
            value="dark"
        /></el-select>
      </div>
    </section>
    <section class="panel client-card">
      <div class="client-setting-row">
        <label for="display-window-effect"
          >窗口效果<small>窗口材质由教室设备的 Windows 版本与系统能力决定。</small></label
        ><el-select id="display-window-effect" v-model="config.appearanceConfig.windowEffect"
          ><el-option
            v-for="effect in [
              { value: 'normal', label: 'Normal' },
              { value: 'elaMica', label: 'ElaMica' },
              { value: 'mica', label: 'Mica' },
              { value: 'micaAlt', label: 'Mica-Alt' },
              { value: 'acrylic', label: 'Acrylic' },
              { value: 'dwmBlur', label: 'Dwm-Blur' },
            ]"
            :key="effect.value"
            :value="effect.value"
            :label="effect.label"
        /></el-select>
      </div>
    </section>
    <p class="form-hint">ElaMica 使用教室设备的桌面壁纸生成模糊背景。主题和窗口效果在发布后由客户端应用。</p>
  </div>
  <div v-show="section === 'countdown'" v-if="config.desktopCountdownConfig">
    <section class="panel client-card">
      <h3>基本设置</h3>
      <div class="client-setting-row">
        <label for="countdown-enable">启用桌面倒计时</label
        ><el-switch id="countdown-enable" v-model="config.desktopCountdownConfig.enable" />
      </div>
      <div class="client-setting-row">
        <label for="countdown-label">中文事件名称</label
        ><el-input id="countdown-label" v-model="config.desktopCountdownConfig.labelTag" maxlength="100" />
      </div>
      <div class="client-setting-row">
        <label for="countdown-english">英文事件名称</label
        ><el-input
          id="countdown-english"
          v-model="config.desktopCountdownConfig.englishTag"
          maxlength="100"
        />
      </div>
      <div class="client-setting-row">
        <label for="countdown-date">目标日期</label
        ><el-date-picker
          id="countdown-date"
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
        />
      </div>
      <div class="client-setting-row">
        <label for="countdown-time">目标时间<small>按各设备的本地时间解释。</small></label
        ><el-time-picker
          id="countdown-time"
          v-model="time"
          format="HH:mm:ss"
          value-format="HH:mm:ss"
          :clearable="false"
          :disabled="!date"
        />
      </div>
      <div class="client-setting-row">
        <label for="countdown-precision">显示精度</label
        ><el-select id="countdown-precision" v-model="config.desktopCountdownConfig.showMilliseconds"
          ><el-option label="毫秒（50ms 刷新）" :value="true" /><el-option
            label="秒（每秒刷新）"
            :value="false"
        /></el-select>
      </div>
    </section>
    <section class="panel client-card">
      <h3>位置与大小</h3>
      <div class="client-setting-row">
        <label for="countdown-placement">布局方式</label
        ><el-select id="countdown-placement" v-model="config.desktopCountdownConfig.useLegacyPlacement"
          ><el-option label="默认" :value="true" /><el-option label="自定义可见边距" :value="false"
        /></el-select>
      </div>
      <div class="client-setting-row">
        <label for="countdown-right">右侧边距（px）</label
        ><el-input-number
          :key="`right-${config.desktopCountdownConfig.useLegacyPlacement}`"
          id="countdown-right"
          v-model="config.desktopCountdownConfig.rightMargin"
          :min="0"
          :max="10000"
          :precision="0"
          :disabled="config.desktopCountdownConfig.useLegacyPlacement"
        />
      </div>
      <div class="client-setting-row">
        <label for="countdown-bottom">底部边距（px）</label
        ><el-input-number
          :key="`bottom-${config.desktopCountdownConfig.useLegacyPlacement}`"
          id="countdown-bottom"
          v-model="config.desktopCountdownConfig.bottomMargin"
          :min="0"
          :max="10000"
          :precision="0"
          :disabled="config.desktopCountdownConfig.useLegacyPlacement"
        />
      </div>
      <div class="client-setting-row">
        <label for="countdown-scale">整体缩放（%）</label
        ><el-input-number
          id="countdown-scale"
          v-model="config.desktopCountdownConfig.scalePercent"
          :min="50"
          :max="200"
          :precision="0"
        />
      </div>
      <p class="form-hint">
        默认沿用原版 ClassTopLand
        的整体留白和右下角位置。选择自定义可见边距后，可设置内容到屏幕可用区域的距离。
      </p>
    </section>
  </div>
  <el-dialog class="client-editor-dialog" v-model="settingsOpen" title="课程显示组件设置" width="440px">
    <template v-if="selected?.typeId === 'builtin/courseView'">
      <div class="client-setting-row">
        <label>课程间距（px）</label
        ><el-input-number
          v-model="selected.courseSpacing"
          :min="0"
          :max="100"
          :precision="0"
          aria-label="课程间距"
        />
      </div>
      <p class="form-hint">
        以 49 px 栏高为基准，随高度同比缩放。当前间距：{{
          !selected.courseSpacing
            ? 0
            : Math.max(1, Math.round((selected.courseSpacing * (config.courseBarConfig.height || 49)) / 49))
        }}
        px
      </p>
    </template>
    <template #footer><el-button type="primary" @click="settingsOpen = false">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { NativeProfile, TimeRange } from '../wire'
import { cloneJson, nextTimeSlot, timeRangeIssues, timeToSeconds, type ValidationIssue } from '../profile'
const draft = defineModel<NativeProfile>({ required: true })
const props = withDefaults(defineProps<{ issues?: ValidationIssue[]; active?: boolean }>(), {
  issues: () => [],
  active: true,
})
const emit = defineEmits<{ changed: []; pending: [value: boolean] }>()
const lineIndex = ref(0),
  selected = ref(-1),
  zoom = ref(100),
  scroll = ref<HTMLElement>()
const lines = computed(() => draft.value.profile.timeLines)
const line = computed(() => lines.value[lineIndex.value])
const points = computed(() => line.value?.timePoints || [])
const point = computed(() => points.value[selected.value])
const fields = ref<TimeRange>({ startTime: '08:00:00', endTime: '08:45:00' })
const error = ref(''),
  dialog = ref(false),
  action = ref<'create' | 'rename' | 'point'>('create'),
  title = ref('')
const newPoint = ref<TimeRange>({ startTime: '08:00:00', endTime: '08:45:00' }),
  initial = ref('')
const pending = computed(
  () => dialog.value && JSON.stringify({ title: title.value, point: newPoint.value }) !== initial.value,
)
watch(pending, (value) => emit('pending', value))
type Snapshot = { points: TimeRange[]; selected: number }
const history = ref<{ before: Snapshot; after: Snapshot }[]>([]),
  cursor = ref(0)
const px = computed(() => (1.2 * zoom.value) / 100)
const drag = ref<{
  index: number
  y: number
  from: number
  to: number
  mode: 'move' | 'start' | 'end'
  preview: TimeRange
}>()
const visibleIssues = computed(() => [
  ...timeRangeIssues(points.value).map((issue) => `第 ${issue.index + 1} 个时段：${issue.message}`),
  ...props.issues
    .filter((issue) => issue.path.startsWith(`profile.timeLines.${lineIndex.value}.`))
    .map((issue) => issue.message),
])
function format(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')
}
function sync() {
  if (point.value) fields.value = cloneJson(point.value)
}
watch([selected, points], sync, { deep: true })
watch(
  line,
  async () => {
    selected.value = -1
    history.value = []
    cursor.value = 0
    error.value = ''
    drag.value = undefined
    await nextTick()
    scrollToFirst()
  },
  { immediate: true },
)
watch(
  () => lines.value.length,
  () => {
    if (!line.value) lineIndex.value = Math.max(0, lines.value.length - 1)
  },
)
function scrollToFirst() {
  if (!scroll.value) return
  const starts = points.value.map((p) => timeToSeconds(p.startTime)).filter((v): v is number => v !== null)
  scroll.value.scrollTop = ((starts.length ? Math.min(...starts) : 8 * 3600) / 60 - 30) * px.value
}
watch(
  () => props.active,
  async (active) => {
    if (active) {
      await nextTick()
      scrollToFirst()
    }
  },
)
function select(index: number) {
  if (selected.value !== index) error.value = ''
  selected.value = index
  sync()
}
function apply(snapshot: Snapshot) {
  if (!line.value) return
  line.value.timePoints = cloneJson(snapshot.points)
  selected.value = snapshot.selected
  emit('changed')
}
function change(values: TimeRange[], index: number) {
  if (!line.value) return false
  const issues = timeRangeIssues(values)
  if (issues.length) {
    error.value = issues[0].message
    sync()
    return false
  }
  if (JSON.stringify(values) === JSON.stringify(points.value)) return true
  const before = { points: cloneJson(points.value), selected: selected.value }
  const after = { points: cloneJson(values), selected: index }
  history.value.splice(cursor.value)
  history.value.push({ before, after })
  if (history.value.length > 100) history.value.shift()
  cursor.value = history.value.length
  error.value = ''
  apply(after)
  return true
}
function undo() {
  if (cursor.value > 0) {
    drag.value = undefined
    apply(history.value[--cursor.value].before)
    error.value = ''
  }
}
function redo() {
  if (cursor.value < history.value.length) {
    drag.value = undefined
    apply(history.value[cursor.value++].after)
    error.value = ''
  }
}
function keys(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || /^(INPUT|TEXTAREA)$/.test((event.target as HTMLElement).tagName))
    return
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
  }
  if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
}
function editTime() {
  if (!point.value) return
  const values = cloneJson(points.value)
  values[selected.value] = cloneJson(fields.value)
  change(values, selected.value)
}
function open(kind: typeof action.value, seconds?: number) {
  action.value = kind
  title.value = kind === 'rename' ? line.value?.name || '' : ''
  newPoint.value =
    seconds === undefined
      ? nextTimeSlot(points.value)
      : { startTime: format(seconds), endTime: format(Math.min(86399, seconds + 2700)) }
  initial.value = JSON.stringify({ title: title.value, point: newPoint.value })
  error.value = ''
  dialog.value = true
}
async function close(done?: () => void) {
  if (pending.value) {
    try {
      await ElMessageBox.confirm('修改尚未确认，是否放弃？', '关闭编辑')
    } catch {
      return
    }
  }
  dialog.value = false
  error.value = ''
  done?.()
}
function commit() {
  if (action.value === 'point') {
    if (points.value.length >= 1000) {
      error.value = '每条时间线最多 1000 个时段'
      return
    }
    if (!change([...points.value, cloneJson(newPoint.value)], points.value.length)) return
  } else {
    if (!title.value.trim()) {
      error.value = '时间线名称不能为空'
      return
    }
    if (action.value === 'create') {
      if (lines.value.length >= 1000) {
        error.value = '最多 1000 条时间线'
        return
      }
      lines.value.push({ name: title.value.trim(), timePoints: [] })
      lineIndex.value = lines.value.length - 1
    } else if (line.value) line.value.name = title.value.trim()
    emit('changed')
  }
  dialog.value = false
}
async function removeLine() {
  if (!line.value) return
  try {
    await ElMessageBox.confirm(`确定删除“${line.value.name}”及其全部时段？`, '删除时间线')
  } catch {
    return
  }
  lines.value.splice(lineIndex.value, 1)
  emit('changed')
}
async function removePoint() {
  if (!point.value) return
  try {
    await ElMessageBox.confirm('确定删除所选时段？', '删除时段')
  } catch {
    return
  }
  const values = cloneJson(points.value)
  values.splice(selected.value, 1)
  change(values, Math.min(selected.value, values.length - 1))
}
function styleFor(index: number) {
  const value = drag.value?.index === index ? drag.value.preview : points.value[index]!
  const start = timeToSeconds(value.startTime) || 0,
    end = timeToSeconds(value.endTime) || start
  return { top: `${(start / 60) * px.value}px`, height: `${Math.max(8, ((end - start) / 60) * px.value)}px` }
}
function startDrag(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  select(index)
  const value = points.value[index]!,
    from = timeToSeconds(value.startTime),
    to = timeToSeconds(value.endTime)
  if (from === null || to === null || to <= from) return
  const mode = (event.target as HTMLElement).dataset.resize as 'start' | 'end' | undefined
  drag.value = { index, y: event.clientY, from, to, mode: mode || 'move', preview: cloneJson(value) }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  const value = drag.value
  if (!value) return
  const delta = Math.round((event.clientY - value.y) / px.value / 5) * 300
  let from = value.from,
    to = value.to
  if (value.mode === 'move') {
    const shift = Math.max(-from, Math.min(86399 - to, delta))
    from += shift
    to += shift
  } else if (value.mode === 'start') from = Math.max(0, Math.min(to - 60, from + delta))
  else to = Math.min(86399, Math.max(from + 60, to + delta))
  value.preview = { startTime: format(from), endTime: format(to) }
}
function endDrag() {
  const value = drag.value
  if (!value) return
  drag.value = undefined
  const values = cloneJson(points.value)
  values[value.index] = value.preview
  change(values, value.index)
}
function zoomTo(value: number) {
  if (!scroll.value) return
  const anchor = (scroll.value.scrollTop + scroll.value.clientHeight / 2) / px.value
  zoom.value = Math.max(50, Math.min(300, value))
  nextTick(() => {
    if (scroll.value) scroll.value.scrollTop = anchor * px.value - scroll.value.clientHeight / 2
  })
}
function addAt(event: MouseEvent) {
  if (event.target !== event.currentTarget) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  open('point', Math.max(0, Math.min(86340, Math.round((event.clientY - rect.top) / px.value / 5) * 300)))
}
async function focusIssue(issue: ValidationIssue) {
  const match = /^profile\.timeLines\.(\d+)(?:\.timePoints\.(\d+))?/.exec(issue.path)
  if (!match) return
  lineIndex.value = Number(match[1])
  await nextTick()
  if (match[2] !== undefined) {
    select(Number(match[2]))
    if (scroll.value)
      scroll.value.scrollTop = ((timeToSeconds(point.value?.startTime || '') || 0) / 60) * px.value - 20
  }
}
defineExpose({ focusIssue })
</script>

<template>
  <div class="timeline-manager">
    <div tabindex="-1" @keydown="keys">
      <div class="panel client-card">
        <el-select
          :model-value="line ? lineIndex : undefined"
          :disabled="!lines.length"
          @change="lineIndex = $event"
          aria-label="时间线"
          placeholder="选择时间线"
          style="width: 100%"
          ><el-option v-for="(item, index) in lines" :key="index" :label="item.name" :value="index"
        /></el-select>
        <div class="client-toolbar" style="margin-top: 14px">
          <el-button type="primary" @click="open('create')">新增时间线</el-button
          ><el-button :disabled="!line" @click="open('rename')">重命名</el-button
          ><el-button :disabled="!line" @click="removeLine">删除时间线</el-button>
        </div>
      </div>
      <div class="client-toolbar">
        <el-button type="primary" :disabled="!line" @click="open('point')">新增时段</el-button
        ><el-button :disabled="!point" @click="removePoint">删除</el-button>
        <el-button :disabled="cursor === 0" @click="undo">撤销</el-button
        ><el-button :disabled="cursor === history.length" @click="redo">重做</el-button>
      </div>
      <el-alert v-if="error && !dialog" :title="error" type="error" :closable="false" role="alert" />
      <p v-for="message in [...new Set(visibleIssues)]" :key="message" class="field-error">{{ message }}</p>
      <div class="timeline-columns">
        <section class="panel client-card">
          <div class="client-toolbar">
            <el-button aria-label="缩小" :disabled="zoom <= 50" @click="zoomTo(zoom - 25)">−</el-button
            ><span>{{ zoom }}%</span
            ><el-button aria-label="放大" :disabled="zoom >= 300" @click="zoomTo(zoom + 25)">＋</el-button
            ><span class="grow"></span><el-button @click="zoomTo(100)">重置</el-button>
          </div>
          <p v-if="!points.length" class="form-hint">
            {{ line ? '暂无时段，双击时间轴或点击新增时段。' : '请先新增时间线。' }}
          </p>
          <div ref="scroll" class="timeline-scroll" aria-label="时间线画布">
            <div
              class="timeline-axis"
              :style="{ height: `${1440 * px}px` }"
              @dblclick="line && addAt($event)"
            >
              <div
                v-for="hour in 24"
                :key="hour"
                class="timeline-tick"
                :style="{ top: `${(hour - 1) * 60 * px}px`, pointerEvents: 'none' }"
              >
                <span>{{ String(hour - 1).padStart(2, '0') }}:00</span>
              </div>
              <button
                v-for="(item, index) in points"
                :key="index"
                type="button"
                class="timeline-point"
                :class="{ selected: selected === index }"
                :style="styleFor(index)"
                :aria-label="`时段 ${index + 1} ${item.startTime} 至 ${item.endTime}`"
                :aria-pressed="selected === index"
                @click="select(index)"
                @pointerdown="startDrag($event, index)"
                @pointermove="moveDrag"
                @pointerup="endDrag"
                @pointercancel="drag = undefined"
                @lostpointercapture="drag = undefined"
              >
                <i class="timeline-resize start" data-resize="start"></i><strong>时段 {{ index + 1 }}</strong
                ><span
                  >{{ (drag?.index === index ? drag.preview.startTime : item.startTime).slice(0, 5) }}–{{
                    (drag?.index === index ? drag.preview.endTime : item.endTime).slice(0, 5)
                  }}</span
                ><i class="timeline-resize end" data-resize="end"></i>
              </button>
            </div>
          </div>
          <p class="form-hint">拖动调整位置，拖动上下边缘调整起止时间；每次吸附 5 分钟。</p>
        </section>
        <section class="panel client-card timeline-inspector">
          <h3>编辑时段</h3>
          <p v-if="!point" class="form-hint">选择左侧时段后编辑。</p>
          <el-form label-position="top" :disabled="!point"
            ><el-form-item label="开始时间"
              ><el-time-picker
                v-model="fields.startTime"
                aria-label="时段开始时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                :clearable="false"
                @change="editTime" /></el-form-item
            ><el-form-item label="结束时间"
              ><el-time-picker
                v-model="fields.endTime"
                aria-label="时段结束时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                :clearable="false"
                @change="editTime" /></el-form-item
          ></el-form>
        </section>
      </div>
    </div>
    <el-dialog
      class="client-editor-dialog"
      v-model="dialog"
      :title="action === 'point' ? '新增时段' : action === 'create' ? '新增时间线' : '重命名时间线'"
      width="440px"
      :before-close="close"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="commit">
        <template v-if="action === 'point'"
          ><el-form-item label="开始时间"
            ><el-time-picker
              v-model="newPoint.startTime"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              :clearable="false" /></el-form-item
          ><el-form-item label="结束时间"
            ><el-time-picker
              v-model="newPoint.endTime"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              :clearable="false" /></el-form-item
        ></template>
        <el-form-item v-else label="名称"><el-input v-model="title" maxlength="100" /></el-form-item>
      </el-form>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <template #footer
        ><el-button @click="close()">取消</el-button
        ><el-button type="primary" @click="commit">确认</el-button></template
      >
    </el-dialog>
  </div>
</template>

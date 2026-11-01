<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Course, NativeProfile } from '../wire'
import { copyDayCourses } from '../timetable'
import {
  cloneJson,
  courseTimeIssues,
  newCourse,
  newDay,
  reconcileOverrides,
  registeredSubjectNames,
  weekdayName,
  newWeek,
  removeWeek,
  removeDay,
  overridesFor,
  MODE_LABELS,
  timeRangeIssues,
  type ValidationIssue,
} from '../profile'
const draft = defineModel<NativeProfile>({ required: true })
const props = withDefaults(defineProps<{ issues?: ValidationIssue[] }>(), { issues: () => [] })
const emit = defineEmits<{ changed: []; pending: [value: boolean]; 'manage-subjects': [] }>()
const weekId = ref(''),
  mobileDay = ref(1),
  dialog = ref(false),
  selectedDay = ref(1),
  selectedIndex = ref(-1)
const working = ref<Course>({ subject: '', startTime: '08:00:00', endTime: '08:45:00' }),
  initial = ref(''),
  editError = ref('')
const copyOpen = ref(false),
  copyFrom = ref(1),
  copyTargets = ref<number[]>([])
const weeks = computed(() => draft.value.profile.schedules)
const subjects = computed(() => registeredSubjectNames(draft.value))
const week = computed(() => weeks.value.find((w) => w.id === weekId.value))
const currentDay = computed(() => dayOf(mobileDay.value))
const rows = computed(() => cards(mobileDay.value))
const selectedRow = ref(-1),
  lineIndex = ref(0)
const weekDialog = ref(false),
  dayDialog = ref(false),
  creatingWeek = ref(false)
const weekForm = ref({ name: '', mode: 'all' as 'all' | 'odd' | 'even', copy: '' })
const dayForm = ref({ name: '', weekday: 1 })
const formError = ref('')
const metadataInitial = ref('')
const metadataPending = computed(
  () =>
    (weekDialog.value || dayDialog.value) &&
    JSON.stringify(weekDialog.value ? weekForm.value : dayForm.value) !== metadataInitial.value,
)
watch([weekId, mobileDay], () => {
  selectedRow.value = -1
})
watch(
  () => weeks.value.map((w) => w.id).join(','),
  () => {
    if (!weeks.value.some((w) => w.id === weekId.value))
      weekId.value =
        (
          weeks.value.find((w) => w.id === draft.value.profile.activeWeekScheduleId) ||
          weeks.value.find((w) => w.name === '常规周') ||
          weeks.value[0]
        )?.id || ''
  },
  { immediate: true },
)
watch(
  [dialog, working, metadataPending],
  () =>
    emit(
      'pending',
      (dialog.value && JSON.stringify(working.value) !== initial.value) || metadataPending.value,
    ),
  { deep: true },
)
function editWeek(create: boolean) {
  creatingWeek.value = create
  weekForm.value = {
    name: create ? '' : week.value?.name || '',
    mode: create ? 'all' : week.value?.mode || 'all',
    copy: '',
  }
  metadataInitial.value = JSON.stringify(weekForm.value)
  formError.value = ''
  weekDialog.value = true
}
function saveWeek() {
  if (!weekForm.value.name.trim()) {
    formError.value = '课表名称不能为空'
    return
  }
  const value = creatingWeek.value ? newWeek(draft.value) : week.value
  if (!value) return
  value.name = weekForm.value.name.trim()
  value.mode = weekForm.value.mode
  if (creatingWeek.value) {
    const source = weeks.value.find((item) => item.id === weekForm.value.copy)
    value.daySchedules = source
      ? cloneJson(source.daySchedules)
      : Array.from({ length: 7 }, (_, i) => newDay(i + 1))
    weeks.value.push(value)
    weekId.value = value.id
  }
  weekDialog.value = false
  emit('changed')
}
async function deleteWeek() {
  if (!week.value) return
  const count = overridesFor(draft.value, week.value.id).length
  try {
    await ElMessageBox.confirm(
      `确定删除“${week.value.name}”及其全部课程？${count ? `同时移除 ${count} 条引用它的临时调课。` : ''}`,
      '删除周课表',
    )
  } catch {
    return
  }
  removeWeek(draft.value, week.value.id)
  emit('changed')
}
function editDay() {
  dayForm.value = { name: currentDay.value?.name || weekdayName(mobileDay.value), weekday: mobileDay.value }
  metadataInitial.value = JSON.stringify(dayForm.value)
  formError.value = ''
  dayDialog.value = true
}
function saveDay() {
  if (!week.value) return
  if (!dayForm.value.name.trim()) {
    formError.value = '日课表名称不能为空'
    return
  }
  if (
    week.value.daySchedules.some(
      (item) => item !== currentDay.value && item.enableDay === dayForm.value.weekday,
    )
  ) {
    formError.value = '该星期已存在日课表'
    return
  }
  const value = currentDay.value || newDay(dayForm.value.weekday)
  if (!currentDay.value) week.value.daySchedules.push(value)
  if (value.enableDay !== dayForm.value.weekday) {
    for (const override of overridesFor(draft.value, week.value.id, value.enableDay))
      override.sourceWeekday = dayForm.value.weekday
  }
  value.name = dayForm.value.name.trim()
  value.enableDay = dayForm.value.weekday
  mobileDay.value = value.enableDay
  dayDialog.value = false
  emit('changed')
}
async function deleteDay() {
  if (!week.value || !currentDay.value) return
  const count = overridesFor(draft.value, week.value.id, mobileDay.value).length
  try {
    await ElMessageBox.confirm(
      `确定移除${weekdayName(mobileDay.value)}及其全部课程？${count ? `同时移除 ${count} 条引用它的临时调课。` : ''}`,
      '移除星期',
    )
  } catch {
    return
  }
  removeDay(draft.value, week.value.id, mobileDay.value)
  emit('changed')
}
async function closeMetadata(done?: () => void) {
  if (metadataPending.value) {
    try {
      await ElMessageBox.confirm('修改尚未确认，是否放弃？', '关闭编辑')
    } catch {
      return
    }
  }
  weekDialog.value = dayDialog.value = false
  done?.()
}
async function applyLine() {
  const line = draft.value.profile.timeLines[lineIndex.value]
  if (!line || !week.value) return
  const points = [...line.timePoints].sort((left, right) => left.startTime.localeCompare(right.startTime))
  const issues = timeRangeIssues(points)
  if (issues.length) {
    ElMessage.error(`时间线无法应用：${issues[0].message}`)
    return
  }
  const before = cards(mobileDay.value).map((item) => item.course)
  const count = line.timePoints.length
  try {
    await ElMessageBox.confirm(
      `将“${line.name}”应用到${weekdayName(mobileDay.value)}：课程 ${before.length} → ${count}，保留 ${Math.min(before.length, count)} 个科目，新增 ${Math.max(0, count - before.length)} 节，删除 ${Math.max(0, before.length - count)} 节。`,
      '应用时间线',
    )
  } catch {
    return
  }
  let day = currentDay.value
  if (!day) {
    day = newDay(mobileDay.value)
    week.value.daySchedules.push(day)
  }
  day.classes = points.map((point, index) => ({ ...point, subject: before[index]?.subject || '' }))
  reconcileOverrides(draft.value)
  emit('changed')
}
async function removeSelected() {
  selectedDay.value = mobileDay.value
  selectedIndex.value = selectedRow.value
  await remove()
  selectedRow.value = -1
}
function dayOf(day: number) {
  return week.value?.daySchedules.find((d) => d.enableDay === day)
}
function cards(day: number) {
  return (dayOf(day)?.classes || [])
    .map((course, index) => ({ course, index }))
    .sort((a, b) => a.course.startTime.localeCompare(b.course.startTime))
}
function issuesFor(day: number, index: number) {
  const dayIndex = week.value?.daySchedules.findIndex((d) => d.enableDay === day) ?? -1
  const weekIndex = weeks.value.findIndex((w) => w.id === weekId.value)
  const prefix = `profile.schedules.${weekIndex}.daySchedules.${dayIndex}.classes.${index}`
  const messages = props.issues
    .filter((i) => i.path.startsWith(prefix + '.') || i.path === prefix)
    .map((i) => i.message)
  const time = courseTimeIssues(dayOf(day)?.classes || [])
    .filter((i) => i.index === index)
    .map((i) => i.message)
  return [...new Set([...messages, ...time])]
}
function open(day: number, index = -1) {
  if (!week.value) return
  if (index < 0 && !subjects.value.length) {
    emit('manage-subjects')
    return
  }
  selectedDay.value = day
  selectedIndex.value = index
  working.value = index < 0 ? newCourse(dayOf(day)?.classes || []) : cloneJson(dayOf(day)!.classes[index])
  initial.value = JSON.stringify(working.value)
  editError.value = ''
  dialog.value = true
}
async function close(done?: () => void) {
  if (JSON.stringify(working.value) !== initial.value) {
    try {
      await ElMessageBox.confirm('课程修改尚未确认，是否放弃？', '关闭课程编辑', {
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
      })
    } catch {
      return
    }
  }
  dialog.value = false
  if (done) done()
}
function commit() {
  const current = week.value
  if (!current) return
  if (!subjects.value.includes(working.value.subject)) {
    editError.value = '请选择已有科目；需要新科目时请先在科目设置中添加'
    return
  }
  let day = dayOf(selectedDay.value)
  const courses = [...(day?.classes || [])]
  if (selectedIndex.value < 0) courses.push(working.value)
  else courses[selectedIndex.value] = working.value
  const issues = courseTimeIssues(courses)
  if (issues.length) {
    editError.value = `${weekdayName(selectedDay.value)}：${issues[0].message}`
    return
  }
  if (!day) {
    day = newDay(selectedDay.value)
    current.daySchedules.push(day)
  }
  if (day.classes.length >= 1000 && selectedIndex.value < 0) {
    editError.value = '每天最多 1000 节课'
    return
  }
  day.classes = cloneJson(courses)
  reconcileOverrides(draft.value)
  dialog.value = false
  emit('pending', false)
  emit('changed')
}
async function remove() {
  const day = dayOf(selectedDay.value)
  if (!day || selectedIndex.value < 0) return
  try {
    await ElMessageBox.confirm('删除后，可在保存前通过撤销更改恢复。', '删除这节课')
  } catch {
    return
  }
  day.classes.splice(selectedIndex.value, 1)
  reconcileOverrides(draft.value)
  dialog.value = false
  emit('pending', false)
  emit('changed')
}
function openCopy(day: number) {
  copyFrom.value = day
  copyTargets.value = []
  copyOpen.value = true
}
async function copy() {
  const source = dayOf(copyFrom.value)
  if (!source || !week.value || !copyTargets.value.length) return
  if (copyTargets.value.some((d) => dayOf(d)?.classes.length)) {
    try {
      await ElMessageBox.confirm('目标日期已有课程，复制会替换这些日期的全部课程。', '确认覆盖课程', {
        confirmButtonText: '替换课程',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
  copyDayCourses(week.value, source.enableDay, copyTargets.value)
  reconcileOverrides(draft.value)
  copyOpen.value = false
  emit('changed')
}
function focusIssue(issue: ValidationIssue) {
  const match = /^profile\.schedules\.(\d+)(?:\.daySchedules\.(\d+)(?:\.classes\.(\d+))?)?/.exec(issue.path)
  if (!match) return
  const target = weeks.value[Number(match[1])],
    day = target?.daySchedules[Number(match[2])]
  if (!target) return
  weekId.value = target.id
  if (day) mobileDay.value = day.enableDay
  if (day && match[3] !== undefined) open(day.enableDay, Number(match[3]))
}
defineExpose({ focusIssue })
</script>
<template>
  <div class="schedule-manager">
    <div class="panel client-card">
      <el-select v-model="weekId" aria-label="当前周课表" placeholder="选择周课表" style="width: 100%">
        <el-option v-for="item in weeks" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <div class="client-toolbar" style="margin-top: 14px">
        <el-button type="primary" @click="editWeek(true)">新增周课表</el-button>
        <el-button :disabled="!week" @click="editWeek(false)">编辑周课表</el-button>
        <el-button :disabled="!week" @click="deleteWeek">删除周课表</el-button>
        <span class="grow"></span><el-tag v-if="week" type="info">{{ MODE_LABELS[week.mode] }}</el-tag>
      </div>
      <p v-if="week?.mode !== 'all' && week && !draft.profile.semesterStartDate" class="form-hint">
        请在“基本信息”中设置学期第一天，以启用单双周自动匹配。
      </p>
    </div>
    <div class="panel client-card">
      <div class="client-toolbar">
        <el-select v-model="mobileDay" aria-label="适用星期" :disabled="!week">
          <el-option v-for="day in 7" :key="day" :label="weekdayName(day)" :value="day" /> </el-select
        ><strong>{{ currentDay?.name || '尚未添加日课表' }}</strong>
      </div>
      <div class="client-toolbar">
        <el-button
          type="primary"
          :disabled="!currentDay"
          :data-testid="`add-course-${mobileDay}`"
          @click="open(mobileDay)"
          >新增课程</el-button
        >
        <el-button :disabled="selectedRow < 0" @click="open(mobileDay, selectedRow)">编辑</el-button>
        <el-button :disabled="selectedRow < 0" @click="removeSelected">删除</el-button>
        <span class="grow"></span>
        <el-button :disabled="!week" @click="editDay">{{ currentDay ? '编辑日课表' : '添加星期' }}</el-button>
        <el-button :disabled="!currentDay" @click="deleteDay">移除星期</el-button>
      </div>
      <el-alert v-if="!subjects.length" title="请先在科目管理中添加科目" type="info" :closable="false">
        <el-button size="small" @click="$emit('manage-subjects')">新增科目</el-button>
      </el-alert>
      <el-table
        :data="rows"
        highlight-current-row
        row-key="index"
        @current-change="selectedRow = $event?.index ?? -1"
        @row-dblclick="open(mobileDay, $event.index)"
      >
        <el-table-column type="index" label="序号" width="64" />
        <el-table-column label="科目" min-width="150"
          ><template #default="{ row }">
            <el-button
              link
              :data-testid="`course-${mobileDay}-${row.index}`"
              @click="open(mobileDay, row.index)"
              >{{ row.course.subject || '未设置' }}</el-button
            >
            <p v-for="message in issuesFor(mobileDay, row.index)" :key="message" class="field-error">
              {{ message }}
            </p>
          </template></el-table-column
        >
        <el-table-column label="开始时间" min-width="115"
          ><template #default="{ row }">{{ row.course.startTime }}</template></el-table-column
        >
        <el-table-column label="结束时间" min-width="115"
          ><template #default="{ row }">{{ row.course.endTime }}</template></el-table-column
        >
        <template #empty
          ><el-empty :description="currentDay ? '暂无课程' : '请先添加星期'" :image-size="60"
        /></template>
      </el-table>
      <el-button v-if="currentDay?.classes.length" text style="margin-top: 12px" @click="openCopy(mobileDay)"
        >复制当天课程</el-button
      >
    </div>
    <div class="panel client-card">
      <h3>应用时间线</h3>
      <div class="client-toolbar">
        <el-select
          :model-value="draft.profile.timeLines[lineIndex] ? lineIndex : undefined"
          :disabled="!draft.profile.timeLines.length"
          @change="lineIndex = $event"
          aria-label="应用的时间线"
          placeholder="选择时间线"
        >
          <el-option
            v-for="(line, index) in draft.profile.timeLines"
            :key="index"
            :label="line.name"
            :value="index"
          />
        </el-select>
        <el-button :disabled="!week || !draft.profile.timeLines[lineIndex]" @click="applyLine"
          >应用到当天</el-button
        >
      </div>
      <p class="form-hint">按时间顺序保留已有科目，按时间线更新节次；新增课程需选择科目。</p>
    </div>
    <el-dialog
      class="client-editor-dialog"
      v-model="weekDialog"
      :title="creatingWeek ? '新增周课表' : '编辑周课表'"
      width="440px"
      :before-close="closeMetadata"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="saveWeek">
        <el-form-item label="名称"><el-input v-model="weekForm.name" maxlength="100" /></el-form-item>
        <el-form-item label="周模式"
          ><el-select v-model="weekForm.mode"
            ><el-option
              v-for="(label, mode) in MODE_LABELS"
              :key="mode"
              :label="label"
              :value="mode" /></el-select
        ></el-form-item>
        <el-form-item v-if="creatingWeek" label="复制自"
          ><el-select
            v-model="weekForm.copy"
            @change="weekForm.mode = weeks.find((w) => w.id === weekForm.copy)?.mode || 'all'"
          >
            <el-option label="不复制" value="" /><el-option
              v-for="item in weeks"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            /> </el-select
        ></el-form-item>
      </el-form>
      <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      <template #footer
        ><el-button @click="closeMetadata()">取消</el-button
        ><el-button type="primary" @click="saveWeek">确认</el-button></template
      >
    </el-dialog>
    <el-dialog
      class="client-editor-dialog"
      v-model="dayDialog"
      :title="currentDay ? '编辑日课表' : '添加星期'"
      width="440px"
      :before-close="closeMetadata"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="saveDay">
        <el-form-item label="日课表名称"><el-input v-model="dayForm.name" maxlength="100" /></el-form-item>
        <el-form-item label="适用星期"
          ><el-select v-model="dayForm.weekday"
            ><el-option v-for="day in 7" :key="day" :label="weekdayName(day)" :value="day" /></el-select
        ></el-form-item>
      </el-form>
      <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      <template #footer
        ><el-button @click="closeMetadata()">取消</el-button
        ><el-button type="primary" @click="saveDay">确认</el-button></template
      >
    </el-dialog>
    <el-dialog
      class="client-editor-dialog"
      v-model="dialog"
      :title="`${weekdayName(selectedDay)} · ${selectedIndex < 0 ? '添加课程' : '编辑课程'}`"
      width="440px"
      :before-close="close"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="commit"
        ><el-form-item label="科目"
          ><el-select
            v-model="working.subject"
            filterable
            clearable
            placeholder="选择已有科目"
            data-testid="course-subject"
            ><el-option
              v-if="working.subject && !subjects.includes(working.subject)"
              :value="working.subject"
              :label="`${working.subject}（未登记）`"
              disabled /><el-option
              v-for="name in subjects"
              :key="name"
              :label="name"
              :value="name" /></el-select
        ></el-form-item>
        <div class="two-columns">
          <el-form-item label="开始时间"
            ><el-time-picker
              v-model="working.startTime"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              :clearable="false"
              data-testid="course-start" /></el-form-item
          ><el-form-item label="结束时间"
            ><el-time-picker
              v-model="working.endTime"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              :clearable="false"
              data-testid="course-end"
          /></el-form-item></div
      ></el-form>
      <p v-if="editError" role="alert" class="field-error">{{ editError }}</p>
      <template #footer
        ><el-button v-if="selectedIndex >= 0" type="danger" plain @click="remove">删除课程</el-button
        ><el-button @click="close()">取消</el-button
        ><el-button type="primary" @click="commit">确认课程</el-button></template
      >
    </el-dialog>
    <el-dialog v-model="copyOpen" title="复制当天课程" width="440px"
      ><p>将{{ weekdayName(copyFrom) }}的课程复制到：</p>
      <el-checkbox-group v-model="copyTargets"
        ><el-checkbox
          v-for="day in [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== copyFrom)"
          :key="day"
          :value="day"
          >{{ weekdayName(day) }}</el-checkbox
        ></el-checkbox-group
      ><template #footer
        ><el-button @click="copyOpen = false">取消</el-button
        ><el-button type="primary" :disabled="!copyTargets.length" @click="copy"
          >确认复制</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>

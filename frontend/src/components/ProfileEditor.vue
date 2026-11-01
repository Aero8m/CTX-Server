<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CourseList from './CourseList.vue'
import type { DateOverride, NativeProfile, TimeLine } from '../wire'
import {
  MODE_LABELS,
  WEEKDAY_LABELS,
  cloneJson,
  newDay,
  newOverride,
  newReminderRule,
  newTimeLine,
  newWeek,
  nextTimeSlot,
  overridesFor,
  rebaseOverride,
  reconcileOverrides,
  registeredSubjectNames,
  removeDay,
  removeWeek,
  sameCourses,
  sectionOfIssue,
  sourceDay,
  timeRangeIssues,
  weekdayName,
  type ProfileTab,
  type ValidationIssue,
} from '../profile'

const draft = defineModel<NativeProfile>('draft', { required: true })
const tab = defineModel<ProfileTab>('tab', { default: 'basic' })
const props = withDefaults(
  defineProps<{ issues?: ValidationIssue[]; sections?: ProfileTab[]; showProfileName?: boolean }>(),
  {
    showProfileName: true,
    issues: () => [],
    sections: () => ['basic', 'weeks', 'subjects', 'dates', 'rules', 'preview'],
  },
)
const emit = defineEmits<{ changed: [] }>()
const overrideKeys = new WeakMap<DateOverride, number>()
let nextOverrideKey = 0
function overrideKey(item: DateOverride) {
  if (!overrideKeys.has(item)) overrideKeys.set(item, ++nextOverrideKey)
  return overrideKeys.get(item)!
}

const weekId = ref('')
const weekday = ref(1)

const profile = computed(() => draft.value.profile)
const subjects = computed(() => profile.value.subjects ?? [])
const timeLines = computed(() => profile.value.timeLines ?? [])
const schedules = computed(() => profile.value.schedules ?? [])
const overrides = computed(() => profile.value.dateOverrides ?? [])
const reminderRules = computed(() => profile.value.reminderRules ?? [])
const subjectNames = computed(() => registeredSubjectNames(draft.value))
const week = computed(() => schedules.value.find((item) => item.id === weekId.value))
const day = computed(() => week.value?.daySchedules.find((item) => item.enableDay === weekday.value))

watch(
  () => schedules.value.map((item) => item.id).join('\u0000'),
  () => {
    if (!schedules.value.some((item) => item.id === weekId.value)) weekId.value = schedules.value[0]?.id ?? ''
  },
  { immediate: true },
)

function changed() {
  emit('changed')
}
function touchSchedule() {
  reconcileOverrides(draft.value)
  changed()
}
function messages(path: string) {
  return props.issues
    .filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`))
    .map((issue) => issue.message)
}

function addWeek() {
  const item = newWeek(draft.value)
  schedules.value.push(item)
  weekId.value = item.id
  weekday.value = 1
  changed()
}
async function deleteWeek() {
  const current = week.value
  if (!current) return
  const affected = overridesFor(draft.value, current.id)
  try {
    if (affected.length)
      await ElMessageBox.confirm(
        `有 ${affected.length} 条日期特殊安排引用这张周课表，删除后会一并移除。`,
        '删除周课表',
      )
  } catch {
    return
  }
  const index = schedules.value.findIndex((item) => item.id === current.id)
  removeWeek(draft.value, current.id)
  weekId.value =
    schedules.value[Math.min(index, schedules.value.length - 1)]?.id ?? schedules.value[0]?.id ?? ''
  weekday.value = 1
  changed()
}
function addDay() {
  if (!week.value || week.value.daySchedules.length >= 7) return
  if (week.value.daySchedules.some((item) => item.enableDay === weekday.value)) return
  week.value.daySchedules.push(newDay(weekday.value))
  week.value.daySchedules.sort((left, right) => left.enableDay - right.enableDay)
  changed()
}
async function deleteDay() {
  const current = week.value,
    currentDay = day.value
  if (!current || !currentDay) return
  const affected = overridesFor(draft.value, current.id, currentDay.enableDay)
  try {
    if (affected.length)
      await ElMessageBox.confirm(
        `有 ${affected.length} 条日期特殊安排引用${weekdayName(currentDay.enableDay)}，删除后会一并移除。`,
        '删除星期',
      )
  } catch {
    return
  }
  removeDay(draft.value, current.id, currentDay.enableDay)
  changed()
}

function addTimeLine() {
  timeLines.value.push(newTimeLine())
  changed()
}
async function removeTimeLine(index: number) {
  const line = timeLines.value[index]
  try {
    if (line?.timePoints.length) await ElMessageBox.confirm('删除时间线不会影响课程安排。', '删除时间线')
  } catch {
    return
  }
  timeLines.value.splice(index, 1)
  changed()
}
function addTimePoint(line: TimeLine) {
  if (line.timePoints.length >= 1000) return
  line.timePoints.push(nextTimeSlot(line.timePoints))
  changed()
}
function removeTimePoint(line: TimeLine, index: number) {
  line.timePoints.splice(index, 1)
  changed()
}
function lineIssues(line: TimeLine) {
  return timeRangeIssues(line.timePoints)
}

function daysOfWeek(id: string) {
  return schedules.value.find((item) => item.id === id)?.daySchedules ?? []
}
function sourceSummary(override: DateOverride) {
  const classes = sourceDay(draft.value, override.sourceWeekScheduleId, override.sourceWeekday)?.classes ?? []
  if (!classes.length) return '来源日没有课程'
  return classes
    .map((course) => `${course.subject} ${course.startTime.slice(0, 5)}–${course.endTime.slice(0, 5)}`)
    .join('；')
}
function addOverride() {
  let targetWeek = week.value
  if (!targetWeek?.daySchedules.length) targetWeek = schedules.value.find((item) => item.daySchedules.length)
  if (!targetWeek) {
    ElMessage.warning('请先添加周课表、星期和课程')
    return
  }
  const targetDay =
    targetWeek.daySchedules.find((item) => item.enableDay === weekday.value) ?? targetWeek.daySchedules[0]
  const override = newOverride(draft.value, targetWeek.id, targetDay.enableDay)
  if (!override) return
  if (overrides.value.some((item) => item.date === override.date))
    ElMessage.warning('今天已经有日期特殊安排，请修改日期')
  overrides.value.push(override)
  overrides.value.sort((left, right) => left.date.localeCompare(right.date))
  changed()
}
function removeOverride(index: number) {
  overrides.value.splice(index, 1)
  changed()
}
async function selectReference(override: DateOverride, weekId: string, weekday: number) {
  const source = sourceDay(draft.value, weekId, weekday)
  if (!source) {
    ElMessage.warning('参考周课表还没有课程，请先添加课程')
    return
  }
  if (!sameCourses(override.classes, override.sourceClasses)) {
    try {
      await ElMessageBox.confirm('选择新的参考日会替换这一天已自定义的课程。', '更换参考日', {
        confirmButtonText: '替换当天课程',
        cancelButtonText: '保留当前课程',
      })
    } catch {
      return
    }
  }
  override.sourceWeekScheduleId = weekId
  override.sourceWeekday = weekday
  rebaseOverride(draft.value, override)
  override.classes = cloneJson(source.classes)
  changed()
}
async function changeOverrideWeek(override: DateOverride, value: string) {
  const days = daysOfWeek(value)
  const weekday = days.some((item) => item.enableDay === override.sourceWeekday)
    ? override.sourceWeekday
    : days[0]?.enableDay
  if (weekday === undefined) {
    ElMessage.warning('参考周课表还没有课程，请先添加课程')
    return
  }
  await selectReference(override, value, weekday)
}
async function changeOverrideWeekday(override: DateOverride, value: number) {
  await selectReference(override, override.sourceWeekScheduleId, value)
}

function addRule() {
  reminderRules.value.push(newReminderRule(draft.value))
  changed()
}
function removeRule(index: number) {
  reminderRules.value.splice(index, 1)
  changed()
}
function focusIssue(issue: ValidationIssue) {
  const section = sectionOfIssue(issue)
  tab.value = section
  const weekMatch = /^profile\.schedules\.(\d+)/.exec(issue.path)
  if (weekMatch) {
    const targetWeek = schedules.value[Number(weekMatch[1])]
    if (targetWeek) weekId.value = targetWeek.id
    const dayMatch = /^profile\.schedules\.\d+\.daySchedules\.(\d+)/.exec(issue.path)
    if (dayMatch && targetWeek) {
      const targetDay = targetWeek.daySchedules[Number(dayMatch[1])]
      if (targetDay) weekday.value = targetDay.enableDay
    }
  }
}
defineExpose({ focusIssue })
</script>

<template>
  <el-tabs v-model="tab" class="profile-tabs">
    <el-tab-pane v-if="sections.includes('basic')" label="基本信息" name="basic">
      <el-form label-position="top" class="panel client-card">
        <div class="profile-editor-grid">
          <el-form-item v-if="showProfileName" label="档案名称">
            <el-input v-model="profile.name" maxlength="100" placeholder="档案名称" @change="changed" />
            <div v-if="messages('profile.name').length" class="profile-field-error">
              {{ messages('profile.name').join('；') }}
            </div>
          </el-form-item>
          <el-form-item label="学期第一天">
            <el-date-picker
              v-model="profile.semesterStartDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="未设置"
              @change="changed"
            />
            <div v-if="messages('profile.semesterStartDate').length" class="profile-field-error">
              {{ messages('profile.semesterStartDate').join('；') }}
            </div>
          </el-form-item>
          <el-form-item label="手动选择周课表">
            <el-select v-model="profile.activeWeekScheduleId" placeholder="自动匹配" @change="changed">
              <el-option label="自动匹配" value="" />
              <el-option
                v-for="item in schedules"
                :key="item.id"
                :label="`${item.name}（${MODE_LABELS[item.mode]}）`"
                :value="item.id"
              />
            </el-select>
            <div v-if="messages('profile.activeWeekScheduleId').length" class="profile-field-error">
              {{ messages('profile.activeWeekScheduleId').join('；') }}
            </div>
          </el-form-item>
        </div>
        <p class="form-hint">
          所选日期所在周为第 1 周（单周），每周一开始新的一周，用于自动匹配单周 /
          双周课表。手动选择为空时自动匹配。
        </p>
      </el-form>
      <section class="panel client-card profile-summary-card">
        <h3>数据统计</h3>
        <div class="profile-stats">
          <span
            >科目 <b>{{ subjects.length }}</b></span
          >
          <span
            >时间线 <b>{{ timeLines.length }}</b></span
          >
          <span
            >周课表 <b>{{ schedules.length }}</b></span
          >
          <span
            >特殊安排 <b>{{ overrides.length }}</b></span
          >
          <span
            >提醒规则 <b>{{ reminderRules.length }}</b></span
          >
        </div>
      </section>
    </el-tab-pane>

    <el-tab-pane v-if="sections.includes('weeks')" label="多套与单双周" name="weeks">
      <div class="toolbar">
        <el-select
          v-model="weekId"
          placeholder="选择周课表"
          style="width: 260px"
          data-testid="profile-week-select"
        >
          <el-option
            v-for="item in schedules"
            :key="item.id"
            :label="`${item.name}（${MODE_LABELS[item.mode]}）`"
            :value="item.id"
          />
        </el-select>
        <el-button @click="addWeek">新建周课表</el-button>
        <el-button v-if="week" type="danger" plain @click="deleteWeek">删除当前周课表</el-button>
      </div>
      <template v-if="week">
        <el-form label-position="top">
          <div class="profile-editor-grid">
            <el-form-item label="周课表名称">
              <el-input v-model="week.name" maxlength="100" @change="changed" />
              <div
                v-if="messages(`profile.schedules.${schedules.indexOf(week)}.name`).length"
                class="profile-field-error"
              >
                {{ messages(`profile.schedules.${schedules.indexOf(week)}.name`).join('；') }}
              </div>
            </el-form-item>
            <el-form-item label="匹配模式">
              <el-radio-group v-model="week.mode" @change="changed">
                <el-radio-button value="all">全部周</el-radio-button>
                <el-radio-button value="odd">单周</el-radio-button>
                <el-radio-button value="even">双周</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </div>
        </el-form>
        <div class="toolbar">
          <el-radio-group v-model="weekday" size="small">
            <el-radio-button
              v-for="number in 7"
              :key="number"
              :value="number"
              :data-testid="`profile-weekday-${number}`"
            >
              {{ WEEKDAY_LABELS[number - 1]
              }}<span
                v-if="week.daySchedules.some((item) => item.enableDay === number)"
                class="profile-day-mark"
                aria-hidden="true"
                >·</span
              >
            </el-radio-button>
          </el-radio-group>
        </div>
        <template v-if="day">
          <div class="profile-day-header">
            <el-form-item label="星期名称">
              <el-input v-model="day.name" maxlength="100" @change="touchSchedule" />
            </el-form-item>
            <el-button type="danger" plain size="small" @click="deleteDay">删除{{ day.name }}</el-button>
          </div>
          <div
            v-if="
              messages(
                `profile.schedules.${schedules.indexOf(week)}.daySchedules.${week.daySchedules.indexOf(day)}.name`,
              ).length
            "
            class="profile-field-error"
          >
            {{
              messages(
                `profile.schedules.${schedules.indexOf(week)}.daySchedules.${week.daySchedules.indexOf(day)}.name`,
              ).join('；')
            }}
          </div>
          <CourseList
            v-model="day.classes"
            :subjects="subjectNames"
            test-id-prefix="profile-course"
            add-test-id="profile-add-course"
            empty-hint="这一天还没有课程"
            @changed="touchSchedule"
          />
        </template>
        <el-empty v-else description="该周课表还没有这一天的安排">
          <el-button data-testid="profile-add-day" @click="addDay">添加{{ weekdayName(weekday) }}</el-button>
        </el-empty>
        <p class="form-hint">
          修改课程后会同步引用这一天的日期特殊安排来源快照。时段允许首尾相接，但同一天不能重叠。
        </p>
      </template>
      <el-empty v-else description="还没有周课表">
        <el-button @click="addWeek">新建周课表</el-button>
      </el-empty>
    </el-tab-pane>

    <el-tab-pane v-if="sections.includes('subjects')" label="作息时间" name="subjects">
      <section>
        <h3 class="profile-subtitle">时间线 / 节次</h3>
        <div v-for="(line, lineIndex) in timeLines" :key="lineIndex" class="profile-rule-card">
          <div class="toolbar">
            <el-input
              v-model="line.name"
              maxlength="100"
              placeholder="时间线名称"
              style="max-width: 220px"
              @change="changed"
            />
            <el-button link type="danger" @click="removeTimeLine(lineIndex)">删除</el-button>
          </div>
          <div v-if="messages(`profile.timeLines.${lineIndex}.name`).length" class="profile-field-error">
            {{ messages(`profile.timeLines.${lineIndex}.name`).join('；') }}
          </div>
          <el-table :data="line.timePoints" size="small">
            <el-table-column label="开始" width="130">
              <template #default="{ row }">
                <el-time-picker
                  v-model="row.startTime"
                  format="HH:mm"
                  value-format="HH:mm:ss"
                  :clearable="false"
                  @change="changed"
                />
              </template>
            </el-table-column>
            <el-table-column label="结束" width="130">
              <template #default="{ row }">
                <el-time-picker
                  v-model="row.endTime"
                  format="HH:mm"
                  value-format="HH:mm:ss"
                  :clearable="false"
                  @change="changed"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ $index }">
                <el-button link type="danger" @click="removeTimePoint(line, $index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div
            v-for="issue in lineIssues(line)"
            :key="`${lineIndex}-${issue.index}-${issue.message}`"
            class="profile-field-error"
          >
            第 {{ issue.index + 1 }} 个时段：{{ issue.message }}
          </div>
          <el-button @click="addTimePoint(line)">添加时段</el-button>
        </div>
        <el-empty v-if="!timeLines.length" description="还没有时间线" :image-size="60" />
        <el-button @click="addTimeLine">添加时间线</el-button>
        <p class="form-hint">时间线用于记录作息时间；课程时间仍以课程自身的开始和结束为准。</p>
      </section>
    </el-tab-pane>

    <el-tab-pane v-if="sections.includes('dates')" label="临时调课" name="dates">
      <div class="toolbar">
        <el-button type="primary" data-testid="profile-add-override" @click="addOverride"
          >添加临时调课</el-button
        >
      </div>
      <p class="form-hint">
        选择调课日期，再选择参考周课表和星期，最后编辑当天课程。临时调课只影响指定日期，优先于每周课程。
      </p>
      <TransitionGroup name="component-list" tag="div" class="component-list profile-rule-list">
        <div
          v-for="(override, index) in overrides"
          :key="overrideKey(override)"
          class="panel client-card profile-override-card"
        >
          <div class="profile-override-head">
            <el-date-picker
              v-model="override.date"
              aria-label="调课日期"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
              @change="changed"
            />
            <el-select
              :model-value="override.sourceWeekScheduleId"
              placeholder="参考周课表"
              aria-label="参考周课表"
              @change="changeOverrideWeek(override, $event)"
            >
              <el-option v-for="item in schedules" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select
              :model-value="override.sourceWeekday"
              placeholder="参考星期"
              aria-label="参考星期"
              @change="changeOverrideWeekday(override, $event)"
            >
              <el-option
                v-for="item in daysOfWeek(override.sourceWeekScheduleId)"
                :key="item.enableDay"
                :label="item.name"
                :value="item.enableDay"
              />
            </el-select>
            <el-button link type="danger" @click="removeOverride(index)">删除</el-button>
          </div>
          <div v-if="messages(`profile.dateOverrides.${index}.date`).length" class="profile-field-error">
            {{ messages(`profile.dateOverrides.${index}.date`).join('；') }}
          </div>
          <div
            v-if="messages(`profile.dateOverrides.${index}.sourceClasses`).length"
            class="profile-field-error"
          >
            {{ messages(`profile.dateOverrides.${index}.sourceClasses`).join('；') }}
          </div>
          <p class="profile-source-note">
            参考日课程：{{ sourceSummary(override) }}。在下方编辑这一天的实际课程。
          </p>
          <CourseList
            v-model="override.classes"
            :subjects="subjectNames"
            :test-id-prefix="`profile-override-course-${index}`"
            empty-hint="这一天不上课或使用自定义安排"
            @changed="changed"
          />
        </div>
      </TransitionGroup>
      <el-empty
        v-if="!overrides.length"
        class="panel"
        description="没有临时调课，将按每周课程上课"
        :image-size="60"
      />
    </el-tab-pane>

    <el-tab-pane v-if="sections.includes('rules')" label="提醒规则" name="rules">
      <div class="toolbar">
        <el-button type="primary" data-testid="profile-add-rule" @click="addRule">添加提醒规则</el-button>
      </div>
      <TransitionGroup name="component-list" tag="div" class="component-list profile-rule-list">
        <div
          v-for="(rule, index) in reminderRules"
          :key="rule.id || index"
          class="panel client-card profile-reminder-card"
        >
          <div class="toolbar">
            <el-switch v-model="rule.enabled" @change="changed" />
            <el-input
              v-model="rule.name"
              maxlength="100"
              placeholder="提醒名称"
              style="max-width: 220px"
              @change="changed"
            />
            <span class="grow"></span>
            <el-button link type="danger" @click="removeRule(index)">删除</el-button>
          </div>
          <div v-if="messages(`profile.reminderRules.${index}.name`).length" class="profile-field-error">
            {{ messages(`profile.reminderRules.${index}.name`).join('；') }}
          </div>
          <el-form label-position="top">
            <div class="profile-rule-grid">
              <el-form-item label="提醒文本">
                <el-input
                  v-model="rule.text"
                  type="textarea"
                  :rows="2"
                  maxlength="1000"
                  show-word-limit
                  @change="changed"
                />
                <div
                  v-if="messages(`profile.reminderRules.${index}.text`).length"
                  class="profile-field-error"
                >
                  {{ messages(`profile.reminderRules.${index}.text`).join('；') }}
                </div>
              </el-form-item>
              <el-form-item label="提醒星期">
                <el-checkbox-group v-model="rule.weekdays" @change="changed">
                  <el-checkbox v-for="number in 7" :key="number" :value="number">{{
                    WEEKDAY_LABELS[number - 1]
                  }}</el-checkbox>
                </el-checkbox-group>
                <div
                  v-if="messages(`profile.reminderRules.${index}.weekdays`).length"
                  class="profile-field-error"
                >
                  {{ messages(`profile.reminderRules.${index}.weekdays`).join('；') }}
                </div>
              </el-form-item>
              <el-form-item label="课程条件">
                <el-select v-model="rule.course" @change="changed">
                  <el-option label="不限" :value="0" />
                  <el-option label="指定科目" :value="1" />
                  <el-option label="指定节次" :value="2" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="rule.course === 1" label="指定科目">
                <el-select
                  v-model="rule.subject"
                  filterable
                  clearable
                  placeholder="选择已有科目"
                  @change="changed"
                >
                  <el-option
                    v-if="rule.subject && !subjectNames.includes(rule.subject)"
                    :value="rule.subject"
                    :label="`${rule.subject}（未登记）`"
                    disabled
                  />
                  <el-option v-for="name in subjectNames" :key="name" :label="name" :value="name" />
                </el-select>
                <div
                  v-if="messages(`profile.reminderRules.${index}.subject`).length"
                  class="profile-field-error"
                >
                  {{ messages(`profile.reminderRules.${index}.subject`).join('；') }}
                </div>
              </el-form-item>
              <el-form-item label="节次">
                <el-input-number v-model="rule.period" :min="1" :max="999" @change="changed" />
              </el-form-item>
              <el-form-item label="提醒时机">
                <el-select v-model="rule.timing" @change="changed">
                  <el-option label="固定时间" :value="0" />
                  <el-option label="上课时" :value="1" />
                  <el-option label="下课时" :value="2" />
                </el-select>
              </el-form-item>
              <el-form-item label="时间">
                <el-time-picker
                  v-model="rule.time"
                  format="HH:mm"
                  value-format="HH:mm:ss"
                  :clearable="false"
                  @change="changed"
                />
                <div
                  v-if="messages(`profile.reminderRules.${index}.time`).length"
                  class="profile-field-error"
                >
                  {{ messages(`profile.reminderRules.${index}.time`).join('；') }}
                </div>
              </el-form-item>
              <el-form-item label="偏移分钟">
                <el-input-number v-model="rule.offsetMinutes" :min="-1439" :max="1439" @change="changed" />
              </el-form-item>
            </div>
          </el-form>
        </div>
      </TransitionGroup>
      <el-empty v-if="!reminderRules.length" class="panel" description="还没有提醒规则" :image-size="60" />
      <p class="form-hint">
        提醒规则跟随档案下发。固定时间提醒不能使用
        <code>{科目}</code>
        或
        <code>{节次}</code>
        占位符；指定科目提醒必须填写科目。
      </p>
    </el-tab-pane>

    <el-tab-pane v-if="sections.includes('preview')" label="日期预览" name="preview">
      <slot name="preview" />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.profile-tabs :deep(.el-tabs__content) {
  padding-top: 4px;
}
.profile-subtitle {
  margin: 4px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #2c5062;
}
.profile-day-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.profile-day-header :deep(.el-form-item) {
  margin-bottom: 12px;
}
.profile-day-mark {
  margin-left: 2px;
  font-weight: 700;
}
</style>

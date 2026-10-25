import type {
  Course,
  DateOverride,
  DaySchedule,
  NativeProfile,
  ReminderRule,
  Subject,
  TimeLine,
  WeekSchedule,
} from './wire'

export type ProfileTab = 'basic' | 'weeks' | 'subjects' | 'dates' | 'rules' | 'preview'
export type EditorSection = Exclude<ProfileTab, 'preview'>
export interface ValidationIssue {
  path: string
  message: string
}
export interface RowIssue {
  index: number
  message: string
}
export interface TimeSlot {
  startTime: string
  endTime: string
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
export const MODE_LABELS: Record<string, string> = { all: '全部周', odd: '单周', even: '双周' }
export const SECTION_LABELS: Record<EditorSection, string> = {
  basic: '基本信息',
  weeks: '周课表',
  subjects: '科目与节次',
  dates: '日期特殊安排',
  rules: '提醒规则',
}
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}$/
const MAX_BYTES = 2 * 1024 * 1024

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function newId(prefix: string, used: Iterable<string> = []): string {
  const taken = new Set(used)
  let id = ''
  do id = `${prefix}-${crypto.randomUUID()}`
  while (taken.has(id))
  return id
}

export function weekdayName(weekday: number): string {
  return `星期${WEEKDAY_LABELS[weekday - 1] || ''}`
}

export function todayText(): string {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value, index) => String(value).padStart(index ? 2 : 4, '0'))
    .join('-')
}

export function newProfile(name = '新的课表档案'): NativeProfile {
  return {
    version: 1,
    profile: {
      name,
      subjects: [],
      timeLines: [],
      schedules: [{ id: newId('week'), name: '常规周', mode: 'all', daySchedules: [] }],
      activeWeekScheduleId: '',
      dateOverrides: [],
      reminderRules: [],
    },
  }
}

export function prepareDraft(content: unknown): NativeProfile {
  const draft = cloneJson(content) as NativeProfile
  const profile = draft.profile
  profile.subjects ??= []
  profile.timeLines ??= []
  profile.schedules ??= []
  profile.activeWeekScheduleId ??= ''
  profile.dateOverrides ??= []
  profile.reminderRules ??= []
  return draft
}

export function newWeek(profile: NativeProfile): WeekSchedule {
  return {
    id: newId(
      'week',
      profile.profile.schedules.map((week) => week.id),
    ),
    name: '新周课表',
    mode: 'all',
    daySchedules: [],
  }
}

export function newDay(weekday: number): DaySchedule {
  return { name: weekdayName(weekday), enableDay: weekday, classes: [] }
}

export function timeToSeconds(value: string): number | null {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [hours, minutes, seconds] = match.slice(1).map(Number)
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds
}

function formatSeconds(total: number): string {
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export function addMinutes(value: string, minutes: number): string | null {
  const start = timeToSeconds(value)
  if (start === null) return null
  const end = start + minutes * 60
  return end > 86399 ? null : formatSeconds(end)
}

export function nextTimeSlot(items: Array<{ startTime: string; endTime: string }>): TimeSlot {
  const fallback = { startTime: '08:00:00', endTime: '08:45:00' }
  if (!items.length) return fallback
  const last = items.reduce((current, item) =>
    (timeToSeconds(item.endTime) ?? -1) > (timeToSeconds(current.endTime) ?? -1) ? item : current,
  )
  const end = addMinutes(last.endTime, 45)
  if (!end) return fallback
  return { startTime: last.endTime, endTime: end }
}

export function newCourse(classes: Course[]): Course {
  return { subject: '', ...nextTimeSlot(classes) }
}

export function newTimeLine(): TimeLine {
  return { name: '新时间线', timePoints: [] }
}

export function sortCourses(classes: Course[]): void {
  classes.sort((left, right) => left.startTime.localeCompare(right.startTime))
}

function rangeIssues(items: Array<{ startTime: string; endTime: string }>): RowIssue[] {
  const issues: RowIssue[] = []
  items.forEach((item, index) => {
    const start = timeToSeconds(item.startTime),
      end = timeToSeconds(item.endTime)
    if (start === null || end === null) issues.push({ index, message: '时间必须为 HH:mm:ss' })
    else if (start >= end) issues.push({ index, message: '开始时间必须早于结束时间' })
  })
  const ordered = items
    .map((item, index) => ({
      index,
      start: timeToSeconds(item.startTime),
      end: timeToSeconds(item.endTime),
    }))
    .filter(
      (item): item is { index: number; start: number; end: number } =>
        item.start !== null && item.end !== null,
    )
    .sort((left, right) => left.start - right.start)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].end > ordered[index].start)
      issues.push({ index: ordered[index].index, message: `与第 ${ordered[index - 1].index + 1} 条时间重叠` })
  }
  return issues
}

export function courseTimeIssues(classes: Course[]): RowIssue[] {
  return rangeIssues(classes)
}

export function timeRangeIssues(points: Array<{ startTime: string; endTime: string }>): RowIssue[] {
  return rangeIssues(points)
}

export function validDateText(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function sameCourses(left: Course[], right: Course[]): boolean {
  const canonical = (items: Course[]) =>
    items.map((course) => JSON.stringify([course.subject, course.startTime, course.endTime])).sort()
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export function sourceDay(profile: NativeProfile, weekId: string, weekday: number): DaySchedule | undefined {
  return profile.profile.schedules
    .find((week) => week.id === weekId)
    ?.daySchedules.find((day) => day.enableDay === weekday)
}

export function overridesFor(profile: NativeProfile, weekId?: string, weekday?: number): DateOverride[] {
  return (profile.profile.dateOverrides ?? []).filter(
    (override) =>
      (weekId === undefined || override.sourceWeekScheduleId === weekId) &&
      (weekday === undefined || override.sourceWeekday === weekday),
  )
}

export function reconcileOverrides(profile: NativeProfile): number {
  let updated = 0
  for (const override of profile.profile.dateOverrides ?? []) {
    const day = sourceDay(profile, override.sourceWeekScheduleId, override.sourceWeekday)
    if (!day) continue
    if (sameCourses(day.classes, override.sourceClasses)) continue
    override.sourceClasses = cloneJson(day.classes)
    updated += 1
  }
  return updated
}

export function rebaseOverride(profile: NativeProfile, override: DateOverride): void {
  const day = sourceDay(profile, override.sourceWeekScheduleId, override.sourceWeekday)
  override.sourceClasses = day ? cloneJson(day.classes) : []
}

export function removeWeek(profile: NativeProfile, weekId: string): DateOverride[] {
  const removed = overridesFor(profile, weekId)
  profile.profile.dateOverrides = (profile.profile.dateOverrides ?? []).filter(
    (override) => override.sourceWeekScheduleId !== weekId,
  )
  profile.profile.schedules = profile.profile.schedules.filter((week) => week.id !== weekId)
  if (profile.profile.activeWeekScheduleId === weekId) profile.profile.activeWeekScheduleId = ''
  return removed
}

export function removeDay(profile: NativeProfile, weekId: string, weekday: number): DateOverride[] {
  const removed = overridesFor(profile, weekId, weekday)
  profile.profile.dateOverrides = (profile.profile.dateOverrides ?? []).filter(
    (override) => override.sourceWeekScheduleId !== weekId || override.sourceWeekday !== weekday,
  )
  const week = profile.profile.schedules.find((item) => item.id === weekId)
  if (week) week.daySchedules = week.daySchedules.filter((day) => day.enableDay !== weekday)
  return removed
}

export function subjectUsage(profile: NativeProfile, name: string): { courses: number; rules: number } {
  const lists: Course[][] = []
  for (const week of profile.profile.schedules) for (const day of week.daySchedules) lists.push(day.classes)
  for (const override of profile.profile.dateOverrides ?? [])
    lists.push(override.sourceClasses, override.classes)
  const courses = lists.reduce(
    (count, list) => count + list.filter((course) => course.subject === name).length,
    0,
  )
  const rules = (profile.profile.reminderRules ?? []).filter(
    (rule) => rule.course === 1 && rule.subject === name,
  ).length
  return { courses, rules }
}

export function renameSubject(profile: NativeProfile, oldName: string, newName: string): number {
  let changed = 0
  const renameCourses = (classes: Course[]) => {
    for (const course of classes)
      if (course.subject === oldName) {
        course.subject = newName
        changed += 1
      }
  }
  for (const week of profile.profile.schedules)
    for (const day of week.daySchedules) renameCourses(day.classes)
  for (const override of profile.profile.dateOverrides ?? []) {
    renameCourses(override.sourceClasses)
    renameCourses(override.classes)
  }
  for (const rule of profile.profile.reminderRules ?? [])
    if (rule.course === 1 && rule.subject === oldName) {
      rule.subject = newName
      changed += 1
    }
  const subject = profile.profile.subjects.find((item) => item.name === oldName)
  if (subject) subject.name = newName
  return changed
}

export function missingSubjects(profile: NativeProfile): string[] {
  const known = new Set(profile.profile.subjects.map((subject) => subject.name))
  const used = new Set<string>()
  for (const week of profile.profile.schedules)
    for (const day of week.daySchedules)
      for (const course of day.classes) if (course.subject.trim()) used.add(course.subject)
  for (const override of profile.profile.dateOverrides ?? [])
    for (const course of [...override.sourceClasses, ...override.classes])
      if (course.subject.trim()) used.add(course.subject)
  for (const rule of profile.profile.reminderRules ?? [])
    if (rule.course === 1 && rule.subject.trim()) used.add(rule.subject)
  return [...used].filter((name) => !known.has(name)).sort()
}

export function addMissingSubjects(profile: NativeProfile): number {
  const missing = missingSubjects(profile)
  for (const name of missing)
    profile.profile.subjects.push({
      name,
      simplifiedName: [...name][0] || name,
      teacher: '',
    })
  return missing.length
}

export function newSubject(): Subject {
  return { name: '', simplifiedName: '', teacher: '' }
}

export function newOverride(
  profile: NativeProfile,
  weekId: string,
  weekday: number,
): DateOverride | undefined {
  const day = sourceDay(profile, weekId, weekday)
  if (!day) return undefined
  return {
    date: todayText(),
    sourceWeekScheduleId: weekId,
    sourceWeekday: weekday,
    sourceClasses: cloneJson(day.classes),
    classes: cloneJson(day.classes),
  }
}

export function newReminderRule(profile: NativeProfile): ReminderRule {
  return {
    id: newId(
      'rule',
      (profile.profile.reminderRules ?? []).map((rule) => rule.id),
    ),
    name: '新提醒',
    enabled: true,
    text: '{科目}即将开始',
    weekdays: [1, 2, 3, 4, 5] as ReminderRule['weekdays'],
    course: 0,
    subject: '',
    period: 1,
    timing: 1,
    time: '08:00:00',
    offsetMinutes: 5,
  }
}

export function profileBytes(draft: NativeProfile): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(draft)).length
  } catch {
    return null
  }
}

export function localIssues(draft: NativeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  const add = (path: string, message: string) => {
    const key = `${path}\u0000${message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({ path, message })
  }
  const text = (value: string | null | undefined) => (value ?? '').trim()
  const tooLong = (value: string, max: number) => [...value].length > max
  const profile = draft.profile
  const subjects = profile.subjects ?? []
  const timeLines = profile.timeLines ?? []
  const schedules = profile.schedules ?? []
  const overrides = profile.dateOverrides ?? []
  const rules = profile.reminderRules ?? []

  if (draft.version !== 1) add('version', '只支持原生档案版本 1')
  if (!text(profile.name)) add('profile.name', '请填写档案名称')
  else if (tooLong(profile.name, 100)) add('profile.name', '档案名称不能超过 100 个字符')
  if (profile.semesterStartDate != null && !validDateText(profile.semesterStartDate))
    add('profile.semesterStartDate', '学期开始日期必须为有效的 YYYY-MM-DD')

  if (subjects.length > 1000) add('profile.subjects', '科目最多 1000 个')
  const subjectNames = new Set<string>()
  subjects.forEach((subject, index) => {
    const path = `profile.subjects.${index}`
    const name = text(subject.name)
    if (!name) add(`${path}.name`, '请填写科目名称')
    else if (tooLong(subject.name, 100)) add(`${path}.name`, '科目名称不能超过 100 个字符')
    else if (subjectNames.has(name)) add(`${path}.name`, '科目名称重复')
    if (name) subjectNames.add(name)
    if (tooLong(subject.simplifiedName ?? '', 100))
      add(`${path}.simplifiedName`, '科目简称不能超过 100 个字符')
    if (tooLong(subject.teacher ?? '', 100)) add(`${path}.teacher`, '教师不能超过 100 个字符')
  })

  if (timeLines.length > 100) add('profile.timeLines', '时间线最多 100 条')
  timeLines.forEach((line, index) => {
    const path = `profile.timeLines.${index}`
    if (!text(line.name)) add(`${path}.name`, '请填写时间线名称')
    else if (tooLong(line.name, 100)) add(`${path}.name`, '时间线名称不能超过 100 个字符')
    if (line.timePoints.length > 1000) add(`${path}.timePoints`, '时间线最多 1000 个时段')
    for (const issue of timeRangeIssues(line.timePoints))
      add(`${path}.timePoints.${issue.index}.startTime`, issue.message)
  })

  if (schedules.length > 100) add('profile.schedules', '周课表最多 100 张')
  const weekIds = new Set<string>()
  for (const [weekIndex, week] of schedules.entries()) {
    const path = `profile.schedules.${weekIndex}`
    if (!text(week.name)) add(`${path}.name`, '请填写周课表名称')
    else if (tooLong(week.name, 100)) add(`${path}.name`, '周课表名称不能超过 100 个字符')
    if (!text(week.id)) add(`${path}.id`, '周课表 ID 不能为空')
    else if (tooLong(week.id, 128)) add(`${path}.id`, '周课表 ID 不能超过 128 个字符')
    else if (weekIds.has(week.id)) add(`${path}.id`, '周课表 ID 重复')
    if (text(week.id)) weekIds.add(week.id)
    if (!['all', 'odd', 'even'].includes(week.mode)) add(`${path}.mode`, '匹配模式无效')
    if (week.daySchedules.length > 7) add(`${path}.daySchedules`, '一张周课表最多 7 天')
    const days = new Set<number>()
    for (const [dayIndex, day] of week.daySchedules.entries()) {
      const dayPath = `${path}.daySchedules.${dayIndex}`
      if (!Number.isInteger(day.enableDay) || day.enableDay < 1 || day.enableDay > 7)
        add(`${dayPath}.enableDay`, '星期必须为 1～7')
      else if (days.has(day.enableDay)) add(`${dayPath}.enableDay`, '星期重复')
      if (Number.isInteger(day.enableDay)) days.add(day.enableDay)
      if (!text(day.name)) add(`${dayPath}.name`, '请填写星期名称')
      else if (tooLong(day.name, 100)) add(`${dayPath}.name`, '星期名称不能超过 100 个字符')
      if (day.classes.length > 1000) add(`${dayPath}.classes`, '每天最多 1000 节课')
      day.classes.forEach((course, courseIndex) => {
        const coursePath = `${dayPath}.classes.${courseIndex}`
        if (!text(course.subject)) add(`${coursePath}.subject`, '请填写科目')
        else if (tooLong(course.subject, 100)) add(`${coursePath}.subject`, '科目不能超过 100 个字符')
      })
      for (const issue of courseTimeIssues(day.classes))
        add(`${dayPath}.classes.${issue.index}.startTime`, issue.message)
    }
  }

  if (profile.activeWeekScheduleId && !weekIds.has(profile.activeWeekScheduleId))
    add('profile.activeWeekScheduleId', '手动选择的课表不存在')

  if (overrides.length > 1000) add('profile.dateOverrides', '日期特殊安排最多 1000 条')
  const dates = new Set<string>()
  overrides.forEach((override, index) => {
    const path = `profile.dateOverrides.${index}`
    if (!validDateText(override.date)) add(`${path}.date`, '日期必须为有效的 YYYY-MM-DD')
    else if (dates.has(override.date)) add(`${path}.date`, '特殊安排日期重复')
    dates.add(override.date)
    if (!Number.isInteger(override.sourceWeekday) || override.sourceWeekday < 1 || override.sourceWeekday > 7)
      add(`${path}.sourceWeekday`, '来源星期必须为 1～7')
    const day = sourceDay(draft, override.sourceWeekScheduleId, override.sourceWeekday)
    if (!day) add(`${path}.sourceClasses`, '来源周课表或星期不存在')
    else if (!sameCourses(day.classes, override.sourceClasses))
      add(`${path}.sourceClasses`, '来源快照与来源日课程不一致')
    if (override.classes.length > 1000) add(`${path}.classes`, '特殊安排最多 1000 节课')
    for (const issue of courseTimeIssues(override.sourceClasses))
      add(`${path}.sourceClasses.${issue.index}.startTime`, issue.message)
    for (const issue of courseTimeIssues(override.classes))
      add(`${path}.classes.${issue.index}.startTime`, issue.message)
  })

  if (rules.length > 1000) add('profile.reminderRules', '提醒规则最多 1000 条')
  const ruleIds = new Set<string>()
  rules.forEach((rule, index) => {
    const path = `profile.reminderRules.${index}`
    if (!text(rule.id)) add(`${path}.id`, '提醒 ID 不能为空')
    else if (tooLong(rule.id, 128)) add(`${path}.id`, '提醒 ID 不能超过 128 个字符')
    else if (ruleIds.has(rule.id)) add(`${path}.id`, '提醒 ID 重复')
    if (text(rule.id)) ruleIds.add(rule.id)
    if (!text(rule.name)) add(`${path}.name`, '请填写提醒名称')
    else if (tooLong(rule.name, 100)) add(`${path}.name`, '提醒名称不能超过 100 个字符')
    if (!text(rule.text)) add(`${path}.text`, '请填写提醒文本')
    else if (tooLong(rule.text, 1000)) add(`${path}.text`, '提醒文本不能超过 1000 个字符')
    if (rule.weekdays.length < 1 || rule.weekdays.length > 7)
      add(`${path}.weekdays`, '提醒星期必须为 1～7 个')
    if (new Set(rule.weekdays).size !== rule.weekdays.length) add(`${path}.weekdays`, '提醒星期重复')
    if (rule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
      add(`${path}.weekdays`, '提醒星期必须为 1～7')
    if (![0, 1, 2].includes(rule.course)) add(`${path}.course`, '提醒课程条件无效')
    if (rule.course === 1 && !text(rule.subject)) add(`${path}.subject`, '指定科目提醒必须填写科目')
    if (!Number.isInteger(rule.period) || rule.period < 1 || rule.period > 999)
      add(`${path}.period`, '节次必须为 1～999')
    if (![0, 1, 2].includes(rule.timing)) add(`${path}.timing`, '提醒时机无效')
    if (!TIME_PATTERN.test(rule.time) || timeToSeconds(rule.time) === null)
      add(`${path}.time`, '时间必须为 HH:mm:ss')
    if (!Number.isInteger(rule.offsetMinutes) || rule.offsetMinutes < -1439 || rule.offsetMinutes > 1439)
      add(`${path}.offsetMinutes`, '偏移分钟必须为 -1439～1439')
    if (rule.timing === 0 && /{科目}|{节次}/.test(rule.text))
      add(`${path}.text`, '固定时间提醒不能使用课程占位符')
  })

  const bytes = profileBytes(draft)
  if (bytes === null) add('profile', '档案内容包含无法序列化的值')
  else if (bytes > MAX_BYTES) add('profile', '档案内容不能超过 2 MiB')
  return issues
}

export function sectionOfIssue(issue: ValidationIssue): EditorSection {
  const path = issue.path
  if (/^profile\.schedules(\.|$)/.test(path)) return 'weeks'
  if (/^profile\.(subjects|timeLines)(\.|$)/.test(path)) return 'subjects'
  if (/^profile\.dateOverrides(\.|$)/.test(path)) return 'dates'
  if (/^profile\.reminderRules(\.|$)/.test(path)) return 'rules'
  if (/^profile\.(name|semesterStartDate|activeWeekScheduleId)(\.|$)/.test(path)) return 'basic'
  const message = issue.message
  if (/科目/.test(message)) return 'subjects'
  if (/提醒/.test(message)) return 'rules'
  if (/特殊安排|日期/.test(message)) return 'dates'
  if (/周课表|星期/.test(message)) return 'weeks'
  return 'basic'
}

import { describe, expect, it } from 'vitest'
import {
  addMissingSubjects,
  cloneJson,
  courseTimeIssues,
  localIssues,
  missingSubjects,
  newCourse,
  newProfile,
  newReminderRule,
  nextTimeSlot,
  prepareDraft,
  reconcileOverrides,
  removeDay,
  removeWeek,
  renameSubject,
  sectionOfIssue,
  sourceDay,
  subjectUsage,
} from './profile'
import type { NativeProfile } from './wire'

function sample(): NativeProfile {
  const draft = newProfile('测试档案')
  draft.profile.semesterStartDate = '2026-09-01'
  const week = draft.profile.schedules[0]
  week.id = 'week-a'
  week.name = '常规周'
  week.daySchedules = [
    {
      name: '星期一',
      enableDay: 1,
      classes: [
        { subject: '语文', startTime: '08:00:00', endTime: '08:45:00' },
        { subject: '数学', startTime: '09:00:00', endTime: '09:45:00' },
      ],
    },
  ]
  draft.profile.subjects = [
    { name: '语文', simplifiedName: '语', teacher: '' },
    { name: '数学', simplifiedName: '数', teacher: '' },
  ]
  draft.profile.dateOverrides = [
    {
      date: '2026-10-26',
      sourceWeekScheduleId: 'week-a',
      sourceWeekday: 1,
      sourceClasses: cloneJson(week.daySchedules[0].classes),
      classes: [{ subject: '语文', startTime: '10:00:00', endTime: '10:45:00' }],
    },
  ]
  const rule = newReminderRule(draft)
  rule.course = 1
  rule.subject = '语文'
  draft.profile.reminderRules = [rule]
  return draft
}

describe('profile editor helpers', () => {
  it('creates an editable blank profile with stable unique ids', () => {
    const first = newProfile(),
      second = newProfile()
    expect(first.profile.schedules).toHaveLength(1)
    expect(first.profile.schedules[0].id).not.toEqual(second.profile.schedules[0].id)
    expect(first.profile.dateOverrides).toEqual([])
    expect(localIssues(first)).toEqual([])
  })

  it('fills optional collections without changing existing content', () => {
    const raw = {
      version: 1,
      profile: { name: '旧档案', subjects: [], timeLines: [], schedules: [] },
    } as NativeProfile
    const draft = prepareDraft(raw)
    expect(draft.profile.activeWeekScheduleId).toBe('')
    expect(draft.profile.dateOverrides).toEqual([])
    expect(draft.profile.reminderRules).toEqual([])
    expect(draft.profile.name).toBe('旧档案')
  })

  it('continues after the latest course and finds overlap and inverted ranges', () => {
    const classes = [
      { subject: '语文', startTime: '08:00:00', endTime: '08:45:00' },
      { subject: '数学', startTime: '09:00:00', endTime: '09:45:00' },
    ]
    expect(nextTimeSlot(classes)).toEqual({ startTime: '09:45:00', endTime: '10:30:00' })
    expect(newCourse(classes).subject).toBe('')

    const overlap = courseTimeIssues([
      { subject: 'A', startTime: '09:00:00', endTime: '10:00:00' },
      { subject: 'B', startTime: '09:30:00', endTime: '10:30:00' },
    ])
    expect(overlap.some((issue) => issue.index === 1 && issue.message.includes('重叠'))).toBe(true)

    const inverted = courseTimeIssues([{ subject: 'A', startTime: '10:00:00', endTime: '09:00:00' }])
    expect(inverted[0].message).toContain('开始时间必须早于结束时间')
  })

  it('keeps date override snapshots aligned with the source day', () => {
    const draft = sample()
    reconcileOverrides(draft)
    expect(localIssues(draft).filter((issue) => issue.path.includes('sourceClasses'))).toEqual([])

    draft.profile.schedules[0].daySchedules[0].classes[0].endTime = '08:50:00'
    expect(reconcileOverrides(draft)).toBe(1)
    const override = draft.profile.dateOverrides![0]
    expect(override.sourceClasses).toEqual(draft.profile.schedules[0].daySchedules[0].classes)
    expect(localIssues(draft).some((issue) => issue.path.includes('sourceClasses'))).toBe(false)
  })

  it('cleans overrides and manual selection when a referenced source is removed', () => {
    const draft = sample()
    draft.profile.activeWeekScheduleId = 'week-a'
    expect(removeDay(draft, 'week-a', 1)).toHaveLength(1)
    expect(draft.profile.dateOverrides).toEqual([])
    expect(draft.profile.schedules[0].daySchedules).toEqual([])
    expect(draft.profile.activeWeekScheduleId).toBe('week-a')

    draft.profile.schedules[0].daySchedules = [{ name: '星期一', enableDay: 1, classes: [] }]
    expect(removeWeek(draft, 'week-a')).toEqual([])
    expect(draft.profile.schedules).toEqual([])
    expect(draft.profile.activeWeekScheduleId).toBe('')
  })

  it('renames a subject across courses, overrides and subject rules', () => {
    const draft = sample()
    expect(subjectUsage(draft, '语文')).toEqual({ courses: 3, rules: 1 })
    expect(renameSubject(draft, '语文', '语文阅读')).toBe(4)
    expect(draft.profile.subjects.map((subject) => subject.name)).toEqual(['语文阅读', '数学'])
    expect(draft.profile.schedules[0].daySchedules[0].classes[0].subject).toBe('语文阅读')
    expect(draft.profile.dateOverrides![0].classes[0].subject).toBe('语文阅读')
    expect(draft.profile.reminderRules![0].subject).toBe('语文阅读')
  })

  it('reports duplicate dates, missing sources, fixed placeholders and invalid fields', () => {
    const draft = sample()
    draft.profile.dateOverrides!.push({
      ...cloneJson(draft.profile.dateOverrides![0]),
      sourceWeekScheduleId: 'missing',
    })
    draft.profile.reminderRules![0].timing = 0
    draft.profile.reminderRules![0].text = '{科目}即将开始'
    const messages = localIssues(draft).map((issue) => issue.message)
    expect(messages).toContain('特殊安排日期重复')
    expect(messages).toContain('来源周课表或星期不存在')
    expect(messages).toContain('固定时间提醒不能使用课程占位符')
  })

  it('requires a subject for subject reminders and allows plain fixed text', () => {
    const draft = sample()
    const rule = draft.profile.reminderRules![0]
    rule.subject = ''
    expect(localIssues(draft).map((issue) => issue.message)).toContain('指定科目提醒必须填写科目')
    rule.course = 0
    rule.timing = 0
    rule.text = '考试开始'
    expect(localIssues(draft).some((issue) => issue.path.includes('reminderRules'))).toBe(false)
  })

  it('finds and fills subjects used by courses', () => {
    const draft = sample()
    draft.profile.schedules[0].daySchedules[0].classes.push({
      subject: '英语',
      startTime: '11:00:00',
      endTime: '11:45:00',
    })
    reconcileOverrides(draft)
    expect(missingSubjects(draft)).toEqual(['英语'])
    expect(addMissingSubjects(draft)).toBe(1)
    expect(draft.profile.subjects.some((subject) => subject.name === '英语')).toBe(true)
  })

  it('maps server error paths to editor sections', () => {
    expect(
      sectionOfIssue({
        path: 'profile.schedules.0.daySchedules.0.classes.1.startTime',
        message: '重叠',
      }),
    ).toBe('weeks')
    expect(sectionOfIssue({ path: 'profile', message: '科目名称重复' })).toBe('subjects')
    expect(sectionOfIssue({ path: 'profile', message: '特殊安排来源不存在' })).toBe('dates')
    expect(sectionOfIssue({ path: 'profile', message: '提醒星期重复' })).toBe('rules')
    expect(sectionOfIssue({ path: 'profile.activeWeekScheduleId', message: '' })).toBe('basic')
  })

  it('locates the source day used by an override', () => {
    const draft = sample()
    expect(sourceDay(draft, 'week-a', 1)?.classes).toHaveLength(2)
    expect(sourceDay(draft, 'week-a', 2)).toBeUndefined()
  })
})

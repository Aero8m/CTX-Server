import { describe, expect, it } from 'vitest'
import { classroomLabels, classroomResults, resultSummary, statusAdvice } from './workflow'
import type { Target } from './types'
import { newProfile, newDay, newOverride, reconcileOverrides, localIssues } from './profile'
import { copyDayCourses } from './timetable'
const target = (overrides: Partial<Target> = {}): Target => ({
  device_id: 'a',
  device_name: '一班',
  assignment_id: 'x',
  kind: 'profile',
  generation: 1,
  version_id: 'v',
  superseded: false,
  status: 'pending',
  reason: '',
  ...overrides,
})
describe('classroom results', () => {
  it('requires every selected channel to be applied', () => {
    const rows = classroomResults([
      target({ status: 'applied' }),
      target({ assignment_id: 'y', kind: 'display_config' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(resultSummary(rows[0].targets)).toBe('1 间等待同步')
  })
  it('counts classrooms rather than channel receipts', () => {
    const targets = [
      target({ status: 'applied' }),
      target({ kind: 'display_config', status: 'applied' }),
      target({ device_id: 'b', status: 'blocked' }),
      target({ device_id: 'c', status: 'failed' }),
    ]
    expect(resultSummary(targets)).toBe('1 间已生效 · 2 间需要处理')
  })
  it('keeps superseded failures from obscuring active results', () => {
    const old = target({ status: 'failed', superseded: true })
    expect(classroomResults([old])[0].status).toBe('superseded')
    expect(classroomResults([old, target({ kind: 'display_config' })])[0].status).toBe('pending')
    expect(classroomResults([old, target({ kind: 'display_config', status: 'failed' })])[0].status).toBe(
      'attention',
    )
    expect(classroomResults([old, target({ kind: 'display_config', status: 'applied' })])[0].status).toBe(
      'superseded',
    )
  })
  it('distinguishes absent results from an empty list and gives actionable advice', () => {
    expect(resultSummary()).toBe('读取结果中')
    expect(resultSummary([])).toBe('暂无目标教室')
    expect(statusAdvice('blocked', 'unsupported_format')).toContain('升级')
    expect(statusAdvice('blocked', 'plugin_conflict')).toContain('插件')
    expect(classroomLabels.applied).toBe('已生效')
  })
})
describe('copying a day of courses', () => {
  it('copies independently and updates source snapshots without losing special arrangements', () => {
    const profile = newProfile('课表'),
      week = profile.profile.schedules[0]
    profile.profile.subjects = ['语文', '数学', '英语'].map((name) => ({
      name,
      simplifiedName: '',
      teacher: '',
    }))
    const monday = newDay(1),
      tuesday = newDay(2)
    monday.classes = [{ subject: '语文', startTime: '08:00:00', endTime: '08:45:00' }]
    tuesday.classes = [{ subject: '英语', startTime: '10:00:00', endTime: '10:45:00' }]
    week.daySchedules = [monday, tuesday]
    profile.profile.dateOverrides = [newOverride(profile, week.id, 2)!]
    copyDayCourses(week, 1, [1, 2, 3, 3, 9])
    reconcileOverrides(profile)
    expect(week.daySchedules).toHaveLength(3)
    expect(tuesday.classes).toEqual(monday.classes)
    expect(profile.profile.dateOverrides[0].sourceClasses).toEqual(monday.classes)
    expect(profile.profile.dateOverrides[0].classes[0].subject).toBe('英语')
    tuesday.classes[0].subject = '数学'
    expect(monday.classes[0].subject).toBe('语文')
    expect(week.daySchedules.find((d) => d.enableDay === 3)!.classes[0].subject).toBe('语文')
    reconcileOverrides(profile)
    expect(localIssues(profile)).toEqual([])
  })
})

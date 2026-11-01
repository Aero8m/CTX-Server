import type { WeekSchedule } from './wire'
import { cloneJson, newDay } from './profile'

export function copyDayCourses(week: WeekSchedule, sourceDay: number, targets: number[]) {
  const source = week.daySchedules.find((day) => day.enableDay === sourceDay)
  if (!source) return
  for (const weekday of new Set(targets)) {
    if (weekday === sourceDay || weekday < 1 || weekday > 7) continue
    let day = week.daySchedules.find((day) => day.enableDay === weekday)
    if (!day) {
      day = newDay(weekday)
      week.daySchedules.push(day)
    }
    day.classes = cloneJson(source.classes)
  }
}

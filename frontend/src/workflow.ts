import type { Target } from './types'

export type ClassroomStatus = 'applied' | 'pending' | 'attention' | 'superseded'
export const classroomLabels: Record<ClassroomStatus, string> = {
  applied: '已生效',
  pending: '等待同步',
  attention: '需要处理',
  superseded: '已被后续发布替代',
}
export interface ClassroomResult {
  id: string
  name: string
  status: ClassroomStatus
  targets: Target[]
}
export function classroomResults(targets: Target[] = []): ClassroomResult[] {
  const groups = new Map<string, ClassroomResult>()
  for (const target of targets) {
    if (!groups.has(target.device_id))
      groups.set(target.device_id, {
        id: target.device_id,
        name: target.device_name,
        status: 'pending',
        targets: [],
      })
    groups.get(target.device_id)!.targets.push(target)
  }
  return [...groups.values()].map((group) => {
    const active = group.targets.filter((target) => !target.superseded)
    group.status = active.some((target) => ['failed', 'blocked'].includes(target.status))
      ? 'attention'
      : active.some((target) => target.status !== 'applied')
        ? 'pending'
        : group.targets.some((target) => target.superseded)
          ? 'superseded'
          : 'applied'
    return group
  })
}
export function resultSummary(targets?: Target[] | null): string {
  if (!targets) return '读取结果中'
  const rows = classroomResults(targets)
  return (
    (Object.keys(classroomLabels) as ClassroomStatus[])
      .map((status) => ({ status, count: rows.filter((row) => row.status === status).length }))
      .filter((item) => item.count)
      .map((item) => `${item.count} 间${classroomLabels[item.status]}`)
      .join(' · ') || '暂无目标教室'
  )
}
export function statusAdvice(status: string, reason = ''): string {
  if (reason === 'unsupported_format') return '请升级教室客户端，确保它支持本次内容格式，然后保持同步。'
  if (status === 'blocked')
    return /插件|plugin/i.test(reason)
      ? '请在教室设备检查插件与课程条布局，处理冲突后保持同步。'
      : '请在教室设备保存或退出本地编辑，解除冲突后保持同步。'
  if (status === 'failed') return '请检查教室设备的保存权限、剩余空间与客户端版本，处理后保持同步。'
  if (status === 'pending') return '请保持教室设备联网并运行同步；离线设备将在恢复连接后接收。'
  return '教室设备已确认应用本次内容。'
}
export function downloadJson(content: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

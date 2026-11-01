export type Kind = 'profile' | 'display_config'
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
export type {
  AccountView as Account,
  GroupView as Group,
  ChannelView as Channel,
  DeviceView as Device,
  ReceiptView as Receipt,
  ResourceView as Resource,
  VersionView as Version,
  TargetView as Target,
  ReleaseView as Release,
  PreviewView as Preview,
} from './wire'
export const kindLabel = (kind: string) => (kind === 'profile' ? '课表档案' : '客户端配置')
export const statusLabel = (status: string) =>
  ({ pending: '等待同步', applied: '已生效', failed: '应用失败', blocked: '需要处理' })[status] || status
export const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未连接'

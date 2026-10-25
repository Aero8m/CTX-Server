import { ElMessage } from 'element-plus'
import type { Page } from './types'
import { beginRequest } from './requestLoading'

export type RequestOptions = RequestInit & { background?: boolean }

let csrf = ''
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: unknown,
    public requestId: string,
  ) {
    super(message)
  }
}
export function setCsrf(value: string) {
  csrf = value
}
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { background = false, ...fetchOptions } = options
  const finish = background ? () => {} : beginRequest()
  try {
    const headers = new Headers(options.headers)
    if (options.body) headers.set('Content-Type', 'application/json')
    if (csrf && options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrf)
    let response: Response
    try {
      response = await fetch('/api/v1' + path, { ...fetchOptions, headers, credentials: 'same-origin' })
    } catch {
      const error = new ApiError('network_error', '网络连接失败，请检查连接后重试', null, '')
      ElMessage.error(error.message)
      throw error
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new ApiError(
        result.error?.code || 'http_error',
        result.error?.message || '请求失败',
        result.error?.details,
        result.error?.request_id || '',
      )
      if (response.status === 401 && !path.startsWith('/auth/'))
        window.dispatchEvent(new Event('ctx-session-expired'))
      ElMessage.error(error.message)
      throw error
    }
    return result.data as T
  } finally {
    finish()
  }
}
export const get = <T>(path: string, options: RequestOptions = {}) => request<T>(path, options)
export const post = <T>(path: string, data: unknown = {}, headers?: Record<string, string>) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data), headers })
export const patch = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
export async function all<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
  const finish = options.background ? () => {} : beginRequest()
  try {
    const items: T[] = []
    let page = 1
    while (true) {
      const result = await get<Page<T>>(
        `${path}${path.includes('?') ? '&' : '?'}page_size=100&page=${page++}`,
        { ...options, background: true },
      )
      items.push(...result.items)
      if (items.length >= result.total || !result.items.length) return items
    }
  } finally {
    finish()
  }
}
export async function initializeCsrf() {
  const result = await get<{ csrf_token: string; authenticated: boolean }>('/auth/csrf')
  setCsrf(result.csrf_token)
  return result
}

import { ElMessage } from 'element-plus'
import type { Page } from './types'
import { beginRequest } from './requestLoading'

export type RequestOptions = RequestInit & {
  background?: boolean
  reportError?: boolean
  raw?: boolean
  timeoutMs?: number
}

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
  const {
    background = false,
    reportError = !background,
    raw = false,
    timeoutMs = 30000,
    ...fetchOptions
  } = options
  const finish = background ? () => {} : beginRequest()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  function transportError() {
    const error = new ApiError(
      timedOut ? 'request_timeout' : 'network_error',
      timedOut ? '请求等待超时，请重试确认结果' : '网络连接失败，请检查连接后重试',
      null,
      '',
    )
    if (reportError) ElMessage.error(error.message)
    return error
  }
  try {
    const headers = new Headers(options.headers)
    if (options.body) headers.set('Content-Type', 'application/json')
    if (csrf && options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrf)
    let response: Response
    try {
      response = await fetch('/api/v1' + path, {
        ...fetchOptions,
        headers,
        credentials: 'same-origin',
        signal: controller.signal,
      })
    } catch {
      throw transportError()
    }
    const result = await response.json().catch(() => {
      if (controller.signal.aborted) throw transportError()
      if (!response.ok) return {}
      const error = new ApiError('invalid_response', '服务返回了无法读取的结果，请重试确认', null, '')
      if (reportError) ElMessage.error(error.message)
      throw error
    })
    if (!response.ok) {
      const error = new ApiError(
        result.error?.code || 'http_error',
        result.error?.message || '请求失败',
        result.error?.details,
        result.error?.request_id || '',
      )
      if (response.status === 401 && !path.startsWith('/auth/'))
        window.dispatchEvent(new Event('ctx-session-expired'))
      if (reportError) ElMessage.error(error.message)
      throw error
    }
    return (raw ? result : result.data) as T
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
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

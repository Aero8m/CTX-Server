import { afterEach, describe, expect, it, vi } from 'vitest'
import { all, ApiError, get } from './api'
import { requestPending } from './requestLoading'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const success = (data: unknown) => Response.json({ data })

afterEach(() => {
  expect(requestPending.value).toBe(false)
  vi.unstubAllGlobals()
})

describe('request loading lifecycle', () => {
  it('blocks until all concurrent requests finish, including a failed request', async () => {
    const first = deferred<Response>(),
      second = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
    const pendingFirst = get('/first'),
      pendingSecond = get('/second')
    const failed = expect(pendingFirst).rejects.toMatchObject({ code: 'network_error' })
    expect(requestPending.value).toBe(true)
    first.reject(new Error('offline'))
    await failed
    expect(requestPending.value).toBe(true)
    second.resolve(success({ value: 2 }))
    await expect(pendingSecond).resolves.toEqual({ value: 2 })
    expect(requestPending.value).toBe(false)
  })

  it('keeps the overlay while the response body is still being read', async () => {
    const body = deferred<unknown>()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }))
    const pending = get('/slow-body')
    await Promise.resolve()
    expect(requestPending.value).toBe(true)
    body.resolve({ data: 'done' })
    await expect(pending).resolves.toBe('done')
  })

  it('releases the overlay for server validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'validation_error',
              message: '输入有误',
              details: null,
              request_id: 'test',
            },
          },
          { status: 422 },
        ),
      ),
    )
    await expect(get('/invalid')).rejects.toBeInstanceOf(ApiError)
  })

  it('does not block unattended background requests or pass UI options to fetch', async () => {
    const response = deferred<Response>(),
      fetch = vi.fn().mockReturnValue(response.promise)
    vi.stubGlobal('fetch', fetch)
    const pending = get('/poll', { background: true })
    expect(requestPending.value).toBe(false)
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('background')
    response.resolve(success({ status: 'ready' }))
    await pending
  })

  it('keeps one loading operation across all pages of a list', async () => {
    const secondPage = deferred<Response>()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(success({ items: [1], total: 2 }))
      .mockReturnValueOnce(secondPage.promise)
    vi.stubGlobal('fetch', fetch)
    const pending = all<number>('/items')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(requestPending.value).toBe(true)
    secondPage.resolve(success({ items: [2], total: 2 }))
    await expect(pending).resolves.toEqual([1, 2])
  })
})

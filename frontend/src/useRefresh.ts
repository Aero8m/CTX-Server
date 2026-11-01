import { onMounted, onUnmounted, ref } from 'vue'
import type { RequestOptions } from './api'

// Preserve the last successful data and let each page show persistent refresh errors.
export function useRefresh(load: (options: RequestOptions) => Promise<unknown>, interval = 10000) {
  const error = ref(''),
    loading = ref(false),
    ready = ref(false)
  let current: Promise<boolean> | undefined
  let queued: Promise<boolean> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  function run(background = false): Promise<boolean> {
    if (disposed || (background && document.hidden)) return Promise.resolve(false)
    if (current) return current
    if (!background) loading.value = true
    current = (async () => {
      try {
        await load({ background: true, reportError: false })
        if (!disposed) {
          error.value = ''
          ready.value = true
        }
        return true
      } catch (reason) {
        if (!disposed) error.value = reason instanceof Error ? reason.message : '读取失败，请重试'
        return false
      } finally {
        loading.value = false
        current = undefined
      }
    })()
    return current
  }
  const visible = () => {
    void run(true)
  }
  onMounted(() => {
    void run()
    if (interval > 0) {
      timer = setInterval(() => void run(true), interval)
      document.addEventListener('visibilitychange', visible)
    }
  })
  onUnmounted(() => {
    disposed = true
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', visible)
  })
  function refresh() {
    if (!current) return run()
    // A changed filter or page must run after an in-flight poll, using the latest values.
    queued ??= current.then(() => {
      queued = undefined
      return run()
    })
    return queued
  }
  return Object.assign(refresh, { error, loading, ready })
}

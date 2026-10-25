import { onMounted, onUnmounted } from 'vue'
import type { RequestOptions } from './api'
import { beginRequest } from './requestLoading'

export function useRefresh(load: (options: RequestOptions) => Promise<unknown>) {
  let currentLoad: Promise<unknown> | undefined
  let timer: ReturnType<typeof setInterval>
  async function run(background = false) {
    if (document.hidden || (background && currentLoad)) return
    const finish = background ? () => {} : beginRequest()
    let task: Promise<unknown> | undefined
    try {
      task = currentLoad ?? load({ background })
      currentLoad = task
      await task
    } catch {
      /* API layer reports errors. */
    } finally {
      if (currentLoad === task) currentLoad = undefined
      finish()
    }
  }
  const onVisibilityChange = () => {
    void run(true)
  }
  onMounted(() => {
    void run()
    timer = setInterval(() => void run(true), 10000)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
  return () => run()
}

import { nextTick, onMounted, onUnmounted, watch, type Ref, type WatchSource } from 'vue'

// Animate the existing content so switching sections preserves forms and edit history.
export function useSectionMotion(target: Ref<HTMLElement | undefined>, section: WatchSource<unknown>) {
  let animation: Animation | undefined
  let reduced: MediaQueryList | undefined
  let disposed = false
  const cancel = () => {
    animation?.cancel()
    animation = undefined
  }
  const preferenceChanged = () => {
    if (reduced?.matches) cancel()
  }
  onMounted(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.addEventListener('change', preferenceChanged)
  })
  watch(section, async (_, __, onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    cancel()
    await nextTick()
    if (stale || disposed || reduced?.matches || !target.value) return
    animation = target.value.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  })
  onUnmounted(() => {
    disposed = true
    cancel()
    reduced?.removeEventListener('change', preferenceChanged)
  })
}

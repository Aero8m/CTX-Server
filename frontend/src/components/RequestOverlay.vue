<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { requestPending } from '../requestLoading'

const dialog = ref<HTMLDialogElement>()
const visible = ref(false)
let previousOverflow: string | undefined
let showFrame: number | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

function cancelScheduledWork() {
  if (showFrame !== undefined) cancelAnimationFrame(showFrame)
  if (closeTimer !== undefined) clearTimeout(closeTimer)
  showFrame = undefined
  closeTimer = undefined
}

function unlockScroll() {
  if (previousOverflow === undefined) return
  document.body.style.overflow = previousOverflow
  previousOverflow = undefined
}

function finishClose() {
  if (requestPending.value) return
  cancelScheduledWork()
  dialog.value?.close()
  visible.value = false
  unlockScroll()
}

function onTransitionEnd(event: TransitionEvent) {
  if (event.target === dialog.value && event.propertyName === 'opacity' && !visible.value) finishClose()
}

watch(
  [requestPending, dialog],
  ([pending, element]) => {
    if (!element) return
    if (pending) {
      cancelScheduledWork()
      if (element.open) {
        // A new request during fade-out reverses the transition without closing the modal.
        visible.value = true
        return
      }
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      element.showModal()
      // Paint the transparent starting state before transitioning the dialog and backdrop.
      showFrame = requestAnimationFrame(() => {
        showFrame = requestAnimationFrame(() => {
          showFrame = undefined
          visible.value = true
        })
      })
    } else if (!pending && element.open) {
      cancelScheduledWork()
      const wasVisible = visible.value
      visible.value = false
      if (!wasVisible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finishClose()
      } else {
        // Keep native modal blocking until fade-out ends; timeout also handles hidden tabs.
        closeTimer = setTimeout(finishClose, 220)
      }
    }
  },
  { flush: 'post' },
)

onUnmounted(() => {
  cancelScheduledWork()
  dialog.value?.close()
  unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="request-dialog"
      :class="{ 'is-visible': visible }"
      aria-labelledby="request-loading-title"
      @cancel.prevent
      @transitionend="onTransitionEnd"
    >
      <div role="status" aria-live="polite">
        <span class="request-spinner" aria-hidden="true"></span>
        <p id="request-loading-title">正在加载…</p>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.request-dialog {
  margin: auto;
  padding: 20px;
  max-width: calc(100vw - 40px);
  color: var(--el-color-primary, #167c85);
  background: transparent;
  border: 0;
  outline: none;
  box-shadow: none;
  text-align: center;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 180ms ease,
    transform 180ms var(--motion-ease, ease);
}
.request-dialog.is-visible {
  opacity: 1;
  transform: translateY(0);
}
.request-dialog::backdrop {
  background: rgb(243 246 248 / 60%);
  opacity: 0;
  transition: opacity 180ms ease;
}
.request-dialog.is-visible::backdrop {
  opacity: 1;
}
.request-spinner {
  display: block;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border: 3px solid rgb(22 124 133 / 15%);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: request-spin 0.8s linear infinite;
}
#request-loading-title {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
}
@keyframes request-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

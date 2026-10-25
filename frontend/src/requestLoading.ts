import { computed, ref } from 'vue'

const pendingRequests = ref(0)
export const requestPending = computed(() => pendingRequests.value > 0)

export function beginRequest() {
  pendingRequests.value += 1
  let finished = false
  return () => {
    if (finished) return
    finished = true
    pendingRequests.value -= 1
  }
}

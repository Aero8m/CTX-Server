import { onMounted, onUnmounted, type Ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessageBox } from 'element-plus'

export function useUnsaved(
  dirty: Ref<boolean>,
  busy?: Ref<boolean>,
  message = '有未保存的修改，离开后会丢失。',
) {
  async function confirmLeave() {
    if (busy?.value) return false
    if (!dirty.value) return true
    try {
      await ElMessageBox.confirm(message, '保留当前操作？', {
        confirmButtonText: '放弃修改并离开',
        cancelButtonText: '继续编辑',
        type: 'warning',
      })
      return true
    } catch {
      return false
    }
  }
  onBeforeRouteLeave(confirmLeave)
  onBeforeRouteUpdate(confirmLeave)
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value || busy?.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
  return confirmLeave
}

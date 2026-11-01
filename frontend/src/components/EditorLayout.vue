<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSectionMotion } from '../useSectionMotion'
import {
  Document,
  Reading,
  Clock,
  Calendar,
  Bell,
  Switch,
  Brush,
  Timer,
  FolderOpened,
  Lock,
  Connection,
} from '@element-plus/icons-vue'
const active = defineModel<string>({ required: true })
const props = defineProps<{
  title: string
  items: { id: string; label: string; icon: string }[]
  disabled?: boolean
}>()
const emit = defineEmits<{ save: [] }>()
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!props.disabled) emit('save')
  }
}
onMounted(() => window.addEventListener('keydown', shortcut))
onUnmounted(() => window.removeEventListener('keydown', shortcut))
const icons: Record<string, typeof Document> = {
  document: Document,
  subjects: Reading,
  clock: Clock,
  calendar: Calendar,
  bell: Bell,
  switch: Switch,
  brush: Brush,
  timer: Timer,
  folder: FolderOpened,
  shield: Lock,
  plugin: Connection,
}
const heading = computed(() => props.items.find((item) => item.id === active.value)?.label)
const content = ref<HTMLElement>()
useSectionMotion(content, active)
</script>

<template>
  <div class="client-editor">
    <header class="client-editor-actions panel editor-toolbar"><slot name="footer" /></header>
    <div class="client-editor-nav" role="navigation" :aria-label="`${title}分区`">
      <div class="client-editor-menu">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          :disabled="disabled"
          :aria-label="item.label"
          :aria-current="active === item.id ? 'page' : undefined"
          :class="{ active: active === item.id }"
          @click="active = item.id"
        >
          <el-icon><component :is="icons[item.icon] || Document" /></el-icon>{{ item.label }}
        </button>
      </div>
    </div>
    <div ref="content" class="client-editor-main" :inert="disabled || undefined">
      <h2 class="client-page-title">{{ heading }}</h2>
      <slot />
    </div>
  </div>
</template>

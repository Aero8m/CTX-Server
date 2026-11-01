<script setup lang="ts">
import { computed } from 'vue'
import type { NativeProfile, DisplayConfig } from '../wire'
import { MODE_LABELS, weekdayName } from '../profile'
import { componentLabels } from '../display'
const props = defineProps<{ kind: string; content: unknown }>()
const profile = computed(() => (props.content as NativeProfile).profile)
const subjectCount = computed(
  () =>
    new Set(
      profile.value.schedules.flatMap((week) =>
        week.daySchedules.flatMap((day) => day.classes.map((course) => course.subject)),
      ),
    ).size,
)
const display = computed(() => props.content as DisplayConfig)
const themeLabels: Record<string, string> = { light: '浅色', dark: '深色', system: '跟随系统' }
const themeLabel = computed(
  () => themeLabels[display.value.appearanceConfig?.themeMode || 'system'] || '跟随系统',
)
const displayComponents = computed(
  () =>
    display.value.courseBarConfig.components
      .filter((c) => c.enabled !== false)
      .map((c) => componentLabels[c.typeId] || c.typeId)
      .join('、') || '无',
)
</script>
<template>
  <div v-if="kind === 'profile'" class="content-preview">
    <h3>{{ profile.name }}</h3>
    <p v-if="profile.activeWeekScheduleId" class="form-hint">
      当前手动使用：{{ profile.schedules.find((s) => s.id === profile.activeWeekScheduleId)?.name }}
    </p>
    <section v-for="week in profile.schedules" :key="week.id" class="preview-week">
      <h4>{{ week.name }} · {{ MODE_LABELS[week.mode] }}</h4>
      <div class="preview-days">
        <div
          v-for="day in [...week.daySchedules].sort((a, b) => a.enableDay - b.enableDay)"
          :key="day.enableDay"
          class="preview-day"
        >
          <strong>{{ weekdayName(day.enableDay) }}</strong>
          <p
            v-for="(course, i) in [...day.classes].sort((a, b) => a.startTime.localeCompare(b.startTime))"
            :key="i"
          >
            <span>{{ course.startTime.slice(0, 5) }}–{{ course.endTime.slice(0, 5) }}</span>
            {{ course.subject }}
          </p>
          <p v-if="!day.classes.length" class="muted">不上课</p>
        </div>
      </div>
      <p v-if="!week.daySchedules.length" class="muted">这张周课表尚未安排课程</p>
    </section>
    <details v-if="profile.dateOverrides?.length">
      <summary>临时调课 · {{ profile.dateOverrides.length }} 天</summary>
      <div v-for="override in profile.dateOverrides" :key="override.date">
        <h4>{{ override.date }}</h4>
        <p v-for="(course, i) in override.classes" :key="i">
          {{ course.startTime.slice(0, 5) }}–{{ course.endTime.slice(0, 5) }} {{ course.subject }}
        </p>
        <p v-if="!override.classes.length">当天不上课</p>
      </div>
    </details>
    <p class="muted">{{ subjectCount }} 个课程科目 · {{ profile.reminderRules?.length || 0 }} 条提醒规则</p>
  </div>
  <div v-else class="content-preview">
    <h3>客户端配置</h3>
    <p>课程条：{{ display.courseBarConfig.enable === false ? '关闭' : '开启' }}</p>
    <p>显示组件：{{ displayComponents }}</p>
    <p>外观：{{ themeLabel }} · 主题色 {{ display.appearanceConfig?.themeColor || '默认' }}</p>
    <p>
      桌面倒计时：{{
        display.desktopCountdownConfig?.enable
          ? `${display.desktopCountdownConfig.labelTag || '倒计时'} · ${display.desktopCountdownConfig.targetDateTime}`
          : '关闭'
      }}
    </p>
    <p v-if="display.windowInterceptionConfig">
      窗口拦截：{{ display.windowInterceptionConfig.rules.length }} 条规则，
      {{
        display.windowInterceptionConfig.rules.filter((rule) => rule.enabled).length
      }}
      条启用；完整替换设备规则。
    </p>
    <p v-else>窗口拦截：保留设备现有规则。</p>
    <template v-if="display.pluginConfig">
      <p>
        插件偏好：{{
          Object.keys(display.pluginConfig.plugins).length
        }}
        项，下次启动生效；未列出的插件保持原样。
      </p>
      <p v-for="(preference, id) in display.pluginConfig.plugins" :key="id" class="plugin-preference-preview">
        {{ id }}：{{ preference.enabled ? '启用' : '停用' }}
      </p>
    </template>
    <p v-else>插件偏好：保留设备现有设置。</p>
    <p v-if="display.schema_version === 2" class="form-hint">
      此配置需要支持配置格式 v2 的客户端；插件仍需设备安装并完成本地授权。
    </p>
  </div>
</template>

import type { DisplayConfig, Component } from './wire'

export const componentLabels: Record<string, string> = {
  'builtin/date': '日期',
  'builtin/courseView': '课程查看',
  'builtin/countdown': '倒计时',
  'builtin/textTip': '文本提示',
}
export function makeComponent(typeId: Component['typeId']): Component {
  return {
    typeId,
    instanceId: crypto.randomUUID(),
    enabled: true,
    settings: {},
    ...(typeId === 'builtin/textTip' ? { text: '欢迎来到课堂' } : {}),
    ...(typeId === 'builtin/courseView' ? { courseSpacing: 28 } : {}),
  }
}
export function defaultDisplay(): DisplayConfig {
  return {
    schema_version: 1,
    courseBarConfig: {
      enable: true,
      height: 49,
      componentSpacing: 14,
      components: ['builtin/date', 'builtin/courseView', 'builtin/countdown'].map((type) =>
        makeComponent(type as Component['typeId']),
      ),
    },
    appearanceConfig: { themeColor: '#1191d3', themeMode: 'system', windowEffect: 'mica' },
    desktopCountdownConfig: {
      enable: false,
      targetDateTime: '',
      labelTag: '',
      englishTag: '',
      showMilliseconds: true,
      useLegacyPlacement: true,
      rightMargin: 24,
      bottomMargin: 24,
      scalePercent: 100,
    },
  }
}
export function moveComponent(config: DisplayConfig, index: number, direction: -1 | 1) {
  const rows = config.courseBarConfig.components
  const next = index + direction
  if (next >= 0 && next < rows.length) [rows[index], rows[next]] = [rows[next], rows[index]]
}

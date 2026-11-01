import { describe, expect, it } from 'vitest'
import { defaultDisplay, makeComponent, moveComponent, prepareDisplay } from './display'

describe('display configuration', () => {
  it('keeps legacy sections unmanaged and promotes explicit management without mutating the input', () => {
    const legacy = defaultDisplay()
    expect(prepareDisplay(legacy).schema_version).toBe(1)
    expect(prepareDisplay(legacy)).not.toHaveProperty('windowInterceptionConfig')
    const extended = {
      ...legacy,
      windowInterceptionConfig: { rules: [] },
      pluginConfig: { plugins: { 'org.example.clock': { enabled: false } } },
    }
    const draft = prepareDisplay(extended)
    expect(draft.schema_version).toBe(2)
    expect(extended.schema_version).toBe(1)
    expect(draft.pluginConfig?.plugins['org.example.clock']?.enabled).toBe(false)
    delete draft.pluginConfig
    delete draft.windowInterceptionConfig
    expect(prepareDisplay(draft)).not.toHaveProperty('pluginConfig')
  })
  it('keeps component identities while reordering and does not move outside bounds', () => {
    const config = defaultDisplay(),
      before = config.courseBarConfig.components.map((c) => c.instanceId)
    moveComponent(config, 0, -1)
    expect(config.courseBarConfig.components.map((c) => c.instanceId)).toEqual(before)
    moveComponent(config, 0, 1)
    expect(config.courseBarConfig.components.map((c) => c.instanceId)).toEqual([
      before[1],
      before[0],
      before[2],
    ])
  })
  it('creates independent component IDs and keeps local-only settings out of payload', () => {
    expect(makeComponent('builtin/date').instanceId).not.toEqual(makeComponent('builtin/date').instanceId)
    const config = defaultDisplay()
    expect(config.courseBarConfig).not.toHaveProperty('uiAccessEnabled')
    expect(config.desktopCountdownConfig).not.toHaveProperty('screenName')
    expect(config).not.toHaveProperty('pluginConfig')
  })
})

import { describe, expect, it } from 'vitest'
import { defaultDisplay, makeComponent, moveComponent } from './display'

describe('display configuration', () => {
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

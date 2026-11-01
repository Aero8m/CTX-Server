import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import type { NativeProfile, ResourceView, ReleaseView } from '../src/wire'

const password = 'browser-password-123'
function seed(...args: string[]) {
  const python =
    process.env.CTX_PYTHON ||
    path.resolve('../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  execFileSync(python, ['tests/e2e_seed.py', ...args], {
    cwd: path.resolve('../backend'),
    env: process.env,
    windowsHide: true,
  })
}
async function login(page: Page) {
  const username = 'teacher_' + crypto.randomBytes(6).toString('hex')
  seed('--account', username)
  await page.goto('/login')
  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: '让第一间教室收到你的课表' })).toBeVisible()
}
async function api<T = any>(page: Page, method: string, endpoint: string, data?: unknown): Promise<T> {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token
  const response = await page.request.fetch('/api/v1' + endpoint, {
    method,
    data,
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).data as T
}
async function editorSection(page: Page, label: string) {
  await page.locator('.client-editor-menu').getByRole('button', { name: label, exact: true }).click()
}
async function chooseWeekday(page: Page, label: string) {
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '适用星期', exact: true }) })
    .click()
  await page.getByRole('option', { name: label, exact: true }).click()
}
async function addDay(page: Page) {
  await page.getByRole('button', { name: '添加星期', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
}
async function addSubject(page: Page, name: string, shortName = '', teacher = '') {
  await editorSection(page, '科目管理')
  await page.getByTestId('profile-add-subject').click()
  const dialog = page.getByRole('dialog', { name: '添加科目', exact: true })
  await page.getByTestId('subject-name').fill(name)
  if (shortName) await page.getByTestId('subject-short-name').fill(shortName)
  if (teacher) await page.getByTestId('subject-teacher').fill(teacher)
  await dialog.getByRole('button', { name: '确认科目', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
async function chooseSubject(page: Page, testId: string, name: string) {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name, exact: true }).click()
}
function profileFixture(): NativeProfile {
  return {
    version: 1,
    profile: {
      name: '原生档案名称',
      semesterStartDate: '2026-09-01',
      activeWeekScheduleId: '',
      subjects: [
        { name: '语文', simplifiedName: '语', teacher: '张老师' },
        ...['数学', '英语', '历史'].map((name) => ({ name, simplifiedName: name[0], teacher: '' })),
      ],
      timeLines: [{ name: '上午作息', timePoints: [{ startTime: '08:00:00', endTime: '08:45:00' }] }],
      schedules: [
        {
          id: 'week-odd',
          name: '单周',
          mode: 'odd',
          daySchedules: [
            {
              name: '星期一',
              enableDay: 1,
              classes: [{ subject: '语文', startTime: '08:00:00', endTime: '08:45:00' }],
            },
          ],
        },
        {
          id: 'week-even',
          name: '双周',
          mode: 'even',
          daySchedules: [
            {
              name: '星期二',
              enableDay: 2,
              classes: [{ subject: '数学', startTime: '10:00:00', endTime: '10:35:00' }],
            },
          ],
        },
      ],
      dateOverrides: [
        {
          date: '2026-11-02',
          sourceWeekScheduleId: 'week-odd',
          sourceWeekday: 1,
          sourceClasses: [{ subject: '语文', startTime: '08:00:00', endTime: '08:45:00' }],
          classes: [{ subject: '英语', startTime: '09:00:00', endTime: '09:45:00' }],
        },
      ],
      reminderRules: [
        {
          id: 'rule-1',
          name: '上课提醒',
          enabled: true,
          text: '{科目}要上课了',
          weekdays: [1, 2, 3, 4, 5],
          course: 1,
          subject: '语文',
          period: 1,
          timing: 1,
          time: '08:00:00',
          offsetMinutes: 5,
        },
      ],
    },
  }
}
async function resource(page: Page, kind = 'profile') {
  const result = await api<{ resource: ResourceView }>(page, 'POST', '/resources', {
    name: kind === 'profile' ? '测试课表' : '测试展示',
    kind,
    content:
      kind === 'profile' ? profileFixture() : { schema_version: 1, courseBarConfig: { components: [] } },
  })
  return result.resource
}
async function pair(page: Page, name = '测试教室', group_id?: string) {
  const code = await api(page, 'POST', '/pairing-codes', { name, group_id: group_id || null })
  return claim(page, code.code)
}
async function claim(page: Page, code: string) {
  const secret = crypto.randomBytes(32).toString('base64url')
  const response = await page.request.post('/api/v1/device/pair', {
    data: { code, claim_id: crypto.randomUUID().replaceAll('-', ''), device_secret: secret },
  })
  expect(response.status()).toBe(201)
  return { id: (await response.json()).data.device_id as string, secret }
}
async function receipt(
  page: Page,
  secret: string,
  results: Record<string, { result: string; reason?: string; attempt?: number }>,
) {
  const response = await page.request.post('/api/v1/device/sync', {
    data: {},
    headers: { Authorization: 'Bearer ' + secret },
  })
  expect(response.ok()).toBeTruthy()
  const channels = (await response.json()).data.channels
  for (const target of Object.values(channels) as any[]) {
    if (!target || !results[target.kind]) continue
    const requested = results[target.kind]
    const download = await page.request.get(target.download_url, {
      headers: { Authorization: 'Bearer ' + secret },
    })
    expect(
      crypto
        .createHash('sha256')
        .update(await download.body())
        .digest('hex'),
    ).toBe(target.sha256)
    const response = await page.request.post('/api/v1/device/receipts', {
      headers: { Authorization: 'Bearer ' + secret },
      data: {
        assignment_id: target.assignment_id,
        kind: target.kind,
        generation: target.generation,
        version_id: target.version_id,
        attempt: requested.attempt || 1,
        result: requested.result,
        reason: requested.reason || '',
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
  }
}
async function previewWithDevice(page: Page, resource: ResourceView, name = '测试教室') {
  await page.goto(`/publish?${resource.kind === 'profile' ? 'profile' : 'display'}=${resource.id}`)
  await page.getByRole('button', { name: '下一步：选择教室' }).click()
  await page.getByText(name, { exact: true }).click()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '确认教室名单 · 1 间' })).toBeVisible()
}
async function settleTimetable(page: Page) {
  await editorSection(page, '课表管理')
  await expect(page.getByRole('heading', { name: '课表管理', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.page-content')
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter(
                (animation) =>
                  animation.playState === 'running' &&
                  Number.isFinite(animation.effect?.getComputedTiming().endTime),
              ).length,
        ),
    )
    .toBe(0)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
}
async function assertNoOverflow(page: Page) {
  // Resizing can overlap a closing teleported dropdown. Check the settled layout.
  await expect(async () => {
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      overflowing: Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.right > window.innerWidth
        })
        .slice(0, 12)
        .map((element) => `${element.tagName}.${element.className}`),
    }))
    expect(layout.width, `横向溢出元素：${layout.overflowing.join(', ')}`).toBeLessThanOrEqual(
      layout.viewport,
    )
  }).toPass({ timeout: 5000 })
}

test('new teacher registers, edits a visual timetable, connects a classroom and publishes on mobile', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  const captchaResponse = page.waitForResponse((r) => r.url().includes('/auth/captcha') && r.status() === 200)
  await page.getByRole('button', { name: '立即注册' }).click()
  seed((await (await captchaResponse).json()).data.id)
  await page.locator('input[name="username"]').fill('new_' + crypto.randomBytes(5).toString('hex'))
  await page.locator('input[name="password"]').fill(password)
  await page.locator('input[name="confirm"]').fill(password)
  await page.locator('input[name="captcha"]').fill('ABCDE')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: '让第一间教室收到你的课表' })).toBeVisible()
  await page.getByRole('button', { name: '创建第一张课表' }).click()
  await page.getByTestId('profile-name').fill('示范课表')
  await editorSection(page, '课表管理')
  await page.getByRole('button', { name: '新增科目', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '添加科目', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '星期一 · 添加课程', exact: true })).toHaveCount(0)
  await page.getByTestId('subject-name').fill('语文')
  await page.getByTestId('subject-short-name').fill('语')
  await page.getByTestId('subject-teacher').fill('张老师')
  await page.getByRole('button', { name: '确认科目', exact: true }).click()
  await addSubject(page, '数学')
  await editorSection(page, '课表管理')
  await addDay(page)
  await page.getByTestId('add-course-1').click()
  await page.getByRole('button', { name: '确认课程' }).click()
  await expect(
    page.getByRole('dialog').getByText('请选择已有科目；需要新科目时请先在科目设置中添加'),
  ).toBeVisible()
  await chooseSubject(page, 'course-subject', '语文')
  await page.getByRole('button', { name: '确认课程' }).click()
  await expect(page.getByTestId('course-1-0')).toContainText('语文')
  await page.getByRole('button', { name: '复制当天课程' }).click()
  await page.getByRole('dialog').getByText('星期二', { exact: true }).click()
  await page.getByRole('button', { name: '确认复制' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/profiles\/[a-f0-9]+\/edit$/)
  const profileId = /profiles\/([^/]+)/.exec(page.url())![1]
  const saved = await api<ResourceView>(page, 'GET', `/resources/${profileId}`)
  expect((saved.content as unknown as NativeProfile).profile.name).toBe('示范课表')
  expect((await api(page, 'GET', '/releases')).total).toBe(0)
  await settleTimetable(page)
  await page.screenshot({
    path: '../.cache/screenshots/timetable-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('link', { name: '教室设备', exact: true }).click()
  await page.getByRole('button', { name: '连接教室', exact: true }).click()
  await expect(page.getByRole('dialog').getByText(/桌面客户端尚未接入云同步/)).toBeVisible()
  await page.getByPlaceholder('例如：高一（1）班教室').fill('测试教室')
  await page.getByRole('button', { name: '生成配对码', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('等待教室设备输入配对码…')).toBeVisible()
  await expect(page.getByRole('button', { name: '完成', exact: true })).toHaveCount(0)
  const device = await claim(page, (await page.getByTestId('pairing-code').innerText()).trim())
  await expect(page.getByText('教室连接成功', { exact: true })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.goto('/display/new')
  await page.getByPlaceholder('配置名称').fill('默认展示设置')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('配置已保存，发布后教室才会收到更新')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/profiles/${profileId}/edit`)
  await editorSection(page, '课表管理')
  await chooseWeekday(page, '星期三')
  await addDay(page)
  await page.getByTestId('add-course-3').click()
  await chooseSubject(page, 'course-subject', '数学')
  await page.getByRole('button', { name: '确认课程' }).click()
  await expect(page.getByTestId('course-3-0')).toContainText('数学')
  await assertNoOverflow(page)
  await settleTimetable(page)
  await page.screenshot({
    path: '../.cache/screenshots/timetable-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '保存并发布', exact: true }).click()
  await expect(page).toHaveURL(/\/publish\?profile=/)
  await expect(page.getByTestId('publish-profile')).toContainText('示范课表')
  await page.getByTestId('publish-display').click()
  await page.getByRole('option', { name: '默认展示设置', exact: true }).click()
  await page.getByRole('button', { name: '下一步：选择教室' }).click()
  await page.getByText('测试教室', { exact: true }).click()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '确认教室名单 · 1 间' })).toBeVisible()
  await expect(page.locator('.preview-day').getByText('语文', { exact: false }).first()).toBeVisible()
  await assertNoOverflow(page)
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/releases\/[a-f0-9]+$/)
  await expect(page.getByTestId('release-summary')).toHaveText('1 间等待同步')
  await receipt(page, device.secret, { profile: { result: 'applied' } })
  await page.getByRole('button', { name: '刷新结果' }).click()
  await expect(page.getByTestId('release-summary')).toHaveText('1 间等待同步')
  await receipt(page, device.secret, { display_config: { result: 'applied' } })
  await page.getByRole('button', { name: '刷新结果' }).click()
  await expect(page.getByTestId('release-summary')).toHaveText('1 间已生效')
  await page.screenshot({
    path: '../.cache/screenshots/release-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await assertNoOverflow(page)
  expect(errors).toEqual([])
})

test('imports complex profiles without losing advanced configuration and preserves distinct names', async ({
  page,
}) => {
  await login(page)
  const fixture = profileFixture()
  await page.goto('/profiles/new?import=1')
  await page.getByTestId('profile-file').setInputFiles({
    name: 'profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await editorSection(page, '基本信息')
  await expect(page.getByTestId('profile-name')).toHaveValue(fixture.profile.name)
  await addSubject(page, '语文进阶')
  await editorSection(page, '课表管理')
  await page.getByTestId('course-1-0').click()
  await chooseSubject(page, 'course-subject', '语文进阶')
  await page.getByRole('button', { name: '确认课程' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/profiles\/[a-f0-9]+\/edit$/)
  const id = /profiles\/([^/]+)/.exec(page.url())![1]
  const saved = (await api<ResourceView>(page, 'GET', `/resources/${id}`)).content as unknown as NativeProfile
  expect(saved.profile.schedules[1]).toEqual(fixture.profile.schedules[1])
  expect(saved.profile.reminderRules).toEqual(fixture.profile.reminderRules)
  expect(saved.profile.timeLines).toEqual(fixture.profile.timeLines)
  expect(saved.profile.dateOverrides![0].sourceClasses[0].subject).toBe('语文进阶')
  expect(saved.profile.dateOverrides![0].classes[0].subject).toBe('英语')
  await api(page, 'PATCH', `/resources/${id}`, { revision: 1, name: '单独的列表名称' })
  await page.reload()
  await page.getByTestId('profile-name').fill('更新列表名称')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const renamed = await api<ResourceView>(page, 'GET', `/resources/${id}`)
  expect(renamed.name).toBe('更新列表名称')
  expect((renamed.content as unknown as NativeProfile).profile.name).toBe(fixture.profile.name)
  await page.getByRole('button', { name: '按日期预览', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '按日期预览' })).toBeVisible()
})

test('protects name edits, save failures, revision conflicts and display switches', async ({ page }) => {
  await login(page)
  const original = await resource(page)
  await page.goto(`/profiles/${original.id}/edit`)
  await page.getByTestId('profile-name').fill('本地未保存名称')
  await page.getByRole('link', { name: '工作台', exact: true }).click()
  await expect(page.getByText('有未保存的修改，离开后会丢失。')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByTestId('profile-name')).toHaveValue('本地未保存名称')
  await page.route('**/api/v1/resources/' + original.id, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'database_unavailable', message: '测试保存失败' } },
        })
      : route.continue(),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '测试保存失败' }).first()).toBeVisible()
  await expect(page.getByTestId('profile-name')).toHaveValue('本地未保存名称')
  await page.unroute('**/api/v1/resources/' + original.id)
  await api(page, 'PATCH', `/resources/${original.id}`, { revision: original.revision, name: '远端更新' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('课表发生编辑冲突')).toBeVisible()
  await expect(page.getByTestId('profile-name')).toHaveValue('本地未保存名称')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载备份', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('profile-draft.json')
  await page.getByRole('button', { name: '载入最新内容', exact: true }).click()
  await page.getByRole('button', { name: '放弃并载入', exact: true }).click()
  await expect(page.getByTestId('profile-name')).toHaveValue('远端更新')
  await page.goto('/display/new')
  await page.getByPlaceholder('配置名称').fill('保留展示输入')
  await page.getByRole('link', { name: '← 返回我的配置', exact: true }).click()
  await expect(page.getByText('有未保存的修改，离开后会丢失。')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByPlaceholder('配置名称')).toHaveValue('保留展示输入')
  await page.getByRole('link', { name: '工作台', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page).toHaveURL(/\/display\/new$/)
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/resources'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const display = (await (await created).json()).data.resource as ResourceView
  await expect(page).toHaveURL(new RegExp(`/display/${display.id}/edit$`))
  await expect(page.getByPlaceholder('配置名称')).toHaveValue('保留展示输入')
  await page.getByPlaceholder('配置名称').fill('本地展示名称')
  await api(page, 'PATCH', `/resources/${display.id}`, { revision: display.revision, name: '远端展示名称' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('其他页面已修改配置，当前输入已保留。请下载备份后载入最新内容。')).toBeVisible()
  await expect(page.getByPlaceholder('配置名称')).toHaveValue('本地展示名称')
  await page.getByRole('button', { name: '载入最新内容', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByPlaceholder('配置名称')).toHaveValue('远端展示名称')
})

test('retries an ambiguous submit with the same key and creates only one release', async ({ page }) => {
  await login(page)
  const content = await resource(page)
  await pair(page)
  await previewWithDevice(page, content)
  const keys: string[] = []
  let drop = true
  await page.route('**/api/v1/releases', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    keys.push(route.request().headers()['idempotency-key'])
    if (drop) {
      drop = false
      const response = await route.fetch()
      expect(response.status()).toBe(201)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('button', { name: '重试确认提交结果' })).toBeVisible()
  await page.getByRole('link', { name: '工作台', exact: true }).click()
  await expect(
    page.getByText('提交结果尚未确认。建议先重试确认；离开后请到发布记录核对，避免重复发布。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await page.getByRole('button', { name: '重试确认提交结果' }).click()
  await expect(page).toHaveURL(/\/releases\/[a-f0-9]+$/)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  expect((await api(page, 'GET', '/releases')).total).toBe(1)
})

test('requires new preview after a resource edit or a group membership change', async ({ page }) => {
  await login(page)
  const content = await resource(page)
  const group = await api(page, 'POST', '/groups', { name: '一年级' })
  await pair(page, '测试教室', group.id)
  const second = await pair(page, '二班')
  await page.goto(`/publish?profile=${content.id}`)
  await page.getByRole('button', { name: '下一步：选择教室' }).click()
  await page.getByText('整组：一年级', { exact: true }).click()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '确认教室名单 · 1 间' })).toBeVisible()
  await api(page, 'PATCH', `/devices/${second.id}`, { group_id: group.id })
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('button', { name: '预览发布', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '确认教室名单 · 2 间' })).toBeVisible()
  await api(page, 'PATCH', `/resources/${content.id}`, { revision: content.revision, name: '更新后的课表' })
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('button', { name: '预览发布', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/releases\/[a-f0-9]+$/)
  await expect(page.getByTestId('release-summary')).toHaveText('2 间等待同步')
})

test('publishes display only, reports blocked and failed results, restores content and accepts legacy links', async ({
  page,
}) => {
  await login(page)
  const content = await resource(page, 'display_config')
  const device = await pair(page)
  await previewWithDevice(page, content)
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/releases\/[a-f0-9]+$/)
  const releaseId = page.url().split('/').at(-1)!
  const release = await api<ReleaseView>(page, 'GET', `/releases/${releaseId}`)
  expect(release.versions.map((v) => v.kind)).toEqual(['display_config'])
  await expect(page.getByText('设备离线', { exact: true })).toBeVisible()
  await receipt(page, device.secret, { display_config: { result: 'blocked', reason: 'plugin_conflict' } })
  await page.getByRole('button', { name: '刷新结果' }).click()
  await expect(page.getByTestId('release-summary')).toHaveText('1 间需要处理')
  await page.getByText('查看课表与客户端配置的结果', { exact: true }).click()
  await expect(page.getByText(/请在教室设备检查插件/)).toBeVisible()
  await receipt(page, device.secret, {
    display_config: { result: 'failed', reason: 'save_failed', attempt: 2 },
  })
  await page.getByRole('button', { name: '刷新结果' }).click()
  await expect(page.getByText(/保存权限、剩余空间/)).toBeVisible()
  await page.getByRole('button', { name: '恢复这次内容', exact: true }).click()
  await expect(page.getByText('恢复这次内容会创建一条新发布。请核对历史内容和本次教室名单。')).toBeVisible()
  await page.getByRole('button', { name: '下一步：选择教室' }).click()
  await expect(page.getByRole('checkbox', { name: '测试教室', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '预览发布', exact: true }).click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/releases\/[a-f0-9]+$/)
  expect(page.url()).not.toContain(releaseId)
  await page.goto(`/releases?id=${releaseId}`)
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}$`))
  await expect(page.getByTestId('release-summary')).toHaveText('1 间已被后续发布替代')
})

test('keeps failed home reads distinct from empty onboarding and shows persistent polling errors', async ({
  page,
}) => {
  await login(page)
  await page.route('**/api/v1/resources?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'database_unavailable', message: '测试读取失败' } },
    }),
  )
  await page.reload()
  await expect(page.getByText('数据暂时无法更新')).toBeVisible()
  await expect(page.getByRole('heading', { name: '让第一间教室收到你的课表' })).toHaveCount(0)
  await page.unroute('**/api/v1/resources?*')
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.getByRole('heading', { name: '让第一间教室收到你的课表' })).toBeVisible()
  await page.route('**/api/v1/devices?*', (route) =>
    route.fulfill({ json: { data: { items: [], total: 41, page: 1, page_size: 1 } } }),
  )
  await page.reload()
  await expect(page.getByText('已连接设备总数：41 台', { exact: false })).toBeVisible()
  await page.unroute('**/api/v1/devices?*')
  await page.goto('/devices')
  await expect(page.getByText('还没有教室，连接后即可发布课表')).toBeVisible()
  await page.route('**/api/v1/devices?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'database_unavailable', message: '后台刷新失败' } },
    }),
  )
  await expect(page.getByText('数据暂时无法更新')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(page.getByText('还没有教室，连接后即可发布课表')).toBeVisible()
})

test('regenerates expired pairing codes and never treats polling failure as success', async ({ page }) => {
  await login(page)
  const records: string[] = []
  await page.route('**/api/v1/pairing-codes', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const response = await route.fetch(),
      body = await response.json()
    records.push(body.data.id)
    if (records.length === 1) body.data.expires_at = '2020-01-01T00:00:00Z'
    await route.fulfill({ response, json: body })
  })
  await page.goto('/devices?pair=1')
  await page.getByPlaceholder('例如：高一（1）班教室').fill('过期配对测试教室')
  await page.getByRole('button', { name: '生成配对码', exact: true }).click()
  await expect(page.getByText('配对码已过期，请重新生成。')).toBeVisible()
  await page.getByRole('button', { name: '重新生成配对码', exact: true }).click()
  await expect(page.getByText('等待教室设备输入配对码…')).toBeVisible()
  expect(records).toHaveLength(2)
  expect(records[0]).not.toBe(records[1])
  await page.route('**/api/v1/pairing-codes?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'database_unavailable', message: '配对状态读取失败' } },
    }),
  )
  await expect(page.getByRole('dialog').getByText('数据暂时无法更新')).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: '完成', exact: true })).toHaveCount(0)
  await page.unroute('**/api/v1/pairing-codes?*')
  await claim(page, (await page.getByTestId('pairing-code').innerText()).trim())
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(page.getByText('教室连接成功', { exact: true })).toBeVisible()
  const history = await api(page, 'GET', '/pairing-codes')
  expect(history.items.find((item: any) => item.id === records[0]).revoked_at).toBeTruthy()
})

test('preserves temporary lessons after removing their editor tab', async ({ page }) => {
  await login(page)
  const content = await resource(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/profiles/${content.id}/edit`)
  await expect(
    page.locator('.client-editor-menu').getByRole('button', { name: '临时调课', exact: true }),
  ).toHaveCount(0)
  await page.getByTestId('profile-name').fill('保留原有安排')
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/resources/${content.id}`),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).status()).toBe(200)
  const draft = (await api<ResourceView>(page, 'GET', `/resources/${content.id}`))
    .content as unknown as NativeProfile
  expect(draft.profile.dateOverrides).toEqual(profileFixture().profile.dateOverrides)
  expect(draft.profile.reminderRules).toEqual(profileFixture().profile.reminderRules)
})

test('keeps display and help in primary navigation, restores route motion and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await login(page)
  const navigation = page.getByRole('navigation', { name: '主要导航' })
  await expect(navigation.getByRole('link')).toHaveText([
    '工作台',
    '我的课表',
    '我的配置',
    '教室设备',
    '发布记录',
    '使用帮助',
  ])
  await expect(page.getByRole('button', { name: /更多设置/ })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: '账号设置' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '账号设置', exact: true })).toHaveCount(1)
  await page.evaluate(() => {
    document.addEventListener('animationstart', (event) => {
      if (event.animationName === 'content-arrive' && (event.target as Element).closest('.page-content'))
        document.body.dataset.pageEntrance = 'seen'
    })
    document.addEventListener('transitionrun', (event) => {
      if (event.propertyName === 'opacity' && (event.target as Element).matches('.page-content'))
        document.body.dataset.pageTransition = 'seen'
    })
  })
  await navigation.getByRole('link', { name: '我的配置', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的配置', exact: true, level: 1 })).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-page-transition', 'seen')
  await expect(page.locator('body')).toHaveAttribute('data-page-entrance', 'seen')
  await expect(page.getByRole('button', { name: '新建配置', exact: true }).first()).toBeVisible()
  await page.screenshot({
    path: '../.cache/screenshots/navigation-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(navigation.getByRole('link', { name: '我的配置', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '使用帮助', exact: true })).toBeVisible()
  await assertNoOverflow(page)
  await navigation.getByRole('link', { name: '使用帮助', exact: true }).click()
  await expect(page.getByRole('heading', { name: '使用帮助', exact: true })).toBeVisible()
  await page.screenshot({
    path: '../.cache/screenshots/navigation-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('link', { name: '账号设置', exact: true }).click()
  await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await navigation.getByRole('link', { name: '工作台', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  const duration = await page
    .locator('.page-content .panel')
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))
  expect(duration).toBeLessThanOrEqual(0.001)
  await assertNoOverflow(page)
})

test('manages subjects before scheduling, synchronizes renames and prevents orphaned references', async ({
  page,
}) => {
  await login(page)
  const content = await resource(page)
  await page.goto(`/profiles/${content.id}/edit`)
  await editorSection(page, '科目管理')
  await page.getByRole('button', { name: '编辑科目语文', exact: true }).click()
  await page.getByTestId('subject-name').fill('国语')
  await page.getByTestId('subject-short-name').fill('国')
  await page.getByTestId('subject-teacher').fill('王老师')
  await page.getByRole('button', { name: '确认科目', exact: true }).click()
  await editorSection(page, '课表管理')
  await expect(page.getByTestId('course-1-0')).toContainText('国语')
  await editorSection(page, '科目管理')
  await page.getByRole('cell', { name: '编辑科目国语', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('「国语」仍被课程或提醒使用，请先更换这些引用后再删除')).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑科目国语', exact: true })).toBeVisible()
  await page.getByTestId('profile-add-subject').click()
  await page.getByTestId('subject-name').fill('数学')
  await page.getByRole('button', { name: '确认科目', exact: true }).click()
  await expect(page.getByText('科目名称已存在，请使用其他名称')).toBeVisible()
  await page.getByTestId('subject-name').fill('体育')
  await page.getByRole('button', { name: '确认科目', exact: true }).click()
  await page.getByRole('cell', { name: '编辑科目体育', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除科目', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑科目体育', exact: true })).toHaveCount(0)
  await editorSection(page, '课表管理')
  await page.getByTestId('course-1-0').click()
  const select = page.getByTestId('course-subject')
  await select.click()
  await select.getByRole('combobox').fill('未设置的物理')
  await select.getByRole('combobox').press('Enter')
  await select.getByRole('combobox').press('Escape')
  await page.getByRole('button', { name: '确认课程', exact: true }).click()
  await expect(page.getByTestId('course-1-0')).toContainText('国语')
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/resources/${content.id}`),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await response).status()).toBe(200)
  const saved = (await api<ResourceView>(page, 'GET', `/resources/${content.id}`))
    .content as unknown as NativeProfile
  expect(saved.profile.subjects.find((subject) => subject.name === '国语')).toEqual({
    name: '国语',
    simplifiedName: '国',
    teacher: '王老师',
  })
  expect(saved.profile.schedules[0].daySchedules[0].classes[0].subject).toBe('国语')
  expect(saved.profile.dateOverrides![0].sourceClasses[0].subject).toBe('国语')
  expect(saved.profile.reminderRules![0].subject).toBe('国语')
  expect(
    saved.profile.subjects.some((subject) => subject.name === '体育' || subject.name === '未设置的物理'),
  ).toBe(false)
})

test('repairs missing subject definitions from a legacy import before saving', async ({ page }) => {
  await login(page)
  const fixture = profileFixture()
  fixture.profile.subjects = []
  await page.goto('/profiles/new?import=1')
  await page.getByTestId('profile-file').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await editorSection(page, '科目管理')
  await expect(page.getByText('这份课表有尚未登记的科目')).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/profiles\/new\?import=1$/)
  await expect(page.getByText('请修正以下内容：')).toBeVisible()
  await page.getByRole('button', { name: '补齐缺失科目', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑科目语文', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/profiles\/[a-f0-9]+\/edit$/)
  const id = /profiles\/([^/]+)/.exec(page.url())![1]
  const saved = (await api<ResourceView>(page, 'GET', `/resources/${id}`)).content as unknown as NativeProfile
  expect(new Set(saved.profile.subjects.map((subject) => subject.name))).toEqual(
    new Set(['语文', '数学', '英语']),
  )
  expect(saved.profile.schedules).toEqual(fixture.profile.schedules)
  expect(saved.profile.dateOverrides).toEqual(fixture.profile.dateOverrides)
  expect(saved.profile.reminderRules).toEqual(fixture.profile.reminderRules)
})

test('edits the desktop timeline with undo, collision validation and application to courses', async ({
  page,
}) => {
  await login(page)
  const original = await resource(page)
  await page.goto(`/profiles/${original.id}/edit`)
  await editorSection(page, '时间线管理')
  const first = page.getByRole('button', { name: /^时段 1 / })
  await first.click()
  const end = page.locator('.timeline-inspector input').nth(1)
  await end.click()
  await end.fill('09:00:00')
  await end.press('Enter')
  await end.blur()
  await expect(first).toContainText('08:00–09:00')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(first).toContainText('08:00–08:45')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.getByRole('button', { name: '新增时段', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await first.scrollIntoViewIfNeeded()
  const bounds = await first.boundingBox()
  if (!bounds) throw new Error('timeline point missing')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 20)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 74, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('alert').filter({ hasText: '重叠' })).toBeVisible()
  await expect(first).toContainText('08:00–09:00')
  await page.getByRole('button', { name: /^时段 2 / }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: /^时段 2 / })).toHaveCount(0)
  await page.screenshot({
    path: '../.cache/screenshots/client-timeline-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page)
  await page.screenshot({
    path: '../.cache/screenshots/client-timeline-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await editorSection(page, '课表管理')
  await page.getByRole('button', { name: '应用到当天', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('课程 1 → 1，保留 1 个科目')
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByTestId('course-1-0')).toHaveText('语文')
  await expect(page.locator('.el-table:visible')).toContainText('09:00:00')
  await page.getByRole('button', { name: '新增周课表', exact: true }).click()
  const week = page.getByRole('dialog', { name: '新增周课表', exact: true })
  await week.locator('input').first().fill('复制的单周')
  await week.locator('.el-select').last().click()
  await page.getByRole('option', { name: '单周', exact: true }).click()
  await week.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByTestId('course-1-0')).toHaveText('语文')
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/resources/${original.id}`),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).status()).toBe(200)
  const content = (await api<ResourceView>(page, 'GET', `/resources/${original.id}`))
    .content as unknown as NativeProfile
  expect(content.profile.timeLines[0].timePoints).toEqual([{ startTime: '08:00:00', endTime: '09:00:00' }])
  expect(content.profile.schedules[2].mode).toBe('odd')
  expect(content.profile.schedules[2].daySchedules).toEqual(content.profile.schedules[0].daySchedules)
  expect(content.profile.schedules[0].daySchedules[0].classes[0].subject).toBe('语文')
})

test('edits desktop display sections and preserves duplicate component identities when reordered', async ({
  page,
}) => {
  await login(page)
  await page.goto('/display/new')
  await editorSection(page, '课程条')
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '添加的组件类型', exact: true }) })
    .click()
  await page.getByRole('option', { name: '课程查看', exact: true }).click()
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page
    .locator('.client-component-row')
    .last()
    .getByRole('button', { name: '设置', exact: true })
    .click()
  const setting = page.getByRole('dialog', { name: '课程显示组件设置', exact: true })
  await setting.getByRole('spinbutton').fill('42')
  await setting.getByRole('button', { name: '关闭', exact: true }).click()
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '添加的组件类型', exact: true }) })
    .click()
  await page.getByRole('option', { name: '文本提示', exact: true }).click()
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '提示文字', exact: true }).fill('欢迎来到课堂 · 同步测试')
  const ids = await page
    .locator('.client-component-row')
    .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.componentId))
  await page.getByRole('button', { name: '上移第5个组件', exact: true }).click()
  await expect(page.locator('.client-component-row').nth(3)).toHaveAttribute('data-component-id', ids[4]!)
  await page.getByRole('button', { name: '预览文本提示', exact: true }).click()
  await expect(page.locator('.client-component-row').nth(3)).toHaveClass(/selected/)
  await page
    .getByRole('button', { name: '预览日期', exact: true })
    .dragTo(page.getByRole('button', { name: '预览倒计时', exact: true }))
  await expect(page.locator('.client-component-row').nth(2)).toHaveAttribute('data-component-id', ids[0]!)
  await page.locator('.client-component-row').nth(2).locator('.el-switch').click()
  await expect(page.getByRole('button', { name: '预览日期', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: '../.cache/screenshots/client-display-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await editorSection(page, '外观')
  await page
    .locator('.client-setting-row')
    .filter({ has: page.locator('label[for="display-theme-mode"]') })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: '深色', exact: true }).click()
  await editorSection(page, '桌面倒计时')
  await page
    .locator('.client-setting-row')
    .filter({ has: page.locator('label[for="countdown-enable"]') })
    .locator('.el-switch')
    .click()
  await page.locator('#countdown-label').fill('高考')
  await page.locator('#countdown-date').fill('2027-06-07')
  await page.locator('#countdown-date').press('Enter')
  await page.locator('#countdown-time').fill('09:00:00')
  await page.locator('#countdown-time').press('Enter')
  await page
    .locator('.client-setting-row')
    .filter({ has: page.locator('label[for="countdown-placement"]') })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: '自定义可见边距', exact: true }).click()
  await page.locator('#countdown-right').fill('37')
  await page.locator('#countdown-scale').fill('125')
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page)
  await page.screenshot({
    path: '../.cache/screenshots/client-display-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await editorSection(page, '窗口拦截')
  await page
    .locator('.client-setting-row')
    .filter({ has: page.locator('label[for="manage-window-rules"]') })
    .locator('.el-switch')
    .click()
  await page.getByRole('button', { name: '新增规则', exact: true }).click()
  await page.getByRole('textbox', { name: '第1条程序路径', exact: true }).fill('C:/Apps/example.exe')
  await page.getByRole('textbox', { name: '第1条窗口类名', exact: true }).fill('ExampleWindow')
  await editorSection(page, '插件')
  await page
    .locator('.client-setting-row')
    .filter({ has: page.locator('label[for="manage-plugin-preferences"]') })
    .locator('.el-switch')
    .click()
  await page.getByRole('textbox', { name: '添加插件 ID', exact: true }).fill('org.example.clock')
  await page.getByRole('button', { name: '添加插件', exact: true }).click()
  await assertNoOverflow(page)
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/resources'))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const content = (await (await saved).json()).data.resource.content
  expect(content.courseBarConfig.components.map((item: any) => item.instanceId)).toEqual([
    ids[1],
    ids[2],
    ids[0],
    ids[4],
    ids[3],
  ])
  expect(content.schema_version).toBe(2)
  expect(content.windowInterceptionConfig.rules[0].className).toBe('ExampleWindow')
  expect(content.pluginConfig.plugins['org.example.clock'].enabled).toBe(false)
  expect(content.courseBarConfig.components[2].enabled).toBe(false)
  expect(content.courseBarConfig.components[4].courseSpacing).toBe(42)
  expect(content.courseBarConfig.components[3].text).toContain('同步测试')
  expect(content.appearanceConfig.themeMode).toBe('dark')
  expect(content.desktopCountdownConfig).toMatchObject({
    enable: true,
    targetDateTime: '2027-06-07T09:00:00',
    useLegacyPlacement: false,
    rightMargin: 37,
    scalePercent: 125,
  })
})

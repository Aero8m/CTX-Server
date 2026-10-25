import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'

test('register, pair, import, configure, preview, publish and view a real receipt', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '登录工作区' })).toBeVisible()
  const captchaResponse = page.waitForResponse((r) => r.url().includes('/auth/captcha') && r.status() === 200)
  await page.getByRole('button', { name: '立即注册' }).click()
  const captcha = (await (await captchaResponse).json()).data
  const python =
    process.env.CTX_PYTHON ||
    path.resolve('../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  execFileSync(python, ['tests/e2e_seed.py', captcha.id], {
    cwd: path.resolve('../backend'),
    env: process.env,
    windowsHide: true,
  })
  await page.locator('input[name="username"]').fill('browser_teacher')
  await page.locator('input[name="password"]').fill('browser-password-123')
  await page.locator('input[name="confirm"]').fill('browser-password-123')
  await page.locator('input[name="captcha"]').fill('ABCDE')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(page.getByRole('heading', { name: '设备管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '配对设备', exact: true }).click()
  await page.getByPlaceholder('例如：高一（1）班教室').fill('浏览器测试教室')
  await page.getByRole('button', { name: '生成配对码' }).click()
  const code = (await page.getByTestId('pairing-code').innerText()).trim()
  const secret = crypto.randomBytes(32).toString('base64url')
  const pair = await request.post('/api/v1/device/pair', {
    data: { code, claim_id: crypto.randomUUID().replaceAll('-', ''), device_secret: secret },
  })
  expect(pair.status()).toBe(201)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByText('浏览器测试教室', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '使用教程', exact: true }).click()
  await expect(page.getByRole('heading', { name: /导入或编辑课表档案/ })).toBeVisible()
  await expect(page.getByText('各页签用途', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '课表档案', exact: true }).click()
  await page.getByRole('button', { name: '导入档案', exact: true }).click()
  const profile = {
    version: 1,
    profile: {
      name: '浏览器测试课表',
      subjects: [{ name: '语文', simplifiedName: '语', teacher: '' }],
      timeLines: [],
      schedules: [
        {
          id: 'week-test',
          name: '常规周',
          mode: 'all',
          daySchedules: [
            {
              name: '星期一',
              enableDay: 1,
              classes: [{ subject: '语文', startTime: '08:00:00', endTime: '08:45:00' }],
            },
          ],
        },
      ],
    },
  }
  await page.getByTestId('profile-file').setInputFiles({
    name: 'profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(profile)),
  })
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('档案草稿已保存')).toBeVisible()
  await page.getByRole('tab', { name: '周课表', exact: true }).click()
  await page.getByTestId('profile-weekday-2').click()
  await page.getByTestId('profile-add-day').click()
  await page.getByTestId('profile-add-course').click()
  const courseSubject = page.getByTestId('profile-course-subject-0').getByRole('textbox')
  await courseSubject.fill('数学')
  await courseSubject.press('Tab')
  const profilePatch = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && response.url().includes('/api/v1/resources/'),
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  expect((await profilePatch).status()).toBe(200)
  const profileList = await page.request.get('/api/v1/resources?kind=profile')
  const profileItem = (await profileList.json()).data.items.find(
    (item: { name: string }) => item.name === '浏览器测试课表',
  )
  if (!profileItem) throw new Error('导入的课表档案未出现在列表中')
  const profileDetail = await page.request.get(`/api/v1/resources/${profileItem.id}`)
  const profileContent = (await profileDetail.json()).data.content
  expect(
    profileContent.profile.schedules[0].daySchedules.some(
      (day: { enableDay: number; classes: { subject: string }[] }) =>
        day.enableDay === 2 && day.classes.some((course) => course.subject === '数学'),
    ),
  ).toBe(true)
  await page.getByRole('tab', { name: '科目与节次', exact: true }).click()
  await page.getByTestId('profile-add-subject').click()
  const addedSubject = page.getByTestId('profile-subject-name-1').getByRole('textbox')
  await addedSubject.fill('数学')
  await addedSubject.press('Tab')
  await addedSubject.fill('数学进阶')
  await addedSubject.press('Tab')
  await page.getByRole('tab', { name: '周课表', exact: true }).click()
  await page.getByTestId('profile-weekday-2').click()
  await expect(page.getByTestId('profile-course-subject-0').getByRole('textbox')).toHaveValue('数学进阶')
  await page.getByRole('tab', { name: '日期特殊安排', exact: true }).click()
  await page.getByTestId('profile-add-override').click()
  await expect(page.getByText(/来源快照：数学进阶/)).toBeVisible()
  const profilePatchWithOverride = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && response.url().includes('/api/v1/resources/'),
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  expect((await profilePatchWithOverride).status()).toBe(200)
  const updatedDetail = await page.request.get(`/api/v1/resources/${profileItem.id}`)
  const updatedContent = (await updatedDetail.json()).data.content
  expect(updatedContent.profile.dateOverrides[0].sourceClasses[0].subject).toBe('数学进阶')
  expect(updatedContent.profile.dateOverrides[0].classes[0].subject).toBe('数学进阶')
  await page.getByRole('tab', { name: '日期预览', exact: true }).click()
  await page.getByRole('button', { name: '按日期预览', exact: true }).click()
  const previewPanel = page.getByRole('tabpanel', { name: '日期预览' })
  await expect(previewPanel.getByText('日期特殊安排', { exact: true })).toBeVisible()
  await expect(previewPanel.getByRole('cell', { name: '数学进阶' }).first()).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '新建档案', exact: true }).click()
  await page.getByRole('tab', { name: '周课表', exact: true }).click()
  await page.getByTestId('profile-add-day').click()
  await page.getByTestId('profile-add-course').click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('周课表：请填写科目')).toBeVisible()
  await page.getByTestId('profile-course-subject-0').getByRole('textbox').fill('语文')
  await page.getByTestId('profile-course-subject-0').getByRole('textbox').press('Tab')
  const blankCreate = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/resources'),
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  expect((await blankCreate).status()).toBe(201)
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  const editorDialog = page.getByRole('dialog', { name: /编辑课表档案/ })
  await page
    .getByRole('row', { name: /浏览器测试课表/ })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  const profileNameInput = page.getByPlaceholder('档案名称')
  await expect(profileNameInput).toHaveValue('浏览器测试课表')
  await profileNameInput.fill('临时未保存名称')
  await editorDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByText('有未保存的修改，关闭后会丢失。')).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editorDialog).toBeVisible()
  await editorDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editorDialog).toBeHidden()
  await page.getByRole('link', { name: '展示配置', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('展示配置草稿已保存')).toBeVisible()
  await page.getByRole('link', { name: '发布中心', exact: true }).click()
  await page.getByRole('button', { name: '新建发布', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('不更新课表', { exact: true }).click()
  await page.getByRole('option', { name: /浏览器测试课表/ }).click()
  await dialog.getByText('不更新配置', { exact: true }).click()
  await page.getByRole('option', { name: /默认展示配置/ }).click()
  await dialog.getByText('选择设备', { exact: true }).click()
  await page.getByRole('option', { name: '浏览器测试教室' }).click()
  await dialog.getByPlaceholder('例如：下周课表与高考倒计时').fill('浏览器端到端发布')
  await dialog.getByRole('button', { name: '预览发布' }).click()
  await expect(dialog.getByText('确认设备名单 · 1 台')).toBeVisible()
  await dialog.getByRole('button', { name: '确认发布' }).click()
  await expect(page.getByRole('dialog').getByText('浏览器端到端发布', { exact: true })).toBeVisible()
  const sync = await request.post('/api/v1/device/sync', {
    data: {},
    headers: { Authorization: 'Bearer ' + secret },
  })
  expect(sync.status()).toBe(200)
  const channels = (await sync.json()).data.channels
  for (const target of Object.values(channels) as Record<string, unknown>[]) {
    const download = await request.get(String(target.download_url), {
      headers: { Authorization: 'Bearer ' + secret },
    })
    expect(
      crypto
        .createHash('sha256')
        .update(await download.body())
        .digest('hex'),
    ).toBe(target.sha256)
    const receipt = await request.post('/api/v1/device/receipts', {
      headers: { Authorization: 'Bearer ' + secret },
      data: {
        assignment_id: target.assignment_id,
        kind: target.kind,
        generation: target.generation,
        version_id: target.version_id,
        attempt: 1,
        result: 'applied',
        reason: '',
      },
    })
    expect(receipt.status()).toBe(200)
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: '发布中心', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '详情', exact: true }).first().click()
  await expect(page.getByRole('dialog').getByText('已应用', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('dialog').getByText('已应用', { exact: true }).first()).toBeVisible()
  await page.screenshot({
    path: '../.cache/screenshots/releases.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('dialog').getByRole('button', { name: '关闭此对话框' }).click()
  await page.getByRole('link', { name: '设备管理', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('在线', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '../.cache/screenshots/devices-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})

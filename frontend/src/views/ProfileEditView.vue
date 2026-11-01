<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, get, patch, post } from '../api'
import { useRefresh } from '../useRefresh'
import { useUnsaved } from '../useUnsaved'
import type { Resource } from '../types'
import type { DatePreviewView, NativeProfile } from '../wire'
import {
  newProfile,
  prepareDraft,
  localIssues,
  reconcileOverrides,
  sectionOfIssue,
  weekdayName,
  todayText,
  type ProfileTab,
  type ValidationIssue,
} from '../profile'
import { downloadJson } from '../workflow'
import WeekBoard from '../components/WeekBoard.vue'
import ProfileEditor from '../components/ProfileEditor.vue'
import SubjectManager from '../components/SubjectManager.vue'
import LoadNotice from '../components/LoadNotice.vue'
import EditorLayout from '../components/EditorLayout.vue'
import TimeLineManager from '../components/TimeLineManager.vue'
const route = useRoute(),
  router = useRouter()
const selected = ref<Resource>(),
  draft = ref<NativeProfile>(),
  name = ref('新的课表'),
  baseline = ref(''),
  linkedNames = ref(true)
const saving = ref(false),
  error = ref(''),
  conflict = ref(false),
  warnings = ref<string[]>([]),
  issues = ref<ValidationIssue[]>([]),
  pendingCourse = ref(false),
  pendingSubject = ref(false),
  pendingTime = ref(false)
const activeSection = ref<string>(route.query.import === '1' ? 'files' : 'basic')
const editorItems = [
  { id: 'basic', label: '基本信息', icon: 'document' },
  { id: 'subjects', label: '科目管理', icon: 'subjects' },
  { id: 'timelines', label: '时间线管理', icon: 'clock' },
  { id: 'weeks', label: '课表管理', icon: 'calendar' },
  { id: 'rules', label: '提醒规则', icon: 'bell' },
  { id: 'files', label: '导入与备份', icon: 'folder' },
]
const advancedTab = computed<ProfileTab>({
  get: () => (activeSection.value === 'rules' ? 'rules' : 'basic'),
  set: (value) => {
    activeSection.value = value
  },
})
const board = ref<InstanceType<typeof WeekBoard>>(),
  advanced = ref<InstanceType<typeof ProfileEditor>>(),
  timeLineManager = ref<InstanceType<typeof TimeLineManager>>(),
  subjectManager = ref<InstanceType<typeof SubjectManager>>()
const previewOpen = ref(false),
  previewDay = ref(todayText()),
  preview = ref<DatePreviewView>(),
  previewError = ref(''),
  previewBusy = ref(false)
function snapshot() {
  return JSON.stringify({ name: name.value, draft: draft.value })
}
const pendingEditor = computed(() => pendingCourse.value || pendingSubject.value || pendingTime.value)
const dirty = computed(() => !!draft.value && (snapshot() !== baseline.value || pendingEditor.value))
useUnsaved(dirty, saving)
watch(name, (value) => {
  if (linkedNames.value && draft.value) draft.value.profile.name = value
})
watch(
  () => draft.value?.profile.name,
  (value) => {
    if (value !== name.value) linkedNames.value = false
  },
)
const refresh = useRefresh(async (options) => {
  if (route.params.id) {
    const resource = await get<Resource>(`/resources/${route.params.id}`, options)
    if (resource.kind !== 'profile' || !resource.content) throw new Error('该资源不是可编辑课表')
    selected.value = resource
    name.value = resource.name
    draft.value = prepareDraft(resource.content)
    linkedNames.value = resource.name === draft.value.profile.name
  } else {
    draft.value = newProfile(name.value)
  }
  await nextTick()
  baseline.value = snapshot()
  if (route.query.preview === '1') {
    previewOpen.value = true
    await previewDate()
  }
}, 0)
const { error: loadError, loading, ready } = refresh
function changed() {
  if (!conflict.value) error.value = ''
  if (issues.value.length && draft.value) issues.value = localIssues(draft.value)
  preview.value = undefined
}
async function manageSubjects() {
  activeSection.value = 'subjects'
  await nextTick()
  subjectManager.value?.add()
}
function readIssues(details: unknown): ValidationIssue[] {
  if (!Array.isArray(details)) return []
  return details.filter(
    (item): item is { path: string; message: string } =>
      !!item && typeof item.path === 'string' && typeof item.message === 'string',
  )
}
function issueLabel(issue: ValidationIssue) {
  const match = /^profile\.schedules\.(\d+)\.daySchedules\.(\d+)\.classes\.(\d+)/.exec(issue.path)
  if (match && draft.value) {
    const week = draft.value.profile.schedules[Number(match[1])],
      day = week?.daySchedules[Number(match[2])]
    if (day)
      return `${week.name} · ${weekdayName(day.enableDay)}第 ${Number(match[3]) + 1} 节：${issue.message}`
  }
  return issue.message
}
async function jump(issue: ValidationIssue) {
  if (issue.path.startsWith('profile.subjects') || issue.message.includes('尚未设置')) {
    activeSection.value = 'subjects'
    await nextTick()
    subjectManager.value?.focusIssue(issue)
    return
  }
  const section = sectionOfIssue(issue)
  if (section === 'dates') {
    activeSection.value = 'files'
    return
  }
  if (section === 'weeks') {
    activeSection.value = 'weeks'
    await nextTick()
    board.value?.focusIssue(issue)
    return
  }
  if (issue.path.startsWith('profile.timeLines')) {
    activeSection.value = 'timelines'
    await nextTick()
    timeLineManager.value?.focusIssue(issue)
    return
  }
  advancedTab.value = section
  await nextTick()
  advanced.value?.focusIssue(issue)
}
async function save(action: 'stay' | 'publish' | 'preview' = 'stay') {
  if (!draft.value || saving.value || pendingEditor.value) return
  error.value = ''
  if (!name.value.trim()) {
    error.value = '请填写课表名称'
    return
  }
  if (linkedNames.value) draft.value.profile.name = name.value.trim()
  reconcileOverrides(draft.value)
  issues.value = localIssues(draft.value)
  if (issues.value.length) {
    await jump(issues.value[0])
    return
  }
  saving.value = true
  try {
    const checked = await post<{ content: NativeProfile; warnings: string[] }>('/resources/validate', {
      kind: 'profile',
      content: draft.value,
    })
    const result = selected.value
      ? await patch<{ resource: Resource; warnings: string[] }>(`/resources/${selected.value.id}`, {
          revision: selected.value.revision,
          name: name.value.trim(),
          content: checked.content,
        })
      : await post<{ resource: Resource; warnings: string[] }>('/resources', {
          kind: 'profile',
          name: name.value.trim(),
          content: checked.content,
        })
    selected.value = result.resource
    name.value = result.resource.name
    draft.value = prepareDraft(result.resource.content)
    warnings.value = result.warnings
    conflict.value = false
    issues.value = []
    await nextTick()
    baseline.value = snapshot()
    preview.value = undefined
    ElMessage.success('课表已保存，发布后教室才会收到更新')
    saving.value = false
    if (action === 'publish') {
      await router.push(`/publish?profile=${result.resource.id}&revision=${result.resource.revision}`)
      return
    }
    if (!route.params.id) {
      await router.replace(`/profiles/${result.resource.id}/edit${action === 'preview' ? '?preview=1' : ''}`)
      return
    }
    if (action === 'preview') {
      previewOpen.value = true
      await previewDate()
    }
  } catch (reason) {
    if (reason instanceof ApiError) {
      conflict.value = reason.code === 'revision_conflict'
      issues.value = readIssues(reason.details)
      error.value = conflict.value
        ? '其他页面已经修改这张课表。当前输入已保留，请下载备份后载入最新内容。'
        : reason.message
      if (issues.value.length) await jump(issues.value[0])
    } else error.value = '保存失败，当前输入已保留，请重试'
  } finally {
    saving.value = false
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file || saving.value) return
  saving.value = true
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过 2 MiB')
    const checked = await post<{ content: NativeProfile; warnings: string[] }>('/resources/validate', {
      kind: 'profile',
      content: JSON.parse(await file.text()),
    })
    if (dirty.value) {
      try {
        await ElMessageBox.confirm('导入会替换当前未保存的内容，是否继续？', '导入课表')
      } catch {
        return
      }
    }
    draft.value = prepareDraft(checked.content)
    if (!selected.value) {
      name.value = draft.value.profile.name
      linkedNames.value = true
    }
    warnings.value = checked.warnings
    error.value = ''
    issues.value = []
    preview.value = undefined
  } catch (reason) {
    error.value =
      reason instanceof SyntaxError
        ? '无法读取原生 JSON，请检查文件格式'
        : reason instanceof Error
          ? reason.message
          : '无法读取课表文件'
    if (reason instanceof ApiError) issues.value = readIssues(reason.details)
  } finally {
    input.value = ''
    saving.value = false
  }
}
async function reloadLatest() {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm('这会放弃当前输入，请先下载备份。', '载入最新课表', {
      confirmButtonText: '放弃并载入',
      cancelButtonText: '继续编辑',
    })
  } catch {
    return
  }
  if (await refresh()) {
    conflict.value = false
    error.value = ''
    issues.value = []
  }
}
async function reset() {
  try {
    await ElMessageBox.confirm('将恢复为最后保存或打开时的内容。', '撤销更改')
  } catch {
    return
  }
  const previous = JSON.parse(baseline.value)
  draft.value = previous.draft
  name.value = previous.name
  linkedNames.value = previous.name === previous.draft.profile.name
  issues.value = []
  error.value = ''
  preview.value = undefined
}
async function previewDate() {
  if (!selected.value || !previewDay.value) return
  previewBusy.value = true
  previewError.value = ''
  try {
    preview.value = await get<DatePreviewView>(
      `/resources/${selected.value.id}/preview?date=${previewDay.value}`,
      { reportError: false },
    )
  } catch (reason) {
    previewError.value = reason instanceof Error ? reason.message : '预览失败'
  } finally {
    previewBusy.value = false
  }
}
async function openPreview() {
  if (dirty.value || !selected.value) await save('preview')
  else {
    previewOpen.value = true
    await previewDate()
  }
}
</script>
<template>
  <router-link to="/profiles" class="text-link">← 返回我的课表</router-link>
  <LoadNotice :error="loadError" :loading="loading" @retry="refresh" />
  <template v-if="ready && draft">
    <p v-if="pendingCourse" class="form-hint">请先在课程弹窗中确认或取消修改。</p>
    <p v-if="pendingSubject" class="form-hint">请先在科目弹窗中确认或取消修改。</p>
    <el-alert
      v-if="selected?.archived"
      title="这张课表已归档，恢复后才能发布。"
      type="info"
      :closable="false"
    />
    <el-alert v-if="conflict" title="课表发生编辑冲突" type="error" :closable="false" role="alert"
      ><p>{{ error }}</p>
      <el-button @click="downloadJson(draft, 'profile-draft.json')">下载备份</el-button
      ><el-button @click="reloadLatest">载入最新内容</el-button></el-alert
    >
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" role="alert" />
    <el-alert v-for="warning in warnings" :key="warning" :title="warning" type="warning" :closable="false" />
    <div v-if="issues.length" class="panel field-error" role="alert">
      <strong>请修正以下内容：</strong>
      <p v-for="(issue, index) in issues" :key="index">
        <el-button link type="danger" @click="jump(issue)">{{ issueLabel(issue) }}</el-button>
      </p>
    </div>
    <EditorLayout
      v-model="activeSection"
      title="档案编辑"
      :items="editorItems"
      :disabled="saving"
      @save="save()"
    >
      <template v-if="activeSection === 'basic'">
        <div class="panel client-card">
          <el-form label-position="top"
            ><el-form-item :label="linkedNames ? '档案名称' : '列表名称'">
              <el-input
                id="profile-name"
                v-model="name"
                maxlength="100"
                placeholder="例如：高一（1）班课表"
                data-testid="profile-name"
              /> </el-form-item
          ></el-form>
          <p v-if="!linkedNames" class="form-hint">列表名称与档案名称不同，将分别保留。</p>
        </div>
      </template>
      <ProfileEditor
        v-show="['basic', 'rules'].includes(activeSection)"
        ref="advanced"
        v-model:draft="draft"
        v-model:tab="advancedTab"
        :sections="['basic', 'rules']"
        :show-profile-name="!linkedNames"
        :issues="issues"
        @changed="changed"
      />
      <section v-show="activeSection === 'subjects'" class="panel client-card">
        <SubjectManager
          ref="subjectManager"
          v-model="draft"
          :issues="issues"
          @changed="changed"
          @pending="pendingSubject = $event"
        />
      </section>
      <TimeLineManager
        v-show="activeSection === 'timelines'"
        ref="timeLineManager"
        :active="activeSection === 'timelines'"
        v-model="draft"
        :issues="issues"
        @changed="changed"
        @pending="pendingTime = $event"
      />
      <WeekBoard
        v-show="activeSection === 'weeks'"
        ref="board"
        v-model="draft"
        :issues="issues"
        @changed="changed"
        @pending="pendingCourse = $event"
        @manage-subjects="manageSubjects"
      />
      <section v-show="activeSection === 'files'" class="panel client-card">
        <h3>导入原生档案</h3>
        <p class="form-hint">导入桌面客户端导出的原生 JSON；校验通过后才替换内容。</p>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="导入课表文件"
          data-testid="profile-file"
          @change="importFile"
        />
        <div class="table-actions" style="margin-top: 20px">
          <el-button @click="downloadJson(draft, 'profile-draft.json')">下载当前内容</el-button>
          <router-link to="/guide?task=edit" class="text-link">编辑帮助</router-link>
        </div>
      </section>
      <template #footer>
        <span class="editor-state" role="status">{{
          dirty ? '未保存' : selected ? '已保存' : '尚未保存'
        }}</span
        ><span class="grow"></span>
        <el-button :disabled="saving || pendingEditor" @click="openPreview">{{
          dirty || !selected ? '保存并预览' : '按日期预览'
        }}</el-button>
        <el-button :disabled="!dirty || saving || pendingEditor" @click="reset">放弃更改</el-button>
        <el-button :loading="saving" :disabled="pendingEditor" @click="save()">保存</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="pendingEditor || !!selected?.archived"
          @click="save('publish')"
          >保存并发布</el-button
        >
      </template>
    </EditorLayout>
  </template>
  <el-dialog v-model="previewOpen" title="按日期预览" width="620px"
    ><p class="form-hint">以下内容来自已保存课表。</p>
    <div class="toolbar">
      <el-date-picker
        v-model="previewDay"
        type="date"
        value-format="YYYY-MM-DD"
        :clearable="false"
      /><el-button :loading="previewBusy" @click="previewDate">查看这一天</el-button>
    </div>
    <el-alert
      v-if="previewError || preview?.error"
      :title="previewError || preview?.error || ''"
      type="warning"
      :closable="false" /><template v-else-if="preview"
      ><el-tag v-if="preview.special" type="warning">临时调课</el-tag
      ><el-table :data="preview.classes"
        ><el-table-column prop="subject" label="科目" /><el-table-column
          prop="startTime"
          label="开始" /><el-table-column prop="endTime" label="结束" /></el-table></template
  ></el-dialog>
</template>

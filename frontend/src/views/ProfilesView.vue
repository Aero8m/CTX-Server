<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, get, patch, post } from '../api'
import type { Page, Resource } from '../types'
import { formatTime } from '../types'
import type { DatePreviewView, NativeProfile } from '../wire'
import ProfileEditor from '../components/ProfileEditor.vue'
import {
  SECTION_LABELS,
  localIssues,
  newProfile,
  prepareDraft,
  reconcileOverrides,
  sectionOfIssue,
  type ProfileTab,
  type ValidationIssue,
} from '../profile'

const items = ref<Resource[]>([]),
  page = ref(1),
  total = ref(0),
  archived = ref(false),
  q = ref('')
const modal = ref(false),
  selected = ref<Resource>(),
  name = ref(''),
  draft = ref<NativeProfile>(),
  baselineJson = ref(''),
  saving = ref(false),
  errors = ref(''),
  nameError = ref(''),
  warnings = ref<string[]>([]),
  issues = ref<ValidationIssue[]>([]),
  conflict = ref(false),
  tab = ref<ProfileTab>('basic')
const editor = ref<{ focusIssue: (issue: ValidationIssue) => void }>()
const previewDay = ref(new Date().toLocaleDateString('en-CA'))
const datePreview = ref<DatePreviewView>()

const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baselineJson.value)
const dialogTitle = computed(() => {
  if (!draft.value) return '导入课表档案'
  if (!selected.value) return '新建课表档案'
  return `编辑课表档案${dirty.value ? ' · 未保存' : ''}`
})

async function load() {
  const data = await get<Page<Resource>>(
    `/resources?kind=profile&page=${page.value}&archived=${archived.value}&q=${encodeURIComponent(q.value)}`,
  )
  items.value = data.items
  total.value = data.total
}
async function filterChanged() {
  page.value = 1
  await load()
}
function resetDialogState() {
  errors.value = ''
  nameError.value = ''
  warnings.value = []
  issues.value = []
  conflict.value = false
  datePreview.value = undefined
  tab.value = 'basic'
}
async function open(resource: Resource) {
  resetDialogState()
  selected.value = await get<Resource>(`/resources/${resource.id}`)
  draft.value = selected.value?.content ? prepareDraft(selected.value.content) : undefined
  name.value = selected.value?.name || ''
  baselineJson.value = draft.value ? JSON.stringify(draft.value) : ''
  if (!draft.value) errors.value = '档案内容为空，无法编辑'
  modal.value = true
}
function createBlank() {
  resetDialogState()
  selected.value = undefined
  draft.value = newProfile()
  name.value = '新的课表档案'
  baselineJson.value = JSON.stringify(draft.value)
  modal.value = true
}
function importNew() {
  resetDialogState()
  selected.value = undefined
  draft.value = undefined
  name.value = ''
  baselineJson.value = ''
  modal.value = true
}
function readIssues(details: unknown): ValidationIssue[] {
  if (!Array.isArray(details)) return []
  return details
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      path: typeof item.path === 'string' && item.path ? item.path : 'profile',
      message: typeof item.message === 'string' ? item.message : '内容未通过校验',
    }))
}
function issueText(reason: ApiError) {
  return JSON.stringify(reason.details || reason.message, null, 2)
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  errors.value = ''
  issues.value = []
  nameError.value = ''
  if (file.size > 2 * 1024 * 1024) {
    errors.value = '文件不能超过 2 MiB'
    input.value = ''
    return
  }
  try {
    const data = JSON.parse(await file.text())
    const checked = await post<{ content: NativeProfile; warnings: string[] }>('/resources/validate', {
      kind: 'profile',
      content: data,
    })
    if (draft.value && dirty.value) {
      try {
        await ElMessageBox.confirm('导入文件会替换当前未保存的编辑内容。', '替换当前内容')
      } catch {
        input.value = ''
        return
      }
    }
    draft.value = prepareDraft(checked.content)
    warnings.value = checked.warnings
    conflict.value = false
    if (!name.value.trim()) name.value = checked.content.profile.name || file.name.replace(/\.json$/i, '')
    tab.value = 'basic'
    ElMessage.success('文件已校验，可继续编辑并保存')
  } catch (reason) {
    if (reason instanceof ApiError) {
      const parsed = readIssues(reason.details)
      if (parsed.length && !draft.value) issues.value = parsed
      else errors.value = issueText(reason)
    } else errors.value = '无法读取原生 JSON 档案，请检查文件内容'
  } finally {
    input.value = ''
  }
}
async function jump(issue: ValidationIssue) {
  tab.value = sectionOfIssue(issue)
  await nextTick()
  editor.value?.focusIssue(issue)
}
async function focusFirst() {
  const issue = issues.value[0]
  if (issue) await jump(issue)
}
function editorChanged() {
  issues.value = []
  if (!conflict.value) errors.value = ''
}
async function save() {
  if (!draft.value) return
  if (!name.value.trim()) {
    nameError.value = '请填写资源名称'
    tab.value = 'basic'
    return
  }
  nameError.value = ''
  reconcileOverrides(draft.value)
  const local = localIssues(draft.value)
  if (local.length) {
    issues.value = local
    errors.value = ''
    await focusFirst()
    return
  }
  saving.value = true
  errors.value = ''
  try {
    const checked = await post<{ content: NativeProfile; warnings: string[] }>('/resources/validate', {
      kind: 'profile',
      content: draft.value,
    })
    draft.value = prepareDraft(checked.content)
    warnings.value = checked.warnings
    const payload = { name: name.value.trim(), content: draft.value }
    const result = selected.value
      ? await patch<{ resource: Resource; warnings: string[] }>(`/resources/${selected.value.id}`, {
          revision: selected.value.revision,
          ...payload,
        })
      : await post<{ resource: Resource; warnings: string[] }>('/resources', {
          kind: 'profile',
          ...payload,
        })
    selected.value = result.resource
    name.value = result.resource.name
    draft.value = prepareDraft(result.resource.content)
    baselineJson.value = JSON.stringify(draft.value)
    warnings.value = result.warnings
    issues.value = []
    conflict.value = false
    datePreview.value = undefined
    ElMessage.success('档案草稿已保存')
    await load()
  } catch (reason) {
    if (reason instanceof ApiError) {
      if (reason.code === 'revision_conflict') {
        conflict.value = true
        errors.value = '草稿已在其他页面修改。当前内容已保留，可下载备份或重新载入服务端最新草稿。'
      } else if (reason.code === 'validation_error') {
        const parsed = readIssues(reason.details)
        issues.value = parsed
        errors.value = parsed.length ? '' : issueText(reason)
        await focusFirst()
      } else errors.value = issueText(reason)
    } else errors.value = '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
async function reloadLatest() {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm('将放弃当前未保存的修改并载入服务端最新草稿。', '重新载入')
  } catch {
    return
  }
  const latest = await get<Resource>(`/resources/${selected.value.id}`)
  selected.value = latest
  draft.value = latest.content ? prepareDraft(latest.content) : undefined
  name.value = latest.name
  baselineJson.value = draft.value ? JSON.stringify(draft.value) : ''
  errors.value = ''
  nameError.value = ''
  warnings.value = []
  issues.value = []
  conflict.value = false
  datePreview.value = undefined
}
async function resetDraft() {
  if (!baselineJson.value) return
  try {
    await ElMessageBox.confirm('将放弃当前修改，恢复到最后一次保存或打开时的内容。', '撤销更改')
  } catch {
    return
  }
  draft.value = prepareDraft(JSON.parse(baselineJson.value))
  warnings.value = []
  issues.value = []
  errors.value = ''
  conflict.value = false
  datePreview.value = undefined
  ElMessage.info('已恢复到上次保存的内容')
}
async function requestClose(done?: () => void) {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('有未保存的修改，关闭后会丢失。', '关闭档案编辑器')
    } catch {
      return
    }
  }
  if (done) done()
  else modal.value = false
}
async function archive(resource: Resource) {
  await patch(`/resources/${resource.id}`, {
    revision: resource.revision,
    archived: !resource.archived,
  })
  await load()
}
async function previewDate() {
  if (!selected.value || dirty.value) return
  datePreview.value = await get<DatePreviewView>(
    `/resources/${selected.value.id}/preview?date=${previewDay.value}`,
  )
}
function backup() {
  if (!draft.value) return
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft.value, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'profile-draft.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
onMounted(load)
</script>
<template>
  <section class="panel">
    <div class="section-title">
      <h2>原生课表档案</h2>
      <div class="table-actions">
        <el-button type="primary" @click="createBlank">新建档案</el-button>
        <el-button @click="importNew">导入档案</el-button>
      </div>
    </div>
    <div class="toolbar">
      <el-input
        v-model="q"
        placeholder="搜索档案"
        clearable
        style="width: 240px"
        @keyup.enter="filterChanged"
        @clear="filterChanged"
      /><el-switch v-model="archived" active-text="已归档" @change="filterChanged" />
    </div>
    <el-table :data="items"
      ><el-table-column prop="name" label="档案名称" min-width="200" /><el-table-column
        prop="revision"
        label="草稿修订"
        width="110" /><el-table-column label="更新时间" min-width="180"
        ><template #default="{ row }">{{ formatTime(row.updated_at) }}</template></el-table-column
      ><el-table-column label="操作" width="210"
        ><template #default="{ row }"
          ><div class="table-actions">
            <el-button link type="primary" @click="open(row)">编辑</el-button
            ><a :href="`/api/v1/resources/${row.id}/content`" download><el-button link>下载</el-button></a
            ><el-button link @click="archive(row)">{{ row.archived ? '恢复' : '归档' }}</el-button>
          </div></template
        ></el-table-column
      ><template #empty
        ><el-empty description="导入 ClassTopLand Next 原生 JSON，或直接新建课表档案" /></template
    ></el-table>
  </section>
  <el-pagination
    v-model:current-page="page"
    :total="total"
    :page-size="20"
    layout="prev,pager,next,total"
    @current-change="load"
  />
  <el-dialog
    v-model="modal"
    :title="dialogTitle"
    width="1080px"
    class="profile-dialog"
    :close-on-click-modal="false"
    :before-close="requestClose"
  >
    <div class="profile-resource-row">
      <el-form label-position="top" class="profile-resource-form">
        <el-form-item label="资源名称" :error="nameError">
          <el-input
            v-model="name"
            maxlength="100"
            data-testid="profile-resource-name"
            @input="nameError = ''"
          />
        </el-form-item>
      </el-form>
      <div class="profile-import">
        <input type="file" accept=".json,application/json" data-testid="profile-file" @change="importFile" />
        <span class="form-hint">选择 JSON 会先校验，再替换当前编辑内容</span>
      </div>
      <el-tag v-if="dirty" type="warning" effect="plain">未保存</el-tag>
    </div>
    <el-alert
      v-for="(warning, index) in warnings"
      :key="`warning-${index}`"
      :title="warning"
      type="warning"
      :closable="false"
    />
    <el-alert v-if="conflict" type="error" :closable="false" title="版本冲突">
      <p>{{ errors }}</p>
      <div class="table-actions">
        <el-button size="small" @click="backup">下载当前内容</el-button>
        <el-button size="small" type="primary" @click="reloadLatest">重新载入最新草稿</el-button>
      </div>
    </el-alert>
    <pre v-if="errors && !conflict" role="alert" class="error-details">{{ errors }}</pre>
    <el-alert
      v-if="issues.length"
      type="error"
      :closable="false"
      :title="`有 ${issues.length} 项内容需要修正`"
    >
      <ul class="profile-issue-list">
        <li v-for="(issue, index) in issues" :key="`${issue.path}-${index}`">
          <el-button link type="primary" @click="jump(issue)"
            >{{ SECTION_LABELS[sectionOfIssue(issue)] }}：{{ issue.message }}</el-button
          >
        </li>
      </ul>
    </el-alert>
    <ProfileEditor
      v-if="draft"
      ref="editor"
      v-model:draft="draft"
      v-model:tab="tab"
      :issues="issues"
      @changed="editorChanged"
    >
      <template #preview>
        <template v-if="selected">
          <el-alert
            v-if="dirty"
            type="warning"
            :closable="false"
            title="日期预览使用已保存草稿；请先保存再预览。"
          />
          <div class="toolbar">
            <el-date-picker v-model="previewDay" type="date" value-format="YYYY-MM-DD" :clearable="false" />
            <el-button :disabled="dirty" @click="previewDate">按日期预览</el-button>
          </div>
          <el-alert v-if="datePreview?.error" :title="datePreview.error" type="warning" :closable="false" />
          <template v-else-if="datePreview">
            <el-tag v-if="datePreview.special" type="warning">日期特殊安排</el-tag>
            <el-table :data="datePreview.classes">
              <el-table-column prop="subject" label="科目" />
              <el-table-column prop="startTime" label="开始" />
              <el-table-column prop="endTime" label="结束" />
            </el-table>
          </template>
          <p class="form-hint">预览结果来自已保存草稿，修改后请先保存。</p>
        </template>
        <el-empty v-else description="保存档案后才能按日期预览" />
      </template>
    </ProfileEditor>
    <el-empty v-else description="选择 ClassTopLand Next 原生 JSON 档案，或点击「新建档案」直接录入" />
    <template #footer>
      <el-button v-if="draft" @click="backup">下载当前内容</el-button>
      <el-button v-if="draft && dirty && baselineJson" @click="resetDraft">撤销更改</el-button>
      <el-button @click="requestClose()">关闭</el-button>
      <el-button type="primary" :loading="saving" :disabled="!draft" @click="save">保存草稿</el-button>
    </template>
  </el-dialog>
</template>

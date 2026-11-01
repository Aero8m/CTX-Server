<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { NativeProfile, Subject } from '../wire'
import {
  addMissingSubjects,
  cloneJson,
  missingSubjects,
  newSubject,
  renameSubject,
  subjectUsage,
  type ValidationIssue,
} from '../profile'
const draft = defineModel<NativeProfile>({ required: true })
const props = withDefaults(defineProps<{ issues?: ValidationIssue[] }>(), { issues: () => [] })
const emit = defineEmits<{ changed: []; pending: [value: boolean] }>()
const root = ref<HTMLElement>(),
  dialog = ref(false),
  editing = ref<Subject>(),
  working = ref<Subject>(newSubject()),
  baseline = ref(''),
  error = ref('')
const subjects = computed(() => draft.value.profile.subjects)
const selected = ref<Subject>()
const missing = computed(() => missingSubjects(draft.value))
const pending = computed(() => dialog.value && JSON.stringify(working.value) !== baseline.value)
watch(pending, (value) => emit('pending', value))
function open(subject?: Subject) {
  editing.value = subject
  working.value = subject ? cloneJson(subject) : newSubject()
  baseline.value = JSON.stringify(working.value)
  error.value = ''
  dialog.value = true
}
async function close(done?: () => void) {
  if (pending.value) {
    try {
      await ElMessageBox.confirm('科目修改尚未确认，是否放弃？', '关闭科目编辑', {
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
      })
    } catch {
      return
    }
  }
  dialog.value = false
  emit('pending', false)
  if (done) done()
}
function save() {
  const name = working.value.name.trim()
  if (!name) {
    error.value = '请填写科目名称'
    return
  }
  if (
    [...name].length > 100 ||
    [...working.value.simplifiedName].length > 100 ||
    [...working.value.teacher].length > 100
  ) {
    error.value = '名称、简称和教师均不能超过 100 个字符'
    return
  }
  if (subjects.value.some((subject) => subject !== editing.value && subject.name.trim() === name)) {
    error.value = '科目名称已存在，请使用其他名称'
    return
  }
  if (!editing.value && subjects.value.length >= 1000) {
    error.value = '最多设置 1000 个科目'
    return
  }
  const saved = { ...working.value, name }
  if (editing.value) {
    if (editing.value.name !== name) renameSubject(draft.value, editing.value.name, name)
    Object.assign(editing.value, saved)
  } else subjects.value.push(saved)
  dialog.value = false
  emit('pending', false)
  emit('changed')
}
async function remove(subject: Subject) {
  const usage = subjectUsage(draft.value, subject.name)
  if (usage.courses || usage.rules) {
    ElMessage.warning(`「${subject.name}」仍被课程或提醒使用，请先更换这些引用后再删除`)
    return
  }
  try {
    await ElMessageBox.confirm(`删除「${subject.name}」后，编排课程时将无法选择该科目。`, '删除科目', {
      confirmButtonText: '删除科目',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  subjects.value.splice(subjects.value.indexOf(subject), 1)
  selected.value = undefined
  emit('changed')
}
function fillMissing() {
  if (subjects.value.length + missing.value.length > 1000) {
    ElMessage.warning('补齐后会超过 1000 个科目，请先整理科目表')
    return
  }
  addMissingSubjects(draft.value)
  emit('changed')
}
function focusIssue(issue?: ValidationIssue) {
  root.value?.scrollIntoView({ block: 'center', behavior: 'auto' })
  root.value?.focus({ preventScroll: true })
  const index = issue && /^profile\.subjects\.(\d+)/.exec(issue.path)
  if (index && subjects.value[Number(index[1])]) open(subjects.value[Number(index[1])])
}
function add() {
  focusIssue()
  open()
}
defineExpose({ focusIssue, add })
</script>
<template>
  <div ref="root" tabindex="-1" class="subject-manager" data-testid="subject-manager">
    <div class="client-toolbar">
      <el-button
        type="primary"
        data-testid="profile-add-subject"
        :disabled="subjects.length >= 1000"
        @click="open()"
        >新增科目</el-button
      >
      <el-button :disabled="!selected" @click="open(selected)">编辑</el-button>
      <el-button :disabled="!selected" @click="selected && remove(selected)">删除</el-button>
    </div>
    <el-alert v-if="missing.length" type="warning" :closable="false" title="这份课表有尚未登记的科目"
      ><p>{{ missing.join('、') }}。请先补齐科目，或将课程改为已有科目。</p>
      <el-button size="small" @click="fillMissing">补齐缺失科目</el-button></el-alert
    >
    <el-table
      :data="subjects"
      class="subject-table"
      highlight-current-row
      @current-change="selected = $event || undefined"
      @row-dblclick="open($event)"
    >
      <el-table-column label="科目名称" min-width="150"
        ><template #default="{ row, $index }">
          <el-button
            link
            :data-testid="`subject-${$index}`"
            :aria-label="`编辑科目${row.name}`"
            @click="open(row)"
            >{{ row.name || '未命名科目' }}</el-button
          >
          <p
            v-for="issue in props.issues.filter((item) =>
              item.path.startsWith(`profile.subjects.${$index}.`),
            )"
            :key="issue.path"
            class="field-error"
          >
            {{ issue.message }}
          </p>
        </template></el-table-column
      >
      <el-table-column prop="simplifiedName" label="简称" min-width="100" />
      <el-table-column prop="teacher" label="教师" min-width="140" />
      <template #empty><el-empty description="暂无科目" :image-size="60" /></template>
    </el-table>
    <p class="form-hint">选择科目后编辑，或双击表格行。修改科目名称会同步更新课程和提醒。</p>
  </div>
  <el-dialog
    class="client-editor-dialog"
    v-model="dialog"
    :title="editing ? '编辑科目' : '添加科目'"
    width="440px"
    :close-on-click-modal="false"
    :before-close="close"
  >
    <el-form label-position="top" @submit.prevent="save"
      ><el-form-item label="科目名称"
        ><el-input
          v-model="working.name"
          maxlength="100"
          placeholder="例如：语文"
          data-testid="subject-name" /></el-form-item
      ><el-form-item label="简称（选填）"
        ><el-input
          v-model="working.simplifiedName"
          maxlength="100"
          placeholder="例如：语"
          data-testid="subject-short-name" /></el-form-item
      ><el-form-item label="教师（选填）"
        ><el-input
          v-model="working.teacher"
          maxlength="100"
          placeholder="例如：张老师"
          data-testid="subject-teacher" /></el-form-item
    ></el-form>
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
    <p class="form-hint">修改科目名称会同步更新课程、临时调课和指定科目提醒。</p>
    <template #footer
      ><el-button @click="close()">取消</el-button
      ><el-button type="primary" @click="save">确认科目</el-button></template
    >
  </el-dialog>
</template>

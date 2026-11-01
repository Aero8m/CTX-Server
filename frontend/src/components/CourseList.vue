<script setup lang="ts">
import { computed } from 'vue'
import type { Course } from '../wire'
import { courseTimeIssues, newCourse, sortCourses } from '../profile'

const courses = defineModel<Course[]>({ required: true })
const props = withDefaults(
  defineProps<{
    subjects?: string[]
    testIdPrefix?: string
    addTestId?: string
    emptyHint?: string
  }>(),
  {
    subjects: () => [],
    testIdPrefix: 'course',
    addTestId: '',
    emptyHint: '还没有课程',
  },
)
const emit = defineEmits<{ changed: [] }>()

const rowIssues = computed(() => courseTimeIssues(courses.value))
const limitReached = computed(() => courses.value.length >= 1000)
const addTestId = computed(() => props.addTestId || `${props.testIdPrefix}-add`)

function add() {
  if (limitReached.value || !props.subjects.length) return
  courses.value.push(newCourse(courses.value))
  emit('changed')
}
function remove(index: number) {
  courses.value.splice(index, 1)
  emit('changed')
}
function move(index: number, direction: -1 | 1) {
  const next = index + direction
  if (next < 0 || next >= courses.value.length) return
  const [row] = courses.value.splice(index, 1)
  courses.value.splice(next, 0, row)
  emit('changed')
}
function sort() {
  sortCourses(courses.value)
  emit('changed')
}
function issueFor(index: number) {
  return rowIssues.value.find((issue) => issue.index === index)?.message
}
</script>

<template>
  <div class="course-list">
    <el-table :data="courses" size="small" :data-testid="`${testIdPrefix}-table`">
      <el-table-column label="科目" min-width="170">
        <template #default="{ row, $index }">
          <div :data-testid="`${testIdPrefix}-subject-${$index}`">
            <el-select
              v-model="row.subject"
              filterable
              clearable
              placeholder="选择已有科目"
              @change="emit('changed')"
              ><el-option
                v-if="row.subject && !subjects.includes(row.subject)"
                :value="row.subject"
                :label="`${row.subject}（未登记）`"
                disabled /><el-option v-for="name in subjects" :key="name" :label="name" :value="name"
            /></el-select>
            <div v-if="!subjects.includes(row.subject)" class="course-issue">
              {{ row.subject ? '请先在科目设置中登记，或重新选择已有科目' : '请选择已有科目' }}
            </div>
          </div>
          <div v-if="issueFor($index)" class="course-issue">{{ issueFor($index) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="开始" width="132">
        <template #default="{ row, $index }">
          <div :data-testid="`${testIdPrefix}-start-${$index}`">
            <el-time-picker
              v-model="row.startTime"
              format="HH:mm"
              value-format="HH:mm:ss"
              :clearable="false"
              @change="emit('changed')"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="结束" width="132">
        <template #default="{ row, $index }">
          <div :data-testid="`${testIdPrefix}-end-${$index}`">
            <el-time-picker
              v-model="row.endTime"
              format="HH:mm"
              value-format="HH:mm:ss"
              :clearable="false"
              @change="emit('changed')"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="148">
        <template #default="{ $index }">
          <div class="table-actions">
            <el-button link :disabled="$index === 0" aria-label="上移课程" @click="move($index, -1)"
              >↑</el-button
            >
            <el-button
              link
              :disabled="$index === courses.length - 1"
              aria-label="下移课程"
              @click="move($index, 1)"
              >↓</el-button
            >
            <el-button link type="danger" @click="remove($index)">删除</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="emptyHint" :image-size="60" />
      </template>
    </el-table>
    <div class="course-toolbar">
      <el-button :disabled="limitReached || !subjects.length" :data-testid="addTestId" @click="add"
        >添加课程</el-button
      >
      <el-button :disabled="courses.length < 2" @click="sort">按时间排序</el-button>
      <span v-if="limitReached" class="form-hint">每天最多 1000 节课</span>
      <span v-if="!subjects.length" class="form-hint">请先在上方的科目设置中添加科目</span>
    </div>
  </div>
</template>

<style scoped>
.course-list :deep(.el-select) {
  width: 100%;
}
.course-list :deep(.el-date-editor.el-input) {
  width: 100%;
}
.course-issue {
  color: #b55740;
  font-size: 12px;
  line-height: 1.5;
}
.course-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
}
</style>

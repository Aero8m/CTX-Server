<script setup lang="ts">
defineProps<{ error?: string; loading?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <el-alert
    v-if="error"
    type="error"
    :closable="false"
    title="数据暂时无法更新"
    role="alert"
    class="load-notice"
  >
    <p>{{ error }}。已显示的内容可能不是最新状态。</p>
    <el-button size="small" :loading="loading" @click="$emit('retry')">重新读取</el-button>
  </el-alert>
  <p v-else-if="loading" role="status" class="muted">正在读取…</p>
</template>

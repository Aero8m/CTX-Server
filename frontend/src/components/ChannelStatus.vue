<script setup lang="ts">
import type { Channel } from '../types'
import { statusLabel } from '../types'
defineProps<{ channel?: Pick<Channel, 'status' | 'reason'> }>()
const tagType = (status: string) =>
  (({ applied: 'success', pending: 'info', failed: 'danger', blocked: 'warning' })[status] || 'info') as
    'success' | 'info' | 'danger' | 'warning'
</script>
<template>
  <el-tooltip :content="channel?.reason || '尚无详细信息'" :disabled="!channel?.reason"
    ><el-tag :type="tagType(channel?.status || 'pending')" effect="light" size="small">{{
      channel ? statusLabel(channel.status) : '未分配'
    }}</el-tag></el-tooltip
  >
</template>

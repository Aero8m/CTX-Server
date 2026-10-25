<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { post } from '../api'
import { useAuth } from '../store'
const auth = useAuth(),
  router = useRouter(),
  busy = ref(false),
  form = reactive({ old: '', password: '', confirm: '' })
async function save() {
  if (form.password.length < 10 || form.password.length > 128)
    return ElMessage.warning('新密码需为 10～128 位')
  if (form.password !== form.confirm) return ElMessage.warning('两次输入的新密码不一致')
  busy.value = true
  try {
    await post('/auth/password', { old_password: form.old, new_password: form.password })
    auth.account = null
    auth.initialized = false
    ElMessage.success('密码已更新，请重新登录')
    await router.push('/login')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel" style="max-width: 650px">
    <h2>修改登录密码</h2>
    <p class="muted">账号：{{ auth.account?.username }}。修改成功后，所有浏览器会话都会退出。</p>
    <el-form label-position="top" style="max-width: 400px; margin-top: 25px" @submit.prevent="save"
      ><el-form-item label="原密码"
        ><el-input
          v-model="form.old"
          type="password"
          show-password
          autocomplete="current-password"
          maxlength="128" /></el-form-item
      ><el-form-item label="新密码"
        ><el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          maxlength="128"
          placeholder="至少 10 位" /></el-form-item
      ><el-form-item label="确认新密码"
        ><el-input
          v-model="form.confirm"
          type="password"
          show-password
          autocomplete="new-password"
          maxlength="128" /></el-form-item
      ><el-button type="primary" native-type="submit" :loading="busy">修改密码并重新登录</el-button></el-form
    >
  </section>
</template>

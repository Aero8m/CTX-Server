<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, get, initializeCsrf, post } from '../api'
import { useAuth } from '../store'
import type { Account } from '../types'
import appIcon from '../assets/classtopland-next.png'

const router = useRouter(),
  auth = useAuth()
const mode = ref<'login' | 'register'>('login'),
  busy = ref(false),
  needCaptcha = ref(false)
const captcha = ref<{ id: string; image: string } | null>(null),
  details = ref('')
const form = reactive({ username: '', password: '', confirm: '', answer: '' })
async function refreshCaptcha() {
  captcha.value = await get('/auth/captcha')
  form.answer = ''
}
async function changeMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  details.value = ''
  if (mode.value === 'register' || needCaptcha.value) await refreshCaptcha()
}
async function submit() {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(form.username)) {
    details.value = '用户名需为 3～32 位字母、数字或下划线'
    return
  }
  if (form.password.length < 10 || form.password.length > 128) {
    details.value = '密码需为 10～128 位'
    return
  }
  if (mode.value === 'register' && form.password !== form.confirm) {
    details.value = '两次密码不一致'
    return
  }
  busy.value = true
  details.value = ''
  try {
    const result = await post<{ account: Account; csrf_token: string }>('/auth/' + mode.value, {
      username: form.username,
      password: form.password,
      ...(captcha.value && (mode.value === 'register' || needCaptcha.value)
        ? { captcha_id: captcha.value.id, captcha_answer: form.answer }
        : {}),
    })
    auth.accept(result)
    await router.push('/devices')
  } catch (error) {
    if (error instanceof ApiError) {
      details.value = error.message
      if (
        (error.details as { captcha_required?: boolean })?.captcha_required ||
        error.code.startsWith('captcha')
      )
        needCaptcha.value = true
      if (error.code === 'csrf_failed') await initializeCsrf()
    }
    if (mode.value === 'register' || needCaptcha.value) await refreshCaptcha()
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  await initializeCsrf()
})
</script>
<template>
  <div class="login-page">
    <section class="login-art">
      <div class="brand">
        <img class="brand-icon" :src="appIcon" alt="" width="56" height="56" />
        <span class="brand-name">ClassTopLand Next</span>
      </div>
      <h1>课表有序，<br />每间教室同步。</h1>
      <p>连接设备、整理课表、统一展示。<br />在一个清晰的工作区，掌握每一次发布。</p>
      <div class="login-caption">DEVICE MANAGEMENT CONSOLE</div>
    </section>
    <section class="login-form">
      <div class="brand login-mobile-brand">
        <img class="brand-icon" :src="appIcon" alt="" width="44" height="44" />
        <span class="brand-name">ClassTopLand Next</span>
      </div>
      <div class="eyebrow">欢迎使用 ClassTopLand Next</div>
      <h2 style="margin-top: 16px">{{ mode === 'login' ? '登录工作区' : '创建你的账号' }}</h2>
      <p class="muted">
        {{ mode === 'login' ? '继续管理你的设备和课表' : '无需邮箱，注册后即可开始配对设备' }}
      </p>
      <el-form label-position="top" @submit.prevent="submit"
        ><el-form-item label="用户名"
          ><el-input
            v-model="form.username"
            name="username"
            autocomplete="username"
            maxlength="32"
            placeholder="字母、数字或下划线" /></el-form-item
        ><el-form-item label="密码"
          ><el-input
            v-model="form.password"
            name="password"
            type="password"
            show-password
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            maxlength="128"
            placeholder="至少 10 位" /></el-form-item
        ><el-form-item v-if="mode === 'register'" label="确认密码"
          ><el-input
            v-model="form.confirm"
            name="confirm"
            type="password"
            show-password
            autocomplete="new-password"
        /></el-form-item>
        <el-form-item v-if="mode === 'register' || needCaptcha" label="图形验证码"
          ><div class="captcha-row">
            <el-input v-model="form.answer" name="captcha" maxlength="5" placeholder="输入图片字符" /><img
              v-if="captcha"
              :src="captcha.image"
              alt="图形验证码，点击刷新"
              role="button"
              tabindex="0"
              @click="refreshCaptcha"
              @keydown.enter="refreshCaptcha"
            /></div
        ></el-form-item>
        <p v-if="details" role="alert" class="error-details">{{ details }}</p>
        <el-button type="primary" native-type="submit" :loading="busy" size="large" style="width: 100%">{{
          mode === 'login' ? '登录' : '创建账号'
        }}</el-button></el-form
      >
      <p class="login-switch">
        {{ mode === 'login' ? '还没有账号？' : '已有账号？' }}
        <el-button link type="primary" @click="changeMode">{{
          mode === 'login' ? '立即注册' : '返回登录'
        }}</el-button>
      </p>
      <p class="form-hint" style="text-align: center">忘记密码时，请联系服务部署者重置。</p>
    </section>
  </div>
</template>

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { get, initializeCsrf, post, setCsrf } from './api'
import type { Account } from './types'

export const useAuth = defineStore('auth', () => {
  const account = ref<Account | null>(null)
  const initialized = ref(false)
  async function initialize() {
    if (initialized.value) return
    const result = await initializeCsrf()
    if (result.authenticated) account.value = await get<Account>('/auth/me')
    initialized.value = true
  }
  function accept(result: { account: Account; csrf_token: string }) {
    account.value = result.account
    setCsrf(result.csrf_token)
  }
  async function logout() {
    await post('/auth/logout')
    account.value = null
    initialized.value = false
  }
  return { account, initialize, accept, logout, initialized }
})

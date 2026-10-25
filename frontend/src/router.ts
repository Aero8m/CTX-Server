import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './store'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/AuthView.vue'), meta: { title: '登录' } },
    { path: '/', redirect: '/devices' },
    {
      path: '/devices',
      component: () => import('./views/DevicesView.vue'),
      meta: { title: '设备管理', caption: '连接教室，让每次发布都有回音。' },
    },
    {
      path: '/devices/:id',
      component: () => import('./views/DeviceView.vue'),
      meta: { title: '设备详情', caption: '查看连接情况、目标版本与每一次应用结果。' },
    },
    {
      path: '/profiles',
      component: () => import('./views/ProfilesView.vue'),
      meta: { title: '课表档案', caption: '导入或直接编辑原生档案，先预览，再发布。' },
    },
    {
      path: '/display',
      component: () => import('./views/DisplayView.vue'),
      meta: { title: '展示配置', caption: '统一课程条、外观与桌面倒计时。' },
    },
    {
      path: '/releases',
      component: () => import('./views/ReleasesView.vue'),
      meta: { title: '发布中心', caption: '将确认过的内容，交付给确认过的设备。' },
    },
    {
      path: '/account',
      component: () => import('./views/AccountView.vue'),
      meta: { title: '账号设置', caption: '管理登录凭证与账号安全。' },
    },
    {
      path: '/guide',
      component: () => import('./views/GuideView.vue'),
      meta: { title: '使用教程', caption: '从设备配对到查看应用结果，按步骤完成第一次发布。' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/devices' },
  ],
})
router.beforeEach(async (to) => {
  const auth = useAuth()
  try {
    await auth.initialize()
  } catch {
    return to.path === '/login' ? true : '/login'
  }
  if (!auth.account && to.path !== '/login') return '/login'
  if (auth.account && to.path === '/login') return '/devices'
})
window.addEventListener('ctx-session-expired', () => {
  const auth = useAuth()
  auth.account = null
  auth.initialized = false
  void router.push('/login')
})

import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './store'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', component: () => import('./views/AuthView.vue'), meta: { title: '登录' } },
    { path: '/', redirect: '/home' },
    {
      path: '/home',
      component: () => import('./views/HomeView.vue'),
      meta: { title: '工作台', caption: '准备好课表，把更新送到教室。' },
    },
    {
      path: '/devices',
      component: () => import('./views/DevicesView.vue'),
      meta: { title: '教室设备', caption: '连接教室，查看设备是否在线。' },
    },
    {
      path: '/devices/:id',
      component: () => import('./views/DeviceView.vue'),
      meta: { title: '教室详情', caption: '查看连接情况和内容应用结果。' },
    },
    {
      path: '/profiles',
      component: () => import('./views/ProfilesView.vue'),
      meta: { title: '我的课表', caption: '按星期编辑，按日期预览，准备好后发布到教室。' },
    },
    {
      path: '/profiles/new',
      component: () => import('./views/ProfileEditView.vue'),
      meta: { title: '新建课表', caption: '先设置科目，再从已有科目编排课程。' },
    },
    {
      path: '/profiles/:id/edit',
      component: () => import('./views/ProfileEditView.vue'),
      meta: { title: '编辑课表', caption: '保存只更新草稿，发布后教室才会收到更新。' },
    },
    {
      path: '/display',
      component: () => import('./views/DisplayView.vue'),
      meta: { title: '我的配置', caption: '管理客户端配置，准备好后发布到教室。' },
    },
    {
      path: '/display/new',
      component: () => import('./views/DisplayEditView.vue'),
      meta: { title: '新建配置', caption: '保存为草稿，发布后教室才会收到更新。' },
    },
    {
      path: '/display/:id/edit',
      component: () => import('./views/DisplayEditView.vue'),
      meta: { title: '编辑配置', caption: '按客户端分区编辑，保存后可发布到教室。' },
    },
    {
      path: '/publish',
      component: () => import('./views/PublishView.vue'),
      meta: { title: '发布到教室', caption: '选择内容、选择教室，确认后提交。' },
    },
    {
      path: '/releases',
      component: () => import('./views/ReleasesView.vue'),
      beforeEnter: (to) => (to.query.id ? { path: `/releases/${String(to.query.id)}` } : true),
      meta: { title: '发布记录', caption: '查看每次更新送达哪些教室。' },
    },
    {
      path: '/releases/:id',
      component: () => import('./views/ReleaseDetailView.vue'),
      meta: { title: '发布结果', caption: '提交后自动更新教室应用结果。' },
    },
    {
      path: '/account',
      component: () => import('./views/AccountView.vue'),
      meta: { title: '账号设置', caption: '管理登录凭证与账号安全。' },
    },
    {
      path: '/guide',
      component: () => import('./views/GuideView.vue'),
      meta: { title: '使用帮助', caption: '按正在做的事情查找答案。' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/home' },
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
  if (auth.account && to.path === '/login') return '/home'
})
window.addEventListener('ctx-session-expired', () => {
  const auth = useAuth()
  auth.account = null
  auth.initialized = false
  void router.push('/login')
})

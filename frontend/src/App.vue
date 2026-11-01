<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  Monitor,
  Calendar,
  House,
  Upload,
  Setting,
  Reading,
  User,
  SwitchButton,
} from '@element-plus/icons-vue'
import { useAuth } from './store'
import appIcon from './assets/classtopland-next.png'
const auth = useAuth(),
  route = useRoute(),
  router = useRouter()
const links = [
  { path: '/home', label: '工作台', icon: House },
  { path: '/profiles', label: '我的课表', icon: Calendar },
  { path: '/display', label: '我的配置', icon: Setting },
  { path: '/devices', label: '教室设备', icon: Monitor },
  { path: '/releases', label: '发布记录', icon: Upload },
  { path: '/guide', label: '使用帮助', icon: Reading },
]
async function logout() {
  if (route.path !== '/home') {
    const failure = await router.push('/home')
    if (failure) return
  }
  try {
    await auth.logout()
    await router.push('/login')
  } catch {
    /* The request layer reports a failed logout. */
  }
}
</script>
<template>
  <router-view v-if="!auth.account" v-slot="{ Component }">
    <Transition name="page" mode="out-in" appear>
      <div v-if="Component" :key="route.path"><component :is="Component" /></div>
    </Transition>
  </router-view>
  <div v-else class="shell">
    <aside class="sidebar">
      <router-link to="/home" class="brand" aria-label="ClassTopLand Next">
        <img class="brand-icon" :src="appIcon" alt="" width="44" height="44" />
        <span class="brand-name">ClassTopLand Next</span>
      </router-link>
      <div class="nav-caption">教室工作区</div>
      <nav aria-label="主要导航">
        <router-link
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          :class="{
            active:
              route.path.startsWith(link.path) || (link.path === '/releases' && route.path === '/publish'),
          }"
        >
          <el-icon><component :is="link.icon" /></el-icon>{{ link.label }}
        </router-link>
      </nav>
      <div class="sidebar-note">从一张课表开始，连接每间教室。</div>
      <div class="account-link">
        <router-link to="/account" aria-label="账号设置" title="账号设置"
          ><el-icon><User /></el-icon>{{ auth.account.username }}</router-link
        >
        <el-button text aria-label="退出登录" @click="logout"
          ><el-icon><SwitchButton /></el-icon
        ></el-button>
      </div>
    </aside>
    <main class="main">
      <router-view v-slot="{ Component, route: pageRoute }">
        <Transition name="page" mode="out-in" appear>
          <div v-if="Component" :key="pageRoute.path" class="page-content">
            <header class="page-header">
              <div>
                <div class="eyebrow">CLASSTOPLAND NEXT / CONSOLE</div>
                <h1>{{ pageRoute.meta.title }}</h1>
                <p>{{ pageRoute.meta.caption }}</p>
              </div>
              <router-link to="/guide" class="workspace-badge">需要帮助？</router-link>
            </header>
            <component :is="Component" />
          </div>
        </Transition>
      </router-view>
    </main>
  </div>
</template>

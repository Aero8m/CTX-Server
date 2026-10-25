<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { Monitor, Calendar, Setting, Upload, Reading, User, SwitchButton } from '@element-plus/icons-vue'
import { useAuth } from './store'
import appIcon from './assets/classtopland-next.png'
import RequestOverlay from './components/RequestOverlay.vue'
const auth = useAuth(),
  route = useRoute(),
  router = useRouter()
const links = [
  { path: '/devices', label: '设备管理', icon: Monitor },
  { path: '/profiles', label: '课表档案', icon: Calendar },
  { path: '/display', label: '展示配置', icon: Setting },
  { path: '/releases', label: '发布中心', icon: Upload },
  { path: '/guide', label: '使用教程', icon: Reading },
]
async function logout() {
  await auth.logout()
  await router.push('/login')
}
</script>
<template>
  <RequestOverlay />
  <router-view v-if="!auth.account" v-slot="{ Component }">
    <Transition name="page" mode="out-in" appear>
      <div v-if="Component" :key="route.path"><component :is="Component" /></div>
    </Transition>
  </router-view>
  <div v-else class="shell">
    <aside class="sidebar">
      <router-link to="/devices" class="brand" aria-label="ClassTopLand Next">
        <img class="brand-icon" :src="appIcon" alt="" width="44" height="44" />
        <span class="brand-name">ClassTopLand Next</span>
      </router-link>
      <div class="nav-caption">管理工作区</div>
      <nav>
        <router-link
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          :class="{ active: route.path.startsWith(link.path) }"
          ><el-icon><component :is="link.icon" /></el-icon>{{ link.label }}</router-link
        >
      </nav>
      <div class="sidebar-note"><span class="status-dot"></span> 每一次连接，都让信息同步</div>
      <div class="account-link">
        <router-link to="/account"
          ><el-icon><User /></el-icon>{{ auth.account.username }}</router-link
        ><el-button text aria-label="退出登录" @click="logout"
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
              <span class="workspace-badge">个人工作区</span>
            </header>
            <component :is="Component" />
          </div>
        </Transition>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { get } from '../api'
import { useRefresh } from '../useRefresh'
import type { Page, Resource, Device, Release } from '../types'
import { formatTime } from '../types'
import { resultSummary } from '../workflow'
import LoadNotice from '../components/LoadNotice.vue'
const profiles = ref<Resource[]>([]),
  deviceTotal = ref(0),
  profileTotal = ref(0),
  releaseTotal = ref(0),
  releases = ref<Release[]>([])
const refresh = useRefresh(async (options) => {
  const [p, d, r] = await Promise.all([
    get<Page<Resource>>('/resources?kind=profile&archived=false&page_size=3', options),
    get<Page<Device>>('/devices?revoked=false&page_size=1', options),
    get<Page<Release>>('/releases?page_size=3', options),
  ])
  const details = await Promise.all(r.items.map((item) => get<Release>(`/releases/${item.id}`, options)))
  profiles.value = p.items
  profileTotal.value = p.total
  deviceTotal.value = d.total
  releases.value = details
  releaseTotal.value = r.total
})
const { error, loading, ready } = refresh
</script>
<template>
  <LoadNotice :error="error" :loading="loading" @retry="refresh" />
  <template v-if="ready">
    <section class="panel welcome-panel">
      <div>
        <span class="eyebrow">从这里开始</span>
        <h2>{{ releaseTotal ? '今天，教室需要哪些更新？' : '让第一间教室收到你的课表' }}</h2>
        <p>先准备内容，再连接教室。保存课表后，还需要发布才能生效。</p>
      </div>
      <router-link to="/profiles/new"
        ><el-button type="primary" size="large">新建课表</el-button></router-link
      >
    </section>
    <div v-if="!releaseTotal" class="task-grid">
      <section class="panel task-card">
        <span class="step-number">01</span>
        <h2>准备课表</h2>
        <p>
          {{
            profileTotal
              ? `已有 ${profileTotal} 张课表，可以继续编辑或直接发布。`
              : '先设置科目，再编排每周课程；也可以导入已有课表。'
          }}
        </p>
        <el-tag v-if="profileTotal" type="success">已准备</el-tag
        ><router-link :to="profileTotal ? '/profiles' : '/profiles/new'"
          ><el-button>{{ profileTotal ? '查看课表' : '创建第一张课表' }}</el-button></router-link
        ><router-link v-if="!profileTotal" to="/profiles/new?import=1" class="text-link"
          >导入已有课表</router-link
        >
      </section>
      <section class="panel task-card">
        <span class="step-number">02</span>
        <h2>连接教室</h2>
        <p>
          {{
            deviceTotal
              ? `已连接 ${deviceTotal} 间教室。`
              : '给教室起个名字，再通过配对码连接支持云同步的设备。'
          }}
        </p>
        <el-tag v-if="deviceTotal" type="success">已连接</el-tag
        ><router-link :to="deviceTotal ? '/devices' : '/devices?pair=1'"
          ><el-button>{{ deviceTotal ? '查看教室' : '连接第一间教室' }}</el-button></router-link
        >
      </section>
      <section class="panel task-card">
        <span class="step-number">03</span>
        <h2>发布到教室</h2>
        <p>确认课表与教室名单，提交后在结果页查看是否生效。</p>
        <router-link v-if="profileTotal && deviceTotal" to="/publish"
          ><el-button type="primary">开始发布</el-button></router-link
        >
        <p v-else class="form-hint">准备好课表并连接教室后，即可开始发布。</p>
      </section>
    </div>
    <section class="panel">
      <div class="section-title">
        <h2>
          我的课表 <small class="muted">{{ profileTotal }} 张</small>
        </h2>
        <router-link to="/profiles">查看全部 →</router-link>
      </div>
      <div class="resource-cards">
        <router-link
          v-for="item in profiles"
          :key="item.id"
          :to="`/profiles/${item.id}/edit`"
          class="resource-card"
          ><strong>{{ item.name }}</strong
          ><span class="muted">更新于 {{ formatTime(item.updated_at) }}</span
          ><span class="text-link">继续编辑 →</span></router-link
        >
      </div>
      <el-empty v-if="!profiles.length" description="还没有课表，先准备内容也没关系" :image-size="60"
        ><router-link to="/profiles/new"><el-button>新建课表</el-button></router-link></el-empty
      >
    </section>
    <section class="panel">
      <div class="section-title">
        <h2>最近发布</h2>
        <router-link to="/releases">查看记录 →</router-link>
      </div>
      <router-link v-for="item in releases" :key="item.id" :to="`/releases/${item.id}`" class="release-row"
        ><div>
          <strong>{{ item.note || '课表与展示更新' }}</strong>
          <p class="muted">{{ formatTime(item.created_at) }} · {{ item.target_count }} 间教室</p>
        </div>
        <span>{{ resultSummary(item.targets) }} →</span></router-link
      ><el-empty
        v-if="!releases.length"
        description="第一次发布后，这里会显示教室应用结果"
        :image-size="60"
      />
    </section>
    <p class="muted">
      已连接设备总数：{{ deviceTotal }} 台 ·
      <router-link to="/devices" class="text-link">管理教室设备</router-link>
    </p>
  </template>
</template>

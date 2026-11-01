<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DisplayConfig } from '../wire'

const config = defineModel<DisplayConfig>({ required: true })
defineProps<{ section: string }>()
const query = ref(''),
  newId = ref(''),
  pluginError = ref(''),
  detailId = ref('')
const plugins = computed(() => config.value.pluginConfig?.plugins || {})
const filteredIds = computed(() =>
  Object.keys(plugins.value).filter((id) => id.toLowerCase().includes(query.value.trim().toLowerCase())),
)
const detail = computed(() => plugins.value[detailId.value])
watch(config, () => {
  detailId.value = ''
  pluginError.value = ''
  newId.value = ''
})
function manage(section: 'windowInterceptionConfig' | 'pluginConfig', enabled: boolean) {
  if (enabled) {
    if (section === 'windowInterceptionConfig') config.value.windowInterceptionConfig = { rules: [] }
    else config.value.pluginConfig = { plugins: {} }
  } else delete config.value[section]
  config.value.schema_version = config.value.windowInterceptionConfig || config.value.pluginConfig ? 2 : 1
  detailId.value = ''
}
function addRule() {
  config.value.windowInterceptionConfig?.rules.push({
    exePath: '',
    className: '',
    titleContains: '',
    enabled: true,
  })
}
function addPlugin() {
  const id = newId.value.trim()
  if (
    id.length > 128 ||
    !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id) ||
    id.split('.').some((part) => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(part))
  ) {
    pluginError.value = '请填写客户端清单中的插件 ID，例如 org.example.clock'
    return
  }
  if (Object.hasOwn(plugins.value, id)) {
    pluginError.value = '该插件已在配置中'
    return
  }
  if (!config.value.pluginConfig || Object.keys(plugins.value).length >= 256) return
  config.value.pluginConfig.plugins[id] = { enabled: false }
  newId.value = ''
  pluginError.value = ''
}
</script>

<template>
  <div v-if="section === 'windows'">
    <section class="panel client-card">
      <div class="client-setting-row">
        <label for="manage-window-rules"
          >由此配置管理窗口拦截<small>发布后完整替换设备的窗口规则；关闭时保留设备现有规则。</small></label
        >
        <el-switch
          id="manage-window-rules"
          :model-value="!!config.windowInterceptionConfig"
          @change="manage('windowInterceptionConfig', !!$event)"
        />
      </div>
    </section>
    <section v-if="config.windowInterceptionConfig" class="panel client-card">
      <div class="section-title">
        <h3>已保存的规则</h3>
        <el-button :disabled="config.windowInterceptionConfig.rules.length >= 256" @click="addRule"
          >新增规则</el-button
        >
      </div>
      <el-table
        :data="config.windowInterceptionConfig.rules"
        empty-text="暂无规则；发布空列表会清除设备现有规则。"
      >
        <el-table-column label="程序路径" min-width="240">
          <template #default="{ row, $index }"
            ><el-input
              v-model="row.exePath"
              :maxlength="32768"
              :aria-label="`第${$index + 1}条程序路径`"
              placeholder="C:/Apps/example.exe"
          /></template>
        </el-table-column>
        <el-table-column label="窗口类名" min-width="180">
          <template #default="{ row, $index }"
            ><el-input
              v-model="row.className"
              :maxlength="256"
              :aria-label="`第${$index + 1}条窗口类名`"
              placeholder="窗口类名（必填）"
          /></template>
        </el-table-column>
        <el-table-column label="标题包含" min-width="180">
          <template #default="{ row, $index }"
            ><el-input
              v-model="row.titleContains"
              :maxlength="1000"
              :aria-label="`第${$index + 1}条标题条件`"
              placeholder="不限（可选）"
          /></template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="{ row, $index }"
            ><el-switch v-model="row.enabled" :aria-label="`启用第${$index + 1}条规则`"
          /></template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ $index }"
            ><el-button
              text
              type="danger"
              :aria-label="`删除第${$index + 1}条规则`"
              @click="config.windowInterceptionConfig.rules.splice($index, 1)"
              >删除</el-button
            ></template
          >
        </el-table-column>
      </el-table>
      <p class="form-hint">
        程序路径与窗口类名必填。设备保存成功后重新应用规则，恢复不再匹配的本次隐藏窗口。窗口拦截仅支持
        Windows。
      </p>
    </section>
  </div>
  <div v-if="section === 'plugins'">
    <section class="panel client-card">
      <div class="client-setting-row">
        <label for="manage-plugin-preferences"
          >由此配置管理插件偏好<small>只更新列出的插件，下次启动生效；未列出的插件保持原样。</small></label
        >
        <el-switch
          id="manage-plugin-preferences"
          :model-value="!!config.pluginConfig"
          @change="manage('pluginConfig', !!$event)"
        />
      </div>
    </section>
    <template v-if="config.pluginConfig">
      <section v-if="detail" class="panel client-card">
        <el-button @click="detailId = ''">返回插件列表</el-button>
        <h3 class="plugin-id">{{ detailId }}</h3>
        <p>启用偏好：{{ detail.enabled ? '启用' : '停用' }}，设备下次启动生效。</p>
        <p class="form-hint">
          此处管理启用偏好。插件须已安装并在客户端完成授权；专属参数、运行状态与日志请在客户端查看。
        </p>
      </section>
      <template v-else>
        <section class="panel client-card">
          <el-input v-model="query" clearable aria-label="搜索插件 ID" placeholder="搜索插件 ID" />
          <form class="client-toolbar plugin-add-form" @submit.prevent="addPlugin">
            <el-input
              v-model="newId"
              :maxlength="128"
              aria-label="添加插件 ID"
              placeholder="插件 ID，例如 org.example.clock"
            />
            <el-button native-type="submit" :disabled="Object.keys(plugins).length >= 256"
              >添加插件</el-button
            >
          </form>
          <p v-if="pluginError" class="form-hint" role="alert">{{ pluginError }}</p>
        </section>
        <section v-for="id in filteredIds" :key="id" class="panel client-card">
          <div class="managed-plugin-row">
            <strong class="plugin-id">{{ id }}</strong>
            <el-switch
              v-model="plugins[id]!.enabled"
              :aria-label="`启用偏好：${id}`"
              active-text="启用偏好"
            />
            <el-button @click="detailId = id">详情</el-button>
            <el-button text type="danger" @click="delete config.pluginConfig.plugins[id]">移除</el-button>
          </div>
          <p class="form-hint">
            {{ plugins[id]!.enabled ? '启用' : '停用' }} · 下次启动生效 · 需要设备已安装并完成本地授权
          </p>
        </section>
        <el-empty
          v-if="!filteredIds.length"
          :description="query ? '没有匹配的插件' : '暂无插件偏好，按客户端清单中的 ID 添加'"
          :image-size="60"
        />
        <p class="form-hint">
          移除条目表示停止管理该插件；要停用插件，请关闭其启用偏好后发布。网页不安装插件或修改本地授权。
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.plugin-add-form {
  margin-top: 16px;
}
.managed-plugin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.plugin-id {
  overflow-wrap: anywhere;
  min-width: 0;
  flex: 1 1 200px;
}
.plugin-add-form .el-input {
  flex: 1;
  min-width: 180px;
}
</style>

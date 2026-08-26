<template>
  <div class="timeline-page">
    <!-- 页面标题 -->
    <div class="timeline-header">
      <h1 class="page-title">汪咪的谷子时间轴</h1>
      <p class="page-date">{{ todayText }}</p>
    </div>

    <!-- 顶部数据卡片 -->
    <div class="stat-cards-bar">
      <div 
        v-for="card in statCards" 
        :key="card.key"
        class="stat-card"
        :class="{ active: filterMode === card.key }"
        @click="toggleFilter(card.key)"
      >
        <div class="stat-number">{{ card.value }}</div>
        <div class="stat-label">{{ card.label }}</div>
      </div>
    </div>

    <!-- 修正#11：进行中拼团常驻栏 -->
    <div v-if="timelineData.activeGroups.length" class="active-groups-section">
      <div class="section-label">进行中的拼团</div>
      <div class="active-groups-bar">
        <div 
          v-for="group in timelineData.activeGroups" 
          :key="group.billId"
          class="active-group-card"
          :style="{ borderLeftColor: group.statusColor }"
          @click="goToGroup(group.billId)"
        >
          <div class="active-group-title">{{ group.seriesName }}</div>
          <div class="active-group-meta">已排{{ group.totalItems }}件</div>
          <div class="active-group-deadline" :style="{ color: group.statusColor }">
            {{ group.deadlineAt ? formatDeadline(group.deadlineAt) : '截团待定' }}
          </div>
          <div v-if="group.progressText" class="active-group-progress">{{ group.progressText }}</div>
        </div>
      </div>
    </div>

    <!-- 底部过滤栏 -->
    <div class="filter-bar">
      <button 
        v-for="f in filters" 
        :key="f.key"
        class="filter-chip"
        :class="{ active: filterMode === f.key }"
        @click="filterMode = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Timeline 时间轴 -->
    <div class="timeline-content">
      <div v-if="filteredNodes.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <p class="empty-text">暂无相关事项</p>
      </div>

      <div v-for="(group, gIdx) in groupedNodes" :key="group.label" class="time-group">
        <div class="time-group-label">{{ group.label }}</div>
        <TimelineNode 
          v-for="node in group.nodes" 
          :key="node.id"
          :node="node"
          @click="showNodeDetail(node)"
        />
      </div>
    </div>

    <!-- 修正#7：节点详情浮层 -->
    <NodeDetailSheet
      v-if="selectedNode"
      :node="selectedNode"
      @close="selectedNode = null"
      @action="handleNodeAction"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import TimelineNode from './TimelineNode.vue';
import NodeDetailSheet from './NodeDetailSheet.vue';
import { buildTimeline, groupNodesByTime } from '../utils/timeline';

const props = defineProps({
  myBills: { type: Array, default: () => [] },
  myBuys: { type: Array, default: () => [] },
  myAuctionOrders: { type: Array, default: () => [] },
  myTransfers: { type: Array, default: () => [] },
  myClears: { type: Array, default: () => [] },
  notis: { type: Array, default: () => [] },
  shopCfg: { type: Object, default: () => ({}) },
  seriesList: { type: Array, default: () => [] },
});

const emit = defineEmits(['navigate', 'go-group']);

// 过滤模式
const filterMode = ref('pending'); // all | pending | active | done

const filters = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待我操作' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完成' },
];

// 计算 Timeline 数据
const timelineData = computed(() => {
  return buildTimeline(
    props.myBills,
    props.myBuys,
    props.myAuctionOrders,
    props.myTransfers,
    props.myClears,
    props.notis,
    props.shopCfg,
    props.seriesList,
  );
});

// 数据卡片
const statCards = computed(() => {
  const s = timelineData.value.stats;
  return [
    { key: 'pendingClearing', label: '待清货', value: s.pendingClearing },
    { key: 'pendingPayment', label: '待付款', value: s.pendingPayment },
    { key: 'pendingTransfer', label: '转单待确认', value: s.pendingTransfer },
    { key: 'activeGroups', label: '进行中拼团', value: s.activeGroups },
  ];
});

// 过滤后的节点
const filteredNodes = computed(() => {
  const nodes = timelineData.value.nodes;
  switch (filterMode.value) {
    case 'pending':
      return nodes.filter(n => n.urgencyLevel >= 2 || n.nextEventType.includes('待付款') || n.nextEventType.includes('待确认'));
    case 'active':
      return nodes.filter(n => n.urgencyLevel === 0 || n.urgencyLevel === 1);
    case 'done':
      return nodes.filter(n => n.statusColor === '#34C759');
    default:
      return nodes;
  }
});

// 按时间分组
const groupedNodes = computed(() => {
  return groupNodesByTime(filteredNodes.value);
});

// 今天日期文本
const todayText = computed(() => {
  const d = new Date();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${weekDays[d.getDay()]}`;
});

// 切换过滤
function toggleFilter(key) {
  filterMode.value = filterMode.value === key ? 'all' : key;
}

// 格式化截止时间
function formatDeadline(ts) {
  const now = Date.now();
  const diff = ts - now;
  if (diff <= 0) return '已截止';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  return `${days}天后`;
}

// 跳转拼团
function goToGroup(billId) {
  emit('go-group', billId);
}

// 选中的节点详情
const selectedNode = ref(null);

function showNodeDetail(node) {
  selectedNode.value = node;
}

function handleNodeAction({ node, action }) {
  selectedNode.value = null;
  emit('navigate', { action, node });
}
</script>

<style scoped>
.timeline-page {
  padding: 16px;
  padding-bottom: 80px;
  min-height: 100vh;
  background: var(--bg, #FAFAFA);
}

.timeline-header {
  margin-bottom: 16px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--t1, #1C1C1E);
  margin: 0;
}

.page-date {
  font-size: 13px;
  color: var(--t3, #8E8E93);
  margin: 4px 0 0;
}

/* 数据卡片 */
.stat-cards-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 16px;
  scrollbar-width: none;
}

.stat-cards-bar::-webkit-scrollbar {
  display: none;
}

.stat-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 72px;
  text-align: center;
  border: 1px solid var(--line, #F0F0F2);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.stat-card.active {
  background: var(--brand, #FF5B7F);
  border-color: var(--brand, #FF5B7F);
}

.stat-card.active .stat-number,
.stat-card.active .stat-label {
  color: #FFFFFF;
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: var(--brand, #FF5B7F);
  line-height: 1;
}

.stat-label {
  font-size: 11px;
  font-weight: 400;
  color: var(--t3, #8E8E93);
  margin-top: 4px;
}

/* 进行中拼团栏 */
.active-groups-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--t3, #8E8E93);
  margin-bottom: 8px;
}

.active-groups-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.active-groups-bar::-webkit-scrollbar {
  display: none;
}

.active-group-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 150px;
  max-width: 200px;
  flex-shrink: 0;
  border-left: 4px solid;
  cursor: pointer;
  transition: all 0.1s;
}

.active-group-card:active {
  background: var(--brand-bg2, #FFF5F7);
  transform: scale(0.98);
}

.active-group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-group-meta {
  font-size: 12px;
  color: var(--t3, #8E8E93);
  margin-top: 4px;
}

.active-group-deadline {
  font-size: 12px;
  font-weight: 500;
  margin-top: 2px;
}

.active-group-progress {
  font-size: 11px;
  color: var(--status-pending, #FF9500);
  margin-top: 2px;
}

/* 过滤栏 */
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  background: var(--line, #F0F0F2);
  color: var(--t3, #8E8E93);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-chip.active {
  background: var(--brand, #FF5B7F);
  color: #FFFFFF;
}

/* 时间轴内容 */
.timeline-content {
  padding-bottom: 20px;
}

.time-group {
  margin-bottom: 8px;
}

.time-group-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--t3, #8E8E93);
  padding: 16px 0 8px 0;
  border-top: 1px solid var(--line, #F0F0F2);
  margin-top: 8px;
}

.time-group:first-child .time-group-label {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 16px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: var(--t3, #8E8E93);
}
</style>

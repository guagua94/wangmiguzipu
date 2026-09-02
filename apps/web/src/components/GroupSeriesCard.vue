<template>
  <div class="group-series-card" :class="{ expanded: expanded, urgent: card._countdownUrgent }" @click="$emit('expand')">
    <!-- 卡片头部 -->
    <div class="gsc-header">
      <div class="gsc-title-area">
        <img v-if="card.img" :src="card.img" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid #eee;cursor:pointer" @click.stop="$emit('img-click', card.img)" />
        <span v-else class="gsc-emoji">{{ card.emoji || '🧩' }}</span>
        <div class="gsc-title-text">
          <b class="gsc-name">{{ card.name }}</b>
          <span class="gsc-ip muted">{{ card.ip }}</span>
        </div>
      </div>
      <div class="gsc-actions">
        <button v-if="deletable" class="gsc-delete-btn" @click.stop="$emit('delete')" title="删除活动">🗑️</button>
        <span class="tag" :class="statusClass">{{ card.status }}</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="gsc-progress-area">
      <div class="gsc-progress-bar">
        <div class="gsc-progress-fill" :style="{ width: card._progress + '%' }"></div>
      </div>
      <span class="gsc-progress-text">{{ card._totalBooked }}/{{ card._totalLimit }} 件 ({{ card._progress }}%)</span>
    </div>

    <!-- 关键数字 -->
    <div class="gsc-stats">
      <div class="gsc-stat">
        <span class="gsc-stat-num">{{ card._billsCount }}</span>
        <span class="gsc-stat-label">肾表</span>
      </div>
      <div class="gsc-stat">
        <span class="gsc-stat-num">{{ card._memberCount }}</span>
        <span class="gsc-stat-label">团员</span>
      </div>
      <div class="gsc-stat" :class="{ warn: card._unpaidCount > 0 }">
        <span class="gsc-stat-num">{{ card._unpaidCount }}</span>
        <span class="gsc-stat-label">待付款</span>
      </div>
      <div class="gsc-stat" :class="{ warn: card._pendingAuditCount > 0 }">
        <span class="gsc-stat-num">{{ card._pendingAuditCount }}</span>
        <span class="gsc-stat-label">待审核</span>
      </div>
    </div>

    <!-- 截团倒计时 / 总额 -->
    <div class="gsc-footer">
      <div v-if="card._countdownText" class="gsc-countdown" :class="{ urgent: card._countdownUrgent }">
        <span v-if="card._countdownUrgent">⏰</span>
        <span v-else>📅</span>
        {{ card._countdownText }}
      </div>
      <div class="gsc-amount">
        合计 <b class="price">¥{{ card._totalAmount.toFixed(2) }}</b>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  card: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  deletable: { type: Boolean, default: false },
});

defineEmits(['expand', 'delete', 'img-click']);

const statusClass = computed(() => {
  if (props.card.status === '进行中') return 'pink';
  if (props.card.status === '已截团') return 'green';
  return 'gray';
});
</script>

<style scoped>
.group-series-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  cursor: pointer;
  transition: box-shadow .2s, border-color .2s;
  border: 2px solid transparent;
}

.group-series-card:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,.08);
}

.group-series-card.expanded {
  border-color: var(--brand, #FF5B7F);
  box-shadow: 0 4px 20px rgba(255,91,127,.12);
}

.group-series-card.urgent {
  border-color: var(--warning, #FF9500);
}

/* 头部 */
.gsc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.gsc-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gsc-emoji {
  font-size: 22px;
}

.gsc-title-text {
  display: flex;
  flex-direction: column;
}

.gsc-name {
  font-size: 15px;
  color: var(--t1, #1C1C1E);
}

.gsc-ip {
  font-size: 12px;
}

/* 进度条 */
.gsc-progress-area {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.gsc-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg, #F2F2F7);
  border-radius: 4px;
  overflow: hidden;
}

.gsc-progress-fill {
  height: 100%;
  background: var(--brand-gradient, linear-gradient(135deg, #FF6B8A 0%, #FF8E9E 100%));
  border-radius: 4px;
  transition: width .3s;
}

.gsc-progress-text {
  font-size: 11px;
  color: var(--t3, #8E8E93);
  white-space: nowrap;
}

/* 统计 */
.gsc-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.gsc-stat {
  text-align: center;
  background: var(--bg, #F2F2F7);
  border-radius: 8px;
  padding: 8px 4px;
}

.gsc-stat.warn {
  background: var(--warning-bg, #FFF5E6);
}

.gsc-stat.warn .gsc-stat-num {
  color: var(--warning, #FF9500);
}

.gsc-stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--t1, #1C1C1E);
  display: block;
  line-height: 1.2;
}

.gsc-stat-label {
  font-size: 11px;
  color: var(--t3, #8E8E93);
  margin-top: 2px;
  display: block;
}

/* 底部 */
.gsc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-top: 8px;
  border-top: 1px solid var(--bg, #F2F2F7);
  padding-top: 8px;
}

.gsc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gsc-delete-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background .2s;
  opacity: .6;
}

.gsc-delete-btn:hover {
  background: rgba(255, 59, 48, .1);
  opacity: 1;
}

.gsc-countdown {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--t3, #8E8E93);
}

.gsc-countdown.urgent {
  color: var(--danger, #FF3B30);
  font-weight: 600;
}

.gsc-amount {
  color: var(--t3, #8E8E93);
}
</style>

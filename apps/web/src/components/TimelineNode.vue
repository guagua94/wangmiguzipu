<template>
  <div 
    class="timeline-node-card"
    :class="`urgency-${node.urgencyLevel}`"
    :style="{ '--status-color': node.statusColor }"
    @click="$emit('click', node)"
  >
    <div class="node-header">
      <span class="node-icon">{{ node.icon }}</span>
      <span class="node-title">{{ node.title }}</span>
    </div>
    <div class="node-subtitle">{{ node.subtitle }}</div>
    <div v-if="node.detailLine" class="node-detail" :class="{ warning: node.detailLine.includes('⚠') || node.detailLine.includes('差') }">
      {{ node.detailLine }}
    </div>
    <div class="node-action">
      <span class="action-text">{{ getActionText(node) }}</span>
      <span class="action-arrow">→</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  node: { type: Object, required: true }
});

defineEmits(['click']);

function getActionText(node) {
  const map = {
    'stock': '去清货',
    'orders': '去付款',
    'auction': node.nextEventType === '中标待付款' ? '去付款' : '去竞拍',
    'transfer': '去确认',
    'balance': '查看余额',
    'group': '查看排表',
  };
  return map[node.linkAction] || '查看';
}
</script>

<style scoped>
.timeline-node-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--line, #F0F0F2);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.1s ease;
}

/* 左侧状态色条 */
.timeline-node-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--status-color, #8E8E93);
  border-radius: 12px 0 0 12px;
}

/* 修正#8：紧急度3（超期）色条加粗 + 泛红背景 */
.timeline-node-card.urgency-3::before {
  width: 6px;
}

.timeline-node-card.urgency-3 {
  background: linear-gradient(to right, rgba(255, 59, 48, 0.04) 0%, #FFFFFF 100%);
}

/* 紧急度1（截团/截拍）细色条 */
.timeline-node-card.urgency-1::before {
  width: 3px;
  opacity: 0.6;
}

.timeline-node-card:active {
  background: var(--brand-bg2, #FFF5F7);
  transform: scale(0.98);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  margin-bottom: 4px;
}

.node-icon {
  font-size: 16px;
  line-height: 1;
}

.node-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  line-height: 1.4;
}

.node-subtitle {
  font-size: 14px;
  font-weight: 400;
  color: var(--t3, #8E8E93);
  padding-left: 12px;
  margin-top: 4px;
  line-height: 1.4;
}

.node-detail {
  font-size: 13px;
  font-weight: 400;
  color: var(--t2, #3A3A3C);
  padding-left: 12px;
  margin-top: 4px;
  line-height: 1.4;
}

.node-detail.warning {
  color: var(--status-warning, #FF3B30);
}

.node-action {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-left: 12px;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--brand, #FF5B7F);
}

.action-arrow {
  font-size: 16px;
  transition: transform 0.15s;
}

.timeline-node-card:active .action-arrow {
  transform: translateX(4px);
}
</style>

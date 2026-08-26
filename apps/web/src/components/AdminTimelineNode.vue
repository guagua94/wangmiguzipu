<template>
  <div 
    class="admin-todo-card"
    :class="`urgency-${item.urgencyLevel}`"
    :style="{ '--status-color': item.statusColor }"
  >
    <div class="todo-checkbox" v-if="item.batchable" @click.stop="toggleSelect">
      <div class="cb-box" :class="{ checked: selected }"></div>
    </div>
    <div class="todo-main" @click="$emit('click', item)">
      <div class="todo-header">
        <span class="todo-icon">{{ item.icon }}</span>
        <span class="todo-type">{{ item.typeLabel }}</span>
        <span v-if="item.urgencyLevel === 3" class="urgency-badge">即将超时</span>
        <span v-else-if="item.urgencyLevel === 2" class="urgency-badge today">今日新</span>
      </div>
      <div class="todo-title">{{ item.title }}</div>
      <div class="todo-subtitle">{{ item.subtitle }}</div>
      <div class="todo-detail">{{ item.detail }}</div>
      <div v-if="item.screenshot" class="todo-screenshot" @click.stop="$emit('preview-screenshot', item.screenshot)">
        📷 付款截图
      </div>
    </div>
    <div class="todo-actions">
      <button 
        v-for="action in actionButtons" 
        :key="action.key"
        class="todo-action-btn"
        :class="action.type"
        @click.stop="$emit('action', { item, action: action.key })"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false }
});

const emit = defineEmits(['click', 'toggle-select', 'action', 'preview-screenshot']);

const actionButtons = computed(() => {
  const map = {
    'bill': [
      { key: 'pass', label: '通过销账', type: 'primary' },
      { key: 'reject', label: '打回', type: 'secondary' }
    ],
    'sale': [
      { key: 'pass', label: '通过', type: 'primary' },
      { key: 'reject', label: '打回', type: 'secondary' }
    ],
    'after': [
      { key: 'pass', label: '通过', type: 'primary' },
      { key: 'reject', label: '驳回', type: 'secondary' }
    ],
    'deposit': [
      { key: 'pass', label: '通过', type: 'primary' },
      { key: 'reject', label: '拒绝', type: 'secondary' }
    ],
    'cancel': [
      { key: 'pass', label: '同意取消', type: 'primary' },
      { key: 'reject', label: '拒绝', type: 'secondary' }
    ],
    'withdraw': [
      { key: 'pass', label: '已转账', type: 'primary' },
      { key: 'reject', label: '拒绝', type: 'secondary' }
    ],
  };
  return map[props.item.type] || [];
});

function toggleSelect() {
  emit('toggle-select', props.item.id);
}
</script>

<style scoped>
.admin-todo-card {
  display: flex;
  align-items: flex-start;
  gap: 0;
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border-left: 4px solid var(--status-color, #8E8E93);
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  transition: all .15s ease;
  cursor: pointer;
}

.admin-todo-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}

.admin-todo-card.urgency-3 {
  border-left-width: 6px;
  background: linear-gradient(to right, rgba(255, 59, 48, 0.03) 0%, #FFFFFF 100%);
}

.admin-todo-card.urgency-2 {
  border-left-color: #FF9500;
}

/* 勾选框 */
.todo-checkbox {
  padding: 2px 8px 0 0;
  flex-shrink: 0;
}
.cb-box {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line2, #E5E5EA);
  border-radius: 4px;
  transition: all .15s;
}
.cb-box.checked {
  background: var(--brand, #FF5B7F);
  border-color: var(--brand, #FF5B7F);
}
.cb-box.checked::after {
  content: '';
  display: block;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin: 2px 0 0 5px;
}

/* 主内容区 */
.todo-main {
  flex: 1;
  min-width: 0;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.todo-icon {
  font-size: 14px;
}

.todo-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--t3, #8E8E93);
  background: var(--info-bg, #F2F2F7);
  padding: 2px 8px;
  border-radius: 10px;
}

.urgency-badge {
  font-size: 11px;
  font-weight: 600;
  color: #FF3B30;
  background: rgba(255, 59, 48, 0.08);
  padding: 2px 8px;
  border-radius: 10px;
}
.urgency-badge.today {
  color: #FF9500;
  background: rgba(255, 149, 0, 0.08);
}

.todo-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  margin-bottom: 2px;
}

.todo-subtitle {
  font-size: 13px;
  color: var(--t2, #3A3A3C);
  margin-bottom: 2px;
}

.todo-detail {
  font-size: 12px;
  color: var(--t3, #8E8E93);
}

.todo-screenshot {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--brand, #FF5B7F);
  cursor: pointer;
  padding: 2px 0;
}
.todo-screenshot:hover {
  text-decoration: underline;
}

/* 右侧操作按钮 */
.todo-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
  padding-top: 2px;
}

.todo-action-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}

.todo-action-btn.primary {
  background: var(--brand, #FF5B7F);
  color: #fff;
}
.todo-action-btn.primary:hover {
  background: var(--brand-dark, #E0486B);
}

.todo-action-btn.secondary {
  background: var(--info-bg, #F2F2F7);
  color: var(--t2, #3A3A3C);
}
.todo-action-btn.secondary:hover {
  background: var(--line2, #E5E5EA);
}
</style>

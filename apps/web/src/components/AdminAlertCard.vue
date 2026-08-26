<template>
  <div 
    class="alert-card"
    :class="`level-${item.level}`"
    @click="$emit('click', item)"
  >
    <div class="alert-icon">{{ item.icon }}</div>
    <div class="alert-main">
      <div class="alert-header">
        <span class="alert-type">{{ item.type }}</span>
        <span :class="['alert-level-badge', item.level]">
          {{ levelText }}
        </span>
      </div>
      <div class="alert-title">{{ item.title }}</div>
      <div class="alert-detail">{{ item.detail }}</div>
      <div class="alert-action" @click.stop="$emit('navigate', item.action)">
        → {{ item.action }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  item: { type: Object, required: true }
});

const emit = defineEmits(['click', 'navigate']);

const levelText = computed(() => {
  const map = { critical: '紧急', warning: '警告', info: '提示' };
  return map[props.item.level] || '';
});
</script>

<style scoped>
.alert-card {
  display: flex;
  gap: 12px;
  background: #FFFFFF;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  border-left: 5px solid var(--line2, #E5E5EA);
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  cursor: pointer;
  transition: all .15s ease;
}

.alert-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}

/* 紧急：红色 */
.alert-card.level-critical {
  border-left-color: #FF3B30;
  background: linear-gradient(to right, rgba(255, 59, 48, 0.03) 0%, #FFFFFF 100%);
}

/* 警告：橙色 */
.alert-card.level-warning {
  border-left-color: #FF9500;
  background: linear-gradient(to right, rgba(255, 149, 0, 0.03) 0%, #FFFFFF 100%);
}

/* 提示：蓝色 */
.alert-card.level-info {
  border-left-color: #007AFF;
}

.alert-icon {
  font-size: 28px;
  flex-shrink: 0;
  line-height: 1;
  margin-top: 2px;
}

.alert-main {
  flex: 1;
  min-width: 0;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.alert-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--t3, #8E8E93);
}

.alert-level-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.alert-level-badge.critical {
  color: #FF3B30;
  background: rgba(255, 59, 48, 0.08);
}
.alert-level-badge.warning {
  color: #FF9500;
  background: rgba(255, 149, 0, 0.08);
}
.alert-level-badge.info {
  color: #007AFF;
  background: rgba(0, 122, 255, 0.08);
}

.alert-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  margin-bottom: 4px;
}

.alert-detail {
  font-size: 13px;
  color: var(--t2, #3A3A3C);
  margin-bottom: 8px;
  line-height: 1.5;
}

.alert-action {
  font-size: 13px;
  font-weight: 500;
  color: var(--brand, #FF5B7F);
  cursor: pointer;
  display: inline-block;
}
.alert-action:hover {
  text-decoration: underline;
}
</style>

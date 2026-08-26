<template>
  <div class="detail-sheet-overlay" @click.self="$emit('close')">
    <div class="detail-sheet" :class="{ closing: isClosing }">
      <!-- 拖动条 -->
      <div class="drag-handle" @click="closeSheet"></div>
      
      <!-- 头部信息 -->
      <div class="sheet-header">
        <div class="node-icon-large">{{ node.icon }}</div>
        <div class="header-text">
          <h3 class="sheet-title">{{ node.title }}</h3>
          <p class="sheet-subtitle">{{ node.subtitle }}</p>
        </div>
      </div>

      <!-- 详细信息 -->
      <div class="sheet-body">
        <!-- 修正#9：成配进度/详情 -->
        <div v-if="node.detailLine" class="detail-section">
          <div class="detail-label">当前状态</div>
          <div class="detail-value" :class="{ warning: node.detailLine.includes('⚠') || node.detailLine.includes('差') }">
            {{ node.detailLine }}
          </div>
        </div>

        <!-- 截止时间 -->
        <div v-if="node.deadlineAt" class="detail-section">
          <div class="detail-label">截止时间</div>
          <div class="detail-value">{{ formatDeadline(node.deadlineAt) }}</div>
        </div>

        <!-- 时间线 -->
        <div v-if="timelineEvents.length" class="timeline-section">
          <div class="detail-label">流程进度</div>
          <div class="mini-timeline">
            <div 
              v-for="(event, idx) in timelineEvents" 
              :key="idx"
              class="timeline-event"
              :class="{ current: event.current, past: event.past }"
            >
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="event-name">{{ event.name }}</div>
                <div v-if="event.time" class="event-time">{{ event.time }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮区 -->
        <div class="sheet-actions">
          <button class="btn-primary" @click="handleAction">
            {{ actionButtonText }}
          </button>
          <button class="btn-secondary" @click="closeSheet">
            暂不处理
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  node: { type: Object, required: true }
});

const emit = defineEmits(['close', 'action']);

const isClosing = ref(false);

function closeSheet() {
  isClosing.value = true;
  setTimeout(() => {
    emit('close');
  }, 250);
}

function handleAction() {
  emit('action', { 
    node: props.node, 
    action: props.node.linkAction 
  });
}

const actionButtonText = computed(() => {
  const map = {
    'stock': '去清货',
    'orders': '去付款',
    'auction': props.node.nextEventType === '中标待付款' ? '去付款' : '去竞拍',
    'transfer': '去确认',
    'balance': '查看余额',
    'group': '查看排表',
  };
  return map[props.node.linkAction] || '查看详情';
});

function formatDeadline(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = ts - now;
  
  let prefix = '';
  if (diff > 0) {
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) {
      prefix = `（还剩 ${hours} 小时）`;
    } else {
      const days = Math.floor(hours / 24);
      prefix = `（还剩 ${days} 天）`;
    }
  } else {
    prefix = '（已截止）';
  }
  
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${prefix}`;
}

// 根据节点类型生成时间线事件
const timelineEvents = computed(() => {
  const events = [];
  const type = props.node.type;
  
  if (type === 'group') {
    events.push(
      { name: '已排单', past: true },
      { name: '截团', past: props.node.nextEventType !== '跟排中', current: props.node.nextEventType === '截团待付款' },
      { name: '付款截止', past: false, current: props.node.nextEventType === '截团待付款' },
      { name: '入囤', past: false },
      { name: '清货', past: false },
    );
  } else if (type === 'sale') {
    events.push(
      { name: '已下单', past: true },
      { name: '付款截止', past: false, current: props.node.nextEventType === '付款截止' },
      { name: '入囤', past: false },
      { name: '清货', past: false },
    );
  } else if (type === 'auction') {
    if (props.node.nextEventType === '截拍提醒') {
      events.push(
        { name: '竞拍中', past: true, current: true },
        { name: '截拍', past: false },
        { name: '付款截止', past: false },
        { name: '入囤', past: false },
      );
    } else {
      events.push(
        { name: '竞拍中', past: true },
        { name: '截拍', past: true },
        { name: '中标', past: true, current: props.node.nextEventType === '中标待付款' },
        { name: '付款截止', past: false, current: props.node.nextEventType === '中标待付款' },
        { name: '入囤', past: false },
      );
    }
  }
  
  return events;
});
</script>

<style scoped>
.detail-sheet-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.detail-sheet {
  background: #FFFFFF;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 75vh;
  overflow-y: auto;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
}

.detail-sheet.closing {
  animation: slideDown 0.25s ease-in forwards;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes slideDown {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}

.drag-handle {
  width: 36px;
  height: 4px;
  background: #E5E5EA;
  border-radius: 2px;
  margin: 8px auto;
  cursor: pointer;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px 16px;
  border-bottom: 1px solid var(--line, #F0F0F2);
}

.node-icon-large {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--brand-bg2, #FFF5F7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.sheet-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  margin: 0 0 4px;
  line-height: 1.3;
}

.sheet-subtitle {
  font-size: 14px;
  color: var(--t3, #8E8E93);
  margin: 0;
  line-height: 1.4;
}

.sheet-body {
  padding: 16px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--t3, #8E8E93);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 15px;
  color: var(--t2, #3A3A3C);
  line-height: 1.5;
}

.detail-value.warning {
  color: var(--status-warning, #FF3B30);
  font-weight: 500;
}

/* 迷你时间线 */
.timeline-section {
  margin-bottom: 20px;
}

.mini-timeline {
  padding-left: 8px;
  border-left: 2px solid var(--line, #F0F0F2);
  margin-left: 10px;
}

.timeline-event {
  position: relative;
  padding: 8px 0 8px 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.timeline-event.past {
  opacity: 0.5;
}

.timeline-event.current {
  opacity: 1;
}

.timeline-dot {
  position: absolute;
  left: -21px;
  top: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--line2, #E5E5EA);
  border: 2px solid #FFFFFF;
  box-shadow: 0 0 0 1px var(--line2, #E5E5EA);
}

.timeline-event.current .timeline-dot {
  background: var(--brand, #FF5B7F);
  box-shadow: 0 0 0 1px var(--brand, #FF5B7F);
}

.timeline-event.past .timeline-dot {
  background: var(--status-done, #34C759);
  box-shadow: 0 0 0 1px var(--status-done, #34C759);
}

.event-name {
  font-size: 14px;
  color: var(--t2, #3A3A3C);
}

.timeline-event.current .event-name {
  font-weight: 600;
  color: var(--brand, #FF5B7F);
}

.event-time {
  font-size: 12px;
  color: var(--t3, #8E8E93);
  margin-top: 2px;
}

/* 操作按钮 */
.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--line, #F0F0F2);
}

.btn-primary {
  background: var(--brand, #FF5B7F);
  color: #FFFFFF;
  border: none;
  border-radius: 999px;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  min-height: 48px;
  width: 100%;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: var(--brand-dark, #E0486B);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-secondary {
  background: #FFFFFF;
  color: var(--t3, #8E8E93);
  border: 1px solid var(--line2, #E5E5EA);
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  width: 100%;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: var(--bg, #FAFAFA);
}
</style>

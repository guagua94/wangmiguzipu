<template>
  <div class="profile-drawer-overlay" @click.self="$emit('close')">
    <div class="profile-drawer" :class="{ closing: isClosing }">
      <!-- 头部 -->
      <div class="profile-header">
        <div class="profile-avatar">{{ profile.cn?.[0] || '?' }}</div>
        <div class="profile-title">
          <h3>{{ profile.cn }}</h3>
          <p class="profile-sub">{{ profile.account }} · {{ profile.role === 'owner' ? '店主' : '团员' }}</p>
        </div>
        <button class="profile-close" @click="closeDrawer">✕</button>
      </div>

      <!-- 活跃标签 -->
      <div class="profile-badges">
        <span class="badge" :class="['level-' + profile.activeLevel]">
          {{ profile.activeLevel }}
        </span>
        <span v-if="profile.banned" class="badge banned">黑名单</span>
        <span v-if="profile.pendingTodoCount > 0" class="badge todo">
          {{ profile.pendingTodoCount }} 项待办
        </span>
        <span v-if="profile.stockOver90 > 0" class="badge warning">
          {{ profile.stockOver90 }} 项囤货超90天
        </span>
      </div>

      <!-- 数据卡片 -->
      <div class="profile-stats">
        <div class="stat-card">
          <div class="stat-num">¥{{ profile.totalSpent.toFixed(2) }}</div>
          <div class="stat-label">累计消费</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ profile.totalOrders }}</div>
          <div class="stat-label">总订单</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">¥{{ profile.avgOrderAmount }}</div>
          <div class="stat-label">均单金额</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ profile.stockCount }}</div>
          <div class="stat-label">当前囤货</div>
        </div>
      </div>

      <!-- 余额与联系 -->
      <div class="profile-section">
        <div class="section-title">账户信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">余额</span>
            <span class="info-value" :class="{ negative: profile.balance < 0 }">
              ¥{{ profile.balance.toFixed(2) }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">QQ</span>
            <span class="info-value">{{ profile.qq || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">微信</span>
            <span class="info-value">{{ profile.wechat || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最近下单</span>
            <span class="info-value">{{ profile.lastOrderDate || '无记录' }}
              <span v-if="profile.daysSinceLastOrder < 999" class="meta">({{ profile.daysSinceLastOrder }}天前)</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 当前待办 -->
      <div v-if="profile.pendingTodos.length" class="profile-section">
        <div class="section-title">当前待办 <span class="count">{{ profile.pendingTodoCount }}</span></div>
        <div class="todo-list">
          <div 
            v-for="(todo, idx) in profile.pendingTodos" 
            :key="idx"
            class="profile-todo-item"
            :class="{ urgent: todo.urgency >= 3, warning: todo.urgency === 2 }"
          >
            <span class="todo-type">{{ todo.type }}</span>
            <span class="todo-title">{{ todo.title }}</span>
            <span class="todo-amount" v-if="todo.amount">¥{{ todo.amount }}</span>
          </div>
        </div>
      </div>

      <!-- 时间线 -->
      <div class="profile-section">
        <div class="section-title">历史订单</div>
        <div class="mini-timeline">
          <div 
            v-for="(event, idx) in profile.timeline" 
            :key="idx"
            class="timeline-row"
          >
            <div class="timeline-date">{{ event.date }}</div>
            <div class="timeline-type">{{ event.label }}</div>
            <div class="timeline-title">{{ event.title }}</div>
            <div class="timeline-amount" v-if="event.amount">¥{{ event.amount }}</div>
            <div class="timeline-status" :class="event.status">{{ event.status }}</div>
          </div>
        </div>
        <div v-if="!profile.timeline.length" class="empty-mini">暂无订单记录</div>
      </div>

      <!-- 底部操作 -->
      <div class="profile-footer">
        <button class="btn primary" @click="$emit('reset-pwd', profile)">重置密码</button>
        <button 
          v-if="profile.role !== 'owner'"
          :class="['btn', profile.banned ? 'primary' : 'secondary']"
          @click="$emit('ban', profile)"
        >
          {{ profile.banned ? '解除拉黑' : '拉黑' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  profile: { type: Object, required: true }
});

const emit = defineEmits(['close', 'reset-pwd', 'ban']);

const isClosing = ref(false);

function closeDrawer() {
  isClosing.value = true;
  setTimeout(() => {
    emit('close');
  }, 250);
}
</script>

<style scoped>
.profile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  z-index: 9998;
  display: flex;
  justify-content: flex-end;
}

.profile-drawer {
  width: 460px;
  max-width: 90vw;
  height: 100vh;
  background: var(--bg, #F2F2F7);
  overflow-y: auto;
  animation: slideIn .25s ease-out;
  display: flex;
  flex-direction: column;
}

.profile-drawer.closing {
  animation: slideOut .25s ease-in forwards;
}

@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }

/* 头部 */
.profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 16px;
  background: #fff;
  border-bottom: 1px solid var(--line, #F0F0F2);
}

.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--brand-gradient, linear-gradient(135deg, #FF6B8A 0%, #FF8E9E 100%));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}

.profile-title {
  flex: 1;
  min-width: 0;
}

.profile-title h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--t1, #1C1C1E);
  margin: 0;
}

.profile-sub {
  font-size: 13px;
  color: var(--t3, #8E8E93);
  margin: 2px 0 0;
}

.profile-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--info-bg, #F2F2F7);
  color: var(--t3, #8E8E93);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.profile-close:hover { background: var(--line2, #E5E5EA); }

/* 标签 */
.profile-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: #fff;
}

.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
}

.badge.level-高频 { color: #34C759; background: rgba(52, 199, 89, 0.1); }
.badge.level-中频 { color: #007AFF; background: rgba(0, 122, 255, 0.1); }
.badge.level-低频 { color: #FF9500; background: rgba(255, 149, 0, 0.1); }
.badge.level-沉睡 { color: #8E8E93; background: rgba(142, 142, 147, 0.1); }
.badge.banned { color: #FF3B30; background: rgba(255, 59, 48, 0.1); }
.badge.todo { color: var(--brand, #FF5B7F); background: var(--brand-bg, #FFE4EA); }
.badge.warning { color: #FF9500; background: rgba(255, 149, 0, 0.1); }

/* 数据卡片 */
.profile-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 12px 16px;
  background: #fff;
  margin-bottom: 10px;
}

.stat-card {
  background: var(--bg, #F2F2F7);
  border-radius: 12px;
  padding: 12px 8px;
  text-align: center;
}

.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--t1, #1C1C1E);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--t3, #8E8E93);
  margin-top: 4px;
}

/* 区块 */
.profile-section {
  background: #fff;
  margin-bottom: 10px;
  padding: 14px 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--t1, #1C1C1E);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-title .count {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand, #FF5B7F);
  background: var(--brand-bg, #FFE4EA);
  padding: 2px 8px;
  border-radius: 10px;
}

/* 信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 12px;
  color: var(--t3, #8E8E93);
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
}

.info-value.negative {
  color: #FF3B30;
}

.info-value .meta {
  font-size: 12px;
  color: var(--t3, #8E8E93);
  font-weight: 400;
  margin-left: 4px;
}

/* 待办列表 */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg, #F2F2F7);
  font-size: 13px;
}

.profile-todo-item.urgent {
  background: rgba(255, 59, 48, 0.06);
  border-left: 3px solid #FF3B30;
}

.profile-todo-item.warning {
  background: rgba(255, 149, 0, 0.06);
  border-left: 3px solid #FF9500;
}

.todo-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--t3, #8E8E93);
  background: #fff;
  padding: 2px 8px;
  border-radius: 8px;
  flex-shrink: 0;
}

.todo-title {
  flex: 1;
  min-width: 0;
  color: var(--t1, #1C1C1E);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-amount {
  font-weight: 600;
  color: var(--brand, #FF5B7F);
  flex-shrink: 0;
}

/* 迷你时间线 */
.mini-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line, #F0F0F2);
  font-size: 13px;
}

.timeline-row:last-child { border-bottom: none; }

.timeline-date {
  width: 90px;
  flex-shrink: 0;
  color: var(--t3, #8E8E93);
  font-size: 12px;
}

.timeline-type {
  width: 56px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--t3, #8E8E93);
  background: var(--info-bg, #F2F2F7);
  padding: 2px 6px;
  border-radius: 6px;
  text-align: center;
}

.timeline-title {
  flex: 1;
  min-width: 0;
  color: var(--t1, #1C1C1E);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-amount {
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  flex-shrink: 0;
}

.timeline-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  flex-shrink: 0;
}

.timeline-status.已销账,
.timeline-status.囤货中,
.timeline-status.已完成,
.timeline-status.已缴,
.timeline-status.已转账 {
  color: #34C759;
  background: rgba(52, 199, 89, 0.08);
}

.timeline-status.待付款,
.timeline-status.待审核,
.timeline-status.待处理,
.timeline-status.已提交截图 {
  color: #FF9500;
  background: rgba(255, 149, 0, 0.08);
}

.timeline-status.已取消,
.timeline-status.打回,
.timeline-status.已拒绝,
.timeline-status.已没收 {
  color: #8E8E93;
  background: rgba(142, 142, 147, 0.08);
}

.empty-mini {
  text-align: center;
  padding: 20px;
  color: var(--t3, #8E8E93);
  font-size: 13px;
}

/* 底部操作 */
.profile-footer {
  display: flex;
  gap: 10px;
  padding: 16px;
  background: #fff;
  margin-top: auto;
  border-top: 1px solid var(--line, #F0F0F2);
}

.profile-footer .btn {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all .15s;
}

.profile-footer .btn.primary {
  background: var(--brand, #FF5B7F);
  color: #fff;
}
.profile-footer .btn.primary:hover { background: var(--brand-dark, #E0486B); }

.profile-footer .btn.secondary {
  background: var(--info-bg, #F2F2F7);
  color: var(--t2, #3A3A3C);
}
.profile-footer .btn.secondary:hover { background: var(--line2, #E5E5EA); }
</style>

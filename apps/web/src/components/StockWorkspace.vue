<template>
  <div class="stock-workspace">
    <!-- 头部 -->
    <div class="workspace-header">
      <button class="back-btn" @click="$emit('back')">← 返回</button>
      <h2 class="workspace-title">📦 批量清货</h2>
    </div>

    <!-- 分组列表 -->
    <div class="stock-groups">
      <!-- 超期组 -->
      <div v-if="groupedStock.overdue.length" class="stock-group">
        <div class="group-header" :class="{ checked: groupAllSelected('overdue') }" @click="toggleGroup('overdue')">
          <div class="checkbox" :class="{ checked: groupAllSelected('overdue'), partial: groupPartialSelected('overdue') }"></div>
          <span class="group-title overdue">超期（请尽快处理）</span>
          <span class="group-count">{{ groupedStock.overdue.length }}单</span>
        </div>
        <div class="group-items">
          <div 
            v-for="item in groupedStock.overdue" 
            :key="item.id"
            class="stock-card"
            :class="{ selected: selected.has(item.id) }"
            @click="toggleSelect(item.id)"
          >
            <div class="checkbox" :class="{ checked: selected.has(item.id) }"></div>
            <div class="stock-info">
              <div class="stock-name">{{ item.name }}</div>
              <div class="stock-meta">入囤{{ item.days }}天 · 超期{{ item.overDays }}天</div>
              <div class="stock-fee">仓费 ¥{{ item.overFee.toFixed(2) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 7天内到期组 -->
      <div v-if="groupedStock.soon.length" class="stock-group">
        <div class="group-header" :class="{ checked: groupAllSelected('soon') }" @click="toggleGroup('soon')">
          <div class="checkbox" :class="{ checked: groupAllSelected('soon'), partial: groupPartialSelected('soon') }"></div>
          <span class="group-title soon">7天内到期</span>
          <span class="group-count">{{ groupedStock.soon.length }}单</span>
        </div>
        <div class="group-items">
          <div 
            v-for="item in groupedStock.soon" 
            :key="item.id"
            class="stock-card"
            :class="{ selected: selected.has(item.id) }"
            @click="toggleSelect(item.id)"
          >
            <div class="checkbox" :class="{ checked: selected.has(item.id) }"></div>
            <div class="stock-info">
              <div class="stock-name">{{ item.name }}</div>
              <div class="stock-meta">入囤{{ item.days }}天 · 免费剩余{{ item.freeLeft }}天 ⚠</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 正常囤货组 -->
      <div v-if="groupedStock.normal.length" class="stock-group">
        <div class="group-header normal" @click="toggleGroupExpand('normal')">
          <div class="checkbox" :class="{ checked: groupAllSelected('normal'), partial: groupPartialSelected('normal') }" @click.stop="toggleGroup('normal')"></div>
          <span class="group-title normal">正常囤货（{{ groupedStock.normal.length }}单）</span>
          <span class="expand-icon">{{ expandedGroups.has('normal') ? '▼' : '▶' }}</span>
        </div>
        <div v-if="expandedGroups.has('normal')" class="group-items">
          <div 
            v-for="item in groupedStock.normal" 
            :key="item.id"
            class="stock-card"
            :class="{ selected: selected.has(item.id) }"
            @click="toggleSelect(item.id)"
          >
            <div class="checkbox" :class="{ checked: selected.has(item.id) }"></div>
            <div class="stock-info">
              <div class="stock-name">{{ item.name }}</div>
              <div class="stock-meta">入囤{{ item.days }}天 · 免费剩余{{ item.freeLeft }}天</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部结算条 -->
    <div class="action-bar">
      <div class="action-summary">
        <span>已选 {{ selected.size }} 单</span>
        <span class="action-total">预估 ¥{{ totalFee.toFixed(2) }}</span>
      </div>
      <div class="action-options">
        <select v-model="selectedFreight" class="action-select">
          <option value="">选择邮费</option>
          <option v-for="f in freights" :key="f.name" :value="f.name">{{ f.name }} ¥{{ f.amt }}</option>
        </select>
        <select v-model="selectedPack" class="action-select">
          <option value="">选择打包费</option>
          <option v-for="p in packs" :key="p.name" :value="p.name">{{ p.name }} ¥{{ p.amt }}</option>
        </select>
        <select v-model="selectedAddress" class="action-select">
          <option value="">请选择地址</option>
          <option v-for="addr in addresses" :key="addr.id" :value="addr.id">{{ addr.name }} {{ addr.phone }} {{ addr.detail }}</option>
        </select>
      </div>
      <button 
        class="btn-primary" 
        :disabled="selected.size === 0 || !selectedAddress"
        @click="submitClearing"
      >
        {{ submitButtonText }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  stockItems: { type: Array, default: () => [] },
  freights: { type: Array, default: () => [] },
  packs: { type: Array, default: () => [] },
  addresses: { type: Array, default: () => [] },
  preselectedId: { type: Number, default: null },
});

const emit = defineEmits(['back', 'submit']);

const selected = ref(new Set());
const expandedGroups = ref(new Set(['overdue', 'soon'])); // 修正#10：正常组默认折叠
const selectedFreight = ref('');
const selectedPack = ref('');
const selectedAddress = ref('');

// 初始化时自动勾选
if (props.preselectedId) {
  const item = props.stockItems.find(i => i.id === props.preselectedId);
  if (item) {
    selected.value.add(props.preselectedId);
  }
}

// 分组
const groupedStock = computed(() => {
  const overdue = [];
  const soon = [];
  const normal = [];
  
  for (const item of props.stockItems) {
    if (item.overDays > 0) {
      overdue.push(item);
    } else if (item.freeLeft <= 7) {
      soon.push(item);
    } else {
      normal.push(item);
    }
  }
  
  // 排序：超期按超期天数倒序，即将到期按剩余天数正序
  overdue.sort((a, b) => b.overDays - a.overDays);
  soon.sort((a, b) => a.freeLeft - b.freeLeft);
  normal.sort((a, b) => b.days - a.days);
  
  return { overdue, soon, normal };
});

// 总费用
const totalFee = computed(() => {
  let total = 0;
  for (const item of props.stockItems) {
    if (selected.value.has(item.id)) {
      total += item.overFee || 0;
    }
  }
  
  // 加邮费和打包费
  const freight = props.freights.find(f => f.name === selectedFreight.value);
  const pack = props.packs.find(p => p.name === selectedPack.value);
  if (freight) total += freight.amt || 0;
  if (pack) total += pack.amt || 0;
  
  return total;
});

// 提交按钮文案
const submitButtonText = computed(() => {
  if (selected.value.size === 0) return '请选择要清的囤货';
  if (!selectedAddress.value) return '请选择收货地址';
  return `发起清货（${selected.value.size}单 · ¥${totalFee.value.toFixed(2)}）`;
});

// 选择单个
function toggleSelect(id) {
  if (selected.value.has(id)) {
    selected.value.delete(id);
  } else {
    selected.value.add(id);
  }
  selected.value = new Set(selected.value);
}

// 分组全选
function toggleGroup(groupKey) {
  const items = groupedStock.value[groupKey];
  const allSelected = items.every(item => selected.value.has(item.id));
  
  if (allSelected) {
    // 全取消
    for (const item of items) {
      selected.value.delete(item.id);
    }
  } else {
    // 全选
    for (const item of items) {
      selected.value.add(item.id);
    }
  }
  selected.value = new Set(selected.value);
}

// 分组是否全选
function groupAllSelected(groupKey) {
  const items = groupedStock.value[groupKey];
  if (!items.length) return false;
  return items.every(item => selected.value.has(item.id));
}

// 分组是否部分选中
function groupPartialSelected(groupKey) {
  const items = groupedStock.value[groupKey];
  const selectedCount = items.filter(item => selected.value.has(item.id)).length;
  return selectedCount > 0 && selectedCount < items.length;
}

// 展开/收起分组
function toggleGroupExpand(groupKey) {
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey);
  } else {
    expandedGroups.value.add(groupKey);
  }
  expandedGroups.value = new Set(expandedGroups.value);
}

// 提交清货
function submitClearing() {
  if (selected.value.size === 0 || !selectedAddress.value) return;
  
  const selectedItems = props.stockItems.filter(i => selected.value.has(i.id));
  emit('submit', {
    items: selectedItems,
    freight: selectedFreight.value,
    pack: selectedPack.value,
    addressId: selectedAddress.value,
    total: totalFee.value,
  });
}
</script>

<style scoped>
.stock-workspace {
  min-height: 100vh;
  background: var(--bg, #FAFAFA);
  padding: 16px;
  padding-bottom: calc(180px + env(safe-area-inset-bottom));
}

.workspace-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 15px;
  color: var(--brand, #FF5B7F);
  cursor: pointer;
  padding: 4px;
}

.workspace-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  margin: 0;
}

/* 分组 */
.stock-group {
  margin-bottom: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  cursor: pointer;
  user-select: none;
}

.group-header .checkbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--line2, #E5E5EA);
  flex-shrink: 0;
  position: relative;
}

.group-header .checkbox.checked {
  background: var(--brand, #FF5B7F);
  border-color: var(--brand, #FF5B7F);
}

.group-header .checkbox.checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.group-header .checkbox.partial {
  background: var(--brand, #FF5B7F);
  border-color: var(--brand, #FF5B7F);
  opacity: 0.5;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}

.group-title.overdue {
  color: var(--status-warning, #FF3B30);
}

.group-title.soon {
  color: var(--status-pending, #FF9500);
}

.group-title.normal {
  color: var(--t3, #8E8E93);
}

.group-count {
  font-size: 12px;
  color: var(--t3, #8E8E93);
  margin-left: auto;
}

.expand-icon {
  font-size: 12px;
  color: var(--t3, #8E8E93);
  margin-left: 8px;
}

/* 囤货卡片 */
.stock-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--line, #F0F0F2);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  transition: all 0.1s;
}

.stock-card:active {
  background: var(--brand-bg2, #FFF5F7);
  transform: scale(0.98);
}

.stock-card.selected {
  background: var(--brand-bg2, #FFF5F7);
}

.stock-card .checkbox {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid var(--line2, #E5E5EA);
  flex-shrink: 0;
  margin-top: 2px;
  position: relative;
  transition: all 0.15s;
}

.stock-card .checkbox.checked {
  background: var(--brand, #FF5B7F);
  border-color: var(--brand, #FF5B7F);
}

.stock-card .checkbox.checked::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.stock-info {
  flex: 1;
  min-width: 0;
}

.stock-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1, #1C1C1E);
  line-height: 1.3;
}

.stock-meta {
  font-size: 13px;
  color: var(--t3, #8E8E93);
  margin-top: 4px;
}

.stock-fee {
  font-size: 14px;
  font-weight: 600;
  color: var(--status-warning, #FF3B30);
  margin-top: 4px;
}

/* 底部结算条 */
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #FFFFFF;
  border-top: 1px solid var(--line, #F0F0F2);
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 100;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.04);
}

.action-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--t2, #3A3A3C);
  margin-bottom: 10px;
}

.action-total {
  font-weight: 600;
  font-size: 16px;
  color: var(--t1, #1C1C1E);
}

.action-options {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.action-select {
  flex: 1;
  min-width: 100px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--line2, #E5E5EA);
  font-size: 13px;
  color: var(--t2, #3A3A3C);
  background: #FFFFFF;
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

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>

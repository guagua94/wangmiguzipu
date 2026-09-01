<template>
  <div class="group-workspace">
    <!-- 工具栏 -->
    <div class="gw-toolbar">
      <button class="btn mini gray" @click="goBack">← 返回系列列表</button>
      <button class="btn mini" @click="$emit('add-good')">＋ 添加谷子</button>
      <button class="btn gray mini" @click="$emit('export-matrix')">📤 导出谷子矩阵</button>
      <button class="btn gray mini" @click="$emit('export-members')">📤 导出团员汇总</button>
      <span style="margin-left:8px">🔢 批量调价</span>
      <select v-model.number="localPriceOp" style="width:auto">
        <option value="add">＋ 加</option>
        <option value="sub">－ 减</option>
        <option value="mul">× 乘</option>
        <option value="div">÷ 除</option>
      </select>
      <input v-model.number="localPriceVal" type="number" style="width:70px" />
      <button class="btn gray mini" @click="$emit('batch-price', { op: localPriceOp, val: localPriceVal })">批量调价</button>
    </div>

    <!-- 谷子矩阵 -->
    <div class="gw-section">
      <h3 class="gw-section-title">📦 谷子矩阵 <span class="count">{{ matrix.length }}</span></h3>
      <div v-if="!matrix.length" class="gw-empty">暂无谷子，点击「添加谷子」</div>
      <div v-for="m in matrix" :key="m.good.id" class="gw-matrix-row">
        <div class="gw-good-info">
          <div class="gw-good-name">
            <img v-if="m.good.img" :src="m.good.img" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid #eee" />
            <span v-else class="gw-good-emoji">{{ m.good.emoji || '🧸' }}</span>
            <b>{{ m.good.name }}</b>
            <span class="tag gray mini-tag">{{ m.good.cat || '未分类' }}</span>
          </div>
          <div class="gw-good-meta">
            <span>¥{{ m.good.price }}</span>
            <span class="muted">·</span>
            <span>已排 <b :class="{ 'text-warn': m.booked >= m.good.limit }">{{ m.booked }}</b>/{{ m.good.limit }}</span>
            <span class="muted">·</span>
            <span :class="m.remain <= 3 ? 'text-danger' : ''">余量 {{ m.remain }}</span>
          </div>
          <!-- 到货状态 -->
          <div class="gw-arrive">
            <select :value="String(m.good.arrived || false)" @change="$emit('mark-arrive', { goodId: m.good.id, arrived: $event.target.value === 'true' })" class="gw-arrive-select">
              <option value="false">未到货</option>
              <option value="true">已到货</option>
              <option value="partial">部分到货</option>
            </select>
          </div>
        </div>
        <!-- 团员排单明细 -->
        <div class="gw-members">
          <div v-if="!m.members.length" class="gw-no-members muted">暂无排单</div>
          <div v-for="mem in m.members" :key="mem.cn" class="gw-member-chip" :class="{ unpaid: mem.state === '待付款' }">
            <span class="gw-member-cn">{{ mem.cn }}</span>
            <span class="gw-member-qty">×{{ mem.qty }}</span>
            <span v-if="mem.seqs" class="gw-member-seqs">{{ mem.seqs }}</span>
            <span v-if="mem.state === '待付款'" class="gw-member-unpaid">未付</span>
          </div>
        </div>
        <!-- 操作按钮 -->
        <div class="gw-actions">
          <button class="btn mini gray" @click="$emit('edit-good', m.good)">✏️</button>
          <button class="btn mini gray" @click="$emit('cut-good', m.good)">✂️</button>
          <button class="btn mini gray" @click="$emit('delete-good', m.good)">🗑</button>
        </div>
      </div>
    </div>

    <!-- 团员汇总 -->
    <div class="gw-section">
      <h3 class="gw-section-title">👥 团员汇总 <span class="count">{{ memberSummary.length }}</span></h3>
      <div v-if="!memberSummary.length" class="gw-empty">暂无团员排单</div>
      <div class="gw-member-table" v-if="memberSummary.length">
        <table class="styled-table compact">
          <thead>
            <tr>
              <th>团员</th>
              <th>排单数</th>
              <th>总件数</th>
              <th>总金额</th>
              <th>未付款</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in memberSummary" :key="m.cn">
              <td><b>{{ m.cn }}</b></td>
              <td>{{ m.billCount }}</td>
              <td>{{ m.totalQty }}</td>
              <td class="price">¥{{ m.totalAmt.toFixed(2) }}</td>
              <td>
                <span v-if="m.unpaidCount" class="tag orange">{{ m.unpaidCount }}单</span>
                <span v-else class="tag green">已付清</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 催肾助手 -->
    <div v-if="unpaidReminders.length" class="gw-section gw-reminder-section">
      <h3 class="gw-section-title">⏰ 催肾助手 <span class="count warn">{{ unpaidReminders.length }}</span></h3>
      <p class="muted" style="font-size:12px;margin-bottom:10px">以下团员截团后尚未付款，建议尽快催收</p>
      <div v-for="r in unpaidReminders" :key="r.billId" class="gw-reminder-card" :class="{ overdue: r.overdue }">
        <div class="gw-reminder-info">
          <b>{{ r.cn }}</b>
          <span class="price">¥{{ r.total.toFixed(2) }}</span>
          <span class="muted">{{ r.items.length }}件</span>
          <span v-if="r.overdue" class="tag red">逾期3天+</span>
        </div>
        <div class="gw-reminder-actions">
          <button class="btn mini" @click="$emit('remind', r)">🔔 催肾</button>
          <button class="btn gray mini" @click="$emit('mark-paid', r)">✅ 已收</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  matrix: { type: Array, default: () => [] },
  memberSummary: { type: Array, default: () => [] },
  unpaidReminders: { type: Array, default: () => [] },
  priceOp: { type: String, default: 'mul' },
  priceVal: { type: Number, default: 0.9 },
});

const emit = defineEmits([
  'go-back', 'add-good', 'export-matrix', 'export-members',
  'batch-price', 'mark-arrive', 'edit-good', 'cut-good', 'delete-good',
  'remind', 'mark-paid'
]);

const localPriceOp = ref(props.priceOp);
const localPriceVal = ref(props.priceVal);

function goBack() {
  emit('go-back');
}
</script>

<style scoped>
.group-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gw-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.gw-toolbar select,
.gw-toolbar input {
  border: 1.5px solid var(--line2, #E5E5EA);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}

.gw-section {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}

.gw-section-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gw-section-title .count {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand, #FF5B7F);
  background: var(--brand-bg, #FFE4EA);
  padding: 2px 8px;
  border-radius: 10px;
}

.gw-section-title .count.warn {
  color: var(--danger, #FF3B30);
  background: var(--danger-bg, #FFEBEE);
}

.gw-empty {
  text-align: center;
  padding: 20px;
  color: var(--t3, #8E8E93);
  font-size: 13px;
}

/* 矩阵行 */
.gw-matrix-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 10px;
  background: var(--bg, #F2F2F7);
  margin-bottom: 8px;
}

.gw-good-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gw-good-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.gw-good-emoji {
  font-size: 18px;
}

.mini-tag {
  font-size: 10px !important;
  padding: 1px 6px !important;
  border-radius: 6px !important;
}

.gw-good-meta {
  display: flex;
  gap: 4px;
  font-size: 12px;
  color: var(--t2, #3A3A3C);
}

.text-warn {
  color: var(--warning, #FF9500);
}

.text-danger {
  color: var(--danger, #FF3B30);
  font-weight: 600;
}

.gw-arrive-select {
  font-size: 11px;
  border: 1px solid var(--line2, #E5E5EA);
  border-radius: 6px;
  padding: 3px 6px;
  width: fit-content;
}

.gw-members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 300px;
}

.gw-no-members {
  font-size: 12px;
}

.gw-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #fff;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--line, #F0F0F2);
}

.gw-member-chip.unpaid {
  border-color: var(--warning, #FF9500);
  background: var(--warning-bg, #FFF5E6);
}

.gw-member-cn {
  font-weight: 600;
}

.gw-member-qty {
  color: var(--brand, #FF5B7F);
  font-weight: 600;
}

.gw-member-seqs {
  color: var(--t3, #8E8E93);
  font-size: 10px;
}

.gw-member-unpaid {
  color: var(--warning, #FF9500);
  font-weight: 600;
  font-size: 10px;
}

.gw-actions {
  display: flex;
  gap: 4px;
}

/* 团员表格 */
.gw-member-table {
  overflow-x: auto;
}

.styled-table.compact {
  font-size: 12px;
}

.styled-table.compact th,
.styled-table.compact td {
  padding: 6px 8px;
}

/* 催肾助手 */
.gw-reminder-section {
  border: 1.5px solid var(--warning, #FF9500);
  background: var(--warning-bg, #FFF5E6);
}

.gw-reminder-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.gw-reminder-card.overdue {
  border: 1.5px solid var(--danger, #FF3B30);
}

.gw-reminder-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.gw-reminder-actions {
  display: flex;
  gap: 6px;
}
</style>

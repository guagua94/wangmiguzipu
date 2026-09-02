// 后台待办收件箱聚合逻辑
// 输入：6种待审核数据源，输出：按紧急度分组的待办节点

export interface AdminTodoItem {
  id: string;
  type: 'bill' | 'sale' | 'after' | 'deposit' | 'cancel' | 'withdraw';
  typeLabel: string;
  icon: string;
  cn: string;
  title: string;
  subtitle: string;
  detail: string;
  amount: number;
  useBalanceAmount?: number;
  screenshot?: string;
  createdAt: string;
  urgencyLevel: number; // 0-3
  statusColor: string;
  /** 即将超时的剩余小时数（null=不超时） */
  deadlineHoursLeft?: number;
  /** 是否支持批量勾选 */
  batchable: boolean;
  raw: any;
}

export interface AdminGroupedTodos {
  urgent: AdminTodoItem[];      // 即将超时（24h内）
  today: AdminTodoItem[];       // 今日待审（提交时间在24h内，但不超时）
  normal: AdminTodoItem[];       // 普通待审
  totalCount: number;
}

const BILL_PAY_DEADLINE_HOURS = 7 * 24;   // 肾表提交后7天付款截止
const SALE_PAY_DEADLINE_HOURS = 7 * 24;   // 直售付款审核
const WITHDRAW_DEADLINE_HOURS = 7 * 24;   // 提现7天处理
const CANCEL_DEADLINE_HOURS = 48;          // 取消申请48h

const URGENCY = {
  URGENT: 3,   // 即将超时（红色）
  TODAY: 2,     // 今日新提交（橙色）
  NORMAL: 0,    // 普通（蓝色/灰色）
};

const COLORS = {
  urgent: '#FF3B30',
  today: '#FF9500',
  normal: '#8E8E93',
};

function fmtDate(ts: string | number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hoursSince(ts: string | number): number {
  return (Date.now() - new Date(ts).getTime()) / 3600000;
}

function getUrgencyLevel(createdAt: string, deadlineHours: number): { level: number; hoursLeft: number | undefined } {
  const hours = hoursSince(createdAt);
  const hoursLeft = Math.max(0, deadlineHours - hours);
  if (hoursLeft <= 24) return { level: URGENCY.URGENT, hoursLeft: Math.round(hoursLeft) };
  if (hours <= 24) return { level: URGENCY.TODAY, hoursLeft: undefined };
  return { level: URGENCY.NORMAL, hoursLeft: undefined };
}

export function buildAdminTodos(
  pendingBills: any[],
  pendingSales: any[],
  pendingAfters: any[],
  pendingDeposits: any[],
  pendingCancelSales: any[],
  pendingWithdraws: any[],
  shopCfg?: any
): AdminGroupedTodos {
  const items: AdminTodoItem[] = [];

  // 1. 肾表审核
  pendingBills.forEach(b => {
    const { level, hoursLeft } = getUrgencyLevel(b.createdAt || b.paidAt, BILL_PAY_DEADLINE_HOURS);
    items.push({
      id: `bill-${b.id}`,
      type: 'bill',
      typeLabel: '付款审核',
      icon: '📋',
      cn: b.cn || '',
      title: b.seriesName || '拼团肾表',
      subtitle: `¥${b.total || 0}`,
      detail: `提交于 ${fmtDate(b.createdAt || b.paidAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(b.total || 0),
      useBalanceAmount: b.useBalanceAmount || 0,
      screenshot: b.screenshot,
      createdAt: b.createdAt || b.paidAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: b,
    });
  });

  // 2. 直售付款审核
  pendingSales.forEach(o => {
    const { level, hoursLeft } = getUrgencyLevel(o.createdAt, SALE_PAY_DEADLINE_HOURS);
    items.push({
      id: `sale-${o.id}`,
      type: 'sale',
      typeLabel: '清货审核',
      icon: '🛒',
      cn: o.cn || '',
      title: `订单#${o.id}`,
      subtitle: `¥${o.total || 0}${o.blindShipMode ? ' · ' + (o.blindShipMode === 'video' ? '📹视频拆开' : '🎲随机不拆') : ''}`,
      detail: `提交于 ${fmtDate(o.createdAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(o.total || 0),
      useBalanceAmount: o.useBalanceAmount || 0,
      screenshot: o.screenshot,
      createdAt: o.createdAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: o,
    });
  });

  // 3. 售后审核
  pendingAfters.forEach(a => {
    const { level, hoursLeft } = getUrgencyLevel(a.createdAt, 72); // 售后72h
    items.push({
      id: `after-${a.id}`,
      type: 'after',
      typeLabel: '售后处理',
      icon: '🔄',
      cn: a.cn || '',
      title: `${a.type || '售后'} ${a.goods || ''}`,
      subtitle: a.way || '',
      detail: `申请于 ${fmtDate(a.createdAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(a.refundAmount || 0),
      createdAt: a.createdAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: a,
    });
  });

  // 4. 保证金审核
  pendingDeposits.forEach(d => {
    const { level, hoursLeft } = getUrgencyLevel(d.createdAt, 48);
    items.push({
      id: `deposit-${d.id}`,
      type: 'deposit',
      typeLabel: '付款审核',
      icon: '💰',
      cn: d.cn || '',
      title: `拍卖#${d.auctionId}`,
      subtitle: `¥${d.amount || 0}`,
      detail: `缴纳于 ${fmtDate(d.createdAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(d.amount || 0),
      screenshot: d.screenshot,
      createdAt: d.createdAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: d,
    });
  });

  // 5. 直售取消审核
  pendingCancelSales.forEach(c => {
    const { level, hoursLeft } = getUrgencyLevel(c.createdAt || c.cancelledAt, CANCEL_DEADLINE_HOURS);
    items.push({
      id: `cancel-${c.id}`,
      type: 'cancel',
      typeLabel: '转单审核',
      icon: '❌',
      cn: c.cn || '',
      title: `订单#${c.id}`,
      subtitle: `¥${c.total || 0}`,
      detail: `申请于 ${fmtDate(c.createdAt || c.cancelledAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(c.total || 0),
      createdAt: c.createdAt || c.cancelledAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: c,
    });
  });

  // 6. 提现审核
  pendingWithdraws.forEach(w => {
    const { level, hoursLeft } = getUrgencyLevel(w.createdAt, WITHDRAW_DEADLINE_HOURS);
    items.push({
      id: `withdraw-${w.id}`,
      type: 'withdraw',
      typeLabel: '提现处理',
      icon: '💸',
      cn: w.cn || '',
      title: `¥${w.amount || 0}`,
      subtitle: w.method || '微信/支付宝',
      detail: `申请于 ${fmtDate(w.createdAt)}${hoursLeft !== undefined ? ` · 剩 ${hoursLeft}h` : ''}`,
      amount: +(w.amount || 0),
      createdAt: w.createdAt,
      urgencyLevel: level,
      statusColor: COLORS[level === URGENCY.URGENT ? 'urgent' : level === URGENCY.TODAY ? 'today' : 'normal'],
      deadlineHoursLeft: hoursLeft,
      batchable: true,
      raw: w,
    });
  });

  // 排序：紧急度降序 > 创建时间升序（先超期的排在前面）
  items.sort((a, b) => {
    if (b.urgencyLevel !== a.urgencyLevel) return b.urgencyLevel - a.urgencyLevel;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    urgent: items.filter(i => i.urgencyLevel === URGENCY.URGENT),
    today: items.filter(i => i.urgencyLevel === URGENCY.TODAY),
    normal: items.filter(i => i.urgencyLevel === URGENCY.NORMAL),
    totalCount: items.length,
  };
}

// ========== 预警中心 ==========

export interface AlertItem {
  id: string;
  level: 'critical' | 'warning' | 'info';
  type: string;
  icon: string;
  title: string;
  detail: string;
  action: string;    // 跳转目标或操作描述
  raw: any;
}

const OVER_STOCK_DAYS = 90;    // 囤货超90天
const BILL_PAY_DEADLINE_DAYS = 7; // 肾表7天未付款
const AUCTION_PAY_DEADLINE_HOURS = 24; // 拍卖付款24h超时

function getStockDays(o: any): number {
  const base = o.paidAt || o.stockSince || o.createdAt;
  if (!base) return 0;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
}

export function buildAlerts(
  allBills: any[],          // 所有肾表（不只pending）
  allOrders: any[],         // 所有订单（含拍卖order）
  allSales: any[],           // 所有直售
  allAuctions: any[],       // 所有拍卖
  allUsers: any[],          // 所有会员
  shopCfg?: any
): AlertItem[] {
  const alerts: AlertItem[] = [];

  // 1. 囤货超90天未清货
  allOrders.forEach(o => {
    if (o.status === '囤货中' || o.state === '已销账') {
      const days = getStockDays(o);
      if (days > OVER_STOCK_DAYS) {
        alerts.push({
          id: `overstock-${o.id}`,
          level: 'critical',
          type: '囤货超期',
          icon: '📦',
          title: `${o.cn || ''} · ${compactItems(o.items || o.name || o.seriesName || '商品')}`,
          detail: `入囤 ${days} 天，超过 ${OVER_STOCK_DAYS} 天未清货`,
          action: '清货/转单管理',
          raw: o,
        });
      }
    }
  });

  // 2. 截团后肾表超7天未付款
  allBills.forEach(b => {
    if (b.state === '待付款' && b.seriesStatus === '已截团') {
      const days = Math.floor(hoursSince(b.createdAt || b.paidAt) / 24);
      if (days > BILL_PAY_DEADLINE_DAYS) {
        alerts.push({
          id: `bill-overdue-${b.id}`,
          level: 'critical',
          type: '肾表超期',
          icon: '⏰',
          title: `${b.cn || ''} · ${b.seriesName || '拼团'}`,
          detail: `截团后 ${days} 天仍未付款（截止 ${BILL_PAY_DEADLINE_DAYS} 天）`,
          action: '拼团管理',
          raw: b,
        });
      }
    }
  });

  // 3. 拍卖付款超时24h未处理
  allAuctions.forEach(a => {
    if (a.state === '待付款' && a.wonAt) {
      const hours = hoursSince(a.wonAt);
      if (hours > AUCTION_PAY_DEADLINE_HOURS) {
        alerts.push({
          id: `auction-overdue-${a.id}`,
          level: 'critical',
          type: '拍卖超时',
          icon: '⏳',
          title: `拍卖#${a.id} · ${a.name || ''}`,
          detail: `中标已 ${Math.floor(hours)} 小时未付款（超时 ${AUCTION_PAY_DEADLINE_HOURS}h）`,
          action: '拍卖管理',
          raw: a,
        });
      }
    }
  });

  // 4. 用户余额为负
  allUsers.forEach(u => {
    if ((u.balance || 0) < 0) {
      alerts.push({
        id: `neg-balance-${u.id}`,
        level: 'warning',
        type: '余额异常',
        icon: '💳',
        title: `${u.cn || u.account || ''}`,
        detail: `余额 ¥${u.balance.toFixed(2)} 为负数`,
        action: '会员管理',
        raw: u,
      });
    }
  });

  // 5. 库存<=3的直售商品
  allSales.forEach(g => {
    if (g.stock <= 3 && g.status !== '下架') {
      alerts.push({
        id: `low-stock-${g.id}`,
        level: g.stock === 0 ? 'critical' : 'warning',
        type: '库存告急',
        icon: '📉',
        title: g.name || '',
        detail: `库存仅 ${g.stock} 件（已售出 ${g.soldCount || 0} 件）`,
        action: '直售管理',
        raw: g,
      });
    }
  });

  // 排序：critical > warning > info
  const levelOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return alerts;
}

function compactItems(items: any[]): string {
  if (!items || !items.length) return '';
  const map = new Map();
  for (const it of items) {
    const name = it.name || '商品';
    map.set(name, (map.get(name) || 0) + (it.qty || 1));
  }
  return [...map.entries()].map(([name, qty]) => name + (qty > 1 ? `×${qty}` : '')).join('、');
}

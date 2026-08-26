// 前端 Timeline 数据聚合逻辑
// 基于 loadMe() 已加载的数据进行聚合

export interface TimelineNode {
  id: string;
  type: 'group' | 'sale' | 'auction' | 'transfer' | 'clearing' | 'aftersale';
  icon: string;
  title: string;
  subtitle: string;
  detailLine?: string;
  deadlineAt: number | null;
  statusColor: string;
  nextEventType: string;
  urgencyLevel: number; // 0-3
  linkAction: string;
  autoSelectId?: number;
  raw?: any;
}

export interface ActiveGroupCard {
  billId: number;
  seriesName: string;
  totalItems: number;
  deadlineAt: number | null;
  state: string;
  statusColor: string;
  progressText?: string;
}

export interface TimelineStats {
  pendingClearing: number;
  pendingPayment: number;
  pendingTransfer: number;
  pendingReceive: number;
  activeGroups: number;
}

export interface TimelineData {
  stats: TimelineStats;
  activeGroups: ActiveGroupCard[];
  nodes: TimelineNode[];
}

// 紧急度权重
const URGENCY = {
  OVERDUE: 3,      // 超期清货/超期囤货（红色）
  PENDING_PAY: 2,  // 待付款/中标待付款（橙色）
  DEADLINE: 1,     // 截团/截拍/即将到期（紫色）
  NORMAL: 0,       // 正常进行中（蓝色/绿色）
};

// 状态色
const COLORS = {
  pending: '#FF9500',
  active: '#007AFF',
  done: '#34C759',
  warning: '#FF3B30',
  deadline: '#5856D6',
};

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getRemainingText(deadlineAt: number): string {
  const now = Date.now();
  const diff = deadlineAt - now;
  if (diff <= 0) return '已截止';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '即将截止';
  if (hours < 24) return `${hours}小时后`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  return `${days}天后`;
}

function getStockDays(orderOrAuction: any): number {
  const base = orderOrAuction.paidAt || orderOrAuction.stockSince || orderOrAuction.createdAt;
  if (!base) return 0;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
}

function calcOverFee(item: any, freeDays: number, unitFee: number): number {
  const days = getStockDays(item);
  const overDays = Math.max(0, days - freeDays);
  if (overDays <= 0) return 0;
  const price = item.total || item.curPrice || item.price || 0;
  return +(price * unitFee * overDays).toFixed(2);
}

// 修正#3：按系列聚合拼团节点
function aggregateGroupItems(bill: any): { title: string; totalQty: number; detailText: string } {
  const items = bill.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (it.qty || 1), 0);
  if (totalQty === 0) return { title: bill.seriesName, totalQty: 0, detailText: '' };
  
  const firstItem = items[0];
  const displayTitle = totalQty > 1 
    ? `${firstItem.name}等${totalQty}件`
    : firstItem.name;
  
  return { title: displayTitle, totalQty, detailText: displayTitle };
}

// 修正#4：直售多件显示
function aggregateSaleItems(order: any): string {
  const items = order.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (it.qty || 1), 0);
  if (totalQty === 0) return '未命名';
  if (totalQty === 1) return items[0]?.name || '未命名';
  return `${items[0]?.name || '商品'}等${totalQty}件`;
}

// 修正#9：计算成配进度
function getGroupProgress(bill: any, seriesGoods?: any[]): string | undefined {
  if (!bill.items || !seriesGoods) return undefined;
  
  const progressItems: string[] = [];
  for (const item of bill.items) {
    const good = seriesGoods.find((g: any) => g.id === item.goodId);
    if (!good) continue;
    const booked = good.booked || 0;
    const limit = good.limit || 0;
    const remaining = Math.max(0, limit - booked);
    
    if (remaining <= 0) {
      progressItems.push(`${item.name} 已满配`);
    } else if (remaining <= 3) {
      progressItems.push(`${item.name} 差${remaining}个成配 ⚠`);
    }
  }
  
  if (progressItems.length === 0) {
    // 没有紧急的，显示总体
    const totalBooked = seriesGoods.reduce((s: number, g: any) => s + (g.booked || 0), 0);
    const totalLimit = seriesGoods.reduce((s: number, g: any) => s + (g.limit || 0), 0);
    return `总排${totalBooked}/${totalLimit}`;
  }
  
  return progressItems.join(' · ');
}

export function buildTimeline(
  myBills: any[],
  myBuys: any[],
  myAuctionOrders: any[],
  myTransfers: any[],
  myClears: any[],
  notis: any[],
  shopCfg: any,
  seriesList?: any[],
): TimelineData {
  const nodes: TimelineNode[] = [];
  const activeGroups: ActiveGroupCard[] = [];

  const groupFreeDays = shopCfg?.groupFreeDays || 30;
  const saleFreeDays = shopCfg?.saleFreeDays || 7;
  const groupOverFee = shopCfg?.groupOverFee || 0.1;
  const saleOverFee = shopCfg?.saleOverFee || 0.1;

  // ===== 1. 进行中拼团 → 常驻栏 + Timeline 节点 =====
  for (const bill of myBills || []) {
    const totalItems = (bill.items || []).reduce((sum: number, it: any) => sum + (it.qty || 1), 0);
    
    // 常驻栏数据
    activeGroups.push({
      billId: bill.id,
      seriesName: bill.seriesName,
      totalItems,
      deadlineAt: bill.deadlineAt ? new Date(bill.deadlineAt).getTime() : null,
      state: bill.deadlineAt ? '进行中' : '截团待定',
      statusColor: bill.deadlineAt ? COLORS.active : COLORS.deadline,
      progressText: getGroupProgress(bill, seriesList?.find((s: any) => s.id === bill.seriesId)?.goods),
    });

    // 修正#2：有 deadline 的拼团按时间排序；无 deadline 的放截团待定
    if (bill.state === '进行中' && !bill.deadlineAt) {
      // 手动截团，放截团待定分组
      nodes.push({
        id: `bill-pending-${bill.id}`,
        type: 'group',
        icon: '🟣',
        title: bill.seriesName,
        subtitle: `已排${totalItems}件 · 截团时间待定`,
        deadlineAt: null,
        statusColor: COLORS.deadline,
        nextEventType: '截团待定',
        urgencyLevel: URGENCY.NORMAL,
        linkAction: 'group',
        raw: bill,
      });
    }
  }

  // 截团后待付款的拼团
  for (const bill of myBills || []) {
    if (bill.state !== '待付款') continue;
    
    const { title, totalQty } = aggregateGroupItems(bill);
    const progress = getGroupProgress(bill, seriesList?.find((s: any) => s.id === bill.seriesId)?.goods);
    
    // 修正#9：显示成配进度
    const detailLine = progress;
    
    nodes.push({
      id: `bill-${bill.id}`,
      type: 'group',
      icon: '🟠',
      title: bill.seriesName,
      subtitle: `${title} · 截团待付款`,
      detailLine,
      deadlineAt: new Date(bill.createdAt).getTime() + 48 * 3600 * 1000,
      statusColor: COLORS.pending,
      nextEventType: '截团待付款',
      urgencyLevel: URGENCY.PENDING_PAY,
      linkAction: 'orders',
      autoSelectId: bill.id,
      raw: bill,
    });
  }

  // ===== 2. 直售：待付款 =====
  for (const order of myBuys || []) {
    if (order.status !== '待付款') continue;
    if (order.seriesId && +order.seriesId !== 0) continue; // 拼团类已在上面处理
    
    const title = aggregateSaleItems(order);
    
    nodes.push({
      id: `order-${order.id}`,
      type: 'sale',
      icon: '🟠',
      title,
      subtitle: `待付款 · ¥${order.total}`,
      deadlineAt: new Date(order.createdAt).getTime() + 24 * 3600 * 1000,
      statusColor: COLORS.pending,
      nextEventType: '付款截止',
      urgencyLevel: URGENCY.PENDING_PAY,
      linkAction: 'orders',
      autoSelectId: order.id,
      raw: order,
    });
  }

  // ===== 3. 拍卖：全面覆盖（修正#5） =====
  for (const auction of myAuctionOrders || []) {
    // 3.1 竞拍中
    if (auction.state === '拍卖中') {
      nodes.push({
        id: `auction-bid-${auction.id}`,
        type: 'auction',
        icon: '🟣',
        title: auction.name,
        subtitle: `${getRemainingText(auction.endAt)}截拍 · 当前出价 ¥${auction.curPrice || auction.startPrice}`,
        deadlineAt: new Date(auction.endAt).getTime(),
        statusColor: COLORS.deadline,
        nextEventType: '截拍提醒',
        urgencyLevel: URGENCY.DEADLINE,
        linkAction: 'auction',
        raw: auction,
      });
    }
    
    // 3.2 中标待付款（最高优先级）
    if (auction.state === '待付款' && auction.isWinner) {
      const wonAt = auction.wonAt ? new Date(auction.wonAt).getTime() : Date.now();
      nodes.push({
        id: `auction-pay-${auction.id}`,
        type: 'auction',
        icon: '🟠',
        title: auction.name,
        subtitle: `中标待付款 · ¥${auction.curPrice}`,
        detailLine: `${getRemainingText(wonAt + 24 * 3600 * 1000)}内付款`,
        deadlineAt: wonAt + 24 * 3600 * 1000,
        statusColor: COLORS.pending,
        nextEventType: '中标待付款',
        urgencyLevel: URGENCY.PENDING_PAY,
        linkAction: 'auction',
        autoSelectId: auction.id,
        raw: auction,
      });
    }
    
    // 3.3 囤货中/超期
    if (auction.state === '囤货中' || auction.state === '已付款') {
      const days = getStockDays(auction);
      const overDays = Math.max(0, days - saleFreeDays);
      const freeLeft = Math.max(0, saleFreeDays - days);
      
      let subtitle: string;
      let statusColor: string;
      let urgency: number;
      let icon: string;
      let nextEvent: string;
      
      if (overDays > 0) {
        const fee = calcOverFee(auction, saleFreeDays, saleOverFee);
        subtitle = `入囤${days}天 · 超期${overDays}天 · 仓费¥${fee}`;
        statusColor = COLORS.warning;
        urgency = URGENCY.OVERDUE;
        icon = '🔴';
        nextEvent = '超期清货';
      } else if (freeLeft <= 3) {
        subtitle = `入囤${days}天 · 免费剩余${freeLeft}天 ⚠`;
        statusColor = COLORS.pending;
        urgency = URGENCY.DEADLINE;
        icon = '🟠';
        nextEvent = '即将到期';
      } else {
        subtitle = `入囤${days}天 · 免费剩余${freeLeft}天`;
        statusColor = COLORS.active;
        urgency = URGENCY.NORMAL;
        icon = '🔵';
        nextEvent = '正常囤货';
      }
      
      nodes.push({
        id: `stock-auction-${auction.id}`,
        type: 'auction',
        icon,
        title: auction.name,
        subtitle,
        deadlineAt: auction.paidAt ? new Date(auction.paidAt).getTime() + saleFreeDays * 24 * 3600 * 1000 : Date.now() + 30 * 24 * 3600 * 1000,
        statusColor,
        nextEventType: nextEvent,
        urgencyLevel: urgency,
        linkAction: 'stock',
        autoSelectId: auction.id,
        raw: auction,
      });
    }
    
    // 3.4 流拍退款（已完成分组）
    if (auction.state === '流拍' && auction.depositRefunded) {
      nodes.push({
        id: `auction-refund-${auction.id}`,
        type: 'auction',
        icon: '🟢',
        title: auction.name,
        subtitle: `已流拍 · 保证金¥${auction.depositAmount || 0}已退余额`,
        deadlineAt: Date.now(),
        statusColor: COLORS.done,
        nextEventType: '退款完成',
        urgencyLevel: URGENCY.NORMAL,
        linkAction: 'balance',
        raw: auction,
      });
    }
  }

  // ===== 4. 囤货中（拼团 + 直售） =====
  // 拼团囤货
  for (const order of myBuys || []) {
    if (!order.seriesId || +order.seriesId === 0) continue;
    if (order.status !== '囤货中') continue;
    
    const days = getStockDays(order);
    const overDays = Math.max(0, days - groupFreeDays);
    const freeLeft = Math.max(0, groupFreeDays - days);
    
    let subtitle: string;
    let statusColor: string;
    let urgency: number;
    let icon: string;
    let nextEvent: string;
    
    if (overDays > 0) {
      const fee = calcOverFee(order, groupFreeDays, groupOverFee);
      subtitle = `入囤${days}天 · 超期${overDays}天 · 仓费¥${fee}`;
      statusColor = COLORS.warning;
      urgency = URGENCY.OVERDUE;
      icon = '🔴';
      nextEvent = '超期清货';
    } else if (freeLeft <= 7) {
      subtitle = `入囤${days}天 · 免费剩余${freeLeft}天 ⚠`;
      statusColor = COLORS.pending;
      urgency = URGENCY.DEADLINE;
      icon = '🟠';
      nextEvent = '即将到期';
    } else {
      subtitle = `入囤${days}天 · 免费剩余${freeLeft}天`;
      statusColor = COLORS.active;
      urgency = URGENCY.NORMAL;
      icon = '🔵';
      nextEvent = '正常囤货';
    }
    
    const title = order.seriesName || (order.items?.[0]?.name) || '未命名';
    
    nodes.push({
      id: `stock-group-${order.id}`,
      type: 'group',
      icon,
      title,
      subtitle,
      deadlineAt: order.paidAt ? new Date(order.paidAt).getTime() + groupFreeDays * 24 * 3600 * 1000 : Date.now() + 30 * 24 * 3600 * 1000,
      statusColor,
      nextEventType: nextEvent,
      urgencyLevel: urgency,
      linkAction: 'stock',
      autoSelectId: order.id,
      raw: order,
    });
  }
  
  // 直售囤货
  for (const order of myBuys || []) {
    if (+order.seriesId !== 0 || order.status !== '囤货中') continue;
    
    const days = getStockDays(order);
    const overDays = Math.max(0, days - saleFreeDays);
    const freeLeft = Math.max(0, saleFreeDays - days);
    
    let subtitle: string;
    let statusColor: string;
    let urgency: number;
    let icon: string;
    let nextEvent: string;
    
    if (overDays > 0) {
      const fee = calcOverFee(order, saleFreeDays, saleOverFee);
      subtitle = `入囤${days}天 · 超期${overDays}天 · 仓费¥${fee}`;
      statusColor = COLORS.warning;
      urgency = URGENCY.OVERDUE;
      icon = '🔴';
      nextEvent = '超期清货';
    } else if (freeLeft <= 3) {
      subtitle = `入囤${days}天 · 免费剩余${freeLeft}天 ⚠`;
      statusColor = COLORS.pending;
      urgency = URGENCY.DEADLINE;
      icon = '🟠';
      nextEvent = '即将到期';
    } else {
      subtitle = `入囤${days}天 · 免费剩余${freeLeft}天`;
      statusColor = COLORS.active;
      urgency = URGENCY.NORMAL;
      icon = '🔵';
      nextEvent = '正常囤货';
    }
    
    const title = aggregateSaleItems(order);
    
    nodes.push({
      id: `stock-sale-${order.id}`,
      type: 'sale',
      icon,
      title,
      subtitle,
      deadlineAt: order.paidAt ? new Date(order.paidAt).getTime() + saleFreeDays * 24 * 3600 * 1000 : Date.now() + 30 * 24 * 3600 * 1000,
      statusColor,
      nextEventType: nextEvent,
      urgencyLevel: urgency,
      linkAction: 'stock',
      autoSelectId: order.id,
      raw: order,
    });
  }

  // ===== 5. 转单 =====
  for (const t of myTransfers || []) {
    if (!['待接收者确认', '待管理员审核', '待接收者付款'].includes(t.state)) continue;
    
    nodes.push({
      id: `transfer-${t.id}`,
      type: 'transfer',
      icon: '🟠',
      title: t.name || `转单 #${t.id}`,
      subtitle: `${t.fromCn || '未知'} → ${t.toCn || '未知'} · ${t.state}`,
      deadlineAt: t.deadline ? new Date(t.deadline).getTime() : Date.now() + 24 * 3600 * 1000,
      statusColor: COLORS.pending,
      nextEventType: t.state,
      urgencyLevel: URGENCY.PENDING_PAY,
      linkAction: 'transfer',
      raw: t,
    });
  }

  // ===== 6. 清货单 =====
  for (const c of myClears || []) {
    if (!['待付款', '已发货'].includes(c.state)) continue;
    
    nodes.push({
      id: `clearing-${c.id}`,
      type: 'clearing',
      icon: c.state === '待付款' ? '🟠' : '🔵',
      title: `清货单 #${c.id}`,
      subtitle: `${c.state} · ¥${c.total || 0}`,
      deadlineAt: c.state === '待付款' 
        ? Date.now() + 24 * 3600 * 1000 
        : Date.now() + 7 * 24 * 3600 * 1000,
      statusColor: c.state === '待付款' ? COLORS.pending : COLORS.active,
      nextEventType: c.state,
      urgencyLevel: c.state === '待付款' ? URGENCY.PENDING_PAY : URGENCY.NORMAL,
      linkAction: 'stock',
      raw: c,
    });
  }

  // ===== 修正#8：二级排序 =====
  // 第一级：时间升序（null 的放最后）
  // 第二级：紧急度降序（同时间时紧急的在前）
  nodes.sort((a, b) => {
    const timeA = a.deadlineAt ?? Number.MAX_SAFE_INTEGER;
    const timeB = b.deadlineAt ?? Number.MAX_SAFE_INTEGER;
    if (timeA !== timeB) return timeA - timeB;
    return b.urgencyLevel - a.urgencyLevel;
  });

  // 把 deadlineAt = null 的节点移到末尾（截团待定）
  const timeNodes = nodes.filter(n => n.deadlineAt !== null);
  const pendingNodes = nodes.filter(n => n.deadlineAt === null);
  const sortedNodes = [...timeNodes, ...pendingNodes];

  // 统计
  const pendingClearing = sortedNodes.filter(n => 
    n.urgencyLevel === URGENCY.OVERDUE || 
    (n.urgencyLevel === URGENCY.DEADLINE && n.type !== 'auction')
  ).length;
  
  const pendingPayment = sortedNodes.filter(n => 
    n.urgencyLevel === URGENCY.PENDING_PAY
  ).length;
  
  const pendingTransfer = (myTransfers || []).filter((t: any) => 
    t.state === '待接收者确认'
  ).length;
  
  const pendingReceive = (myClears || []).filter((c: any) => 
    c.state === '已发货'
  ).length;

  return {
    stats: {
      pendingClearing,
      pendingPayment,
      pendingTransfer,
      pendingReceive,
      activeGroups: activeGroups.length,
    },
    activeGroups,
    nodes: sortedNodes,
  };
}

// 分组函数
export function groupNodesByTime(nodes: TimelineNode[]): { label: string; nodes: TimelineNode[] }[] {
  const groups: { label: string; nodes: TimelineNode[] }[] = [];
  const now = Date.now();
  
  const today: TimelineNode[] = [];
  const tomorrow: TimelineNode[] = [];
  const thisWeek: TimelineNode[] = [];
  const later: TimelineNode[] = [];
  const pending: TimelineNode[] = [];
  const done: TimelineNode[] = [];
  
  for (const node of nodes) {
    if (node.statusColor === '#34C759') {
      done.push(node);
      continue;
    }
    
    if (node.deadlineAt === null) {
      pending.push(node);
      continue;
    }
    
    const diff = node.deadlineAt - now;
    if (diff <= 0) {
      today.push(node); // 已到期但状态未更新
    } else if (diff < 24 * 3600 * 1000) {
      today.push(node);
    } else if (diff < 48 * 3600 * 1000) {
      tomorrow.push(node);
    } else if (diff < 7 * 24 * 3600 * 1000) {
      thisWeek.push(node);
    } else {
      later.push(node);
    }
  }
  
  if (today.length) groups.push({ label: '今天', nodes: today });
  if (tomorrow.length) groups.push({ label: '明天', nodes: tomorrow });
  if (thisWeek.length) groups.push({ label: '本周', nodes: thisWeek });
  if (later.length) groups.push({ label: '稍后', nodes: later });
  if (pending.length) groups.push({ label: '截团待定', nodes: pending });
  if (done.length) groups.push({ label: '已完成', nodes: done });
  
  return groups;
}

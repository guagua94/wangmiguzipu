// 后台会员管理 — 客户画像聚合逻辑

export interface CustomerProfile {
  userId: number;
  cn: string;
  account: string;
  qq?: string;
  wechat?: string;
  balance: number;
  banned: boolean;
  role: string;
  
  // 消费统计
  totalSpent: number;
  totalOrders: number;
  groupOrdersCount: number;
  saleOrdersCount: number;
  auctionOrdersCount: number;
  avgOrderAmount: number;
  
  // 活跃度
  activeLevel: '高频' | '中频' | '低频' | '沉睡';
  daysSinceLastOrder: number;
  firstOrderDate?: string;
  lastOrderDate?: string;
  
  // 当前待办
  pendingTodos: ProfileTodo[];
  pendingTodoCount: number;
  
  // 囤货情况
  stockCount: number;
  stockValue: number;
  stockOver90: number; // 超90天
  
  // 时间线
  timeline: ProfileTimelineEvent[];
}

export interface ProfileTodo {
  type: string;
  title: string;
  detail: string;
  amount: number;
  urgency: number;
}

export interface ProfileTimelineEvent {
  date: string;
  type: 'group' | 'sale' | 'auction' | 'clear' | 'transfer' | 'after' | 'second' | 'withdraw';
  label: string;
  title: string;
  amount?: number;
  status?: string;
}

const LEVEL_THRESHOLDS = {
  high: 7,    // 7天内有订单 = 高频
  medium: 30, // 30天内有 = 中频
  low: 90,    // 90天内有 = 低频
};

function fmtDate(ts: string | number | undefined): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysSince(ts: string | number | undefined): number {
  if (!ts) return 999;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

export function buildCustomerProfile(
  user: any,
  allBills: any[],
  allSaleOrders: any[],
  allAuctionOrders: any[],
  allClears: any[],
  allTransfers: any[],
  allAfters: any[],
  allSeconds: any[],
  allWithdraws: any[],
  shopCfg?: any
): CustomerProfile {
  const uid = user.id;
  
  // 用户相关订单
  const userBills = allBills.filter(b => b.userId === uid || b.cn === user.cn);
  const userSales = allSaleOrders.filter(o => o.userId === uid || o.cn === user.cn);
  const userAuctions = allAuctionOrders.filter(o => o.userId === uid || o.cn === user.cn);
  const userClears = allClears.filter(c => c.userId === uid || c.cn === user.cn);
  const userTransfers = allTransfers.filter(t => t.fromCn === user.cn || t.toCn === user.cn);
  const userAfters = allAfters.filter(a => a.userId === uid || a.cn === user.cn);
  const userSeconds = allSeconds.filter(s => s.userId === uid || s.cn === user.cn);
  const userWithdraws = allWithdraws.filter(w => w.userId === uid || w.cn === user.cn);
  
  // 消费统计
  const groupSpent = userBills.filter(b => b.state === '已销账').reduce((s, b) => s + (+b.total || 0), 0);
  const saleSpent = userSales.filter(o => o.status === '囤货中').reduce((s, o) => s + (+o.total || 0), 0);
  const auctionSpent = userAuctions.filter(o => o.state === '囤货中' || o.state === '已付款').reduce((s, o) => s + (+o.curPrice || 0), 0);
  const totalSpent = groupSpent + saleSpent + auctionSpent;
  const totalOrders = userBills.length + userSales.length + userAuctions.length;
  const avgOrderAmount = totalOrders > 0 ? +(totalSpent / totalOrders).toFixed(2) : 0;
  
  // 活跃度
  const allDates = [
    ...userBills.map(b => b.createdAt || b.paidAt),
    ...userSales.map(o => o.createdAt || o.paidAt),
    ...userAuctions.map(o => o.createdAt || o.paidAt),
    ...userClears.map(c => c.createdAt),
    ...userTransfers.map(t => t.createdAt),
    ...userSeconds.map(s => s.createdAt),
  ].filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  const lastOrderDate = allDates[0];
  const firstOrderDate = allDates[allDates.length - 1];
  const daysSinceLast = daysSince(lastOrderDate);
  
  let activeLevel: CustomerProfile['activeLevel'] = '沉睡';
  if (daysSinceLast <= LEVEL_THRESHOLDS.high) activeLevel = '高频';
  else if (daysSinceLast <= LEVEL_THRESHOLDS.medium) activeLevel = '中频';
  else if (daysSinceLast <= LEVEL_THRESHOLDS.low) activeLevel = '低频';
  
  // 当前待办
  const pendingTodos: ProfileTodo[] = [];
  userBills.filter(b => b.state === '待付款' || b.state === '已提交截图').forEach(b => {
    pendingTodos.push({ type: '肾表', title: b.seriesName || '拼团肾表', detail: `${b.items?.length || 0}件 · ${fmtDate(b.createdAt)}`, amount: +b.total || 0, urgency: b.state === '待付款' ? 2 : 1 });
  });
  userSales.filter(o => o.status === '待付款' || o.status === '申请取消').forEach(o => {
    pendingTodos.push({ type: '直售', title: `订单#${o.id}`, detail: o.status, amount: +o.total || 0, urgency: o.status === '待付款' ? 2 : 1 });
  });
  userAuctions.filter(o => o.state === '待付款').forEach(o => {
    pendingTodos.push({ type: '拍卖', title: `拍卖#${o.auctionId || o.id}`, detail: '中标待付款', amount: +o.curPrice || 0, urgency: 3 });
  });
  userTransfers.filter(t => t.status === 'pending').forEach(t => {
    pendingTodos.push({ type: '转单', title: t.goodsName || '转单', detail: `待${t.toCn}确认`, amount: 0, urgency: 1 });
  });
  userAfters.filter(a => a.state === '待审核').forEach(a => {
    pendingTodos.push({ type: '售后', title: `${a.type} ${a.goods || ''}`, detail: a.way || '', amount: +(a.refundAmount || 0), urgency: 2 });
  });
  userSeconds.filter(s => s.state === '待付款' || s.state === '已提交截图').forEach(s => {
    pendingTodos.push({ type: '二次收肾', title: s.title || '二次收肾', detail: s.state, amount: +s.amount || 0, urgency: s.state === '待付款' ? 2 : 1 });
  });
  userWithdraws.filter(w => w.state === '待处理').forEach(w => {
    pendingTodos.push({ type: '提现', title: `¥${w.amount}`, detail: w.method || '', amount: +w.amount || 0, urgency: 1 });
  });
  
  // 囤货情况
  const stockItems = [...userBills.filter(b => b.state === '已销账'), ...userSales.filter(o => o.status === '囤货中'), ...userAuctions.filter(o => o.state === '囤货中' || o.state === '已付款')];
  const stockCount = stockItems.length;
  const stockValue = stockItems.reduce((s, o) => s + (+o.total || +o.curPrice || 0), 0);
  const stockOver90 = stockItems.filter(o => {
    const base = o.paidAt || o.stockSince || o.createdAt;
    if (!base) return false;
    return daysSince(base) > 90;
  }).length;
  
  // 时间线（最近20条）
  const timelineEvents: ProfileTimelineEvent[] = [];
  
  userBills.forEach(b => {
    timelineEvents.push({
      date: fmtDate(b.createdAt) || '',
      type: 'group',
      label: '拼团',
      title: `${b.seriesName || '拼团'} · ${b.items?.length || 0}件`,
      amount: +b.total || 0,
      status: b.state,
    });
  });
  userSales.forEach(o => {
    timelineEvents.push({
      date: fmtDate(o.createdAt) || '',
      type: 'sale',
      label: '直售',
      title: `订单#${o.id}`,
      amount: +o.total || 0,
      status: o.status,
    });
  });
  userAuctions.forEach(o => {
    timelineEvents.push({
      date: fmtDate(o.createdAt) || '',
      type: 'auction',
      label: '拍卖',
      title: `拍卖#${o.auctionId || o.id}`,
      amount: +o.total || +o.curPrice || 0,
      status: o.state,
    });
  });
  userClears.forEach(c => {
    timelineEvents.push({
      date: fmtDate(c.createdAt) || '',
      type: 'clear',
      label: '清货',
      title: `清货#${c.id}`,
      amount: +c.total || 0,
      status: c.state,
    });
  });
  userTransfers.forEach(t => {
    timelineEvents.push({
      date: fmtDate(t.createdAt) || '',
      type: 'transfer',
      label: '转单',
      title: t.goodsName || '转单',
      amount: 0,
      status: t.status,
    });
  });
  userAfters.forEach(a => {
    timelineEvents.push({
      date: fmtDate(a.createdAt) || '',
      type: 'after',
      label: '售后',
      title: `${a.type} ${a.goods || ''}`,
      amount: +(a.refundAmount || 0),
      status: a.state,
    });
  });
  userSeconds.forEach(s => {
    timelineEvents.push({
      date: fmtDate(s.createdAt) || '',
      type: 'second',
      label: '二次收肾',
      title: s.title || '二次收肾',
      amount: +s.amount || 0,
      status: s.state,
    });
  });
  userWithdraws.forEach(w => {
    timelineEvents.push({
      date: fmtDate(w.createdAt) || '',
      type: 'withdraw',
      label: '提现',
      title: `¥${w.amount}`,
      amount: +w.amount || 0,
      status: w.state,
    });
  });
  
  // 按时间倒序，取最近20条
  timelineEvents.sort((a, b) => b.date.localeCompare(a.date));
  const timeline = timelineEvents.slice(0, 20);
  
  return {
    userId: uid,
    cn: user.cn || user.account,
    account: user.account,
    qq: user.qq,
    wechat: user.wechat,
    balance: +(user.balance || 0),
    banned: user.banned,
    role: user.role,
    totalSpent,
    totalOrders,
    groupOrdersCount: userBills.length,
    saleOrdersCount: userSales.length,
    auctionOrdersCount: userAuctions.length,
    avgOrderAmount,
    activeLevel,
    daysSinceLastOrder: daysSinceLast,
    firstOrderDate: fmtDate(firstOrderDate),
    lastOrderDate: fmtDate(lastOrderDate),
    pendingTodos,
    pendingTodoCount: pendingTodos.length,
    stockCount,
    stockValue,
    stockOver90,
    timeline,
  };
}

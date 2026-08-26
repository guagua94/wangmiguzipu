/* ===== 拼团管理工作台聚合逻辑 ===== */

/**
 * 系列卡片数据聚合 —— 从 seriesList + allBills 计算每个系列的进度、团员数、截团倒计时等
 */
export function buildSeriesCards(seriesList, allBills) {
  return seriesList.map(s => {
    const bills = allBills.filter(b => b.seriesId === s.id);
    const totalGoods = s.goodsCount || 0;
    const totalBooked = bills.reduce((sum, b) => sum + (b.items || []).reduce((a, i) => a + i.qty, 0), 0);
    const totalLimit = s.totalLimit || 0;
    const progress = totalLimit > 0 ? Math.min(100, Math.round((totalBooked / totalLimit) * 100)) : 0;
    const memberCount = new Set(bills.map(b => b.userId || b.cn)).size;
    const unPaidBills = bills.filter(b => b.state === '待付款');
    const pendingAudit = bills.filter(b => b.state === '已提交截图');
    const settled = bills.filter(b => b.state === '已销账');

    // 截团倒计时
    let countdownText = '';
    let countdownUrgent = false;
    if (s.status === '进行中' && s.deadlineAt) {
      const diff = new Date(s.deadlineAt).getTime() - Date.now();
      if (diff <= 0) {
        countdownText = '已到截团时间';
        countdownUrgent = true;
      } else if (diff < 3600000) {
        countdownText = `${Math.ceil(diff / 60000)}分钟后截团`;
        countdownUrgent = true;
      } else if (diff < 86400000) {
        countdownText = `${Math.ceil(diff / 3600000)}小时后截团`;
      } else {
        countdownText = `${Math.ceil(diff / 86400000)}天后截团`;
      }
    } else if (s.status === '进行中' && !s.deadlineAt) {
      countdownText = '手动截团';
    }

    return {
      ...s,
      _billsCount: bills.length,
      _memberCount: memberCount,
      _totalBooked: totalBooked,
      _totalLimit: totalLimit,
      _progress: progress,
      _unpaidCount: unPaidBills.length,
      _pendingAuditCount: pendingAudit.length,
      _settledCount: settled.length,
      _totalAmount: bills.reduce((sum, b) => sum + (+b.total || 0), 0),
      _countdownText: countdownText,
      _countdownUrgent: countdownUrgent,
    };
  });
}

/**
 * 排表工作台 —— 谷子矩阵 + 团员汇总
 * 返回 { matrix: [{good, members: [{cn, qty, seqs}]}], memberSummary: [{cn, totalQty, totalAmt}] }
 */
export function buildGroupWorkspace(seriesId, seriesList, curGoods, allBills) {
  if (!curGoods || !curGoods.length) return { matrix: [], memberSummary: [] };

  const bills = allBills.filter(b => b.seriesId === seriesId && b.state !== '已取消');

  // 谷子矩阵：每行一个谷子，列出哪些团员排了多少
  const matrix = curGoods.map(g => {
    const members = [];
    for (const b of bills) {
      const items = (b.items || []).filter(i => i.goodId === g.id);
      if (items.length) {
        members.push({
          cn: b.cn,
          userId: b.userId,
          qty: items.reduce((a, i) => a + i.qty, 0),
          seqs: items.map(i => i.seqs).filter(Boolean).join(','),
          state: b.state,
        });
      }
    }
    return {
      good: g,
      members,
      booked: members.reduce((a, m) => a + m.qty, 0),
      remain: Math.max(0, +g.limit - members.reduce((a, m) => a + m.qty, 0)),
    };
  });

  // 团员汇总：每人在该系列排了多少件、多少钱
  const memberMap = {};
  for (const b of bills) {
    const key = b.cn || ('用户' + b.userId);
    if (!memberMap[key]) memberMap[key] = { cn: key, userId: b.userId, totalQty: 0, totalAmt: 0, billCount: 0, unpaidCount: 0 };
    const qty = (b.items || []).reduce((a, i) => a + i.qty, 0);
    memberMap[key].totalQty += qty;
    memberMap[key].totalAmt += +b.total || 0;
    memberMap[key].billCount++;
    if (b.state === '待付款') memberMap[key].unpaidCount++;
  }
  const memberSummary = Object.values(memberMap).sort((a, b) => b.totalAmt - a.totalAmt);

  return { matrix, memberSummary };
}

/**
 * 催肾助手 —— 截团后列出未付款团员
 */
export function buildUnpaidReminders(seriesId, seriesList, allBills) {
  const series = seriesList.find(s => s.id === seriesId);
  if (!series) return [];

  // 截团后才显示
  if (series.status !== '已截团') return [];

  const unpaid = allBills.filter(b => b.seriesId === seriesId && b.state === '待付款');
  return unpaid.map(b => ({
    billId: b.id,
    cn: b.cn,
    userId: b.userId,
    total: +b.total || 0,
    items: b.items || [],
    createdAt: b.createdAt,
    overdue: isOverdue(b.createdAt, 3),
  })).sort((a, b) => (a.overdue ? -1 : 0) - (b.overdue ? -1 : 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function isOverdue(createdAt, days) {
  if (!createdAt) return false;
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff > days * 86400000;
}

/**
 * 排表 CSV 导出 —— 谷子矩阵格式
 */
export function buildGroupMatrixCSV(matrix, seriesName) {
  const rows = [];
  for (const m of matrix) {
    const memberDetail = m.members.map(mem => `${mem.cn} x${mem.qty}`).join('; ');
    rows.push({
      '谷子': m.good.name,
      '分类': m.good.cat || '',
      '单价': m.good.price,
      '可排': m.good.limit,
      '已排': m.booked,
      '余量': m.remain,
      '团员明细': memberDetail,
    });
  }
  return rows;
}

/**
 * 团员汇总 CSV 导出
 */
export function buildMemberSummaryCSV(memberSummary) {
  return memberSummary.map(m => ({
    '团员': m.cn,
    '排单数': m.billCount,
    '总件数': m.totalQty,
    '总金额': m.totalAmt,
    '未付款': m.unpaidCount,
  }));
}

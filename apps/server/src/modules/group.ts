import { Controller, Get, Post, Body, Req, Param, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Request } from 'express';
import { Series, Good, Order, OrderItem, KidneyBill, User, Notification, AdminLog } from '../entities';
import { JwtUser, checkRole } from '../common';

export class GroupService {
  constructor(
    @InjectRepository(Series) private seriesRepo: Repository<Series>,
    @InjectRepository(Good) private goodRepo: Repository<Good>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    @InjectRepository(KidneyBill) private billRepo: Repository<KidneyBill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(AdminLog) private adminLogRepo: Repository<AdminLog>,
    private dataSource: DataSource,
  ) {}

  async listSeries() {
    const ss = await this.seriesRepo.find({ order: { id: 'desc' } });
    const ids = ss.map(s => s.id);
    const goods = ids.length ? await this.goodRepo.find({ where: { seriesId: In(ids) } }) : [];
    return ss.map(s => {
      const gs = goods.filter(g => g.seriesId === s.id);
      return { ...s, goodCount: gs.length, cats: [...new Set(gs.map(g => g.cat))] };
    });
  }

  async seriesDetail(id: number) {
    const s = await this.seriesRepo.findOneByOrFail({ id });
    const goods = await this.goodRepo.find({ where: { seriesId: id }, order: { id: 'asc' } });
    return { series: s, goods };
  }

  async createSeries(b: Partial<Series>, uid: number) {
    if (!b.name?.trim()) throw new BadRequestException('系列名称不能为空');
    const s = await this.seriesRepo.save(this.seriesRepo.create({ ...b, status: b.status || '预排' }));
    const result = await this.seriesRepo.findOneByOrFail({ id: s.id });
    await this.log(s.id, uid, '创建系列');
    return result;
  }

  async updateSeries(id: number, b: Partial<Series>, uid: number) {
    await this.seriesRepo.update(id, b);
    await this.log(id, uid, '修改系列信息');
    return this.seriesRepo.findOneByOrFail({ id });
  }

  /** 新增/修改谷子（分类自定义，标签栏自动生成） */
  async saveGood(b: Partial<Good>, uid: number) {
    const g = await this.goodRepo.save(this.goodRepo.create(b));
    await this.log(g.seriesId, uid, `保存谷子 ${g.name}`);
    return g;
  }

  /** 删除谷子：已有人跟排（booked > 0）不可直接删除 */
  async deleteGood(id: number, uid: number) {
    const g = await this.goodRepo.findOneByOrFail({ id });
    if (g.booked > 0) throw new BadRequestException(`该谷子已有 ${g.booked} 人跟排，无法删除。请先处理跟排后再删除。`);
    await this.goodRepo.delete(id);
    await this.log(g.seriesId, uid, `删除谷子 ${g.name}`);
    return { ok: true };
  }

  /** 批量调价：加/减/乘/除，可按分类 */
  async batchPrice(seriesId: number, op: 'add' | 'sub' | 'mul' | 'div', val: number, cat: string, uid: number) {
    if (!(val > 0)) throw new BadRequestException('数值必须大于0');
    const where: any = { seriesId };
    if (cat) where.cat = cat;
    const goods = await this.goodRepo.find({ where });
    for (const g of goods) {
      let p = +g.price;
      if (op === 'add') p += val;
      else if (op === 'sub') p = Math.max(0, p - val);
      else if (op === 'mul') p = p * val;
      else p = p / val;
      g.price = p.toFixed(2);
    }
    await this.goodRepo.save(goods);
    await this.log(seriesId, uid, `批量调价 ${op} ${val} ${cat || '整表'}，共 ${goods.length} 项`);
    return { updated: goods.length };
  }

  /** 余量表 */
  async remainTable(seriesId: number) {
    const goods = await this.goodRepo.find({ where: { seriesId }, order: { id: 'asc' } });
    return goods.map(g => ({ name: g.name, cat: g.cat, total: g.limit, booked: g.booked, remain: Math.max(0, g.limit - g.booked) }));
  }

  /** 团员跟排：合并进同系列同状态订单；记录谷序（事务保护） */
  async follow(uid: number, seriesId: number, items: { goodId: number; qty: number }[]) {
    const s = await this.seriesRepo.findOneByOrFail({ id: seriesId });
    if (s.status !== '进行中' && s.status !== '预排') throw new ForbiddenException(`当前状态（${s.status}）不可跟排`);
    
    return await this.dataSource.transaction(async manager => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);
      const goodRepo = manager.getRepository(Good);
      
      let order = await orderRepo.findOne({ where: { userId: uid, seriesId, status: '跟排中' } });
      if (!order) {
        order = await orderRepo.save(orderRepo.create({ userId: uid, seriesId }));
      }
      let total = +order.total;
      for (const it of items) {
        if (it.qty <= 0) continue;
        const g = await goodRepo.findOneByOrFail({ id: it.goodId });
        let item = await itemRepo.findOne({ where: { orderId: order.id, goodId: it.goodId } });
        const startSeq = item ? (item.seqs ? item.seqs.split(',').map(Number).filter(Boolean) : []) : [];
        const newSeqs: number[] = [...startSeq];
        for (let i = 1; i <= it.qty; i++) newSeqs.push(g.booked + i); // 超排也分配谷序（候补）
        g.booked += it.qty;
        await goodRepo.save(g);
        if (item) { item.qty += it.qty; item.seqs = newSeqs.join(','); }
        else item = itemRepo.create({ orderId: order.id, goodId: g.id, name: g.name, price: g.price, qty: it.qty, seqs: newSeqs.join(',') });
        await itemRepo.save(item);
        total += +g.price * it.qty;
      }
      order.total = total.toFixed(2);
      await orderRepo.save(order);
      return order;
    });
  }


  /** 拆分订单：修改首项保留数量，剩余生成新单（超配拆单场景） */
  async splitOrder(orderId: number, keepQty: number, auditor: JwtUser) {
    const o = await this.orderRepo.findOneByOrFail({ id: orderId });
    const items = await this.itemRepo.find({ where: { orderId } });
    if (!items.length || keepQty >= items[0].qty) throw new BadRequestException('保留数量需小于原数量');
    const rest = items[0].qty - keepQty;
    items[0].seqs = items[0].seqs.split(',').slice(0, keepQty).join(',');
    items[0].qty = keepQty;
    await this.itemRepo.save(items[0]);
    const kept = items.reduce((a, i) => a + +i.price * i.qty, 0);
    const newOrder = await this.orderRepo.save(this.orderRepo.create({ userId: o.userId, seriesId: o.seriesId, status: o.status, total: (rest * +items[0].price).toFixed(2) }));
    await this.itemRepo.save(this.itemRepo.create({ orderId: newOrder.id, goodId: items[0].goodId, name: items[0].name, price: items[0].price, qty: rest, seqs: '' }));
    await this.orderRepo.update(o.id, { total: kept.toFixed(2), opLog: `${o.opLog}
${new Date().toISOString()} ${auditor.cn} 拆分，保留${keepQty}件` });
    return { kept, newOrderId: newOrder.id };
  }

  /** 合并订单：同团同状态（跟排中/待付款）合并为一单 */
  async mergeOrders(orderId: number, targetId: number, auditor: JwtUser) {
    const a = await this.orderRepo.findOneByOrFail({ id: orderId });
    const b = await this.orderRepo.findOneByOrFail({ id: targetId });
    if (a.userId !== b.userId || a.seriesId !== b.seriesId || a.status !== b.status) throw new BadRequestException('仅限同团员同系列同状态订单合并');
    const itemsB = await this.itemRepo.find({ where: { orderId: targetId } });
    for (const it of itemsB) {
      const ex = await this.itemRepo.findOne({ where: { orderId, goodId: it.goodId } });
      if (ex) { ex.qty += it.qty; ex.seqs = [ex.seqs, it.seqs].filter(Boolean).join(','); await this.itemRepo.save(ex); await this.itemRepo.delete(it.id); }
      else { it.orderId = orderId; await this.itemRepo.save(it); }
    }
    await this.orderRepo.update(orderId, { total: (+a.total + +b.total).toFixed(2) });
    await this.orderRepo.delete(targetId);
    return { ok: true };
  }

  /** 砍单：支持部分砍单（按 orderItemId 或 goodId，可传 qty 指定砍单数量） */
  async cutOrder(orderItemId?: number, goodId?: number, qty?: number, auditor?: JwtUser) {
    if (!orderItemId && !goodId) throw new BadRequestException('需提供 orderItemId 或 goodId');
    if (qty !== undefined && qty <= 0) throw new BadRequestException('砍单数量必须大于0');

    return await this.dataSource.transaction(async manager => {
      const itemRepo = manager.getRepository(OrderItem);
      const orderRepo = manager.getRepository(Order);
      const goodRepo = manager.getRepository(Good);

      let items: OrderItem[] = [];
      if (orderItemId) {
        const item = await itemRepo.findOneBy({ id: orderItemId });
        if (!item) throw new BadRequestException('订单项不存在');
        items = [item];
      } else {
        items = await itemRepo.find({ where: { goodId, status: '' }, order: { id: 'ASC' } });
        if (!items.length) throw new BadRequestException('该谷子无人跟排');
      }

      const updatedOrders = new Set<number>();
      let totalRefund = 0;
      let remaining = qty; // 剩余待砍数量（undefined 表示全部砍）

      for (const item of items) {
        if (remaining !== undefined && remaining <= 0) break;
        if (item.status === '砍单') continue;
        const order = await orderRepo.findOneBy({ id: item.orderId });
        if (!order) continue;

        const cutQty = remaining !== undefined
          ? Math.min(remaining, item.qty)
          : item.qty;

        const refund = +item.price * cutQty;
        totalRefund += refund;

        // 减回 Good.booked
        const g = await goodRepo.findOneBy({ id: item.goodId });
        if (g) {
          g.booked = Math.max(0, g.booked - cutQty);
          await goodRepo.save(g);
        }

        if (cutQty >= item.qty) {
          // 全部砍：删除 item
          await itemRepo.delete(item.id);
        } else {
          // 部分砍：减少 qty 并更新 seqs
          item.qty -= cutQty;
          if (item.seqs) {
            const seqArr = item.seqs.split(',').filter(Boolean);
            for (let i = 0; i < cutQty; i++) seqArr.pop();
            item.seqs = seqArr.join(',');
          }
          await itemRepo.save(item);
        }

        const newTotal = Math.max(0, (+order.total - refund)).toFixed(2);
        await orderRepo.update(order.id, {
          total: newTotal,
          opLog: `${order.opLog || ''}
${new Date().toISOString()} ${auditor?.cn || '系统'} 砍单：${item.name} ×${cutQty}，退还 ¥${refund.toFixed(2)}`,
        });
        updatedOrders.add(order.id);

        if (remaining !== undefined) remaining -= cutQty;
      }

      return {
        cutCount: items.filter(i => i.status !== '砍单').length,
        refunded: totalRefund.toFixed(2),
        orderIds: [...updatedOrders],
      };
    });
  }

  /** 取消跟排：截单前可取消，删除订单项并恢复库存 */
  async cancelGroupOrder(orderId: number, uid: number) {
    return await this.dataSource.transaction(async manager => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);
      const goodRepo = manager.getRepository(Good);
      const billRepo = manager.getRepository(KidneyBill);

      const order = await orderRepo.findOneByOrFail({ id: orderId });
      if (order.userId !== uid) throw new ForbiddenException();
      if (order.status !== '跟排中') throw new BadRequestException('当前状态不可取消跟排');
      // 已截团（生成了肾表）不可取消
      const bill = await billRepo.findOne({ where: { orderId: order.id } });
      if (bill) throw new BadRequestException('已截团，无法取消跟排');

      const items = await itemRepo.find({ where: { orderId: order.id } });
      for (const item of items) {
        const g = await goodRepo.findOneBy({ id: item.goodId });
        if (g) {
          g.booked = Math.max(0, g.booked - item.qty);
          await goodRepo.save(g);
        }
        await itemRepo.delete(item.id);
      }
      await orderRepo.delete(order.id);
      return { action: 'cancelled', itemsRemoved: items.length };
    });
  }

  /** 我的跟排订单 */
  async myOrders(uid: number) {
    const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
    const items = await this.itemRepo.find({ where: { orderId: In(orders.map(o => o.id) || [0]) } });
    return orders.map(o => ({ ...o, items: items.filter(i => i.orderId == o.id) }));
  }

  /** 全部订单（后台用：囤货中/待清货等，含用户CN和系列名） */
  async allOrders() {
    const orders = await this.orderRepo.find({
      where: { status: In(['囤货中', '待清货', '已发货']) },
      order: { id: 'desc' },
    });
    const userIds = [...new Set(orders.map(o => o.userId))];
    const seriesIds = [...new Set(orders.map(o => o.seriesId).filter(id => id !== 0))];
    const users = userIds.length ? await this.userRepo.find({ where: { id: In(userIds) } }) : [];
    const series = seriesIds.length ? await this.seriesRepo.find({ where: { id: In(seriesIds) } }) : [];
    const items = orders.length ? await this.itemRepo.find({ where: { orderId: In(orders.map(o => o.id)) } }) : [];
    return orders.map(o => ({
      ...o,
      cn: users.find(u => u.id === o.userId)?.cn || '',
      seriesName: series.find(s => s.id === o.seriesId)?.name || '',
      items: items.filter(i => i.orderId == o.id),
    }));
  }

  /** 截团：冻结排表 → 生成肾表 → 通知（事务保护） */
  async jietuan(seriesId: number, uid: number) {
    const s = await this.seriesRepo.findOneByOrFail({ id: seriesId });
    if (s.status !== '进行中' && s.status !== '预排') throw new BadRequestException(`状态 ${s.status} 不可截团`);

    const orders = await this.orderRepo.find({ where: { seriesId, status: '跟排中' } });

    // 核心数据操作：全部在事务内
    await this.dataSource.transaction(async manager => {
      const billRepo = manager.getRepository(KidneyBill);
      const orderRepo = manager.getRepository(Order);
      const seriesRepo = manager.getRepository(Series);

      for (const o of orders) {
        await billRepo.save(billRepo.create({
          userId: o.userId, seriesId, orderId: o.id, total: o.total, state: '待付款',
        }));
        await orderRepo.update(o.id, { status: '待付款' });
      }
      await seriesRepo.update(seriesId, { status: '已截团' });
    });

    // 事务成功后发通知（通知失败不影响截团结果）
    const notifRepo = this.seriesRepo.manager.getRepository(Notification);
    for (const o of orders) {
      await notifRepo.save(notifRepo.create({
        userId: o.userId, title: '拼团已截团',
        body: `「${s.name}」已截团，肾表已生成（¥${o.total}），请前往我的肾表付款`,
      }));
    }

    await this.log(seriesId, uid, `截团：生成 ${orders.length} 张肾表`);
    return { bills: orders.length };
  }

  /** 我的肾表 */
  async myBills(uid: number) {
    const bills = await this.billRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
    const orders = bills.length ? await this.orderRepo.find({ where: { id: In(bills.map(b => b.orderId)) } }) : [];
    const items = await this.itemRepo.find({ where: { orderId: In(orders.map(o => o.id) || [0]) } });
    const names = bills.map(b => {
      const o = orders.find(x => x.id === b.orderId);
      return { ...b, seriesName: o ? '' : '', items: items.filter(i => i.orderId == b.orderId) };
    });
    const ss = bills.length ? await this.seriesRepo.find({ where: { id: In(bills.map(b => b.seriesId)) } }) : [];
    return names.map(b => {
      const s = ss.find(x => x.id === b.seriesId);
      return { ...b, seriesName: s?.name || '', seriesEmoji: s?.emoji || '' };
    });
  }

  /** 提交付款截图 */
  async submitBill(uid: number, billId: number, screenshot: string, useBalanceAmount: number) {
    const b = await this.billRepo.findOneByOrFail({ id: billId });
    if (b.userId !== uid) throw new ForbiddenException();
    if (b.state !== '待付款') throw new BadRequestException('当前状态不可提交');

    return await this.dataSource.transaction(async manager => {
      const billRepo = manager.getRepository(KidneyBill);
      const orderRepo = manager.getRepository(Order);
      const userRepo = manager.getRepository(User);

      const bill = await billRepo.findOneByOrFail({ id: billId });
      const total = +bill.total;
      let useBal = Math.max(0, Math.min(useBalanceAmount || 0, total));
      let rest = total;

      if (useBal > 0) {
        const user = await userRepo.findOneByOrFail({ id: uid });
        const bal = +user.balance;
        if (bal < useBal) throw new BadRequestException(`余额不足（当前 ¥${bal.toFixed(2)}，需抵扣 ¥${useBal.toFixed(2)}）`);
        user.balance = (bal - useBal).toFixed(2);
        await userRepo.save(user);
        rest = total - useBal;
        await billRepo.update(billId, {
          total: rest.toFixed(2),
          opLog: `${bill.opLog}\n${new Date().toISOString()} 余额抵扣 ¥${useBal.toFixed(2)}（剩余待付 ¥${rest.toFixed(2)}）`,
        });
      }

      if (rest <= 0) {
        // 余额全额抵扣，直接销账
        await billRepo.update(billId, { state: '已销账' });
        await orderRepo.update(b.orderId, { status: '囤货中', paidAt: new Date() });
        return { paidOff: true, usedBalance: useBal };
      }

      if (!screenshot) throw new BadRequestException(`需扫码支付 ¥${rest.toFixed(2)}，请上传付款截图`);
      await billRepo.update(billId, { state: '已提交截图', screenshot });
      return { paidOff: false, rest, usedBalance: useBal };
    });
  }

   /** 店主/管理员审核：通过销账 / 打回 */
  async auditBill(billId: number, pass: boolean, note: string, auditor: JwtUser) {
    const b = await this.billRepo.findOneByOrFail({ id: billId });
    if (b.state !== '已提交截图') throw new BadRequestException('状态不允许审核');

    await this.dataSource.transaction(async manager => {
      const billRepo = manager.getRepository(KidneyBill);
      const orderRepo = manager.getRepository(Order);

      if (pass) {
        await billRepo.update(billId, { state: '已销账', auditNote: note, opLog: `${b.opLog}\n${new Date().toISOString()} ${auditor.cn} 通过销账` });
        await orderRepo.update(b.orderId, { status: '囤货中', paidAt: new Date() });
      } else {
        await billRepo.update(billId, { state: '待付款', auditNote: note, opLog: `${b.opLog}\n${new Date().toISOString()} ${auditor.cn} 打回：${note}` });
      }
    });

    // 事务成功后发通知
    const nRepo = this.billRepo.manager.getRepository(Notification);
    await nRepo.save(nRepo.create({
      userId: b.userId, title: pass ? '肾表审核通过' : '肾表审核被打回',
      body: `肾表 #${billId} ${pass ? '已销账完成，谷子进入囤货' : `被打回：${note}，请重新付款提交`}`,
    }));
    return { ok: true };
  }

  /** 全部肾表（后台） */
  async allBills() {
    const bills = await this.billRepo.find({ order: { id: 'desc' } });
    const users = bills.length ? await this.userRepo.find({ where: { id: In(bills.map(b => b.userId)) } }) : [];
    const ss = bills.length ? await this.seriesRepo.find({ where: { id: In(bills.map(b => b.seriesId)) } }) : [];
    return bills.map(b => {
      const s = ss.find(x => x.id === b.seriesId);
      return {
        ...b, cn: users.find(u => u.id === b.userId)?.cn || '',
        seriesName: s?.name || '', seriesEmoji: s?.emoji || '',
        seriesStatus: s?.status || '',
      };
    });
  }

  /** 到货标记（单/多谷子） */
  async markArrived(seriesId: number, goodIds: number[], arrived: '未到货' | '已到货' | '部分到货', uid: number) {
    if (goodIds.length === 0) {
      await this.goodRepo.update({ seriesId }, { arrived });
      await this.log(seriesId, uid, `整批标记到货：${arrived}`);
    } else {
      await this.goodRepo.update(goodIds.map(id => ({ id })), { arrived });
      await this.log(seriesId, uid, `标记到货：${goodIds.length} 件 ${arrived}`);
    }
    return { updated: goodIds.length || (await this.goodRepo.count({ where: { seriesId } })) };
  }

  /** CSV 排表导入 */
  async importGoods(seriesId: number, rows: { name: string; cat: string; price: string | number; limit: number; emoji?: string }[]) {
    const created = [];
    for (const r of rows) {
      if (!r.name) continue;
      const g = await this.goodRepo.save(this.goodRepo.create({
        seriesId, name: r.name, cat: r.cat || '',
        price: (+r.price).toFixed(2), limit: +r.limit || 0,
        emoji: r.emoji || '🎁',
      }));
      created.push(g);
    }
    return { imported: created.length };
  }

  /** 排表导出 CSV */
  exportGoodsCSV(seriesId: number) {
    return this.goodRepo.find({ where: { seriesId }, order: { id: 'asc' } });
  }

  /** CN 自查：团员查自己全部跟排/购买/拍卖记录汇总 */
  async cnSelfCheck(uid: number) {
    const orders = await this.orderRepo.find({ where: { userId: uid }, order: { id: 'desc' } });
    const orderIds = orders.map(o => o.id);
    const items = orderIds.length ? await this.itemRepo.find({ where: { orderId: In(orderIds) } }) : [];
    const bills = await this.billRepo.find({ where: { userId: uid } });
    const seriesIds = [...new Set(orders.map(o => o.seriesId))];
    const ss = seriesIds.length ? await this.seriesRepo.find({ where: { id: In(seriesIds) } }) : [];
    const saleRepo = this.orderRepo.manager.getRepository('SaleGood');

    // 直售订单（seriesId=0）
    const saleOrders = orders.filter(o => o.seriesId === 0);
    const saleItems = saleOrders.length ? items.filter(i => saleOrders.some(o => o.id === i.orderId)) : [];

    // 拍卖记录
    const aucRepo = this.orderRepo.manager.getRepository('Auction');
    const auctions = await aucRepo.createQueryBuilder('a')
      .leftJoin('auction_bids', 'ab', 'ab.auctionId = a.id')
      .where('ab.userId = :uid', { uid })
      .select(['a.id', 'a.name', 'a.curPrice', 'a.state', 'a.winnerId'])
      .getMany();

    return {
      groupOrders: orders.filter(o => o.seriesId !== 0).map(o => ({
        ...o,
        seriesName: ss.find(s => s.id === o.seriesId)?.name || '',
        items: items.filter(i => i.orderId == o.id),
      })),
        saleOrders: saleOrders.map(o => ({ ...o, items: saleItems.filter(i => i.orderId == o.id) })),
      bills: bills.map(b => {
        const s = ss.find(x => x.id === b.seriesId);
        return { ...b, seriesName: s?.name || '', seriesEmoji: s?.emoji || '' };
      }),
      auctions: auctions.map(a => ({
        id: a.id, name: a.name, curPrice: a.curPrice,
        state: a.state, isWinner: a.winnerId === uid,
      })),
    };
  }

  /** 预检：拼团活动能否删除 */
  async canDeleteSeries(id: number) {
    const series = await this.seriesRepo.findOneBy({ id });
    if (!series) throw new BadRequestException('活动不存在');

    const orders = await this.orderRepo.find({ where: { seriesId: id } });
    const stats = {
      totalOrders: orders.length,
      shippedOrders: 0,
      clearingOrders: 0,
      paidOrders: 0,
      paidAmount: '0.00',
      cancelPending: 0,
      secondBillCount: 0,
    };

    const paidStatuses = ['待付款', '已提交截图', '审核通过', '囤货中', '待清货'];
    const clearingStatuses = ['待清货'];
    const shippedStatuses = ['已发货', '已完成'];

    for (const o of orders) {
      if (shippedStatuses.includes(o.status)) stats.shippedOrders++;
      else if (clearingStatuses.includes(o.status)) stats.clearingOrders++;
      else if (paidStatuses.includes(o.status)) { stats.paidOrders++; stats.paidAmount = (+stats.paidAmount + +o.total).toFixed(2); }
      else if (o.status === '取消申请中') stats.cancelPending++;
    }

    // 检查二次收款
    const secondBills = await this.billRepo.createQueryBuilder('b')
      .where('b.seriesId = :id', { id })
      .andWhere("b.state IN ('待付款', '已提交截图', '审核通过')")
      .getCount();
    stats.secondBillCount = secondBills;

    const blocked = stats.shippedOrders > 0 || stats.clearingOrders > 0 || stats.paidOrders > 0 || stats.cancelPending > 0 || stats.secondBillCount > 0;

    let reason = '';
    if (stats.shippedOrders > 0) reason = `本活动有 ${stats.shippedOrders} 个订单已发货或在清货排发中，请先确认收货后再删除。`;
    else if (stats.clearingOrders > 0) reason = `本活动有 ${stats.clearingOrders} 个订单在清货排发中，请先确认收货后再删除。`;
    else if (stats.paidOrders > 0) reason = `本活动有 ${stats.paidOrders} 人已付款（共 ¥${stats.paidAmount}），请先处理退款后再删除。`;
    else if (stats.cancelPending > 0) reason = `本活动有 ${stats.cancelPending} 个取消申请待审核，请先处理完再删除。`;
    else if (stats.secondBillCount > 0) reason = `本活动已进行二次收款，请先结清二肾后再删除。`;

    return { canDelete: !blocked, reason, stats };
  }

  /** 删除拼团活动（硬删除，含事务） */
  async deleteSeries(id: number, operator: JwtUser) {
    const check = await this.canDeleteSeries(id);
    if (!check.canDelete) throw new BadRequestException(check.reason);

    const series = await this.seriesRepo.findOneByOrFail({ id });

    // 收集所有排过谷的用户ID
    const orders = await this.orderRepo.find({ where: { seriesId: id } });
    const userIds = [...new Set(orders.map(o => o.userId))];

    await this.dataSource.transaction(async manager => {
      // 1. 删除转单记录（如果有）
      const transferRepo = manager.getRepository('Transfer');
      await transferRepo.createQueryBuilder().delete().where('seriesId = :id', { id }).execute();

      // 2. 删除订单明细
      const orderIds = orders.map(o => o.id);
      if (orderIds.length) {
        await manager.createQueryBuilder().delete().from('order_items').where('orderId IN (:ids)', { ids: orderIds }).execute();
      }

      // 3. 删除肾表
      await manager.createQueryBuilder().delete().from('kidney_bills').where('seriesId = :id', { id }).execute();

      // 4. 删除二次收款记录
      await manager.createQueryBuilder().delete().from('second_bills').where('seriesId = :id', { id }).execute();

      // 5. 删除订单
      await manager.createQueryBuilder().delete().from('orders').where('seriesId = :id', { id }).execute();

      // 6. 删除谷子
      await manager.createQueryBuilder().delete().from('goods').where('seriesId = :id', { id }).execute();

      // 7. 删除活动
      await manager.createQueryBuilder().delete().from('series').where('id = :id', { id }).execute();

      // 8. 写入审计日志
      const logRepo = manager.getRepository(AdminLog);
      await logRepo.save(logRepo.create({
        action: 'delete_series',
        targetId: id,
        targetName: series.name,
        operatorId: operator.id,
        operatorCn: operator.cn,
        details: JSON.stringify({
          name: series.name,
          deletedOrders: orders.length,
          affectedUsers: userIds.length,
        }),
      }));
    });

    // 事务成功后：发送通知（事务外，失败不影响删除结果）
    const notiRepo = this.dataSource.getRepository(Notification);
    for (const uid of userIds) {
      await notiRepo.save(notiRepo.create({
        userId: uid,
        title: `拼团「${series.name}」已删除`,
        body: `店长已删除拼团「${series.name}」，您的排谷记录已清除。如有疑问请联系店长。`,
      }));
    }

    return { ok: true, deletedOrders: orders.length, notifiedUsers: userIds.length };
  }

  private async log(seriesId: number, uid: number, msg: string) {
    const s = await this.seriesRepo.findOneBy({ id: seriesId });
    if (s) {
      // 操作留痕写入订单日志流（简化：系列内最近订单 opLog 不动，用控制台+通知留痕）
      console.log(`[op-log] series=${seriesId} by=${uid} ${msg}`);
    }
  }
}

@Controller('group')
export class GroupController {
  constructor(private svc: GroupService) {}

  @Get('series')
  async list() { return this.svc.listSeries(); }

  @Get('series/:id')
  async detail(@Param('id') id: string) { return this.svc.seriesDetail(+id); }

  @Post('series/create')
  async create(@Req() req: Request & { user?: JwtUser }, @Body() b: Partial<Series>) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.createSeries(b, req.user!.id);
  }

  @Post('series/update')
  async update(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number } & Partial<Series>) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.updateSeries(b.id, b, req.user!.id);
  }

  @Post('good/save')
  async saveGood(@Req() req: Request & { user?: JwtUser }, @Body() b: Partial<Good>) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.saveGood(b, req.user!.id);
  }

  @Post('batch-price')
  async batchPrice(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number; op: 'add'|'sub'|'mul'|'div'; val: number; cat?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.batchPrice(b.seriesId, b.op, b.val, b.cat || '', req.user!.id);
  }

  @Get('remain/:seriesId')
  async remain(@Param('seriesId') seriesId: string) { return this.svc.remainTable(+seriesId); }

  @Post('follow')
  async follow(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number; items: { goodId: number; qty: number }[] }) {
    checkRole(req.user, []);
    return this.svc.follow(req.user!.id, b.seriesId, b.items);
  }

  @Get('my-orders')
  async myOrders(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.myOrders(req.user!.id);
  }

  @Get('all-orders')
  async allOrders(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.allOrders();
  }

  @Post('order/cancel-follow')
  async cancelFollow(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number }) {
    checkRole(req.user, []);
    return this.svc.cancelGroupOrder(b.orderId, req.user!.id);
  }

  @Post('order/split')
  async split(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; keepQty: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.splitOrder(b.orderId, b.keepQty, req.user!);
  }

  @Post('order/merge')
  async merge(@Req() req: Request & { user?: JwtUser }, @Body() b: { orderId: number; targetId: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.mergeOrders(b.orderId, b.targetId, req.user!);
  }

  @Post('jietuan')
  async jietuan(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.jietuan(b.seriesId, req.user!.id);
  }

  @Get('my-bills')
  async myBills(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.myBills(req.user!.id);
  }

  @Get('all-bills')
  async allBills(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.allBills();
  }

  @Post('bill/submit')
  async submit(@Req() req: Request & { user?: JwtUser }, @Body() b: { billId: number; screenshot: string; useBalanceAmount?: number }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.submitBill(req.user!.id, b.billId, b.screenshot || '', b.useBalanceAmount || 0);
  }

  @Post('bill/audit')
  async audit(@Req() req: Request & { user?: JwtUser }, @Body() b: { billId: number; pass: boolean; note?: string }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.auditBill(b.billId, b.pass, b.note || '', req.user!);
  }

  @Post('good/arrive')
  async markArrive(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number; goodIds: number[]; arrived: '未到货' | '已到货' | '部分到货' }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.markArrived(b.seriesId, b.goodIds || [], b.arrived, req.user!.id);
  }

  @Post('import')
  async importGoods(@Req() req: Request & { user?: JwtUser }, @Body() b: { seriesId: number; rows: any[] }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.importGoods(b.seriesId, b.rows);
  }

  @Get('export/:seriesId')
  async exportGoods(@Param('seriesId') seriesId: string) {
    return this.svc.exportGoodsCSV(+seriesId);
  }

  @Get('cn-self-check')
  async cnSelfCheck(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['banned-allowed']);
    return this.svc.cnSelfCheck(req.user!.id);
  }

  @Post('order/cut')
  async cut(@Req() req: Request & { user?: JwtUser }, @Body() b: { itemId?: number; goodId?: number; qty?: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.cutOrder(b.itemId, b.goodId, b.qty, req.user!);
  }

  @Get('series/:id/delete-check')
  async checkDelete(@Req() req: Request & { user?: JwtUser }, @Param('id') id: string) {
    checkRole(req.user, ['owner']);
    return this.svc.canDeleteSeries(+id);
  }

  @Post('series/:id/delete')
  async deleteSeries(@Req() req: Request & { user?: JwtUser }, @Param('id') id: string) {
    checkRole(req.user, ['owner']);
    return this.svc.deleteSeries(+id, req.user!);
  }

  @Post('good/delete')
  async deleteGood(@Req() req: Request & { user?: JwtUser }, @Body() b: { id: number }) {
    checkRole(req.user, ['owner', 'admin']);
    return this.svc.deleteGood(b.id, req.user!.id);
  }
}

export const GroupModuleRef = TypeOrmModule.forFeature([Series, Good, Order, OrderItem, KidneyBill, User, AdminLog]);

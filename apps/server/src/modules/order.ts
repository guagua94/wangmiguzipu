import { Controller, Get, Post, Body, Param, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { Request } from 'express';
import { Order, KidneyBill, Auction, User, Series, SaleGood, OrderItem, MergedShipment, Clearing } from '../entities';
import { JwtUser, checkRole } from '../common';

export class OrderService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(KidneyBill) private billRepo: Repository<KidneyBill>,
    @InjectRepository(Auction) private auctionRepo: Repository<Auction>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Series) private seriesRepo: Repository<Series>,
    @InjectRepository(SaleGood) private saleRepo: Repository<SaleGood>,
    @InjectRepository(OrderItem) private itemRepo: Repository<OrderItem>,
    @InjectRepository(MergedShipment) private mergeRepo: Repository<MergedShipment>,
    @InjectRepository(Clearing) private clearRepo: Repository<Clearing>,
    private dataSource: DataSource,
  ) {}

  /**
   * 统一订单聚合查询
   */
  async list(filter: string, source?: string, q?: string, page = 1, size = 20) {
    const orders: any[] = [];

    // 1. 肾表（拼团）
    if (!source || source === 'group') {
      const bills = await this.billRepo.find();
      for (const b of bills) {
        const user = await this.userRepo.findOneBy({ id: b.userId });
        const series = await this.seriesRepo.findOneBy({ id: b.seriesId });
        let status: string = b.state;
        if (b.state === '待付款' || b.state === '已提交截图') status = '待审核';
        else if (b.state === '已销账') status = '已销账';
        else if (b.auditNote && b.auditNote.includes('打回')) status = '已取消';

        orders.push({
          id: `kidney-${b.id}`,
          orderNo: b.orderNo || '',
          source: 'group',
          sourceLabel: '拼团',
          cn: user?.cn || '',
          userId: b.userId,
          title: series?.name || '拼团订单',
          content: `${series?.name || '未知系列'} 肾表`,
          amount: +b.total || 0,
          status,
          statusLabel: status,
          createdAt: b.createdAt,
          screenshot: b.screenshot,
          rawType: 'kidney',
          rawId: b.id,
          isSplit: b.isSplit,
          isMerged: b.isMerged,
        });
      }
    }

    // 2. 直售订单
    if (!source || source === 'sale') {
      const saleOrders = await this.orderRepo.find({ where: { seriesId: 0 } });
      for (const o of saleOrders) {
        const user = await this.userRepo.findOneBy({ id: o.userId });
        const items = await this.itemRepo.find({ where: { orderId: o.id } });
        let status = o.status;
        if (o.status === '待付款') status = '待审核';
        if (o.status === '跟排中') continue;

        const itemNames = items.map(i => i.name).join('、');
        orders.push({
          id: `sale-${o.id}`,
          orderNo: o.orderNo || '',
          source: 'sale',
          sourceLabel: '直售',
          cn: user?.cn || '',
          userId: o.userId,
          title: `订单#${o.id}`,
          content: itemNames || '直售订单',
          amount: +o.total || 0,
          status,
          statusLabel: status,
          createdAt: o.createdAt,
          screenshot: o.screenshot,
          blindShipMode: o.blindShipMode,
          rawType: 'sale',
          rawId: o.id,
          isSplit: o.isSplit,
          isMerged: o.isMerged,
        });
      }
    }

    // 3. 拍卖落札（待付款/囤货中）
    if (!source || source === 'auction') {
      const auctions = await this.auctionRepo.find({ where: { state: '待付款' } });
      for (const a of auctions) {
        if (!a.winnerId) continue;
        const user = await this.userRepo.findOneBy({ id: a.winnerId });
        orders.push({
          id: `auction-${a.id}`,
          orderNo: a.orderNo || '',
          source: 'auction',
          sourceLabel: '拍卖',
          cn: user?.cn || '',
          userId: a.winnerId,
          title: a.name,
          content: a.name,
          amount: +a.curPrice || 0,
          status: '待付款',
          statusLabel: '待付款',
          createdAt: new Date(a.wonAt || a.createdAt),
          rawType: 'auction',
          rawId: a.id,
          isSplit: a.isSplit,
          isMerged: a.isMerged,
        });
      }
    }

    // 4. 合并发货单（作为独立订单展示）
    const mergedShipments = await this.mergeRepo.find();
    for (const m of mergedShipments) {
      const user = await this.userRepo.findOneBy({ id: m.ownerId });
      orders.push({
        id: `merge-${m.id}`,
        orderNo: m.mergeGroupId,
        source: 'merge',
        sourceLabel: '合单',
        cn: user?.cn || '',
        userId: m.ownerId,
        title: '合并发货单',
        content: `${m.sourceOrderIds.length}个订单合并`,
        amount: +m.total || 0,
        status: m.status === '待发货' ? '待审核' : m.status,
        statusLabel: m.status,
        createdAt: m.createdAt,
        rawType: 'merge',
        rawId: m.id,
        isSplit: false,
        isMerged: false,
      });
    }

    let result = orders;
    if (filter && filter !== 'all') {
      result = result.filter(o => o.status === filter || o.statusLabel === filter);
    }
    if (q) {
      const lowerQ = q.toLowerCase();
      result = result.filter(o =>
        (o.cn && o.cn.toLowerCase().includes(lowerQ)) ||
        (o.orderNo && o.orderNo.toLowerCase().includes(lowerQ)) ||
        (o.id && o.id.toLowerCase().includes(lowerQ))
      );
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = result.length;
    const start = (page - 1) * size;
    const pageData = result.slice(start, start + size);

    return { total, page, size, data: pageData };
  }

  /** 获取订单详情 */
  async detail(rawType: string, rawId: number) {
    if (rawType === 'kidney') {
      const bill = await this.billRepo.findOneBy({ id: rawId });
      if (!bill) throw new NotFoundException('肾表不存在');
      const user = await this.userRepo.findOneBy({ id: bill.userId });
      const series = await this.seriesRepo.findOneBy({ id: bill.seriesId });
      const items = await this.itemRepo.find({ where: { orderId: bill.orderId } });
      return { ...bill, user, series, items, type: 'kidney' };
    }
    if (rawType === 'sale') {
      const order = await this.orderRepo.findOneBy({ id: rawId });
      if (!order) throw new NotFoundException('直售订单不存在');
      const user = await this.userRepo.findOneBy({ id: order.userId });
      const items = await this.itemRepo.find({ where: { orderId: order.id } });
      const goods = await Promise.all(items.map(async i => {
        const g = await this.saleRepo.findOneBy({ id: i.goodId });
        return { ...i, good: g };
      }));
      return { ...order, user, items: goods, type: 'sale' };
    }
    if (rawType === 'auction') {
      const auction = await this.auctionRepo.findOneBy({ id: rawId });
      if (!auction) throw new NotFoundException('拍卖不存在');
      const user = auction.winnerId ? await this.userRepo.findOneBy({ id: auction.winnerId }) : null;
      return { ...auction, user, type: 'auction' };
    }
    if (rawType === 'merge') {
      const merge = await this.mergeRepo.findOneBy({ id: rawId });
      if (!merge) throw new NotFoundException('合并发货单不存在');
      const user = await this.userRepo.findOneBy({ id: merge.ownerId });
      return { ...merge, user, type: 'merge' };
    }
    throw new BadRequestException('未知订单类型');
  }

  /** 获取直售订单的商品明细（供拆单用） */
  async getSaleOrderItems(orderId: number) {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order || order.seriesId !== 0) throw new NotFoundException('直售订单不存在');
    const items = await this.itemRepo.find({ where: { orderId } });
    const goods = await Promise.all(items.map(async i => {
      const g = await this.saleRepo.findOneBy({ id: i.goodId });
      return { ...i, good: g };
    }));
    return { order, items: goods };
  }

  /** 拆单：直售订单 */
  async splitSale(orderId: number, splitItems: { itemId: number; qty: number }[]) {
    return await this.dataSource.transaction(async manager => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);
      const billRepo = manager.getRepository(KidneyBill);

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order || order.seriesId !== 0) throw new NotFoundException('直售订单不存在');
      if (order.isSplit) throw new BadRequestException('该订单已被拆分');

      const allItems = await itemRepo.find({ where: { orderId } });
      let splitTotal = 0;
      const itemsToMove: OrderItem[] = [];

      for (const si of splitItems) {
        const item = allItems.find(i => i.id === si.itemId);
        if (!item) throw new BadRequestException(`商品项 ${si.itemId} 不存在`);
        if (si.qty <= 0 || si.qty > item.qty) throw new BadRequestException(`拆出数量无效`);
        
        if (si.qty === item.qty) {
          // 全部拆出
          itemsToMove.push(item);
          splitTotal += (+item.price) * item.qty;
        } else {
          // 部分拆出
          splitTotal += (+item.price) * si.qty;
          // 原订单减少数量
          await itemRepo.update(item.id, { qty: item.qty - si.qty });
          // 新订单创建拆出的商品项
          const newItem = itemRepo.create({
            orderId: 0, // 临时，等创建新订单后更新
            goodId: item.goodId,
            name: item.name,
            price: item.price,
            qty: si.qty,
          });
          itemsToMove.push(newItem);
        }
      }

      // 创建新订单
      const newOrder = await orderRepo.save(orderRepo.create({
        userId: order.userId,
        seriesId: 0,
        status: order.status,
        total: splitTotal.toFixed(2),
        parentId: order.id,
        orderNo: await this.generateOrderNo(),
      }));

      // 更新拆出商品项的 orderId
      for (const item of itemsToMove) {
        if (item.orderId === 0) {
          await itemRepo.update(item.id, { orderId: newOrder.id });
        } else {
          await itemRepo.update(item.id, { orderId: newOrder.id });
        }
      }

      // 重新计算原订单金额
      const remainingItems = await itemRepo.find({ where: { orderId } });
      const remainingTotal = remainingItems.reduce((sum, i) => sum + (+i.price) * i.qty, 0);
      
      if (remainingItems.length === 0) {
        // 全部拆完，原订单标记为已拆分
        await orderRepo.update(order.id, { total: '0', isSplit: true, status: '已拆分' });
      } else {
        await orderRepo.update(order.id, { total: remainingTotal.toFixed(2), isSplit: true });
      }

      // 如果原订单有对应的 KidneyBill（直售一般没有，但拼团有），更新肾表
      const oldBill = await billRepo.findOneBy({ orderId: order.id });
      if (oldBill) {
        if (remainingItems.length === 0) {
          await billRepo.update(oldBill.id, { total: '0' });
        } else {
          await billRepo.update(oldBill.id, { total: remainingTotal.toFixed(2) });
        }
      }

      return { ok: true, newOrderId: newOrder.id, newOrderNo: newOrder.orderNo, splitTotal };
    });
  }

  /** 合单：创建合并发货单 */
  async merge(orderIds: string[]) {
    return await this.dataSource.transaction(async manager => {
      const billRepo = manager.getRepository(KidneyBill);
      const orderRepo = manager.getRepository(Order);
      const auctionRepo = manager.getRepository(Auction);
      const mergeRepo = manager.getRepository(MergedShipment);

      // 解析订单
      const orders: { type: string; id: number; userId?: number; total?: number }[] = [];
      let firstUserId: number | undefined;

      for (const orderId of orderIds) {
        const [type, num] = orderId.split('-');
        const id = +num;

        if (type === 'kidney') {
          const bill = await billRepo.findOneBy({ id });
          if (!bill) throw new NotFoundException(`肾表 #${id} 不存在`);
          if (bill.isMerged) throw new BadRequestException(`肾表 #${id} 已被合并`);
          if (firstUserId === undefined) firstUserId = bill.userId;
          if (firstUserId !== bill.userId) throw new BadRequestException('合单必须是同一团员的订单');
          orders.push({ type, id, userId: bill.userId, total: +bill.total });
        } else if (type === 'sale') {
          const order = await orderRepo.findOneBy({ id });
          if (!order || order.seriesId !== 0) throw new NotFoundException(`直售订单 #${id} 不存在`);
          if (order.isMerged) throw new BadRequestException(`直售订单 #${id} 已被合并`);
          if (firstUserId === undefined) firstUserId = order.userId;
          if (firstUserId !== order.userId) throw new BadRequestException('合单必须是同一团员的订单');
          orders.push({ type, id, userId: order.userId, total: +order.total });
        } else if (type === 'auction') {
          const auction = await auctionRepo.findOneBy({ id });
          if (!auction) throw new NotFoundException(`拍卖 #${id} 不存在`);
          if (auction.isMerged) throw new BadRequestException(`拍卖 #${id} 已被合并`);
          if (!auction.winnerId) throw new BadRequestException(`拍卖 #${id} 无中标者`);
          if (firstUserId === undefined) firstUserId = auction.winnerId;
          if (firstUserId !== auction.winnerId) throw new BadRequestException('合单必须是同一团员的订单');
          orders.push({ type, id, userId: auction.winnerId, total: +auction.curPrice });
        } else {
          throw new BadRequestException(`未知订单类型: ${type}`);
        }
      }

      // 生成合单组号
      const mergeGroupId = await this.generateMergeGroupId();
      const total = orders.reduce((sum, o) => sum + (o.total || 0), 0);

      // 创建合并发货单
      const mergeShipment = await mergeRepo.save(mergeRepo.create({
        mergeGroupId,
        ownerId: firstUserId!,
        sourceOrderIds: orderIds,
        total: total.toFixed(2),
        freight: '0',
        packFee: '0',
        status: '待发货',
      }));

      // 标记原始订单为已合并
      for (const o of orders) {
        if (o.type === 'kidney') await billRepo.update(o.id, { isMerged: true, mergeId: mergeShipment.id });
        else if (o.type === 'sale') await orderRepo.update(o.id, { isMerged: true, mergeId: mergeShipment.id });
        else if (o.type === 'auction') await auctionRepo.update(o.id, { isMerged: true, mergeId: mergeShipment.id });
      }

      return { ok: true, mergeGroupId, mergeId: mergeShipment.id, total, orderCount: orders.length };
    });
  }

  /** 生成统一订单号 */
  private async generateOrderNo(): Promise<string> {
    const allBills = await this.billRepo.find({ where: { orderNo: Not('') } });
    const allSales = await this.orderRepo.find({ where: { orderNo: Not(''), seriesId: 0 } });
    const allAuctions = await this.auctionRepo.find({ where: { orderNo: Not('') } });
    const allMerges = await this.mergeRepo.find();

    const nums = [
      ...allBills.map(b => this.extractNum(b.orderNo)),
      ...allSales.map(s => this.extractNum(s.orderNo)),
      ...allAuctions.map(a => this.extractNum(a.orderNo)),
      ...allMerges.map(m => this.extractNum(m.mergeGroupId)),
    ].filter(n => n > 0);

    const maxNum = nums.length ? Math.max(...nums) : 0;
    return `O${String(maxNum + 1).padStart(3, '0')}`;
  }

  /** 生成合单组号 */
  private async generateMergeGroupId(): Promise<string> {
    const allMerges = await this.mergeRepo.find();
    const nums = allMerges.map(m => {
      const match = m.mergeGroupId.match(/MG(\d+)/);
      return match ? +match[1] : 0;
    }).filter(n => n > 0);

    const maxNum = nums.length ? Math.max(...nums) : 0;
    return `MG${String(maxNum + 1).padStart(3, '0')}`;
  }

  private extractNum(s: string): number {
    const match = s.match(/O(\d+)/);
    return match ? +match[1] : 0;
  }

  /** 为现有无单号订单生成单号 */
  async ensureOrderNo() {
    const bills = await this.billRepo.find({ where: { orderNo: '' } });
    for (const b of bills) {
      await this.billRepo.update(b.id, { orderNo: await this.generateOrderNo() });
    }
    const sales = await this.orderRepo.find({ where: { orderNo: '', seriesId: 0 } });
    for (const s of sales) {
      await this.orderRepo.update(s.id, { orderNo: await this.generateOrderNo() });
    }
    const auctions = await this.auctionRepo.find({ where: { orderNo: '' } });
    for (const a of auctions) {
      await this.auctionRepo.update(a.id, { orderNo: await this.generateOrderNo() });
    }
    return { ok: true };
  }
}

@Controller('api/orders')
export class OrderController {
  constructor(private svc: OrderService) {}

  @Get()
  async list(
    @Req() req: Request & { user?: JwtUser },
    @Query('filter') filter?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    checkRole(req.user, ['owner']);
    return this.svc.list(filter || 'all', source, q, +(page || 1), +(size || 20));
  }

  @Get(':rawType/:rawId')
  async detail(
    @Req() req: Request & { user?: JwtUser },
    @Param('rawType') rawType: string,
    @Param('rawId') rawId: string,
  ) {
    checkRole(req.user, ['owner']);
    return this.svc.detail(rawType, +rawId);
  }

  @Get('items/sale/:orderId')
  async getSaleItems(
    @Req() req: Request & { user?: JwtUser },
    @Param('orderId') orderId: string,
  ) {
    checkRole(req.user, ['owner']);
    return this.svc.getSaleOrderItems(+orderId);
  }

  @Post('split/:rawType/:rawId')
  async split(
    @Req() req: Request & { user?: JwtUser },
    @Param('rawType') rawType: string,
    @Param('rawId') rawId: string,
    @Body() body: { items: { itemId: number; qty: number }[] },
  ) {
    checkRole(req.user, ['owner']);
    if (!body.items || !body.items.length) {
      throw new BadRequestException('请选择要拆出的商品');
    }
    if (rawType === 'sale') {
      return this.svc.splitSale(+rawId, body.items);
    }
    throw new BadRequestException('该类型暂不支持拆单');
  }

  @Post('merge')
  async merge(
    @Req() req: Request & { user?: JwtUser },
    @Body() body: { orderIds: string[] },
  ) {
    checkRole(req.user, ['owner']);
    if (!body.orderIds || body.orderIds.length < 2) {
      throw new BadRequestException('至少需要2个订单才能合单');
    }
    return this.svc.merge(body.orderIds);
  }

  @Post('ensure-order-no')
  async ensureOrderNo(@Req() req: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner']);
    return this.svc.ensureOrderNo();
  }
}

export const OrderModuleRef = TypeOrmModule.forFeature([Order, KidneyBill, Auction, User, Series, SaleGood, OrderItem, MergedShipment, Clearing]);

import { Controller, Get, Post, Body, Param, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Order, KidneyBill, Auction, User, Series, SaleGood, OrderItem } from '../entities';
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
  ) {}

  /**
   * 统一订单聚合查询
   * @param filter 筛选状态：all/待付款/待审核/已销账/囤货中/已发货/已完成/已取消
   * @param source 来源筛选：group/sale/auction
   * @param q 团员CN或单号模糊搜索
   */
  async list(filter: string, source?: string, q?: string, page = 1, size = 20) {
    const orders: any[] = [];

    // 1. 肾表（拼团）
    if (!source || source === 'group') {
      const bills = await this.billRepo.find();
      for (const b of bills) {
        const user = await this.userRepo.findOneBy({ id: b.userId });
        const series = await this.seriesRepo.findOneBy({ id: b.seriesId });
        // 状态映射：待付款/已提交截图 → 待审核；已销账 → 已销账；打回 → 已取消
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
          title: series?.name || '拼团订单',
          content: `${series?.name || '未知系列'} 肾表`,
          amount: +b.total || 0,
          status,
          statusLabel: status,
          createdAt: b.createdAt,
          screenshot: b.screenshot,
          rawType: 'kidney',
          rawId: b.id,
        });
      }
    }

    // 2. 直售订单
    if (!source || source === 'sale') {
      const saleOrders = await this.orderRepo.find({ where: { seriesId: 0 } });
      for (const o of saleOrders) {
        const user = await this.userRepo.findOneBy({ id: o.userId });
        const items = await this.itemRepo.find({ where: { orderId: o.id } });
        // 状态映射
        let status = o.status;
        if (o.status === '待付款') status = '待审核';
        if (o.status === '跟排中') continue; // 拼团跟排不算直售订单

        const itemNames = items.map(i => i.name).join('、');
        orders.push({
          id: `sale-${o.id}`,
          orderNo: o.orderNo || '',
          source: 'sale',
          sourceLabel: '直售',
          cn: user?.cn || '',
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
        });
      }
    }

    // 3. 拍卖落札（待付款状态）
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
          title: a.name,
          content: a.name,
          amount: +a.curPrice || 0,
          status: '待付款',
          statusLabel: '待付款',
          createdAt: new Date(a.wonAt || a.createdAt),
          rawType: 'auction',
          rawId: a.id,
        });
      }
    }

    // 筛选
    let result = orders;
    if (filter && filter !== 'all') {
      result = result.filter(o => o.status === filter);
    }
    if (q) {
      const lowerQ = q.toLowerCase();
      result = result.filter(o =>
        (o.cn && o.cn.toLowerCase().includes(lowerQ)) ||
        (o.orderNo && o.orderNo.toLowerCase().includes(lowerQ)) ||
        (o.id && o.id.toLowerCase().includes(lowerQ))
      );
    }

    // 排序：最新在前
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
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
    throw new BadRequestException('未知订单类型');
  }

  /** 拆单 */
  async split(rawType: string, rawId: number, items: { name: string; qty: number; price: number }[]) {
    // 简化实现：仅记录拆单标记，实际业务逻辑由对应模块处理
    if (rawType === 'kidney') {
      await this.billRepo.update(rawId, { isSplit: true, parentId: rawId });
      // 生成子订单记录（简化：实际应在对应模块创建子订单）
      return { ok: true, message: '拆单已标记' };
    }
    if (rawType === 'sale') {
      await this.orderRepo.update(rawId, { isSplit: true, parentId: rawId });
      return { ok: true, message: '拆单已标记' };
    }
    throw new BadRequestException('该类型不支持拆单');
  }

  /** 合单 */
  async merge(orderIds: string[]) {
    // 解析订单ID
    const orders = orderIds.map(id => {
      const [type, num] = id.split('-');
      return { type, id: +num };
    });

    // 校验是否同团员
    const cns = new Set<string>();
    for (const o of orders) {
      let user;
      if (o.type === 'kidney') {
        const bill = await this.billRepo.findOneBy({ id: o.id });
        user = bill ? await this.userRepo.findOneBy({ id: bill.userId }) : null;
      } else if (o.type === 'sale') {
        const order = await this.orderRepo.findOneBy({ id: o.id });
        user = order ? await this.userRepo.findOneBy({ id: order.userId }) : null;
      }
      if (user) cns.add(user.cn);
    }

    if (cns.size > 1) {
      throw new BadRequestException('合单必须是同一团员的订单');
    }

    // 标记为已合并（简化实现）
    for (const o of orders) {
      if (o.type === 'kidney') {
        await this.billRepo.update(o.id, { isMerged: true });
      } else if (o.type === 'sale') {
        await this.orderRepo.update(o.id, { isMerged: true });
      }
    }

    return { ok: true, message: '合单已标记', mergedCount: orders.length };
  }

  /** 生成统一订单号（首次访问时自动生成） */
  async ensureOrderNo() {
    const bills = await this.billRepo.find({ where: { orderNo: '' } });
    const sales = await this.orderRepo.find({ where: { orderNo: '', seriesId: 0 } });
    const auctions = await this.auctionRepo.find({ where: { orderNo: '', state: '待付款' } });

    let counter = 1;
    for (const b of bills) {
      await this.billRepo.update(b.id, { orderNo: `O${String(counter++).padStart(3, '0')}` });
    }
    for (const s of sales) {
      await this.orderRepo.update(s.id, { orderNo: `O${String(counter++).padStart(3, '0')}` });
    }
    for (const a of auctions) {
      await this.auctionRepo.update(a.id, { orderNo: `O${String(counter++).padStart(3, '0')}` });
    }

    return { generated: counter - 1 };
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

  @Post('split/:rawType/:rawId')
  async split(
    @Req() req: Request & { user?: JwtUser },
    @Param('rawType') rawType: string,
    @Param('rawId') rawId: string,
    @Body() body: { items: { name: string; qty: number; price: number }[] },
  ) {
    checkRole(req.user, ['owner']);
    return this.svc.split(rawType, +rawId, body.items || []);
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
  async ensureOrderNo(@Req() req?: Request & { user?: JwtUser }) {
    checkRole(req.user, ['owner']);
    return this.svc.ensureOrderNo();
  }
}

export const OrderModuleRef = TypeOrmModule.forFeature([Order, KidneyBill, Auction, User, Series, SaleGood, OrderItem]);

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/** 金额统一 DECIMAL(10,2)，以字符串形式读写，杜绝浮点误差 */
export class Money {
  static of(n: number | string): string {
    return (+n).toFixed(2);
  }
}

@Entity('users')
@Index(['cn'], { unique: true })
@Index(['account'], { unique: true })
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column() account: string;
  @Column() passwordHash: string;
  @Column({ length: 32 }) cn: string;              // 圈名，唯一且不可更改
  @Column({ default: '' }) qq: string;
  @Column({ default: '' }) wechat: string;
  @Column({ default: 'member' }) role: 'owner' | 'admin' | 'member'; // 店主/管理员/团员
  @Column({ default: '' }) adminPerms: string;     // 管理员授权模块，逗号分隔
  @Column({ default: false }) banned: boolean;
  @Column({ default: '' }) bannedReason: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) balance: string;
  @Column({ default: '' }) registerIp: string;
  @Column({ default: '' }) registerDevice: string;
  @CreateDateColumn() createdAt: Date;
}

/** 余额流水：append-only，只插入不更新 */
@Entity('balance_flows')
export class BalanceFlow {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string; // 正=入账 负=扣减
  @Column() type: string;   // 拍卖成交/多付/售后/抵扣/提现/保证金/转单转款...
  @Column({ default: '' }) note: string;
  @Column({ default: '' }) refId: string;
  @CreateDateColumn() createdAt: Date;
}

/** 站内消息 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column() title: string;
  @Column({ default: '' }) body: string;
  @Column({ default: false }) read: boolean;
  @CreateDateColumn() createdAt: Date;
}

/** 店铺设置（单行） */
@Entity('shop_config')
export class ShopConfig {
  @PrimaryGeneratedColumn() id: number;
  // 拼团囤货规则
  @Column({ default: 30 }) groupFreeDays: number;      // 拼团免费囤货天数
  @Column({ default: true }) groupOverFeeOn: boolean;    // 拼团超期是否收费
  @Column({ default: 90 }) groupOverDays: number;        // 拼团超期转拍卖天数
  // 直售囤货规则
  @Column({ default: 7 }) saleFreeDays: number;        // 直售免费囤货天数
  @Column({ default: true }) saleOverFeeOn: boolean;     // 直售超期是否收费
  @Column({ default: 30 }) saleOverDays: number;        // 直售超期转拍卖天数
  @Column({ default: 7 }) afterSaleDays: number;        // 售后时限（天）
  @Column({ type: 'text', default: '[{"name":"包邮","amt":0,"on":true},{"name":"非偏","amt":8,"on":true},{"name":"偏远","amt":12,"on":true}]' }) freights: string;
  @Column({ type: 'text', default: '[{"name":"普通气泡膜","amt":2,"on":true},{"name":"加固打包","amt":4,"on":true},{"name":"超加固+亚克力隔层","amt":6,"on":true}]' }) packs: string;
  @Column({ type: 'text', default: '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]' }) unitFees: string;
  @Column({ default: '' }) payCodeAli: string;
}

/** 拼团系列 */
@Entity('series')
export class Series {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ default: '' }) ip: string;
  @Column({ default: '' }) cover: string;              // 封面图URL
  @Column({ default: '' }) emoji: string;              // 封面占位emoji
  @Column({ default: '预排' }) status: '预排' | '进行中' | '已截团' | '流团';
  @Column({ default: '' }) eta: string;                // 预计到货
  @Column({ default: '' }) freightRule: string;
  @Column({ default: 'traditional' }) mode: 'traditional' | 'matching'; // 截团模式：traditional=传统截团，matching=成配
  @Column({ type: 'timestamp', nullable: true }) deadlineAt: Date | null;    // 截团截止时间
  @Column({ default: '' }) deadline: string;           // 截团时间说明（兼容旧数据）
  @Column({ default: true }) allowTransfer: boolean;    // 是否允许转单
  @Column({ default: true }) transferNeedAudit: boolean;
  @Column({ default: '' }) payCodeWx: string;
  @Column({ default: '' }) payCodeAli: string;
  @CreateDateColumn() createdAt: Date;
}

/** 系列内谷子（排表行） */
@Entity('goods')
@Index(['seriesId'])
export class Good {
  @PrimaryGeneratedColumn() id: number;
  @Column() seriesId: number;
  @Column() name: string;
  @Column({ default: '' }) cat: string;                // 团长自定义分类（标签栏自动生成）
  @Column({ default: '' }) img: string;
  @Column({ default: '🎁' }) emoji: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: string;
  @Column({ default: '0.1' }) unitFee: string;          // 品类日囤货费率(元/件/天)
  @Column({ default: 0 }) limit: number;               // 可排
  @Column({ default: 0 }) booked: number;              // 已排
  @Column({ default: '未到货' }) arrived: '未到货' | '已到货' | '部分到货';
  @CreateDateColumn() createdAt: Date;
}

/** 跟排订单：截团前可改，截团生成肾表 */
@Entity('orders')
@Index(['userId'])
@Index(['seriesId'])
export class Order {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column() seriesId: number;
  @Column({ default: '跟排中' }) status: string;       // 跟排中/待付款/囤货中/待清货/已发货/已完成/已取消
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) total: string;
  @Column({ default: '', type: 'text' }) opLog: string; // 操作留痕
  @Column({ default: '' }) blindShipMode: string;        // 'video' | 'random' | ''  盲抽发货模式
  @Column({ default: '' }) screenshot: string;           // 付款截图（直售订单）
  @Column({ type: 'timestamp', nullable: true }) paidAt: Date | null;     // 付款入囤时间
  @Column({ type: 'timestamp', nullable: true }) cancelRequestAt: Date | null; // 直售取消申请时间
  @CreateDateColumn() createdAt: Date;
}

/** 订单明细（含谷序，支撑转单） */
@Entity('order_items')
@Index(['orderId'])
export class OrderItem {
  @PrimaryGeneratedColumn() id: number;
  @Column() orderId: number;
  @Column() goodId: number;
  @Column() name: string;                              // 快照
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: string;
  @Column({ default: 1 }) qty: number;
  @Column({ default: '' }) seqs: string;               // 谷序，如 "1,2,3"
  @Column({ default: '' }) status: string;            // 砍单状态：砍单/''
}

/** 肾表（截团生成，统一收款） */
@Entity('kidney_bills')
@Index(['userId'])
export class KidneyBill {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column() seriesId: number;
  @Column() orderId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) total: string;
  @Column({ default: '待付款' }) state: '待付款' | '已提交截图' | '已销账';
  @Column({ default: '' }) screenshot: string;
  @Column({ default: '' }) auditNote: string;
  @Column({ default: '', type: 'text' }) opLog: string;
  @CreateDateColumn() createdAt: Date;
}

/** 二次收肾账单 */
@Entity('second_bills')
export class SecondBill {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column() title: string;
  @Column() calc: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string;
  @Column({ default: '待付款' }) state: '待付款' | '已提交截图' | '已完成';
  @Column({ default: '' }) screenshot: string;
  @CreateDateColumn() createdAt: Date;
}

/** 直售谷子 */
@Entity('sale_goods')
export class SaleGood {
  @PrimaryGeneratedColumn() id: number;
  @Column({ default: '' }) no: string;                 // 唯一编号
  @Column() name: string;
  @Column({ default: '' }) ip: string;
  @Column({ default: '全新未拆单领' }) cat: '中古' | '盲抽' | '全新未拆单领';
  @Column({ default: '' }) img: string;
  @Column({ default: '🎁' }) emoji: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: string;
  @Column({ default: 1 }) stock: number;
  @Column({ default: '0.1' }) unitFee: string;          // 品类日囤货费率(元/件/天)
  @Column({ default: '店主' }) ownerCn: string;        // 所属者CN
  @Column({ default: '' }) statusText: string;         // 店主自定义状态文本
  @CreateDateColumn() createdAt: Date;
}

/** 拍卖 */
@Entity('auctions')
export class Auction {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ default: '' }) img: string;
  @Column({ default: '🎁' }) emoji: string;
  @Column({ default: '' }) desc: string;
  @Column({ default: '' }) remark: string;
  @Column({ default: '单独新增' }) src: string;         // 来源
  @Column({ default: 0 }) srcUserId: number;           // 囤货过期来源归属（款项计入其余额）
  @Column({ type: 'decimal', precision: 10, scale: 2 }) startPrice: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) stepPrice: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) buyNow: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) deposit: string;
  @Column({ type: 'bigint' }) startTime: number;       // 开拍时间戳(ms)
  @Column({ type: 'bigint' }) endTime: number;         // 截止时间戳(ms)
  @Column({ default: '待开拍' }) state: '待开拍' | '拍卖中' | '已成交' | '流拍' | '待付款' | '已付款' | '囤货中';
  @Column({ nullable: true }) winnerId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) curPrice: string;
  @Column({ default: 0 }) bidCount: number;
  @Column({ type: 'bigint', default: 0 }) wonAt: number;  // 进入"待付款"状态的时间戳(ms)，用于超时计算
  @Column({ type: 'timestamp', nullable: true }) stockSince: Date | null;  // 付款入囤时间
  @CreateDateColumn() createdAt: Date;
}

/** 拍卖出价（只插入，当前价由最新一条推导） */
@Entity('auction_bids')
@Index(['auctionId'])
export class AuctionBid {
  @PrimaryGeneratedColumn() id: number;
  @Column() auctionId: number;
  @Column() userId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: string;
  @CreateDateColumn() createdAt: Date;
}

/** 拍卖保证金 */
@Entity('auction_deposits')
@Index(['auctionId', 'userId'])
export class AuctionDeposit {
  @PrimaryGeneratedColumn() id: number;
  @Column() auctionId: number;
  @Column() userId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string;
  @Column({ default: '待审核' }) state: '待审核' | '已缴' | '已退' | '已抵扣' | '已没收';
  @Column({ default: '' }) screenshot: string;       // 转账截图
  @Column({ default: '' }) auditNote: string;        // 审核备注
  @CreateDateColumn() createdAt: Date;
}

/** 转单 */
@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn() id: number;
  @Column() seriesId: number;
  @Column() goodId: number;
  @Column() name: string;
  @Column({ default: 1 }) seq: number;                 // 谷序（拼团转单有效）
  @Column({ default: 0 }) orderId: number;              // 直售订单ID（直售转单有效，拼团为0）
  @Column() fromUserId: number;
  @Column() toUserId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: string;
  @Column({ default: 'owner' }) way: 'private' | 'owner'; // 私下交易/店主结算
  @Column({ default: '待接收者确认' }) state: string;
  @Column({ type: 'bigint' }) deadline: number;        // 环节超时时间戳
  @CreateDateColumn() createdAt: Date;
}

/** 清货排发 */
@Entity('clearings')
export class Clearing {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column({ type: 'text' }) items: string;             // 谷子明细json
  @Column() freightName: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) freightAmt: string;
  @Column() packName: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) packAmt: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) overFee: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0' }) total: string;
  @Column({ default: '待付款' }) state: string;        // 待付款/已提交截图/审核通过/已发货/已完成/打回
  @Column({ default: '' }) screenshot: string;
  @Column({ default: '' }) packImg: string;
  @Column({ default: '' }) trackingNo: string;
  @Column({ default: '' }) addressSnapshot: string;     // 清货时收货地址快照(json)
  @Column({ type: 'timestamp', nullable: true }) shippedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}

/** 售后单 */
@Entity('after_sales')
export class AfterSale {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column({ default: '' }) orderId: string;
  @Column() type: '漏发' | '错发';
  @Column({ default: '' }) goods: string;
  @Column() way: '退货' | '换货';
  @Column({ default: '' }) video: string;              // 开箱视频URL（私有桶签名）
  @Column({ default: '' }) note: string;
  @Column({ default: '待审核' }) state: string;
  @CreateDateColumn() createdAt: Date;
}

/** 提现申请 */
@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: string;
  @Column({ default: '' }) method: string;             // 收款方式
  @Column({ default: '待处理' }) state: '待处理' | '已完成' | '已拒绝';
  @CreateDateColumn() createdAt: Date;
}

/** 收货地址 */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column({ length: 32 }) recipientName: string;      // 收件人姓名
  @Column({ length: 20 }) phone: string;               // 手机号
  @Column({ length: 120 }) region: string;             // 省市区，如「浙江省杭州市西湖区」
  @Column({ length: 255 }) detail: string;            // 详细地址
  @Column({ default: false }) isDefault: boolean;
  @CreateDateColumn() createdAt: Date;
}
/** 管理员操作审计日志 */
@Entity('admin_logs')
export class AdminLog {
  @PrimaryGeneratedColumn() id: number;
  @Column() action: string;
  @Column() targetId: number;
  @Column({ default: '' }) targetName: string;
  @Column() operatorId: number;
  @Column({ default: '' }) operatorCn: string;
  @Column({ default: '' }) details: string;
  @CreateDateColumn() createdAt: Date;
}

export const entities = [
  User, BalanceFlow, Notification, ShopConfig, Series, Good, Order, OrderItem,
  KidneyBill, SecondBill, SaleGood, Auction, AuctionBid, AuctionDeposit,
  Transfer, Clearing, AfterSale, Withdrawal, Address, AdminLog,
];

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.MergedShipment = exports.AdminLog = exports.Address = exports.Withdrawal = exports.AfterSale = exports.Clearing = exports.Transfer = exports.AuctionDeposit = exports.AuctionBid = exports.Auction = exports.SaleGood = exports.SecondBill = exports.KidneyBill = exports.OrderItem = exports.Order = exports.Good = exports.Series = exports.ShopConfig = exports.Notification = exports.BalanceFlow = exports.User = exports.Money = void 0;
const typeorm_1 = require("typeorm");
/** 金额统一 DECIMAL(10,2)，以字符串形式读写，杜绝浮点误差 */
class Money {
    static of(n) {
        return (+n).toFixed(2);
    }
}
exports.Money = Money;
let User = class User {
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], User.prototype, "account", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], User.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], User.prototype, "cn", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "qq", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "wechat", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'member' }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "adminPerms", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "banned", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "bannedReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", String)
], User.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "registerIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], User.prototype, "registerDevice", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users'),
    (0, typeorm_1.Index)(['cn'], { unique: true }),
    (0, typeorm_1.Index)(['account'], { unique: true })
], User);
/** 余额流水：append-only，只插入不更新 */
let BalanceFlow = class BalanceFlow {
};
exports.BalanceFlow = BalanceFlow;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], BalanceFlow.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], BalanceFlow.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], BalanceFlow.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], BalanceFlow.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], BalanceFlow.prototype, "note", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], BalanceFlow.prototype, "refId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], BalanceFlow.prototype, "createdAt", void 0);
exports.BalanceFlow = BalanceFlow = __decorate([
    (0, typeorm_1.Entity)('balance_flows'),
    (0, typeorm_1.Index)(['userId'])
], BalanceFlow);
/** 站内消息 */
let Notification = class Notification {
};
exports.Notification = Notification;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Notification.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Notification.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Notification.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Notification.prototype, "body", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Notification.prototype, "read", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Notification.prototype, "createdAt", void 0);
exports.Notification = Notification = __decorate([
    (0, typeorm_1.Entity)('notifications'),
    (0, typeorm_1.Index)(['userId'])
], Notification);
/** 店铺设置（单行） */
let ShopConfig = class ShopConfig {
};
exports.ShopConfig = ShopConfig;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ShopConfig.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 30 }),
    __metadata("design:type", Number)
], ShopConfig.prototype, "groupFreeDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ShopConfig.prototype, "groupOverFeeOn", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 90 }),
    __metadata("design:type", Number)
], ShopConfig.prototype, "groupOverDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 7 }),
    __metadata("design:type", Number)
], ShopConfig.prototype, "saleFreeDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ShopConfig.prototype, "saleOverFeeOn", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 30 }),
    __metadata("design:type", Number)
], ShopConfig.prototype, "saleOverDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 7 }),
    __metadata("design:type", Number)
], ShopConfig.prototype, "afterSaleDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: '[{"name":"包邮","amt":0,"on":true},{"name":"非偏","amt":8,"on":true},{"name":"偏远","amt":12,"on":true}]' }),
    __metadata("design:type", String)
], ShopConfig.prototype, "freights", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: '[{"name":"普通气泡膜","amt":2,"on":true},{"name":"加固打包","amt":4,"on":true},{"name":"超加固+亚克力隔层","amt":6,"on":true}]' }),
    __metadata("design:type", String)
], ShopConfig.prototype, "packs", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]' }),
    __metadata("design:type", String)
], ShopConfig.prototype, "unitFees", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], ShopConfig.prototype, "payCodeAli", void 0);
exports.ShopConfig = ShopConfig = __decorate([
    (0, typeorm_1.Entity)('shop_config')
], ShopConfig);
/** 拼团系列 */
let Series = class Series {
};
exports.Series = Series;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Series.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Series.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "ip", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "cover", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "emoji", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '预排' }),
    __metadata("design:type", String)
], Series.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "eta", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "freightRule", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'traditional' }),
    __metadata("design:type", String)
], Series.prototype, "mode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Series.prototype, "deadlineAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "deadline", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Series.prototype, "allowTransfer", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Series.prototype, "transferNeedAudit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "payCodeWx", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Series.prototype, "payCodeAli", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Series.prototype, "createdAt", void 0);
exports.Series = Series = __decorate([
    (0, typeorm_1.Entity)('series'),
    (0, typeorm_1.Index)(['status'])
], Series);
/** 系列内谷子（排表行） */
let Good = class Good {
};
exports.Good = Good;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Good.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Good.prototype, "seriesId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Good.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Good.prototype, "cat", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Good.prototype, "img", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '🎁' }),
    __metadata("design:type", String)
], Good.prototype, "emoji", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Good.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '0.1' }),
    __metadata("design:type", String)
], Good.prototype, "unitFee", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Good.prototype, "limit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Good.prototype, "booked", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '未到货' }),
    __metadata("design:type", String)
], Good.prototype, "arrived", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Good.prototype, "createdAt", void 0);
exports.Good = Good = __decorate([
    (0, typeorm_1.Entity)('goods'),
    (0, typeorm_1.Index)(['seriesId'])
], Good);
/** 跟排订单：截团前可改，截团生成肾表 */
let Order = class Order {
};
exports.Order = Order;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Order.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Order.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Order.prototype, "seriesId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '跟排中' }),
    __metadata("design:type", String)
], Order.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Order.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '', type: 'text' }),
    __metadata("design:type", String)
], Order.prototype, "opLog", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Order.prototype, "blindShipMode", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Order.prototype, "screenshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Order.prototype, "paidAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Order.prototype, "cancelRequestAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Order.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Order.prototype, "parentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Order.prototype, "mergeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Order.prototype, "isSplit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Order.prototype, "isMerged", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Order.prototype, "createdAt", void 0);
exports.Order = Order = __decorate([
    (0, typeorm_1.Entity)('orders'),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['seriesId']),
    (0, typeorm_1.Index)(['userId', 'status'])
], Order);
/** 订单明细（含谷序，支撑转单） */
let OrderItem = class OrderItem {
};
exports.OrderItem = OrderItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], OrderItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], OrderItem.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], OrderItem.prototype, "goodId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], OrderItem.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], OrderItem.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], OrderItem.prototype, "qty", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], OrderItem.prototype, "seqs", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], OrderItem.prototype, "status", void 0);
exports.OrderItem = OrderItem = __decorate([
    (0, typeorm_1.Entity)('order_items'),
    (0, typeorm_1.Index)(['orderId'])
], OrderItem);
/** 肾表（截团生成，统一收款） */
let KidneyBill = class KidneyBill {
};
exports.KidneyBill = KidneyBill;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], KidneyBill.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], KidneyBill.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], KidneyBill.prototype, "seriesId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], KidneyBill.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], KidneyBill.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待付款' }),
    __metadata("design:type", String)
], KidneyBill.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], KidneyBill.prototype, "screenshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], KidneyBill.prototype, "auditNote", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '', type: 'text' }),
    __metadata("design:type", String)
], KidneyBill.prototype, "opLog", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], KidneyBill.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], KidneyBill.prototype, "parentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], KidneyBill.prototype, "mergeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], KidneyBill.prototype, "isSplit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], KidneyBill.prototype, "isMerged", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], KidneyBill.prototype, "createdAt", void 0);
exports.KidneyBill = KidneyBill = __decorate([
    (0, typeorm_1.Entity)('kidney_bills'),
    (0, typeorm_1.Index)(['userId'])
], KidneyBill);
/** 二次收肾账单 */
let SecondBill = class SecondBill {
};
exports.SecondBill = SecondBill;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SecondBill.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], SecondBill.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SecondBill.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SecondBill.prototype, "calc", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], SecondBill.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待付款' }),
    __metadata("design:type", String)
], SecondBill.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], SecondBill.prototype, "screenshot", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SecondBill.prototype, "createdAt", void 0);
exports.SecondBill = SecondBill = __decorate([
    (0, typeorm_1.Entity)('second_bills')
], SecondBill);
/** 直售谷子 */
let SaleGood = class SaleGood {
};
exports.SaleGood = SaleGood;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SaleGood.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], SaleGood.prototype, "no", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SaleGood.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], SaleGood.prototype, "ip", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '全新未拆单领' }),
    __metadata("design:type", String)
], SaleGood.prototype, "cat", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], SaleGood.prototype, "img", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '🎁' }),
    __metadata("design:type", String)
], SaleGood.prototype, "emoji", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], SaleGood.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], SaleGood.prototype, "stock", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '0.1' }),
    __metadata("design:type", String)
], SaleGood.prototype, "unitFee", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '店主' }),
    __metadata("design:type", String)
], SaleGood.prototype, "ownerCn", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 4, scale: 2, default: '0.00' }),
    __metadata("design:type", String)
], SaleGood.prototype, "commissionRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], SaleGood.prototype, "statusText", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SaleGood.prototype, "createdAt", void 0);
exports.SaleGood = SaleGood = __decorate([
    (0, typeorm_1.Entity)('sale_goods'),
    (0, typeorm_1.Index)(['stock'])
], SaleGood);
/** 拍卖 */
let Auction = class Auction {
};
exports.Auction = Auction;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Auction.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Auction.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Auction.prototype, "img", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '🎁' }),
    __metadata("design:type", String)
], Auction.prototype, "emoji", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Auction.prototype, "desc", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Auction.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '单独新增' }),
    __metadata("design:type", String)
], Auction.prototype, "src", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "srcUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Auction.prototype, "startPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Auction.prototype, "stepPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Auction.prototype, "buyNow", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Auction.prototype, "deposit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Auction.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Auction.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待开拍' }),
    __metadata("design:type", String)
], Auction.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Auction.prototype, "winnerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Auction.prototype, "curPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "bidCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "wonAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Auction.prototype, "stockSince", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Auction.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "parentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "mergeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Auction.prototype, "isSplit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Auction.prototype, "isMerged", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Auction.prototype, "createdAt", void 0);
exports.Auction = Auction = __decorate([
    (0, typeorm_1.Entity)('auctions'),
    (0, typeorm_1.Index)(['state'])
], Auction);
/** 拍卖出价（只插入，当前价由最新一条推导） */
let AuctionBid = class AuctionBid {
};
exports.AuctionBid = AuctionBid;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], AuctionBid.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AuctionBid.prototype, "auctionId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AuctionBid.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], AuctionBid.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AuctionBid.prototype, "createdAt", void 0);
exports.AuctionBid = AuctionBid = __decorate([
    (0, typeorm_1.Entity)('auction_bids'),
    (0, typeorm_1.Index)(['auctionId']),
    (0, typeorm_1.Index)(['auctionId', 'userId'])
], AuctionBid);
/** 拍卖保证金 */
let AuctionDeposit = class AuctionDeposit {
};
exports.AuctionDeposit = AuctionDeposit;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], AuctionDeposit.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AuctionDeposit.prototype, "auctionId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AuctionDeposit.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], AuctionDeposit.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待审核' }),
    __metadata("design:type", String)
], AuctionDeposit.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AuctionDeposit.prototype, "screenshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AuctionDeposit.prototype, "auditNote", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AuctionDeposit.prototype, "createdAt", void 0);
exports.AuctionDeposit = AuctionDeposit = __decorate([
    (0, typeorm_1.Entity)('auction_deposits'),
    (0, typeorm_1.Index)(['auctionId', 'userId'])
], AuctionDeposit);
/** 转单 */
let Transfer = class Transfer {
};
exports.Transfer = Transfer;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Transfer.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Transfer.prototype, "seriesId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Transfer.prototype, "goodId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Transfer.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Transfer.prototype, "seq", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Transfer.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Transfer.prototype, "fromUserId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Transfer.prototype, "toUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Transfer.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'owner' }),
    __metadata("design:type", String)
], Transfer.prototype, "way", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待接收者确认' }),
    __metadata("design:type", String)
], Transfer.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Transfer.prototype, "deadline", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Transfer.prototype, "createdAt", void 0);
exports.Transfer = Transfer = __decorate([
    (0, typeorm_1.Entity)('transfers'),
    (0, typeorm_1.Index)(['seriesId'])
], Transfer);
/** 清货排发 */
let Clearing = class Clearing {
};
exports.Clearing = Clearing;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Clearing.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Clearing.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Clearing.prototype, "items", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Clearing.prototype, "freightName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Clearing.prototype, "freightAmt", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Clearing.prototype, "packName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Clearing.prototype, "packAmt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Clearing.prototype, "overFee", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: '0' }),
    __metadata("design:type", String)
], Clearing.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待付款' }),
    __metadata("design:type", String)
], Clearing.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Clearing.prototype, "screenshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Clearing.prototype, "packImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Clearing.prototype, "trackingNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Clearing.prototype, "addressSnapshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Clearing.prototype, "shippedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Clearing.prototype, "createdAt", void 0);
exports.Clearing = Clearing = __decorate([
    (0, typeorm_1.Entity)('clearings'),
    (0, typeorm_1.Index)(['userId'])
], Clearing);
/** 售后单 */
let AfterSale = class AfterSale {
};
exports.AfterSale = AfterSale;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], AfterSale.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AfterSale.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AfterSale.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AfterSale.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AfterSale.prototype, "goods", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AfterSale.prototype, "way", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AfterSale.prototype, "video", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AfterSale.prototype, "note", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待审核' }),
    __metadata("design:type", String)
], AfterSale.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AfterSale.prototype, "createdAt", void 0);
exports.AfterSale = AfterSale = __decorate([
    (0, typeorm_1.Entity)('after_sales'),
    (0, typeorm_1.Index)(['userId'])
], AfterSale);
/** 提现申请 */
let Withdrawal = class Withdrawal {
};
exports.Withdrawal = Withdrawal;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Withdrawal.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Withdrawal.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], Withdrawal.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], Withdrawal.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待处理' }),
    __metadata("design:type", String)
], Withdrawal.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Withdrawal.prototype, "createdAt", void 0);
exports.Withdrawal = Withdrawal = __decorate([
    (0, typeorm_1.Entity)('withdrawals')
], Withdrawal);
/** 收货地址 */
let Address = class Address {
};
exports.Address = Address;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Address.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Address.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], Address.prototype, "recipientName", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20 }),
    __metadata("design:type", String)
], Address.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 120 }),
    __metadata("design:type", String)
], Address.prototype, "region", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], Address.prototype, "detail", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Address.prototype, "isDefault", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Address.prototype, "createdAt", void 0);
exports.Address = Address = __decorate([
    (0, typeorm_1.Entity)('addresses')
], Address);
/** 管理员操作审计日志 */
let AdminLog = class AdminLog {
};
exports.AdminLog = AdminLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], AdminLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AdminLog.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AdminLog.prototype, "targetId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AdminLog.prototype, "targetName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], AdminLog.prototype, "operatorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AdminLog.prototype, "operatorCn", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], AdminLog.prototype, "details", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AdminLog.prototype, "createdAt", void 0);
exports.AdminLog = AdminLog = __decorate([
    (0, typeorm_1.Entity)('admin_logs')
], AdminLog);
/** 合并发货单（合单深度整合） */
let MergedShipment = class MergedShipment {
};
exports.MergedShipment = MergedShipment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], MergedShipment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], MergedShipment.prototype, "mergeGroupId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], MergedShipment.prototype, "ownerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json' }),
    __metadata("design:type", Array)
], MergedShipment.prototype, "sourceOrderIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], MergedShipment.prototype, "freight", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], MergedShipment.prototype, "packFee", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", String)
], MergedShipment.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], MergedShipment.prototype, "addressSnapshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '待发货' }),
    __metadata("design:type", String)
], MergedShipment.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], MergedShipment.prototype, "trackingNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], MergedShipment.prototype, "packImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], MergedShipment.prototype, "shippedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], MergedShipment.prototype, "createdAt", void 0);
exports.MergedShipment = MergedShipment = __decorate([
    (0, typeorm_1.Entity)('merged_shipments'),
    (0, typeorm_1.Index)(['ownerId']),
    (0, typeorm_1.Index)(['mergeGroupId'])
], MergedShipment);
exports.entities = [
    User, BalanceFlow, Notification, ShopConfig, Series, Good, Order, OrderItem,
    KidneyBill, SecondBill, SaleGood, Auction, AuctionBid, AuctionDeposit,
    Transfer, Clearing, AfterSale, Withdrawal, Address, AdminLog, MergedShipment,
];

<template>
  <div v-if="!store.token" class="login-bg">
    <div class="login-card">
      <div class="logo">🍙</div>
      <h2>汪咪的谷子铺</h2>
      <p class="sub">账号 + 密码登录</p>
      <input v-model="lg.account" placeholder="账号" />
      <input v-model="lg.password" type="password" placeholder="密码" @keyup.enter="login" />
      <button class="btn lg" @click="login">登 录</button>
      <button class="btn gray lg" @click="showReg = !showReg">{{ showReg ? '返回登录' : '注册新账号' }}</button>
      <div v-if="showReg" class="reg">
        <input v-model="reg.account" placeholder="账号（≥3位）" />
        <input v-model="reg.password" type="password" placeholder="密码（≥6位）" />
        <input v-model="reg.cn" placeholder="CN 圈名（唯一且不可改）" />
        <input v-model="reg.qq" placeholder="QQ" />
        <input v-model="reg.wechat" placeholder="微信" />
        <button class="btn lg" @click="register">注 册</button>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
      <p class="tip">忘记密码请联系店主重置</p>
    </div>
  </div>

  <!-- 店主/管理员 → 后台 -->
  <div v-else-if="store.user.role !== 'member' && store.viewMode !== 'member'" class="admin">
    <aside>
      <div class="brand">🍙 汪咪的谷子铺</div>
      <button v-for="m in adminMenus" :key="m" :class="{ on: adminTab === m }" @click="adminTab = m">{{ m }}</button>
      <button @click="logout">退出登录</button>
    </aside>
    <main>
      <!-- 数据看板 -->
      <template v-if="adminTab === '数据看板'">
        <h2>数据看板</h2>
        <div class="stats">
          <div class="s"><b>{{ seriesList.length }}</b><span>拼团系列</span></div>
          <div class="s"><b>{{ adminTodos.totalCount }}</b><span>待审核待办</span></div>
          <div class="s"><b>{{ goodsCount }}</b><span>在售谷子</span></div>
          <div class="s"><b>{{ auctions.length }}</b><span>拍卖场次</span></div>
          <div class="s"><b>{{ pendingWithdraws.length }}</b><span>待处理提现</span></div>
        </div>

        <!-- 流式待办收件箱 -->
        <h3 style="display:flex;align-items:center;justify-content:space-between">
          <span>待办收件箱 <span style="color:var(--brand)">{{ adminTodos.totalCount }}</span></span>
          <div style="display:flex;gap:8px">
            <button class="btn gray mini" @click="todoFilter = 'all'" :class="{on: todoFilter === 'all'}">全部</button>
            <button class="btn gray mini" @click="todoFilter = 'bill'" :class="{on: todoFilter === 'bill'}">肾表</button>
            <button class="btn gray mini" @click="todoFilter = 'sale'" :class="{on: todoFilter === 'sale'}">直售</button>
            <button class="btn gray mini" @click="todoFilter = 'after'" :class="{on: todoFilter === 'after'}">售后</button>
            <button class="btn gray mini" @click="todoFilter = 'deposit'" :class="{on: todoFilter === 'deposit'}">保证金</button>
            <button class="btn gray mini" @click="todoFilter = 'cancel'" :class="{on: todoFilter === 'cancel'}">取消</button>
            <button class="btn gray mini" @click="todoFilter = 'withdraw'" :class="{on: todoFilter === 'withdraw'}">提现</button>
          </div>
        </h3>

        <div v-if="adminTodos.totalCount === 0" class="card" style="text-align:center;padding:40px 16px">
          <div style="font-size:48px;opacity:.3;margin-bottom:8px">✅</div>
          <p class="muted">暂无待办事项</p>
        </div>

        <!-- 即将超时 -->
        <div v-if="adminTodos.urgent.length" class="todo-section">
          <div class="todo-section-header urgent">
            <span class="dot" style="background:#FF3B30"></span>
            即将超时（{{ adminTodos.urgent.length }}）
          </div>
          <AdminTimelineNode
            v-for="item in adminTodos.urgent"
            :key="item.id"
            :item="item"
            :selected="todoSelected.has(item.id)"
            @click="showTodoDetail(item)"
            @toggle-select="toggleTodoSelect"
            @action="handleTodoAction"
            @preview-screenshot="showScreenshot"
          />
        </div>

        <!-- 今日新 -->
        <div v-if="adminTodos.today.length" class="todo-section">
          <div class="todo-section-header today">
            <span class="dot" style="background:#FF9500"></span>
            今日新提交（{{ adminTodos.today.length }}）
          </div>
          <AdminTimelineNode
            v-for="item in adminTodos.today"
            :key="item.id"
            :item="item"
            :selected="todoSelected.has(item.id)"
            @click="showTodoDetail(item)"
            @toggle-select="toggleTodoSelect"
            @action="handleTodoAction"
            @preview-screenshot="showScreenshot"
          />
        </div>

        <!-- 普通待办 -->
        <div v-if="adminTodos.normal.length" class="todo-section">
          <div class="todo-section-header">
            <span class="dot" style="background:#8E8E93"></span>
            普通待办（{{ adminTodos.normal.length }}）
          </div>
          <AdminTimelineNode
            v-for="item in adminTodos.normal"
            :key="item.id"
            :item="item"
            :selected="todoSelected.has(item.id)"
            @click="showTodoDetail(item)"
            @toggle-select="toggleTodoSelect"
            @action="handleTodoAction"
            @preview-screenshot="showScreenshot"
          />
        </div>

        <!-- 批量操作浮条 -->
        <div v-if="todoSelected.size" class="batch-bar">
          <span>已选 {{ todoSelected.size }} 项</span>
          <div style="display:flex;gap:8px">
            <button class="btn mini" @click="batchPass">批量通过</button>
            <button class="btn gray mini" @click="batchReject">批量打回</button>
            <button class="btn gray mini" @click="todoSelected.clear()">清空</button>
          </div>
        </div>
      </template>

      <!-- 预警中心 -->
      <template v-else-if="adminTab === '预警中心'">
        <h2>预警中心</h2>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button class="btn gray mini" :class="{on: alertFilter === 'all'}" @click="alertFilter = 'all'">全部（{{ alerts.length }}）</button>
          <button class="btn gray mini" :class="{on: alertFilter === 'critical'}" @click="alertFilter = 'critical'">紧急（{{ alerts.filter(a=>a.level==='critical').length }}）</button>
          <button class="btn gray mini" :class="{on: alertFilter === 'warning'}" @click="alertFilter = 'warning'">警告（{{ alerts.filter(a=>a.level==='warning').length }}）</button>
          <button class="btn gray mini" style="margin-left:auto" @click="exportAlerts">导出CSV</button>
        </div>
        <div v-if="!filteredAlerts.length" class="card" style="text-align:center;padding:40px 16px">
          <div style="font-size:48px;opacity:.3;margin-bottom:8px">✅</div>
          <p class="muted">暂无异常预警</p>
        </div>
        <AdminAlertCard
          v-for="item in filteredAlerts"
          :key="item.id"
          :item="item"
          @click="handleAlertClick(item)"
          @navigate="navigateFromAlert"
        />
      </template>

      <!-- 付款审核 -->
      <template v-else-if="adminTab === '付款审核'">
        <h2>付款审核</h2>
        <div class="catbar" style="margin-bottom:8px">
          <button :class="{ on: paymentAuditTab === 'all' }" @click="switchPayTab('all')">全部</button>
          <button :class="{ on: paymentAuditTab === 'group' }" @click="switchPayTab('group')">拼团</button>
          <button :class="{ on: paymentAuditTab === 'sale' }" @click="switchPayTab('sale')">直售</button>
          <button :class="{ on: paymentAuditTab === 'clear' }" @click="switchPayTab('clear')">清货</button>
          <button :class="{ on: paymentAuditTab === 'second' }" @click="switchPayTab('second')">二次收肾</button>
          <button :class="{ on: paymentAuditTab === 'deposit' }" @click="switchPayTab('deposit')">保证金</button>
          <button :class="{ on: paymentAuditTab === 'processed' }" @click="switchPayTab('processed')">已处理</button>
        </div>

        <!-- 批量操作工具栏 -->
        <div v-if="paymentAuditTab !== 'processed' && allPendingOrders.length" class="payment-batch-bar">
          <div class="pay-batch-left">
            <div class="pay-cb" :class="{ checked: paySelectAll }" @click="togglePaySelectAll"></div>
            <span style="font-size:13px">{{ paySelectedIds.size }}/{{ allPendingOrders.length }} 已选</span>
          </div>
          <div class="pay-batch-actions">
            <button class="btn mini" @click="batchAuditPayments(true)" :disabled="!paySelectedIds.size">✅ 批量通过</button>
            <button class="btn gray mini" @click="batchAuditPayments(false)" :disabled="!paySelectedIds.size">❌ 批量打回</button>
          </div>
        </div>

        <div v-if="paymentAuditTab !== 'processed' && !allPendingOrders.length" class="card" style="text-align:center;padding:30px 16px;margin:8px 12px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">✅</div><p class="muted">暂无待审核付款</p></div>
        <div v-if="paymentAuditTab === 'processed' && !allProcessedOrders.length" class="card" style="text-align:center;padding:30px 16px;margin:8px 12px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">📋</div><p class="muted">暂无已处理记录</p></div>

        <!-- 待审核：流式卡片 -->
        <template v-if="paymentAuditTab !== 'processed'">
          <div v-for="o in allPendingOrders" :key="o.type + '-' + o.id" class="pay-audit-card" :class="{ selected: paySelectedIds.has(o.type + '-' + o.id) }" @click="togglePaySelect(o.type + '-' + o.id)">
            <div class="pay-card-cb" :class="{ checked: paySelectedIds.has(o.type + '-' + o.id) }" @click.stop="togglePaySelect(o.type + '-' + o.id)"></div>
            <div class="pay-card-body">
              <div class="pay-card-header">
                <span class="tag" :class="{ pink: o.type === 'group', orange: o.type === 'sale', green: o.type === 'clear', red: o.type === 'second', gray: o.type === 'deposit' }">{{ o.typeLabel }}</span>
                <b style="font-size:14px;margin-left:6px">{{ o.cn }}</b>
                <span class="muted" style="margin-left:6px;font-size:12px">{{ o.title }}</span>
                <span class="muted pay-card-time">{{ fmtTime(o.createdAt) }}</span>
              </div>
              <div class="pay-card-amounts">
                <div class="pay-amount-row">
                  <span class="pay-amount-label">应付总额</span>
                  <b class="price">¥{{ o.total }}</b>
                </div>
                <div class="pay-amount-row">
                  <span class="pay-amount-label">余额抵扣</span>
                  <span :class="o.useBalanceAmount > 0 ? 'green' : 'muted'">¥{{ o.useBalanceAmount }}</span>
                </div>
                <div class="pay-amount-row">
                  <span class="pay-amount-label">实付</span>
                  <b>¥{{ (o.total - o.useBalanceAmount).toFixed(2) }}</b>
                </div>
              </div>
              <div v-if="o.screenshot" class="pay-card-screenshot" @click.stop="">
                <img :src="o.screenshot" style="max-width:180px;max-height:180px;border-radius:8px;border:1px solid #eee;cursor:pointer" @click="showScreenshot(o.screenshot)" />
              </div>
              <div v-if="o.blindShipMode" class="pay-card-blind">
                <span class="tag" :class="o.blindShipMode === 'video' ? 'pink' : 'green'">{{ o.blindShipMode === 'video' ? '📹 视频拆开' : '🎲 随机不拆开' }}</span>
              </div>
              <div class="pay-card-actions" @click.stop="">
                <button class="btn mini" @click="auditPayment(o, true)">✅ 通过</button>
                <button class="btn gray mini" @click="auditPayment(o, false)">❌ 打回</button>
              </div>
            </div>
          </div>
        </template>

        <!-- 已处理：流式卡片（只读） -->
        <template v-if="paymentAuditTab === 'processed'">
          <div v-for="o in allProcessedOrders" :key="o.type + '-' + o.id" class="pay-audit-card processed">
            <div class="pay-card-body">
              <div class="pay-card-header">
                <span class="tag" :class="{ pink: o.type === 'group', orange: o.type === 'sale', green: o.type === 'clear', red: o.type === 'second', gray: o.type === 'deposit' }">{{ o.typeLabel }}</span>
                <b style="font-size:14px;margin-left:6px">{{ o.cn }}</b>
                <span class="muted" style="margin-left:6px;font-size:12px">{{ o.title }}</span>
                <span class="muted pay-card-time">{{ fmtTime(o.createdAt) }}</span>
              </div>
              <div class="pay-card-amounts">
                <div class="pay-amount-row">
                  <span class="pay-amount-label">总额</span>
                  <b class="price">¥{{ o.total }}</b>
                </div>
                <div class="pay-amount-row">
                  <span class="pay-amount-label">结果</span>
                  <span class="tag" :class="{ green: o.result === '已通过' || o.result === '已付款' || o.result === '已发货' || o.result === '已缴', red: o.result === '已拒绝' || o.result === '已打回', gray: o.result === '已取消' || o.result === '已退' || o.result === '已确认收货' || o.result === '已抵扣' }">{{ o.result }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- 拼团管理 -->
      <template v-else-if="adminTab === '拼团管理'">
        <h2>拼团管理 · 排表统筹</h2>

        <!-- 排表工作台视图（展开某系列后） -->
        <template v-if="groupWorkspaceView">
          <GroupWorkspace
            :matrix="gwMatrix"
            :memberSummary="gwMemberSummary"
            :unpaidReminders="gwUnpaidReminders"
            :priceOp="priceOp"
            :priceVal="priceVal"
            @go-back="closeGroupWorkspace"
            @add-good="showAddGoodForm = true"
            @export-matrix="exportGroupMatrixCSV"
            @export-members="exportMemberSummaryCSV"
            @batch-price="batchPriceFromWorkspace"
            @mark-arrive="markArriveFromWorkspace"
            @edit-good="editGood"
            @cut-good="openCutForm"
            @delete-good="deleteGood"
            @remind="remindUnpaid"
            @mark-paid="markUnpaidPaid"
          />
        </template>

        <!-- 系列卡片看板视图（默认） -->
        <template v-else>
          <div class="toolbar">
            <button ref="newSeriesBtnRef" class="btn mini" @click="showSeriesForm = true">➕ 新建拼团系列</button>
            <button class="btn gray mini" @click="importGroupCSV">📥 表格导入排表</button>
          </div>
          <div v-if="!seriesCards.length" class="card" style="text-align:center;padding:30px 16px;margin:8px 12px">
            <div style="font-size:36px;opacity:.3;margin-bottom:8px">🧩</div>
            <p class="muted">暂无拼团系列，点击「新建拼团系列」开始</p>
          </div>
          <div class="group-series-grid">
            <GroupSeriesCard
              v-for="card in seriesCards"
              :key="card.id"
              :card="card"
              :expanded="expandedCardId === card.id"
              :deletable="store.user?.role === 'owner'"
              @expand="expandedCardId = expandedCardId === card.id ? null : card.id"
              @delete="handleDeleteSeries(card)"
            />
          </div>
        </template>

        <!-- 添加谷子弹窗 -->
        <div class="modal-mask" v-if="showAddGoodForm" @click.self="showAddGoodForm = false">
          <div class="modal-card">
            <h3 style="margin:0 0 12px">＋ 添加谷子</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">谷子名称</label>
                <input v-model="newGood.name" placeholder="如：雷电将军立牌" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">分类</label>
                <input v-model="newGood.cat" placeholder="如：立牌/吧唧（自定义）" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">单价（元）</label>
                <input v-model.number="newGood.price" type="number" placeholder="15" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">可排数量（个）</label>
                <input v-model.number="newGood.limit" type="number" placeholder="10" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">囤货费率</label>
                <select v-model.number="newGood.unitFee" style="width:100%">
                  <option :value="0.1">0.1（默认）</option>
                  <option :value="0.2">0.2</option>
                  <option :value="0.5">0.5</option>
                </select>
              </div>
              <div style="display:flex;align-items:flex-end;gap:8px">
                <button class="btn mini" @click="pickGoodImage" style="flex:1">📷 上传图片</button>
                <button class="btn mini" @click="addGoodFromWorkspace" style="flex:1">＋ 添加</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 新建拼团系列弹窗 -->
        <div class="modal-mask" v-if="showSeriesForm" @click.self="showSeriesForm = false">
          <div class="modal-card">
            <h3 style="margin:0 0 12px">➕ 新建拼团系列</h3>
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:12px;color:#666">系列名称</label>
              <input v-model="newSeries.name" placeholder="请输入系列名称" class="modal-input" />
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:12px;color:#666">IP</label>
              <input v-model="newSeries.ip" placeholder="如：原神" class="modal-input" />
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:12px;color:#666">模式</label>
              <div class="row" style="gap:8px">
                <button :class="['btn', 'mini', newSeries.mode === 'traditional' ? '' : 'gray']" style="flex:1" @click="newSeries.mode = 'traditional'">传统截团</button>
                <button :class="['btn', 'mini', newSeries.mode === 'matching' ? '' : 'gray']" style="flex:1" @click="newSeries.mode = 'matching'">成配模式</button>
              </div>
              <p class="muted" style="font-size:11px;margin-top:4px">{{ newSeries.mode === 'traditional' ? '传统截团：到截团时间统一截单，生成肾表' : '成配模式：按配对数量成组，达到最小成团数即截团' }}</p>
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:12px;color:#666">预计到货</label>
              <input v-model="newSeries.eta" placeholder="如：2026-09-20 到货" class="modal-input" />
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:12px;color:#666">截团时间（自动截团）</label>
              <input v-model="newSeries.deadlineAt" type="datetime-local" class="modal-input" />
              <p class="muted" style="font-size:11px;margin-top:4px">到达该时间后系统会自动截团并生成肾表</p>
            </div>
            <div class="modal-actions">
              <button class="btn gray" @click="showSeriesForm = false">✕ 取消</button>
              <button class="btn" @click="createSeries">确认创建</button>
            </div>
          </div>
        </div>

        <!-- 谷子编辑弹窗 -->
        <div class="modal-mask" v-if="goodEditForm.show" @click.self="goodEditForm.show = false">
          <div class="modal-card" style="max-width:480px">
            <h3 style="margin:0 0 12px">✏️ 编辑谷子</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">名称</label>
                <input v-model="goodEditForm.name" placeholder="谷子名称" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">Emoji</label>
                <input v-model="goodEditForm.emoji" placeholder="🧸" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">分类</label>
                <input v-model="goodEditForm.cat" placeholder="如：立牌/吧唧" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">单价（元）</label>
                <input v-model.number="goodEditForm.price" type="number" placeholder="15" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">可排数量</label>
                <input v-model.number="goodEditForm.limit" type="number" placeholder="10" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">囤货费率</label>
                <select v-model.number="goodEditForm.unitFee" style="width:100%">
                  <option :value="0.1">0.1（默认）</option>
                  <option :value="0.2">0.2</option>
                  <option :value="0.5">0.5</option>
                </select>
              </div>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn gray" style="flex:1" @click="goodEditForm.show = false">✕ 取消</button>
              <button class="btn" style="flex:1" @click="submitGoodEdit">确认保存</button>
            </div>
          </div>
        </div>

        <!-- 砍单弹窗 -->
        <div class="modal-mask" v-if="cutForm.show" @click.self="cutForm.show = false">
          <div class="modal-card" style="max-width:400px">
            <h3 style="margin:0 0 12px">✂️ 砍单：{{ cutForm.goodName }}</h3>
            <div style="margin-bottom:12px">
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">砍单模式</label>
              <select v-model="cutForm.mode" style="width:100%">
                <option value="byGood">按谷子砍（从最早跟排开始砍）</option>
                <option value="all">全部砍完</option>
              </select>
            </div>
            <div v-if="cutForm.mode !== 'all'" style="margin-bottom:12px">
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">砍单数量</label>
              <input v-model.number="cutForm.qty" type="number" min="1" placeholder="输入砍单数量" style="width:100%" />
              <span style="font-size:11px;color:#999">从最早跟排的团员开始砍</span>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn gray" style="flex:1" @click="cutForm.show = false">✕ 取消</button>
              <button class="btn" style="flex:1" @click="submitCut">确认砍单</button>
            </div>
          </div>
        </div>
      </template>

      <!-- 拍卖管理 -->
      <template v-else-if="adminTab === '拍卖管理'">
        <h2>拍卖管理</h2>
        <div class="toolbar">
          <button class="btn mini" @click="showAuctionForm = !showAuctionForm">➕ 上架拍品</button>
          <button class="btn gray mini" @click="exportAuctionCSV">📤 导出</button>
          <button class="btn gray mini" @click="importAuctionCSV">📥 导入</button>
          <span class="muted">拍品来源：单独新增 / 拼团未付款 / 拼团囤货过期 / 直售囤货过期（过期谷成交款计入原团员余额）</span>
        </div>
        <div class="card" v-if="showAuctionForm">
          <h4 style="margin:0 0 12px">➕ 上架拍品</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">拍品名称</label>
              <input v-model="newAuction.name" placeholder="如：雷电将军限定手办" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">起拍价（元）</label>
              <input v-model.number="newAuction.startPrice" type="number" placeholder="20" style="width:100%" />
              <span style="font-size:11px;color:#999">拍卖开始时的初始价格</span>
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">最低加价（元）</label>
              <input v-model.number="newAuction.stepPrice" type="number" placeholder="2" style="width:100%" />
              <span style="font-size:11px;color:#999">每次出价至少增加多少</span>
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">一口价（元）</label>
              <input v-model.number="newAuction.buyNow" type="number" placeholder="80" style="width:100%" />
              <span style="font-size:11px;color:#999">出价达到此金额直接成交</span>
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">保证金（元）</label>
              <input v-model.number="newAuction.deposit" type="number" placeholder="10" style="width:100%" />
              <span style="font-size:11px;color:#999">参与拍卖需预先缴纳的金额</span>
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">开拍时间</label>
              <input type="datetime-local" v-model="newAuctionStart" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">结束时间</label>
              <input type="datetime-local" v-model="newAuctionEnd" style="width:100%" />
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px">
              <button class="btn mini" @click="pickAuctionImage" style="flex:1">📷 上传图片</button>
              <button class="btn mini" @click="createAuction" style="flex:1">🔨 确认上架</button>
            </div>
          </div>
        </div>
        <table class="styled-table">
          <thead><tr><th>拍品</th><th>起拍</th><th>当前价</th><th>一口价</th><th>状态</th><th>开拍</th><th>结束</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="a in auctions" :key="a.id">
              <td>{{ a.emoji }} {{ a.name }}</td><td>¥{{ a.startPrice }}</td>
              <td><b class="price">¥{{ a.curPrice }}</b></td><td>¥{{ a.buyNow }}</td>
              <td><span :class="['tag', a.state === '拍卖中' ? 'orange' : (a.state === '待开拍' ? 'gray' : 'green')]">{{ a.state }}</span></td>
              <td>{{ fmtTime(a.startTime) }}</td><td>{{ fmtTime(a.endTime) }}</td>
              <td>
                <button v-if="a.state === '待开拍' || a.state === '拍卖中'" class="btn mini" @click="openAuctionEdit(a)">✏️ 编辑</button>
                <button v-if="a.state !== '待开拍' && a.state !== '拍卖中'" class="btn mini" style="background:var(--success);color:#fff" @click="openAuctionRelist(a)">🔄 重新上架</button>
                <button v-if="a.state !== '待开拍' && a.state !== '拍卖中'" class="btn gray mini" @click="openAuctionEdit(a)">✏️ 编辑</button>
                <button v-if="a.state !== '拍卖中'" class="btn gray mini" @click="deleteAuction(a)" style="margin-left:4px">🗑️ 删除</button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 拍卖编辑弹窗 -->
        <div class="modal-mask" v-if="auctionEditForm.show" @click.self="auctionEditForm.show = false">
          <div class="modal-card" style="max-width:480px">
            <h3 style="margin:0 0 12px">✏️ 编辑拍品</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">拍品名称</label>
                <input v-model="auctionEditForm.name" placeholder="如：雷电将军限定手办" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">起拍价（元）</label>
                <input v-model.number="auctionEditForm.startPrice" type="number" placeholder="20" style="width:100%" />
                <span style="font-size:11px;color:#999">拍卖开始时的初始价格</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">最低加价（元）</label>
                <input v-model.number="auctionEditForm.stepPrice" type="number" placeholder="2" style="width:100%" />
                <span style="font-size:11px;color:#999">每次出价至少增加多少</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">一口价（元）</label>
                <input v-model.number="auctionEditForm.buyNow" type="number" placeholder="80" style="width:100%" />
                <span style="font-size:11px;color:#999">出价达到此金额直接成交</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">保证金（元）</label>
                <input v-model.number="auctionEditForm.deposit" type="number" placeholder="10" style="width:100%" />
                <span style="font-size:11px;color:#999">参与拍卖需预先缴纳的金额</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">Emoji 图标</label>
                <input v-model="auctionEditForm.emoji" placeholder="🔨" style="width:100%" />
                <span style="font-size:11px;color:#999">拍品展示用表情符号</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">开拍时间</label>
                <input type="datetime-local" v-model="auctionEditForm.startTimeStr" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">结束时间</label>
                <input type="datetime-local" v-model="auctionEditForm.endTimeStr" style="width:100%" />
              </div>
            </div>
            <p class="muted" style="font-size:12px;margin-bottom:12px">当前状态：<b>{{ auctionEditForm.state }}</b> · 开拍时间不可早于当前时间，结束时间必须晚于开拍时间</p>
            <div class="row" style="gap:8px">
              <button class="btn gray" style="flex:1" @click="auctionEditForm.show = false">✕ 取消</button>
              <button class="btn" style="flex:1" @click="submitAuctionEdit">确认保存</button>
            </div>
          </div>
        </div>

        <!-- 拍卖重新上架弹窗 -->
        <div class="modal-mask" v-if="auctionRelistForm.show" @click.self="auctionRelistForm.show = false">
          <div class="modal-card" style="max-width:480px">
            <h3 style="margin:0 0 12px">🔄 重新上架</h3>
            <p class="muted" style="font-size:12px;margin-bottom:12px">当前状态为 <b>{{ auctionRelistForm.name }}</b>（{{ auctionRelistForm.state }}），重新上架将清除历史出价记录并重置为新拍卖。</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">拍品名称</label>
                <input v-model="auctionRelistForm.name" placeholder="如：雷电将军限定手办" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">起拍价（元）</label>
                <input v-model.number="auctionRelistForm.startPrice" type="number" placeholder="20" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">最低加价（元）</label>
                <input v-model.number="auctionRelistForm.stepPrice" type="number" placeholder="2" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">一口价（元）</label>
                <input v-model.number="auctionRelistForm.buyNow" type="number" placeholder="80" style="width:100%" />
                <span style="font-size:11px;color:#999">设为 0 表示无一口价</span>
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">保证金（元）</label>
                <input v-model.number="auctionRelistForm.deposit" type="number" placeholder="10" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">Emoji 图标</label>
                <input v-model="auctionRelistForm.emoji" placeholder="🔨" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">开拍时间</label>
                <input type="datetime-local" v-model="auctionRelistForm.startTimeStr" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">结束时间</label>
                <input type="datetime-local" v-model="auctionRelistForm.endTimeStr" style="width:100%" />
              </div>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn gray" style="flex:1" @click="auctionRelistForm.show = false">✕ 取消</button>
              <button class="btn" style="flex:1;background:var(--success);color:#fff" @click="submitAuctionRelist">🔄 确认重新上架</button>
            </div>
          </div>
        </div>
      </template>

      <!-- 直售管理 -->
      <template v-else-if="adminTab === '直售管理'">
        <h2>直售管理</h2>
        <div class="toolbar">
          <button class="btn mini" @click="showSaleForm = !showSaleForm">➕ 上架直售谷子</button>
          <button class="btn gray mini" @click="exportSaleCSV">📤 导出</button>
          <button class="btn gray mini" @click="importSaleCSV">📥 导入</button>
        </div>
        <div class="catbar" style="margin-bottom:8px">
          <button :class="{ on: adminSaleCatFilter === '全部' }" @click="adminSaleCatFilter = '全部'">全部分类</button>
          <button v-for="c in saleCats" :key="c" :class="{ on: adminSaleCatFilter === c }" @click="adminSaleCatFilter = c">{{ c }}</button>
        </div>
        <div class="card" v-if="showSaleForm">
          <h4 style="margin:0 0 12px">➕ 上架直售谷子</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">谷子名称</label>
              <input v-model="newSaleGood.name" placeholder="如：雷电将军限定徽章" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">IP/作品</label>
              <input v-model="newSaleGood.ip" placeholder="如：原神" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">分类</label>
              <input v-model="newSaleGood.cat" placeholder="如：吧唧/立牌" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">类型</label>
              <select v-model="newSaleGood.type" style="width:100%">
                <option value="全新未拆">全新未拆</option>
                <option value="中古">中古</option>
                <option value="盲抽">盲抽</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">价格（元）</label>
              <input v-model.number="newSaleGood.price" type="number" placeholder="15" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">库存数量（件）</label>
              <input v-model.number="newSaleGood.stock" type="number" placeholder="1" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">所属者CN</label>
              <input v-model="newSaleGood.ownerCn" placeholder="谷子原主人CN（可选）" style="width:100%" />
            </div>
            <div>
              <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">囤货费率</label>
              <select v-model.number="newSaleGood.unitFee" style="width:100%">
                <option :value="0.1">0.1（默认）</option>
                <option :value="0.2">0.2</option>
                <option :value="0.5">0.5</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px;grid-column:span 2">
              <button class="btn mini" @click="pickSaleGoodImage" style="flex:1">📷 上传图片</button>
              <button class="btn mini" @click="addSaleGood" style="flex:1">➕ 确认上架</button>
            </div>
          </div>
          <div v-if="newSaleGood.img" style="margin:8px 0">
            <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">图片预览</label>
            <img :src="newSaleGood.img" style="max-width:200px;max-height:150px;border-radius:8px;object-fit:cover;border:1px solid #eee" />
          </div>
          <p style="font-size:12px;color:#999;margin:0">编号由系统自动生成，无需填写</p>
        </div>
        <table class="styled-table">
          <thead><tr><th>谷子</th><th>编号</th><th>IP</th><th>分类</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="g in adminFilteredSaleGoods" :key="g.id">
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <img v-if="g.img" :src="g.img" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid #eee" />
                  <span v-else style="font-size:24px">{{ g.emoji }}</span>
                  <span>{{ g.name }}</span>
                </div>
              </td><td>{{ g.no }}</td><td>{{ g.ip }}</td><td>{{ g.cat }}</td>
              <td>¥{{ g.price }}</td><td>{{ g.stock }}</td>
              <td><span :class="['tag', g.stock > 0 ? 'green' : 'gray']">{{ g.stock > 0 ? '在售' : '已售' }}</span></td>
              <td>
                <button class="btn mini gray" @click="editSaleGood(g)">✏️ 编辑</button>
                <button v-if="g.stock === 0" class="btn mini" @click="restockSaleGood(g)">补库存</button>
                <button v-if="!g.arrived || g.arrived === '未到货'" class="btn mini gray" @click="markSaleArrive(g)">标记到货</button>
                <span v-else-if="g.arrived === '已到货'" class="tag green">已到货</span>
                <span v-else-if="g.arrived === '部分到货'" class="tag orange">部分到货</span>
                <button class="btn mini gray" style="color:#F5222D" @click="deleteSaleGood(g)">🗑 删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- 直售谷子编辑弹窗 -->
        <div class="modal-mask" v-if="saleGoodEditForm.show" @click.self="saleGoodEditForm.show = false">
          <div class="modal-card" style="max-width:480px">
            <h3 style="margin:0 0 12px">✏️ 编辑直售谷子</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">名称</label>
                <input v-model="saleGoodEditForm.name" placeholder="谷子名称" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">Emoji</label>
                <input v-model="saleGoodEditForm.emoji" placeholder="🧸" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">分类</label>
                <input v-model="saleGoodEditForm.cat" placeholder="如：吧唧/立牌" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">单价（元）</label>
                <input v-model.number="saleGoodEditForm.price" type="number" placeholder="15" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">库存</label>
                <input v-model.number="saleGoodEditForm.stock" type="number" placeholder="1" style="width:100%" />
              </div>
              <div>
                <label style="font-size:12px;color:#666;display:block;margin-bottom:4px">囤货费率</label>
                <select v-model.number="saleGoodEditForm.unitFee" style="width:100%">
                  <option :value="0.1">0.1（默认）</option>
                  <option :value="0.2">0.2</option>
                  <option :value="0.5">0.5</option>
                </select>
              </div>
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px;margin-top:8px">
              <button class="btn mini" @click="pickSaleGoodEditImage" style="flex:1">📷 {{ saleGoodEditForm.img ? '重新上传' : '上传图片' }}</button>
              <div style="flex:1"></div>
            </div>
            <div v-if="saleGoodEditForm.img" style="margin:8px 0">
              <img :src="saleGoodEditForm.img" style="max-width:200px;max-height:150px;border-radius:8px;object-fit:cover;border:1px solid #eee" />
            </div>
            <div class="row" style="gap:8px;margin-top:10px">
              <button class="btn gray" style="flex:1" @click="saleGoodEditForm.show = false">✕ 取消</button>
              <button class="btn" style="flex:1" @click="submitSaleGoodEdit">确认保存</button>
            </div>
          </div>
        </div>
      </template>

      <!-- 会员管理 -->
      <template v-else-if="adminTab === '会员管理'">
        <h2>会员管理</h2>
        <div class="member-search-bar" style="margin-bottom:12px">
          <input v-model="memberSearchQ" placeholder="搜索 CN / 账号 / QQ / 微信" style="flex:1" />
          <select v-model="memberSortBy">
            <option value="active">按活跃度</option>
            <option value="spent">按消费金额</option>
            <option value="recent">按最近下单</option>
            <option value="pending">按待办数</option>
          </select>
        </div>
        <div class="member-grid">
          <div 
            v-for="u in filteredMembers" 
            :key="u.id" 
            class="member-card"
            :class="{ banned: u.banned }"
            @click="openMemberProfile(u)"
          >
            <div class="member-avatar">{{ u.cn?.[0] || '?' }}</div>
            <div class="member-info">
              <div class="member-name">
                {{ u.cn }}
                <span v-if="u.banned" class="tag red" style="margin-left:4px">黑名单</span>
              </div>
              <div class="member-meta">{{ u.account }} · 余额 ¥{{ u.balance }}</div>
              <div class="member-tags">
                <span v-if="u.pendingCount > 0" class="tag orange" style="margin-right:4px">{{ u.pendingCount }} 待办</span>
                <span v-if="u.stockCount > 0" class="tag blue" style="margin-right:4px">{{ u.stockCount }} 囤货</span>
                <span :class="['tag', u.activeLevel === '高频' ? 'green' : u.activeLevel === '中频' ? 'blue' : u.activeLevel === '低频' ? 'orange' : 'gray']">{{ u.activeLevel }}</span>
              </div>
            </div>
            <div class="member-spent" v-if="u.totalSpent > 0">
              <div class="spent-num">¥{{ u.totalSpent.toFixed(0) }}</div>
              <div class="spent-label">累计</div>
            </div>
          </div>
          <div v-if="!filteredMembers.length" class="card" style="text-align:center;padding:40px 16px;grid-column:1/-1">
            <div style="font-size:48px;opacity:.3;margin-bottom:8px">👥</div>
            <p class="muted">未找到匹配的会员</p>
          </div>
        </div>
        
        <!-- 客户画像抽屉 -->
        <CustomerProfileDrawer
          v-if="selectedMemberProfile"
          :profile="selectedMemberProfile"
          @close="selectedMemberProfile = null"
          @reset-pwd="resetPwd"
          @ban="ban"
        />
      </template>

      <template v-else-if="adminTab === '售后管理'">
        <h2>售后管理</h2>
        <table class="styled-table">
          <thead><tr><th>单号</th><th>团员</th><th>类型</th><th>谷子</th><th>方式</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="a in afters" :key="a.id">
              <td>#{{ a.id }}</td><td>{{ a.cn }}</td><td>{{ a.type }}</td><td>{{ a.goods }}</td><td>{{ a.way }}</td>
              <td><span class="tag orange">{{ a.state }}</span></td>
              <td>
                <template v-if="a.state === '待审核'">
                  <button class="btn mini" @click="auditAfter(a, true)">通过</button>
                  <button class="btn gray mini" @click="auditAfter(a, false)">驳回</button>
                </template>
                <button v-if="a.state === '换货·店主确认收货'" class="btn mini" @click="afterOp('restock', a)">确认收到退货</button>
                <button v-if="a.state === '换货·待补发'" class="btn mini" @click="afterOp('shipped', a)">已随排发寄出</button>
                <button v-if="a.state === '退货·待退款'" class="btn mini" @click="refund(a)">退款入余额</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else-if="adminTab === '二次收肾'">
        <h2>二次收肾（发起与审核）</h2>
        <div class="toolbar">
          <select v-model="sb.userId"><option v-for="u in users" :key="u.id" :value="u.id">{{ u.cn }}</option></select>
          <select v-model="sb.way"><option value="point">按点数（单价×点数）</option><option value="weight">按克重（首重+续重×n）</option><option value="custom">自定义金额</option></select>
          <input v-model.number="sb.p1" type="number" style="width:70px" />
          <input v-model.number="sb.p2" type="number" style="width:70px" />
          <input v-if="sb.way === 'weight'" v-model.number="sb.p3" type="number" style="width:70px" />
          <input v-model="sb.title" placeholder="用途（如：国际邮费均摊）" style="width:180px" />
          <button class="btn mini" @click="createSecond">发起收肾</button>
        </div>
        <table class="styled-table">
          <thead><tr><th>单号</th><th>团员</th><th>用途</th><th>计算</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="b in secondBills" :key="b.id">
              <td>#{{ b.id }}</td><td>{{ b.cn }}</td><td>{{ b.title }}</td><td>{{ b.calc }}</td><td>¥{{ b.amount }}</td>
              <td><span class="tag orange">{{ b.state }}</span></td>
              <td v-if="b.state === '已提交截图'">
                <button class="btn mini" @click="auditSecond(b, true)">通过</button>
                <button class="btn gray mini" @click="auditSecond(b, false)">打回</button>
              </td><td v-else>—</td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else-if="adminTab === '清货/转单'">
        <h2>清货排发处理</h2>
        <div class="toolbar" v-if="clears.some(c => c.state === '审核通过')">
          <label class="row" style="gap:6px;cursor:pointer">
            <input type="checkbox" :checked="clears.filter(c => c.state === '审核通过').every(c => selectedClearings.includes(c.id)) && clears.filter(c => c.state === '审核通过').length > 0" @change="toggleSelectAllClearings" />
            <span>全选待发货</span>
          </label>
          <button class="btn mini" :disabled="!selectedClearings.length" @click="batchShipClears">📦 批量发货（{{ selectedClearings.length }}）</button>
        </div>
        <table class="styled-table">
          <thead><tr><th v-if="clears.some(c => c.state === '审核通过')"></th><th>单号</th><th>团员</th><th>明细</th><th>商品</th><th>收货地址</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="c in clears" :key="c.id">
              <td v-if="clears.some(cc => cc.state === '审核通过')">
                <input v-if="c.state === '审核通过'" type="checkbox" :value="c.id" v-model="selectedClearings" />
              </td>
              <td>#{{ c.id }}</td><td>{{ c.cn }}</td>
              <td>{{ c.freightName }}+{{ c.packName }}{{ +c.overFee ? '+仓费¥' + c.overFee : '' }}</td>
              <td style="font-size:12px">
                <div v-for="(it, idx) in parseClearItems(c.items)" :key="idx" style="white-space:nowrap">
                  {{ it.name }} ×{{ it.qty }} <span class="muted">¥{{ (it.qty * (+it.price || 0)).toFixed(2) }}</span>
                </div>
                <div class="muted" style="margin-top:2px">运费分摊 ¥{{ calcFreightShare(c) }}</div>
              </td>
              <td style="font-size:12px;max-width:200px;word-break:break-all">
                <template v-if="parseAddrSnapshot(c.addressSnapshot)">
                  <b>{{ parseAddrSnapshot(c.addressSnapshot).recipientName }}</b> {{ parseAddrSnapshot(c.addressSnapshot).phone }}<br/>
                  <span style="color:#666">{{ parseAddrSnapshot(c.addressSnapshot).region }}{{ parseAddrSnapshot(c.addressSnapshot).detail }}</span>
                </template>
                <span v-else style="color:#ccc">未填写</span>
              </td>
              <td>¥{{ c.total }}</td><td><span class="tag orange">{{ c.state }}</span></td>
              <td>
                <button v-if="c.state === '已提交截图'" class="btn mini" @click="auditClear(c, true)">审核通过</button>
                <button v-if="c.state === '已提交截图'" class="btn gray mini" @click="auditClear(c, false)">打回</button>
                <button v-if="c.state === '审核通过'" class="btn mini" @click="shipClear(c)">上传物流单号并发货</button>
                <span v-if="c.trackingNo" style="font-size:11px;color:#666;display:block;margin-top:2px">物流：{{ c.trackingNo }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <h2>转单审核</h2>
        <table class="styled-table">
          <thead><tr><th>单号</th><th>谷子</th><th>转出→接收</th><th>方式</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="t in allTransfers" :key="t.id">
              <td>#{{ t.id }}</td><td>{{ t.name }}#{{ t.seq }}</td><td>{{ t.fromCn }} → {{ t.toCn }}</td>
              <td>{{ t.way === 'owner' ? '店主结算' : '私下' }}</td>
              <td><span class="tag orange">{{ t.state }}</span></td>
              <td>
                <button v-if="t.state === '待管理员审核'" class="btn mini" @click="auditTransfer(t, true)">同意</button>
                <button v-if="t.state === '待管理员审核'" class="btn gray mini" @click="auditTransfer(t, false)">驳回</button>
                <button v-if="t.state === '待店主转款'" class="btn mini" @click="forwardTransfer(t)">确认收款并转款入余额</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- 提现管理 -->
      <template v-else-if="adminTab === '提现管理'">
        <h2>提现管理</h2>
        <p class="muted" style="margin-bottom:12px">用户提现申请时余额已自动冻结。确认线下转账完成后点「已转账」，拒绝则冻结金额自动退回用户余额。</p>
        <div v-if="!withdrawList.length" class="card" style="text-align:center;padding:30px 16px;margin:8px 12px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">💳</div><p class="muted">暂无提现申请</p></div>
        <table>
          <thead><tr><th>CN</th><th>金额</th><th>收款方式</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="w in withdrawList" :key="w.id">
              <td>{{ w.cn }}</td>
              <td><b class="price">¥{{ w.amount }}</b></td>
              <td>{{ w.method || '-' }}</td>
              <td><span :class="['tag', w.state === '待处理' ? 'orange' : (w.state === '已完成' ? 'green' : 'gray')]">{{ w.state }}</span></td>
              <td>{{ fmtTime(w.createdAt) }}</td>
              <td>
                <button v-if="w.state === '待处理'" class="btn mini" @click="finishWithdraw(w)">已转账</button>
                <button v-if="w.state === '待处理'" class="btn gray mini" @click="rejectWithdraw(w)">拒绝</button>
                <span v-else class="muted">已处理</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else-if="adminTab === '店铺设置'">
        <h2>店铺设置（保存后 C 端立即生效）</h2>
        <h3 class="sec">拼团囤货规则</h3>
        <div class="toolbar">
          免费囤货 <input v-model.number="cfgEd.groupFreeDays" type="number" style="width:60px" /> 天
          <select v-model="cfgEd.groupOverFeeOn"><option :value="true">超期收费</option><option :value="false">不收费</option></select>
          超期 <input v-model.number="cfgEd.groupOverDays" type="number" style="width:60px" /> 天后自动转拍卖
          <button class="btn mini" @click="saveCfgGroup">保存</button>
        </div>
        <h3 class="sec">直售囤货规则</h3>
        <div class="toolbar">
          免费囤货 <input v-model.number="cfgEd.saleFreeDays" type="number" style="width:60px" /> 天
          <select v-model="cfgEd.saleOverFeeOn"><option :value="true">超期收费</option><option :value="false">不收费</option></select>
          超期 <input v-model.number="cfgEd.saleOverDays" type="number" style="width:60px" /> 天后自动转拍卖
          <button class="btn mini" @click="saveCfgSale">保存</button>
        </div>
        <div class="card">
          <h3 class="sec">品类囤货费率</h3>
          <table class="styled-table" style="margin-bottom:8px">
            <thead><tr><th style="width:180px;">品类</th><th>费率</th><th>说明</th><th>保存</th></tr></thead>
            <tbody>
              <tr v-for="(uf, i) in cfgUnitFeesArr" :key="i">
                <td><input v-model="uf.name" style="width:160px" /></td>
                <td><input v-model.number="uf.fee" type="number" step="0.1" style="width:80px" /> 元/件/天</td>
                <td><input v-model="uf.note" style="width:160px" /></td>
                <td><button class="btn mini" @click="saveUnitFeeRow(i)">💾 保存</button></td>
              </tr>
            </tbody>
          </table>
          <button class="btn mini" @click="addUnitFeeRow">＋ 新增品类</button>
        </div>
        <h3 class="sec">邮费选项（n 选一，可增删）</h3>
        <table class="styled-table" style="margin-bottom:8px">
          <thead><tr><th>名称</th><th>金额</th><th>启用</th><th>保存</th></tr></thead>
          <tbody>
            <tr v-for="(f, i) in cfgFreightsArr" :key="i">
              <td><input v-model="f.name" style="width:120px" /></td>
              <td><input v-model.number="f.amt" type="number" style="width:80px" /></td>
              <td><input type="checkbox" v-model="f.on" /></td>
              <td><button class="btn mini" @click="saveFreightRow(i)">💾 保存修改</button></td>
            </tr>
          </tbody>
        </table>
        <button class="btn mini" @click="addFreightRow">＋ 新增</button>
        <h3 class="sec">打包费选项（n 选一，可增删）</h3>
        <table class="styled-table" style="margin-bottom:8px">
          <thead><tr><th>名称</th><th>金额</th><th>启用</th><th>保存</th></tr></thead>
          <tbody>
            <tr v-for="(p, i) in cfgPacksArr" :key="i">
              <td><input v-model="p.name" style="width:120px" /></td>
              <td><input v-model.number="p.amt" type="number" style="width:80px" /></td>
              <td><input type="checkbox" v-model="p.on" /></td>
              <td><button class="btn mini" @click="savePackRow(i)">💾 保存修改</button></td>
            </tr>
          </tbody>
        </table>
        <button class="btn mini" @click="addPackRow">＋ 新增</button>
        <div class="card" style="margin-top:12px">
              <h3 class="sec">💰 收款码</h3>
              <div class="row" style="gap:12px;margin-bottom:8px">
                <div style="flex:1">
                  <label style="font-size:12px;color:#888;display:block;margin-bottom:4px">支付宝收款码</label>
                  <div style="border:1px dashed var(--line2);border-radius:var(--r-md);padding:12px;text-align:center;cursor:pointer;min-height:120px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px" @click="pickPayCode('ali')">
                    <img v-if="cfgEd.payCodeAli" :src="cfgEd.payCodeAli" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)" />
                    <div v-else style="color:var(--t3)"><div style="font-size:28px">📷</div><p style="font-size:12px;margin-top:4px">点击上传支付宝收款码</p></div>
                  </div>
                </div>
                <div style="flex:1">
                  <label style="font-size:12px;color:#888;display:block;margin-bottom:4px">微信收款码</label>
                  <div style="border:1px dashed var(--line2);border-radius:var(--r-md);padding:12px;text-align:center;cursor:pointer;min-height:120px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px" @click="pickPayCode('wx')">
                    <img v-if="cfgEd.payCodeWx" :src="cfgEd.payCodeWx" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)" />
                    <div v-else style="color:var(--t3)"><div style="font-size:28px">📷</div><p style="font-size:12px;margin-top:4px">点击上传微信收款码</p></div>
                  </div>
                </div>
              </div>
          <p class="muted">拼团囤货：{{ cfgEd.groupFreeDays }}天免费 / 超期{{ cfgEd.groupOverFeeOn ? '收费' : '不收费' }} / {{ cfgEd.groupOverDays }}天转拍卖； 直售囤货：{{ cfgEd.saleFreeDays }}天免费 / 超期{{ cfgEd.saleOverFeeOn ? '收费' : '不收费' }} / {{ cfgEd.saleOverDays }}天转拍卖； 邮费 {{ freightOpts.length }}项 / 打包费 {{ packOpts.length }}项</p>
        </div>
      </template>

      <template v-else-if="adminTab === '我的账号'">
        <h2>我的账号</h2>
        <p>CN：{{ store.user.cn }} · 角色：{{ store.user.role }}</p>
        <button class="btn gray mini" @click="goMember">以买家身份进入 C 端</button>
      </template>
    </main>
  </div>

  <!-- 团员 → C 端 -->
  <div v-else class="phone">
    <div class="statusbar"><span>9:41</span><span>●●● 📶 🔋</span></div>
    <div class="content">
      <!-- 首页：Timeline 时间轴 -->
      <template v-if="tab === 'home'">
        <div v-if="store.user.role !== 'member' && store.viewMode === 'member'" style="text-align:center;margin:8px 12px">
          <button class="btn gray mini" @click="store.viewMode = 'auto'; loadAdmin();">← 返回后台管理</button>
        </div>
        <!-- StockWorkspace 清货工作台（从 Timeline 跳转时显示） -->
        <StockWorkspace
          v-if="showStockWorkspace"
          :stockItems="swStockItems"
          :freights="freightOpts"
          :packs="packOpts"
          :addresses="myAddresses"
          :preselectedId="swPreselectedId"
          @back="showStockWorkspace = false"
          @submit="handleStockSubmit"
        />
        <!-- Timeline 首页主组件 -->
        <Timeline
          v-else
          :myBills="myBills"
          :myBuys="myBuys"
          :myAuctionOrders="myAuctionOrders"
          :myTransfers="myTransfers"
          :myClears="myClears"
          :notis="notis"
          :shopCfg="shopCfg"
          :seriesList="seriesList"
          @navigate="handleTimelineNavigate"
          @go-group="handleTimelineGoGroup"
        />
      </template>

      <!-- 拼团 -->
      <template v-else-if="tab === 'group'">
        <template v-if="!curSeries">
          <!-- 修正#1：拼团tab默认「我的拼团」，顶部切换 all/mine -->
          <div class="group-tab-switcher">
            <button :class="{ on: groupSubTab === 'mine' }" @click="groupSubTab = 'mine'">我的拼团</button>
            <button :class="{ on: groupSubTab === 'all' }" @click="groupSubTab = 'all'">去大厅</button>
          </div>
          <!-- 我的拼团 -->
          <div v-if="groupSubTab === 'mine'">
            <div v-if="!myBills.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">🧩</div>
              <p class="muted">暂无拼团记录</p>
              <button class="btn mini" style="margin-top:12px" @click="groupSubTab = 'all'">去大厅看看</button>
            </div>
            <div v-for="b in myBills" :key="b.id" class="card my-bill-card">
              <div class="my-bill-header" @click="tab='me'; goMe('orders')">
                <div class="cover-sm">{{ b.seriesEmoji || '🧩' }}</div>
                <div style="flex:1;margin-left:12px">
                  <b style="font-size:15px">{{ b.seriesName }}</b>
                  <div class="muted" style="font-size:12px;margin-top:2px">¥{{ b.total }} · {{ b.items?.length || 0 }}件</div>
                </div>
                <span :class="['tag', b.state === '待付款' ? 'orange' : b.state === '已销账' ? 'green' : 'pink']">{{ b.state }}</span>
                <span style="color:var(--t4);font-size:20px;margin-left:8px">›</span>
              </div>
              <!-- 谷子明细 -->
              <div class="my-bill-items">
                <span v-for="i in (b.items || [])" :key="i.id" class="my-bill-chip">{{ i.name }} ×{{ i.qty }}</span>
              </div>
            </div>
          </div>
          <!-- 全部拼团（大厅） -->
          <div v-else>
            <div class="subpage-header">
              <h3>🧩 全部拼团</h3>
            </div>
            <div v-for="s in activeSeriesList" :key="s.id" class="card row" @click="openSeries(s.id)" style="cursor:pointer">
              <div class="cover-sm">{{ s.emoji }}</div>
              <div style="flex:1;margin-left:12px">
                <b style="font-size:15px">{{ s.name }}</b>
                <p class="muted" style="margin:2px 0">{{ s.ip }} · <span style="color:var(--brand)">{{ seriesCountdown[s.id] || s.deadline }}</span></p>
                <span :class="['tag', s.status === '进行中' ? 'pink' : 'gray']">{{ s.status }}</span>
              </div>
              <span style="color:var(--t4);font-size:20px;margin-left:4px">›</span>
            </div>
            <div v-if="!activeSeriesList.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">🧩</div>
              <p class="muted">暂无进行中的拼团活动</p>
              <p v-if="closedSeriesCount" class="muted" style="font-size:12px;margin-top:4px">当前有 {{ closedSeriesCount }} 个系列已截团</p>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="subpage-header">
            <button class="back-btn" @click="backToSeriesList">← 返回</button>
            <h3>{{ curSeries.name }}</h3>
          </div>
          <div class="card">
            <div class="cover-lg">{{ curSeries.emoji }}</div>
            <div class="row between" style="margin-top:10px">
              <b style="font-size:16px">{{ curSeries.name }}</b>
              <span :class="['tag', curSeries.status === '进行中' ? 'pink' : 'green']">{{ curSeries.status }}</span>
            </div>
            <p class="muted" style="margin-top:4px">{{ curSeries.ip }} · {{ curSeries.eta }} · {{ curSeries.freightRule }} · <span style="color:var(--brand)">{{ seriesCountdown[curSeries.id] || curSeries.deadline }}</span></p>
          </div>
          <div class="catbar">
            <button v-for="c in cats" :key="c" :class="{ on: curCat === c }" @click="curCat = c">{{ c }}</button>
          </div>
          <div class="card">
            <div v-for="g in filteredGoods" :key="g.id" class="good">
              <div class="gimg">{{ g.emoji }}</div>
              <div class="ginfo">
                <div class="gname">{{ g.name }}</div>
                <div class="muted" style="margin-top:2px">{{ g.cat }}</div>
                <div class="row between" style="margin-top:4px">
                  <b class="price" style="font-size:16px">¥{{ g.price }}</b>
                  <span class="muted">已排 {{ g.booked }}/{{ g.limit }}</span>
                </div>
                <div class="progress"><i :style="{ width: Math.min(100, g.limit ? g.booked / g.limit * 100 : 0) + '%' }"></i></div>
                <div class="row between">
                  <span class="muted" style="font-size:11px">{{ g.booked >= g.limit ? '已排满·可候补' : '余量 ' + (g.limit - g.booked) }}</span>
                  <div class="qty">
                    <button @click="chg(g.id, -1)">−</button><span>{{ cart[g.id] || 0 }}</span><button @click="chg(g.id, 1)">＋</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style="height:70px"></div>
          <div class="footbar">
            <div style="flex:1">
              <p class="muted" style="font-size:11px">我的肾表（{{ cartCount }} 项）</p>
              <b class="price" style="font-size:18px">¥{{ cartTotal }}</b>
            </div>
            <button class="btn gray" @click="tab='me'; goMe('orders')">🧾 肾表</button>
            <button class="btn" @click="submitFollow" :disabled="curSeries.status !== '进行中'" style="min-width:100px">
              {{ curSeries.status === '进行中' ? '提交跟排' : '已截团' }}
            </button>
          </div>
        </template>
      </template>

      <!-- 直售 -->
      <template v-else-if="tab === 'sale'">
        <template v-if="!curSaleGood">
          <div class="subpage-header">
            <h3>🛒 直售谷子</h3>
          </div>
          <div class="row" style="padding:0 12px 8px;gap:8px">
            <input v-model="saleQ" placeholder="🔍 搜索名字 / IP / 所属者CN" style="flex:1" />
            <button class="btn mini" @click="showCart = !showCart">🛒 购物车<span v-if="saleCartCount" class="cart-badge-inline">{{ saleCartCount }}</span></button>
          </div>
          <div class="catbar">
            <button :class="{ on: saleCatFilter === '全部' }" @click="saleCatFilter = '全部'">全部分类</button>
            <button :class="{ on: saleCatFilter === '中古' }" @click="saleCatFilter = '中古'">中古</button>
            <button :class="{ on: saleCatFilter === '盲抽' }" @click="saleCatFilter = '盲抽'">盲抽</button>
            <button :class="{ on: saleCatFilter === '全新未拆单领' }" @click="saleCatFilter = '全新未拆单领'">全新未拆单领</button>
          </div>
          <div v-for="g in filteredSaleGoods" :key="g.id" class="card row" @click="openSaleDetail(g)" style="cursor:pointer">
            <img v-if="g.img" :src="g.img" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid #eee;flex-shrink:0" />
            <div v-else class="gimg">{{ g.emoji }}</div>
            <div class="ginfo">
              <div class="gname">{{ g.name }}</div>
              <p class="muted" style="margin:2px 0">{{ g.no }} · {{ g.ip }} · {{ g.cat }}</p>
              <div class="row between">
                <b class="price" style="font-size:16px">¥{{ g.price }}</b>
                <span v-if="g.stock > 0" class="tag green">库存 {{ g.stock }}</span>
                <span v-else class="tag gray">已售</span>
              </div>
              <div class="row between" style="margin-top:6px">
                <span class="muted" style="font-size:11px">品类：{{ g.cat }} · 日费率：{{ g.unitFee }}元/件/天</span>
              </div>
            </div>
          </div>
          <div v-if="!filteredSaleGoods.length" class="card" style="text-align:center;padding:30px 16px">
            <div style="font-size:36px;opacity:.3;margin-bottom:8px">🛒</div>
            <p class="muted">暂无在售谷子</p>
          </div>
          <div v-if="saleCartCount" class="sale-cart-fab" @click="showCart = !showCart">
            🛒<span class="cart-badge">{{ saleCartCount }}</span>
          </div>
        </template>
        <template v-else>
          <div class="subpage-header">
            <button class="back-btn" @click="curSaleGood = null">← 返回</button>
            <h3>谷子详情</h3>
          </div>
          <div class="card">
            <img v-if="curSaleGood.img" :src="curSaleGood.img" style="width:100%;max-height:240px;object-fit:cover;border-radius:8px;margin-bottom:10px;cursor:pointer" @click="showScreenshot(curSaleGood.img)" />
            <div v-else class="cover-lg" style="margin-bottom:10px">{{ curSaleGood.emoji }}</div>
            <h2 style="font-size:18px;font-weight:700">{{ curSaleGood.name }}</h2>
            <p class="muted" style="margin-top:4px">编号：{{ curSaleGood.no }} · IP：{{ curSaleGood.ip }} · 品类：{{ curSaleGood.cat }}</p>
            <div class="row between" style="margin-top:10px">
              <b class="price" style="font-size:22px">¥{{ curSaleGood.price }}</b>
              <span v-if="curSaleGood.stock > 0" class="tag green">库存 {{ curSaleGood.stock }}</span>
              <span v-else class="tag gray">已售</span>
            </div>
            <p class="muted" v-if="curSaleGood.ownerCn" style="margin-top:6px">所属者CN：{{ curSaleGood.ownerCn }}</p>
            <p class="muted" v-if="curSaleGood.statusText" style="margin-top:2px">状态文本：{{ curSaleGood.statusText }}</p>
            <p class="muted" v-if="curSaleGood.unitFee" style="margin-top:2px">品类囤货费率：{{ curSaleGood.unitFee }} 元/件/天</p>
          </div>
          <div class="card row between" v-if="curSaleGood.stock > 0" style="position:sticky;bottom:56px;z-index:5">
            <div class="qty-stepper">
              <button @click="saleQty = Math.max(1, saleQty - 1)">−</button>
              <span>{{ saleQty }}</span>
              <button @click="saleQty = Math.min(curSaleGood.stock, saleQty + 1)">＋</button>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn gray mini" @click="addToCart(curSaleGood, saleQty)">🛒 加购</button>
              <button class="btn mini" @click="buyNow(curSaleGood, saleQty)">立即购买</button>
            </div>
          </div>
        </template>
      </template>

      <!-- 拍卖 -->
      <template v-else-if="tab === 'auction'">
        <template v-if="!curAuction">
          <div class="subpage-header">
            <h3>🔨 拍卖会场</h3>
          </div>
          <div v-for="a in auctions" :key="a.id" class="card" @click="openAuctionDetail(a)" style="cursor:pointer">
            <div class="row">
              <div class="gimg" style="width:80px;height:80px;font-size:32px">{{ a.emoji }}</div>
              <div class="ginfo" style="margin-left:12px">
                <b style="font-size:15px">{{ a.name }}</b>
                <p class="muted" style="margin:2px 0">起拍 ¥{{ a.startPrice }} · 加价 ≥¥{{ a.stepPrice }} · 保证金 ¥{{ a.deposit }}</p>
                <div class="row between" style="margin-top:4px">
                  <span>当前 <b class="price" style="font-size:18px">¥{{ a.curPrice }}</b></span>
                  <span v-if="+a.buyNow > 0" class="tag red">一口价 ¥{{ a.buyNow }}</span>
                </div>
              </div>
            </div>
            <div class="row between" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line)">
              <span :class="['tag', a.state === '拍卖中' ? 'orange' : a.state === '待付款' ? 'pink' : 'gray']">{{ a.state }}</span>
              <span class="muted">{{ fmtRemain(a.endTime) }}</span>
            </div>
          </div>
          <div v-if="!auctions.length" class="card" style="text-align:center;padding:30px 16px">
            <div style="font-size:36px;opacity:.3;margin-bottom:8px">🔨</div>
            <p class="muted">暂无拍卖活动</p>
          </div>
        </template>
        <template v-else>
          <div class="subpage-header">
            <button class="back-btn" @click="curAuction = null">← 返回</button>
            <h3>拍卖详情</h3>
          </div>
          <div class="card">
            <div class="cover-lg" style="margin-bottom:10px">{{ curAuction.emoji }}</div>
            <h2 style="font-size:18px;font-weight:700">{{ curAuction.name }}</h2>
            <p class="muted" v-if="curAuction.desc" style="margin-top:4px">{{ curAuction.desc }}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
              <div style="background:var(--bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0">起拍价</p><b style="font-size:16px">¥{{ curAuction.startPrice }}</b></div>
              <div style="background:var(--brand-bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0;color:var(--brand)">当前价</p><b class="price" style="font-size:18px">¥{{ curAuction.curPrice }}</b></div>
              <div style="background:var(--bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0">加价幅度</p><b style="font-size:15px">¥{{ curAuction.stepPrice }}</b></div>
              <div style="background:var(--bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0">一口价</p><b style="font-size:15px">¥{{ curAuction.buyNow }}</b></div>
              <div style="background:var(--bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0">保证金</p><b style="font-size:15px">¥{{ curAuction.deposit }}</b></div>
              <div style="background:var(--bg);border-radius:var(--r-md);padding:10px 12px"><p class="muted" style="margin:0">状态</p><span :class="['tag', curAuction.state === '拍卖中' ? 'orange' : 'gray']" style="margin-top:2px">{{ curAuction.state }}</span></div>
            </div>
            <p class="muted" style="margin-top:10px;text-align:center">⏳ {{ fmtRemain(curAuction.endTime) }}</p>
          </div>
          <div class="card" v-if="auctionBids.length">
            <h4 style="margin:0 0 8px">出价记录</h4>
            <div v-for="b in auctionBids" :key="b.id" class="row between" style="font-size:13px;padding:4px 0">
              <span>{{ b.cn }} · ¥{{ b.price }}</span><span class="muted">{{ fmtTime(b.createdAt) }}</span>
            </div>
          </div>
          <div class="card">
            <p class="muted">保证金状态：<span v-if="myDepositState === '已缴'" class="tag green">已缴纳</span><span v-else-if="myDepositState === '待审核'" class="tag orange">审核中</span><span v-else class="tag gray">未缴纳</span></p>
            <div class="row" style="gap:8px;margin-top:8px">
              <button v-if="myDepositState !== '已缴' && myDepositState !== '待审核'" class="btn gray mini" @click="showDepositPanel = true">💰 缴纳保证金</button>
              <button v-if="myDepositState === '已缴'" class="btn mini" @click="showBidPanel = true">🔥 出价</button>
              <span v-if="myDepositState === '待审核'" class="muted">保证金审核中，请等待</span>
            </div>
          </div>
          <!-- 中标付款入口 -->
          <div class="card" v-if="curAuction && curAuction.state === '待付款' && curAuction.winnerId === store.user.id" style="border:2px solid var(--brand)">
            <h4 style="margin:0 0 8px;color:var(--brand)">🎉 恭喜中标！</h4>
            <p class="muted" style="margin-bottom:8px">中标价 ¥{{ curAuction.curPrice }}，保证金已自动抵扣，请在24小时内完成尾款支付</p>
            <div v-if="auctionCountdown['detail-' + curAuction.id]" class="row" style="gap:6px;margin-bottom:8px;align-items:center">
              <span class="tag orange" style="font-size:13px">⏳ {{ auctionCountdown['detail-' + curAuction.id] }}</span>
            </div>
            <button class="btn" style="width:100%" @click="openAuctionPayPanel">💳 立即付款</button>
          </div>
        </template>
      </template>

      <!-- 我的 -->
      <template v-else-if="tab === 'me'">
        <div v-if="store.user.banned" class="banned">⛔ 你已被拉黑，无法进行新交易；存量订单保留。</div>
        <div class="card row between" style="margin-top:12px">
          <div><b style="font-size:16px">👤 {{ store.user.cn }}</b><p class="muted" style="margin-top:2px">余额（记账）· 可抵扣货款/邮费/保证金</p></div>
          <b class="price" style="font-size:22px">¥{{ store.user.balance }}</b>
        </div>
        <div class="me-list" v-if="!meSubTab">
          <div class="me-item" @click="goMe('notis')">
            <span class="me-icon">🔔</span>
            <div class="me-text"><div class="me-title">消息通知</div><div class="me-sub" v-if="unreadCount">{{ unreadCount }}条未读</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('after')">
            <span class="me-icon">🛡</span>
            <div class="me-text"><div class="me-title">售后</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('orders')">
            <span class="me-icon">📦</span>
            <div class="me-text"><div class="me-title">我的订单</div><div class="me-sub" v-if="pendingBillCount + pendingBuyCount + pendingCancelCount">{{ pendingBillCount + pendingBuyCount }}笔待付款{{ pendingCancelCount ? ' · ' + pendingCancelCount + '笔审核中' : '' }}</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('second')">
            <span class="me-icon">📋</span>
            <div class="me-text"><div class="me-title">二次收肾</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('transfer')">
            <span class="me-icon">🔄</span>
            <div class="me-text"><div class="me-title">转单</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('stock')">
            <span class="me-icon">📦</span>
            <div class="me-text"><div class="me-title">囤货清货</div><div class="me-sub" v-if="stockCount">{{ stockCount }}笔囤货中</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item me-balance" @click="goMe('wallet')">
            <span class="me-icon">💰</span>
            <div class="me-text"><div class="me-title">余额</div><div class="me-sub">可用于抵扣货款/邮费/打包费/保证金；来源：囤货过期拍卖成交、多付款、售后</div></div>
            <div style="text-align:right"><b class="price" style="font-size:16px">¥{{ store.user.balance }}</b><br><span class="me-arrow" style="float:right">›</span></div>
          </div>
          <div class="me-item" @click="goMe('addr')">
            <span class="me-icon">📍</span>
            <div class="me-text"><div class="me-title">收货地址</div><div class="me-sub">{{ myAddresses.length ? myAddresses.length + '个地址' : '点击添加' }}</div></div>
            <span class="me-arrow">›</span>
          </div>
          <div class="me-item" @click="goMe('settings')">
            <span class="me-icon">⚙️</span>
            <div class="me-text"><div class="me-title">设置</div><div class="me-sub">修改密码、联系方式、数据导出</div></div>
            <span class="me-arrow">›</span>
          </div>
        </div>

        <!-- ===== 详情子页面 ===== -->

        <!-- 消息通知详情 -->
        <template v-if="meSubTab === 'notis'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>🔔 消息通知</h3>
            <button class="btn mini gray" @click="readAllNoti">全部已读</button>
          </div>
          <div v-if="!notis.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">🔔</div><p class="muted">暂无消息</p></div>
          <div v-for="n in notis" :key="n.id" class="card" :style="{ opacity: n.read ? .55 : 1 }">
            <div class="row between" style="margin-bottom:4px">
              <b style="font-size:13px">{{ n.read ? '' : '🔴 ' }}{{ n.title }}</b>
              <div class="row" style="gap:8px">
                <span class="muted">{{ fmtTime(n.createdAt) }}</span>
                <button class="btn nano gray" style="padding:2px 6px;font-size:11px;color:var(--t3);background:var(--bg);border-radius:var(--r-sm)" @click.stop="deleteNoti(n)">删除</button>
              </div>
            </div>
            <p style="font-size:13px" @click="readNoti(n)">{{ n.body }}</p>
          </div>
        </template>

        <!-- 我的售后详情 -->
        <template v-if="meSubTab === 'after'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>🛡 我的售后</h3>
          </div>
          <div class="card">
            <h4 style="margin:0 0 8px">发起售后申请</h4>
            <select v-model="af.orderId" style="width:100%;margin-bottom:6px">
              <option value="">选择订单</option>
              <optgroup v-if="myBillsForAfter.length" label="拼团肾表">
                <option v-for="b in myBillsForAfter" :key="'bill-'+b.id" :value="'bill-'+b.id">拼团 #{{ b.id }} · {{ b.seriesName }} · {{ b.items.map(i => i.name).join('、') }}</option>
              </optgroup>
              <optgroup v-if="myBuys.length" label="直售订单">
                <option v-for="o in myBuys" :key="o.id" :value="String(o.id)">直售 #{{ o.id }} · {{ o.items.map(i => i.name).join('、') }}</option>
              </optgroup>
            </select>
            <div class="row" style="gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <button v-for="tp in ['漏发', '错发']" :key="tp" :class="['tag', af.type === tp ? 'pink' : 'gray']" style="border:none" @click="af.type = tp">{{ tp }}</button>
              <button v-for="w in ['退货', '换货']" :key="w" :class="['tag', af.way === w ? 'pink' : 'gray']" style="border:none" @click="af.way = w">{{ w === '退货' ? '退货(退余额)' : '换货(随下次排发)' }}</button>
            </div>
            <input v-model="af.goods" placeholder="涉及谷子（如：温泉吧唧×1）" style="margin-bottom:6px" />
            <div style="margin-bottom:8px">
              <label style="font-size:12px;color:#888;display:block;margin-bottom:4px">开箱视频（完整无剪辑）</label>
              <div style="border:1px dashed var(--line2);border-radius:var(--r-md);padding:12px;text-align:center;cursor:pointer;min-height:100px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px" @click="pickAfterVideo">
                <img v-if="af.video" :src="af.video" style="max-width:100%;max-height:180px;border-radius:var(--r-sm)" />
                <div v-else style="color:var(--t3)"><div style="font-size:28px">📷</div><p style="font-size:12px;margin-top:4px">点击上传开箱视频/图片</p></div>
              </div>
            </div>
            <button class="btn" style="width:100%" @click="createAfter">提交售后申请</button>
          </div>
          <h3 class="sec">我的售后单</h3>
          <div v-if="!myAfters.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">🛡</div><p class="muted">暂无售后记录</p></div>
          <div v-for="a in myAfters" :key="a.id" class="card">
            <div class="row between"><b style="font-size:13px">{{ a.type }} · {{ a.goods }}</b>
              <span class="tag orange">{{ a.state }}</span></div>
            <p class="muted">订单{{ a.orderId }} · {{ a.way }}<span v-if="a.note"> · {{ a.note }}</span></p>
            <button v-if="['退货·待寄回', '换货·待寄回错发品'].includes(a.state)" class="btn mini" @click="shipBack(a)">提交寄回单号</button>
          </div>
        </template>

        <!-- 我的订单（拼团+直售） -->
        <template v-if="meSubTab === 'orders'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>📦 我的订单</h3>
          </div>
          <div class="catbar" style="margin:8px 12px">
            <button :class="{ on: ordersSubTab === 'all' }" @click="ordersSubTab = 'all'">全部</button>
            <button :class="{ on: ordersSubTab === 'group' }" @click="ordersSubTab = 'group'">拼团订单</button>
            <button :class="{ on: ordersSubTab === 'sale' }" @click="ordersSubTab = 'sale'">直售订单</button>
            <button :class="{ on: ordersSubTab === 'auction' }" @click="ordersSubTab = 'auction'">拍卖订单</button>
          </div>

          <!-- 快速转单弹窗（直接在订单页弹窗，不跳转） -->
          <div class="modal-mask" v-if="quickTransfer.show" @click.self="quickTransfer.show = false">
            <div class="modal-card" style="padding:20px 16px;max-height:75vh;overflow-y:auto">
              <div class="row between" style="margin-bottom:4px">
                <h4 style="font-size:17px;font-weight:700;margin:0">发起转单</h4>
                <button style="background:none;border:none;font-size:22px;color:var(--t3);padding:0 4px" @click="quickTransfer.show = false">×</button>
              </div>
              <p class="muted" style="font-size:13px;margin-bottom:12px">选择该订单中要转的商品</p>
            <div v-for="(opt, idx) in quickTransfer.options" :key="idx" class="card row between" style="padding:12px;margin-bottom:8px;cursor:pointer;border-radius:var(--r-md);transition:all .15s" :style="{ border: quickTransfer.selected.has(opt.key) ? '2px solid var(--brand)' : '2px solid transparent', background: quickTransfer.selected.has(opt.key) ? 'var(--brand-bg2)' : '#fff' }" @click="toggleQuickTransferOpt(opt)">
                <div class="row" style="gap:10px">
                  <div style="width:20px;height:20px;border-radius:50%;border:2px solid var(--line2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <div v-if="quickTransfer.selected.has(opt.key)" style="width:10px;height:10px;border-radius:50%;background:var(--brand)"></div>
                  </div>
                  <span style="font-size:14px">{{ opt.seriesName }} · {{ opt.name }}<span class="muted" v-if="opt.seq > 0"> #{{ opt.seq }}</span><span class="muted" v-else>（直售）</span></span>
                </div>
                <span class="tag gray" style="font-size:10px">{{ opt.source }}</span>
              </div>
              <div v-if="!quickTransfer.options.length" class="empty-state">
                <div class="icon">📦</div>
                <div class="text">暂无可转商品</div>
              </div>
              <template v-if="quickTransfer.selected.size > 0">
                <div style="margin-top:12px">
                  <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:4px">接收者 CN</label>
                  <select v-model="quickTransfer.toCn" style="margin:8px 0;padding:10px 12px;width:100%;font-size:14px;border:1px solid var(--line2);border-radius:var(--r-md);background:#fff">
                    <option value="" disabled>请选择接收者</option>
                    <option v-for="cn in cnList" :key="cn" :value="cn">{{ cn }}</option>
                  </select>
                </div>
                <div style="margin:10px 0">
                  <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:6px">结算方式</label>
                  <div class="row" style="gap:8px">
                    <button :style="{ flex:1, padding: '10px', borderRadius: 'var(--r-md)', fontSize: '13px', fontWeight: '500', border: quickTransfer.way === 'owner' ? '2px solid var(--brand)' : '2px solid var(--line2)', background: quickTransfer.way === 'owner' ? 'var(--brand-bg)' : '#fff', color: quickTransfer.way === 'owner' ? 'var(--brand)' : 'var(--t2)' }" @click="quickTransfer.way = 'owner'">🏪 店主结算</button>
                    <button :style="{ flex:1, padding: '10px', borderRadius: 'var(--r-md)', fontSize: '13px', fontWeight: '500', border: quickTransfer.way === 'private' ? '2px solid var(--brand)' : '2px solid var(--line2)', background: quickTransfer.way === 'private' ? 'var(--brand-bg)' : '#fff', color: quickTransfer.way === 'private' ? 'var(--brand)' : 'var(--t2)' }" @click="quickTransfer.way = 'private'">🤝 私下交易</button>
                  </div>
                </div>
              </template>
              <div class="row" style="gap:8px;margin-top:16px">
                <button class="btn" style="flex:1" :disabled="!quickTransfer.selected.size || !quickTransfer.toCn.trim()" @click="confirmQuickTransfer">确认发起（{{ quickTransfer.selected.size }}件）</button>
                <button class="btn gray" style="flex:1" @click="quickTransfer.show = false">取消</button>
              </div>
            </div>
          </div>
          <!-- 全部订单（按时间排序） -->
          <template v-if="ordersSubTab === 'all'">
            <div v-if="!allOrders.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">📦</div>
              <p class="muted">暂无订单</p>
            </div>
            <div v-for="o in allOrders" :key="o.type + '-' + o.orderId" class="card">
              <div class="row between" style="margin-bottom:6px">
                <span class="muted" style="font-size:13px">{{ o.title || '订单 #' + o.orderId }}</span>
                <span :class="['tag', o.state === '待付款' ? 'orange' : o.state === '已提交截图' ? 'pink' : 'green']">{{ o.type === 'group' ? '拼团·' : o.type === 'sale' ? '直售·' : '拍卖·' }}{{ o.state }}</span>
              </div>
              <div v-for="i in o.items" :key="i.id" class="row between" style="font-size:13px;padding:3px 0">
                <span>{{ i.name }} ×{{ i.qty }}<span v-if="i.seqs">（谷序{{ i.seqs }}）</span></span>
                <span v-if="o.type === 'group'" class="muted">¥{{ (i.price * i.qty).toFixed(2) }}</span>
              </div>
              <div class="row between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
                <b class="price" style="font-size:16px">¥{{ o.total }}</b>
                <div class="row" style="gap:6px">
                  <button v-if="o.state === '待付款'" class="btn mini" @click="o.type === 'group' ? payBill(o.raw) : o.type === 'auction' ? payAuctionOrder(o.raw) : paySale(o.raw)">付款</button>
                  <button v-if="o.type === 'sale' && o.hours < 48 && o.state !== '已发货' && o.state !== '已完成' && o.state !== '已取消' && o.state !== '已取消（超时）' && o.state !== '申请取消'" class="btn mini gray" @click="cancelSale(o.raw)">{{ o.hours < 24 ? '取消' : '申请取消' }}</button>
                  <button v-if="(o.type === 'group' && (o.state === '待付款' || o.state === '已付款' || o.state === '囤货中')) || (o.type === 'sale' && o.state === '囤货中') || (o.type === 'auction' && (o.state === '已付款' || o.state === '囤货中'))" class="btn mini" @click="openQuickTransfer(o)">转单</button>
                  <span v-if="o.type === 'sale' && o.state === '申请取消'" class="tag pink" style="font-size:11px">审核中</span>
                </div>
              </div>
            </div>
          </template>
          <!-- 拼团订单 -->
          <template v-if="ordersSubTab === 'group'">
            <!-- 跟排中（截团前可取消） -->
            <template v-if="activeGroupOrders.length">
              <h4 style="margin:12px 16px 8px;font-size:14px;color:var(--brand)">📝 跟排中（截团前可取消）</h4>
              <div v-for="o in activeGroupOrders" :key="o.id" class="card">
                <div class="row between" style="margin-bottom:6px">
                  <b style="font-size:14px">系列 #{{ o.seriesId }}</b>
                  <span class="tag pink">跟排中</span>
                </div>
                <div v-for="i in o.items" :key="i.id" style="font-size:13px;padding:3px 0">
                  {{ i.name }} ×{{ i.qty }}<span v-if="i.seqs">（谷序{{ i.seqs }}）</span>
                </div>
                <div class="row between" style="margin-top:6px;padding-top:6px;border-top:1px solid #eee">
                  <b class="price" style="font-size:15px">合计：¥{{ o.total }}</b>
                  <div class="row" style="gap:6px">
                    <button class="btn mini gray" @click="cancelGroupOrder(o)">取消跟排</button>
                  </div>
                </div>
              </div>
            </template>
            <!-- 肾表（已截团） -->
            <h4 style="margin:12px 16px 8px;font-size:14px;color:var(--brand)">📋 肾表（已截团）</h4>
            <div v-if="!myBills.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">🧩</div>
              <p class="muted">暂无肾表</p>
            </div>
            <div v-for="b in myBills" :key="b.id" class="card">
              <div class="row between" style="margin-bottom:8px">
                <b style="font-size:14px">{{ b.seriesName }}</b>
                <span :class="['tag', b.state === '待付款' ? 'orange' : b.state === '已提交截图' ? 'pink' : 'green']">{{ b.state }}</span>
              </div>
              <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:8px">
                <thead>
                  <tr style="color:#888;border-bottom:1px solid #eee">
                    <th style="text-align:left;padding:4px 2px">谷子</th>
                    <th style="text-align:center;padding:4px 2px">分类</th>
                    <th style="text-align:right;padding:4px 2px">单价</th>
                    <th style="text-align:center;padding:4px 2px">数量</th>
                    <th style="text-align:center;padding:4px 2px">谷序</th>
                    <th style="text-align:right;padding:4px 2px">小计</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="i in b.items" :key="i.id" style="border-bottom:1px solid #f5f5f5">
                    <td style="padding:6px 2px">{{ i.name }}</td>
                    <td style="text-align:center;padding:6px 2px;color:#888">{{ i.cat || '-' }}</td>
                    <td style="text-align:right;padding:6px 2px">¥{{ i.price }}</td>
                    <td style="text-align:center;padding:6px 2px">×{{ i.qty }}</td>
                    <td style="text-align:center;padding:6px 2px">{{ i.seqs || '-' }}</td>
                    <td style="text-align:right;padding:6px 2px;font-weight:500">¥{{ (i.price * i.qty).toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="row between" style="padding-top:6px;border-top:1px solid #eee">
                <b class="price" style="font-size:16px">合计：¥{{ b.total }}</b>
                <div class="row" style="gap:6px">
                  <button v-if="b.state === '待付款'" class="btn mini" @click="payBill(b)">付款</button>
                  <button v-if="b.state === '待付款' || b.state === '已付款' || b.state === '囤货中'" class="btn mini gray" @click="openQuickTransfer({type:'group', raw:b, state:b.state, items:b.items})">转单</button>
                </div>
              </div>
            </div>
          </template>
          <!-- 直售订单 -->
          <template v-if="ordersSubTab === 'sale'">
            <div v-if="!myBuys.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">🛒</div>
              <p class="muted">暂无直售订单</p>
            </div>
            <div v-for="o in myBuys" :key="o.id" class="card">
              <div class="row between"><span class="muted">#{{ o.id }}</span>
                <span :class="['tag', o.status === '待付款' ? 'orange' : o.status === '已提交截图' ? 'pink' : o.status === '申请取消' ? 'pink' : 'green']">{{ o.status }}</span></div>
              <div v-for="i in o.items" :key="i.id" style="font-size:13px;padding:4px 0">{{ i.name }} ×{{ i.qty }}</div>
              <div v-if="o.blindShipMode" class="row" style="font-size:12px;padding:4px 0;gap:6px">
                <span class="tag" :class="o.blindShipMode === 'video' ? 'pink' : 'green'">{{ o.blindShipMode === 'video' ? '📹 需要视频选择且拆开' : '🎲 直接随机发货不拆开' }}</span>
              </div>
              <div class="row between"><b class="price">¥{{ o.total }}</b>
                <div class="row" style="gap:6px">
                  <button v-if="o.status === '待付款'" class="btn mini" @click="paySale(o)">付款</button>
                  <button v-if="o.status !== '已发货' && o.status !== '已完成' && o.status !== '已取消' && o.status !== '已取消（超时）' && o.status !== '申请取消' && o.hours < 48" class="btn mini gray" @click="cancelSale(o)">{{ o.hours < 24 ? '取消' : '申请取消' }}</button>
                  <button v-if="o.status === '囤货中'" class="btn mini" @click="openQuickTransfer({type:'sale', raw:o, state:o.status, items:o.items})">转单</button>
                  <span v-if="o.status === '申请取消'" class="tag pink" style="font-size:11px">审核中</span>
                </div>
              </div>
            </div>
          </template>
          <!-- 拍卖订单 -->
          <template v-if="ordersSubTab === 'auction'">
            <div v-if="!myAuctionOrders.length" class="card" style="text-align:center;padding:30px 16px">
              <div style="font-size:36px;opacity:.3;margin-bottom:8px">🔨</div>
              <p class="muted">暂无拍卖订单</p>
            </div>
            <div v-for="a in myAuctionOrders" :key="a.id" class="card">
              <div class="row between"><span class="muted">#{{ a.id }} · {{ a.emoji }} {{ a.name }}</span>
                <span :class="['tag', a.state === '待付款' ? 'orange' : a.state === '已付款' || a.state === '囤货中' ? 'green' : 'gray']">{{ a.state }}<span v-if="a.isWinner"> · 中标</span></span></div>
              <p class="muted" style="font-size:13px">当前价：¥{{ a.curPrice }} · 我的最高出价：¥{{ a.myMaxBid }}</p>
              <div v-if="a.state === '待付款' && a.isWinner && auctionCountdown[a.id]" class="row" style="gap:6px;margin-top:4px;align-items:center">
                <span class="tag orange" style="font-size:12px">⏳ {{ auctionCountdown[a.id] }}</span>
              </div>
              <div class="row between"><b class="price">¥{{ a.curPrice }}</b>
                <div class="row" style="gap:6px">
                  <button v-if="a.state === '待付款' && a.isWinner" class="btn mini" @click="payAuctionOrder(a)">付款</button>
                  <button v-if="a.state === '已付款' || a.state === '囤货中'" class="btn mini gray" @click="openQuickTransfer({type:'auction', raw:a, state:a.state, items:[{name:a.name, qty:1}], seriesName:'拍卖'})">转单</button>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- 二次收肾详情 -->
        <template v-if="meSubTab === 'second'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>📋 二次收肾</h3>
          </div>
          <div v-if="!mySecondBills.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">📋</div><p class="muted">暂无二次收肾单</p></div>
          <div v-for="b in mySecondBills" :key="b.id" class="card">
            <div class="row between"><b style="font-size:13px">{{ b.title }}</b>
              <span :class="['tag', b.state === '待付款' ? 'orange' : b.state === '已提交截图' ? 'pink' : 'green']">{{ b.state }}</span></div>
            <p class="muted">用途：{{ b.calc }} · 金额：¥{{ b.amount }}</p>
            <div v-if="b.state === '待付款'" class="row" style="gap:6px;margin-top:6px">
              <button class="btn mini" @click="paySecond(b)">付款</button>
            </div>
          </div>
        </template>

        <!-- 我的转单详情 -->
        <template v-if="meSubTab === 'transfer'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>🔄 转单</h3>
          </div>

          <!-- 发起转单按钮 -->
          <div class="card"><button class="btn" style="width:100%" @click="openTransferPanel">＋ 发起转单（24h限时）</button></div>

          <!-- 转单选择弹窗 -->
          <div v-if="transferForm.show" class="modal-mask" @click.self="transferForm.show = false">
            <div class="modal-card" style="padding:16px;max-height:80vh;overflow-y:auto">
              <div class="row between" style="margin-bottom:4px">
                <h4 style="font-size:17px;font-weight:700;margin:0">发起转单</h4>
                <button style="background:none;border:none;font-size:22px;color:var(--t3);padding:0 4px" @click="transferForm.show = false">×</button>
              </div>
              <p class="muted" style="font-size:13px;margin-bottom:12px">选择要转的商品（可多选）</p>

              <!-- 系列分组列表 -->
              <div v-if="!transferForm.options.length" class="empty-state">
                <div class="icon">📦</div>
                <div class="text">暂无可转商品</div>
              </div>

              <!-- 按系列名分组 -->
              <template v-for="group in transferGroups" :key="group.name">
                <div class="transfer-group-header" @click="toggleTransferGroup(group.name)">
                  <span class="transfer-group-arrow" :class="{ open: transferForm.expandedGroups.has(group.name) }">▶</span>
                  <b style="font-size:14px">{{ group.name }}</b>
                  <span class="tag gray" style="font-size:11px;margin-left:6px">{{ group.items.length }}件</span>
                </div>
                <div v-show="transferForm.expandedGroups.has(group.name)" class="transfer-group-body">
                  <div v-for="opt in group.items" :key="opt.key"
                       class="transfer-item"
                       :class="{ selected: transferForm.selected.has(opt.key) }"
                       @click="toggleTransferItem(opt)">
                    <div class="row" style="gap:10px;align-items:center">
                      <div class="check-circle" :class="{ checked: transferForm.selected.has(opt.key) }">
                        <div v-if="transferForm.selected.has(opt.key)" class="check-dot"></div>
                      </div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:14px">{{ opt.name }}<span v-if="opt.seq > 0" class="muted"> #{{ opt.seq }}</span></div>
                        <div style="font-size:12px;color:#888">{{ opt.source }}</div>
                      </div>
                      <span class="tag gray" style="font-size:10px;flex-shrink:0">¥{{ opt.price || 0 }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- 底部操作区 -->
              <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
                <div class="row between" style="margin-bottom:8px">
                  <span style="font-size:13px">已选 {{ transferForm.selected.size }} 件</span>
                  <b v-if="transferForm.selected.size" style="color:var(--accent);font-size:13px">合计 ¥{{ transferSelectedTotal.toFixed(2) }}</b>
                </div>

                <template v-if="transferForm.selected.size > 0">
                  <div style="margin-bottom:10px">
                    <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:4px">接收者 CN *</label>
                    <select v-model="transferForm.toCn" style="padding:10px 12px;width:100%;font-size:14px;border:1px solid var(--line2);border-radius:var(--r-md);background:#fff">
                      <option value="" disabled>请选择接收者</option>
                      <option v-for="cn in cnList" :key="cn" :value="cn">{{ cn }}</option>
                    </select>
                  </div>
                  <div style="margin-bottom:12px">
                    <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:6px">结算方式</label>
                    <div class="row" style="gap:8px">
                      <button :class="['transfer-way-btn', transferForm.way === 'owner' ? 'active' : '']" @click="transferForm.way = 'owner'">🏪 店主结算</button>
                      <button :class="['transfer-way-btn', transferForm.way === 'private' ? 'active' : '']" @click="transferForm.way = 'private'">🤝 私下交易</button>
                    </div>
                  </div>
                </template>

                <div class="row" style="gap:8px">
                  <button class="btn" style="flex:1" :disabled="!transferForm.selected.size || !transferForm.toCn.trim()" :style="(!transferForm.selected.size || !transferForm.toCn.trim()) ? 'opacity:.5;cursor:not-allowed' : ''" @click="confirmBatchTransfer">确认发起（{{ transferForm.selected.size }}件）</button>
                  <button class="btn gray" style="flex:1" @click="transferForm.show = false">取消</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 转单子标签 -->
          <div class="catbar" style="margin:8px 12px">
            <button :class="{ on: transferSubTab === 'sent' }" @click="transferSubTab = 'sent'">我发起的</button>
            <button :class="{ on: transferSubTab === 'received' }" @click="transferSubTab = 'received'">我接收的</button>
          </div>

          <!-- 我发起的 -->
          <template v-if="transferSubTab === 'sent'">
            <div v-if="!sentTransfers.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">🔄</div><p class="muted">暂无发起的转单</p></div>
            <div v-for="t in sentTransfers" :key="t.id" class="card">
              <div class="row between"><b style="font-size:13px">{{ t.name }}<span v-if="t.seq > 0"> #{{ t.seq }}</span><span v-else class="muted" style="font-size:11px">（直售/拍卖）</span></b>
                <span :class="['tag', t.state === '已完成' ? 'green' : t.state === '已失败' ? 'red' : 'orange']">{{ t.state }}</span></div>
              <p class="muted">→ {{ t.toCn }} · {{ t.way === 'owner' ? '店主结算' : '私下交易' }} · ¥{{ t.price }}</p>
              <div class="row between" style="margin-top:4px">
                <span class="muted">⏳ {{ fmtRemain(t.deadline) }}</span>
              </div>
            </div>
          </template>

          <!-- 我接收的 -->
          <template v-if="transferSubTab === 'received'">
            <div v-if="!receivedTransfers.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">🔄</div><p class="muted">暂无接收的转单</p></div>
            <div v-for="t in receivedTransfers" :key="t.id" class="card">
              <div class="row between"><b style="font-size:13px">{{ t.name }}<span v-if="t.seq > 0"> #{{ t.seq }}</span><span v-else class="muted" style="font-size:11px">（直售/拍卖）</span></b>
                <span :class="['tag', t.state === '已完成' ? 'green' : t.state === '已失败' ? 'red' : 'orange']">{{ t.state }}</span></div>
              <p class="muted">{{ t.fromCn }} → · {{ t.way === 'owner' ? '店主结算' : '私下交易' }} · ¥{{ t.price }}</p>
              <div class="row between" style="margin-top:4px">
                <span class="muted">⏳ {{ fmtRemain(t.deadline) }}</span>
                <span>
                  <button v-if="t.state === '待接收者确认'" class="btn mini" @click="confirmTransfer(t)">确认接受</button>
                  <button v-if="t.state === '待接收者付款'" class="btn mini" @click="payTransfer(t)">付款</button>
                </span>
              </div>
            </div>
          </template>
        </template>

        <!-- 囤货清货详情 -->
        <template v-if="meSubTab === 'stock'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>📦 囤货清货</h3>
          </div>

          <!-- 品类囤货费率参考 -->
          <div v-if="unitFeeOpts.length" class="card" style="margin-top:8px">
            <p class="muted" style="margin-bottom:6px;font-size:12px">📋 品类囤货费率参考（超期仓费 = 件数 × 费率 × 超期天数）</p>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span v-for="uf in unitFeeOpts" :key="uf.name" class="tag gray" style="font-size:12px">{{ uf.name }}：¥{{ uf.fee }}/件/天</span>
            </div>
          </div>

          <!-- 分组折叠囤货列表 -->
          <div v-if="!allStockOrders.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">📦</div><p class="muted">暂无囤货</p></div>

          <!-- 拼团囤货 -->
          <template v-if="stockGroupOrders.length">
            <div class="stock-group-header" @click="toggleStockGroup('group')">
              <span class="stock-group-arrow" :class="{ open: stockExpandedGroups.has('group') }">▶</span>
              <b style="font-size:14px">🛍️ 拼团囤货</b>
              <span class="tag pink" style="font-size:11px;margin-left:6px">{{ stockGroupOrders.length }}单</span>
              <span v-if="stockGroupOrders.some(o => overDays(o) > 0)" class="tag red" style="font-size:11px;margin-left:4px">有超期</span>
            </div>
            <div v-show="stockExpandedGroups.has('group')" class="stock-group-body">
              <div class="card" style="margin-bottom:6px">
                <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
                  <input type="checkbox" :checked="stockGroupOrders.every(o => clearOrderIds.includes(o.id))" @change="toggleSelectGroupOrders" />
                  <span>全选本组（{{ stockGroupOrders.length }}单）</span>
                </label>
              </div>
              <div v-for="o in stockGroupOrders" :key="o.id" class="card" style="padding:10px 12px;margin-top:6px">
                <div class="row between" style="align-items:flex-start">
                  <div style="flex:1;min-width:0" @click="toggleStockDetail(o.id)">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span class="tag pink" style="font-size:11px">拼团</span>
                      <span style="font-size:13px;font-weight:600">{{ o.seriesName }}</span>
                      <span class="muted" style="font-size:12px">· {{ totalQty(o) }}件谷子</span>
                    </div>
                    <div style="font-size:12px;color:#888;margin-top:4px">
                      {{ stockDaysInfo(o) }}
                    </div>
                    <!-- 展开明细 -->
                    <div v-if="stockExpandedDetail.has(o.id)" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
                      <div v-for="it in o.items" :key="it.id" style="font-size:12px;color:var(--t2);padding:2px 0">
                        {{ it.name }}<span class="muted"> ×{{ it.qty }}</span>
                      </div>
                    </div>
                  </div>
                  <input type="checkbox" :value="o.id" v-model="clearOrderIds" style="margin-left:8px;flex-shrink:0" />
                </div>
              </div>
            </div>
          </template>

          <!-- 直售囤货 -->
          <template v-if="stockSaleOrders.length">
            <div class="stock-group-header" @click="toggleStockGroup('sale')">
              <span class="stock-group-arrow" :class="{ open: stockExpandedGroups.has('sale') }">▶</span>
              <b style="font-size:14px">🛒 直售囤货</b>
              <span class="tag gray" style="font-size:11px;margin-left:6px">{{ stockSaleOrders.length }}单</span>
              <span v-if="stockSaleOrders.some(o => overDays(o) > 0)" class="tag red" style="font-size:11px;margin-left:4px">有超期</span>
            </div>
            <div v-show="stockExpandedGroups.has('sale')" class="stock-group-body">
              <div class="card" style="margin-bottom:6px">
                <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
                  <input type="checkbox" :checked="stockSaleOrders.every(o => clearOrderIds.includes(o.id))" @change="toggleSelectSaleOrders" />
                  <span>全选本组（{{ stockSaleOrders.length }}单）</span>
                </label>
              </div>
              <div v-for="o in stockSaleOrders" :key="o.id" class="card" style="padding:10px 12px;margin-top:6px">
                <div class="row between" style="align-items:flex-start">
                  <div style="flex:1;min-width:0" @click="toggleStockDetail(o.id)">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span class="tag gray" style="font-size:11px">直售</span>
                      <span style="font-size:13px;font-weight:600">{{ compactItems(o.items) }}</span>
                    </div>
                    <div style="font-size:12px;color:#888;margin-top:4px">
                      {{ stockDaysInfo(o) }}
                    </div>
                    <!-- 展开明细 -->
                    <div v-if="stockExpandedDetail.has(o.id)" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
                      <div v-for="it in o.items" :key="it.id" style="font-size:12px;color:var(--t2);padding:2px 0">
                        {{ it.name }}<span class="muted"> ×{{ it.qty }}</span>
                      </div>
                    </div>
                  </div>
                  <input type="checkbox" :value="o.id" v-model="clearOrderIds" style="margin-left:8px;flex-shrink:0" />
                </div>
              </div>
            </div>
          </template>

          <!-- 拍卖囤货 -->
          <template v-if="stockAuctionOrders.length">
            <div class="stock-group-header" @click="toggleStockGroup('auction')">
              <span class="stock-group-arrow" :class="{ open: stockExpandedGroups.has('auction') }">▶</span>
              <b style="font-size:14px">🎲 拍卖囤货</b>
              <span class="tag orange" style="font-size:11px;margin-left:6px">{{ stockAuctionOrders.length }}单</span>
              <span v-if="stockAuctionOrders.some(o => overDays(o) > 0)" class="tag red" style="font-size:11px;margin-left:4px">有超期</span>
            </div>
            <div v-show="stockExpandedGroups.has('auction')" class="stock-group-body">
              <div class="card" style="margin-bottom:6px">
                <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
                  <input type="checkbox" :checked="stockAuctionOrders.every(o => clearOrderIds.includes(o.id))" @change="toggleSelectAuctionOrders" />
                  <span>全选本组（{{ stockAuctionOrders.length }}单）</span>
                </label>
              </div>
              <div v-for="o in stockAuctionOrders" :key="o.id" class="card" style="padding:10px 12px;margin-top:6px">
                <div class="row between" style="align-items:flex-start">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span class="tag orange" style="font-size:11px">拍卖</span>
                      <span style="font-size:13px;font-weight:600">{{ o.items[0]?.name }}</span>
                      <span class="muted" style="font-size:12px">· ¥{{ o.total }}</span>
                    </div>
                    <div style="font-size:12px;color:#888;margin-top:4px">
                      {{ stockDaysInfo(o) }}
                    </div>
                  </div>
                  <input type="checkbox" :value="o.id" v-model="clearOrderIds" style="margin-left:8px;flex-shrink:0" />
                </div>
              </div>
            </div>
          </template>

          <!-- 清货操作向导 -->
          <div v-if="allStockOrders.length" class="card" style="margin-top:12px">
            <div class="row between" style="margin-bottom:8px">
              <span class="muted" style="font-size:13px">已选 {{ clearOrderIds.length }} 单</span>
              <b v-if="clearOrderIds.length" style="font-size:13px;color:var(--accent)">预估 ¥{{ clearEstTotal.toFixed(2) }}</b>
            </div>

            <!-- 步骤1: 邮费 -->
            <p class="muted" style="margin-bottom:6px;font-size:12px">① 选择邮费</p>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
              <button v-for="f in freightOpts" :key="f.name" :class="['tag', clearFreight === f.name ? 'pink' : 'gray']" style="border:none" @click="clearFreight = f.name">{{ f.name }} ¥{{ f.amt }}</button>
            </div>

            <!-- 步骤2: 打包费 -->
            <p class="muted" style="margin-bottom:6px;font-size:12px">② 选择打包费</p>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
              <button v-for="p in packOpts" :key="p.name" :class="['tag', clearPack === p.name ? 'pink' : 'gray']" style="border:none" @click="clearPack = p.name">{{ p.name }} ¥{{ p.amt }}</button>
            </div>

            <!-- 超期仓费 -->
            <div v-if="totalOverFee > 0" class="row between" style="margin:8px 0;color:#F5222D;font-size:13px">
              <span>③ 超期仓费（自动计算）</span>
              <b>¥{{ totalOverFee.toFixed(2) }}</b>
            </div>

            <!-- 步骤4: 收货地址 -->
            <p class="muted" style="margin:8px 0 6px;font-size:12px">④ 收货地址 *</p>
            <div v-if="!myAddresses.length" style="margin-bottom:8px">
              <p style="color:#F5222D;font-size:12px;margin-bottom:6px">⚠ 尚无收货地址，请先添加</p>
              <button class="btn mini gray" @click="goMe('addr')">去添加地址</button>
            </div>
            <div v-else style="margin-bottom:8px">
              <select v-model="clearAddressId" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;font-size:13px">
                <option :value="0" disabled>请选择收货地址</option>
                <option v-for="a in myAddresses" :key="a.id" :value="a.id">
                  {{ a.recipientName }} {{ a.phone }} {{ a.region }}{{ a.detail }}{{ a.isDefault ? '（默认）' : '' }}
                </option>
              </select>
            </div>

            <!-- 发起按钮 -->
            <button class="btn" style="width:100%;margin-top:10px" :disabled="!clearOrderIds.length || !clearAddressId" :style="(!clearOrderIds.length || !clearAddressId) ? 'opacity:.5;cursor:not-allowed' : ''" @click="createClearing">
              发起清货（¥{{ clearEstTotal.toFixed(2) }}）
            </button>
          </div>

          <!-- 清货单 -->
          <h3 class="sec">📦 我的清货单</h3>
          <div v-if="!myClears.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">📦</div><p class="muted">暂无清货单</p></div>
          <div v-for="c in myClears" :key="c.id" class="card">
            <div class="row between"><span class="muted">{{ c.freightName }}+{{ c.packName }}{{ +c.overFee ? '+仓费¥' + c.overFee : '' }}</span>
              <span class="tag orange">{{ c.state }}</span></div>
            <!-- 商品明细 -->
            <div v-if="parseClearItems(c.items).length" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
              <div v-for="(it, idx) in parseClearItems(c.items)" :key="idx" class="row between" style="font-size:13px;padding:2px 0">
                <span>{{ it.name }}<span class="muted"> ×{{ it.qty }}</span></span>
                <span class="muted">小计 ¥{{ (it.qty * (+it.price || 0)).toFixed(2) }}</span>
              </div>
              <div class="row between" style="font-size:12px;padding-top:4px;border-top:1px dashed var(--line);margin-top:4px">
                <span class="muted">运费分摊 ¥{{ calcFreightShare(c) }}</span>
                <span class="muted">打包费 ¥{{ c.packAmt }}</span>
              </div>
              <div v-if="+c.overFee" class="row between" style="font-size:12px;padding-top:2px">
                <span class="muted">超期仓费 ¥{{ c.overFee }}</span>
              </div>
            </div>
            <!-- 物流信息 -->
            <div v-if="c.trackingNo" style="margin-top:6px;font-size:12px">
              <span class="muted">物流单号：</span><b>{{ c.trackingNo }}</b>
            </div>
            <div class="row between" style="margin-top:8px"><b class="price">¥{{ c.total }}</b>
              <div class="row" style="gap:6px">
                <button v-if="c.state === '待付款'" class="btn mini" @click="payClearing(c)">付款</button>
                <button v-if="c.state === '已发货'" class="btn mini" @click="confirmClearing(c)">确认收货</button>
              </div>
            </div>
          </div>
        </template>

        <!-- 余额详情（含提现） -->
        <template v-if="meSubTab === 'wallet'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>💰 余额明细</h3>
          </div>
          <div class="card" style="margin:8px 12px">
            <div class="row between" style="margin-bottom:12px">
              <div><p class="muted">当前余额</p><b class="price" style="font-size:24px">¥{{ store.user.balance }}</b></div>
              <button class="btn mini" @click="walletSubTab = 'withdraw'">💳 申请提现</button>
            </div>
            <p class="muted" style="font-size:12px">可用于抵扣货款/邮费/打包费/保证金；来源：囤货过期拍卖成交、多付款、售后</p>
          </div>
          <template v-if="walletSubTab === 'list'">
            <div v-if="!flows.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">💰</div><p class="muted">暂无流水记录</p></div>
            <div v-for="f in flows" :key="f.id" class="card row between" style="padding:10px 12px">
              <div><b style="font-size:13px">{{ f.type }}</b><p class="muted">{{ f.note }} · {{ fmtTime(f.createdAt) }}</p></div>
              <b :class="['me-flow-amount', +f.amount > 0 ? 'green' : 'gray']">{{ +f.amount > 0 ? '+' : '' }}{{ f.amount }}</b>
            </div>
          </template>
          <!-- 提现 -->
          <template v-if="walletSubTab === 'withdraw'">
            <div class="card">
              <p class="muted" style="margin-bottom:12px;font-size:12px">申请后余额立即冻结，店主确认线下转账后标记完成；拒绝则冻结金额退回余额</p>
              <input v-model.number="wd.amount" type="number" placeholder="提现金额" style="margin-bottom:6px" />
              <input v-model="wd.method" placeholder="收款方式（支付宝/微信账号）" style="margin-bottom:6px" />
              <button class="btn" style="width:100%" @click="applyWd">申请提现</button>
              <button class="btn gray" style="width:100%;margin-top:8px" @click="walletSubTab = 'list'">返回流水</button>
            </div>
            <h3 class="sec" style="margin-top:12px">📋 提现记录</h3>
            <div v-if="!myWithdraws.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">💳</div><p class="muted">暂无提现记录</p></div>
            <div v-for="w in myWithdraws" :key="w.id" class="card row between" style="padding:10px 12px">
              <div><b style="font-size:13px">¥{{ w.amount }}</b><p class="muted">{{ w.method }} · {{ fmtTime(w.createdAt) }}</p></div>
              <span :class="['tag', w.state === '待处理' ? 'orange' : (w.state === '已完成' ? 'green' : 'gray')]">{{ w.state }}</span>
            </div>
          </template>
        </template>

        <!-- 收货地址 -->
        <template v-if="meSubTab === 'addr'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>📍 收货地址</h3>
            <button class="btn mini" @click="startEditAddr()">＋ 新增</button>
          </div>

          <!-- 地址编辑/新增表单 -->
          <template v-if="addrForm.show">
            <div class="card" style="margin:8px 12px">
              <p class="muted" style="margin-bottom:8px;font-size:12px">📋 智能识别：在下方文本框粘贴整段地址信息（如淘宝/京东/拼多多复制的地址），系统自动拆分填入各字段</p>
              <textarea v-model="addrForm.pasteText" rows="3" placeholder="粘贴整段地址，如：&#10;张三 13812345678 浙江省杭州市西湖区文三路138号金禾公寓6栋3单元502室" style="width:100%;margin-bottom:8px;font-size:13px;border:1px solid #ddd;border-radius:8px;padding:8px"></textarea>
              <button class="btn mini gray" style="width:100%;margin-bottom:12px" @click="parsePastedAddr">🔍 智能识别并填充</button>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div>
                  <label style="font-size:12px;color:#888">收件人姓名 *</label>
                  <input v-model="addrForm.recipientName" placeholder="收件人姓名" style="width:100%" />
                </div>
                <div>
                  <label style="font-size:12px;color:#888">手机号 *</label>
                  <input v-model="addrForm.phone" placeholder="11位手机号" maxlength="11" style="width:100%" />
                </div>
              </div>
              <div style="margin-bottom:8px">
                <label style="font-size:12px;color:#888">省市区 *</label>
                <input v-model="addrForm.region" placeholder="如：浙江省杭州市西湖区" style="width:100%" />
              </div>
              <div style="margin-bottom:8px">
                <label style="font-size:12px;color:#888">详细地址 *</label>
                <input v-model="addrForm.detail" placeholder="如：XX小区X栋X单元XXX室" style="width:100%" />
              </div>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:12px">
                <input type="checkbox" v-model="addrForm.isDefault" />
                <span>设为默认地址</span>
              </label>
              <div class="row" style="gap:8px">
                <button class="btn" style="flex:1" @click="saveAddr">保存</button>
                <button class="btn gray" style="flex:1" @click="addrForm.show = false">取消</button>
              </div>
            </div>
          </template>

          <!-- 地址列表 -->
          <div v-if="!addrForm.show">
            <div v-if="!myAddresses.length" class="card" style="text-align:center;padding:30px 16px"><div style="font-size:36px;opacity:.3;margin-bottom:8px">📍</div><p class="muted">暂无地址，点击右上角「新增」添加</p></div>
            <div v-for="a in myAddresses" :key="a.id" class="card" style="margin:8px 12px;position:relative">
              <div v-if="a.isDefault" class="tag pink" style="position:absolute;top:10px;right:10px;font-size:11px">默认</div>
              <div style="font-size:15px;margin-bottom:4px;padding-right:40px">
                <b style="font-size:16px">{{ a.recipientName }}</b>
                <span class="muted" style="margin-left:8px;font-size:13px">{{ a.phone }}</span>
              </div>
              <p style="font-size:13px;color:var(--t2);margin:0">{{ a.region }}{{ a.detail }}</p>
              <div class="row" style="gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)">
                <button class="btn mini" @click="startEditAddr(a)">编辑</button>
                <button v-if="!a.isDefault" class="btn mini gray" @click="setDefaultAddr(a.id)">设为默认</button>
                <button class="btn mini gray" style="color:var(--danger)" @click="deleteAddr(a.id)">删除</button>
              </div>
            </div>
          </div>
        </template>

        <!-- 设置 -->
        <template v-if="meSubTab === 'settings'">
          <div class="subpage-header">
            <button class="back-btn" @click="backMeSub">← 返回</button>
            <h3>⚙️ 设置</h3>
          </div>

          <!-- 修改密码 -->
          <h3 class="sec">🔐 修改密码</h3>
          <div class="card" style="margin:8px 12px">
            <div style="margin-bottom:10px">
              <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:4px">原密码</label>
              <input v-model="pwdForm.old" type="password" placeholder="输入当前密码" style="width:100%" />
            </div>
            <div style="margin-bottom:10px">
              <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:4px">新密码</label>
              <input v-model="pwdForm.new" type="password" placeholder="至少6位" style="width:100%" />
            </div>
            <div style="margin-bottom:12px">
              <label style="font-size:13px;color:var(--t2);display:block;margin-bottom:4px">确认新密码</label>
              <input v-model="pwdForm.confirm" type="password" placeholder="再次输入新密码" style="width:100%" />
            </div>
            <button class="btn lg" @click="changePwd">修改密码</button>
          </div>

          <!-- 联系方式 -->
          <h3 class="sec">📱 联系方式</h3>
          <div class="card" style="margin:8px 12px">
            <div style="margin-bottom:8px">
              <label style="font-size:12px;color:#888">QQ</label>
              <input v-model="contactForm.qq" placeholder="QQ号" style="width:100%" />
            </div>
            <div style="margin-bottom:12px">
              <label style="font-size:12px;color:#888">微信</label>
              <input v-model="contactForm.wechat" placeholder="微信号" style="width:100%" />
            </div>
            <button class="btn" style="width:100%" @click="saveContact">保存联系方式</button>
          </div>

          <!-- 个人数据导出 -->
          <h3 class="sec">📥 数据导出</h3>
          <div class="card" style="margin:8px 12px">
            <p class="muted" style="font-size:12px;margin-bottom:12px">将您在店铺中的交易记录导出为 Excel 表格，方便自行对账和存档</p>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button class="btn mini" @click="exportMyData('bills')">排谷/肾表记录</button>
              <button class="btn mini" @click="exportMyData('buys')">直售/拍卖购买记录</button>
              <button class="btn mini" @click="exportMyData('clears')">清货排发记录</button>
              <button class="btn mini" @click="exportMyData('flows')">余额流水</button>
            </div>
          </div>
        </template>

        <!-- 底部操作 -->
        <div class="row" style="gap:8px;margin:16px 12px;padding-bottom:20px">
          <button class="btn gray" style="flex:1" @click="logout">退出登录</button>
          <button class="btn gray" style="color:#F5222D;flex:1" @click="deactivateAccount">注销账号</button>
        </div>
      </template>
    </div>
    <div class="tabbar">
      <button v-for="t in tabs" :key="t.k" :class="{ on: tab === t.k }" @click="go(t.k)">
        <span>{{ t.i }}</span>{{ t.n }}
      </button>
    </div>

  <div class="modal-mask" v-if="blindShipModal.show" @click.self="blindShipModal.show = false">
    <div class="modal-card" style="max-width:420px">
      <h3 style="margin:0 0 12px">🎲 盲抽发货模式</h3>
      <p class="muted" style="font-size:13px;margin-bottom:12px">此商品为盲抽类型，请选择你希望的发货方式：</p>
      <div class="row" style="gap:8px;margin-bottom:12px;flex-direction:column">
        <button :style="{ flex:1, padding: '14px 12px', borderRadius: 'var(--r-md)', fontSize: '14px', fontWeight: '500', border: blindShipModal.mode === 'video' ? '2px solid var(--brand)' : '2px solid var(--line2)', background: blindShipModal.mode === 'video' ? 'var(--brand-bg)' : '#fff', color: blindShipModal.mode === 'video' ? 'var(--brand)' : 'var(--t2)' }" @click="blindShipModal.mode = 'video'">
          <div style="font-size:18px;margin-bottom:4px">📹</div>
          <div>需要视频选择且拆开</div>
          <div style="font-size:12px;font-weight:400;margin-top:2px;opacity:.7">发货慢，可看到抽到了什么</div>
        </button>
        <button :style="{ flex:1, padding: '14px 12px', borderRadius: 'var(--r-md)', fontSize: '14px', fontWeight: '500', border: blindShipModal.mode === 'random' ? '2px solid var(--brand)' : '2px solid var(--line2)', background: blindShipModal.mode === 'random' ? 'var(--brand-bg)' : '#fff', color: blindShipModal.mode === 'random' ? 'var(--brand)' : 'var(--t2)' }" @click="blindShipModal.mode = 'random'">
          <div style="font-size:18px;margin-bottom:4px">🎲</div>
          <div>直接随机发货不拆开</div>
          <div style="font-size:12px;font-weight:400;margin-top:2px;opacity:.7">快，到手才知道</div>
        </button>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn gray" style="flex:1" @click="blindShipModal.show = false">✕ 取消</button>
        <button class="btn" style="flex:1" :disabled="!blindShipModal.mode" @click="confirmBlindShip">确认</button>
      </div>
    </div>
  </div>

    <!-- 通用付款面板 -->
    <div class="modal-mask" v-if="payPanelData.show" @click.self="payPanelData.show = false">
      <div class="modal-card pay-panel">
        <h3 style="margin:0 0 12px">💳 付款（¥{{ payPanelData.total }}）</h3>
        <div class="pay-amount-box">
          <div class="pay-row"><span>应付总额</span><b>¥{{ payPanelData.total.toFixed(2) }}</b></div>
          <div class="pay-row"><span>当前余额</span><span>¥{{ store.user.balance.toFixed(2) }}</span></div>
        </div>
        <div class="pay-deduct-box">
          <div class="pay-row">
            <span>余额抵扣</span>
            <div class="deduct-input-group">
              <button class="qty-btn" @click="payPanelData.useBalanceAmount = 0">不抵扣</button>
              <input class="deduct-input" v-model.number="payPanelData.useBalanceAmount" type="number" />
              <button class="qty-btn" @click="payPanelData.useBalanceAmount = Math.min(store.user.balance, payPanelData.total)">全部抵扣</button>
            </div>
          </div>
        </div>
        <div v-if="payPanelNeedScan" class="pay-scan-box">
          <div class="pay-row"><span>需扫码支付</span><b class="price">¥{{ payScanAmount.toFixed(2) }}</b></div>
          <div class="qr-placeholder" v-if="shopCfg.payCodeAli || shopCfg.payCodeWx">
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <div v-if="shopCfg.payCodeAli" style="text-align:center">
                <img :src="shopCfg.payCodeAli" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">支付宝</p>
              </div>
              <div v-if="shopCfg.payCodeWx" style="text-align:center">
                <img :src="shopCfg.payCodeWx" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">微信</p>
              </div>
            </div>
            <p class="muted" style="font-size:12px;text-align:center;margin-top:6px">扫码转账给店主后上传截图</p>
          </div>
          <div class="qr-placeholder" v-else>
            <div class="qr-icon">📷</div>
            <p class="muted">店主暂未配置收款码<br>请直接转账后上传截图</p>
          </div>
          <div class="screenshot-upload">
            <button class="btn mini" @click="pickPayScreenshot">📷 上传付款截图</button>
            <div v-if="payPanelData.screenshot" class="screenshot-preview">
              <img :src="payPanelData.screenshot" style="width:60px;height:60px;border-radius:6px" />
              <span class="tag green">已上传</span>
            </div>
          </div>
        </div>
        <div v-else class="pay-ok-box">
          <p>✅ 余额足额抵扣，无需扫码</p>
        </div>
        <button class="btn" style="width:100%;margin-top:12px" @click="confirmPay" :disabled="payPanelNeedScan && !payPanelData.screenshot">
          {{ payPanelNeedScan ? '请上传付款截图' : '确认付款' }}
        </button>
      </div>
    </div>

    <!-- 购物车面板 -->
    <div class="modal-mask" v-if="showCart" @click.self="showCart = false">
      <div class="modal-card">
        <div class="row between" style="margin-bottom:12px">
          <h3 style="margin:0">🛒 购物车</h3>
          <div class="row" style="gap:8px">
            <label class="row" style="gap:4px;font-size:12px;cursor:pointer">
              <input type="checkbox" :checked="allCartSelected" @change="toggleSelectAllCart" /> 全选
            </label>
            <button class="btn mini gray" style="color:#F5222D" @click="clearCart">🗑 清空</button>
            <button class="btn mini gray" style="font-size:16px" @click="showCart = false">✕</button>
          </div>
        </div>
        <div v-if="!saleCart.length" class="card muted" style="color:#999;text-align:center">购物车空空如也</div>
        <div v-for="g in saleCart" :key="g.id" class="card row between" :class="{ 'stock-risk': g.qty > g.stock }">
          <div style="flex:1">
            <div class="gname" style="font-size:13px">{{ g.name }}</div>
            <div class="muted">¥{{ g.price }} · 库存{{ g.stock }}</div>
            <div v-if="g.qty > g.stock" class="muted text-red" style="font-size:11px">⚠ 库存不足，请调整数量</div>
            <div class="qty-stepper" style="margin-top:4px">
              <button @click="changeCartQty(g.id, -1)">−</button>
              <span>{{ g.qty }}</span>
              <button @click="changeCartQty(g.id, 1)">＋</button>
            </div>
          </div>
          <div class="row" style="gap:8px">
            <input type="checkbox" :value="g.id" v-model="saleCartSelected" />
            <button class="btn mini gray" @click="removeFromCart(g.id)">✕ 取消</button>
          </div>
        </div>
        <div v-if="saleCart.length" style="margin-top:12px">
          <div v-if="blindShipMode" class="row" style="margin-bottom:8px;gap:6px;font-size:12px">
            <span class="tag" :class="blindShipMode === 'video' ? 'pink' : 'green'">{{ blindShipMode === 'video' ? '📹 视频选择且拆开' : '🎲 随机发货不拆开' }}</span>
            <button class="btn mini gray" style="font-size:11px;padding:2px 8px" @click="blindShipModal = { show: true, mode: '', resolve: null }">修改</button>
          </div>
          <div class="row between" style="margin-bottom:8px">
            <b>合计（已选{{ saleCartSelected.length }}项）</b>
            <b class="price">¥{{ cartTotalPrice }}</b>
          </div>
          <button class="btn" style="width:100%" @click="checkoutCart" :disabled="!saleCartSelected.length">结算下单</button>
        </div>
      </div>
    </div>

    <!-- 出价面板 -->
    <div class="modal-mask" v-if="showBidPanel" @click.self="showBidPanel = false">
      <div class="modal-card">
        <h3 style="margin:0 0 12px">🔥 出价</h3>
        <div class="pay-amount-box">
          <div class="pay-row"><span>当前价</span><b>¥{{ curAuction ? curAuction.curPrice : 0 }}</b></div>
          <div class="pay-row"><span>最低加价</span><span>¥{{ curAuction ? curAuction.stepPrice : 0 }}</span></div>
          <div class="pay-row" v-if="curAuction && +curAuction.buyNow > 0"><span>一口价</span><span class="tag red">¥{{ curAuction.buyNow }}</span></div>
        </div>
        <input v-model.number="bidPrice" type="number" :placeholder="'出价金额（≥¥' + (curAuction ? (+curAuction.curPrice + +curAuction.stepPrice) : 0) + '）'" class="modal-input" />
        <div class="modal-actions">
          <button class="btn gray" @click="showBidPanel = false">✕ 取消</button>
          <button class="btn" @click="placeBid">确认出价</button>
        </div>
      </div>
    </div>

    <!-- 保证金面板 -->
    <div class="modal-mask" v-if="showDepositPanel" @click.self="showDepositPanel = false">
      <div class="modal-card pay-panel">
        <h3 style="margin:0 0 12px">💰 缴纳保证金</h3>
        <div class="pay-amount-box">
          <div class="pay-row"><span>保证金</span><b class="price">¥{{ curAuction ? curAuction.deposit : 0 }}</b></div>
          <div class="pay-row"><span>当前余额</span><span>¥{{ store.user.balance.toFixed(2) }}</span></div>
        </div>
        <div class="pay-deduct-box">
          <div class="pay-row">
            <span>余额抵扣</span>
            <div class="deduct-input-group">
              <button class="qty-btn" @click="depositUseBalance = 0">不抵扣</button>
              <input class="deduct-input" v-model.number="depositUseBalance" type="number" />
              <button class="qty-btn" @click="depositUseBalance = Math.min(store.user.balance, curAuction.deposit)">全部抵扣</button>
            </div>
          </div>
        </div>
        <div v-if="depositNeedScan" class="pay-scan-box">
          <div class="pay-row"><span>需扫码支付</span><b class="price">¥{{ depositScanAmount.toFixed(2) }}</b></div>
          <div class="qr-placeholder" v-if="shopCfg.payCodeAli || shopCfg.payCodeWx">
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <div v-if="shopCfg.payCodeAli" style="text-align:center">
                <img :src="shopCfg.payCodeAli" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">支付宝</p>
              </div>
              <div v-if="shopCfg.payCodeWx" style="text-align:center">
                <img :src="shopCfg.payCodeWx" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">微信</p>
              </div>
            </div>
            <p class="muted" style="font-size:12px;text-align:center;margin-top:6px">扫码转账给店主后上传截图</p>
          </div>
          <div class="qr-placeholder" v-else>
            <div class="qr-icon">📷</div>
            <p class="muted">店主暂未配置收款码<br>请直接转账后上传截图</p>
          </div>
          <div class="screenshot-upload">
            <button class="btn mini" @click="pickDepositScreenshot">📷 上传付款截图</button>
            <div v-if="depositScreenshot" class="screenshot-preview">
              <img :src="depositScreenshot" style="width:60px;height:60px;border-radius:6px" />
              <span class="tag green">已上传</span>
            </div>
          </div>
        </div>
        <div v-else class="pay-ok-box">
          <p>✅ 余额足额抵扣，无需扫码</p>
        </div>
        <button class="btn" style="width:100%;margin-top:12px" @click="submitDeposit" :disabled="depositNeedScan && !depositScreenshot">
          {{ depositNeedScan ? '请上传付款截图' : '确认缴纳' }}
        </button>
      </div>
    </div>

    <!-- 拍卖尾款付款面板 -->
    <div class="modal-mask" v-if="showAuctionPayPanel" @click.self="showAuctionPayPanel = false">
      <div class="modal-card pay-panel">
        <h3 style="margin:0 0 12px">🎉 中标付款</h3>
        <div class="pay-amount-box">
          <div class="pay-row"><span>中标价</span><b>¥{{ curAuction ? curAuction.curPrice : 0 }}</b></div>
          <div class="pay-row"><span>保证金抵扣</span><span>-¥{{ auctionDepositDeduct.toFixed(2) }}</span></div>
          <div class="pay-row"><span>需付尾款</span><b class="price">¥{{ auctionRestAmount.toFixed(2) }}</b></div>
          <div class="pay-row"><span>当前余额</span><span>¥{{ store.user.balance.toFixed(2) }}</span></div>
        </div>
        <div class="pay-deduct-box">
          <div class="pay-row">
            <span>余额抵扣尾款</span>
            <div class="deduct-input-group">
              <button class="qty-btn" @click="auctionPayUseBalance = 0">不抵扣</button>
              <input class="deduct-input" v-model.number="auctionPayUseBalance" type="number" />
              <button class="qty-btn" @click="auctionPayUseBalance = Math.min(store.user.balance, auctionRestAmount)">全部抵扣</button>
            </div>
          </div>
        </div>
        <div v-if="auctionPayNeedScan" class="pay-scan-box">
          <div class="pay-row"><span>需扫码支付</span><b class="price">¥{{ auctionPayScanAmount.toFixed(2) }}</b></div>
          <div class="qr-placeholder" v-if="shopCfg.payCodeAli || shopCfg.payCodeWx">
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <div v-if="shopCfg.payCodeAli" style="text-align:center">
                <img :src="shopCfg.payCodeAli" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">支付宝</p>
              </div>
              <div v-if="shopCfg.payCodeWx" style="text-align:center">
                <img :src="shopCfg.payCodeWx" style="max-width:140px;max-height:140px;border-radius:8px;border:1px solid var(--line2)" />
                <p class="muted" style="font-size:11px;margin-top:2px">微信</p>
              </div>
            </div>
            <p class="muted" style="font-size:12px;text-align:center;margin-top:6px">扫码转账给店主后上传截图</p>
          </div>
          <div class="qr-placeholder" v-else>
            <div class="qr-icon">📷</div>
            <p class="muted">店主暂未配置收款码<br>请直接转账后上传截图</p>
          </div>
          <div class="screenshot-upload">
            <button class="btn mini" @click="pickAuctionPayScreenshot">📷 上传付款截图</button>
            <div v-if="auctionPayScreenshot" class="screenshot-preview">
              <img :src="auctionPayScreenshot" style="width:60px;height:60px;border-radius:6px" />
              <span class="tag green">已上传</span>
            </div>
          </div>
        </div>
        <div v-else class="pay-ok-box">
          <p>✅ 余额足额抵扣尾款，无需扫码</p>
        </div>
        <button class="btn" style="width:100%;margin-top:12px" @click="submitAuctionPay" :disabled="auctionPayNeedScan && !auctionPayScreenshot">
          {{ auctionPayNeedScan ? '请上传付款截图' : '确认付款' }}
        </button>
      </div>
    </div>


    <!-- 截图预览模态 -->
    <div v-if="showScreenshotModal" class="screenshot-modal" @click.self="showScreenshotModal = false">
      <img :src="screenshotUrl" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { store, setAuth, logout, api } from './main.js';
import { pickAndUploadImage, parseCSV, toCSV, downloadCSV, pickCSVFile } from './ui.js';
import Timeline from './components/Timeline.vue';
import StockWorkspace from './components/StockWorkspace.vue';
import AdminTimelineNode from './components/AdminTimelineNode.vue';
import AdminAlertCard from './components/AdminAlertCard.vue';
import CustomerProfileDrawer from './components/CustomerProfileDrawer.vue';
import GroupSeriesCard from './components/GroupSeriesCard.vue';
import GroupWorkspace from './components/GroupWorkspace.vue';
import { buildAdminTodos, buildAlerts } from './utils/admin-timeline.ts';
import { buildCustomerProfile } from './utils/customer-profile.ts';
import { buildSeriesCards, buildGroupWorkspace, buildUnpaidReminders, buildGroupMatrixCSV, buildMemberSummaryCSV } from './utils/group-workspace.ts';

const lg = reactive({ account: '', password: '' });
const reg = reactive({ account: '', password: '', cn: '', qq: '', wechat: '' });
const showReg = ref(false);
const err = ref('');

async function initAfterAuth() {
  // 根据角色和视图模式加载对应数据，替代 location.reload()
  if (store.user.role !== 'member' && store.viewMode !== 'member') {
    adminTab.value = '数据看板';
    await loadAdmin().catch(e => console.error(e));
  } else {
    store.viewMode = 'member';
    tab.value = 'home';
    curSeries.value = null;
    groupSubTab.value = 'mine';
    showStockWorkspace.value = false;
    await loadSeries(); await loadSale(); await loadAuctions(); await loadMe();
    await loadShopCfg();
  }
}

async function login() {
  err.value = '';
  try {
    const r = await api('POST', '/auth/login', { ...lg });
    if (r.error) return (err.value = r.error);
    setAuth(r.token, r.user);
    await initAfterAuth();
  } catch (e) { err.value = e.message; }
}
async function register() {
  err.value = '';
  try {
    const r = await api('POST', '/auth/register', { ...reg });
    if (r.error) return (err.value = r.error);
    setAuth(r.token, r.user);
    await initAfterAuth();
  } catch (e) { err.value = e.message; }
}

/* ===== C 端 ===== */
const tabs = [
  { k: 'home', i: '🏠', n: '首页' }, { k: 'group', i: '🧩', n: '拼团' },
  { k: 'sale', i: '🛒', n: '直售' }, { k: 'auction', i: '🔨', n: '拍卖' },
  { k: 'me', i: '👤', n: '我的' },
];
const tab = ref('home');
const groupSubTab = ref('mine'); // 'all' | 'mine' — 修正#1：拼团tab默认「我的拼团」
const activeSeriesList = computed(() => seriesList.value.filter(s => s.status === '进行中'));
const closedSeriesCount = computed(() => seriesList.value.filter(s => s.status !== '进行中').length);
/* ===== StockWorkspace 清货工作台 ===== */
const showStockWorkspace = ref(false);
const swPreselectedId = ref(null);
const swStockItems = ref([]);
const seriesList = ref([]);
const curSeriesId = ref(0);
const curSeries = ref(null);
const curGoods = ref([]);
const curCat = ref('全部');
const cart = reactive({});
const saleQ = ref('');
const saleGoods = ref([]);
const auctions = ref([]);
const myBills = ref([]);
const myGroupOrders = ref([]);
const notis = ref([]);

const cats = computed(() => ['全部', ...new Set(curGoods.value.map(g => g.cat))]);
const filteredGoods = computed(() => curGoods.value.filter(g => curCat.value === '全部' || g.cat === curCat.value));
const cartCount = computed(() => Object.values(cart).reduce((a, b) => a + b, 0));
const cartTotal = computed(() => curGoods.value.reduce((a, g) => a + (cart[g.id] || 0) * +g.price, 0).toFixed(2));

async function loadSeries() { seriesList.value = await api('GET', '/group/series'); }
async function openSeries(id) {
  curSeriesId.value = id;
  const r = await api('GET', '/group/series/' + id);
  curSeries.value = r.series; curGoods.value = r.goods; curCat.value = '全部';
  Object.keys(cart).forEach(k => delete cart[k]);
  tab.value = 'group';
}
function backToSeriesList() { curSeries.value = null; curGoods.value = []; Object.keys(cart).forEach(k => delete cart[k]); }
function chg(gid, d) { cart[gid] = Math.max(0, (cart[gid] || 0) + d); if (!cart[gid]) delete cart[gid]; }
async function submitFollow() {
  const items = Object.entries(cart).map(([goodId, qty]) => ({ goodId: +goodId, qty }));
  if (!items.length) return alert('请先选择谷子');
  try {
    await api('POST', '/group/follow', { seriesId: curSeries.value.id, items });
    alert('跟排成功！截团后统一收款（肾表生成后通知）');
    Object.keys(cart).forEach(k => delete cart[k]);
    loadSeries();
  } catch (e) { alert(e.message); }
}
async function loadSale() { saleGoods.value = await api('GET', '/sale/list'); }
async function loadAuctions() { auctions.value = await api('GET', '/auction/list'); }

/* ===== 直售详情+购物车 ===== */
const curSaleGood = ref(null);
const saleQty = ref(1);
const saleCatFilter = ref('全部');
const saleCats = computed(() => ['中古', '盲抽', '全新未拆单领'].filter(c => saleGoods.value.some(g => g.cat === c)));
const filteredSaleGoods = computed(() => {
  let list = saleGoods.value;
  if (saleCatFilter.value !== '全部') list = list.filter(g => g.cat === saleCatFilter.value);
  if (saleQ.value) list = list.filter(g => (g.name + g.ip + (g.ownerCn || '')).toLowerCase().includes(saleQ.value.toLowerCase()));
  return list;
});
function openSaleDetail(g) { curSaleGood.value = g; saleQty.value = 1; }

const saleCart = ref(JSON.parse(localStorage.getItem('wm_saleCart') || '[]'));
const saleCartSelected = ref(JSON.parse(localStorage.getItem('wm_saleCartSelected') || '[]'));
const showCart = ref(false);
const blindShipMode = ref(localStorage.getItem('wm_blindShipMode') || '');
const blindShipModal = ref({ show: false, mode: '', resolve: null });
const saleCartCount = computed(() => saleCart.value.reduce((a, g) => a + g.qty, 0));
const allCartSelected = computed(() => saleCart.value.length > 0 && saleCart.value.every(g => saleCartSelected.value.includes(g.id)));
const cartTotalPrice = computed(() => saleCart.value.filter(g => saleCartSelected.value.includes(g.id)).reduce((a, g) => a + g.qty * +g.price, 0));

function saveCart() { localStorage.setItem('wm_saleCart', JSON.stringify(saleCart.value)); localStorage.setItem('wm_saleCartSelected', JSON.stringify(saleCartSelected.value)); }
async function checkBlindShip(g) {
  if (g.cat !== '盲抽') return true;
  if (blindShipMode.value) return true;
  return new Promise(resolve => {
    blindShipModal.value = { show: true, mode: '', resolve };
  });
}
function confirmBlindShip() {
  if (!blindShipModal.value.mode) return;
  blindShipMode.value = blindShipModal.value.mode;
  localStorage.setItem('wm_blindShipMode', blindShipMode.value);
  const resolve = blindShipModal.value.resolve;
  blindShipModal.value = { show: false, mode: '', resolve: null };
  if (resolve) resolve(true);
}
async function addToCart(g, qty) {
  const ok = await checkBlindShip(g);
  if (!ok) return;
  const existing = saleCart.value.find(c => c.id === g.id);
  if (existing) { existing.qty = Math.min(g.stock, existing.qty + qty); }
  else { saleCart.value.push({ id: g.id, name: g.name, price: g.price, stock: g.stock, qty }); saleCartSelected.value.push(g.id); }
  saveCart();
  alert('已加入购物车');
}
async function buyNow(g, qty) {
  const ok = await checkBlindShip(g);
  if (!ok) return;
  addToCart(g, qty);
  showCart.value = true;
}
function changeCartQty(id, delta) {
  const item = saleCart.value.find(c => c.id === id);
  if (item) { item.qty = Math.max(1, item.qty + delta); if (item.qty > item.stock) item.qty = item.stock; saveCart(); }
}
function removeFromCart(id) {
  saleCart.value = saleCart.value.filter(c => c.id !== id);
  saleCartSelected.value = saleCartSelected.value.filter(sid => sid !== id);
  saveCart();
}
function clearCart() { saleCart.value = []; saleCartSelected.value = []; saveCart(); }
function toggleSelectAllCart() {
  if (allCartSelected.value) { saleCartSelected.value = []; }
  else { saleCartSelected.value = saleCart.value.map(g => g.id); }
  saveCart();
}
async function checkoutCart() {
  const items = saleCart.value.filter(g => saleCartSelected.value.includes(g.id)).map(g => ({ goodId: g.id, qty: g.qty }));
  if (!items.length) return alert('请先勾选要结算的商品');
  try {
    await api('POST', '/sale/batch-buy', { items, blindShipMode: blindShipMode.value });
    alert('下单成功，待付款（店主收款码+截图）');
    saleCart.value = saleCart.value.filter(g => !saleCartSelected.value.includes(g.id));
    saleCartSelected.value = [];
    saveCart();
    await loadMe();
    await loadBuys();
    showCart.value = false;
  } catch (e) { alert(e.message); }
}

/* ===== 拍卖详情 ===== */
const curAuction = ref(null);
const auctionBids = ref([]);
const myDepositState = ref('');
const showBidPanel = ref(false);
const bidPrice = ref(0);
const showDepositPanel = ref(false);
const depositUseBalance = ref(0);
const depositScreenshot = ref('');

const depositNeedScan = computed(() => {
  if (!curAuction.value) return false;
  return depositUseBalance.value < curAuction.value.deposit;
});
const depositScanAmount = computed(() => {
  if (!curAuction.value) return 0;
  return Math.max(0, curAuction.value.deposit - depositUseBalance.value);
});

async function openAuctionDetail(a) {
  try {
    const r = await api('GET', '/auction/detail/' + a.id);
    curAuction.value = r.auction;
    auctionBids.value = r.bids;
    myDepositState.value = r.myDepositState;
    tab.value = 'auction';
    // 详情页可能也有待付款倒计时
    startAuctionTimer();
  } catch (e) { alert(e.message); }
}
async function placeBid() {
  if (!curAuction.value) return;
  const min = (+curAuction.value.curPrice > 0 ? +curAuction.value.curPrice : +curAuction.value.startPrice) + +curAuction.value.stepPrice;
  if (bidPrice.value < min) return alert('出价需≥¥' + min.toFixed(2));
  try {
    const r = await api('POST', '/auction/bid', { auctionId: curAuction.value.id, price: bidPrice.value });
    alert(r.won ? '一口价中标！请在24小时内付款' : (r.extended ? '出价成功（最后5分钟，自动延长3分钟）' : '出价成功'));
    showBidPanel.value = false; bidPrice.value = 0;
    await openAuctionDetail(curAuction.value);
  } catch (e) { alert(e.message); }
}
async function pickDepositScreenshot() {
  try { depositScreenshot.value = await pickAndUploadImage(); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function submitDeposit() {
  if (!curAuction.value) return;
  try {
    const r = await api('POST', '/auction/deposit', {
      auctionId: curAuction.value.id,
      useBalanceAmount: depositUseBalance.value,
      screenshot: depositScreenshot.value || ''
    });
    if (r.state === '已缴') alert('保证金已缴纳（余额抵扣），可出价');
    else alert('保证金截图已提交，等待团长审核');
    showDepositPanel.value = false;
    depositUseBalance.value = 0; depositScreenshot.value = '';
    await openAuctionDetail(curAuction.value);
  } catch (e) { alert(e.message); }
}

/* ===== 拍卖中标付款 ===== */
const showAuctionPayPanel = ref(false);
const auctionPayUseBalance = ref(0);
const auctionPayScreenshot = ref('');

const auctionDepositDeduct = computed(() => {
  if (!curAuction.value) return 0;
  // 保证金金额 = auction.deposit（中标者已缴）
  return +curAuction.value.deposit || 0;
});
const auctionRestAmount = computed(() => {
  if (!curAuction.value) return 0;
  return Math.max(0, +curAuction.value.curPrice - auctionDepositDeduct.value);
});
const auctionPayNeedScan = computed(() => {
  return auctionPayUseBalance.value < auctionRestAmount.value;
});
const auctionPayScanAmount = computed(() => {
  return Math.max(0, auctionRestAmount.value - auctionPayUseBalance.value);
});

function openAuctionPayPanel() {
  auctionPayUseBalance.value = Math.min(store.user.balance, auctionRestAmount.value);
  auctionPayScreenshot.value = '';
  showAuctionPayPanel.value = true;
}
async function pickAuctionPayScreenshot() {
  try { auctionPayScreenshot.value = await pickAndUploadImage(); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function submitAuctionPay() {
  if (!curAuction.value) return;
  if (auctionPayNeedScan.value && !auctionPayScreenshot.value) return;
  try {
    const r = await api('POST', '/auction/pay', {
      auctionId: curAuction.value.id,
      screenshot: auctionPayScreenshot.value || '',
      useBalanceAmount: auctionPayUseBalance.value,
    });
    alert('拍卖付款完成！');
    showAuctionPayPanel.value = false;
    auctionPayUseBalance.value = 0;
    auctionPayScreenshot.value = '';
    await openAuctionDetail(curAuction.value);
    await loadMe().catch(() => {});
  } catch (e) { alert(e.message); }
}
const meSubTab = ref('');
const ordersSubTab = ref('all'); // 'all' | 'group' | 'sale' | 'auction'
const transferSubTab = ref('sent'); // 'sent' | 'received'
const walletSubTab = ref('list'); // 'list' | 'withdraw'
const transferForm = ref({ show: false, seriesId: 0, goodId: 0, seq: 0, orderId: 0, itemId: 0, name: '', toCn: '', way: 'owner', options: [], selected: new Set(), expandedGroups: new Set() });
/* 快速转单弹窗（直接在订单页弹窗，不跳转） */
const quickTransfer = ref({ show: false, order: null, selected: new Set(), toCn: '', way: 'owner', options: [] });
const myBuys = ref([]);
const myAuctionOrders = ref([]);
const myClears = ref([]);
const myTransfers = ref([]);
const myAfters = ref([]);

/* ===== 拍卖中标付款倒计时 ===== */
/** 付款期限 24 小时（与后端 PAY_DEADLINE_MS 一致） */
const PAY_DEADLINE_MS = 24 * 60 * 60 * 1000;
/** 倒计时文本 map：key = auctionId，value = 'HH:MM:SS' 或 '已超时，等待系统处理' */
const auctionCountdown = ref({});
let _auctionTimer = null;

/** 计算单条拍卖订单的倒计时文本 */
function _calcCountdown(a) {
  if (a.state !== '待付款' || !a.isWinner) return null;
  const wonAt = +a.wonAt || 0;
  if (!wonAt) return null;
  const remain = wonAt + PAY_DEADLINE_MS - Date.now();
  if (remain <= 0) return '已超时，等待系统处理';
  const h = Math.floor(remain / 3600000);
  const m = Math.floor((remain % 3600000) / 60000);
  const s = Math.floor((remain % 60000) / 1000);
  return `剩余 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 每秒更新所有待付款拍卖订单的倒计时 */
function updateAuctionCountdown() {
  const map = {};
  for (const a of myAuctionOrders.value) {
    const text = _calcCountdown(a);
    if (text) map[a.id] = text;
  }
  if (curAuction.value && curAuction.value.state === '待付款' && curAuction.value.winnerId === store.user?.id) {
    const text = _calcCountdown({ ...curAuction.value, isWinner: true });
    if (text) map['detail-' + curAuction.value.id] = text;
  }
  auctionCountdown.value = map;
}

function startAuctionTimer() {
  stopAuctionTimer();
  updateAuctionCountdown();
  _auctionTimer = setInterval(updateAuctionCountdown, 1000);
}
function stopAuctionTimer() {
  if (_auctionTimer) { clearInterval(_auctionTimer); _auctionTimer = null; }
}

/* ===== 拼团截团倒计时 ===== */
const seriesCountdown = ref({});
function updateSeriesCountdown() {
  const map = {};
  const now = Date.now();
  for (const s of seriesList.value) {
    if (s.status !== '进行中' || !s.deadlineAt) continue;
    const ts = new Date(s.deadlineAt).getTime();
    const remain = Math.floor((ts - now) / 1000);
    if (remain <= 0) { map[s.id] = '⏰ 即将截团'; continue; }
    const days = Math.floor(remain / 86400);
    const hours = Math.floor((remain % 86400) / 3600);
    if (days > 0) {
      map[s.id] = `⏰ ${days}天${hours}小时后截团`;
    } else {
      const minutes = Math.floor((remain % 3600) / 60);
      map[s.id] = `⏰ ${hours}时${minutes}分后截团`;
    }
  }
  seriesCountdown.value = map;
}
let _seriesTimer = null;
function startSeriesTimer() {
  stopSeriesTimer();
  updateSeriesCountdown();
  _seriesTimer = setInterval(updateSeriesCountdown, 60_000);
}
function stopSeriesTimer() {
  if (_seriesTimer) { clearInterval(_seriesTimer); _seriesTimer = null; }
}
const mySecondBills = ref([]);
const flows = ref([]);
const shopCfg = ref({ freights: '[]', packs: '[]', unitFees: '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]', groupFreeDays: 30, groupOverDays: 90, saleFreeDays: 7, saleOverDays: 30 });
const clearOrderIds = ref([]);
const clearFreight = ref('');
const clearPack = ref('');
const af = reactive({ orderId: '', type: '漏发', way: '退货', goods: '', video: '' });
const wd = reactive({ amount: 0, method: '' });
const myAddresses = ref([]);
const clearAddressId = ref(0);
const addrForm = reactive({ show: false, id: 0, recipientName: '', phone: '', region: '', detail: '', isDefault: false, pasteText: '' });
const pwdForm = reactive({ old: '', new: '', confirm: '' });
const contactForm = reactive({ qq: '', wechat: '' });
const cnList = ref([]);

const freightOpts = computed(() => { try { return JSON.parse(shopCfg.value.freights).filter(f => f.on); } catch { return []; } });
const packOpts = computed(() => { try { return JSON.parse(shopCfg.value.packs).filter(p => p.on); } catch { return []; } });
const unitFeeOpts = computed(() => { try { return JSON.parse(shopCfg.value.unitFees || '[]'); } catch { return []; } });
const stockOrders = computed(() => myBuys.value.filter(o => o.status === '囤货中'));
const stockGroupOrders = computed(() => stockOrders.value.filter(o => o.seriesId && +o.seriesId !== 0));
const stockOtherOrders = computed(() => {
  const buys = stockOrders.value.filter(o => !o.seriesId || +o.seriesId === 0);
  const auctions = myAuctionOrders.value.filter(a => a.state === '囤货中').map(a => ({
    id: a.id,
    seriesId: 0,
    status: '囤货中',
    items: [{ name: a.name, qty: 1 }],
    total: a.curPrice,
    stockSince: a.stockSince,
    createdAt: a.createdAt,
    isAuction: true,
  }));
  return [...buys, ...auctions];
});
/** 合并后的全部囤货列表（拼团 + 直售 + 拍卖），用于统一展示 */
const allStockOrders = computed(() => [...stockGroupOrders.value, ...stockOtherOrders.value]);
const stockSaleOrders = computed(() => stockOtherOrders.value.filter(o => !o.isAuction));
const stockAuctionOrders = computed(() => stockOtherOrders.value.filter(o => o.isAuction));
const stockExpandedGroups = ref(new Set());
const stockExpandedDetail = ref(new Set());

const totalOverFee = computed(() => {
  let fee = 0;
  for (const id of clearOrderIds.value) {
    const o = allStockOrders.value.find(x => x.id == id);
    if (o) fee += calcOverFee(o);
  }
  return fee;
});
/** 已选囤货的预估清货总价 */
const clearEstTotal = computed(() => {
  const f = freightOpts.value.find(x => x.name === clearFreight.value);
  const p = packOpts.value.find(x => x.name === clearPack.value);
  return (f?.amt || 0) + (p?.amt || 0) + totalOverFee.value;
});
const allOrders = computed(() => {
  const group = myBills.value.map(b => ({ type: 'group', raw: b, orderId: b.id, title: b.seriesName, state: b.state, items: b.items, total: b.total, time: b.createdAt || b.time || 0 }));
  const sale = myBuys.value.map(o => ({ type: 'sale', raw: o, orderId: o.id, title: '', state: o.status, items: o.items, total: o.total, time: o.createdAt || o.time || 0, hours: o.hours }));
  const auction = myAuctionOrders.value.map(a => ({ type: 'auction', raw: a, orderId: a.id, title: a.name, state: a.state, items: [{ name: a.name, qty: 1 }], total: a.curPrice, time: a.startTime || 0, hours: 0, isWinner: a.isWinner }));
  return [...group, ...sale, ...auction].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
});
const activeGroupOrders = computed(() => myGroupOrders.value.filter(o => o.status === '跟排中'));
const stockCount = computed(() => stockOrders.value.length);
const sentTransfers = computed(() => myTransfers.value.filter(t => t.isFrom));
const receivedTransfers = computed(() => myTransfers.value.filter(t => !t.isFrom));
const unreadCount = computed(() => notis.value.filter(n => !n.read).length);
const pendingBillCount = computed(() => myBills.value.filter(b => b.state === '待付款').length);
const myBillsForAfter = computed(() => myBills.value.filter(b => b.state === '已销账'));
const pendingBuyCount = computed(() => myBuys.value.filter(o => o.status === '待付款').length);
const pendingCancelCount = computed(() => myBuys.value.filter(o => o.status === '申请取消').length);

function toggleSelectGroupOrders() {
  const ids = stockGroupOrders.value.map(o => o.id);
  const allSelected = ids.every(id => clearOrderIds.value.includes(id));
  if (allSelected) { clearOrderIds.value = clearOrderIds.value.filter(id => !ids.includes(id)); }
  else { clearOrderIds.value = [...new Set([...clearOrderIds.value, ...ids])]; }
}
function toggleSelectSaleOrders() {
  const ids = stockSaleOrders.value.map(o => o.id);
  const allSelected = ids.every(id => clearOrderIds.value.includes(id));
  if (allSelected) { clearOrderIds.value = clearOrderIds.value.filter(id => !ids.includes(id)); }
  else { clearOrderIds.value = [...new Set([...clearOrderIds.value, ...ids])]; }
}
function toggleSelectAuctionOrders() {
  const ids = stockAuctionOrders.value.map(o => o.id);
  const allSelected = ids.every(id => clearOrderIds.value.includes(id));
  if (allSelected) { clearOrderIds.value = clearOrderIds.value.filter(id => !ids.includes(id)); }
  else { clearOrderIds.value = [...new Set([...clearOrderIds.value, ...ids])]; }
}
function toggleStockGroup(name) {
  if (stockExpandedGroups.value.has(name)) stockExpandedGroups.value.delete(name);
  else stockExpandedGroups.value.add(name);
  stockExpandedGroups.value = new Set(stockExpandedGroups.value);
}
function toggleStockDetail(id) {
  if (stockExpandedDetail.value.has(id)) stockExpandedDetail.value.delete(id);
  else stockExpandedDetail.value.add(id);
  stockExpandedDetail.value = new Set(stockExpandedDetail.value);
}
function totalQty(o) {
  return (o.items || []).reduce((s, it) => s + (it.qty || 1), 0);
}
function compactItems(items) {
  if (!items || !items.length) return '';
  // 合并同名商品数量
  const map = new Map();
  for (const it of items) {
    const name = it.name || '商品';
    map.set(name, (map.get(name) || 0) + (it.qty || 1));
  }
  return [...map.entries()].map(([name, qty]) => name + (qty > 1 ? '×' + qty : '')).join('、');
}
function stockDaysInfo(o) {
  const days = getStockDays(o);
  const freeLeft = freeDaysLeft(o);
  const over = overDays(o);
  if (over > 0) {
    return `入囤 ${days} 天 · 超期 ${over} 天 · 仓费 ¥${calcOverFee(o).toFixed(2)}`;
  }
  if (freeLeft <= 7) {
    return `入囤 ${days} 天 · 免费剩余 ${freeLeft} 天 ⚠`;
  }
  return `入囤 ${days} 天`;
}

function backMeSub() { meSubTab.value = ''; }

async function goMe(k) {
  meSubTab.value = k;
  if (k === 'wallet') { walletSubTab.value = 'list'; }
  if (k === 'stock') {
    await loadBuys();
    shopCfg.value = await api('GET', '/shop/config');
    myClears.value = await api('GET', '/clearing/mine').catch(() => []);
    if (!clearFreight.value && freightOpts.value[0]) clearFreight.value = freightOpts.value[0].name;
    if (!clearPack.value && packOpts.value[0]) clearPack.value = packOpts.value[0].name;
    myAddresses.value = await api('GET', '/address/list').catch(() => []);
    if (!clearAddressId.value) {
      const def = myAddresses.value.find(a => a.isDefault);
      if (def) clearAddressId.value = def.id;
    }
  }
  if (k === 'transfer') { await loadBuys(); myTransfers.value = await api('GET', '/transfer/mine').catch(() => []); }
  if (k === 'after') myAfters.value = await api('GET', '/aftersale/mine').catch(() => []);
  if (k === 'wallet') flows.value = await api('GET', '/balance/flows').catch(() => []);
  if (k === 'second') mySecondBills.value = await api('GET', '/second/mine').catch(() => []);
  if (k === 'notis') { notis.value = await api('GET', '/notify/list').catch(() => []); }
  if (k === 'addr') {
    myAddresses.value = await api('GET', '/address/list').catch(() => []);
    // 如果有清货需要选地址，自动选默认
    if (!clearAddressId.value) {
      const def = myAddresses.value.find(a => a.isDefault);
      if (def) clearAddressId.value = def.id;
    }
    addrForm.show = false;
  }
  if (k === 'settings') {
    contactForm.qq = store.user.qq || '';
    contactForm.wechat = store.user.wechat || '';
    pwdForm.old = ''; pwdForm.new = ''; pwdForm.confirm = '';
  }
}
async function loadBuys() { myBuys.value = await api('GET', '/sale/my-buys').catch(() => []); }

/* ===== 收货地址管理 ===== */
function startEditAddr(a) {
  if (a) {
    addrForm.id = a.id;
    addrForm.recipientName = a.recipientName;
    addrForm.phone = a.phone;
    addrForm.region = a.region;
    addrForm.detail = a.detail;
    addrForm.isDefault = a.isDefault;
  } else {
    addrForm.id = 0;
    addrForm.recipientName = '';
    addrForm.phone = '';
    addrForm.region = '';
    addrForm.detail = '';
    addrForm.isDefault = myAddresses.value.length === 0;
  }
  addrForm.pasteText = '';
  addrForm.show = true;
}

function parsePastedAddr() {
  const text = addrForm.pasteText.trim();
  if (!text) return alert('请先粘贴地址文本');
  // 提取手机号
  const phoneMatch = text.match(/1[3-9]\d{9}/);
  if (phoneMatch) addrForm.phone = phoneMatch[0];
  // 提取省市区（支持省市区县）
  const regionMatch = text.match(/([^，,\s]*?(?:省|自治区|特别行政区))\s*([^，,\s]*?(?:市|自治州|地区|盟))\s*([^，,\s]*?(?:区|县|市|旗|自治县|自治旗))?/);
  if (regionMatch) {
    let region = regionMatch[1] + regionMatch[2];
    if (regionMatch[3]) region += regionMatch[3];
    addrForm.region = region;
    // 详细地址 = 去掉手机号和省市区后剩下的
    let detail = text.replace(phoneMatch?.[0] || '', '').trim();
    detail = detail.replace(regionMatch[0], '').trim();
    // 去掉姓名后剩下的就是详细地址
    // 收件人姓名：尝试从开头提取（手机号之前的部分）
    if (phoneMatch) {
      const beforePhone = text.substring(0, text.indexOf(phoneMatch[0])).trim();
      const nameMatch = beforePhone.match(/^([\u4e00-\u9fa5]{2,5})\s/);
      if (nameMatch) {
        addrForm.recipientName = nameMatch[1].trim();
        detail = detail.replace(nameMatch[0], '').trim();
      } else if (beforePhone && beforePhone.length <= 5 && /^[\u4e00-\u9fa5]+$/.test(beforePhone)) {
        addrForm.recipientName = beforePhone;
        detail = detail.replace(beforePhone, '').trim();
      }
    }
    addrForm.detail = detail;
  } else {
    // 无省市区匹配，尝试拆分姓名和地址
    if (phoneMatch) {
      const beforePhone = text.substring(0, text.indexOf(phoneMatch[0])).trim();
      if (beforePhone && beforePhone.length <= 5 && /^[\u4e00-\u9fa5]+$/.test(beforePhone)) {
        addrForm.recipientName = beforePhone;
      }
    }
  }
  // 如果还没提取到姓名，尝试从手机号后面找
  if (phoneMatch && !addrForm.recipientName) {
    const afterPhone = text.substring(text.indexOf(phoneMatch[0]) + phoneMatch[0].length).trim();
    const nameMatch = afterPhone.match(/^([\u4e00-\u9fa5]{2,5})\s/);
    if (nameMatch) {
      addrForm.recipientName = nameMatch[1].trim();
    }
  }
  addrForm.pasteText = '';
  alert('已智能识别并填充，请核对各字段');
}

async function saveAddr() {
  if (!addrForm.recipientName.trim()) return alert('请填写收件人姓名');
  if (!addrForm.phone.trim()) return alert('请填写手机号');
  if (!/^1\d{10}$/.test(addrForm.phone.trim())) return alert('手机号格式不正确');
  if (!addrForm.region.trim()) return alert('请填写省市区');
  if (!addrForm.detail.trim()) return alert('请填写详细地址');
  try {
    const payload = {
      recipientName: addrForm.recipientName, phone: addrForm.phone,
      region: addrForm.region, detail: addrForm.detail, isDefault: addrForm.isDefault,
    };
    if (addrForm.id) {
      payload.id = addrForm.id;
      await api('POST', '/address/update', payload);
    } else {
      await api('POST', '/address/create', payload);
    }
    addrForm.show = false;
    myAddresses.value = await api('GET', '/address/list');
    // 更新清货选择默认地址
    const def = myAddresses.value.find(a => a.isDefault);
    if (def) clearAddressId.value = def.id;
    alert('保存成功');
  } catch (e) { alert(e.message); }
}

async function deleteAddr(id) {
  if (!confirm('确定删除此地址？')) return;
  try {
    await api('POST', '/address/delete', { id });
    myAddresses.value = await api('GET', '/address/list');
    if (clearAddressId.value === id) {
      const def = myAddresses.value.find(a => a.isDefault);
      clearAddressId.value = def ? def.id : 0;
    }
    alert('已删除');
  } catch (e) { alert(e.message); }
}

async function setDefaultAddr(id) {
  try {
    await api('POST', '/address/default', { id });
    myAddresses.value = await api('GET', '/address/list');
    const def = myAddresses.value.find(a => a.isDefault);
    if (def) clearAddressId.value = def.id;
  } catch (e) { alert(e.message); }
}

function parseAddrSnapshot(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

/* ===== 设置相关 ===== */
async function changePwd() {
  if (!pwdForm.old) return alert('请输入原密码');
  if (!pwdForm.new || pwdForm.new.length < 6) return alert('新密码至少6位');
  if (pwdForm.new !== pwdForm.confirm) return alert('两次输入的新密码不一致');
  try {
    await api('POST', '/user/change-password', { oldPassword: pwdForm.old, newPassword: pwdForm.new });
    pwdForm.old = ''; pwdForm.new = ''; pwdForm.confirm = '';
    alert('密码修改成功，下次登录请使用新密码');
  } catch (e) { alert(e.message); }
}

async function saveContact() {
  try {
    await api('POST', '/user/profile', { qq: contactForm.qq, wechat: contactForm.wechat });
    store.user.qq = contactForm.qq;
    store.user.wechat = contactForm.wechat;
    alert('联系方式已更新');
  } catch (e) { alert(e.message); }
}

async function exportMyData(type) {
  try {
    let rows = [];
    if (type === 'bills') {
      const data = await api('GET', '/group/my-bills').catch(() => []);
      rows = data.map(b => ({ 单号:b.id, 系列:b.seriesName, 金额:b.total, 状态:b.state, 时间:b.createdAt }));
    } else if (type === 'buys') {
      const data = await api('GET', '/sale/my-buys').catch(() => []);
      rows = data.map(o => ({ 单号:o.id, 类型:+o.seriesId === 0 ? '直售' : '拍卖', 商品:o.items?.map(i => i.name).join('、'), 金额:o.total, 状态:o.status, 时间:o.createdAt }));
    } else if (type === 'clears') {
      const data = await api('GET', '/clearing/mine').catch(() => []);
      rows = data.map(c => ({ 单号:c.id, 邮费:c.freightName, 打包费:c.packName, 超期仓费:c.overFee, 合计:c.total, 状态:c.state, 时间:c.createdAt }));
    } else if (type === 'flows') {
      const data = await api('GET', '/balance/flows').catch(() => []);
      rows = data.map(f => ({ 类型:f.type, 金额:f.amount, 备注:f.note, 时间:f.createdAt }));
    }
    if (!rows.length) return alert('暂无数据可导出');
    const filename = { bills: '我的排谷记录.csv', buys: '我的购买记录.csv', clears: '我的清货记录.csv', flows: '我的余额流水.csv' }[type];
    downloadCSV(filename, rows);
  } catch (e) { alert(e.message); }
}

async function loadMe() {
  myBills.value = await api('GET', '/group/my-bills').catch(() => []);
  myGroupOrders.value = await api('GET', '/group/my-orders').catch(() => []);
  await loadBuys();
  myAuctionOrders.value = await api('GET', '/auction/my-orders').catch(() => []);
  notis.value = await api('GET', '/notify/list').catch(() => []);
  myWithdraws.value = await api('GET', '/balance/my-withdraws').catch(() => []);
  store.user = await api('GET', '/auth/me');
  // 加载转单可用的CN列表（团员端专用）
  cnList.value = await api('GET', '/transfer/cn-list').catch(() => []);
  // 拍卖数据已刷新，重新启动倒计时
  startAuctionTimer();
}

/* ===== 通用付款面板 ===== */
const payPanelData = reactive({ show: false, total: 0, useBalanceAmount: 0, screenshot: '', callback: null });
const payPanelNeedScan = computed(() => payPanelData.useBalanceAmount < payPanelData.total);
const payScanAmount = computed(() => Math.max(0, payPanelData.total - payPanelData.useBalanceAmount));
function openPayPanel(total, callback) {
  payPanelData.total = total;
  payPanelData.useBalanceAmount = Math.min(store.user.balance, total);
  payPanelData.screenshot = '';
  payPanelData.callback = callback;
  payPanelData.show = true;
}
async function pickPayScreenshot() {
  try { payPanelData.screenshot = await pickAndUploadImage(); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function confirmPay() {
  if (payPanelNeedScan.value && !payPanelData.screenshot) return;
  const maxUse = Math.min(store.user.balance, payPanelData.total);
  if (payPanelData.useBalanceAmount > maxUse) { alert('抵扣金额超过当前余额或应付总额'); return; }
  if (payPanelData.useBalanceAmount < 0) { alert('抵扣金额不能为负数'); return; }
  payPanelData.show = false;
  if (payPanelData.callback) await payPanelData.callback({ useBal: payPanelData.useBalanceAmount, screenshot: payPanelData.screenshot });
}

async function payBill(b) {
  openPayPanel(+b.total, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/group/bill/submit', { billId: b.id, screenshot, useBalanceAmount: useBal });
      alert(r.paidOff ? '余额全额抵扣，已销账' : '付款截图已提交，等待店主审核');
      loadMe();
    } catch (e) { alert(e.message); }
  });
}
async function paySale(o) {
  openPayPanel(+o.total, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/sale/pay', { orderId: o.id, screenshot, useBalanceAmount: useBal });
      alert(r.paidOff ? '余额抵扣成功，已入囤货' : '截图已提交，等待店主审核'); await loadMe(); await loadBuys();
    } catch (e) { alert(e.message); }
  });
}
async function payClearing(c) {
  openPayPanel(+c.total, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/clearing/submit', { id: c.id, screenshot, useBalanceAmount: useBal });
      alert(r.paidOff ? '余额抵扣成功' : '截图已提交，等待店主审核'); goMe('stock');
    } catch (e) { alert(e.message); }
  });
}
/** 解析清货单商品明细 JSON */
function parseClearItems(itemsJson) {
  try {
    const arr = JSON.parse(itemsJson || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
/** 计算运费分摊：个人运费 = 总运费 × 个人件数 ÷ 总件数（此处总运费=freightAmt，个人件数=本单总件数，总件数取本单） */
function calcFreightShare(c) {
  const items = parseClearItems(c.items);
  const myQty = items.reduce((s, i) => s + (+i.qty || 0), 0);
  const freight = +c.freightAmt || 0;
  return myQty > 0 ? (freight).toFixed(2) : '0.00';
}
/** 团员确认收货 */
async function confirmClearing(c) {
  if (!confirm('确认已收到货物？')) return;
  try {
    await api('POST', '/clearing/confirm-receive', { id: c.id });
    alert('已确认收货');
    myClears.value = await api('GET', '/clearing/mine').catch(() => []);
  } catch (e) { alert(e.message); }
}
async function paySecond(b) {
  openPayPanel(+b.amount, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/second/submit', { id: b.id, screenshot, useBalanceAmount: useBal });
      alert(r.paidOff ? '余额抵扣成功' : '截图已提交，等待店主审核'); goMe('second');
    } catch (e) { alert(e.message); }
  });
}
async function payTransfer(t) {
  openPayPanel(+t.price, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/transfer/pay', { id: t.id, screenshot, useBalanceAmount: useBal });
      alert('付款截图已提交，等待店主确认转款'); goMe('transfer');
    } catch (e) { alert(e.message); }
  });
}

async function cancelSale(o) {
  try {
    const r = await api('POST', '/sale/cancel-request', { orderId: o.id });
    alert(r.needAudit ? '已提交取消申请，等待店主审核' : '已取消'); await loadBuys();
  } catch (e) { alert(e.message); }
}

async function cancelGroupOrder(o) {
  if (!confirm('确认取消该系列的全部跟排？截团前可随时取消，截团后不可取消。')) return;
  try {
    await api('POST', '/group/order/cancel-follow', { orderId: o.id });
    alert('已取消跟排，库存已恢复');
    await loadMe();
  } catch (e) { alert(e.message); }
}

/* ===== 拍卖订单付款 ===== */
async function payAuctionOrder(a) {
  openPayPanel(+a.curPrice, async ({ useBal, screenshot }) => {
    try {
      const r = await api('POST', '/auction/pay', { auctionId: a.id, screenshot, useBalanceAmount: useBal });
      alert(r.restPaid > 0 ? '付款截图已提交，等待确认' : '余额抵扣成功'); await loadMe();
      myAuctionOrders.value = await api('GET', '/auction/my-orders').catch(() => []);
    } catch (e) { alert(e.message); }
  });
}

/* ===== 快速转单（在订单页面直接弹窗，不跳转） ===== */
function openQuickTransfer(orderWrapper) {
  const o = orderWrapper;
  const opts = [];
  if (o.type === 'group' && o.raw && o.raw.items) {
    for (const it of o.raw.items) {
      if (!it.seqs) continue;
      const seqs = it.seqs.split(',').filter(Boolean);
      for (const seq of seqs) {
        opts.push({ key: 'bill-' + o.raw.id + '-' + it.goodId + '-' + seq, seriesId: o.raw.seriesId, goodId: it.goodId, seq: +seq, orderId: 0, itemId: 0, name: it.name, seriesName: o.raw.seriesName, source: o.raw.state === '待付款' ? '已截团' : '囤货中' });
      }
    }
  } else if (o.type === 'sale' && o.raw && o.raw.items) {
    for (const it of o.raw.items) {
      const qty = it.qty || 1;
      for (let i = 0; i < qty; i++) {
        opts.push({ key: 'sale-' + o.raw.id + '-' + it.id + '-' + i, seriesId: 0, goodId: it.goodId || 0, seq: 0, orderId: o.raw.id, itemId: it.id, name: it.name, seriesName: '直售·订单#' + o.raw.id, source: '囤货中' });
      }
    }
  } else if (o.type === 'auction' && o.raw) {
    // 拍卖品付款后已自动生成Order+OrderItem，按直售囤货处理
    // 找对应的orderItem（通过goodId=0匹配，或者用name匹配兜底）
    const ao = o.raw;
    // 拍卖品只有1件，直接找到对应的order_item（seriesId=0且name匹配）
    const matchedBuy = myBuys.value.find(b => +b.seriesId === 0 && b.status === '囤货中' && b.items?.some(i => i.name === ao.name));
    if (matchedBuy && matchedBuy.items) {
      for (const it of matchedBuy.items) {
        if (it.name === ao.name) {
          opts.push({ key: 'auction-' + ao.id + '-' + it.id, seriesId: 0, goodId: 0, seq: 0, orderId: matchedBuy.id, itemId: it.id, name: it.name, seriesName: '拍卖', source: '囤货中' });
        }
      }
    }
  }
  quickTransfer.value = { show: true, order: o, selected: new Set(), toCn: '', way: 'owner', options: opts };
}
function toggleQuickTransferOpt(opt) {
  const s = quickTransfer.value.selected;
  if (s.has(opt.key)) s.delete(opt.key); else s.add(opt.key);
}
async function confirmQuickTransfer() {
  const f = quickTransfer.value;
  if (!f.selected.size) return alert('请选择要转的商品');
  if (!f.toCn.trim()) return alert('请输入接收者 CN');
  const selectedArr = f.options.filter(opt => f.selected.has(opt.key));
  try {
    for (const sel of selectedArr) {
      if (sel.orderId > 0) {
        // 直售转单（含拍卖品，因为已生成order）
        await api('POST', '/transfer/create-sale', { orderId: sel.orderId, itemId: sel.itemId, toCn: f.toCn.trim(), way: f.way });
      } else {
        // 拼团转单
        await api('POST', '/transfer/create', { seriesId: sel.seriesId, goodId: sel.goodId, seq: sel.seq, toCn: f.toCn.trim(), way: f.way });
      }
    }
    quickTransfer.value.show = false;
    alert(`转单已发起：${selectedArr.length} 件商品`);
    await loadMe();
  } catch (e) { alert(e.message); }
}

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return `${dt.getMonth()+1}/${dt.getDate()}`;
}
function getStockDays(o) {
  const t = o.paidAt || o.stockSince || o.createdAt;
  if (!t) return 0;
  return Math.floor((Date.now() - new Date(t).getTime()) / (24 * 60 * 60 * 1000));
}
function freeDaysLeft(o) {
  const cfg = shopCfg.value;
  const freeDays = o.seriesId ? (cfg.groupFreeDays || 30) : (cfg.saleFreeDays || 7);
  return Math.max(0, freeDays - getStockDays(o));
}
function overDays(o) {
  const cfg = shopCfg.value;
  const freeDays = o.seriesId ? (cfg.groupFreeDays || 30) : (cfg.saleFreeDays || 7);
  return Math.max(0, getStockDays(o) - freeDays);
}
function calcOverFee(o) {
  const days = overDays(o);
  if (days <= 0) return 0;
  const fees = JSON.parse(shopCfg.value.unitFees || '[]');
  let unitFee = 0.1;
  for (const item of (o.items || [])) {
    const f = fees.find(fi => fi.name && item.name && item.name.includes(fi.name));
    if (f) unitFee = f.fee;
  }
  const qty = (o.items || []).reduce((s, it) => s + (it.qty || 1), 0);
  return qty * unitFee * days;
}

async function createClearing() {
  if (!clearOrderIds.value.length) return alert('请勾选要清的囤货订单');
  if (!clearFreight.value || !clearPack.value) return alert('请选择邮费与打包费');
  if (!clearAddressId.value) return alert('请选择收货地址');
  try {
    const c = await api('POST', '/clearing/create', { 
      orderIds: clearOrderIds.value, 
      freightName: clearFreight.value, 
      packName: clearPack.value, 
      addressId: clearAddressId.value,
      overFee: totalOverFee.value
    });
    alert('清货单已创建：合计 ¥' + c.total); goMe('stock');
  } catch (e) { alert(e.message); }
}
async function createTransfer() {
  const goods = prompt('谷子ID（如 4）'); if (!goods) return;
  const seq = prompt('谷序（第几件）', '1'); if (!seq) return;
  const toCn = prompt('接收者 CN'); if (!toCn) return;
  const way = confirm('确定=通过店主结算（担保），取消=私下交易') ? 'owner' : 'private';
  try {
    await api('POST', '/transfer/create', { seriesId: 1, goodId: +goods, seq: +seq, toCn, way });
    alert('转单已发起'); goMe('transfer');
  } catch (e) { alert(e.message); }
}
async function openTransferPanel() {
  const opts = [];
  // 1. 已排/截团待付款的谷序（myBills）
  for (const b of myBills.value) {
    for (const it of b.items || []) {
      if (!it.seqs) continue;
      const seqs = it.seqs.split(',').filter(Boolean);
      for (const seq of seqs) {
        opts.push({ key: 'bill-' + b.id + '-' + it.goodId + '-' + seq, seriesId: b.seriesId, goodId: it.goodId, seq: +seq, orderId: 0, itemId: 0, name: it.name, seriesName: b.seriesName, source: '已截团' });
      }
    }
  }
  // 2. 囤货中的谷序（myBuys中拼团类 = seriesId != 0）
  for (const o of myBuys.value) {
    if (!o.seriesId || +o.seriesId === 0) continue;
    for (const it of o.items || []) {
      if (!it.seqs) continue;
      const seqs = it.seqs.split(',').filter(Boolean);
      for (const seq of seqs) {
        opts.push({ key: 'buy-' + o.id + '-' + it.goodId + '-' + seq, seriesId: o.seriesId, goodId: it.goodId, seq: +seq, orderId: 0, itemId: 0, name: it.name, seriesName: o.seriesName || '未知系列', source: '囤货中' });
      }
    }
  }
  // 3. 囤货中的直售商品（myBuys中直售类 = seriesId == 0 且 status === '囤货中'）
  for (const o of myBuys.value) {
    if (+o.seriesId !== 0 || o.status !== '囤货中') continue;
    for (const it of o.items || []) {
      const qty = it.qty || 1;
      for (let i = 0; i < qty; i++) {
        opts.push({ key: 'sale-' + o.id + '-' + it.id + '-' + i, seriesId: 0, goodId: it.goodId || 0, seq: 0, orderId: o.id, itemId: it.id, name: it.name, seriesName: '直售·订单#' + o.id, source: '囤货中' });
      }
    }
  }
  // 4. 拍卖品暂不支持转单（无 Order 记录），跳过
  // 如需支持需先为拍卖品创建 Order 记录

  transferForm.value = { show: true, seriesId: 0, goodId: 0, seq: 0, orderId: 0, itemId: 0, name: '', toCn: '', way: 'owner', options: opts, selected: new Set(), expandedGroups: new Set() };
}
async function confirmBatchTransfer() {
  const f = transferForm.value;
  if (!f.selected.size) return alert('请选择要转的谷子');
  if (!f.toCn.trim()) return alert('请输入接收者 CN');
  try {
    const selected = f.options.filter(opt => f.selected.has(opt.key));
    let successCount = 0;
    let failCount = 0;
    for (const opt of selected) {
      try {
        if (opt.orderId > 0) {
          // 直售转单
          await api('POST', '/transfer/create-sale', { orderId: opt.orderId, itemId: opt.itemId, toCn: f.toCn.trim(), way: f.way });
        } else {
          // 拼团转单
          await api('POST', '/transfer/create', { seriesId: opt.seriesId, goodId: opt.goodId, seq: opt.seq, toCn: f.toCn.trim(), way: f.way });
        }
        successCount++;
      } catch (e) { failCount++; console.error('转单失败:', opt.name, e); }
    }
    transferForm.value.show = false;
    alert(`转单已发起：成功 ${successCount} 件${failCount > 0 ? `，失败 ${failCount} 件` : ''}`);
    goMe('transfer');
  } catch (e) { alert(e.message); }
}

const transferGroups = computed(() => {
  const map = new Map();
  for (const opt of transferForm.value.options) {
    const groupName = opt.seriesName || '其他';
    if (!map.has(groupName)) map.set(groupName, []);
    map.get(groupName).push(opt);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

const transferSelectedTotal = computed(() => {
  let total = 0;
  for (const opt of transferForm.value.options) {
    if (transferForm.value.selected.has(opt.key)) total += opt.price || 0;
  }
  return total;
});

function toggleTransferItem(opt) {
  if (transferForm.value.selected.has(opt.key)) {
    transferForm.value.selected.delete(opt.key);
  } else {
    transferForm.value.selected.add(opt.key);
  }
  transferForm.value.selected = new Set(transferForm.value.selected);
}

function toggleTransferGroup(groupName) {
  if (transferForm.value.expandedGroups.has(groupName)) {
    transferForm.value.expandedGroups.delete(groupName);
  } else {
    transferForm.value.expandedGroups.add(groupName);
  }
  transferForm.value.expandedGroups = new Set(transferForm.value.expandedGroups);
}
async function confirmTransfer(t) {
  try { await api('POST', '/transfer/confirm', { id: t.id }); alert('已确认接受'); goMe('transfer'); } catch (e) { alert(e.message); }
}
async function pickAfterVideo() {
  try { af.video = await pickAndUploadImage(); alert('图片上传成功'); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function createAfter() {
  if (!af.orderId) return alert('请选择订单');
  try {
    await api('POST', '/aftersale/create', { ...af, orderId: af.orderId });
    alert('售后申请已提交'); Object.assign(af, { orderId: '', goods: '', video: '' }); goMe('after');
  } catch (e) { alert(e.message); }
}
async function shipBack(a) {
  const no = prompt('寄回物流单号'); if (!no) return;
  await api('POST', '/aftersale/ship-back', { id: a.id, trackingNo: no }); alert('已提交'); goMe('after');
}
async function applyWd() {
  if (!(wd.amount > 0)) return alert('请输入金额');
  try { await api('POST', '/balance/withdraw', { amount: wd.amount, method: wd.method || '支付宝' }); alert('提现申请已提交，余额已冻结，等待店主线下退回'); wd.amount = 0; await loadMe(); walletSubTab.value = 'list'; } catch (e) { alert(e.message); }
}
async function readNoti(n) {
  if (n.read) return;
  try { await api('POST', '/notify/read-one', { id: n.id }); n.read = true; } catch {}
}
async function readAllNoti() {
  try {
    await api('POST', '/notify/read-all');
    notis.value.forEach(n => n.read = true);
  } catch (e) { alert(e.message); }
}
async function deleteNoti(n) {
  try {
    await api('POST', '/notify/delete-one', { id: n.id });
    notis.value = notis.value.filter(x => x.id !== n.id);
  } catch (e) { alert(e.message); }
}
async function deactivateAccount() {
  if (!confirm('确认注销账号？所有数据将无法恢复')) return;
  try { await api('POST', '/auth/deactivate'); logout(); } catch (e) { alert(e.message); }
}

/* ===== 后台 ===== */
const adminMenus = ['数据看板', '预警中心', '付款审核', '拼团管理', '直售管理', '拍卖管理', '会员管理', '售后管理', '二次收肾', '清货/转单', '提现管理', '店铺设置', '我的账号'];
const adminTab = ref('数据看板');
const paymentAuditTab = ref('all'); // 'all' | 'group' | 'sale' | 'clear' | 'second' | 'deposit' | 'processed'

/* ===== 付款审核 - 批量勾选 ===== */
const paySelectedIds = reactive(new Set());
const paySelectAll = computed({
  get: () => allPendingOrders.value.length > 0 && allPendingOrders.value.every(o => paySelectedIds.has(o.type + '-' + o.id)),
  set: (v) => { /* handled by togglePaySelectAll */ }
});
function togglePaySelect(key) {
  if (paySelectedIds.has(key)) paySelectedIds.delete(key);
  else paySelectedIds.add(key);
}
function switchPayTab(tab) {
  paymentAuditTab.value = tab;
  paySelectedIds.clear();
}
function togglePaySelectAll() {
  if (paySelectAll.value) {
    paySelectedIds.clear();
  } else {
    allPendingOrders.value.forEach(o => paySelectedIds.add(o.type + '-' + o.id));
  }
}
async function batchAuditPayments(pass) {
  if (!paySelectedIds.size) return;
  if (!confirm(`确认批量${pass ? '通过' : '打回'} ${paySelectedIds.size} 笔付款？`)) return;
  const ids = [...paySelectedIds];
  let ok = 0, fail = 0;
  for (const key of ids) {
    const [type, id] = key.split('-');
    const o = allPendingOrders.value.find(o => o.type === type && String(o.id) === id);
    if (!o) continue;
    try {
      const note = pass ? '' : (prompt(`输入 ${o.cn} 的拒绝原因（可留空）`) || '');
      const map = { group: () => auditBill(o.raw, pass), sale: () => auditSale(o.raw, pass), clear: () => auditClear(o.raw, pass), second: () => auditSecond(o.raw, pass), deposit: () => auditDeposit(o.raw, pass) };
      await map[o.type]();
      ok++;
    } catch (e) { fail++; }
  }
  paySelectedIds.clear();
  alert(`批量审核完成：成功 ${ok} 笔${fail ? '，失败 ' + fail + ' 笔' : ''}`);
  loadAdmin();
}

/* ===== 数据看板 - 待办收件箱 ===== */
const todoFilter = ref('all');
const todoSelected = reactive(new Set());
const showScreenshotModal = ref(false);
const screenshotUrl = ref('');

const adminTodos = computed(() => {
  const raw = buildAdminTodos(
    pendingBills.value, pendingSales.value, pendingAfter.value,
    pendingDeposits.value, pendingCancelSales.value, pendingWithdraws.value
  );
  if (todoFilter.value === 'all') return raw;
  return {
    urgent: raw.urgent.filter(i => i.type === todoFilter.value),
    today: raw.today.filter(i => i.type === todoFilter.value),
    normal: raw.normal.filter(i => i.type === todoFilter.value),
    totalCount: raw.urgent.filter(i => i.type === todoFilter.value).length + raw.today.filter(i => i.type === todoFilter.value).length + raw.normal.filter(i => i.type === todoFilter.value).length,
  };
});

/* ===== 预警中心 ===== */
const alertFilter = ref('all');
const alerts = computed(() => {
  // 合并所有囤货中订单（拼团+直售+拍卖）用于预警
  const stockOrdersForAlerts = [
    ...(allGroupOrders.value || []),
    ...(allSales.value || []).filter(o => o.status === '囤货中'),
  ];
  return buildAlerts(
    allBills.value, stockOrdersForAlerts, saleGoods.value,
    auctions.value, users.value, shopCfg.value
  );
});
const filteredAlerts = computed(() => {
  if (alertFilter.value === 'all') return alerts.value;
  return alerts.value.filter(a => a.level === alertFilter.value);
});
const users = ref([]);
const allBills = ref([]);
const afters = ref([]);

/* ===== 会员管理 - 客户画像 ===== */
const memberSearchQ = ref('');
const memberSortBy = ref('active'); // 'active' | 'spent' | 'recent' | 'pending'
const selectedMemberProfile = ref(null);

const memberList = computed(() => {
  const list = users.value.map(u => {
    // 计算每个用户的画像摘要（轻量版，用于列表展示）
    const uid = u.id;
    const userBills = allBills.value.filter(b => b.userId === uid || b.cn === u.cn);
    const userSales = allSales.value.filter(o => o.userId === uid || o.cn === u.cn);
    const userAuctions = allAuctionOrders.value.filter(o => o.userId === uid || o.cn === u.cn);
    const userClears = clears.value.filter(c => c.userId === uid || c.cn === u.cn);
    const userAfters = afters.value.filter(a => a.userId === uid || a.cn === u.cn);
    const userSeconds = secondBills.value.filter(s => s.userId === uid || s.cn === u.cn);
    const userWithdraws = withdrawList.value.filter(w => w.userId === uid || w.cn === u.cn);
    const userTransfers = allTransfers.value.filter(t => t.fromCn === u.cn || t.toCn === u.cn);
    
    // 消费统计
    const totalSpent = [
      ...userBills.filter(b => b.state === '已销账'),
      ...userSales.filter(o => o.status === '囤货中'),
      ...userAuctions.filter(o => o.state === '囤货中' || o.state === '已付款')
    ].reduce((s, o) => s + (+o.total || 0), 0);
    
    // 活跃度
    const allDates = [
      ...userBills.map(b => b.createdAt),
      ...userSales.map(o => o.createdAt),
      ...userAuctions.map(o => o.createdAt),
      ...userClears.map(c => c.createdAt),
      ...userTransfers.map(t => t.createdAt),
      ...userSeconds.map(s => s.createdAt),
    ].filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const lastDate = allDates[0];
    const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : 999;
    let activeLevel = '沉睡';
    if (daysSince <= 7) activeLevel = '高频';
    else if (daysSince <= 30) activeLevel = '中频';
    else if (daysSince <= 90) activeLevel = '低频';
    
    // 待办数
    const pendingCount = [
      ...userBills.filter(b => b.state === '待付款' || b.state === '已提交截图'),
      ...userSales.filter(o => o.status === '待付款' || o.status === '申请取消'),
      ...userAuctions.filter(o => o.state === '待付款' || o.state === '中标待付款'),
      ...userAfters.filter(a => a.state === '待审核'),
      ...userSeconds.filter(s => s.state === '待付款' || s.state === '已提交截图'),
      ...userWithdraws.filter(w => w.state === '待处理'),
      ...userTransfers.filter(t => t.status === 'pending'),
    ].length;
    
    // 囤货数
    const stockCount = [
      ...userBills.filter(b => b.state === '已销账'),
      ...userSales.filter(o => o.status === '囤货中'),
      ...userAuctions.filter(o => o.state === '囤货中' || o.state === '已付款')
    ].length;
    
    return {
      ...u,
      totalSpent,
      activeLevel,
      daysSinceLast: daysSince,
      pendingCount,
      stockCount,
    };
  });
  
  // 搜索过滤
  const q = memberSearchQ.value.trim().toLowerCase();
  const filtered = q ? list.filter(u => 
    (u.cn || '').toLowerCase().includes(q) ||
    (u.account || '').toLowerCase().includes(q) ||
    (u.qq || '').toLowerCase().includes(q) ||
    (u.wechat || '').toLowerCase().includes(q)
  ) : list;
  
  // 排序
  return filtered.sort((a, b) => {
    if (memberSortBy.value === 'spent') return b.totalSpent - a.totalSpent;
    if (memberSortBy.value === 'recent') return a.daysSinceLast - b.daysSinceLast;
    if (memberSortBy.value === 'pending') return b.pendingCount - a.pendingCount;
    // active: 活跃等级排序（高频>中频>低频>沉睡）
    const levelOrder = { '高频': 0, '中频': 1, '低频': 2, '沉睡': 3 };
    return levelOrder[a.activeLevel] - levelOrder[b.activeLevel];
  });
});

const filteredMembers = computed(() => memberList.value);

function openMemberProfile(user) {
  selectedMemberProfile.value = buildCustomerProfile(
    user,
    allBills.value,
    allSales.value || [],
    allAuctionOrders.value || [],
    clears.value || [],
    allTransfers.value || [],
    afters.value || [],
    secondBills.value || [],
    withdrawList.value || [],
    shopCfg.value
  );
}
const newGood = reactive({ name: '', cat: '', price: 15, limit: 10, unitFee: 0.1, img: '' });
const priceOp = ref('mul'); const priceVal = ref(0.9);
const expandedCardId = ref(null);
const newAuction = reactive({ name: '', startPrice: 20, stepPrice: 2, buyNow: 80, deposit: 10, img: '' });
const newAuctionStart = ref('');
const newAuctionEnd = ref('');
const showAuctionForm = ref(false);
const newSaleGood = reactive({ name: '', no: '', ip: '', cat: '', type: '全新未拆', ownerCn: '', price: 0, stock: 1, unitFee: 0.1, img: '' });
const showSaleForm = ref(false);
const newSeries = reactive({ name: '', ip: '', emoji: '🧩', status: '进行中', mode: 'traditional', deadlineAt: '' });
const showSeriesForm = ref(false);

/* ===== 拼团管理工作台状态 ===== */
const groupWorkspaceView = ref(false);
const showAddGoodForm = ref(false);
const seriesCards = computed(() => buildSeriesCards(seriesList.value, allBills.value));
const gwMatrix = ref([]);
const gwMemberSummary = ref([]);
const gwUnpaidReminders = ref([]);

/* 谷子编辑弹窗表单 */
const goodEditForm = reactive({ show: false, id: 0, name: '', emoji: '', cat: '', price: 0, limit: 0, unitFee: 0.1 });
const saleGoodEditForm = reactive({ show: false, id: 0, name: '', emoji: '', cat: '', price: 0, stock: 0, unitFee: 0.1, img: '' });
const newSeriesBtnRef = ref(null);

/* ===== 拍卖编辑/重新上架表单 ===== */
const auctionEditForm = reactive({ show: false, id: 0, name: '', startPrice: 0, stepPrice: 0, buyNow: 0, deposit: 0, emoji: '', startTimeStr: '', endTimeStr: '', state: '' });
const auctionRelistForm = reactive({ show: false, id: 0, name: '', startPrice: 0, stepPrice: 0, buyNow: 0, deposit: 0, emoji: '', startTimeStr: '', endTimeStr: '' });

onMounted(() => {
  // Fix for newSeriesBtn not firing click events
  const fixNewSeriesBtn = () => {
    if (newSeriesBtnRef.value) {
      newSeriesBtnRef.value.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showSeriesForm.value = true;
        console.log('[Fix] openSeriesForm triggered via addEventListener');
      });
    }
  };
  fixNewSeriesBtn();
  // Also fix after adminTab changes (since the button gets re-rendered)
  const observer = new MutationObserver(fixNewSeriesBtn);
  const appEl = document.getElementById('app');
  if (appEl) observer.observe(appEl, { childList: true, subtree: true });
});

const adminSaleCatFilter = ref('全部');
const cfgFreightsArr = ref([]);
const cfgPacksArr = ref([]);
const cfgUnitFeesArr = ref([]);
const pendingDeposits = ref([]);
const pendingCancelSales = ref([]);
const withdrawList = ref([]);
const myWithdraws = ref([]);

const pendingBills = computed(() => allBills.value.filter(b => b.state === '已提交截图'));
const pendingAfter = computed(() => afters.value.filter(a => a.state === '待审核'));
const pendingWithdraws = computed(() => withdrawList.value.filter(w => w.state === '待处理'));
const allProcessedOrders = computed(() => {
  if (paymentAuditTab.value !== 'processed') return [];
  const orders = [];
  // 拼团肾表：已销账=通过 / 待付款=打回
  allBills.value.filter(b => b.state === '已销账' || b.state === '待付款').forEach(b => orders.push({ type: 'group', typeLabel: '拼团', id: b.id, raw: b, total: b.total, useBalanceAmount: b.useBalanceAmount || 0, screenshot: b.screenshot, createdAt: b.createdAt, cn: b.cn, title: b.seriesName, result: b.state === '已销账' ? '已通过' : '已打回' }));
  // 直售订单：囤货中=通过 / 已取消=取消（注：打回后状态为'待付款'，与初始状态相同，无法区分，故不显示打回记录）
  allSales.value.filter(o => ['囤货中','已取消'].includes(o.status)).forEach(o => orders.push({ type: 'sale', typeLabel: '直售', id: o.id, raw: o, total: o.total, useBalanceAmount: o.useBalanceAmount || 0, screenshot: o.screenshot, createdAt: o.createdAt, cn: o.cn, title: '订单#' + o.id, blindShipMode: o.blindShipMode || '', result: o.status === '囤货中' ? '已通过' : o.status }));
  // 清货：审核通过/已发货/已完成=通过 / 打回=打回
  clears.value.filter(c => ['审核通过','已发货','已完成','打回'].includes(c.state)).forEach(c => orders.push({ type: 'clear', typeLabel: '清货', id: c.id, raw: c, total: c.total, useBalanceAmount: c.useBalanceAmount || 0, screenshot: c.screenshot, createdAt: c.createdAt, cn: c.cn, title: c.freightName + '+' + c.packName, result: c.state === '打回' ? '已打回' : '已通过' }));
  // 二次收肾：已完成=通过（含余额全额抵扣或截图审核通过）
  secondBills.value.filter(b => b.state === '已完成').forEach(b => orders.push({ type: 'second', typeLabel: '二次收肾', id: b.id, raw: b, total: b.amount, useBalanceAmount: b.useBalanceAmount || 0, screenshot: b.screenshot, createdAt: b.createdAt, cn: b.cn, title: b.title, result: '已通过' }));
  // 保证金：已缴/已抵扣/已退/已没收
  allDeposits.value.filter(d => ['已缴','已抵扣','已退','已没收'].includes(d.state)).forEach(d => {
    orders.push({ type: 'deposit', typeLabel: '保证金', id: d.id, raw: d, total: d.amount, useBalanceAmount: 0, screenshot: d.screenshot, createdAt: d.createdAt, cn: d.cn || '', title: '拍卖#' + d.auctionId, result: d.state });
  });
  return orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
});
const goodsCount = computed(() => seriesList.value.reduce((sum, s) => sum + (s.goodCount || 0), 0));
const adminFilteredSaleGoods = computed(() => {
  let list = saleGoods.value;
  if (adminSaleCatFilter.value !== '全部') list = list.filter(g => g.cat === adminSaleCatFilter.value);
  return list;
});
const allPendingOrders = computed(() => {
  const orders = [];
  pendingBills.value.forEach(b => orders.push({ type: 'group', typeLabel: '拼团', id: b.id, raw: b, total: b.total, useBalanceAmount: b.useBalanceAmount || 0, screenshot: b.screenshot, createdAt: b.createdAt, cn: b.cn, title: b.seriesName }));
  pendingSales.value.forEach(o => orders.push({ type: 'sale', typeLabel: '直售', id: o.id, raw: o, total: o.total, useBalanceAmount: o.useBalanceAmount || 0, screenshot: o.screenshot, createdAt: o.createdAt, cn: o.cn, title: '订单#' + o.id, blindShipMode: o.blindShipMode || '' }));
  clears.value.filter(c => c.state === '已提交截图').forEach(c => orders.push({ type: 'clear', typeLabel: '清货', id: c.id, raw: c, total: c.total, useBalanceAmount: c.useBalanceAmount || 0, screenshot: c.screenshot, createdAt: c.createdAt, cn: c.cn, title: c.freightName + '+' + c.packName }));
  secondBills.value.filter(b => b.state === '已提交截图').forEach(b => orders.push({ type: 'second', typeLabel: '二次收肾', id: b.id, raw: b, total: b.amount, useBalanceAmount: b.useBalanceAmount || 0, screenshot: b.screenshot, createdAt: b.createdAt, cn: b.cn, title: b.title }));
  pendingDeposits.value.forEach(d => orders.push({ type: 'deposit', typeLabel: '保证金', id: d.id, raw: d, total: d.amount, useBalanceAmount: d.useBalanceAmount || 0, screenshot: d.screenshot, createdAt: d.createdAt, cn: d.cn, title: '拍卖#' + d.auctionId }));
  return orders.filter(o => paymentAuditTab.value === 'all' || o.type === paymentAuditTab.value).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
});

async function loadAdmin() {
  await loadAdminExt().catch(() => {});
  users.value = await api('GET', '/user/list');
  allBills.value = await api('GET', '/group/all-bills');
  allGroupOrders.value = await api('GET', '/group/all-orders').catch(() => []);
  afters.value = await api('GET', '/aftersale/all');
  await loadSeries(); await loadSale(); await loadAuctions();
}
function toggleSeries(id) { curSeriesId.value === id ? (curSeriesId.value = 0) : openSeriesAdmin(id); }
async function openSeriesAdmin(id) {
  curSeriesId.value = id;
  const r = await api('GET', '/group/series/' + id);
  curGoods.value = r.goods;
}
function openSeriesForm() { showSeriesForm.value = true; }

async function createSeries() {
  if (!newSeries.name) return alert('请填写系列名称');
  await api('POST', '/group/series/create', { ...newSeries, deadline: '', mode: newSeries.mode });
  newSeries.name = ''; newSeries.ip = ''; newSeries.mode = 'traditional'; newSeries.deadlineAt = ''; newSeries.eta = '';
  showSeriesForm.value = false;
  loadAdmin();
}
async function pickGoodImage() {
  try { newGood.img = await pickAndUploadImage(); alert('图片上传成功'); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function addGood(seriesId) {
  if (!newGood.name) return alert('请填名称');
  await api('POST', '/group/good/save', { ...newGood, seriesId, emoji: '🧸' });
  newGood.name = ''; newGood.cat = '';
  openSeriesAdmin(seriesId); loadSeries();
}
function editGood(g) {
  Object.assign(goodEditForm, { show: true, id: g.id, name: g.name, emoji: g.emoji || '🧸', cat: g.cat || '', price: +g.price || 0, limit: +g.limit || 0, unitFee: +g.unitFee || 0.1 });
}
async function submitGoodEdit() {
  const f = goodEditForm;
  if (!f.name) return alert('请填写名称');
  if (!f.price || +f.price <= 0) return alert('价格必须大于0');
  if (!f.limit || +f.limit <= 0) return alert('可排数量必须大于0');
  await api('POST', '/group/good/save', { id: f.id, name: f.name, price: +f.price, limit: +f.limit, seriesId: curSeriesId.value, cat: f.cat, emoji: f.emoji, unitFee: +f.unitFee });
  alert('修改已保存'); goodEditForm.show = false;
  if (groupWorkspaceView.value) { await refreshGroupWorkspace(); } else { openSeriesAdmin(curSeriesId.value); }
}
    async function handleDeleteSeries(card) {
    try {
      // 1. 预检
      const check = await api('GET', `/group/series/${card.id}/delete-check`);
      if (!check.canDelete) {
        alert(check.reason || '无法删除此活动');
        return;
      }

      // 2. 二次确认
      if (!confirm(`确认删除拼团「${card.name}」？\n此操作不可恢复，所有排谷记录将被清除。`)) return;

      // 3. 执行删除
      await api('POST', `/group/series/${card.id}/delete`);
      alert('拼团已删除');
      await loadSeries(); // 刷新列表
    } catch (e) {
      alert(e.message || '删除失败');
    }
  }
async function deleteGood(g) {
  if (!confirm('确认删除谷子「' + g.name + '」？')) return;
  await api('POST', '/group/good/delete', { id: g.id });
  alert('已删除');
  if (groupWorkspaceView.value) { await refreshGroupWorkspace(); } else { openSeriesAdmin(curSeriesId.value); }
  loadSeries();
}
const cutForm = ref({ show: false, goodId: 0, goodName: '', qty: 1, mode: 'byGood' });
function openCutForm(g) {
  cutForm.value = { show: true, goodId: g.id, goodName: g.name, qty: 1, mode: 'byGood' };
}
async function submitCut() {
  const f = cutForm.value;
  try {
    const r = await api('POST', '/group/order/cut', { goodId: f.goodId, qty: f.mode === 'all' ? undefined : f.qty });
    alert(`已砍单，退还 ¥${r.refunded || 0}`);
    cutForm.value.show = false;
    if (groupWorkspaceView.value) { await refreshGroupWorkspace(); } else { openSeriesAdmin(curSeriesId.value); }
    loadSeries();
  } catch (e) { alert('砍单失败：' + e.message); }
}
async function markArrive(seriesId, goodId, arrived) {
  await api('POST', '/group/good/arrive', { seriesId, goodIds: [goodId], arrived });
  openSeriesAdmin(seriesId);
}
async function jietuan(id) {
  if (!confirm('确认截团？将冻结排表并生成肾表通知团员')) return;
  try {
    const r = await api('POST', '/group/jietuan', { seriesId: id });
    alert('已截团，生成 ' + r.bills + ' 张肾表'); loadAdmin();
  } catch (e) { alert(e.message); }
}
function jietuanSelected() { curSeriesId.value ? jietuan(curSeriesId.value) : alert('请先展开一个系列'); }
async function batchPrice() {
  if (!curSeriesId.value) return alert('请先展开一个系列');
  const r = await api('POST', '/group/batch-price', { seriesId: curSeriesId.value, op: priceOp.value, val: priceVal.value });
  alert('已调价 ' + r.updated + ' 项'); openSeriesAdmin(curSeriesId.value);
}
async function exportGroupCSV() {
  if (!curGoods.value.length) return alert('请先展开一个系列');
  const rows = curGoods.value.map(g => ({谷子:g.name,分类:g.cat,单价:g.price,可排:g.limit,已排:g.booked,余量:Math.max(0,g.limit-g.booked)}));
  downloadCSV('拼团排表.csv', rows);
}

/* ===== 拼团管理工作台函数 ===== */
async function openGroupWorkspace(seriesId) {
  curSeriesId.value = seriesId;
  groupWorkspaceView.value = true;
  await refreshGroupWorkspace();
}
function closeGroupWorkspace() {
  groupWorkspaceView.value = false;
  curSeriesId.value = 0;
  gwMatrix.value = [];
  gwMemberSummary.value = [];
  gwUnpaidReminders.value = [];
}
async function refreshGroupWorkspace() {
  if (!curSeriesId.value) return;
  const r = await api('GET', '/group/series/' + curSeriesId.value);
  curGoods.value = r.goods;
  const ws = buildGroupWorkspace(curSeriesId.value, seriesList.value, r.goods, allBills.value);
  gwMatrix.value = ws.matrix;
  gwMemberSummary.value = ws.memberSummary;
  gwUnpaidReminders.value = buildUnpaidReminders(curSeriesId.value, seriesList.value, allBills.value);
}
async function addGoodFromWorkspace() {
  if (!newGood.name) return alert('请填名称');
  await api('POST', '/group/good/save', { ...newGood, seriesId: curSeriesId.value, emoji: '🧸' });
  newGood.name = ''; newGood.cat = '';
  showAddGoodForm.value = false;
  await refreshGroupWorkspace(); loadSeries();
}
async function batchPriceFromWorkspace(payload) {
  if (!curSeriesId.value) return;
  const r = await api('POST', '/group/batch-price', { seriesId: curSeriesId.value, op: payload.op, val: payload.val });
  alert('已调价 ' + r.updated + ' 项');
  await refreshGroupWorkspace();
}
async function markArriveFromWorkspace(payload) {
  await api('POST', '/group/good/arrive', { seriesId: curSeriesId.value, goodIds: [payload.goodId], arrived: payload.arrived });
  await refreshGroupWorkspace();
}
function exportGroupMatrixCSV() {
  if (!gwMatrix.value.length) return alert('暂无谷子数据');
  const rows = buildGroupMatrixCSV(gwMatrix.value, '');
  downloadCSV('谷子矩阵.csv', rows);
}
function exportMemberSummaryCSV() {
  if (!gwMemberSummary.value.length) return alert('暂无团员数据');
  const rows = buildMemberSummaryCSV(gwMemberSummary.value);
  downloadCSV('团员汇总.csv', rows);
}
async function remindUnpaid(r) {
  try {
    await api('POST', '/notify/send', { userId: r.userId, title: '催肾提醒', body: `你有一笔 ¥${r.total.toFixed(2)} 的拼团订单尚未付款，请尽快完成付款。` });
    alert('已发送催肾通知给 ' + r.cn);
  } catch (e) {
    alert('催肾通知发送失败：' + e.message + '\n请线下联系 ' + r.cn + '（¥' + r.total.toFixed(2) + '）');
  }
}
async function markUnpaidPaid(r) {
  if (!confirm(`确认 ${r.cn} 的肾表 #${r.billId}（¥${r.total.toFixed(2)}）已线下收款？`)) return;
  try {
    await api('POST', '/group/bill/audit', { billId: r.billId, pass: true, note: '线下收款已确认' });
    alert('已标记收款');
    await refreshGroupWorkspace();
    loadAdmin();
  } catch (e) { alert('操作失败：' + e.message); }
}
async function importGroupCSV() {
  try {
    if (!curSeriesId.value) return alert('请先选择一个系列');
    const rows = await pickCSVFile();
    if (!rows.length) return alert('CSV 为空或格式错误');
    for (const r of rows) {
      await api('POST', '/group/good/save', { name: r.名称||r.name||r.谷子, cat: r.分类||r.cat||'', price: +(r.价格||r.price||0), limit: +(r.可排||r.limit||0), seriesId: curSeriesId.value, emoji: '🧸', unitFee: 0.1 });
    }
    alert('导入完成');
    if (groupWorkspaceView.value) { await refreshGroupWorkspace(); } else { openSeriesAdmin(curSeriesId.value); }
    loadSeries();
  } catch (e) { alert(e.message); }
}
async function auditBill(b, pass) {
  await api('POST', '/group/bill/audit', { billId: b.id, pass, note: pass ? '' : '请核对金额' });
  loadAdmin();
}
async function ban(u) {
  await api('POST', '/user/ban', { id: u.id, ban: !u.banned, reason: '违反店铺规则' });
  loadAdmin();
}
async function resetPwd(u) {
  const r = await api('POST', '/user/reset-password', { id: u.id });
  alert('新密码：' + r.password + '（请线下告知）');
}
async function pickAuctionImage() {
  try { newAuction.img = await pickAndUploadImage(); alert('图片上传成功'); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function createAuction() {
  if (!newAuction.name) return alert('请填拍品名称');
  if (!newAuctionStart.value || !newAuctionEnd.value) return alert('请选择开拍时间');
  const st = new Date(newAuctionStart.value).getTime();
  const et = new Date(newAuctionEnd.value).getTime();
  if (et <= st) return alert('结束时间必须晚于开拍时间');
  await api('POST', '/auction/save', {
    ...newAuction, emoji: '🔨',
    startTime: st, endTime: et,
  });
  newAuction.name = '';
  loadAdmin();
}
function openAuctionEdit(a) {
  Object.assign(auctionEditForm, {
    show: true, id: a.id, name: a.name, startPrice: +a.startPrice, stepPrice: +a.stepPrice,
    buyNow: +a.buyNow, deposit: +a.deposit, emoji: a.emoji, state: a.state,
    startTimeStr: a.startTime ? new Date(+a.startTime).toISOString().slice(0, 16) : '',
    endTimeStr: a.endTime ? new Date(+a.endTime).toISOString().slice(0, 16) : '',
  });
}
function openAuctionRelist(a) {
  Object.assign(auctionRelistForm, {
    show: true, id: a.id, name: a.name, startPrice: +a.startPrice, stepPrice: +a.stepPrice,
    buyNow: +a.buyNow, deposit: +a.deposit, emoji: a.emoji, state: a.state,
    startTimeStr: '', endTimeStr: '',
  });
}
async function deleteAuction(a) {
  if (!confirm(`确认删除拍品「${a.name}」？此操作不可恢复。`)) return;
  try { await api('POST', '/auction/delete', { id: a.id }); alert('已删除'); loadAdmin(); } catch (e) { alert(e.message); }
}
async function submitAuctionEdit() {
  const f = auctionEditForm;
  if (!f.name) return alert('请填拍品名称');
  const st = new Date(f.startTimeStr).getTime();
  const et = new Date(f.endTimeStr).getTime();
  if (et <= st) return alert('结束时间必须晚于开拍时间');
  if (f.buyNow > 0 && f.buyNow <= f.startPrice) return alert('一口价必须高于起拍价');
  await api('POST', '/auction/save', {
    id: f.id, name: f.name, startPrice: f.startPrice, stepPrice: f.stepPrice,
    buyNow: f.buyNow, deposit: f.deposit, emoji: f.emoji,
    startTime: st, endTime: et,
  });
  alert('修改已保存'); auctionEditForm.show = false; loadAdmin();
}
async function submitAuctionRelist() {
  const f = auctionRelistForm;
  if (!f.name) return alert('请填拍品名称');
  const st = new Date(f.startTimeStr).getTime();
  const et = new Date(f.endTimeStr).getTime();
  if (et <= st) return alert('结束时间必须晚于开拍时间');
  if (f.buyNow > 0 && f.buyNow <= f.startPrice) return alert('一口价必须高于起拍价');
  await api('POST', '/auction/relist', {
    id: f.id, startPrice: f.startPrice, stepPrice: f.stepPrice,
    buyNow: f.buyNow, deposit: f.deposit,
    startTime: st, endTime: et,
  });
  alert('已重新上架，出价记录已清除'); auctionRelistForm.show = false; loadAdmin();
}
async function exportAuctionCSV() {
  if (!auctions.value.length) return alert('没有可导出的拍卖');
  const rows = auctions.value.map(a => ({名称:a.name,起拍价:a.startPrice,当前价:a.curPrice,一口价:a.buyNow,保证金:a.deposit,状态:a.state}));
  downloadCSV('拍卖列表.csv', rows);
}
async function importAuctionCSV() {
  try {
    const rows = await pickCSVFile();
    if (!rows.length) return alert('CSV 为空或格式错误');
    for (const r of rows) {
      await api('POST', '/auction/save', { name: r.名称||r.name, startPrice: +(r.起拍价||r.startPrice||20), stepPrice: +(r.加价||r.stepPrice||2), buyNow: +(r.一口价||r.buyNow||0), deposit: +(r.保证金||r.deposit||0), emoji: '🔨', startTime: Date.now() + 600000, endTime: Date.now() + 9600000 });
    }
    alert('导入完成'); loadAdmin();
  } catch (e) { alert(e.message); }
}
async function pickSaleGoodImage() {
  try { newSaleGood.img = await pickAndUploadImage(); alert('图片上传成功'); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function pickSaleGoodEditImage() {
  try { saleGoodEditForm.img = await pickAndUploadImage(); alert('图片上传成功'); }
  catch (e) { alert('图片上传失败：' + e.message); }
}
async function addSaleGood() {
  if (!newSaleGood.name) return alert('请填写名称');
  if (!newSaleGood.price || +newSaleGood.price <= 0) return alert('价格必须大于0');
  if (!newSaleGood.stock || +newSaleGood.stock <= 0) return alert('库存必须大于0');
  try {
    // 自动生成唯一编号: Z + 年月日 + 4位随机数
    const now = new Date();
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const autoNo = 'Z' + String(now.getFullYear()).slice(-2) + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-' + rand;
    await api('POST', '/sale/save', { ...newSaleGood, no: autoNo, emoji: '🧸' });
    newSaleGood.name = ''; newSaleGood.no = ''; newSaleGood.ip = ''; newSaleGood.cat = '';
    newSaleGood.type = '全新未拆'; newSaleGood.ownerCn = ''; newSaleGood.img = '';
    alert('上架成功'); loadAdmin();
  } catch (e) { alert('上架失败：' + e.message); }
}
function editSaleGood(g) {
  Object.assign(saleGoodEditForm, { show: true, id: g.id, name: g.name, emoji: g.emoji || '🧸', cat: g.cat || '', price: +g.price || 0, stock: +g.stock || 0, unitFee: +g.unitFee || 0.1, img: g.img || '' });
}
async function submitSaleGoodEdit() {
  const f = saleGoodEditForm;
  if (!f.name) return alert('请填写名称');
  if (!f.price || +f.price <= 0) return alert('价格必须大于0');
  if (!f.stock || +f.stock < 0) return alert('库存不能为负数');
  await api('POST', '/sale/save', { id: f.id, name: f.name, price: +f.price, stock: +f.stock, cat: f.cat, emoji: f.emoji, unitFee: +f.unitFee, img: f.img || '' });
  alert('修改已保存'); saleGoodEditForm.show = false; loadAdmin();
}
async function restockSaleGood(g) {
  const qty = +prompt('补充数量', '10');
    await api('POST', '/sale/save', { id: g.id, stock: g.stock + qty, name: g.name, price: g.price, no: g.no, ip: g.ip, cat: g.cat, emoji: g.emoji, unitFee: g.unitFee });
  alert('已补库存'); loadAdmin();
}
async function markSaleArrive(g) {
    await api('POST', '/sale/arrive', { id: g.id });
  alert('已到货'); loadAdmin();
}
async function deleteSaleGood(g) {
  if (!confirm('确认删除「' + g.name + '」？')) return;
  try {
    await api('POST', '/sale/delete', { id: g.id });
    // 立即从本地列表移除，避免闪烁
    saleGoods.value = saleGoods.value.filter(item => item.id !== g.id);
    alert('已删除');
  } catch (e) {
    alert(e.message || '删除失败');
  }
}
async function exportSaleCSV() {
  if (!saleGoods.value.length) return alert('没有可导出的直售');
  const rows = saleGoods.value.map(g => ({编号:g.no,名称:g.name,IP:g.ip,品类:g.cat,价格:g.price,库存:g.stock,所属者CN:g.ownerCn,状态:g.statusText||''}));
  downloadCSV('直售列表.csv', rows);
}
async function importSaleCSV() {
  try {
    const rows = await pickCSVFile();
    if (!rows.length) return alert('CSV 为空或格式错误');
    for (const r of rows) {
      await api('POST', '/sale/save', { name: r.名称||r.name, no: r.编号||r.no||'', ip: r.IP||r.ip||'', cat: r.品类||r.cat||'', price: +(r.价格||r.price||0), stock: +(r.库存||r.stock||1), emoji: '🧸', unitFee: 0.1 });
    }
    alert('导入完成'); loadAdmin();
  } catch (e) { alert(e.message); }
}
async function pickPayCode(type) {
  try {
    const url = await pickAndUploadImage();
    if (type === 'ali') cfgEd.payCodeAli = url;
    else cfgEd.payCodeWx = url;
    await api('POST', '/shop/config', { payCodeAli: cfgEd.payCodeAli, payCodeWx: cfgEd.payCodeWx });
    alert('收款码已保存');
  } catch (e) { alert(e.message); }
}
async function auditAfter(a, pass) {
  await api('POST', '/aftersale/audit', { id: a.id, pass, note: pass ? '' : '凭证不符' });
  loadAdmin();
}
async function afterOp(op, a) {
  await api('POST', '/aftersale/' + op, { id: a.id }); loadAdmin();
}
async function refund(a) {
  const amt = +prompt('退款金额（入余额）', '25') || 0;
  await api('POST', '/aftersale/refund', { id: a.id, amount: amt }); loadAdmin();
}
/* ===== 后台扩展 ===== */
const secondBills = ref([]);
const clears = ref([]);
const selectedClearings = ref([]);
const allTransfers = ref([]);
const pendingSales = ref([]);
const allSales = ref([]);
const allDeposits = ref([]);
const allGroupOrders = ref([]);
const allAuctionOrders = ref([]);
const sb = reactive({ userId: 0, way: 'point', p1: 2, p2: 5, p3: 3, title: '' });
const cfgEd = reactive({ groupFreeDays: 30, groupOverFeeOn: true, groupOverDays: 90, saleFreeDays: 7, saleOverFeeOn: true, saleOverDays: 30, afterSaleDays: 7, payCodeAli: '', payCodeWx: '' });

async function loadAdminExt() {
  secondBills.value = await api('GET', '/second/all').catch(() => []);
  clears.value = await api('GET', '/clearing/all').catch(() => []);
  allTransfers.value = await api('GET', '/transfer/all').catch(() => []);
  pendingSales.value = await api('GET', '/sale/pending-audit').catch(() => []);
  allSales.value = await api('GET', '/sale/all').catch(() => []);
  pendingCancelSales.value = (await api('GET', '/sale/pending-cancel').catch(() => [])).filter(o => o.status === '申请取消');
  pendingDeposits.value = await api('GET', '/auction/pending-deposits').catch(() => []);
  allDeposits.value = await api('GET', '/auction/all-deposits').catch(() => []);
  allAuctionOrders.value = await api('GET', '/auction/all-orders').catch(() => []);
  withdrawList.value = await api('GET', '/balance/all-withdraws').catch(() => []);
  const c = await api('GET', '/shop/config').catch(() => null);
  if (c) {
    Object.assign(cfgEd, { groupFreeDays: c.groupFreeDays||30, groupOverFeeOn: c.groupOverFeeOn, groupOverDays: c.groupOverDays||90, saleFreeDays: c.saleFreeDays||7, saleOverFeeOn: c.saleOverFeeOn, saleOverDays: c.saleOverDays||30, afterSaleDays: c.afterSaleDays||7, payCodeAli: c.payCodeAli || '', payCodeWx: c.payCodeWx || '' });
    cfgFreightsArr.value = JSON.parse(c.freights || '[]');
    cfgPacksArr.value = JSON.parse(c.packs || '[]');
    cfgUnitFeesArr.value = JSON.parse(c.unitFees || '[{"name":"拍立得 / 透卡 / 明信片","fee":0.1,"note":"纸片类小件"},{"name":"吧唧 / 立牌 / 色纸 / 文件夹","fee":0.2,"note":"亚克力/铁皮/纸质中件"},{"name":"手办 / 其他","fee":0.5,"note":"大件/其他"}]');
  }
}
async function createSecond() {
  if (!sb.userId) return alert('请选择团员');
  try { await api('POST', '/second/create', { ...sb }); sb.title = ''; alert('已发起'); loadAdminExt(); } catch (e) { alert(e.message); }
}
async function auditSecond(b, pass) {
  await api('POST', '/second/audit', { id: b.id, pass }); loadAdminExt();
}
async function auditClear(c, pass) {
  await api('POST', '/clearing/audit', { id: c.id, pass }); loadAdminExt();
}
async function shipClear(c) {
  const no = prompt('物流单号'); if (!no) return;
  await api('POST', '/clearing/ship', { id: c.id, trackingNo: no }); alert('已发货'); loadAdminExt();
}
function toggleSelectAllClearings() {
  const shippable = clears.value.filter(c => c.state === '审核通过').map(c => c.id);
  if (shippable.length && shippable.every(id => selectedClearings.value.includes(id))) {
    selectedClearings.value = selectedClearings.value.filter(id => !shippable.includes(id));
  } else {
    selectedClearings.value = [...new Set([...selectedClearings.value, ...shippable])];
  }
}
async function batchShipClears() {
  if (!selectedClearings.value.length) return;
  if (!confirm(`确认对选中的 ${selectedClearings.value.length} 条清货订单执行发货？`)) return;
  try {
    const r = await api('POST', '/clearing/batch-ship', { ids: selectedClearings.value });
    alert(`成功发货 ${r.shipped} 单`);
    selectedClearings.value = [];
    loadAdminExt();
  } catch (e) { alert(e.message); }
}
async function auditTransfer(t, pass) {
  const note = pass ? '' : (prompt('输入拒绝原因（可留空）') || '');
  await api('POST', '/transfer/audit', { id: t.id, pass, note }); loadAdminExt();
}
async function forwardTransfer(t) {
  await api('POST', '/transfer/forward', { id: t.id }); alert('已转款入转出方余额'); loadAdminExt();
}
async function auditSale(o, pass) {
  await api('POST', '/sale/audit', { orderId: o.id, pass }); loadAdminExt();
}
async function auditCancelSale(o, pass) {
  const note = pass ? '' : (prompt('输入拒绝原因（可留空）') || '');
    await api('POST', '/sale/cancel-audit', { orderId: o.id, pass, note }); loadAdminExt();
}
async function auditDeposit(d, pass) {
  const note = pass ? '' : (prompt('输入拒绝原因（可留空）') || '');
  await api('POST', '/auction/audit-deposit', { depositId: d.id, pass, note }); loadAdminExt();
}
async function finishWithdraw(w) {
  if (!confirm(`确认已线下转账 ¥${w.amount} 给 ${w.cn}？`)) return;
  try { await api('POST', '/balance/withdraw/finish', { id: w.id }); alert('已标记完成'); loadAdminExt(); } catch (e) { alert(e.message); }
}
async function rejectWithdraw(w) {
  if (!confirm(`确认拒绝 ${w.cn} 的提现申请？冻结金额将退回用户余额。`)) return;
  try { await api('POST', '/balance/withdraw/reject', { id: w.id }); alert('已拒绝，冻结金额已退回'); loadAdminExt(); } catch (e) { alert(e.message); }
}

/* ===== 数据看板 - 待办收件箱处理 ===== */
function toggleTodoSelect(id) {
  if (todoSelected.has(id)) todoSelected.delete(id);
  else todoSelected.add(id);
}
function showTodoDetail(item) {
  // 详情暂用 alert 显示，后续可扩展为弹窗
  const detail = `${item.typeLabel}：${item.title}\n${item.subtitle}\n${item.detail}`;
  alert(detail);
}
async function handleTodoAction({ item, action }) {
  try {
    if (item.type === 'bill') await auditBill(item.raw, action === 'pass');
    else if (item.type === 'sale') await auditSale(item.raw, action === 'pass');
    else if (item.type === 'after') await auditAfter(item.raw, action === 'pass');
    else if (item.type === 'deposit') await auditDeposit(item.raw, action === 'pass');
    else if (item.type === 'cancel') await auditCancelSale(item.raw, action === 'pass');
    else if (item.type === 'withdraw') {
      if (action === 'pass') await finishWithdraw(item.raw);
      else await rejectWithdraw(item.raw);
    }
    todoSelected.delete(item.id);
    await loadAdmin();
  } catch (e) { alert(e.message); }
}
function showScreenshot(url) {
  screenshotUrl.value = url;
  showScreenshotModal.value = true;
}
async function batchPass() {
  const items = Array.from(todoSelected).map(id => {
    const all = [...adminTodos.value.urgent, ...adminTodos.value.today, ...adminTodos.value.normal];
    return all.find(i => i.id === id);
  }).filter(Boolean);
  if (!items.length) return;
  if (!confirm(`确认批量通过 ${items.length} 项待办？`)) return;
  for (const item of items) {
    try { await handleTodoAction({ item, action: 'pass' }); } catch (e) {}
  }
  todoSelected.clear();
  await loadAdmin();
}
async function batchReject() {
  const items = Array.from(todoSelected).map(id => {
    const all = [...adminTodos.value.urgent, ...adminTodos.value.today, ...adminTodos.value.normal];
    return all.find(i => i.id === id);
  }).filter(Boolean);
  if (!items.length) return;
  if (!confirm(`确认批量打回 ${items.length} 项待办？`)) return;
  for (const item of items) {
    try { await handleTodoAction({ item, action: 'reject' }); } catch (e) {}
  }
  todoSelected.clear();
  await loadAdmin();
}

/* ===== 预警中心处理 ===== */
function handleAlertClick(item) {
  alert(`${item.type}：${item.title}\n${item.detail}`);
}
function navigateFromAlert(action) {
  const map = {
    '清货/转单管理': '清货/转单',
    '拼团管理': '拼团管理',
    '拍卖管理': '拍卖管理',
    '会员管理': '会员管理',
    '直售管理': '直售管理',
  };
  const tab = map[action];
  if (tab) adminTab.value = tab;
}
function exportAlerts() {
  const rows = alerts.value.map(a => ({
    级别: a.level === 'critical' ? '紧急' : a.level === 'warning' ? '警告' : '提示',
    类型: a.type,
    标题: a.title,
    详情: a.detail,
    建议操作: a.action,
  }));
  downloadCSV('预警清单.csv', rows);
}

async function auditPayment(o, pass) {
  const note = pass ? '' : (prompt('输入拒绝原因（可留空）') || '');
  const map = { group: () => auditBill(o.raw, pass), sale: () => auditSale(o.raw, pass), clear: () => auditClear(o.raw, pass), second: () => auditSecond(o.raw, pass), deposit: () => auditDeposit(o.raw, pass) };
  try { await map[o.type](); alert(pass ? '已审核通过' : '已打回'); } catch (e) { alert(e.message); }
}
async function saveCfgGroup() {
  await api('POST', '/shop/config', { groupFreeDays: cfgEd.groupFreeDays, groupOverFeeOn: cfgEd.groupOverFeeOn, groupOverDays: cfgEd.groupOverDays }); alert('已保存');
}
async function saveCfgSale() {
  await api('POST', '/shop/config', { saleFreeDays: cfgEd.saleFreeDays, saleOverFeeOn: cfgEd.saleOverFeeOn, saleOverDays: cfgEd.saleOverDays }); alert('已保存');
}
async function saveFreightRow(i) {
  const list = [...cfgFreightsArr.value];
  await api('POST', '/shop/config', { freights: JSON.stringify(list) }); alert('已保存');
}
async function savePackRow(i) {
  const list = [...cfgPacksArr.value];
  await api('POST', '/shop/config', { packs: JSON.stringify(list) }); alert('已保存');
}
function addFreightRow() { cfgFreightsArr.value.push({ name: '', amt: 0, on: true }); }
function addPackRow() { cfgPacksArr.value.push({ name: '', amt: 0, on: true }); }
async function saveUnitFeeRow(i) {
  const list = [...cfgUnitFeesArr.value];
  await api('POST', '/shop/config', { unitFees: JSON.stringify(list) }); alert('品类费率已保存');
}
function addUnitFeeRow() { cfgUnitFeesArr.value.push({ name: '', fee: 0.1, note: '' }); }

function goMember() {
  // 平滑切换到C端：设置视图模式为member，加载C端数据
  store.viewMode = 'member';
  tab.value = 'home';
  curSeries.value = null;
  groupSubTab.value = 'mine';
  showStockWorkspace.value = false;
  loadSeries(); loadSale(); loadAuctions(); loadMe();
  loadShopCfg();
}

/* ===== Timeline 导航处理 ===== */
async function loadShopCfg() {
  if (!shopCfg.value.freights) {
    try { shopCfg.value = await api('GET', '/shop/config'); } catch {}
  }
}

async function handleTimelineNavigate({ action, node }) {
  if (action === 'stock') {
    // 跳转清货工作台，自动勾选该节点
    await goMe('stock');
    const rawId = node.autoSelectId || node.raw?.id;
    swPreselectedId.value = rawId || null;
    // 构建 stock items
    swStockItems.value = buildStockItems();
    showStockWorkspace.value = true;
    tab.value = 'home';
  } else if (action === 'orders') {
    tab.value = 'me';
    await goMe('orders');
  } else if (action === 'auction') {
    if (node.raw?.id) {
      const a = auctions.value.find(x => x.id === node.raw.id);
      if (a) await openAuctionDetail(a);
      else { tab.value = 'auction'; await loadAuctions(); }
    } else {
      tab.value = 'auction';
      await loadAuctions();
    }
  } else if (action === 'transfer') {
    tab.value = 'me';
    await goMe('transfer');
  } else if (action === 'balance') {
    tab.value = 'me';
    await goMe('wallet');
  } else if (action === 'group') {
    tab.value = 'group';
    groupSubTab.value = 'mine';
    await loadSeries();
  }
}

function handleTimelineGoGroup(billId) {
  tab.value = 'group';
  groupSubTab.value = 'mine';
}

/* 构建清货工作台 stock items */
function buildStockItems() {
  const items = [];
  for (const o of allStockOrders.value) {
    const days = getStockDays(o);
    const freeDays = (o.seriesId && +o.seriesId !== 0) ? (shopCfg.value.groupFreeDays || 30) : (shopCfg.value.saleFreeDays || 7);
    const overDays = Math.max(0, days - freeDays);
    const freeLeft = Math.max(0, freeDays - days);
    const overFee = calcOverFee(o);
    const name = o.isAuction ? (o.items?.[0]?.name || '拍卖品') : (o.seriesName || compactItems(o.items) || '商品');
    items.push({ id: o.id, name, days, overDays, freeLeft, overFee, raw: o });
  }
  return items;
}

async function handleStockSubmit({ items, freight, pack, addressId, total }) {
  if (!items.length) return;
  try {
    const orderIds = items.map(i => i.raw?.id || i.id).filter(Boolean);
    const r = await api('POST', '/clearing/create', {
      orderIds,
      freightName: freight || '',
      packName: pack || '',
      addressId: +addressId || 0,
      overFee: total,
    });
    alert('清货单已创建：合计 ¥' + (r.total || total.toFixed(2)));
    showStockWorkspace.value = false;
    await loadMe();
    await goMe('stock');
  } catch (e) { alert(e.message); }
}

async function go(k) {
  tab.value = k;
  if (k === 'home') {
    curSeries.value = null;
    showStockWorkspace.value = false;
    await loadSeries();
    // 确保 timeline 数据已加载
    if (!myBills.value.length) await loadMe();
    if (!shopCfg.value.freights) {
      try { shopCfg.value = await api('GET', '/shop/config'); } catch {}
    }
  }
  if (k === 'group') { curSeries.value = null; await loadSeries(); if (!myBills.value.length) await loadMe(); }
  if (k === 'sale') await loadSale();
  if (k === 'auction') await loadAuctions();
  if (k === 'me') { meSubTab.value = ''; await loadMe().catch(() => {}); }
}

/* 工具 */
function fmtTime(t) { const d = new Date(+t || t); return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function fmtRemain(ts) {
  const s = Math.max(0, Math.floor((+ts - Date.now()) / 1000));
  if (s <= 0) return '已截拍';
  return '剩 ' + Math.floor(s / 3600) + '时' + Math.floor((s % 3600) / 60) + '分';
}

onMounted(async () => {
  if (!store.token) return;
  if (store.user.role !== 'member' && store.viewMode !== 'member') { await loadAdmin().catch(e => console.error(e)); }
  else {
    await loadSeries(); await loadSale(); await loadAuctions(); await loadMe();
    await loadShopCfg();
  }
  setInterval(() => { if (tab.value === 'auction') loadAuctions(); }, 10000);
  startSeriesTimer();
});

onUnmounted(() => {
  stopAuctionTimer();
  stopSeriesTimer();
});
</script>

<style src="./style.css"></style>

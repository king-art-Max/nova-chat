/**
 * Nova-OS 钱包模块
 * 简化版测试网钱包
 */

const Wallet = {
  address: null,
  balance: '1.0000',
  transactions: [],
  
  /**
   * 初始化钱包模块
   */
  init() {
    // 绑定事件
    this.bindEvents();
    
    // 加载钱包状态
    this.loadWallet();
  },
  
  /**
   * 绑定事件
   */
  bindEvents() {
    // 生成新地址
    document.getElementById('btn-create-wallet').addEventListener('click', () => {
      this.createWallet();
    });
    
    // 转账
    document.getElementById('btn-send').addEventListener('click', () => {
      this.showSendModal();
    });
  },
  
  /**
   * 加载钱包状态
   */
  loadWallet() {
    // 从localStorage恢复钱包
    const savedWallet = localStorage.getItem('nova_wallet');
    
    if (savedWallet) {
      const data = JSON.parse(savedWallet);
      this.address = data.address;
      this.balance = data.balance || '1.0000';
      this.transactions = data.transactions || [];
    } else {
      // 生成默认地址
      this.address = UI.generateWalletAddress();
    }
    
    // 更新UI
    this.updateUI();
  },
  
  /**
   * 保存钱包状态
   */
  saveWallet() {
    localStorage.setItem('nova_wallet', JSON.stringify({
      address: this.address,
      balance: this.balance,
      transactions: this.transactions
    }));
  },
  
  /**
   * 创建新钱包
   */
  createWallet() {
    UI.showConfirm('生成新地址', '确定要生成新的钱包地址吗？旧地址的数据将被清除。', () => {
      this.address = UI.generateWalletAddress();
      this.balance = '1.0000';
      this.transactions = [];
      this.saveWallet();
      this.updateUI();
      UI.showToast('新地址已生成');
    });
  },
  
  /**
   * 更新UI
   */
  updateUI() {
    document.getElementById('wallet-address').textContent = this.address || '未生成';
    document.getElementById('wallet-balance').textContent = this.balance;
    
    // 更新交易列表
    this.renderTransactions();
  },
  
  /**
   * 渲染交易记录
   */
  renderTransactions() {
    const container = document.getElementById('tx-list');
    
    if (this.transactions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>暂无交易记录</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.transactions.map(tx => `
      <div class="tx-item">
        <div class="tx-info">
          <span class="tx-type ${tx.type}">${tx.type === 'send' ? '转出' : '转入'}</span>
          <span class="tx-address">${this.shortenAddress(tx.address)}</span>
        </div>
        <div class="tx-amount ${tx.type}">
          ${tx.type === 'send' ? '-' : '+'}${tx.amount} NOV
        </div>
      </div>
    `).join('');
  },
  
  /**
   * 缩短地址显示
   */
  shortenAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },
  
  /**
   * 显示转账模态框
   */
  showSendModal() {
    UI.showModal('转账', `
      <div class="form-group">
        <label>收款地址</label>
        <input type="text" id="send-address" placeholder="0x...">
      </div>
      <div class="form-group">
        <label>金额 (NOV)</label>
        <input type="number" id="send-amount" placeholder="0.0000" step="0.0001" min="0">
      </div>
      <div class="form-group">
        <label>备注（可选）</label>
        <input type="text" id="send-memo" placeholder="这笔钱是...">
      </div>
      <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
        💡 这是一个测试网钱包，实际不会产生真实转账
      </p>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '确认转账', class: 'btn-primary', onClick: () => this.executeSend() }
    ]);
  },
  
  /**
   * 执行转账
   */
  async executeSend() {
    const address = document.getElementById('send-address').value.trim();
    const amount = parseFloat(document.getElementById('send-amount').value);
    const memo = document.getElementById('send-memo').value.trim();
    
    if (!address || !amount) {
      UI.showToast('请填写完整的转账信息');
      return;
    }
    
    if (!address.startsWith('0x') || address.length !== 42) {
      UI.showToast('请输入有效的以太坊地址');
      return;
    }
    
    if (amount <= 0 || amount > parseFloat(this.balance)) {
      UI.showToast('余额不足');
      return;
    }
    
    // 模拟转账过程
    UI.showToast('正在发起转账...');
    
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 更新余额
    this.balance = (parseFloat(this.balance) - amount).toFixed(4);
    
    // 添加交易记录
    this.transactions.unshift({
      id: Date.now(),
      type: 'send',
      address,
      amount: amount.toFixed(4),
      memo,
      timestamp: new Date().toISOString()
    });
    
    // 保存状态
    this.saveWallet();
    
    // 更新UI
    this.updateUI();
    
    UI.closeModal();
    UI.showToast('转账成功！');
  },
  
  /**
   * 接收转账（模拟）
   */
  receive(address, amount) {
    this.balance = (parseFloat(this.balance) + amount).toFixed(4);
    
    this.transactions.unshift({
      id: Date.now(),
      type: 'receive',
      address,
      amount: amount.toFixed(4),
      memo: '收到转账',
      timestamp: new Date().toISOString()
    });
    
    this.saveWallet();
    this.updateUI();
  },
  
  /**
   * 获取钱包地址
   */
  getAddress() {
    return this.address;
  },
  
  /**
   * 获取余额
   */
  getBalance() {
    return this.balance;
  }
};

// 添加交易记录样式
const walletStyle = document.createElement('style');
walletStyle.textContent = `
  .tx-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    margin-bottom: 8px;
  }
  .tx-item:last-child {
    margin-bottom: 0;
  }
  .tx-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tx-type {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    display: inline-block;
    width: fit-content;
  }
  .tx-type.send {
    background: rgba(255, 51, 102, 0.2);
    color: var(--accent-pink);
  }
  .tx-type.receive {
    background: rgba(0, 255, 136, 0.2);
    color: var(--accent-green);
  }
  .tx-address {
    font-size: 13px;
    color: var(--text-secondary);
    font-family: monospace;
  }
  .tx-amount {
    font-size: 16px;
    font-weight: 600;
  }
  .tx-amount.send {
    color: var(--accent-pink);
  }
  .tx-amount.receive {
    color: var(--accent-green);
  }
`;
document.head.appendChild(walletStyle);

// 导出钱包模块
window.Wallet = Wallet;

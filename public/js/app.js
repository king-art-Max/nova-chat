/**
 * Nova-OS 主应用模块
 * 初始化应用、控制页面流转
 */

// Socket连接
let socket = null;

/**
 * 初始化Socket连接
 */
function initSocket() {
  // 防止重复创建socket连接
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io({
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => {
    console.log('🔌 Socket已连接');
    
    // 用户上线
    if (Auth.isLoggedIn()) {
      socket.emit('user-online', Auth.getCurrentUserId());
    }
    
    // 重连后自动重新加入当前聊天室（修复断线重连收不到消息的问题）
    if (window.Chat && Chat.currentChat) {
      socket.emit('join-chat', Chat.currentChat.id);
      console.log('🔌 已重新加入聊天室:', Chat.currentChat.id);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket已断开');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket连接错误:', error);
  });
  
  // 好友请求实时通知
  socket.on('friend-request', (data) => {
    console.log('收到好友请求:', data);
    Contacts.loadContacts();
    UI.showToast('收到新的好友请求 ✨');
  });
  
  // 好友请求被接受通知
  socket.on('friend-accepted', (data) => {
    console.log('好友请求已接受:', data);
    Contacts.loadContacts();
    UI.showToast('好友请求已接受 🎉');
  });
  
  // 导出socket供其他模块使用
  window.socket = socket;
  
  // 注册chat模块的socket事件
  if (window.registerSocketEvents) {
    window.registerSocketEvents();
  }
}

/**
 * 应用主对象
 */
const App = {
  /**
   * 初始化应用
   */
  init() {
    console.log('🚀 Nova-OS 初始化中...');
    
    // 初始化认证
    Auth.init();
    
    // 绑定全局事件
    this.bindEvents();
    
    // 隐藏加载界面
    setTimeout(() => {
      document.getElementById('loading-screen').classList.remove('active');
    }, 1000);
  },
  
  /**
   * 登录后初始化
   */
  onLoggedIn() {
    // 初始化各模块
    Chat.init();
    AIChat.init();
    Wallet.init();
    
    // 加载联系人列表
    Contacts.loadContacts();
    
    // 更新用户信息显示
    this.updateUserInfo();
    
    // 初始化Socket（initSocket内部有防重复机制）
    initSocket();
    
    // 定时轮询好友请求（每10秒）
    this.contactPollTimer = setInterval(() => {
      if (Auth.isLoggedIn()) Contacts.loadContacts();
    }, 10000);
  },
  
  /**
   * 绑定全局事件
   */
  bindEvents() {
    // 底部导航切换
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        UI.showPage(page);
      });
    });
    
    // 设置按钮
    document.getElementById('btn-settings').addEventListener('click', () => {
      this.showSettings();
    });
    
    // 添加联系人按钮
    document.getElementById('btn-add-contact').addEventListener('click', () => {
      Contacts.showAddContactModal();
    });
    
    // 退出登录
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Auth.logout();
      });
    }
    
    // 编辑资料
    const editProfileBtn = document.getElementById('btn-edit-profile');
    if (editProfileBtn) {
      editProfileBtn.addEventListener('click', () => {
        this.showEditProfile();
      });
    }
    
    // 安全设置导航
    const menuSecurity = document.getElementById('menu-security');
    if (menuSecurity) {
      menuSecurity.addEventListener('click', () => {
        UI.showSecurityPage();
        if (window.AppState) AppState.enterSecurity();
      });
    }
    
    // 安全设置返回按钮
    const securityBack = document.getElementById('btn-security-back');
    if (securityBack) {
      securityBack.addEventListener('click', () => {
        UI.backToProfile();
        if (window.AppState) AppState.inSecurity = false;
        history.back();
      });
    }
    
    // 安全设置卡片展开/折叠
    document.querySelectorAll('.security-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch')) return;
        const detail = card.querySelector('.sc-detail');
        if (detail) {
          detail.classList.toggle('hidden');
        }
      });
    });
    
    // 安全设置开关状态保存 + UI更新
    document.querySelectorAll('.sc-toggle input').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const card = e.target.closest('.security-card');
        const module = card?.dataset.module;
        if (module) {
          localStorage.setItem(`security_${module}`, e.target.checked);
          // 更新状态文字
          const statusEl = card?.querySelector('.sc-status');
          if (statusEl) {
            if (e.target.checked) {
              statusEl.textContent = '已启用';
              statusEl.classList.add('enabled');
              statusEl.classList.remove('disabled');
            } else {
              statusEl.textContent = '已禁用';
              statusEl.classList.remove('enabled');
              statusEl.classList.add('disabled');
            }
          }
          // 模块特定逻辑
          if (module === 'anti-scan') {
            const ipEl = document.getElementById('sec-ip-mix');
            const metaEl = document.getElementById('sec-meta-clean');
            const behEl = document.getElementById('sec-behavior-prot');
            if (ipEl) ipEl.textContent = e.target.checked ? '开启' : '关闭';
            if (metaEl) metaEl.textContent = e.target.checked ? '开启' : '关闭';
            if (behEl) behEl.textContent = e.target.checked ? '开启' : '关闭';
          }
          if (module === 'wallet-lock') {
            const pwdEl = document.getElementById('sec-wallet-pwd');
            if (pwdEl) pwdEl.textContent = e.target.checked ? '已启用' : '未启用';
          }
        }
      });
    });
    
    // 恢复安全设置开关状态
    document.querySelectorAll('.sc-toggle input').forEach(toggle => {
      const card = toggle.closest('.security-card');
      const module = card?.dataset.module;
      if (module) {
        const saved = localStorage.getItem(`security_${module}`);
        if (saved !== null) toggle.checked = saved === 'true';
      }
    });
    
    // 联系人搜索
    const contactSearch = document.getElementById('contact-search');
    if (contactSearch) {
      contactSearch.addEventListener('input', (e) => {
        Contacts.filterContacts(e.target.value);
      });
    }
    
    // 模态框关闭按钮
    document.getElementById('btn-modal-close').addEventListener('click', () => {
      UI.closeModal();
    });
  },
  
  /**
   * 更新用户信息显示
   */
  updateUserInfo() {
    if (!Auth.currentUser) return;
    
    const user = Auth.currentUser;
    
    // 顶部栏
    document.getElementById('current-gal').textContent = `Gal://${user.galNumber}`;
    
    // 个人资料页
    document.getElementById('profile-nickname').textContent = user.nickname;
    document.getElementById('profile-gal').textContent = `Gal://${user.galNumber}`;
    
    // 设置头像
    const avatarEl = document.getElementById('profile-avatar');
    const avatarEmojis = {
      astronaut: '👨‍🚀',
      rocket: '🚀',
      star: '⭐',
      moon: '🌙',
      alien: '👽',
      robot: '🤖',
      devil: '😈',
      heart: '💖'
    };
    avatarEl.innerHTML = `<span>${avatarEmojis[user.avatar] || '👨‍🚀'}</span>`;
    
    // 更新统计数据
    this.updateStats();
  },
  
  /**
   * 更新统计数据
   */
  async updateStats() {
    try {
      // 获取联系人数量
      const contactsRes = await fetch(`/api/contacts?userId=${Auth.getCurrentUserId()}`);
      const contactsData = await contactsRes.json();
      
      // 获取聊天数量
      const chatsRes = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`);
      const chatsData = await chatsRes.json();
      
      document.getElementById('stat-contacts').textContent = 
        contactsData.contacts?.filter(c => c.status === 'accepted').length || 0;
      document.getElementById('stat-chats').textContent = 
        chatsData.chats?.length || 0;
    } catch (error) {
      console.error('更新统计数据失败:', error);
    }
  },
  
  /**
   * 显示设置
   */
  showSettings() {
    UI.showModal('设置中心', `
      <div class="settings-menu">
        <div class="settings-menu-item" onclick="App.showEditProfile()">
          <span class="settings-icon">👤</span>
          <span class="settings-text">编辑资料</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-menu-item" onclick="UI.showPage('security'); AppState.enterSecurity()">
          <span class="settings-icon">🔐</span>
          <span class="settings-text">安全设置</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-menu-item" onclick="MenuFunctions.showWallet()">
          <span class="settings-icon">💎</span>
          <span class="settings-text">星币钱包</span>
          <span class="settings-value">${localStorage.getItem('nova_star_coins') || 1000}</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-menu-item" onclick="MenuFunctions.showStarred()">
          <span class="settings-icon">⭐</span>
          <span class="settings-text">我的收藏</span>
          <span class="settings-value" id="collection-count">${(JSON.parse(localStorage.getItem('nova_collections') || '[]')).length}</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-menu-item" onclick="MenuFunctions.showAbout()">
          <span class="settings-icon">ℹ️</span>
          <span class="settings-text">关于Nova-OS</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-menu-item danger" onclick="MenuFunctions.clearCache()">
          <span class="settings-icon">🗑️</span>
          <span class="settings-text">清除缓存</span>
          <span class="settings-arrow">›</span>
        </div>
      </div>
    `, [
      { text: '关闭', class: 'btn-secondary' }
    ]);
    
    // 检查服务器状态
    this.checkServerStatus();
  },
  
  /**
   * 检查服务器状态
   */
  async checkServerStatus() {
    try {
      const response = await fetch('/api/ai/personas');
      if (response.ok) {
        document.getElementById('server-status').textContent = '在线';
        document.getElementById('server-status').style.color = 'var(--accent-green)';
      }
    } catch (error) {
      document.getElementById('server-status').textContent = '离线';
      document.getElementById('server-status').style.color = 'var(--accent-pink)';
    }
  },
  
  /**
   * 显示编辑资料
   */
  showEditProfile() {
    const user = Auth.currentUser;
    
    const avatarOptions = ['astronaut', 'rocket', 'star', 'moon', 'alien', 'robot', 'devil', 'heart'];
    const avatarEmojis = {
      astronaut: '👨‍🚀',
      rocket: '🚀',
      star: '⭐',
      moon: '🌙',
      alien: '👽',
      robot: '🤖',
      devil: '😈',
      heart: '💖'
    };
    
    UI.showModal('编辑资料', `
      <div class="form-group">
        <label>昵称</label>
        <input type="text" id="edit-nickname" value="${user.nickname}">
      </div>
      <div class="form-group">
        <label>头像</label>
        <div class="avatar-options">
          ${avatarOptions.map(opt => `
            <div class="avatar-option ${user.avatar === opt ? 'selected' : ''}" data-avatar="${opt}">
              ${avatarEmojis[opt]}
            </div>
          `).join('')}
        </div>
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '保存', class: 'btn-primary', onClick: () => this.saveProfile() }
    ]);
    
    // 绑定头像选择事件
    document.querySelectorAll('.avatar-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  },
  
  /**
   * 保存资料
   */
  async saveProfile() {
    const nickname = document.getElementById('edit-nickname').value.trim();
    const selectedAvatar = document.querySelector('.avatar-option.selected');
    const avatar = selectedAvatar?.dataset.avatar || 'astronaut';
    
    if (!nickname) {
      UI.showToast('昵称不能为空');
      return;
    }
    
    try {
      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          nickname,
          avatar
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 更新本地状态
        Auth.currentUser.nickname = nickname;
        Auth.currentUser.avatar = avatar;
        localStorage.setItem('nova_user', JSON.stringify(Auth.currentUser));
        
        // 更新UI
        this.updateUserInfo();
        
        UI.closeModal();
        UI.showToast('资料已更新');
      }
    } catch (error) {
      console.error('保存资料失败:', error);
      UI.showToast('保存失败');
    }
  }
};

// 添加设置项样式
const settingsStyle = document.createElement('style');
settingsStyle.textContent = `
  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  }
  .setting-value {
    color: var(--text-secondary);
    font-size: 14px;
  }
  .avatar-options {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .avatar-option {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
  }
  .avatar-option:hover {
    background: var(--border-color);
  }
  .avatar-option.selected {
    border-color: var(--accent-blue);
    background: rgba(0, 212, 255, 0.1);
  }
`;
document.head.appendChild(settingsStyle);

// 联系人模块（简化版，集成在主应用中）
const Contacts = {
  allContacts: [],
  contacts: [],
  pendingRequests: [],
  
  /**
   * 加载联系人列表
   */
  async loadContacts() {
    try {
      const response = await fetch(`/api/contacts?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success) {
        this.allContacts = data.contacts;
        this.contacts = data.contacts.filter(c => c.status === 'accepted');
        this.pendingRequests = data.contacts.filter(c => c.status === 'pending' && c.direction === 'received');
        this.renderContacts();
        this.renderFriendRequests();
      }
    } catch (error) {
      console.error('加载联系人失败:', error);
    }
  },
  
  renderFriendRequests() {
    const container = document.getElementById('friend-requests');
    const frList = document.getElementById('fr-list');
    const frCount = document.getElementById('fr-count');
    
    if (!container || !frList) return;
    
    const pending = this.allContacts.filter(c => c.status === 'pending' && c.direction === 'received');
    
    if (pending.length > 0) {
      container.classList.remove('hidden');
      if (frCount) frCount.textContent = pending.length;
      frList.innerHTML = pending.map(c => `
        <div class="fr-item" data-contact-id="${c.id}">
          <div class="fr-avatar">${UI.avatarMap[c.avatar] || '👤'}</div>
          <div class="fr-info">
            <div class="fr-name">${UI.escapeHtml(c.nickname)}</div>
            <div class="fr-gal">${UI.formatGalNumber(c.galNumber)}</div>
          </div>
          <div class="fr-actions">
            <button class="btn btn-primary btn-accept-fr">接受</button>
          </div>
        </div>
      `).join('');
      
      // 绑定接受按钮事件
      frList.querySelectorAll('.btn-accept-fr').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = e.target.closest('.fr-item');
          const contactId = parseInt(item.dataset.contactId);
          this.acceptRequest(contactId);
        });
      });
    } else {
      container.classList.add('hidden');
    }
  },
  
  filterContacts(query) {
    query = query.toLowerCase().trim();
    const items = document.querySelectorAll('#contacts-list .contact-item');
    
    items.forEach(item => {
      const name = item.querySelector('.contact-item-name')?.textContent.toLowerCase() || '';
      const gal = item.dataset.gal?.toLowerCase() || '';
      const match = !query || name.includes(query) || gal.includes(query);
      item.style.display = match ? '' : 'none';
    });
  },
  
  /**
   * 渲染联系人列表
   */
  renderContacts() {
    const container = document.getElementById('contacts-list');
    
    // 根据direction区分：received+pending=待处理, sent+pending=已发送, accepted=好友
    const pendingReceived = this.allContacts.filter(c => c.status === 'pending' && c.direction === 'received');
    const pendingSent = this.allContacts.filter(c => c.status === 'pending' && c.direction === 'sent');
    const accepted = this.allContacts.filter(c => c.status === 'accepted');
    
    let html = '';
    
    // 待处理请求（我收到的）
    if (pendingReceived.length > 0) {
      html += '<div style="margin-bottom: 16px;"><h3 style="color: var(--text-muted); margin-bottom: 8px;">📩 好友请求</h3>';
      html += pendingReceived.map(c => UI.renderContactItem(c, true)).join('');
      html += '</div>';
    }
    
    // 已发送请求
    if (pendingSent.length > 0) {
      html += '<div style="margin-bottom: 16px;"><h3 style="color: var(--text-muted); margin-bottom: 8px;">📤 已发送</h3>';
      html += pendingSent.map(c => UI.renderContactItem(c, false, true)).join('');
      html += '</div>';
    }
    
    // 好友列表
    if (accepted.length > 0) {
      html += '<div><h3 style="color: var(--text-muted); margin-bottom: 8px;">👥 好友</h3>';
      html += accepted.map(c => UI.renderContactItem(c, false)).join('');
      html += '</div>';
    }
    
    if (html === '') {
      html = `
        <div class="empty-state">
          <p>还没有联系人</p>
          <p>通过Gal号码添加好友</p>
        </div>
      `;
    }
    
    container.innerHTML = html;
    
    // 绑定事件
    container.querySelectorAll('.contact-item').forEach(item => {
      // 接受好友请求（仍保留在列表项上）
      const acceptBtn = item.querySelector('.btn-accept');
      if (acceptBtn) {
        acceptBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          acceptBtn.textContent = '处理中...';
          acceptBtn.disabled = true;
          this.acceptRequest(parseInt(item.dataset.contactId));
        });
        return; // pending状态不弹详情
      }
      
      // 点击已接受联系人 → 弹出详情页
      item.addEventListener('click', () => {
        const contactId = parseInt(item.dataset.contactId);
        const contact = this.contacts.find(c => c.id === contactId);
        if (contact) {
          UI.showContactDetail(contact);
        }
      });
    });
  },
  
  /**
   * 检查防互扰模式并开始聊天
   */
  async checkQuietModeAndStartChat(contactId, contact) {
    // 获取所有群组，检查双方是否都在某个防互扰群中
    try {
      const response = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success) {
        const groups = data.chats.filter(c => c.type === 'group');
        let isInQuietGroup = false;
        
        for (const group of groups) {
          if (group.groupMode === 'quiet' && group.members) {
            const isMeInGroup = group.members.some(m => m.id === Auth.getCurrentUserId());
            const isContactInGroup = group.members.some(m => m.id === contactId);
            if (isMeInGroup && isContactInGroup) {
              isInQuietGroup = true;
              break;
            }
          }
        }
        
        if (isInQuietGroup) {
          UI.showToast('⚠️ 你们在防互扰群中，无法发起私聊');
          return;
        }
      }
    } catch (error) {
      console.error('检查防互扰模式失败:', error);
    }
    
    // 可以发起私聊
    Chat.createPrivateChat(contactId, contact);
  },
  
  /**
   * 显示添加联系人模态框
   */
  showAddContactModal() {
    // 自定义模态框，防止点击确定后立即关闭
    UI.showModal('添加联系人', `
      <div class="form-group">
        <label>对方的Gal号码</label>
        <input type="text" id="add-contact-input" placeholder="GALxxxxxxxxx" style="text-transform:uppercase;">
      </div>
      <p id="add-contact-hint" style="color:var(--text-muted);font-size:12px;margin-top:4px;"></p>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '添加', class: 'btn-primary', closeOnClick: false, onClick: async () => {
        const input = document.getElementById('add-contact-input');
        const hint = document.getElementById('add-contact-hint');
        let cleanGal = input.value.trim().replace('Gal://', '').replace('gal://', '').toUpperCase();
        
        if (!cleanGal.startsWith('GAL')) {
          hint.style.color = '#ff4444';
          hint.textContent = '请输入正确的Gal号码，如 GAL7319ESL28';
          return;
        }
        
        hint.style.color = 'var(--text-muted)';
        hint.textContent = '正在发送请求...';
        input.disabled = true;
        
        try {
          const response = await fetch('/api/contacts/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: Auth.getCurrentUserId(),
              contactGal: cleanGal
            })
          });
          
          const data = await response.json();
          
          if (data.success) {
            UI.showToast('好友请求已发送 ✨');
            UI.closeModal();
            this.loadContacts();
          } else {
            hint.style.color = '#ff4444';
            hint.textContent = data.error || '添加失败';
            input.disabled = false;
          }
        } catch (error) {
          console.error('添加联系人失败:', error);
          hint.style.color = '#ff4444';
          hint.textContent = '网络错误，请重试';
          input.disabled = false;
        }
      }}
    ]);
    
    setTimeout(() => {
      const input = document.getElementById('add-contact-input');
      if (input) input.focus();
    }, 100);
  },
  
  /**
   * 接受好友请求
   */
  async acceptRequest(contactId) {
    console.log('接受好友请求, contactId:', contactId, 'userId:', Auth.getCurrentUserId());
    UI.showToast('正在处理...');
    try {
      const response = await fetch('/api/contacts/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          contactId: contactId
        })
      });
      
      const data = await response.json();
      console.log('接受请求结果:', data);
      
      if (data.success) {
        UI.showToast('已添加为好友 🎉');
        this.loadContacts();
      } else {
        UI.showToast(data.error || '操作失败');
      }
    } catch (error) {
      console.error('接受请求失败:', error);
      UI.showToast('网络错误，请重试');
    }
  }
};

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 导出App对象
window.App = App;
window.Contacts = Contacts;

// ==================== V3.0 新增功能 ====================

// 菜单项功能完善
const MenuFunctions = {
  /**
   * 星币钱包 - 跳转到钱包页面
   */
  showWallet() {
    UI.showPage('wallet');
    if (Wallet && Wallet.updateUI) {
      Wallet.updateUI();
    }
  },
  
  /**
   * 我的收藏 - 显示收藏联系人
   */
  async showStarred() {
    UI.closeModal();
    UI.showPage('starred');
    if (window.AppState) AppState.enterStarred();
    await this.loadStarredContacts();
  },
  
  /**
   * 加载收藏联系人
   */
  async loadStarredContacts() {
    const container = document.getElementById('starred-list');
    let html = '';
    
    // 加载收藏的联系人
    try {
      const response = await fetch(`/api/contacts/starred?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success && data.contacts.length > 0) {
        html += '<div style="margin-bottom:16px"><h3 style="color:var(--text-muted);margin-bottom:8px">❤️ 收藏的联系人</h3>';
        html += data.contacts.map(c => `
          <div class="contact-item" data-contact-id="${c.id}">
            <div class="avatar">${UI.avatarMap[c.avatar] || '👤'}</div>
            <div class="contact-item-info">
              <div class="contact-item-name">${UI.escapeHtml(c.nickname)}</div>
              <div class="contact-item-gal">${UI.formatGalNumber(c.galNumber || c.gal_number)}</div>
            </div>
            <div class="contact-item-actions">
              <button class="btn btn-secondary btn-chat">聊天</button>
              <button class="btn-delete" title="取消收藏" data-action="unstar-contact" data-id="${c.id}">✕</button>
            </div>
          </div>
        `).join('');
        html += '</div>';
      }
    } catch (error) {
      console.error('加载收藏联系人失败:', error);
    }
    
    // 加载收藏的消息
    try {
      const collections = JSON.parse(localStorage.getItem('nova_collections') || '[]');
      if (collections.length > 0) {
        html += '<div><h3 style="color:var(--text-muted);margin-bottom:8px">⭐ 收藏的消息</h3>';
        html += collections.map((item, idx) => `
          <div class="starred-msg-item" style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <div style="color:var(--text-secondary);font-size:12px;margin-bottom:4px">来自: ${UI.escapeHtml(item.from)} · ${item.time}</div>
              <div style="word-break:break-all">${UI.escapeHtml(item.content)}</div>
            </div>
            <button class="btn-delete" title="删除" data-action="del-collection" data-idx="${idx}" style="margin-left:8px;flex-shrink:0">✕</button>
          </div>
        `).join('');
        html += '</div>';
      }
    } catch(e) {}
    
    if (html === '') {
      html = '<div class="empty-state"><p>暂无收藏</p><p>长按消息可收藏，或点击联系人旁边的⭐添加收藏</p></div>';
    }
    
    container.innerHTML = html;
    
    // 绑定事件
    container.querySelectorAll('.btn-chat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-item');
        const contactId = parseInt(item.dataset.contactId);
        // 从联系人列表找
        const contact = Contacts.allContacts?.find(c => c.id === contactId);
        if (contact) Chat.createPrivateChat(contactId, contact);
      });
    });
    
    // 取消收藏联系人
    container.querySelectorAll('[data-action="unstar-contact"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const contactId = parseInt(btn.dataset.id);
        fetch('/api/contacts/' + contactId + '/star', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isStarred: false })
        }).then(() => {
          UI.showToast('已取消收藏');
          this.loadStarredContacts();
        });
      });
    });
    
    // 删除收藏的消息
    container.querySelectorAll('[data-action="del-collection"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        let collections = JSON.parse(localStorage.getItem('nova_collections') || '[]');
        if (idx >= 0 && idx < collections.length) {
          collections.splice(idx, 1);
          localStorage.setItem('nova_collections', JSON.stringify(collections));
          UI.showToast('已删除收藏');
          this.loadStarredContacts();
        }
      });
    });
  },
  
  /**
   * 清除缓存
   */
  clearCache() {
    UI.showConfirm('清除缓存', '确定要清除本地缓存数据吗？包括聊天缓存、收藏和设置偏好。', () => {
      const keepKeys = ['nova_user', 'nova_token', 'nova_private_key'];
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('nova_') || key.startsWith('security_')) && !keepKeys.includes(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      if (typeof Chat !== 'undefined') {
        Chat.chatMessages = {};
        Chat.unreadCounts = {};
        Chat.pinnedChats = [];
      }
      UI.showToast(`已清除 ${keysToRemove.length} 项缓存 🗑️`);
    });
  },
  
  /**
   * 关于Nova-OS
   */
  showAbout() {
    document.getElementById('about-modal').classList.remove('hidden');
  },
  
  showChangePassword() {
    UI.showModal('修改密码', `
      <div class="form-group">
        <label>旧密码</label>
        <input type="password" id="old-password" placeholder="输入当前密码">
      </div>
      <div class="form-group">
        <label>新密码</label>
        <input type="password" id="new-password" placeholder="至少6位" minlength="6">
      </div>
      <div class="form-group">
        <label>确认新密码</label>
        <input type="password" id="confirm-new-password" placeholder="再输一次">
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '修改', class: 'btn-primary', closeOnClick: false, onClick: () => MenuFunctions.submitChangePassword() }
    ]);
  },
  
  async submitChangePassword() {
    const oldPwd = document.getElementById('old-password')?.value;
    const newPwd = document.getElementById('new-password')?.value;
    const confirmPwd = document.getElementById('confirm-new-password')?.value;
    if (!oldPwd || !newPwd || !confirmPwd) { UI.showToast('请填写所有字段'); return; }
    if (newPwd.length < 6) { UI.showToast('新密码至少6位'); return; }
    if (newPwd !== confirmPwd) { UI.showToast('两次密码不一致'); return; }
    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Auth.getCurrentUserId(), oldPassword: oldPwd, newPassword: newPwd })
      });
      const data = await response.json();
      if (data.success) { UI.showToast('密码修改成功 ✅'); UI.closeModal(); }
      else { UI.showToast(data.error || '密码修改失败'); }
    } catch (e) { UI.showToast('修改失败，请重试'); }
  }
};

// 绑定菜单事件
document.addEventListener('DOMContentLoaded', () => {
  // 修改密码
  const changePwdBtn = document.getElementById('menu-change-password');
  if (changePwdBtn) {
    changePwdBtn.addEventListener('click', (e) => {
      e.preventDefault();
      MenuFunctions.showChangePassword();
    });
  }
  
  // 星币钱包
  const menuWallet = document.getElementById('menu-wallet');
  if (menuWallet) {
    menuWallet.addEventListener('click', (e) => {
      e.preventDefault();
      MenuFunctions.showWallet();
    });
  }
  
  // 我的收藏
  const menuStarred = document.getElementById('menu-starred');
  if (menuStarred) {
    menuStarred.addEventListener('click', (e) => {
      e.preventDefault();
      MenuFunctions.showStarred();
    });
  }
  
  // 收藏页面返回按钮
  const starredBack = document.getElementById('btn-starred-back');
  if (starredBack) {
    starredBack.addEventListener('click', () => {
      UI.showPage('profile');
      if (window.AppState) AppState.inStarred = false;
      history.back();
    });
  }
  
  
  // 清除缓存
  const menuClearCache = document.getElementById('menu-clear-cache');
  if (menuClearCache) {
    menuClearCache.addEventListener('click', (e) => {
      e.preventDefault();
      MenuFunctions.clearCache();
    });
  }
  
  // 关于
  const menuAbout = document.getElementById('menu-about');
  if (menuAbout) {
    menuAbout.addEventListener('click', (e) => {
      e.preventDefault();
      MenuFunctions.showAbout();
    });
  }
  
  
  // 关于弹窗关闭
  const aboutClose = document.getElementById('btn-close-about');
  if (aboutClose) {
    aboutClose.addEventListener('click', () => {
      document.getElementById('about-modal').classList.add('hidden');
    });
  }
});

// ==================== 超级商业群组功能 ====================
const GroupSettings = {
  currentChatId: null,
  currentChat: null,
  
  /**
   * 显示群组设置
   */
  async show(chatId) {
    this.currentChatId = chatId;
    UI.showPage('group-settings');
    
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      const data = await response.json();
      
      if (data.success) {
        this.currentChat = data.chat;
        this.currentChat._members = data.members;
        this.render(data.chat, data.members);
      }
    } catch (error) {
      console.error('加载群组设置失败:', error);
      UI.showToast('加载失败');
    }
  },
  
  /**
   * 渲染群组设置
   */
  render(chat, members) {
    document.getElementById('group-settings-title').textContent = chat.name || '群组设置';
    document.getElementById('group-name-edit').value = chat.name || '';
    document.getElementById('group-desc-edit').value = chat.description || '';
    document.getElementById('group-announcement').value = chat.announcement || '';
    document.getElementById('member-count').textContent = members.length;
    
    // 设置当前模式
    const modeSection = document.querySelector('.group-mode-section');
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('selected');
      if (btn.dataset.mode === (chat.groupMode || 'open')) {
        btn.classList.add('selected');
      }
    });
    // AI公司群组隐藏模式切换（模式固定）
    if (modeSection) {
      if (chat.groupMode === 'ai_company') {
        modeSection.style.display = 'none';
      } else {
        modeSection.style.display = '';
      }
    }
    
    // 渲染成员列表
    this.renderMembers(members);
    
    // 显示邀请码
    if (chat.inviteCode) {
      document.getElementById('invite-code-section').classList.remove('hidden');
      document.getElementById('invite-code-display').textContent = chat.inviteCode;
    } else {
      document.getElementById('invite-code-section').classList.add('hidden');
    }
    
    // AI公司专属按钮
    const aiActions = document.getElementById('ai-company-actions');
    if (aiActions) {
      if (chat.groupMode === 'ai_company') {
        aiActions.classList.remove('hidden');
      } else {
        aiActions.classList.add('hidden');
      }
    }
    
    // 群公告预览
    this.updateAnnouncementPreview(chat.announcement);
  },
  
  /**
   * 更新群公告预览
   */
  updateAnnouncementPreview(announcement) {
    let previewEl = document.getElementById('announcement-preview');
    if (!previewEl && announcement) {
      previewEl = document.createElement('div');
      previewEl.id = 'announcement-preview';
      previewEl.className = 'group-announcement-preview';
      const settingsContent = document.querySelector('.group-settings-content');
      if (settingsContent) {
        const announcementSection = document.querySelector('.group-announcement-section');
        if (announcementSection) {
          settingsContent.insertBefore(previewEl, announcementSection.nextSibling);
        }
      }
    }
    if (previewEl) {
      if (announcement) {
        previewEl.innerHTML = `<div class="announcement-label">📌 群公告</div><div class="announcement-content">${UI.escapeHtml(announcement)}</div>`;
        previewEl.classList.remove('hidden');
      } else {
        previewEl.classList.add('hidden');
      }
    }
  },
  
  /**
   * 渲染成员列表
   */
  renderMembers(members) {
    const container = document.getElementById('members-list');
    const currentUserId = Auth.getCurrentUserId();
    const currentMember = members.find(m => m.id === currentUserId);
    const isAdmin = currentMember && ['owner', 'admin'].includes(currentMember.role);
    
    container.innerHTML = members.map(m => `
      <div class="member-item" data-user-id="${m.id}">
        <div class="avatar">${UI.avatarMap[m.avatar] || '👤'}</div>
        <div class="member-info">
          <div class="member-name">${UI.escapeHtml(m.nickname)} ${m.id === currentUserId ? '(我)' : ''}</div>
          <div class="member-role">${this.getRoleLabel(m.role)}${m.is_muted ? ' 🔇' : ''}</div>
        </div>
        ${isAdmin && m.id !== currentUserId ? `
          <div class="member-actions">
            <select class="role-select" data-user-id="${m.id}">
              <option value="member" ${m.role === 'member' ? 'selected' : ''}>普通成员</option>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>管理员</option>
            </select>
            <button class="btn btn-danger btn-sm btn-remove-member" data-user-id="${m.id}">移除</button>
          </div>
        ` : ''}
      </div>
    `).join('');
    
    // 绑定事件
    container.querySelectorAll('.role-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const userId = parseInt(e.target.dataset.userId);
        const role = e.target.value;
        await this.updateMemberRole(userId, role);
      });
    });
    
    container.querySelectorAll('.btn-remove-member').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = parseInt(e.target.dataset.userId);
        await this.removeMember(userId);
      });
    });
  },
  
  /**
   * 获取角色标签
   */
  getRoleLabel(role) {
    const labels = { owner: '👑 群主', admin: '⚡ 管理员', member: '成员' };
    return labels[role] || '成员';
  },
  
  /**
   * 更新成员角色
   */
  async updateMemberRole(userId, role) {
    try {
      const response = await fetch(`/api/chats/${this.currentChatId}/members/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Auth.getCurrentUserId(), role })
      });
      const data = await response.json();
      if (data.success) {
        UI.showToast('角色已更新');
      } else {
        UI.showToast(data.error || '更新失败');
        this.show(this.currentChatId); // 刷新
      }
    } catch (error) {
      console.error('更新角色失败:', error);
      UI.showToast('更新失败');
    }
  },
  
  /**
   * 移除成员
   */
  async removeMember(userId) {
    UI.showConfirm('移除成员', '确定要移除该成员吗？', async () => {
      try {
        const response = await fetch(`/api/chats/${this.currentChatId}/members/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Auth.getCurrentUserId() })
        });
        const data = await response.json();
        if (data.success) {
          UI.showToast('成员已移除');
          this.show(this.currentChatId);
        } else {
          UI.showToast(data.error || '移除失败');
        }
      } catch (error) {
        console.error('移除成员失败:', error);
        UI.showToast('移除失败');
      }
    });
  },
  
  /**
   * 保存设置
   */
  async save() {
    const name = document.getElementById('group-name-edit').value.trim();
    const description = document.getElementById('group-desc-edit').value.trim();
    const announcement = document.getElementById('group-announcement').value.trim();
    const selectedMode = document.querySelector('.mode-btn.selected');
    const mode = selectedMode ? selectedMode.dataset.mode : 'open';
    
    try {
      const response = await fetch(`/api/chats/${this.currentChatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          name,
          description,
          announcement,
          mode
        })
      });
      const data = await response.json();
      if (data.success) {
        UI.showToast('设置已保存');
        UI.showPage('chats');
        Chat.loadChatList();
      } else {
        UI.showToast(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      UI.showToast('保存失败');
    }
  },
  
  /**
   * 生成邀请码
   */
  async generateInviteCode() {
    try {
      const response = await fetch(`/api/chats/${this.currentChatId}/invite-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Auth.getCurrentUserId() })
      });
      const data = await response.json();
      if (data.success) {
        document.getElementById('invite-code-section').classList.remove('hidden');
        document.getElementById('invite-code-display').textContent = data.inviteCode;
        UI.showToast('邀请码已生成');
      } else {
        UI.showToast(data.error || '生成失败');
      }
    } catch (error) {
      console.error('生成邀请码失败:', error);
      UI.showToast('生成失败');
    }
  },
  
  /**
   * 切换群模式（调用API）
   */
  async switchMode(mode) {
    try {
      const response = await fetch(`/api/chats/${this.currentChatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          mode: mode
        })
      });
      const data = await response.json();
      if (data.success) {
        this.currentChat.groupMode = mode;
        UI.showToast(`群模式已切换为${this.getModeName(mode)}`);
        // 通知聊天窗口更新状态
        if (Chat.currentChat && Chat.currentChat.id === this.currentChatId) {
          Chat.updateGroupMode(mode);
        }
      } else {
        UI.showToast(data.error || '切换失败');
        // 恢复按钮状态
        document.querySelectorAll('.mode-btn').forEach(btn => {
          btn.classList.remove('selected');
          if (btn.dataset.mode === this.currentChat.groupMode) {
            btn.classList.add('selected');
          }
        });
      }
    } catch (error) {
      console.error('切换模式失败:', error);
      UI.showToast('切换失败');
    }
  },
  
  /**
   * 获取模式名称
   */
  getModeName(mode) {
    const names = { open: '开放群', meeting: '会议群', quiet: '防互扰群', ai_company: 'AI公司' };
    return names[mode] || mode;
  },
  
  /**
   * 保存群组设置
   */
  async save() {
    if (!this.currentChatId) return;
    const name = document.getElementById('group-name-edit')?.value?.trim();
    const description = document.getElementById('group-desc-edit')?.value?.trim();
    const announcement = document.getElementById('group-announcement')?.value?.trim();
    
    const updates = { userId: Auth.getCurrentUserId() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (announcement !== undefined) updates.announcement = announcement;
    
    try {
      const response = await fetch(`/api/chats/${this.currentChatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (data.success) {
        UI.showToast('设置已保存');
        this.show(this.currentChatId); // 刷新
      } else {
        UI.showToast(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      UI.showToast('保存失败');
    }
  }
};

// 绑定群组设置事件
document.addEventListener('DOMContentLoaded', () => {
  const groupBack = document.getElementById('btn-group-back');
  if (groupBack) {
    groupBack.addEventListener('click', () => {
      UI.showPage('chats');
      if (window.AppState) AppState.inGroupSettings = false;
      history.back();
    });
  }
  
  const saveBtn = document.getElementById('btn-save-group-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => GroupSettings.save());
  }
  
  const inviteBtn = document.getElementById('btn-generate-invite');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', () => GroupSettings.generateInviteCode());
  }
  
  // 邀请联系人入群
  const inviteContactsBtn = document.getElementById('btn-invite-contacts-gs');
  if (inviteContactsBtn) {
    inviteContactsBtn.addEventListener('click', () => {
      if (Chat && Chat.currentChat) {
        Chat.showInviteMembersModal(GroupSettings.currentChat ? (GroupSettings.currentChat._members || []) : []);
      }
    });
  }
  
  // 模式选择 - 点击后调用API切换
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newMode = btn.dataset.mode;
      if (GroupSettings.currentChat && GroupSettings.currentChat.groupMode === newMode) {
        return; // 相同模式不处理
      }
      
      // 高亮显示
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      // 调用API切换模式
      await GroupSettings.switchMode(newMode);
    });
  });
});

// ==================== 创建超级商业群组 ====================
const SuperGroup = {
  /**
   * 显示创建群组弹窗
   */
  showCreateModal() {
    document.getElementById('super-group-modal').classList.remove('hidden');
  },
  
  /**
   * 关闭创建群组弹窗
   */
  closeModal() {
    document.getElementById('super-group-modal').classList.add('hidden');
    document.getElementById('super-group-name').value = '';
    document.querySelectorAll('input[name="super-group-mode"]').forEach(r => r.checked = false);
  },
  
  /**
   * 创建超级商业群组
   */
  async create() {
    const name = document.getElementById('super-group-name').value.trim();
    const selectedMode = document.querySelector('input[name="super-group-mode"]:checked');
    const mode = selectedMode ? selectedMode.value : 'open';
    
    if (!name) {
      UI.showToast('请输入群组名称');
      return;
    }
    
    try {
      UI.showToast('正在创建群组...');
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          name: name,
          userId: Auth.getCurrentUserId(),
          memberIds: []
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 更新群组模式
        await fetch(`/api/chats/${data.chat.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: Auth.getCurrentUserId(),
            mode: mode
          })
        });
        
        this.closeModal();
        UI.showToast('超级商业群组创建成功！');
        
        // 刷新列表并打开群聊
        Chat.loadChatList();
        setTimeout(() => {
          Chat.openChat(data.chat.id);
        }, 500);
      } else {
        UI.showToast(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建超级商业群组失败:', error);
      UI.showToast('创建失败');
    }
  },
  
  /**
   * 显示通过邀请码加入群组
   */
  showJoinByCode() {
    UI.showModal('加入群组', `
      <div class="form-group">
        <label>输入邀请码</label>
        <input type="text" id="join-group-code" placeholder="输入8位邀请码" maxlength="8" style="text-transform:uppercase;">
      </div>
      <p id="join-code-hint" style="color:var(--text-muted);font-size:12px;margin-top:4px;"></p>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '加入', class: 'btn-primary', closeOnClick: false, onClick: async () => {
        const code = document.getElementById('join-group-code').value.trim().toUpperCase();
        const hint = document.getElementById('join-code-hint');
        
        if (!code || code.length < 6) {
          hint.style.color = '#ff4444';
          hint.textContent = '请输入有效的邀请码';
          return;
        }
        
        hint.style.color = 'var(--text-muted)';
        hint.textContent = '正在加入群组...';
        
        try {
          const response = await fetch('/api/chats/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: Auth.getCurrentUserId(),
              inviteCode: code
            })
          });
          
          const data = await response.json();
          
          if (data.success) {
            UI.showToast('加入群组成功！');
            UI.closeModal();
            Chat.loadChatList();
            setTimeout(() => {
              Chat.openChat(data.chatId);
            }, 500);
          } else {
            hint.style.color = '#ff4444';
            hint.textContent = data.error || '加入失败';
          }
        } catch (error) {
          console.error('加入群组失败:', error);
          hint.style.color = '#ff4444';
          hint.textContent = '网络错误，请重试';
        }
      }}
    ]);
  }
};

// 绑定超级商业群组事件
document.addEventListener('DOMContentLoaded', () => {
  // 创建群组按钮
  const createGroupBtn = document.getElementById('btn-create-super-group');
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', () => {
      document.getElementById('super-group-modal').classList.remove('hidden');
    });
  }
  
  // 关闭弹窗
  const closeBtn = document.getElementById('btn-close-super-group');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      SuperGroup.closeModal();
    });
  }
  
  // 确认创建
  const confirmBtn = document.getElementById('btn-confirm-super-group');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => SuperGroup.create());
  }
  
  // 加入群组按钮
  const joinBtn = document.getElementById('btn-join-group');
  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      SuperGroup.showJoinByCode();
    });
  }
});

// ==================== AI公司群组功能 ====================
const AICompany = {
  currentChatId: null,
  companyPersonas: null, // 缓存公司岗位列表
  
  // 岗位头像映射
  roleAvatars: {
    'AI-CEO000005': '👔',
    'AI-CFO000006': '💰',
    'AI-COO000007': '💼',
    'AI-CMO000008': '📊',
    'AI-CTO000009': '💻',
    'AI-LAW000010': '⚖️',
    'AI-AUD000011': '🔍',
    'AI-CRE000012': '🎨',
    'AI-MED000013': '🎬',
    'AI-SRV000014': '🎧'
  },
  
  /**
   * 从API加载公司岗位列表并渲染
   */
  async loadCompanyRoles() {
    if (this.companyPersonas) return; // 已缓存不重复加载
    try {
      const response = await fetch('/api/ai/company-personas');
      const data = await response.json();
      if (data.success) {
        this.companyPersonas = data.personas;
        this.renderCompanyRoles();
      }
    } catch (e) {
      console.error('加载公司岗位失败:', e);
    }
  },
  
  /**
   * 渲染公司岗位选择网格
   */
  renderCompanyRoles() {
    const grid = document.getElementById('company-roles-grid');
    if (!grid || !this.companyPersonas) return;
    
    grid.innerHTML = this.companyPersonas.map(p => {
      const icon = this.roleAvatars[p.galNumber] || '🤖';
      return `
        <label class="ai-role-option checked">
          <input type="checkbox" name="ai-role" value="${p.galNumber}" checked>
          <div class="ai-role-card">
            <span class="ai-role-icon">${icon}</span>
            <span class="ai-role-name">${UI.escapeHtml(p.name)}</span>
          </div>
        </label>
      `;
    }).join('');
    
    // 绑定点击事件同步checked样式
    grid.querySelectorAll('.ai-role-option').forEach(label => {
      label.addEventListener('click', () => {
        const checkbox = label.querySelector('input[name="ai-role"]');
        if (checkbox) {
          requestAnimationFrame(() => {
            label.classList.toggle('checked', checkbox.checked);
          });
        }
      });
    });
  },
  
  /**
   * 显示创建AI公司弹窗
   */
  async showCreateModal() {
    await this.loadCompanyRoles(); // 确保岗位已加载
    document.getElementById('ai-company-modal').classList.remove('hidden');
    // 重置表单
    document.getElementById('ai-company-name').value = '';
    document.getElementById('ai-company-industry').value = '科技';
    // 同步复选框和标签的选中状态（默认全选）
    document.querySelectorAll('input[name="ai-role"]').forEach(cb => {
      cb.checked = true;
      const label = cb.closest('.ai-role-option');
      if (label) label.classList.add('checked');
    });
  },
  
  /**
   * 关闭创建AI公司弹窗
   */
  closeCreateModal() {
    document.getElementById('ai-company-modal').classList.add('hidden');
  },
  
  /**
   * 创建AI公司
   */
  async create() {
    const name = document.getElementById('ai-company-name').value.trim();
    const industry = document.getElementById('ai-company-industry').value;
    const selectedRoles = Array.from(document.querySelectorAll('input[name="ai-role"]:checked'))
      .map(cb => cb.value);
    
    if (!name) {
      UI.showToast('请输入公司名称');
      return;
    }
    
    if (selectedRoles.length === 0) {
      UI.showToast('请至少选择1个AI岗位');
      return;
    }
    
    // 防重复点击
    const confirmBtn = document.getElementById('btn-confirm-ai-company');
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    
    try {
      UI.showToast('正在创建AI公司...');
      const response = await fetch('/api/ai-company/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          companyName: name,
          industry,
          selectedRoles
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.isExisting) {
          UI.showToast('该公司已存在');
        } else {
          UI.showToast('AI公司创建成功！');
        }
        this.closeCreateModal();
        
        // 保存群组信息供会议使用
        try {
          localStorage.setItem(`ai_company_${data.chatId}`, JSON.stringify({
            name: data.chatName,
            industry: industry,
            roles: selectedRoles
          }));
        } catch(e) {}
        
        // 加入群组并刷新聊天列表
        try {
          await Chat.joinChat(data.chatId);
        } catch(e) { console.error('joinChat error:', e); }
        
        try {
          await Chat.loadChatList();
        } catch(e) { console.error('loadChatList error:', e); }
        
        setTimeout(() => {
          try { Chat.openChat(data.chatId); } catch(e) {}
        }, 500);
      } else {
        UI.showToast(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建AI公司失败:', error);
      UI.showToast('创建失败');
    } finally {
      confirmBtn.disabled = false;
    }
  },
  
  /**
   * 显示AI会议
   */
  showMeeting(chatId) {
    this.currentChatId = chatId;
    document.getElementById('ai-meeting-modal').classList.remove('hidden');
    document.getElementById('meeting-content').innerHTML = `
      <div class="meeting-header">
        <div class="meeting-icon">📋</div>
        <h3>AI公司会议系统</h3>
      </div>
      <p class="meeting-hint">点击下方按钮，召开AI公司会议</p>
      <p class="meeting-subhint">会议将自动安排各部门AI汇报工作</p>
      <div class="meeting-agenda-preview">
        <div class="agenda-item"><span class="agenda-num">1</span>总经理开场致辞</div>
        <div class="agenda-item"><span class="agenda-num">2</span>各部门工作汇报</div>
        <div class="agenda-item"><span class="agenda-num">3</span>监督官总结点评</div>
        <div class="agenda-item"><span class="agenda-num">4</span>总经理总结部署</div>
      </div>
    `;
    
    // 重置会议按钮状态
    document.getElementById('btn-start-meeting').textContent = '📢 召开会议';
    document.getElementById('btn-start-meeting').disabled = false;
  },
  
  /**
   * 关闭AI会议弹窗
   */
  closeMeeting() {
    document.getElementById('ai-meeting-modal').classList.add('hidden');
  },
  
  /**
   * 召开会议
   */
  async startMeeting() {
    const content = document.getElementById('meeting-content');
    content.innerHTML = '<div class="meeting-loading"><div class="loading-spinner"></div><p>正在召开会议...</p></div>';
    
    try {
      const response = await fetch(`/api/ai-company/${this.currentChatId}/meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Auth.getCurrentUserId(),
          agenda: '公司例会'
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 显示会议内容
        let html = '<div class="meeting-header"><h3>📋 会议记录</h3></div>';
        html += '<div class="meeting-messages">';
        for (const msg of data.content) {
          const avatar = this.getRoleAvatar(msg.galNumber);
          html += `
            <div class="meeting-message">
              <div class="meeting-avatar">${avatar}</div>
              <div class="meeting-bubble">
                <div class="meeting-sender">${UI.escapeHtml(msg.sender)}</div>
                <div class="meeting-text">${UI.escapeHtml(msg.content)}</div>
              </div>
            </div>
          `;
        }
        html += '</div>';
        content.innerHTML = html;
        
        // 将会议内容发送到群聊
        for (const msg of data.content) {
          try {
            await fetch('/api/chats/' + this.currentChatId + '/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() },
              body: JSON.stringify({
                chatId: this.currentChatId,
                senderId: Auth.getCurrentUserId(),
                encryptedContent: JSON.stringify({ plain: true, content: `【${msg.sender}】${msg.content}` }),
                type: 'normal',
                burnAfter: 0,
                isAnonymous: false
              })
            });
          } catch(e) { console.error('发送会议消息失败:', e); }
        }
        
        document.getElementById('btn-start-meeting').textContent = '✅ 会议已召开';
        document.getElementById('btn-start-meeting').disabled = true;
        
        // 会议完成后刷新聊天消息
        setTimeout(() => {
          if (Chat.currentChat && Chat.currentChat.id === this.currentChatId) {
            Chat.loadMessages(this.currentChatId);
          }
        }, 1000);
      } else {
        content.innerHTML = `<p class="meeting-error">❌ 会议召开失败: ${data.error}</p>`;
      }
    } catch (error) {
      console.error('召开会议失败:', error);
      content.innerHTML = '<p class="meeting-error">❌ 会议召开失败</p>';
    }
  },
  
  /**
   * 获取岗位头像
   */
  getRoleAvatar(galNumber) {
    const avatars = {
      'AI-CEO000005': '👔',
      'AI-CFO000006': '💰',
      'AI-COO000007': '💼',
      'AI-CMO000008': '📊',
      'AI-CTO000009': '💻',
      'AI-LAW000010': '⚖️',
      'AI-AUD000011': '🔍',
      'AI-CRE000012': '🎨',
      'AI-MED000013': '🎬',
      'AI-SRV000014': '🎧'
    };
    return avatars[galNumber] || '🤖';
  }
};

// 绑定AI公司事件
document.addEventListener('DOMContentLoaded', () => {
  // 创建AI公司按钮
  const createBtn = document.getElementById('btn-create-ai-company');
  if (createBtn) {
    createBtn.addEventListener('click', () => AICompany.showCreateModal());
  }
  
  const closeBtn = document.getElementById('btn-close-ai-company');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => AICompany.closeCreateModal());
  }
  
  const confirmBtn = document.getElementById('btn-confirm-ai-company');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => AICompany.create());
  }
  
  const closeMeetingBtn = document.getElementById('btn-close-meeting');
  if (closeMeetingBtn) {
    closeMeetingBtn.addEventListener('click', () => AICompany.closeMeeting());
  }
  
  const startMeetingBtn = document.getElementById('btn-start-meeting');
  if (startMeetingBtn) {
    startMeetingBtn.addEventListener('click', () => AICompany.startMeeting());
  }
  
  // AI岗位选项点击时同步label的checked类
  document.querySelectorAll('.ai-role-option').forEach(label => {
    label.addEventListener('click', () => {
      const checkbox = label.querySelector('input[name="ai-role"]');
      if (checkbox) {
        // 延迟一帧等待checkbox状态更新
        requestAnimationFrame(() => {
          if (checkbox.checked) {
            label.classList.add('checked');
          } else {
            label.classList.remove('checked');
          }
        });
      }
    });
  });
});

// 收藏消息功能
const Collection = {
  add(content, from) {
    let collections = JSON.parse(localStorage.getItem('nova_collections') || '[]');
    collections.unshift({
      content,
      from,
      time: new Date().toLocaleString('zh-CN')
    });
    
    // 最多保存100条
    if (collections.length > 100) {
      collections = collections.slice(0, 100);
    }
    
    localStorage.setItem('nova_collections', JSON.stringify(collections));
    UI.showToast('已添加到收藏 ⭐');
  }
};

// 导出新增模块
window.MenuFunctions = MenuFunctions;
window.GroupSettings = GroupSettings;
window.SuperGroup = SuperGroup;
window.AICompany = AICompany;
window.Collection = Collection;

// ==================== 全局状态管理 & 浏览器返回键处理 ====================
const AppState = {
  inChat: false,
  inChatInfo: false,
  inSecurity: false,
  inStarred: false,
  inGroupSettings: false,
  inAIChat: false,
  lastBackTime: 0,
  
  init() {
    window.addEventListener('popstate', (e) => this.handlePopState(e));
    history.replaceState({ page: 'main' }, '');
  },
  
  handlePopState(e) {
    // 如果在聊天信息页，关闭信息页
    if (this.inChatInfo) {
      this.inChatInfo = false;
      const panel = document.getElementById('chat-info-panel');
      if (panel) panel.classList.add('hidden');
      return;
    }
    
    // 如果在聊天中，关闭聊天
    if (this.inChat) {
      if (typeof Chat !== 'undefined' && Chat.closeChat) {
        Chat.closeChat();
      }
      return;
    }
    
    // 如果在AI聊天中，关闭AI聊天
    if (this.inAIChat) {
      this.inAIChat = false;
      if (typeof AIChat !== 'undefined' && AIChat.closeChat) {
        AIChat.closeChat();
      }
      return;
    }
    
    // 如果在群组设置页，返回聊天列表
    if (this.inGroupSettings) {
      this.inGroupSettings = false;
      UI.showPage('chats');
      return;
    }
    
    // 如果在收藏页，返回个人资料
    if (this.inStarred) {
      this.inStarred = false;
      UI.showPage('profile');
      return;
    }
    
    // 如果在安全设置页，返回个人资料
    if (this.inSecurity) {
      this.inSecurity = false;
      UI.showPage('profile');
      return;
    }
    
    // 如果弹窗开着，关闭弹窗
    const modals = ['modal', 'about-modal', 'super-group-modal', 'ai-company-modal', 'ai-meeting-modal', 'add-contact-modal'];
    for (const id of modals) {
      const m = document.getElementById(id);
      if (m && !m.classList.contains('hidden')) {
        m.classList.add('hidden');
        return;
      }
    }
    
    // 默认：双击退出提示
    const now = Date.now();
    if (now - this.lastBackTime < 2000) {
      // 双击退出 - 实际不做任何事，保持在app内
    } else {
      UI.showToast('再按一次退出', 2000);
    }
    this.lastBackTime = now;
    history.pushState({ page: 'main' }, '');
  },
  
  enterChat() {
    this.inChat = true;
    this.inChatInfo = false;
    history.pushState({ page: 'chat' }, '');
  },
  
  enterSecurity() {
    this.inSecurity = true;
    history.pushState({ page: 'security' }, '');
  },
  
  enterStarred() {
    this.inStarred = true;
    history.pushState({ page: 'starred' }, '');
  },
  
  enterGroupSettings() {
    this.inGroupSettings = true;
    history.pushState({ page: 'group-settings' }, '');
  },
  
  enterAIChat() {
    this.inAIChat = true;
    history.pushState({ page: 'ai-chat' }, '');
  }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
});

window.AppState = AppState;

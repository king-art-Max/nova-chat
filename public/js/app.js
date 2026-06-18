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
  socket = io({
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => {
    console.log('🔌 Socket已连接');
    
    // 用户上线
    if (Auth.isLoggedIn()) {
      socket.emit('user-online', Auth.getCurrentUserId());
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
    
    // 初始化Socket
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
      });
    }
    
    // 安全设置返回按钮
    const securityBack = document.getElementById('btn-security-back');
    if (securityBack) {
      securityBack.addEventListener('click', () => {
        UI.backToProfile();
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
    
    // 安全设置开关状态保存
    document.querySelectorAll('.sc-toggle input').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const card = e.target.closest('.security-card');
        const module = card?.dataset.module;
        if (module) {
          localStorage.setItem(`security_${module}`, e.target.checked);
        }
      });
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
      alien: '👽'
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
    UI.showModal('设置', `
      <div class="settings-list">
        <div class="setting-item">
          <span>版本</span>
          <span class="setting-value">Nova-OS v1.0.0</span>
        </div>
        <div class="setting-item">
          <span>加密方式</span>
          <span class="setting-value">ECDH + AES-256-GCM</span>
        </div>
        <div class="setting-item">
          <span>服务器状态</span>
          <span class="setting-value" id="server-status">连接中...</span>
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
    
    const avatarOptions = ['astronaut', 'rocket', 'star', 'moon', 'alien'];
    const avatarEmojis = {
      astronaut: '👨‍🚀',
      rocket: '🚀',
      star: '⭐',
      moon: '🌙',
      alien: '👽'
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
      // 接受好友请求
      const acceptBtn = item.querySelector('.btn-accept');
      if (acceptBtn) {
        acceptBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          acceptBtn.textContent = '处理中...';
          acceptBtn.disabled = true;
          this.acceptRequest(parseInt(item.dataset.contactId));
        });
      }
      
      // 开始聊天
      const chatBtn = item.querySelector('.btn-chat');
      if (chatBtn) {
        chatBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const contact = this.contacts.find(c => c.id === parseInt(item.dataset.contactId));
          if (contact) {
            Chat.createPrivateChat(contact.id, contact);
          }
        });
      }
    });
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
    if (Wallet && Wallet.loadBalance) {
      Wallet.loadBalance();
    }
  },
  
  /**
   * 我的收藏 - 显示收藏联系人
   */
  async showStarred() {
    UI.showPage('starred');
    await this.loadStarredContacts();
  },
  
  /**
   * 加载收藏联系人
   */
  async loadStarredContacts() {
    const container = document.getElementById('starred-list');
    try {
      const response = await fetch(`/api/contacts/starred?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success && data.contacts.length > 0) {
        container.innerHTML = data.contacts.map(c => `
          <div class="contact-item" data-contact-id="${c.id}">
            <div class="avatar">${UI.avatarMap[c.avatar] || '👤'}</div>
            <div class="contact-item-info">
              <div class="contact-item-name">${UI.escapeHtml(c.nickname)}</div>
              <div class="contact-item-gal">${UI.formatGalNumber(c.gal_number)}</div>
            </div>
            <div class="contact-item-actions">
              <button class="btn btn-secondary btn-chat">聊天</button>
            </div>
          </div>
        `).join('');
        
        // 绑定聊天按钮
        container.querySelectorAll('.btn-chat').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const item = e.target.closest('.contact-item');
            const contactId = parseInt(item.dataset.contactId);
            const contact = data.contacts.find(c => c.id === contactId);
            if (contact) {
              Chat.createPrivateChat(contactId, contact);
            }
          });
        });
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <p>暂无收藏的联系人</p>
            <p>点击联系人旁边的❤️添加收藏</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('加载收藏失败:', error);
      container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
  },
  
  /**
   * 清除缓存
   */
  clearCache() {
    UI.showConfirm('清除缓存', '确定要清除本地缓存数据吗？这不会影响服务器数据。', () => {
      // 清除localStorage中的缓存
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('cache') || key.includes('temp') || key.includes('history'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      UI.showToast(`已清除 ${keysToRemove.length} 项缓存数据`);
    });
  },
  
  /**
   * 关于Nova-OS
   */
  showAbout() {
    document.getElementById('about-modal').classList.remove('hidden');
  }
};

// 绑定菜单事件
document.addEventListener('DOMContentLoaded', () => {
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
  
  // 收藏页面返回
  const starredBack = document.getElementById('btn-starred-back');
  if (starredBack) {
    starredBack.addEventListener('click', () => {
      UI.showPage('profile');
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

// ==================== 群组设置功能 ====================
const GroupSettings = {
  currentChatId: null,
  
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
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('selected');
      if (btn.dataset.mode === (chat.group_mode || 'open')) {
        btn.classList.add('selected');
      }
    });
    
    // 渲染成员列表
    this.renderMembers(members);
    
    // 显示邀请码
    if (chat.invite_code) {
      document.getElementById('invite-code-section').classList.remove('hidden');
      document.getElementById('invite-code-display').textContent = chat.invite_code;
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
          <div class="member-role">${this.getRoleLabel(m.role)}</div>
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
  }
};

// 绑定群组设置事件
document.addEventListener('DOMContentLoaded', () => {
  const groupBack = document.getElementById('btn-group-back');
  if (groupBack) {
    groupBack.addEventListener('click', () => {
      UI.showPage('chats');
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
  
  // 模式选择
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
});

// ==================== AI公司功能 ====================
const AICompany = {
  /**
   * 显示创建AI公司弹窗
   */
  showCreateModal() {
    document.getElementById('ai-company-modal').classList.remove('hidden');
    // 重置表单
    document.getElementById('ai-company-name').value = '';
    document.getElementById('ai-company-industry').value = '科技';
    document.querySelectorAll('input[name="ai-role"]').forEach(cb => cb.checked = false);
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
        document.getElementById('ai-company-modal').classList.add('hidden');
        UI.showToast('AI公司创建成功！');
        
        // 加入群组并打开聊天
        Chat.joinChat(data.chatId);
        
        // 保存群组信息供会议使用
        localStorage.setItem(`ai_company_${data.chatId}`, JSON.stringify({
          name: data.chatName,
          roles: selectedRoles
        }));
      } else {
        UI.showToast(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建AI公司失败:', error);
      UI.showToast('创建失败');
    }
  },
  
  /**
   * 显示AI会议
   */
  showMeeting(chatId) {
    this.currentChatId = chatId;
    document.getElementById('ai-meeting-modal').classList.remove('hidden');
    document.getElementById('meeting-content').innerHTML = `
      <p class="meeting-hint">点击下方按钮，召开AI公司会议</p>
      <p class="meeting-subhint">会议将自动安排各部门AI汇报工作</p>
    `;
  },
  
  /**
   * 召开会议
   */
  async startMeeting() {
    const content = document.getElementById('meeting-content');
    content.innerHTML = '<div class="meeting-loading">正在召开会议...</div>';
    
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
        let html = '<div class="meeting-messages">';
        for (const msg of data.content) {
          html += `
            <div class="meeting-message">
              <div class="meeting-sender">${UI.escapeHtml(msg.sender)}</div>
              <div class="meeting-text">${UI.escapeHtml(msg.content)}</div>
            </div>
          `;
        }
        html += '</div>';
        content.innerHTML = html;
        
        // 将会议内容发送到群聊
        for (const msg of data.content) {
          // 查找发送者
          const member = Chat.currentChat?.members?.find(m => m.galNumber === msg.galNumber);
          if (member) {
            socket.emit('send-message', {
              chatId: this.currentChatId,
              senderId: member.id,
              encryptedContent: JSON.stringify({ plain: true, content: `【${msg.sender}】${msg.content}` }),
              type: 'normal',
              burnAfter: 0,
              isAnonymous: false
            });
          }
        }
        
        document.getElementById('btn-start-meeting').textContent = '✅ 会议已召开';
        document.getElementById('btn-start-meeting').disabled = true;
      } else {
        content.innerHTML = `<p class="meeting-error">会议召开失败: ${data.error}</p>`;
      }
    } catch (error) {
      console.error('召开会议失败:', error);
      content.innerHTML = '<p class="meeting-error">会议召开失败</p>';
    }
  }
};

// 绑定AI公司事件
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('btn-close-ai-company');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('ai-company-modal').classList.add('hidden');
    });
  }
  
  const confirmBtn = document.getElementById('btn-confirm-ai-company');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => AICompany.create());
  }
  
  const closeMeetingBtn = document.getElementById('btn-close-meeting');
  if (closeMeetingBtn) {
    closeMeetingBtn.addEventListener('click', () => {
      document.getElementById('ai-meeting-modal').classList.add('hidden');
    });
  }
  
  const startMeetingBtn = document.getElementById('btn-start-meeting');
  if (startMeetingBtn) {
    startMeetingBtn.addEventListener('click', () => AICompany.startMeeting());
  }
});

// 导出新增模块
window.MenuFunctions = MenuFunctions;
window.GroupSettings = GroupSettings;
window.AICompany = AICompany;

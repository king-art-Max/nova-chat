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
  
  // 导出socket供其他模块使用
  window.socket = socket;
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
    document.getElementById('btn-logout').addEventListener('click', () => {
      Auth.logout();
    });
    
    // 编辑资料
    document.getElementById('btn-edit-profile').addEventListener('click', () => {
      this.showEditProfile();
    });
    
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
      }
    } catch (error) {
      console.error('加载联系人失败:', error);
    }
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
        <input type="text" id="add-contact-input" placeholder="GAL90IA56MH2" style="text-transform:uppercase;">
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
          hint.textContent = '请输入正确的Gal号码，如 GAL90IA56MH2';
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

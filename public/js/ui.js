/**
 * Nova-OS UI工具模块
 * 提供界面操作、模态框、Toast等通用功能
 */

const UI = {
  // 头像emoji映射
  avatarMap: {
    astronaut: '👨‍🚀',
    rocket: '🚀',
    star: '⭐',
    moon: '🌙',
    alien: '👽',
    robot: '🤖',
    devil: '😈',
    heart: '💖',
    chart: '📊',
    anonymous: '👻'
  },
  
  /**
   * 显示/隐藏屏幕
   */
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
  },
  
  /**
   * 显示/隐藏页面
   */
  showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
      page.classList.add('hidden');
    });
    const pageEl = document.getElementById(`page-${pageId}`);
    if (pageEl) pageEl.classList.remove('hidden');
    
    // 切换到联系人页时刷新列表
    if (pageId === 'contacts' && typeof Contacts !== 'undefined') {
      Contacts.loadContacts();
    }
    
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
    
    // 更新页面标题
    const titles = {
      chats: '消息',
      contacts: '联系人',
      ai: 'AI助手',
      wallet: '钱包',
      profile: '我的',
      security: '安全设置'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'Nova-OS';
  },
  
  showSecurityPage() {
    this.showPage('security');
  },
  
  backToProfile() {
    this.showPage('profile');
  },
  
  /**
   * 获取头像HTML
   */
  getAvatar(avatarType, isOnline = false) {
    const emoji = this.avatarMap[avatarType] || '👤';
    return `<div class="avatar ${isOnline ? 'online' : ''}">${emoji}</div>`;
  },
  
  /**
   * 格式化时间戳
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 今天的消息显示时间
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    // 昨天的消息
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }
    
    // 一周内的消息
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[date.getDay()];
    }
    
    // 更早的消息显示日期
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },
  
  /**
   * 格式化完整时间
   */
  formatFullTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  /**
   * 显示Toast通知
   */
  showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  },
  
  /**
   * 显示模态框
   */
  showModal(title, bodyContent, buttons = []) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyContent;
    modalFooter.innerHTML = '';
    
    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.className = `btn ${btn.class || 'btn-secondary'}`;
      button.textContent = btn.text;
      button.onclick = () => {
        if (btn.onClick) btn.onClick();
        if (btn.closeOnClick !== false) this.closeModal();
      };
      modalFooter.appendChild(button);
    });
    
    modal.classList.remove('hidden');
    
    // 点击背景关闭
    modal.onclick = (e) => {
      if (e.target === modal) this.closeModal();
    };
  },
  
  /**
   * 关闭模态框
   */
  closeModal() {
    document.getElementById('modal').classList.add('hidden');
  },
  
  /**
   * 创建输入模态框
   */
  showInputModal(title, label, placeholder, onConfirm) {
    this.showModal(title, `
      <div class="form-group">
        <label>${label}</label>
        <input type="text" id="modal-input" placeholder="${placeholder}">
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '确定', class: 'btn-primary', onClick: () => {
        const value = document.getElementById('modal-input').value.trim();
        if (value) onConfirm(value);
      }}
    ]);
    
    // 自动聚焦输入框
    setTimeout(() => {
      document.getElementById('modal-input').focus();
    }, 100);
  },
  
  /**
   * 创建确认模态框
   */
  showConfirm(title, message, onConfirm) {
    this.showModal(title, `<p>${message}</p>`, [
      { text: '取消', class: 'btn-secondary' },
      { text: '确定', class: 'btn-primary', onClick: onConfirm }
    ]);
  },
  
  /**
   * 显示聊天窗口
   */
  showChatWindow() {
    document.getElementById('chat-window').classList.remove('hidden');
    document.getElementById('main-screen').classList.add('hidden');
  },
  
  /**
   * 隐藏聊天窗口
   */
  hideChatWindow() {
    document.getElementById('chat-window').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
  },
  
  /**
   * 显示AI聊天窗口
   */
  showAIChatWindow(aiName) {
    document.getElementById('ai-chat-name').textContent = aiName;
    document.getElementById('ai-chat-messages').innerHTML = '';
    document.getElementById('ai-chat-window').classList.remove('hidden');
    document.getElementById('main-screen').classList.add('hidden');
  },
  
  /**
   * 隐藏AI聊天窗口
   */
  hideAIChatWindow() {
    document.getElementById('ai-chat-window').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
  },
  
  /**
   * 添加消息到聊天窗口
   */
  appendMessage(containerId, message, isSent = false) {
    const container = document.getElementById(containerId);
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${message.type || ''}`;
    
    const statusIcon = this.getMessageStatusIcon(message.status);
    
    messageEl.innerHTML = `
      ${!isSent ? `
        <div class="message-header">
          <span class="message-sender">${message.nickname || '匿名'}</span>
          <span class="message-time">${this.formatFullTime(message.createdAt)}</span>
        </div>
      ` : `
        <div class="message-header">
          <span class="message-time">${this.formatFullTime(message.createdAt)}</span>
        </div>
      `}
      <div class="message-content">${this.escapeHtml(message.content)}</div>
      ${isSent ? `<div class="message-status ${message.status === 'read' ? 'read' : ''}">${statusIcon}</div>` : ''}
      ${message.ttl ? `<div class="destroy-progress" style="animation-duration: ${message.ttl}s"></div>` : ''}
    `;
    
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
    
    return messageEl;
  },
  
  /**
   * 获取消息状态图标
   */
  getMessageStatusIcon(status) {
    switch (status) {
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'read': return '✓✓';
      default: return '';
    }
  },
  
  /**
   * HTML转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * 格式化Gal号码显示
   */
  formatGalNumber(gal) {
    if (!gal) return '';
    if (gal.startsWith('Gal://')) {
      return gal;
    }
    return `Gal://${gal}`;
  },
  
  /**
   * 显示加载状态
   */
  setLoading(element, loading) {
    if (loading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = '加载中...';
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  },
  
  /**
   * 渲染聊天列表项
   */
  renderChatItem(chat, currentUserId, isPinned = false) {
    const otherMember = chat.members?.find(m => m.id !== currentUserId);
    const name = chat.type === 'group' ? chat.name : (otherMember?.nickname || '未知用户');
    const avatar = otherMember?.avatar || (chat.type === 'group' ? 'star' : 'astronaut');
    const isOnline = otherMember && onlineUsers.has(otherMember.id);
    
    // 最后一条消息预览
    let preview = chat.type === 'group' ? '群聊' : '点击开始聊天';
    if (chat.lastMessage) {
      try {
        const parsed = JSON.parse(chat.lastMessage.content);
        if (parsed.plain && parsed.content) {
          preview = parsed.content.substring(0, 30);
          if (parsed.content.length > 30) preview += '...';
        } else if (parsed.type === 'image') {
          preview = '[图片]';
        } else {
          preview = '[加密消息]';
        }
      } catch(e) {
        if (chat.lastMessage.content && !chat.lastMessage.content.includes(':')) {
          preview = chat.lastMessage.content.substring(0, 30);
        } else {
          preview = '[加密消息]';
        }
      }
    }
    
    // 未读计数
    const unreadCount = chat.unreadCount || Chat.unreadCounts?.[chat.id] || 0;
    const timeStr = chat.lastMessage?.createdAt ? this.formatTime(chat.lastMessage.createdAt) : (chat.updated_at ? this.formatTime(chat.updated_at) : '');
    
    return `
      <div class="chat-item" data-chat-id="${chat.id}">
        ${this.getAvatar(avatar, isOnline)}
        <div class="chat-item-info">
          <div class="chat-item-name">${this.escapeHtml(name)}</div>
          <div class="chat-item-preview">${this.escapeHtml(preview)}</div>
        </div>
        <div class="chat-item-meta">
          <span class="chat-item-time">${timeStr}</span>
          ${unreadCount > 0 ? `<span class="chat-item-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
        </div>
      </div>
    `;
  },
  
  /**
   * 渲染联系人列表项
   */
  renderContactItem(contact, isPending = false, isSent = false, options = {}) {
    const isOnline = onlineUsers.has(contact.id);
    const isStarred = contact.isStarred || false;
    
    // 列表项只显示头像+名字+GAL号，操作按钮移到详情页
    return `
      <div class="contact-item ${isStarred ? 'starred' : ''}" data-contact-id="${contact.id}" data-gal="${contact.galNumber}" data-starred="${isStarred}">
        ${this.getAvatar(contact.avatar || 'astronaut', isOnline)}
        
        <div class="contact-item-info">
          <div class="contact-item-name">${this.escapeHtml(contact.nickname)}</div>
          <div class="contact-item-gal">${this.formatGalNumber(contact.galNumber)}</div>
        </div>
        
        ${isPending ? `
          <div class="contact-item-actions">
            <button class="btn btn-primary btn-accept">接受</button>
          </div>
        ` : isSent ? `
          <div class="contact-item-actions">
            <span style="color:var(--text-muted);font-size:12px;">等待对方接受</span>
          </div>
        ` : `
          <div class="contact-item-arrow">›</div>
        `}
      </div>
    `;
  },
  
  /** 显示联系人详情弹窗 */
  showContactDetail(contact) {
    const isOnline = onlineUsers.has(contact.id);
    const isStarred = contact.isStarred || false;
    
    const modal = document.createElement('div');
    modal.className = 'contact-detail-overlay';
    modal.innerHTML = `
      <div class="contact-detail-sheet">
        <div class="contact-detail-handle"></div>
        <div class="contact-detail-header">
          <div class="contact-detail-avatar">${this.getAvatar(contact.avatar || 'astronaut', isOnline)}</div>
          <div class="contact-detail-name">${this.escapeHtml(contact.nickname)}</div>
          <div class="contact-detail-gal">${this.formatGalNumber(contact.galNumber)}</div>
          ${isOnline ? '<div class="contact-detail-online">在线</div>' : '<div class="contact-detail-offline">离线</div>'}
        </div>
        <div class="contact-detail-actions">
          <button class="contact-detail-btn btn-chat" data-id="${contact.id}">
            <span class="detail-btn-icon">💬</span>
            <span>发消息</span>
          </button>
          <button class="contact-detail-btn btn-star-toggle ${isStarred ? 'starred' : ''}" data-id="${contact.id}" data-starred="${isStarred}">
            <span class="detail-btn-icon">${isStarred ? '❤️' : '🤍'}</span>
            <span>${isStarred ? '取消收藏' : '收藏'}</span>
          </button>
          <button class="contact-detail-btn btn-danger btn-delete-contact" data-id="${contact.id}" data-name="${this.escapeHtml(contact.nickname)}">
            <span class="detail-btn-icon">🗑️</span>
            <span>删除联系人</span>
          </button>
        </div>
        <button class="contact-detail-close">关闭</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 动画进入
    requestAnimationFrame(() => modal.classList.add('active'));
    
    // 关闭
    const closeSheet = () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    };
    
    modal.querySelector('.contact-detail-close').onclick = closeSheet;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSheet();
    });
    
    // 发消息
    modal.querySelector('.btn-chat').onclick = () => {
      closeSheet();
      if (window.Contacts) {
        window.Contacts.checkQuietModeAndStartChat(contact.id, contact);
      }
    };
    
    // 收藏
    modal.querySelector('.btn-star-toggle').onclick = async () => {
      const btn = modal.querySelector('.btn-star-toggle');
      const wasStarred = btn.dataset.starred === 'true';
      try {
        const resp = await fetch('/api/contacts/' + contact.id + '/star', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isStarred: !wasStarred })
        });
        if (resp.ok) {
          btn.dataset.starred = (!wasStarred).toString();
          btn.querySelector('.detail-btn-icon').textContent = wasStarred ? '🤍' : '❤️';
          btn.querySelector('span:last-child').textContent = wasStarred ? '收藏' : '取消收藏';
          btn.classList.toggle('starred', !wasStarred);
          UI.showToast(wasStarred ? '已取消收藏' : '已收藏 ❤️');
          if (window.Contacts) window.Contacts.loadContacts();
        }
      } catch (e) { UI.showToast('操作失败'); }
    };
    
    // 删除
    modal.querySelector('.btn-delete-contact').onclick = () => {
      const name = modal.querySelector('.btn-delete-contact').dataset.name;
      UI.showConfirm('删除联系人', '确定要删除与"' + name + '"的好友关系吗？', async () => {
        try {
          const resp = await fetch('/api/contacts/' + contact.id, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: window.Auth ? Auth.getCurrentUserId() : null })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('联系人已删除');
            closeSheet();
            if (window.Contacts) window.Contacts.loadContacts();
          } else {
            UI.showToast(data.error || '删除失败');
          }
        } catch (e) { UI.showToast('删除失败'); }
      });
    };
  },
  
  
  /**
   * 渲染AI人格卡片
   */
  renderAIPersona(persona) {
    return `
      <div class="ai-persona" data-gal="${persona.galNumber}">
        <div class="avatar">${this.avatarMap[persona.avatar] || '🤖'}</div>
        <div class="name">${this.escapeHtml(persona.name)}</div>
        <div class="gal">${this.formatGalNumber(persona.galNumber)}</div>
      </div>
    `;
  },
  
  /**
   * 生成钱包地址（前端模拟）
   */
  generateWalletAddress() {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }
};

// 全局保存在线用户状态
let onlineUsers = new Set();

// 在线用户状态由 registerSocketEvents 统一管理（chat.js）

// 导出UI模块
window.UI = UI;
window.onlineUsers = onlineUsers;

// ==================== 图片预览功能 ====================
UI.previewImage = function(src) {
  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay';
  overlay.onclick = () => overlay.remove();
  
  const img = document.createElement('img');
  img.className = 'image-preview';
  img.src = src;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    overlay.remove();
  };
  
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
};

// ==================== 文件下载功能 ====================
UI.downloadFile = function(base64Data, fileName) {
  try {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = fileName;
    link.click();
  } catch (error) {
    console.error('下载失败:', error);
    UI.showToast('文件下载失败');
  }
};

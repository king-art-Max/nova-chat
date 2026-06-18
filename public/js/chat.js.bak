/**
 * Nova-OS 聊天模块
 * 处理私聊、群聊、消息收发
 */

// 聊天状态
const Chat = {
  currentChat: null,
  chatMessages: {}, // chatId -> messages[]
  userPublicKeys: {}, // userId -> publicKey
  typingTimers: {}, // chatId -> timer
  
  /**
   * 初始化聊天模块
   */
  init() {
    // 绑定事件
    this.bindEvents();
    
    // 加载聊天列表
    this.loadChatList();
  },
  
  /**
   * 绑定UI事件
   */
  bindEvents() {
    // 新建聊天按钮（长按弹出选项）
    const fab = document.getElementById('btn-new-chat');
    let pressTimer;
    let isLongPress = false;
    
    fab.addEventListener('mousedown', (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        this.showNewChatOptions();
      }, 500);
    });
    
    fab.addEventListener('mouseup', (e) => {
      clearTimeout(pressTimer);
      if (!isLongPress) {
        this.showNewChatModal();
      }
    });
    
    fab.addEventListener('mouseleave', () => {
      clearTimeout(pressTimer);
    });
    
    // 触摸事件
    fab.addEventListener('touchstart', (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        this.showNewChatOptions();
      }, 500);
    });
    
    fab.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
      if (!isLongPress) {
        this.showNewChatModal();
      }
    });
    
    // 返回按钮
    document.getElementById('btn-chat-back').addEventListener('click', () => {
      this.closeChat();
    });
    
    // 发送消息按钮
    document.getElementById('btn-send-message').addEventListener('click', () => {
      this.sendMessage();
    });
    
    // 输入框回车发送
    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // 输入时发送正在输入状态
    document.getElementById('message-input').addEventListener('input', () => {
      this.sendTypingStatus();
    });
    
    // 阅后即焚按钮
    document.getElementById('btn-destroy').addEventListener('click', () => {
      const btn = document.getElementById('btn-destroy');
      const timer = document.getElementById('destroy-timer');
      btn.classList.toggle('active');
      timer.classList.toggle('hidden');
    });
    
    // 匿踪消息按钮
    document.getElementById('btn-anonymous').addEventListener('click', () => {
      const btn = document.getElementById('btn-anonymous');
      btn.classList.toggle('active');
      UI.showToast(btn.classList.contains('active') ? '匿踪模式已开启' : '匿踪模式已关闭');
    });
    
    // 图片发送按钮
    const imgBtn = document.getElementById('btn-send-image');
    if (imgBtn) {
      imgBtn.addEventListener('click', () => {
        this.selectImage();
      });
    }
    
    // 图片输入变化
    const imgInput = document.getElementById('image-input');
    if (imgInput) {
      imgInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleImageSelected(e.target.files[0]);
        }
      });
    }
  },
  
  /**
   * 显示新建聊天选项（长按弹出）
   */
  showNewChatOptions() {
    UI.showModal('新建聊天', `
      <div class="new-chat-options">
        <button class="btn btn-primary" style="width:100%;margin-bottom:12px;" id="opt-new-private">
          💬 新建私聊
        </button>
        <button class="btn btn-secondary" style="width:100%;" id="opt-new-group">
          👥 新建群聊
        </button>
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' }
    ]);
    
    document.getElementById('opt-new-private').addEventListener('click', () => {
      UI.closeModal();
      this.showNewChatModal();
    });
    
    document.getElementById('opt-new-group').addEventListener('click', () => {
      UI.closeModal();
      this.showCreateGroupModal();
    });
  },
  
  /**
   * 加载聊天列表
   */
  async loadChatList() {
    if (!Auth.isLoggedIn()) return;
    
    try {
      const response = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success) {
        const chatList = document.getElementById('chat-list');
        
        if (data.chats.length === 0) {
          chatList.innerHTML = `
            <div class="empty-state">
              <p>还没有聊天记录</p>
              <p>开始新的对话吧！</p>
            </div>
          `;
        } else {
          chatList.innerHTML = data.chats.map(chat => 
            UI.renderChatItem(chat, Auth.getCurrentUserId())
          ).join('');
          
          // 绑定点击事件
          chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
              const chatId = parseInt(item.dataset.chatId);
              this.openChat(chatId);
            });
            
            // 长按查看详情
            let pressTimer;
            item.addEventListener('touchstart', () => {
              pressTimer = setTimeout(() => {
                // 显示聊天详情
              }, 500);
            });
            item.addEventListener('touchend', () => {
              clearTimeout(pressTimer);
            });
          });
        }
      }
    } catch (error) {
      console.error('加载聊天列表失败:', error);
    }
  },
  
  /**
   * 显示新建聊天模态框
   */
  showNewChatModal() {
    UI.showInputModal(
      '新建私聊',
      '输入对方的Gal号码',
      'GALXXXXXXXXXXX',
      async (galNumber) => {
        // 移除 Gal:// 前缀
        const cleanGal = galNumber.replace('Gal://', '').replace('gal://', '').toUpperCase();
        
        // 获取对方信息
        try {
          const response = await fetch(`/api/user/${cleanGal}`);
          const data = await response.json();
          
          if (data.success) {
            // 创建私聊或获取已有私聊
            await this.createPrivateChat(data.user.id, data.user);
          } else {
            UI.showToast('用户不存在');
          }
        } catch (error) {
          UI.showToast('获取用户信息失败');
        }
      }
    );
  },
  
  /**
   * 显示创建群聊模态框
   */
  showCreateGroupModal() {
    // 获取好友列表
    const friends = Contacts.contacts || [];
    
    if (friends.length === 0) {
      UI.showToast('请先添加好友后再创建群聊');
      return;
    }
    
    UI.showModal('创建群聊', `
      <div class="form-group">
        <label>群聊名称</label>
        <input type="text" id="group-name-input" placeholder="输入群聊名称" maxlength="20">
      </div>
      <div class="form-group">
        <label>选择成员（点击勾选）</label>
        <div class="group-member-select" id="group-member-list">
          ${friends.map(f => `
            <div class="member-option" data-id="${f.id}" data-gal="${f.galNumber}">
              <input type="checkbox" id="member-${f.id}">
              <label for="member-${f.id}">
                ${UI.avatarMap[f.avatar] || '👤'} ${UI.escapeHtml(f.nickname)}
              </label>
            </div>
          `).join('')}
        </div>
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '创建', class: 'btn-primary', closeOnClick: false, onClick: () => {
        const name = document.getElementById('group-name-input').value.trim();
        if (!name) {
          UI.showToast('请输入群聊名称');
          return;
        }
        
        const selectedIds = [];
        document.querySelectorAll('#group-member-list input:checked').forEach(cb => {
          selectedIds.push(parseInt(cb.id.replace('member-', '')));
        });
        
        if (selectedIds.length === 0) {
          UI.showToast('请至少选择一位成员');
          return;
        }
        
        this.createGroupChat(name, selectedIds);
        UI.closeModal();
      }}
    ]);
  },
  
  /**
   * 创建私聊
   */
  async createPrivateChat(contactId, contactInfo) {
    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'private',
          userId: Auth.getCurrentUserId(),
          memberIds: [contactId]
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 缓存联系人公钥
        if (contactInfo.publicKey) {
          this.userPublicKeys[contactId] = typeof contactInfo.publicKey === 'string' 
            ? JSON.parse(contactInfo.publicKey) 
            : contactInfo.publicKey;
        } else {
          // 尝试从API获取公钥
          this.fetchUserPublicKey(contactId);
        }
        
        // 打开聊天窗口
        this.openChat(data.chat.id, {
          ...contactInfo,
          id: contactId
        });
        
        // 刷新聊天列表
        this.loadChatList();
      }
    } catch (error) {
      console.error('创建私聊失败:', error);
      UI.showToast('创建聊天失败');
    }
  },
  
  /**
   * 获取用户公钥
   */
  async fetchUserPublicKey(userId) {
    try {
      const response = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success) {
        for (const chat of data.chats) {
          const member = chat.members?.find(m => m.id === userId);
          if (member?.publicKey) {
            this.userPublicKeys[userId] = typeof member.publicKey === 'string'
              ? JSON.parse(member.publicKey)
              : member.publicKey;
            break;
          }
        }
      }
    } catch (error) {
      console.error('获取公钥失败:', error);
    }
  },
  
  /**
   * 创建群聊
   */
  async createGroupChat(name, memberIds) {
    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          name,
          userId: Auth.getCurrentUserId(),
          memberIds
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        UI.showToast('群聊创建成功 🎉');
        this.loadChatList();
        // 打开群聊
        this.openChat(data.chat.id, data.chat);
        return data.chat.id;
      }
    } catch (error) {
      console.error('创建群聊失败:', error);
      UI.showToast('创建群聊失败');
    }
    return null;
  },
  
  /**
   * 打开聊天窗口
   */
  async openChat(chatId, contactInfo = null) {
    this.currentChat = {
      id: chatId,
      members: [],
      type: 'private'
    };
    
    // 更新UI
    const chatInfoEl = document.getElementById('chat-info');
    const messagesEl = document.getElementById('chat-messages');
    
    if (contactInfo) {
      const isGroup = contactInfo.type === 'group' || (contactInfo.members && contactInfo.members.length > 2);
      
      if (isGroup) {
        this.currentChat.type = 'group';
        this.currentChat.members = contactInfo.members || [];
        chatInfoEl.innerHTML = `
          <span class="chat-name">${contactInfo.name || '群聊'}</span>
          <span class="chat-status">${(contactInfo.members?.length || 0) + 1} 人</span>
        `;
      } else {
        this.currentChat.members = [contactInfo];
        chatInfoEl.innerHTML = `
          <span class="chat-name">${contactInfo.nickname}</span>
          <span class="chat-status">${contactInfo.isOnline ? '在线' : '离线'}</span>
        `;
        
        // 缓存公钥
        if (contactInfo.publicKey) {
          try {
            this.userPublicKeys[contactInfo.id] = typeof contactInfo.publicKey === 'string'
              ? JSON.parse(contactInfo.publicKey)
              : contactInfo.publicKey;
          } catch (e) {
            console.warn('公钥解析失败:', e);
          }
        }
      }
    } else {
      // 从服务器获取聊天信息
      await this.loadChatInfo(chatId);
    }
    
    // 清空消息容器
    messagesEl.innerHTML = '';
    this.chatMessages[chatId] = [];
    
    // 加入Socket房间
    window.socket.emit('join-chat', chatId);
    
    // 加载历史消息
    await this.loadMessages(chatId);
    
    // 显示聊天窗口
    UI.showChatWindow();
    
    // 聚焦输入框
    document.getElementById('message-input').focus();
  },
  
  /**
   * 加载聊天信息
   */
  async loadChatInfo(chatId) {
    try {
      const response = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`);
      const data = await response.json();
      
      if (data.success) {
        const chat = data.chats.find(c => c.id === chatId);
        if (chat) {
          this.currentChat = chat;
          
          const chatInfoEl = document.getElementById('chat-info');
          
          if (chat.type === 'group') {
            chatInfoEl.innerHTML = `
              <span class="chat-name">${chat.name}</span>
              <span class="chat-status">${chat.members?.length || 0} 人</span>
            `;
          } else {
            const otherMember = chat.members?.find(m => m.id !== Auth.getCurrentUserId());
            chatInfoEl.innerHTML = `
              <span class="chat-name">${otherMember?.nickname || '未知用户'}</span>
              <span class="chat-status">在线</span>
            `;
            
            // 缓存公钥
            if (otherMember?.publicKey) {
              try {
                this.userPublicKeys[otherMember.id] = typeof otherMember.publicKey === 'string'
                  ? JSON.parse(otherMember.publicKey)
                  : otherMember.publicKey;
              } catch (e) {
                console.warn('公钥解析失败:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('加载聊天信息失败:', error);
    }
  },
  
  /**
   * 加载聊天消息
   */
  async loadMessages(chatId) {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`);
      const data = await response.json();
      
      if (data.success) {
        const messages = data.messages.reverse();
        this.chatMessages[chatId] = messages;
        
        const messagesEl = document.getElementById('chat-messages');
        messagesEl.innerHTML = '';
        
        for (const message of messages) {
          await this.displayMessage(message, message.senderId === Auth.getCurrentUserId());
        }
        
        // 滚动到底部
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch (error) {
      console.error('加载消息失败:', error);
    }
  },
  
  /**
   * 显示消息
   */
  async displayMessage(message, isSent = false) {
    const messagesEl = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${message.type || ''}`;
    messageEl.dataset.messageId = message.id;
    messageEl.dataset.senderId = message.senderId;
    
    // 检查是否已撤回
    const isRecalled = message.isRecalled || message.encryptedContent === '[此消息已撤回]';
    
    // 解密消息内容
    let content = message.encryptedContent;
    let isEncrypted = false;
    
    if (isRecalled) {
      content = '此消息已撤回';
    } else if (message.encryptedContent) {
      try {
        // 检查是否为加密格式 (iv:ciphertext:publicKey)
        if (message.encryptedContent.includes(':') && !message.encryptedContent.startsWith('{')) {
          const parts = message.encryptedContent.split(':');
          if (parts.length >= 2) {
            isEncrypted = true;
            const [iv, ciphertext, senderPublicKey] = parts;
            
            // 从缓存或消息中获取发送者公钥
            let senderKey = this.userPublicKeys[message.senderId];
            if (!senderKey && senderPublicKey) {
              try {
                senderKey = JSON.parse(senderPublicKey);
                this.userPublicKeys[message.senderId] = senderKey;
              } catch (e) {}
            }
            
            if (senderKey && NovaCrypto && NovaCrypto.privateKey) {
              content = await NovaCrypto.decryptMessage(iv, ciphertext, senderKey);
            } else {
              // 没有密钥，显示明文提示
              content = '🔒 加密消息（无法解密）';
            }
          }
        } else if (message.encryptedContent.startsWith('{')) {
          // JSON格式，可能是图片或其他类型
          const parsed = JSON.parse(message.encryptedContent);
          if (parsed.type === 'image' && parsed.content) {
            // 图片消息
            content = parsed.content;
            message.isImage = true;
          } else if (parsed.plain) {
            // 明文消息
            content = parsed.content;
          } else {
            content = parsed.content || parsed;
          }
        } else {
          // 普通文本消息
          content = message.encryptedContent;
        }
      } catch (error) {
        console.error('解密消息失败:', error);
        content = message.encryptedContent;
      }
    }
    
    // 匿踪消息显示特殊发送者
    const senderName = message.type === 'anonymous' ? '来自星星的你' : message.nickname;
    
    // 构建消息HTML
    let messageHTML = '';
    
    if (!isSent) {
      messageHTML += `
        <div class="message-header">
          <span class="message-sender">${senderName}</span>
          ${isEncrypted ? '<span class="encrypt-icon">🔒</span>' : ''}
          <span class="message-time">${UI.formatFullTime(message.createdAt)}</span>
        </div>
      `;
    } else {
      messageHTML += `
        <div class="message-header">
          ${isEncrypted ? '<span class="encrypt-icon">🔒</span>' : ''}
          <span class="message-time">${UI.formatFullTime(message.createdAt)}</span>
        </div>
      `;
    }
    
    // 消息内容
    if (isRecalled) {
      messageHTML += `<div class="message-content recalled">${UI.escapeHtml(content)}</div>`;
    } else if (message.isImage) {
      messageHTML += `
        <div class="message-content">
          <img src="${content}" class="chat-image" onclick="Chat.previewImage('${content}')">
        </div>
      `;
    } else {
      messageHTML += `<div class="message-content">${UI.escapeHtml(content)}</div>`;
    }
    
    if (isSent) {
      messageHTML += `<div class="message-status">✓</div>`;
    }
    
    messageEl.innerHTML = messageHTML;
    
    // 添加销毁进度条（如果需要）
    if (message.type === 'self-destruct' && message.ttl && !isRecalled) {
      const progressBar = document.createElement('div');
      progressBar.className = 'destroy-progress';
      progressBar.style.animationDuration = `${message.ttl}s`;
      messageEl.appendChild(progressBar);
      
      // 设置定时销毁
      setTimeout(() => {
        this.destroyMessage(message.id);
      }, message.ttl * 1000);
    }
    
    // 添加长按撤回功能（仅自己的消息且2分钟内）
    if (isSent && !isRecalled) {
      this.addMessageRecallHandler(messageEl, message);
    }
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 标记已读
    if (!isSent && message.id) {
      window.socket.emit('message-read', {
        messageId: message.id,
        chatId: this.currentChat?.id,
        userId: Auth.getCurrentUserId()
      });
    }
  },
  
  /**
   * 添加消息撤回处理器
   */
  addMessageRecallHandler(messageEl, message) {
    let pressTimer;
    
    const startPress = (e) => {
      pressTimer = setTimeout(() => {
        this.showRecallMenu(messageEl, message);
      }, 500);
    };
    
    const endPress = () => {
      clearTimeout(pressTimer);
    };
    
    messageEl.addEventListener('mousedown', startPress);
    messageEl.addEventListener('mouseup', endPress);
    messageEl.addEventListener('mouseleave', endPress);
    messageEl.addEventListener('touchstart', startPress);
    messageEl.addEventListener('touchend', endPress);
  },
  
  /**
   * 显示撤回菜单
   */
  showRecallMenu(messageEl, message) {
    // 检查是否在2分钟内
    const messageTime = new Date(message.createdAt);
    const now = new Date();
    const diffMinutes = (now - messageTime) / 1000 / 60;
    
    if (diffMinutes > 2) {
      UI.showToast('消息已超过2分钟，无法撤回');
      return;
    }
    
    UI.showConfirm('撤回消息', '确定要撤回这条消息吗？', async () => {
      try {
        // 通过Socket发送撤回请求
        window.socket.emit('recall-message', {
          messageId: message.id,
          chatId: this.currentChat.id,
          userId: Auth.getCurrentUserId()
        });
        
        // 本地立即更新UI
        messageEl.querySelector('.message-content').textContent = '此消息已撤回';
        messageEl.querySelector('.message-content').classList.add('recalled');
        messageEl.dataset.recalled = 'true';
        
        // 更新本地缓存
        const msgIndex = this.chatMessages[this.currentChat.id]?.findIndex(m => m.id === message.id);
        if (msgIndex !== undefined && msgIndex >= 0) {
          this.chatMessages[this.currentChat.id][msgIndex].isRecalled = true;
          this.chatMessages[this.currentChat.id][msgIndex].encryptedContent = '[此消息已撤回]';
        }
        
        UI.showToast('消息已撤回');
      } catch (error) {
        console.error('撤回失败:', error);
        UI.showToast('撤回失败');
      }
    });
  },
  
  /**
   * 预览图片
   */
  previewImage(src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    overlay.innerHTML = `<img src="${src}" class="image-preview"><button class="btn-icon close-btn">✕</button>`;
    overlay.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  },
  
  /**
   * 选择图片
   */
  selectImage() {
    const input = document.getElementById('image-input');
    if (input) input.click();
  },
  
  /**
   * 处理选中的图片
   */
  async handleImageSelected(file) {
    if (!file.type.startsWith('image/')) {
      UI.showToast('请选择图片文件');
      return;
    }
    
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      UI.showToast('图片大小不能超过5MB');
      return;
    }
    
    try {
      const base64 = await this.compressImage(file);
      await this.sendImageMessage(base64);
    } catch (error) {
      console.error('图片处理失败:', error);
      UI.showToast('图片处理失败');
    }
  },
  
  /**
   * 压缩图片并转为base64
   */
  compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 压缩到800px以内
          const maxSize = 800;
          let width = img.width;
          let height = img.height;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // 质量0.7
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          
          // 检查base64大小（不超过2MB）
          const sizeInMB = (base64.length * 0.75) / (1024 * 1024);
          if (sizeInMB > 2) {
            // 进一步压缩
            const newBase64 = canvas.toDataURL('image/jpeg', 0.5);
            resolve(newBase64);
          } else {
            resolve(base64);
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  
  /**
   * 发送图片消息
   */
  async sendImageMessage(base64) {
    if (!this.currentChat) return;
    
    try {
      const content = JSON.stringify({ type: 'image', content: base64 });
      
      const message = {
        chatId: this.currentChat.id,
        senderId: Auth.getCurrentUserId(),
        encryptedContent: content,
        type: 'image',
        ttl: null
      };
      
      // 通过Socket发送
      if (window.socket && window.socket.connected) {
        window.socket.emit('send-message', message);
      } else {
        await fetch(`/api/chats/${message.chatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      }
      
      // 立即在本地显示
      const localMessage = {
        id: 'local-' + Date.now(),
        chatId: message.chatId,
        senderId: Auth.getCurrentUserId(),
        galNumber: Auth.currentUser?.galNumber || '',
        nickname: Auth.currentUser?.nickname || '',
        encryptedContent: content,
        type: 'image',
        isImage: true,
        ttl: null,
        createdAt: new Date().toISOString()
      };
      
      if (!this.chatMessages[message.chatId]) {
        this.chatMessages[message.chatId] = [];
      }
      this.chatMessages[message.chatId].push(localMessage);
      
      this.displayMessage(localMessage, true);
      
      const messagesEl = document.getElementById('chat-messages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
    } catch (error) {
      console.error('发送图片失败:', error);
      UI.showToast('发送图片失败');
    }
  },
  
  /**
   * 销毁消息
   */
  async destroyMessage(messageId) {
    // 从UI移除
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0';
      setTimeout(() => messageEl.remove(), 300);
    }
    
    // 从本地缓存移除
    if (this.currentChat) {
      this.chatMessages[this.currentChat.id] = this.chatMessages[this.currentChat.id]
        .filter(m => m.id !== messageId);
    }
  },
  
  /**
   * 发送消息
   */
  async sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content || !this.currentChat) return;
    
    // 检查消息类型
    const isDestroy = document.getElementById('btn-destroy').classList.contains('active');
    const isAnonymous = document.getElementById('btn-anonymous').classList.contains('active');
    const ttl = isDestroy ? parseInt(document.getElementById('destroy-ttl').value) : null;
    
    try {
      // 构造消息内容
      let encryptedContent = content;
      let isEncrypted = false;
      
      // 尝试加密（私聊且非匿踪）
      if (!isAnonymous && this.currentChat.type !== 'group') {
        try {
          const otherMember = this.currentChat.members?.find(m => m.id !== Auth.getCurrentUserId());
          
          if (otherMember) {
            // 获取对方公钥
            let recipientKey = this.userPublicKeys[otherMember.id];
            
            if (!recipientKey && otherMember.publicKey) {
              try {
                recipientKey = typeof otherMember.publicKey === 'string'
                  ? JSON.parse(otherMember.publicKey)
                  : otherMember.publicKey;
                this.userPublicKeys[otherMember.id] = recipientKey;
              } catch (e) {}
            }
            
            if (recipientKey && NovaCrypto && NovaCrypto.privateKey) {
              // 进行加密
              const encrypted = await NovaCrypto.encryptMessage(content, recipientKey);
              const senderPublicKey = JSON.stringify(NovaCrypto.publicKeyJwk);
              encryptedContent = `${encrypted.iv}:${encrypted.ciphertext}:${senderPublicKey}`;
              isEncrypted = true;
            } else {
              // 无法加密，发送明文
              encryptedContent = JSON.stringify({ plain: true, content });
            }
          } else {
            encryptedContent = JSON.stringify({ plain: true, content });
          }
        } catch (encErr) {
          console.warn('加密失败，发送明文:', encErr);
          encryptedContent = JSON.stringify({ plain: true, content });
        }
      } else if (this.currentChat.type === 'group') {
        // 群聊不加密
        encryptedContent = JSON.stringify({ plain: true, content });
      }
      
      // 构造消息
      const message = {
        chatId: this.currentChat.id,
        senderId: Auth.getCurrentUserId(),
        encryptedContent,
        type: isAnonymous ? 'anonymous' : (isDestroy ? 'self-destruct' : 'normal'),
        ttl
      };
      
      // 通过Socket发送
      if (window.socket && window.socket.connected) {
        window.socket.emit('send-message', message);
      } else {
        // Socket未连接时用HTTP API
        console.warn('Socket未连接，使用HTTP发送');
        try {
          await fetch(`/api/chats/${message.chatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
          });
        } catch (httpErr) {
          console.error('HTTP发送失败:', httpErr);
        }
      }
      
      // 立即在本地显示消息
      const localMessage = {
        id: 'local-' + Date.now(),
        chatId: message.chatId,
        senderId: Auth.getCurrentUserId(),
        galNumber: Auth.currentUser?.galNumber || '',
        nickname: Auth.currentUser?.nickname || '',
        encryptedContent: content,
        type: message.type,
        ttl: message.ttl,
        createdAt: new Date().toISOString()
      };
      this.displayMessage(localMessage, true);
      
      if (!this.chatMessages[message.chatId]) {
        this.chatMessages[message.chatId] = [];
      }
      this.chatMessages[message.chatId].push(localMessage);
      
      input.value = '';
      
      if (isDestroy) {
        document.getElementById('btn-destroy').classList.remove('active');
        document.getElementById('destroy-timer').classList.add('hidden');
      }
      
      this.sendStopTyping();
    } catch (error) {
      console.error('发送消息失败:', error);
      UI.showToast('发送失败，请重试');
    }
  },
  
  /**
   * 发送正在输入状态
   */
  sendTypingStatus() {
    if (!this.currentChat) return;
    
    window.socket.emit('typing', {
      chatId: this.currentChat.id,
      userId: Auth.getCurrentUserId(),
      nickname: Auth.currentUser?.nickname
    });
    
    // 防抖：停止输入后3秒发送stop-typing
    clearTimeout(this.typingTimers[this.currentChat.id]);
    this.typingTimers[this.currentChat.id] = setTimeout(() => {
      this.sendStopTyping();
    }, 3000);
  },
  
  /**
   * 发送停止输入状态
   */
  sendStopTyping() {
    if (!this.currentChat) return;
    
    clearTimeout(this.typingTimers[this.currentChat.id]);
    window.socket.emit('stop-typing', {
      chatId: this.currentChat.id,
      userId: Auth.getCurrentUserId()
    });
  },
  
  /**
   * 关闭聊天窗口
   */
  closeChat() {
    if (this.currentChat) {
      window.socket.emit('leave-chat', this.currentChat.id);
      this.sendStopTyping();
      this.currentChat = null;
    }
    
    UI.hideChatWindow();
  },
  
  /**
   * 处理收到的消息
   */
  handleNewMessage(message) {
    if (!this.currentChat || this.currentChat.id !== message.chatId) {
      // 不在当前聊天，刷新列表
      this.loadChatList();
      return;
    }
    
    // 检查是否已经本地显示过（避免重复）
    const existingEl = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingEl) return;
    
    // 检查是否是自己刚发的本地消息，用服务器ID替换
    if (message.senderId === Auth.getCurrentUserId() && this.chatMessages[message.chatId]) {
      const localMsg = this.chatMessages[message.chatId].find(m => 
        m.id && m.id.startsWith('local-') && 
        m.encryptedContent === message.encryptedContent
      );
      if (localMsg) {
        const localEl = document.querySelector(`[data-message-id="${localMsg.id}"]`);
        if (localEl) localEl.dataset.messageId = message.id;
        localMsg.id = message.id;
        return;
      }
    }
    
    // 添加到本地缓存
    if (!this.chatMessages[message.chatId]) {
      this.chatMessages[message.chatId] = [];
    }
    this.chatMessages[message.chatId].push(message);
    
    // 显示消息
    const isSent = message.senderId === Auth.getCurrentUserId();
    this.displayMessage(message, isSent);
    
    // 如果是自己发送的，滚动到底部
    if (isSent) {
      const messagesEl = document.getElementById('chat-messages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  },
  
  /**
   * 处理消息撤回
   */
  handleMessageRecalled(data) {
    const { messageId } = data;
    
    // 更新UI
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-content');
      if (contentEl) {
        contentEl.textContent = '此消息已撤回';
        contentEl.classList.add('recalled');
      }
      messageEl.dataset.recalled = 'true';
    }
    
    // 更新本地缓存
    if (this.currentChat && this.chatMessages[this.currentChat.id]) {
      const msg = this.chatMessages[this.currentChat.id].find(m => m.id === messageId);
      if (msg) {
        msg.isRecalled = true;
        msg.encryptedContent = '[此消息已撤回]';
      }
    }
  },
  
  /**
   * 处理消息销毁
   */
  handleMessageDestroyed(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0';
      messageEl.style.transform = 'scale(0.8)';
      setTimeout(() => messageEl.remove(), 300);
    }
  }
};

// Socket.io 事件处理 - 延迟注册（等socket连接后）
function registerSocketEvents() {
  const s = window.socket;
  if (!s) return;
  
  s.on('new-message', (message) => {
    Chat.handleNewMessage(message);
  });

  s.on('message-recalled', (data) => {
    Chat.handleMessageRecalled(data);
  });

  s.on('message-destroyed', (data) => {
    Chat.handleMessageDestroyed(data.messageId);
  });

  s.on('user-typing', (data) => {
    if (Chat.currentChat && Chat.currentChat.id === data.chatId) {
      const typingEl = document.getElementById('chat-typing');
      typingEl.textContent = `${data.nickname} 正在输入...`;
    }
  });

  s.on('user-stop-typing', (data) => {
    if (Chat.currentChat && Chat.currentChat.id === data.chatId) {
      const typingEl = document.getElementById('chat-typing');
      typingEl.textContent = '';
    }
  });

  s.on('message-read-by', (data) => {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"] .message-status`);
    if (messageEl) {
      messageEl.textContent = '✓✓';
      messageEl.classList.add('read');
    }
  });
}

window.registerSocketEvents = registerSocketEvents;

// 导出聊天模块
window.Chat = Chat;

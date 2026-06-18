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
    // 新建聊天按钮
    document.getElementById('btn-new-chat').addEventListener('click', () => {
      this.showNewChatModal();
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
      '新建聊天',
      '输入对方的Gal号码',
      'Gal://XXXXXXXXXXXX',
      async (galNumber) => {
        // 移除 Gal:// 前缀
        const cleanGal = galNumber.replace('Gal://', '');
        
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
          this.userPublicKeys[contactId] = JSON.parse(contactInfo.publicKey);
        }
        
        // 打开聊天窗口
        this.openChat(data.chat.id, contactInfo);
        
        // 刷新聊天列表
        this.loadChatList();
      }
    } catch (error) {
      console.error('创建私聊失败:', error);
      UI.showToast('创建聊天失败');
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
        this.loadChatList();
        return data.chat.id;
      }
    } catch (error) {
      console.error('创建群聊失败:', error);
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
      chatInfoEl.innerHTML = `
        <span class="chat-name">${contactInfo.nickname}</span>
        <span class="chat-status">${contactInfo.isOnline ? '在线' : '离线'}</span>
      `;
      this.currentChat.members = [contactInfo];
      
      // 缓存公钥
      if (contactInfo.publicKey) {
        this.userPublicKeys[contactInfo.id] = JSON.parse(contactInfo.publicKey);
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
          const otherMember = chat.members?.find(m => m.id !== Auth.getCurrentUserId());
          
          if (chat.type === 'group') {
            chatInfoEl.innerHTML = `
              <span class="chat-name">${chat.name}</span>
              <span class="chat-status">${chat.members?.length || 0} 人</span>
            `;
          } else {
            chatInfoEl.innerHTML = `
              <span class="chat-name">${otherMember?.nickname || '未知用户'}</span>
              <span class="chat-status">在线</span>
            `;
            
            // 缓存公钥
            if (otherMember?.publicKey) {
              this.userPublicKeys[otherMember.id] = JSON.parse(otherMember.publicKey);
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
          await this.displayMessage(message, message.sender_id === Auth.getCurrentUserId());
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
    
    // 解密消息内容
    let content = message.encryptedContent;
    try {
      if (message.encryptedContent && !message.encryptedContent.startsWith('{')) {
        // 消息是加密的，尝试解密
        const parts = message.encryptedContent.split(':');
        if (parts.length === 3) {
          const [iv, ciphertext, senderPublicKey] = parts;
          
          // 从缓存或消息中获取发送者公钥
          let senderKey = this.userPublicKeys[message.senderId];
          if (!senderKey && senderPublicKey) {
            senderKey = JSON.parse(senderPublicKey);
          }
          
          if (senderKey) {
            content = await NovaCrypto.decryptMessage(iv, ciphertext, senderKey);
          }
        }
      } else if (message.encryptedContent) {
        // 消息未加密（JSON格式）
        const parsed = JSON.parse(message.encryptedContent);
        content = parsed.content || parsed;
      }
    } catch (error) {
      console.error('解密消息失败:', error);
      content = '【无法解密的消息】';
    }
    
    // 匿踪消息显示特殊发送者
    const senderName = message.type === 'anonymous' ? '来自星星的你' : message.nickname;
    
    messageEl.innerHTML = `
      ${!isSent ? `
        <div class="message-header">
          <span class="message-sender">${senderName}</span>
          <span class="message-time">${UI.formatFullTime(message.createdAt)}</span>
        </div>
      ` : `
        <div class="message-header">
          <span class="message-time">${UI.formatFullTime(message.createdAt)}</span>
        </div>
      `}
      <div class="message-content">${UI.escapeHtml(content)}</div>
      ${isSent ? `<div class="message-status">✓</div>` : ''}
    `;
    
    // 添加销毁进度条（如果需要）
    if (message.type === 'self-destruct' && message.ttl) {
      const progressBar = document.createElement('div');
      progressBar.className = 'destroy-progress';
      progressBar.style.animationDuration = `${message.ttl}s`;
      messageEl.appendChild(progressBar);
      
      // 设置定时销毁
      setTimeout(() => {
        this.destroyMessage(message.id);
      }, message.ttl * 1000);
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
    
    // 通知服务器
    // 注意：这里只通知，不实际删除（服务器端根据TTL自动清理）
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
      // 直接发送明文（加密功能后续版本开启）
      let encryptedContent = content;
      
      // 尝试加密（失败不影响发送）
      if (!isAnonymous && this.currentChat.members) {
        try {
          const otherMember = this.currentChat.members.find(m => m.id !== Auth.getCurrentUserId());
          if (otherMember && otherMember.publicKey) {
            const recipientKey = JSON.parse(otherMember.publicKey);
            const encrypted = await NovaCrypto.encryptMessage(content, recipientKey);
            const senderPublicKey = JSON.stringify(NovaCrypto.publicKeyJwk);
            encryptedContent = `${encrypted.iv}:${encrypted.ciphertext}:${senderPublicKey}`;
          }
        } catch (encErr) {
          console.warn('加密失败，发送明文:', encErr);
          encryptedContent = content;
        }
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

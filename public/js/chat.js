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
    // 加载置顶聊天
    this.pinnedChats = JSON.parse(localStorage.getItem('nova_pinned_chats') || '[]');
    
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
    
    // 工具栏按钮 - 使用 ?. 避免元素不存在时报错
    const translateBtn = document.getElementById('btn-translate');
    if (translateBtn) translateBtn.addEventListener('click', () => this.toggleTranslatePanel());
    
    const destroyBtn = document.getElementById('btn-destroy');
    if (destroyBtn) destroyBtn.addEventListener('click', () => this.toggleBurnPanel());
    
    const anonymousBtn = document.getElementById('btn-anonymous');
    if (anonymousBtn) anonymousBtn.addEventListener('click', () => this.toggleAnonymousMode());
    
    const emojiBtn = document.getElementById('btn-emoji');
    if (emojiBtn) emojiBtn.addEventListener('click', () => this.toggleEmojiPanel());
    
    const fileBtn = document.getElementById('btn-file');
    if (fileBtn) fileBtn.addEventListener('click', () => this.selectFile());
    
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', () => this.toggleVoiceRecording());
    
    const imageBtn = document.getElementById('btn-image');
    if (imageBtn) imageBtn.addEventListener('click', () => {
      const input = document.getElementById('image-input');
      if (input) input.click();
    });
    
    const redpacketBtn = document.getElementById('btn-redpacket');
    if (redpacketBtn) redpacketBtn.addEventListener('click', () => this.showRedPacketPanel());
    
    // 文件输入
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) { this.handleFileSelected(e.target.files[0]); e.target.value = ''; }
    });
    
    // 图片输入变化
    const imgInput = document.getElementById('image-input');
    if (imgInput) {
      imgInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleImageSelected(e.target.files[0]);
        }
      });
    }
    
    // 初始化表情网格
    this.initEmojiGrid();
    
    // 绑定翻译语言选择
    this.bindTranslateOptions();
    
    // 绑定阅后即焚选项
    this.bindBurnOptions();
    
    // 绑定语音录制停止
    const voiceTimer = document.getElementById('voice-timer');
    if (voiceTimer) {
      voiceTimer.addEventListener('click', () => this.stopRecording());
    }
    
    // 滚动到底部按钮
    document.getElementById('btn-scroll-bottom')?.addEventListener('click', () => {
      this.scrollToBottom();
    });
    
    // 监听聊天消息滚动
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      messagesEl.addEventListener('scroll', () => {
        this.handleMessagesScroll();
      });
    }
  },
  
  /**
   * 处理消息滚动
   */
  handleMessagesScroll() {
    const messagesEl = document.getElementById('chat-messages');
    const scrollBtn = document.getElementById('btn-scroll-bottom');
    
    if (!messagesEl || !scrollBtn) return;
    
    const distanceFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    
    if (distanceFromBottom > 100) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  },
  
  /**
   * 滚动到底部
   */
  scrollToBottom(animate = true) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;
    
    if (animate) {
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  },
  
  initEmojiGrid() {
    const emojiGrid = document.getElementById('emoji-grid');
    if (!emojiGrid) return;
    const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤗','🤠','😈','👿','👹','👺','🤡','💀','☠️','💩','🤡','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎒','🎓','👑','📿','💄','💍','💎','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','💈','⚗️','🔭','🔬','🕳️','💊','💉','🩸','🩹','🩺','🚪','🛏️','🛋️','🪑','🚽','🚿','🛁','🪤','🧴','🧷','🧹','🧺','🧻','🧼','🪥','🧽','🧯','🛒','🎁','🎈','🎏','🎀','🧨','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🔗','📎','🖇️','📐','📏','🗐','🗍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'];
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        const input = document.getElementById('message-input');
        if (input) {
          input.value += emoji;
          input.focus();
        }
        this.toggleEmojiPanel();
      });
      emojiGrid.appendChild(btn);
    });
  },
  
  bindTranslateOptions() {
    document.querySelectorAll('#translate-panel .lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#translate-panel .lang-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  },
  
  bindBurnOptions() {
    document.querySelectorAll('#burn-panel .burn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#burn-panel .burn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.burnSeconds = parseInt(btn.dataset.seconds) || 30;
        this.burnMode = true;
        const destroyBtn = document.getElementById('btn-destroy');
        if (destroyBtn) destroyBtn.classList.add('active');
        this.closeAllPanels();
      });
    });
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
        
        // 分离置顶和非置顶聊天
        const pinnedChats = data.chats.filter(chat => this.pinnedChats.includes(chat.id));
        const normalChats = data.chats.filter(chat => !this.pinnedChats.includes(chat.id));
        
        if (data.chats.length === 0) {
          chatList.innerHTML = `
            <div class="empty-state">
              <p>还没有聊天记录</p>
              <p>开始新的对话吧！</p>
            </div>
          `;
        } else {
          let html = '';
          
          // 渲染置顶聊天
          if (pinnedChats.length > 0) {
            html += '<div class="chat-section-header">📌 置顶聊天</div>';
            pinnedChats.forEach(chat => {
              html += UI.renderChatItem(chat, Auth.getCurrentUserId(), true);
            });
          }
          
          // 渲染普通聊天
          if (normalChats.length > 0) {
            html += '<div class="chat-section-header">💬 消息</div>';
            normalChats.forEach(chat => {
              html += UI.renderChatItem(chat, Auth.getCurrentUserId(), false);
            });
          }
          
          chatList.innerHTML = html;
          
          // 绑定点击事件
          chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
              const chatId = parseInt(item.dataset.chatId);
              this.openChat(chatId);
            });
            
            // 长按置顶/取消置顶
            let pressTimer;
            item.addEventListener('touchstart', () => {
              pressTimer = setTimeout(() => {
                this.togglePinChat(item);
              }, 500);
            });
            item.addEventListener('touchend', () => {
              clearTimeout(pressTimer);
            });
            item.addEventListener('mousedown', () => {
              pressTimer = setTimeout(() => {
                this.togglePinChat(item);
              }, 500);
            });
            item.addEventListener('mouseup', () => {
              clearTimeout(pressTimer);
            });
            item.addEventListener('mouseleave', () => {
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
   * 置顶/取消置顶聊天
   */
  togglePinChat(item) {
    const chatId = parseInt(item.dataset.chatId);
    const index = this.pinnedChats.indexOf(chatId);
    
    if (index > -1) {
      this.pinnedChats.splice(index, 1);
      UI.showToast('已取消置顶');
    } else {
      this.pinnedChats.unshift(chatId);
      UI.showToast('已置顶聊天 📌');
    }
    
    localStorage.setItem('nova_pinned_chats', JSON.stringify(this.pinnedChats));
    this.loadChatList();
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
        
        let lastDate = null;
        
        for (const message of messages) {
          // 检查是否需要添加日期分割线
          const messageDate = new Date(message.createdAt || message.created_at).toDateString();
          if (messageDate !== lastDate) {
            this.addDateDivider(messagesEl, message.createdAt || message.created_at);
            lastDate = messageDate;
          }
          
          await this.displayMessage(message, message.senderId === Auth.getCurrentUserId());
        }
        
        // 滚动到底部
        this.scrollToBottom(false);
      }
    } catch (error) {
      console.error('加载消息失败:', error);
    }
  },
  
  /**
   * 添加日期分割线
   */
  addDateDivider(container, timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let dateText;
    if (date.toDateString() === today) {
      dateText = '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateText = '昨天';
    } else {
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        dateText = weekdays[date.getDay()];
      } else {
        dateText = `${date.getMonth() + 1}月${date.getDate()}日`;
      }
    }
    
    const divider = document.createElement('div');
    divider.className = 'message-date-divider';
    divider.innerHTML = `<span>${dateText}</span>`;
    container.appendChild(divider);
  },
  
  /**
   * 检查消息时间间隔
   */
  shouldShowTimeDivider(currentMsg, prevMsg) {
    if (!prevMsg) return false;
    const currentTime = new Date(currentMsg.createdAt || currentMsg.created_at);
    const prevTime = new Date(prevMsg.createdAt || prevMsg.created_at);
    const diffMinutes = (currentTime - prevTime) / (1000 * 60);
    return diffMinutes > 5;
  },
  
  /**
   * 添加时间分割线
   */
  addTimeDivider(container, timestamp) {
    const divider = document.createElement('div');
    divider.className = 'message-time-divider';
    const time = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    divider.innerHTML = `<span>${time}</span>`;
    container.appendChild(divider);
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
    
    // 检查是否需要添加时间分割线
    const messages = this.chatMessages[this.currentChat?.id] || [];
    const msgIndex = messages.indexOf(message);
    const prevMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
    if (this.shouldShowTimeDivider(message, prevMsg)) {
      this.addTimeDivider(messagesEl, message.createdAt || message.created_at);
    }
    
    // 长按收藏消息
    let msgPressTimer;
    messageEl.addEventListener('touchstart', (e) => {
      msgPressTimer = setTimeout(() => {
        if (window.Collection && content) {
          Collection.add(content, message.senderId === Auth.getCurrentUserId() ? '我' : '对方');
        }
      }, 600);
    });
    messageEl.addEventListener('touchend', () => clearTimeout(msgPressTimer));
    messageEl.addEventListener('touchmove', () => clearTimeout(msgPressTimer));
    
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
      const status = this.messageStatus[message.id] || 'sent';
      let statusIcon = '✓';
      let statusClass = 'msg-sent';
      if (status === 'delivered') { statusIcon = '✓✓'; statusClass = 'msg-delivered'; }
      if (status === 'read') { statusIcon = '✓✓'; statusClass = 'msg-read'; }
      messageHTML += `<div class="message-status ${statusClass}">${statusIcon}</div>`;
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
    
    // 添加点击弹出操作菜单
    if (!isRecalled) {
      messageEl.addEventListener('click', (e) => {
        // 避免图片预览触发菜单
        if (e.target.tagName === 'IMG') return;
        this.showMessageMenu(messageEl, message, isSent);
      });
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
      
      // 附加引用消息
      if (this.quotedMessage) {
        message.quotedContent = this.quotedMessage.encryptedContent?.substring(0, 50) || '';
        message.quotedSender = this.quotedMessage.nickname || '对方';
        this.cancelQuote();
      }
      
      // 通过Socket发送
      const tempId = 'local-' + Date.now();
      message.tempId = tempId;
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

  // 翻译功能
  toggleTranslatePanel() {
    const panel = document.getElementById('translate-panel');
    if (!panel) return;
    const isVisible = !panel.classList.contains('hidden');
    this.closeAllPanels();
    if (!isVisible) panel.classList.remove('hidden');
  },
  toggleBurnPanel() {
    const panel = document.getElementById('burn-panel');
    if (!panel) return;
    const isVisible = !panel.classList.contains('hidden');
    this.closeAllPanels();
    if (!isVisible) panel.classList.remove('hidden');
  },
  toggleAnonymousMode() {
    const btn = document.getElementById('btn-anonymous');
    this.anonymousMode = !this.anonymousMode;
    btn.classList.toggle('active', this.anonymousMode);
    this.closeAllPanels();
    if (this.anonymousMode) { UI.showToast('匿踪模式已开启'); this.showAnonymousHint(); }
    else { this.hideAnonymousHint(); UI.showToast('匿踪模式已关闭'); }
  },
  showAnonymousHint() {
    let hint = document.getElementById('anonymous-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'anonymous-hint';
      hint.className = 'anonymous-hint';
      hint.textContent = '发送的消息将不显示发送者信息';
      const inputArea = document.querySelector('.chat-input-area');
      if (inputArea && inputArea.parentNode) inputArea.parentNode.insertBefore(hint, inputArea);
    }
    hint.classList.add('visible');
  },
  hideAnonymousHint() {
    const hint = document.getElementById('anonymous-hint');
    if (hint) hint.classList.remove('visible');
  },
  closeAllPanels() {
    document.querySelectorAll('.input-panel').forEach(p => { p.classList.remove('visible'); p.classList.add('hidden'); });
  },
  selectTargetLang(lang) {
    this.selectedTargetLang = lang;
    document.querySelectorAll('#translate-panel .lang-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.lang === lang));
    this.translateMode = true;
    const translateBtn = document.getElementById('btn-translate');
    if (translateBtn) translateBtn.classList.add('active');
    this.closeAllPanels();
    UI.showToast('翻译模式已开启 -> ' + lang);
  },
  selectBurnTime(seconds) {
    this.burnSeconds = seconds;
    this.burnMode = true;
    document.querySelectorAll('#burn-panel .burn-option').forEach(btn => btn.classList.toggle('selected', parseInt(btn.dataset.seconds) === seconds));
    const burnBtn = document.getElementById('btn-destroy');
    if (burnBtn) burnBtn.classList.add('active');
    this.closeAllPanels();
    UI.showToast('阅后即焚已开启 (' + seconds + '秒)');
  },
  disableBurnMode() {
    this.burnMode = false;
    const burnBtn = document.getElementById('btn-destroy');
    if (burnBtn) burnBtn.classList.remove('active');
    this.closeAllPanels();
  },
  async translateMessage(messageId, text) {
    if (this.translations[messageId]) { this.hideTranslation(messageId); return; }
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, from: 'auto', to: this.selectedTargetLang || 'zh' })
      });
      const data = await response.json();
      if (data.success && data.translatedText) { this.translations[messageId] = data.translatedText; this.showTranslation(messageId, data.translatedText); }
      else UI.showToast('翻译失败');
    } catch (error) { console.error('翻译失败:', error); UI.showToast('翻译请求失败'); }
  },
  showTranslation(messageId, text) {
    const messageEl = document.querySelector('[data-message-id="' + messageId + '"]');
    if (!messageEl) return;
    let transEl = messageEl.querySelector('.message-translation');
    if (!transEl) { transEl = document.createElement('div'); transEl.className = 'message-translation'; messageEl.appendChild(transEl); }
    transEl.textContent = text;
    transEl.classList.add('visible');
  },
  hideTranslation(messageId) {
    const messageEl = document.querySelector('[data-message-id="' + messageId + '"]');
    if (messageEl) { const t = messageEl.querySelector('.message-translation'); if (t) t.classList.remove('visible'); }
  },
  toggleEmojiPanel() {
    const panel = document.getElementById('emoji-panel');
    if (!panel) return;
    const isVisible = !panel.classList.contains('hidden');
    this.closeAllPanels();
    if (!isVisible) panel.classList.remove('hidden');
  },
  insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    if (input) { input.value += emoji; input.focus(); }
    this.closeAllPanels();
  },
  selectFile() { const input = document.getElementById('file-input'); if (input) input.click(); },
  handleFileSelected(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { UI.showToast('文件大小不能超过5MB'); return; }
    const reader = new FileReader();
    reader.onload = (e) => this.sendFileMessage(file.name, file.size, file.type, e.target.result);
    reader.onerror = () => UI.showToast('文件读取失败');
    reader.readAsDataURL(file);
  },
  async sendFileMessage(fileName, fileSize, fileType, base64) {
    if (!this.currentChat) return;
    const content = JSON.stringify({type: 'file', fileName, fileSize, fileType, content: base64});
    const message = {chatId: this.currentChat.id, senderId: Auth.getCurrentUserId(), encryptedContent: content, type: 'file', ttl: null, burnAfter: this.burnMode ? this.burnSeconds : 0, isAnonymous: this.anonymousMode};
    if (window.socket && window.socket.connected) window.socket.emit('send-message', message);
    else await fetch('/api/chats/' + message.chatId + '/messages', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(message)});
    const localMessage = {id: 'local-' + Date.now(), chatId: message.chatId, senderId: Auth.getCurrentUserId(), galNumber: Auth.currentUser?.galNumber || '', nickname: Auth.currentUser?.nickname || '', encryptedContent: content, type: 'file', metadata: {fileName, fileSize, fileType}, createdAt: new Date().toISOString()};
    if (!this.chatMessages[message.chatId]) this.chatMessages[message.chatId] = [];
    this.chatMessages[message.chatId].push(localMessage);
    this.displayMessage(localMessage, true);
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
  },
  async toggleVoiceRecording() { if (this.isRecording) this.stopRecording(); else this.startRecording(); },
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => { const blob = new Blob(this.audioChunks, {type: 'audio/webm'}); this.sendVoiceMessage(blob); stream.getTracks().forEach(t => t.stop()); };
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingSeconds = 0;
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn) voiceBtn.classList.add('recording');
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        if (this.recordingSeconds >= 60) { this.stopRecording(); UI.showToast('录音已达60秒上限'); }
        const timerEl = document.getElementById('voice-timer');
        if (timerEl) timerEl.textContent = this.formatTime(this.recordingSeconds);
      }, 1000);
    } catch (error) { console.error('录音启动失败:', error); UI.showToast('无法访问麦克风'); }
  },
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      clearInterval(this.recordingTimer);
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn) voiceBtn.classList.remove('recording');
      const timerEl = document.getElementById('voice-timer');
      if (timerEl) timerEl.textContent = '0s';
    }
  },
  formatTime(seconds) { const m = Math.floor(seconds / 60); const s = seconds % 60; return m + ':' + (s < 10 ? '0' : '') + s; },
  async sendVoiceMessage(blob) {
    if (!this.currentChat) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      const duration = this.recordingSeconds;
      const content = JSON.stringify({type: 'voice', duration, content: base64});
      const message = {chatId: this.currentChat.id, senderId: Auth.getCurrentUserId(), encryptedContent: content, type: 'voice', ttl: null, burnAfter: this.burnMode ? this.burnSeconds : 0, isAnonymous: this.anonymousMode};
      if (window.socket && window.socket.connected) window.socket.emit('send-message', message);
      else await fetch('/api/chats/' + message.chatId + '/messages', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(message)});
      const localMessage = {id: 'local-' + Date.now(), chatId: message.chatId, senderId: Auth.getCurrentUserId(), galNumber: Auth.currentUser?.galNumber || '', nickname: Auth.currentUser?.nickname || '', encryptedContent: content, type: 'voice', metadata: {duration}, createdAt: new Date().toISOString()};
      if (!this.chatMessages[message.chatId]) this.chatMessages[message.chatId] = [];
      this.chatMessages[message.chatId].push(localMessage);
      this.displayMessage(localMessage, true);
      document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
    };
    reader.readAsDataURL(blob);
  },
  togglePlayVoice(element, audioUrl) {
    const existing = element.querySelector('audio');
    if (existing) { if (existing.paused) { existing.play(); element.classList.add('playing'); } else { existing.pause(); element.classList.remove('playing'); } return; }
    const audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.onended = () => element.classList.remove('playing');
    audio.onerror = () => UI.showToast('音频播放失败');
    element.appendChild(audio);
    audio.play();
    element.classList.add('playing');
  },
  formatFileSize(bytes) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; },
  handleMessageBurned(data) {
    const messageEl = document.querySelector('[data-message-id="' + data.messageId + '"]');
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-content');
      if (contentEl) { contentEl.innerHTML = '<span class="burned-message">此消息已销毁</span>'; contentEl.classList.add('burned'); }
      messageEl.classList.add('burned');
      messageEl.dataset.burned = 'true';
    }
  },
  handleMessageRead(data) {
    const messageEl = document.querySelector('[data-message-id="' + data.messageId + '"]');
    if (messageEl && messageEl.dataset.burnAfter && !messageEl.dataset.burned) this.startBurnCountdown(messageEl, parseInt(messageEl.dataset.burnAfter));
  },
  startBurnCountdown(messageEl, seconds) {
    const countdownEl = messageEl.querySelector('.burn-countdown');
    if (!countdownEl) return;
    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.textContent = remaining + 's';
      if (remaining <= 0) {
        clearInterval(interval);
        if (messageEl && !messageEl.dataset.burned) {
          const contentEl = messageEl.querySelector('.message-content');
          if (contentEl) { contentEl.innerHTML = '<span class="burned-message">此消息已销毁</span>'; contentEl.classList.add('burned'); }
          messageEl.classList.add('burned');
          messageEl.dataset.burned = 'true';
        }
      }
    }, 1000);
  },
  showRedPacketPanel() {
    const panel = document.getElementById('redpacket-panel');
    if (!panel) return;
    this.closeAllPanels();
    panel.classList.remove('hidden');
  },
  async sendRedPacket() {
    const amount = parseFloat(document.getElementById('rp-amount').value);
    const count = parseInt(document.getElementById('rp-count').value) || 1;
    const type = document.querySelector('#rp-type-normal.active') ? 'normal' : 'random';
    const message = document.getElementById('rp-message').value || '恭喜发财，大吉大利';
    if (!amount || amount <= 0) { UI.showToast('请输入有效金额'); return; }
    if (!count || count <= 0) { UI.showToast('请输入有效个数'); return; }
    try {
      const response = await fetch('/api/red-packets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({chatId: this.currentChat.id, senderId: Auth.getCurrentUserId(), amount, count, type, message})
      });
      const data = await response.json();
      if (data.success) { this.closeAllPanels(); UI.showToast('红包已发送'); Wallet && Wallet.loadBalance && Wallet.loadBalance(); }
      else UI.showToast(data.error || '发送红包失败');
    } catch (error) { console.error('发送红包失败:', error); UI.showToast('发送红包失败'); }
  },
  async claimRedPacket(redPacketId) {
    try {
      const response = await fetch('/api/red-packets/' + redPacketId + '/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({userId: Auth.getCurrentUserId()})
      });
      const data = await response.json();
      if (data.success) { this.showRedPacketResult(data); Wallet && Wallet.loadBalance && Wallet.loadBalance(); }
      else UI.showToast(data.error || '领取红包失败');
    } catch (error) { console.error('领取红包失败:', error); UI.showToast('领取红包失败'); }
  },
  showRedPacketResult(data) {
    UI.showModal('领取结果', '<div class="redpacket-result"><div class="rp-amount">' + data.amount + ' 星币</div><div class="rp-type">' + (data.type === 'random' ? '随机红包' : '普通红包') + '</div><div class="rp-message">' + (data.message || '') + '</div></div>', [{text: '确定', class: 'btn-primary'}]);
  },
  handleRedPacketClick(redPacketId, claimed, isOwner) {
    if (!redPacketId) return;
    if (claimed || isOwner) this.viewRedPacketDetail(redPacketId);
    else this.claimRedPacket(redPacketId);
  },
  async viewRedPacketDetail(redPacketId) {
    try {
      const response = await fetch('/api/red-packets/' + redPacketId);
      const data = await response.json();
      if (data.success) {
        const rp = data.redPacket;
        const claims = data.claims || [];
        let claimsHtml = claims.map(function(c) { return '<div class="rp-claim-item"><span>' + c.nickname + '</span><span>' + c.amount + '</span></div>'; }).join('');
        UI.showModal('红包详情', '<div class="rp-detail"><div class="rp-detail-header"><span class="rp-icon">🧧</span><div class="rp-info"><div class="rp-amount">' + rp.amount + ' 星币</div><div class="rp-count">' + rp.claimed_count + '/' + rp.count + ' 领取</div></div></div><div class="rp-message">' + rp.message + '</div><div class="rp-claims">' + (claimsHtml || '<div class="rp-no-claims">暂无领取记录</div>') + '</div></div>', [{text: '确定', class: 'btn-primary'}]);
      }
    } catch (error) { console.error('获取红包详情失败:', error); }
  },

  /**
   * 发送消息
   */
  async sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content || !this.currentChat) return;
    
    // 检查消息类型
    const isDestroy = this.burnMode;
    const isAnonymous = this.anonymousMode;
    const ttl = null;
    const burnAfter = isDestroy ? this.burnSeconds : 0;
    
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
        ttl,
        burnAfter,
        isAnonymous
      };
      
      // 附加引用消息
      if (this.quotedMessage) {
        message.quotedContent = this.quotedMessage.encryptedContent?.substring(0, 50) || '';
        message.quotedSender = this.quotedMessage.nickname || '对方';
        this.cancelQuote();
      }
      
      // 通过Socket发送
      const tempId = 'local-' + Date.now();
      message.tempId = tempId;
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
        id: tempId,
        chatId: message.chatId,
        senderId: Auth.getCurrentUserId(),
        galNumber: Auth.currentUser?.galNumber || '',
        nickname: Auth.currentUser?.nickname || '',
        encryptedContent: content,
        type: message.type,
        ttl: message.ttl,
        burnAfter: message.burnAfter,
        isAnonymous: message.isAnonymous,
        createdAt: new Date().toISOString()
      };
      // 标记消息状态为"已发送"
      this.messageStatus[tempId] = 'sent';
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
  /**
   * 显示新消息通知
   */
  showNotification(senderName, message) {
    // 解析消息内容用于预览
    let preview = '新消息';
    try {
      if (message.encryptedContent) {
        const parsed = JSON.parse(message.encryptedContent);
        if (parsed.plain && parsed.content) preview = parsed.content;
        else if (parsed.type === 'image') preview = '[图片]';
        else preview = '[加密消息]';
      }
    } catch(e) {
      if (message.encryptedContent && !message.encryptedContent.includes(':')) {
        preview = message.encryptedContent.substring(0, 20);
      }
    }
    UI.showToast(`${senderName}: ${preview}`);
  },
  
  /**
   * 播放消息提示音
   */
  playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
  },
  
  /**
   * 更新聊天列表未读标记
   */
  updateChatListBadge(chatId) {
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
    if (!chatItem) return;
    const count = this.unreadCounts[chatId] || 0;
    let badge = chatItem.querySelector('.chat-item-badge');
    if (count > 0) {
      if (!badge) {
        const meta = chatItem.querySelector('.chat-item-meta');
        if (meta) {
          badge = document.createElement('span');
          badge.className = 'chat-item-badge';
          meta.appendChild(badge);
        }
      }
      if (badge) badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
      badge.remove();
    }
  },
  
    closeChat() {
    if (this.isRecording) this.stopRecording();
    if (this.currentChat) {
      // 不再leave-chat房间，保持接收消息
      this.sendStopTyping();
      // 清除当前聊天未读数
      this.unreadCounts[this.currentChat.id] = 0;
      this.updateChatListBadge(this.currentChat.id);
      this.currentChat = null;
    }
    UI.hideChatWindow();
  },
  
  /**
   * 处理收到的消息
   */
  handleNewMessage(message) {
    if (!this.currentChat || this.currentChat.id !== message.chatId) {
      // 不在当前聊天 - 显示通知并增加未读计数
      if (message.senderId !== Auth.getCurrentUserId()) {
        // 增加未读计数
        if (!this.unreadCounts[message.chatId]) this.unreadCounts[message.chatId] = 0;
        this.unreadCounts[message.chatId]++;
        // 更新聊天列表未读标记
        this.updateChatListBadge(message.chatId);
        // 显示通知提示
        const senderName = message.nickname || message.galNumber || '未知用户';
        this.showNotification(senderName, message);
        // 播放提示音
        this.playNotificationSound();
      }
      // 刷新列表
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
        if (localEl) {
          localEl.dataset.messageId = message.id;
          // 更新消息状态为"已送达"
          const statusEl = localEl.querySelector('.message-status');
          if (statusEl) {
            statusEl.textContent = '✓✓';
            statusEl.className = 'message-status msg-delivered';
          }
        }
        // 转移消息状态
        this.messageStatus[message.id] = 'delivered';
        delete this.messageStatus[localMsg.id];
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
    Chat.handleMessageRead(data);
    const messageEl = document.querySelector('[data-message-id="' + data.messageId + '"] .message-status');
    if (messageEl) {
      messageEl.textContent = '✓✓';
      messageEl.className = 'message-status msg-read';
    }
    // 更新消息状态缓存
    Chat.messageStatus[data.messageId] = 'read';
  });
  
  // 消息送达服务器确认
  s.on('message-sent', (data) => {
    const { tempId, messageId, createdAt } = data;
    if (tempId && Chat.messageStatus[tempId] === 'sent') {
      Chat.messageStatus[tempId] = 'delivered';
      // 更新本地消息的DOM状态
      const localEl = document.querySelector(`[data-message-id="${tempId}"]`);
      if (localEl) {
        localEl.dataset.messageId = messageId;
        const statusEl = localEl.querySelector('.message-status');
        if (statusEl) {
          statusEl.textContent = '✓✓';
          statusEl.className = 'message-status msg-delivered';
        }
      }
      // 转移状态缓存
      Chat.messageStatus[messageId] = 'delivered';
      delete Chat.messageStatus[tempId];
    }
  });
  s.on('message-burned', (data) => { Chat.handleMessageBurned(data); });
}

window.registerSocketEvents = registerSocketEvents;

// 导出聊天模块
window.Chat = Chat;

// ==================== V3.0 工具栏增强功能 ====================

// 表情分类数据
const EMOJI_CATEGORIES = {
  '常用': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤔','🤭','🤫','🤥'],
  '手势': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️'],
  '心形': ['💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','❤️‍🔥','❤️‍🔥'],
  '动物': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  '食物': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','🍵','☕','🫖','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥣','🥡','🥢','🧂']
};

// 翻译语言列表
const TRANSLATE_LANGS = [
  { code: 'zh', name: '中文' },
  { code: 'zh-TW', name: '中文繁体' },
  { code: 'en', name: '英语' },
  { code: 'en-GB', name: '英式英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'ru', name: '俄语' },
  { code: 'ar', name: '阿拉伯语' }
];

// 扩展Chat对象
Object.assign(Chat, {
  // 表情相关
  currentEmojiCategory: '常用',
  
  /**
   * 切换表情面板
   */
  toggleEmojiPanel() {
    const panel = document.getElementById('emoji-panel');
    if (!panel) return;
    
    const wasOpen = !panel.classList.contains('hidden');
    this.closeAllPanels();
    
    if (wasOpen) {
      // 面板之前是打开的，关闭即可
    } else {
      panel.classList.remove('hidden');
      this.renderEmojiPanel();
    }
  },
  
  /**
   * 渲染表情面板
   */
  renderEmojiPanel() {
    const container = document.getElementById('emoji-grid');
    const tabs = document.getElementById('emoji-tabs');
    if (!container || !tabs) return;
    
    // 渲染分类标签
    tabs.innerHTML = Object.keys(EMOJI_CATEGORIES).map(cat => `
      <button class="emoji-tab ${cat === this.currentEmojiCategory ? 'active' : ''}" data-category="${cat}">${cat}</button>
    `).join('');
    
    // 绑定标签点击
    tabs.querySelectorAll('.emoji-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentEmojiCategory = tab.dataset.category;
        this.renderEmojiGrid();
        tabs.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
    
    this.renderEmojiGrid();
  },
  
  /**
   * 渲染表情网格
   */
  renderEmojiGrid() {
    const container = document.getElementById('emoji-grid');
    if (!container) return;
    
    const emojis = EMOJI_CATEGORIES[this.currentEmojiCategory] || [];
    container.innerHTML = emojis.map(emoji => `
      <button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
    `).join('');
    
    // 绑定表情点击
    container.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.insertEmoji(btn.dataset.emoji);
      });
    });
  },
  
  /**
   * 插入表情到输入框
   */
  insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    if (input) {
      input.value += emoji;
      input.focus();
    }
  },
  
  // 翻译相关
  selectedTranslateLang: 'en',
  
  /**
   * 切换翻译面板
   */
  toggleTranslatePanel() {
    const panel = document.getElementById('translate-panel');
    if (!panel) return;
    
    this.closeAllPanels();
    
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      this.renderTranslatePanel();
    } else {
      panel.classList.add('hidden');
    }
  },
  
  /**
   * 渲染翻译面板
   */
  renderTranslatePanel() {
    const langs = document.getElementById('translate-langs');
    if (!langs) return;
    
    langs.innerHTML = TRANSLATE_LANGS.map(lang => `
      <button class="lang-btn ${lang.code === this.selectedTranslateLang ? 'selected' : ''}" data-lang="${lang.code}">${lang.name}</button>
    `).join('');
    
    langs.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedTranslateLang = btn.dataset.lang;
        langs.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  },
  
  /**
   * 执行翻译
   */
  async doTranslate() {
    const input = document.getElementById('translate-input');
    const text = input?.value.trim();
    const fromLang = 'auto';
    const toLang = this.selectedTranslateLang;
    
    if (!text) {
      UI.showToast('请输入要翻译的文字');
      return;
    }
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: fromLang, to: toLang })
      });
      
      const data = await response.json();
      
      if (data.success) {
        const resultInput = document.getElementById('translate-result');
        if (resultInput) {
          resultInput.value = data.translatedText;
        }
      } else {
        UI.showToast('翻译失败');
      }
    } catch (error) {
      console.error('翻译失败:', error);
      UI.showToast('翻译请求失败');
    }
  },
  
  /**
   * 插入翻译结果到输入框
   */
  insertTranslation() {
    const resultInput = document.getElementById('translate-result');
    const messageInput = document.getElementById('message-input');
    
    if (resultInput && messageInput) {
      messageInput.value = resultInput.value;
      messageInput.focus();
      this.closeAllPanels();
    }
  },
  
  // 语音录制相关
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  recordingStartTime: null,
  
  /**
   * 切换语音录制
   */
  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  },
  
  /**
   * 开始录音
   */
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        this.audioChunks.push(e.data);
      };
      
      this.mediaRecorder.onstop = () => {
        this.sendVoiceMessage();
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      
      // 显示录音UI
      const timer = document.getElementById('voice-timer');
      if (timer) {
        timer.classList.remove('hidden');
        this.updateRecordingTime();
      }
      
      // 更新按钮状态
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn) {
        voiceBtn.classList.add('recording');
      }
    } catch (error) {
      console.error('无法访问麦克风:', error);
      UI.showToast('无法访问麦克风，请检查权限设置');
    }
  },
  
  /**
   * 停止录音
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      const timer = document.getElementById('voice-timer');
      if (timer) {
        timer.classList.add('hidden');
      }
      
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn) {
        voiceBtn.classList.remove('recording');
      }
    }
  },
  
  /**
   * 更新录音时间显示
   */
  updateRecordingTime() {
    if (!this.isRecording) return;
    
    const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const durationEl = document.getElementById('voice-duration');
    if (durationEl) {
      durationEl.textContent = display;
    }
    
    requestAnimationFrame(() => this.updateRecordingTime());
  },
  
  /**
   * 发送语音消息
   */
  async sendVoiceMessage() {
    if (this.audioChunks.length === 0 || !this.currentChat) return;
    
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    
    reader.onloadend = () => {
      const base64 = reader.result;
      
      // 通过Socket发送
      if (window.socket && window.socket.connected) {
        window.socket.emit('send-message', {
          chatId: this.currentChat.id,
          senderId: Auth.getCurrentUserId(),
          encryptedContent: base64,
          type: 'voice',
          burnAfter: 0,
          isAnonymous: false
        });
      }
      
      // 本地显示
      const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      const localMessage = {
        id: 'local-' + Date.now(),
        chatId: this.currentChat.id,
        senderId: Auth.getCurrentUserId(),
        galNumber: Auth.currentUser?.galNumber || '',
        nickname: Auth.currentUser?.nickname || '',
        encryptedContent: base64,
        type: 'voice',
        duration,
        createdAt: new Date().toISOString()
      };
      
      this.displayMessage(localMessage, true);
    };
    
    reader.readAsDataURL(blob);
  },
  
  // 阅后即焚相关
  burnMode: false,
  burnSeconds: 30,
  
  /**
   * 切换阅后即焚面板
   */
  toggleBurnPanel() {
    const panel = document.getElementById('burn-panel');
    if (!panel) return;
    
    this.closeAllPanels();
    
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  },
  
  /**
   * 设置阅后即焚时间
   */
  setBurnTime(seconds) {
    this.burnSeconds = seconds;
    this.burnMode = true;
    const destroyBtn = document.getElementById('btn-destroy');
    if (destroyBtn) {
      destroyBtn.classList.add('active');
    }
    this.closeAllPanels();
    
    // 显示倒计时
    const timer = document.getElementById('destroy-timer');
    if (timer) {
      timer.classList.remove('hidden');
      timer.dataset.ttl = seconds;
      timer.textContent = `🔥 ${seconds}秒后自动销毁`;
    }
  },
  
  // 匿踪模式
  anonymousMode: false,
  
  /**
   * 切换匿踪模式
   */
  toggleAnonymousMode() {
    this.anonymousMode = !this.anonymousMode;
    
    const anonymousBtn = document.getElementById('btn-anonymous');
    const anonymousPanel = document.getElementById('anonymous-panel');
    const anonymousHint = document.getElementById('anonymous-hint');
    
    if (anonymousBtn) {
      anonymousBtn.classList.toggle('active', this.anonymousMode);
    }
    
    if (anonymousPanel) {
      if (this.anonymousMode) {
        anonymousPanel.classList.remove('hidden');
        if (anonymousHint) {
          anonymousHint.textContent = '👁️ 匿踪信息 — 发送的消息将不显示发送者信息';
        }
      } else {
        anonymousPanel.classList.add('hidden');
      }
    }
  },
  
  // 关闭所有面板
  closeAllPanels() {
    const panels = ['emoji-panel', 'translate-panel', 'burn-panel', 'redpacket-panel'];
    panels.forEach(id => {
      const panel = document.getElementById(id);
      if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
      }
    });
  }
});

// 绑定翻译按钮事件
document.addEventListener('DOMContentLoaded', () => {
  const translateBtn = document.getElementById('btn-do-translate');
  if (translateBtn) {
    translateBtn.addEventListener('click', () => {
      Chat.doTranslate();
    });
  }
  
  const insertBtn = document.getElementById('btn-insert-translation');
  if (insertBtn) {
    insertBtn.addEventListener('click', () => {
      Chat.insertTranslation();
    });
  }
});


// ==================== V3.0 超级商业群组功能扩展 ====================

// 扩展Chat对象，添加群组模式相关功能
Object.assign(Chat, {
  /**
   * 检查用户是否可以发言（在会议群中）
   */
  canSendMessage() {
    if (!this.currentChat || this.currentChat.type !== 'group') {
      return { allowed: true, reason: '' };
    }
    
    const currentUserId = Auth.getCurrentUserId();
    const member = this.currentChat.members?.find(m => m.id === currentUserId);
    const isAdmin = member && ['owner', 'admin'].includes(member.role);
    
    // 检查群模式
    if (this.currentChat.groupMode === 'meeting') {
      // 会议群：只有管理员可以发言
      if (!isAdmin) {
        return { allowed: false, reason: 'meeting' };
      }
    }
    
    return { allowed: true, reason: '' };
  },
  
  /**
   * 更新群组模式状态
   */
  updateGroupMode(mode) {
    if (!this.currentChat) return;
    
    this.currentChat.groupMode = mode;
    
    // 更新聊天窗口头部状态
    const chatInfoEl = document.getElementById('chat-info');
    if (chatInfoEl) {
      const statusEl = chatInfoEl.querySelector('.chat-status');
      if (statusEl) {
        const modeNames = {
          'open': '开放群',
          'meeting': '会议群',
          'quiet': '防互扰群'
        };
        const modeIcons = {
          'open': '🟢',
          'meeting': '🔵',
          'quiet': '🟣'
        };
        const currentCount = this.currentChat.members?.length || 0;
        statusEl.innerHTML = `${modeIcons[mode] || ''} ${modeNames[mode] || ''} ${currentCount}人`;
      }
    }
    
    // 更新输入框状态
    this.updateInputState();
  },
  
  /**
   * 更新输入框状态
   */
  updateInputState() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('btn-send-message');
    const inputArea = document.querySelector('.chat-input-area');
    
    if (!this.currentChat || this.currentChat.type !== 'group') {
      // 私聊，正常状态
      if (input) {
        input.disabled = false;
        input.placeholder = '输入消息...';
      }
      if (inputArea) {
        inputArea.classList.remove('input-disabled');
      }
      return;
    }
    
    const permission = this.canSendMessage();
    
    if (!permission.allowed) {
      if (permission.reason === 'meeting') {
        // 会议群，普通成员不能发言
        if (input) {
          input.disabled = true;
          input.placeholder = '🔵 当前为会议模式，仅管理员可发言';
        }
        if (inputArea) {
          inputArea.classList.add('input-disabled');
        }
        UI.showToast('🔵 会议群模式：普通成员暂时无法发言');
      }
    } else {
      if (input) {
        input.disabled = false;
        input.placeholder = '输入消息...';
      }
      if (inputArea) {
        inputArea.classList.remove('input-disabled');
      }
    }
  },
  
  /**
   * 加入群聊
   */
  async joinChat(chatId) {
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      const data = await response.json();
      
      if (data.success) {
        // 刷新聊天列表
        this.loadChatList();
      }
    } catch (error) {
      console.error('加入群组失败:', error);
    }
  },
  
  /**
   * 获取群组公告
   */
  async getAnnouncement(chatId) {
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      const data = await response.json();
      
      if (data.success && data.chat.announcement) {
        return data.chat.announcement;
      }
    } catch (error) {
      console.error('获取公告失败:', error);
    }
    return null;
  }
});

// 覆盖原有的sendMessage，添加群模式检查
const originalSendMessage = Chat.sendMessage;
Chat.sendMessage = async function() {
  // 检查群模式权限
  const permission = this.canSendMessage();
  if (!permission.allowed) {
    if (permission.reason === 'meeting') {
      UI.showToast('🔵 会议群模式：只有管理员可以发言');
    }
    return;
  }
  
  // 调用原始发送函数
  return originalSendMessage.apply(this, arguments);
};

// 覆盖原有的openChat，添加群模式初始化
const originalOpenChat = Chat.openChat;
Chat.openChat = async function(chatId, contactInfo = null) {
  // 调用原始打开函数
  await originalOpenChat.apply(this, arguments);
  
  // 如果是群聊，获取并显示群公告
  if (this.currentChat && this.currentChat.type === 'group') {
    // 获取群组详情
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      const data = await response.json();
      
      if (data.success) {
        this.currentChat.groupMode = data.chat.groupMode;
        this.currentChat.announcement = data.chat.announcement;
        
        // 更新群模式状态
        this.updateGroupMode(data.chat.groupMode);
        
        // 如果有公告，显示在聊天顶部
        if (data.chat.announcement) {
          this.showAnnouncementBanner(data.chat.announcement);
        }
      }
    } catch (error) {
      console.error('获取群组详情失败:', error);
    }
  }
};

// 覆盖loadChatInfo，保留群组信息
const originalLoadChatInfo = Chat.loadChatInfo;
Chat.loadChatInfo = async function(chatId) {
  await originalLoadChatInfo.apply(this, arguments);
  
  // 获取群组详情
  try {
    const response = await fetch(`/api/chats/${chatId}`);
    const data = await response.json();
    
    if (data.success && data.chat) {
      this.currentChat.groupMode = data.chat.groupMode;
      this.currentChat.announcement = data.chat.announcement;
    }
  } catch (error) {
    console.error('获取群组详情失败:', error);
  }
};

/**
 * 显示群公告横幅
 */
Chat.showAnnouncementBanner = function(announcement) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  
  // 检查是否已显示公告
  const existingBanner = messagesEl.querySelector('.announcement-banner');
  if (existingBanner) {
    existingBanner.remove();
  }
  
  // 创建公告横幅
  const banner = document.createElement('div');
  banner.className = 'announcement-banner';
  banner.innerHTML = `
    <div class="banner-icon">📌</div>
    <div class="banner-content">
      <div class="banner-title">群公告</div>
      <div class="banner-text">${UI.escapeHtml(announcement)}</div>
    </div>
  `;
  
  // 插入到消息列表顶部
  messagesEl.insertBefore(banner, messagesEl.firstChild);
};

// 导出增强功能
window.SuperChat = Chat;

// ==================== 消息操作菜单 ====================
Object.assign(Chat, {
  showMessageMenu(messageEl, message, isSent) {
    // 关闭已存在的菜单
    this.closeMessageMenu();
    
    // 获取消息内容用于后续操作
    const content = this.getMessageContent(message);
    if (!content) {
      UI.showToast("无法获取消息内容");
      return;
    }
    
    // 构建菜单项
    const menuItems = [
      { icon: "📋", text: "复制", action: () => this.copyMessage(message, content) },
      { icon: "💬", text: "引用回复", action: () => this.quoteReply(message, content) },
      { icon: "🔄", text: "转发", action: () => this.forwardMessage(message, content) },
      { icon: "🌐", text: "翻译", action: () => this.translateMessage(messageEl, message, content) },
    ];
    
    // 只有发送者且2分钟内才能撤回
    if (isSent) {
      const messageTime = new Date(message.createdAt);
      const now = new Date();
      const diffMinutes = (now - messageTime) / 1000 / 60;
      
      if (diffMinutes <= 2) {
        menuItems.push({ icon: "🗑️", text: "撤回", action: () => this.recallMessage(messageEl, message), danger: true });
      }
    }
    
    // 创建菜单
    const menu = document.createElement("div");
    menu.className = "message-action-menu";
    menu.innerHTML = menuItems.map(item => {
      return '<div class="menu-item ' + (item.danger ? "danger" : "") + '" data-action="' + item.text + '">' +
        '<span class="menu-icon">' + item.icon + '</span>' +
        '<span class="menu-text">' + item.text + '</span>' +
      '</div>';
    }).join("");
    
    // 绑定点击事件
    menu.querySelectorAll(".menu-item").forEach((item, index) => {
      item.addEventListener("click", () => {
        menuItems[index].action();
        this.closeMessageMenu();
      });
    });
    
    // 定位菜单
    const rect = messageEl.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = (rect.left + rect.width / 2) + "px";
    menu.style.top = (rect.top - 10) + "px";
    menu.style.transform = "translate(-50%, -100%)";
    
    // 存储当前菜单引用
    this.currentMessageMenu = menu;
    this.currentMessage = message;
    this.currentMessageEl = messageEl;
    
    document.body.appendChild(menu);
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener("click", this.boundCloseMenu);
    }, 0);
  },
  
  /**
   * 关闭消息菜单
   */
  closeMessageMenu() {
    if (this.currentMessageMenu) {
      this.currentMessageMenu.remove();
      this.currentMessageMenu = null;
    }
    document.removeEventListener("click", this.boundCloseMenu);
  },
  
  /**
   * 获取消息内容
   */
  getMessageContent(message) {
    if (message.encryptedContent) {
      try {
        if (message.encryptedContent.includes(":") && !message.encryptedContent.startsWith("{")) {
          const parts = message.encryptedContent.split(":");
          if (parts.length >= 2) {
            if (NovaCrypto && NovaCrypto.privateKey) {
              const [iv, ciphertext, senderPublicKey] = parts;
              try {
                const senderKey = JSON.parse(senderPublicKey);
                return NovaCrypto.decryptMessage(iv, ciphertext, senderKey);
              } catch (e) {
                return null;
              }
            }
          }
        } else if (message.encryptedContent.startsWith("{")) {
          const parsed = JSON.parse(message.encryptedContent);
          if (parsed.plain) return parsed.content;
          if (parsed.type === "image") return "[图片]";
        } else {
          return message.encryptedContent;
        }
      } catch (e) {}
    }
    return null;
  },
  
  /**
   * 1. 复制消息
   */
  async copyMessage(message, content) {
    try {
      await navigator.clipboard.writeText(content);
      UI.showToast("已复制到剪贴板");
    } catch (error) {
      console.error("复制失败:", error);
      UI.showToast("复制失败，请重试");
    }
  },
  
  /**
   * 2. 引用回复
   */
  quoteReply(message, content) {
    this.quotedMessage = message;
    this.showQuoteBar(message, content);
    UI.showToast("点击发送回复引用");
  },
  
  /**
   * 显示引用条
   */
  showQuoteBar(message, content) {
    this.cancelQuote();
    
    const senderName = message.nickname || (message.senderId === Auth.getCurrentUserId() ? "我" : "对方");
    const previewContent = content.length > 50 ? content.substring(0, 50) + "..." : content;
    
    const quoteBar = document.createElement("div");
    quoteBar.className = "quote-bar";
    quoteBar.id = "quote-bar";
    quoteBar.innerHTML = '<div class="quote-content">' +
      '<span class="quote-label">回复 ' + senderName + '：</span>' +
      '<span class="quote-text">' + UI.escapeHtml(previewContent) + '</span>' +
    '</div>' +
    '<button class="quote-cancel" id="btn-cancel-quote">✕</button>';
    
    quoteBar.querySelector("#btn-cancel-quote").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelQuote();
    });
    
    const inputArea = document.querySelector(".chat-input-area");
    const inputRow = document.querySelector(".input-row");
    if (inputRow && inputArea) {
      inputArea.insertBefore(quoteBar, inputRow);
    }
    
    const input = document.getElementById("message-input");
    if (input) input.focus();
  },
  
  /**
   * 取消引用
   */
  cancelQuote() {
    const quoteBar = document.getElementById("quote-bar");
    if (quoteBar) {
      quoteBar.remove();
    }
    this.quotedMessage = null;
  },
  
  /**
   * 3. 转发消息
   */
  async forwardMessage(message, content) {
    const chatList = this.chatMessages || {};
    const chatIds = Object.keys(chatList);
    
    if (chatIds.length === 0) {
      try {
        const response = await fetch("/api/chats", {
          headers: { "Authorization": "Bearer " + Auth.getToken() }
        });
        const data = await response.json();
        
        if (data.success && data.chats && data.chats.length > 0) {
          this.showForwardModal(message, content, data.chats);
        } else {
          UI.showToast("暂无聊天可转发");
        }
      } catch (error) {
        console.error("获取聊天列表失败:", error);
        UI.showToast("获取聊天列表失败");
      }
      return;
    }
    
    const chats = chatIds.map(id => {
      const chat = this.chatMessages[id]?.chatInfo || { id, name: "聊天 " + id };
      return chat;
    });
    
    this.showForwardModal(message, content, chats);
  },
  
  /**
   * 显示转发选择弹窗
   */
  showForwardModal(message, content, chats) {
    const chatOptions = chats.map(chat => {
      const name = chat.name || chat.groupName || ("聊天 " + chat.id);
      const avatar = chat.avatarEmoji || "💬";
      return '<div class="forward-chat-item" data-chat-id="' + chat.id + '">' +
        '<span class="forward-chat-avatar">' + avatar + '</span>' +
        '<span class="forward-chat-name">' + name + '</span>' +
      '</div>';
    }).join("");
    
    UI.showModal("转发消息", '<div class="forward-modal">' +
      '<div class="forward-preview">' + UI.escapeHtml(content.length > 100 ? content.substring(0, 100) + "..." : content) + '</div>' +
      '<div class="forward-chat-list">' + chatOptions + '</div>' +
    '</div>', [
      { text: "取消", class: "btn-secondary" }
    ]);
    
    document.querySelectorAll(".forward-chat-item").forEach(item => {
      item.addEventListener("click", () => {
        const chatId = parseInt(item.dataset.chatId);
        this.forwardToChat(message, content, chatId);
      });
    });
  },
  
  /**
   * 执行转发到指定聊天
   */
  async forwardToChat(message, content, chatId) {
    try {
      const forwardMessage = {
        chatId: chatId,
        senderId: Auth.getCurrentUserId(),
        encryptedContent: JSON.stringify({ plain: true, content }),
        type: "forwarded",
        originalMessageId: message.id
      };
      
      if (window.socket && window.socket.connected) {
        window.socket.emit("send-message", forwardMessage);
        UI.showToast("消息已转发");
      } else {
        const response = await fetch("/api/chats/" + chatId + "/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + Auth.getToken()
          },
          body: JSON.stringify(forwardMessage)
        });
        
        if (response.ok) {
          UI.showToast("消息已转发");
        } else {
          UI.showToast("转发失败");
        }
      }
    } catch (error) {
      console.error("转发失败:", error);
      UI.showToast("转发失败，请重试");
    }
  },
  
  /**
   * 4. 翻译消息
   */
  async translateMessage(messageEl, message, content) {
    const existingTranslation = messageEl.querySelector(".message-translation");
    if (existingTranslation) {
      existingTranslation.classList.toggle("visible");
      return;
    }
    
    const translationEl = document.createElement("div");
    translationEl.className = "message-translation";
    translationEl.innerHTML = '<span class="translating">🌐 翻译中...</span>';
    messageEl.appendChild(translationEl);
    translationEl.classList.add("visible");
    
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          from: "auto",
          to: "zh"
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.translatedText) {
        translationEl.innerHTML = '<span class="trans-label">🌐 翻译：</span>' + UI.escapeHtml(data.translatedText);
      } else {
        translationEl.innerHTML = '<span class="trans-error">翻译失败，请重试</span>';
      }
    } catch (error) {
      console.error("翻译失败:", error);
      translationEl.innerHTML = '<span class="trans-error">翻译请求失败</span>';
    }
  },
  
  /**
   * 5. 撤回消息
   */
  async recallMessage(messageEl, message) {
    const messageTime = new Date(message.createdAt);
    const now = new Date();
    const diffMinutes = (now - messageTime) / 1000 / 60;
    
    if (diffMinutes > 2) {
      UI.showToast("消息已超过2分钟，无法撤回");
      return;
    }
    
    UI.showConfirm("撤回消息", "确定要撤回这条消息吗？", async () => {
      try {
        if (window.socket && window.socket.connected) {
          window.socket.emit("recall-message", {
            messageId: message.id,
            chatId: this.currentChat?.id,
            userId: Auth.getCurrentUserId()
          });
        } else {
          const response = await fetch("/api/messages/" + message.id + "/recall", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + Auth.getToken()
            },
            body: JSON.stringify({
              chatId: this.currentChat?.id,
              userId: Auth.getCurrentUserId()
            })
          });
          
          if (!response.ok) {
            throw new Error("撤回失败");
          }
        }
        
        const contentDiv = messageEl.querySelector(".message-content");
        if (contentDiv) {
          contentDiv.textContent = "此消息已撤回";
          contentDiv.classList.add("recalled");
        }
        messageEl.dataset.recalled = "true";
        
        const translation = messageEl.querySelector(".message-translation");
        if (translation) translation.remove();
        
        if (this.chatMessages[this.currentChat?.id]) {
          const msgIndex = this.chatMessages[this.currentChat.id].findIndex(m => m.id === message.id);
          if (msgIndex !== undefined && msgIndex >= 0) {
            this.chatMessages[this.currentChat.id][msgIndex].isRecalled = true;
            this.chatMessages[this.currentChat.id][msgIndex].encryptedContent = "[此消息已撤回]";
          }
        }
        
        UI.showToast("消息已撤回");
      } catch (error) {
        console.error("撤回失败:", error);
        UI.showToast("撤回失败，请重试");
      }
    });
  }

});

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
  unreadCounts: {}, // chatId -> count
  messageStatus: {}, // messageId -> status
  translations: {}, // messageId -> translatedText
  burnSeconds: 30,
  burnMode: false,
  anonymousMode: false,
  selectedTargetLang: 'zh',
  selectedTranslateLang: 'en',
  quotedMessage: null,
  isRecording: false,
  audioChunks: [],
  recordingSeconds: 0,
  mediaRecorder: null,
  recordingTimer: null,
  recordingStartTime: null,
  currentMessageMenu: null,
  currentMessage: null,
  currentMessageEl: null,
  boundCloseMenu: null,
  pinnedChats: [],
  chatListData: [],
  
  /**
   * 初始化聊天模块
   */
  init() {
    this.pinnedChats = JSON.parse(localStorage.getItem('nova_pinned_chats') || '[]');
    this.messageStatus = this.messageStatus || {};
    this.bindEvents();
    this.loadChatList();
    // 图片预览代理事件（避免XSS）
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && e.target.dataset.preview) {
          e.stopPropagation();
          UI.previewImage(e.target.src);
        }
      });
    }
    // 启动消息轮询兜底
    this.startMessagePolling();
    // 请求浏览器通知权限
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch(e) {}
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
    
    // 聊天信息按钮
    const chatInfoBtn = document.getElementById('btn-chat-info');
    if (chatInfoBtn) {
      chatInfoBtn.addEventListener('click', () => this.showChatInfoPanel());
    }
    
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
          e.target.value = '';  // 允许重复选择同一图片
        }
      });
    }
    
    // 聊天搜索
    const chatSearchInput = document.getElementById('chat-search-input');
    if (chatSearchInput) {
      chatSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const items = document.querySelectorAll('#chat-list .chat-item');
        items.forEach(item => {
          const name = item.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
          const preview = item.querySelector('.chat-item-preview')?.textContent.toLowerCase() || '';
          const match = !query || name.includes(query) || preview.includes(query);
          item.style.display = match ? '' : 'none';
        });
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
    
    // 监听聊天消息滚动 + 点击消息区域关闭面板
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      messagesEl.addEventListener('scroll', () => {
        this.handleMessagesScroll();
      });
      messagesEl.addEventListener('click', () => {
        this.closeAllPanels();
      });
    }
    
    // 点击输入框区域关闭面板
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
      messageInput.addEventListener('focus', () => {
        this.closeAllPanels();
      });
    }
    
    // 输入工具栏按钮点击后自动关闭其他面板（已在各toggle中处理）
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
            // 长按标志，防止长按后触发click
            let longPressed = false;
            let pressTimer;
            
            item.addEventListener('click', () => {
              if (longPressed) {
                longPressed = false;
                return;
              }
              const chatId = parseInt(item.dataset.chatId);
              this.openChat(chatId);
            });
            
            // 长按置顶/删除
            const startPress = () => {
              longPressed = false;
              pressTimer = setTimeout(() => {
                longPressed = true;
                this.togglePinChat(item);
              }, 500);
            };
            const endPress = () => {
              clearTimeout(pressTimer);
            };
            
            item.addEventListener('touchstart', startPress);
            item.addEventListener('touchend', endPress);
            item.addEventListener('mousedown', startPress);
            item.addEventListener('mouseup', endPress);
            item.addEventListener('mouseleave', endPress);
          });
        }
      }
    } catch (error) {
      console.error('加载聊天列表失败:', error);
    }
  },
  
  /**
   * 置顶/取消置顶聊天（显示选项菜单）
   */
  togglePinChat(item) {
    const chatId = parseInt(item.dataset.chatId);
    const isPinned = this.pinnedChats.includes(chatId);
    
    // 获取聊天名称
    const chatName = item.querySelector('.chat-item-name')?.textContent || '此聊天';
    
    UI.showModal('聊天操作', `
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn ${isPinned ? 'btn-secondary' : 'btn-primary'}" style="width:100%" id="opt-pin-chat">
          ${isPinned ? '📌 取消置顶' : '📌 置顶聊天'}
        </button>
        <button class="btn btn-danger" style="width:100%" id="opt-delete-chat">
          🗑️ 删除聊天
        </button>
      </div>
    `, [{ text: '取消', class: 'btn-secondary' }]);
    
    document.getElementById('opt-pin-chat').addEventListener('click', () => {
      UI.closeModal();
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
    });
    
    document.getElementById('opt-delete-chat').addEventListener('click', () => {
      UI.closeModal();
      this.confirmDeleteChat(chatId, chatName);
    });
  },
  
  /**
   * 确认删除聊天
   */
  confirmDeleteChat(chatId, chatName) {
    UI.showConfirm('删除聊天', `确定要删除与 "${chatName}" 的聊天记录吗？此操作不可恢复。`, async () => {
      try {
        await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      } catch (e) {}
      // 从置顶列表移除
      const idx = this.pinnedChats.indexOf(chatId);
      if (idx > -1) this.pinnedChats.splice(idx, 1);
      localStorage.setItem('nova_pinned_chats', JSON.stringify(this.pinnedChats));
      // 刷新列表
      this.loadChatList();
      UI.showToast('聊天已删除 🗑️');
    });
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
    if (window.socket && window.socket.connected) window.socket.emit('join-chat', chatId);
    
    // 加载历史消息
    await this.loadMessages(chatId);
    
    // 显示聊天窗口
    UI.showChatWindow();
    
    // 更新全局状态
    if (window.AppState) AppState.enterChat();
    
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
          try {
            // 检查是否需要添加日期分割线
            const messageDate = new Date(message.createdAt || message.created_at).toDateString();
            if (messageDate !== lastDate) {
              this.addDateDivider(messagesEl, message.createdAt || message.created_at);
              lastDate = messageDate;
            }
            
            await this.displayMessage(message, message.senderId === Auth.getCurrentUserId());
          } catch (msgErr) {
            console.warn('单条消息渲染失败，跳过:', msgErr);
            // 单条失败不影响其他消息显示
          }
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
    try {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${message.type || ''}`;
    messageEl.dataset.messageId = message.id || '';
    messageEl.dataset.senderId = message.senderId || '';
    // 阅后即焚：设置burnAfter dataset供倒计时使用
    const burnAfter = message.burnAfter || message.burn_after || 0;
    if (burnAfter > 0) messageEl.dataset.burnAfter = burnAfter;
    
    // 时间分割线
    try {
      const messages = this.chatMessages[this.currentChat?.id] || [];
      const msgIndex = messages.indexOf(message);
      const prevMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
      if (this.shouldShowTimeDivider && this.shouldShowTimeDivider(message, prevMsg)) {
        this.addTimeDivider(messagesEl, message.createdAt || message.created_at);
      }
    } catch(e) {}
    
    // 解析消息内容 - 每一步都独立try-catch，绝不崩
    let content = '';
    let isEncrypted = false;
    let isImage = false;
    let isRecalled = false;
    
    // 撤回检查
    try {
      isRecalled = !!(message.isRecalled || message.encrypted_content === '[此消息已撤回]' || message.encryptedContent === '[此消息已撤回]');
    } catch(e) {}
    
    if (isRecalled) {
      content = '此消息已撤回';
    } else {
      const raw = message.encryptedContent || message.encrypted_content || '';
      content = raw; // 默认显示原始内容
      
      if (raw) {
        try {
          if (raw.startsWith('{')) {
            // JSON格式
            const parsed = JSON.parse(raw);
            if (parsed.type === 'image' && parsed.content) {
              content = parsed.content;
              isImage = true;
            } else if (parsed.plain && parsed.content) {
              content = parsed.content;
            } else if (parsed.content) {
              content = String(parsed.content);
            }
          } else if (raw.includes(':') && !raw.startsWith('[') && raw.length > 50) {
            // 可能是加密格式 iv:ciphertext:publicKey
            const parts = raw.split(':');
            if (parts.length >= 2 && parts[0].length > 10) {
              isEncrypted = true;
              const iv = parts[0];
              const ciphertext = parts[1];
              const senderPublicKey = parts.slice(2).join(':');
              
              let senderKey = null;
              try { senderKey = this.userPublicKeys[message.senderId]; } catch(e) {}
              if (!senderKey && senderPublicKey) {
                try { senderKey = JSON.parse(senderPublicKey); this.userPublicKeys[message.senderId] = senderKey; } catch(e) {}
              }
              
              if (senderKey && window.NovaCrypto && NovaCrypto.privateKey) {
                try {
                  content = await NovaCrypto.decryptMessage(iv, ciphertext, senderKey);
                  isEncrypted = true;
                } catch(decErr) {
                  content = '🔒 加密消息';
                }
              } else {
                content = '🔒 加密消息';
              }
            }
          }
          // 否则就是普通文本，content = raw
        } catch(parseErr) {
          content = raw; // 解析失败显示原始内容
        }
      }
    }
    
    // 发送者名称
    let senderName = '';
    try { senderName = message.type === 'anonymous' ? '来自星星的你' : (message.nickname || message.galNumber || '未知'); } catch(e) { senderName = '未知'; }
    
    // 时间格式化
    let timeStr = '';
    try { timeStr = UI.formatFullTime(message.createdAt || message.created_at); } catch(e) { timeStr = ''; }
    
    // 构建HTML
    let messageHTML = '';
    
    if (!isSent) {
      messageHTML += `<div class="message-header"><span class="message-sender">${senderName}</span>${isEncrypted ? '<span class="encrypt-icon">🔒</span>' : ''}<span class="message-time">${timeStr}</span></div>`;
    } else {
      messageHTML += `<div class="message-header">${isEncrypted ? '<span class="encrypt-icon">🔒</span>' : ''}<span class="message-time">${timeStr}</span></div>`;
    }
    
    // 消息内容
    if (isRecalled) {
      messageHTML += `<div class="message-content recalled">${UI.escapeHtml(content)}</div>`;
    } else if (isImage) {
      messageHTML += `<div class="message-content"><img src="${content}" class="chat-image" data-preview="true"></div>`;
    } else if (message.type === 'voice') {
      // 语音消息渲染 — 使用data属性+事件委托，避免base64嵌入onclick
      let duration = 0;
      let audioSrc = '';
      try {
        const parsed = JSON.parse(raw);
        duration = parsed.duration || 0;
        audioSrc = parsed.content || '';
      } catch(e) {
        // raw就是base64本身
        audioSrc = content || '';
      }
      const voiceMsgId = 'voice-' + (message.id || Date.now());
      messageHTML += `<div class="message-content voice-message"><div class="voice-message-content" id="${voiceMsgId}" data-audio-src="${audioSrc ? '1' : ''}">
        <span class="voice-icon">🎤</span>
        <div class="voice-waveform"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></div>
        <span class="voice-duration">${duration}秒</span>
      </div></div>`;
    } else if (message.type === 'file') {
      // 文件消息渲染 — 使用data属性+事件委托，避免XSS
      let fileName = '文件', fileSize = '';
      try {
        const parsed = JSON.parse(raw);
        fileName = parsed.fileName || '文件';
        fileSize = Chat.formatFileSize ? Chat.formatFileSize(parsed.fileSize) : '';
      } catch(e) {}
      const fileId = 'file-' + (message.id || Date.now());
      messageHTML += `<div class="message-content file-message"><div class="file-message-content" id="${fileId}" data-file-name="${UI.escapeHtml(fileName)}">
        <span class="file-icon">📎</span>
        <div class="file-info"><div class="file-name">${UI.escapeHtml(fileName)}</div><div class="file-size">${fileSize}</div></div>
      </div></div>`;
    } else if (message.type === 'forwarded') {
      const fwdSafe = typeof UI !== 'undefined' && UI.escapeHtml ? UI.escapeHtml(content) : content.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      messageHTML += `<div class="message-content forwarded"><span class="forward-label">🔄 转发</span>${fwdSafe}</div>`;
    } else if (message.type === 'redpacket') {
      // 红包消息渲染
      let rpAmount = '', rpMessage = '恭喜发财', rpType = 'random', rpId = '';
      try {
        const parsed = JSON.parse(raw);
        rpAmount = parsed.amount || '';
        rpMessage = parsed.message || '恭喜发财';
        rpType = parsed.rpType || 'random';
        rpId = parsed.redPacketId || '';
      } catch(e) {}
      messageHTML += `<div class="message-content redpacket-msg" data-rp-id="${rpId}" data-rp-claimed="false" data-rp-owner="${message.senderId === Auth.getCurrentUserId() ? 'true' : 'false'}">
        <div class="rp-msg-inner"><span class="rp-msg-icon">🧧</span><div class="rp-msg-info"><div class="rp-msg-amount">${rpAmount ? rpAmount + ' 星币' : '红包'}</div><div class="rp-msg-text">${UI.escapeHtml(rpMessage)}</div></div></div>
      </div>`;
    } else {
      const safeContent = typeof UI !== 'undefined' && UI.escapeHtml ? UI.escapeHtml(content) : content.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      messageHTML += `<div class="message-content">${safeContent}</div>`;
    }
    
    // 发送状态
    if (isSent) {
      const status = this.messageStatus[message.id] || 'sent';
      let statusIcon = '✓';
      let statusClass = 'msg-sent';
      if (status === 'delivered') { statusIcon = '✓✓'; statusClass = 'msg-delivered'; }
      if (status === 'read') { statusIcon = '✓✓'; statusClass = 'msg-read'; }
      messageHTML += `<div class="message-status ${statusClass}">${statusIcon}</div>`;
    }
    
    messageEl.innerHTML = messageHTML;
    
    // 阅后即焚进度条
    try {
      if (message.type === 'self-destruct' && message.ttl && !isRecalled) {
        const progressBar = document.createElement('div');
        progressBar.className = 'destroy-progress';
        progressBar.style.animationDuration = `${message.ttl}s`;
        messageEl.appendChild(progressBar);
        setTimeout(() => { this.destroyMessage(message.id); }, message.ttl * 1000);
      }
    } catch(e) {}
    
    // 点击菜单
    try {
      if (!isRecalled) {
        messageEl.addEventListener('click', (e) => {
          if (e.target.tagName === 'IMG') return;
          this.showMessageMenu(messageEl, message, isSent);
        });
      }
    } catch(e) {}
    
    messagesEl.appendChild(messageEl);
    
    // 语音消息音频数据存储+播放事件绑定（避免base64嵌入HTML属性）
    if (message.type === 'voice') {
      let audioSrc = '';
      try {
        const parsed = JSON.parse(raw);
        audioSrc = parsed.content || '';
      } catch(e) {
        audioSrc = content || '';
      }
      const voiceEl = document.getElementById('voice-' + (message.id || ''));
      if (voiceEl && audioSrc) {
        // 存储音频数据到内存映射
        if (!this._voiceAudioMap) this._voiceAudioMap = {};
        this._voiceAudioMap[voiceEl.id] = audioSrc;
        voiceEl.addEventListener('click', () => {
          const src = Chat._voiceAudioMap && Chat._voiceAudioMap[voiceEl.id];
          if (src) Chat.togglePlayVoice(voiceEl, src);
        });
      }
    }
    
    // 文件消息点击事件（事件委托，避免XSS）
    if (message.type === 'file') {
      const fileEl = messageEl.querySelector('.file-message-content');
      if (fileEl) {
        if (!this._fileDataMap) this._fileDataMap = {};
        this._fileDataMap[fileEl.id] = raw;
        fileEl.addEventListener('click', () => {
          const data = Chat._fileDataMap && Chat._fileDataMap[fileEl.id];
          const name = fileEl.dataset.fileName || '文件';
          if (data && UI.downloadFile) UI.downloadFile(data, name);
        });
      }
    }
    
    // 红包消息点击事件
    if (message.type === 'redpacket') {
      const rpEl = messageEl.querySelector('.redpacket-msg');
      if (rpEl) {
        const rpId = rpEl.dataset.rpId;
        const isOwner = rpEl.dataset.rpOwner === 'true';
        const claimed = rpEl.dataset.rpClaimed === 'true';
        rpEl.addEventListener('click', () => {
          if (rpId) this.handleRedPacketClick(parseInt(rpId), claimed, isOwner);
        });
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 标记已读
    try {
      if (!isSent && message.id && window.socket && window.socket.connected) {
        window.socket.emit('message-read', {
          messageId: message.id,
          chatId: this.currentChat?.id,
          userId: Auth.getCurrentUserId()
        });
      }
    } catch(e) {}
    
    } catch (displayErr) {
      // 最终兜底：绝不崩溃，显示原始内容
      try {
        const messagesEl = document.getElementById('chat-messages');
        const errEl = document.createElement('div');
        errEl.className = 'message received';
        const raw = message.encryptedContent || message.encrypted_content || '...';
        const safe = raw.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        errEl.innerHTML = `<div class="message-content">${safe}</div>`;
        messagesEl.appendChild(errEl);
      } catch(e) {}
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
      
      // HTTP POST发送（可靠通道）
      const tempId = 'local-' + Date.now();
      message.tempId = tempId;
      try {
        await fetch(`/api/chats/${message.chatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() },
          body: JSON.stringify(message)
        });
      } catch(e) {
        console.error('图片发送失败:', e);
        UI.showToast('发送图片失败');
        return;
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
  // closeAllPanels 定义在 V3.0 扩展部分（Object.assign）,
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
    try { await fetch('/api/chats/' + message.chatId + '/messages', {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken()}, body: JSON.stringify(message)}); } catch(e) { UI.showToast('发送文件失败'); return; }
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
      this.mediaRecorder.onstop = () => { const blob = new Blob(this.audioChunks, {type: 'audio/webm'}); this.audioChunks = []; this._pendingVoiceBlob = blob; this.sendVoiceMessage(); stream.getTracks().forEach(t => t.stop()); };
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingSeconds = 0;
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn) voiceBtn.classList.add('recording');
      // 显示录音计时器
      const timerEl = document.getElementById('voice-timer');
      const durationEl = document.getElementById('voice-duration');
      if (timerEl) { timerEl.classList.remove('hidden'); }
      if (durationEl) durationEl.textContent = '0:00';
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        if (this.recordingSeconds >= 60) { this.stopRecording(); UI.showToast('录音已达60秒上限'); }
        const dEl = document.getElementById('voice-duration');
        if (dEl) dEl.textContent = this.formatTime(this.recordingSeconds);
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
      if (timerEl) { timerEl.classList.add('hidden'); }
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
      try { await fetch('/api/chats/' + message.chatId + '/messages', {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken()}, body: JSON.stringify(message)}); } catch(e) { UI.showToast('发送语音失败'); return; }
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
    if (!this.currentChat) { UI.showToast('请先打开一个聊天'); return; }
    const amount = parseFloat(document.getElementById('rp-amount').value);
    const count = parseInt(document.getElementById('rp-count').value) || 1;
    const type = document.querySelector('.rp-type-btn.selected')?.dataset.type === 'normal' ? 'normal' : 'random';
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
      if (data.success) {
        this.closeAllPanels();
        UI.showToast('红包已发送');
        // 红包消息已由服务端保存并广播，本地即时显示
        const redPacketId = data.redPacket?.id || data.redPacketId || '';
        const rpContent = JSON.stringify({ type: 'redpacket', amount, count, rpType: type, message, redPacketId });
        const localMessage = {
          id: 'local-rp-' + Date.now(),
          chatId: this.currentChat.id,
          senderId: Auth.getCurrentUserId(),
          galNumber: Auth.currentUser?.galNumber || '',
          nickname: Auth.currentUser?.nickname || '',
          encryptedContent: rpContent,
          type: 'redpacket',
          createdAt: new Date().toISOString()
        };
        if (!this.chatMessages[this.currentChat.id]) this.chatMessages[this.currentChat.id] = [];
        this.chatMessages[this.currentChat.id].push(localMessage);
        this.displayMessage(localMessage, true);
        document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
        if (Wallet && Wallet.updateUI) Wallet.updateUI();
      }
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
      if (data.success) { this.showRedPacketResult(data); Wallet && Wallet.updateUI && Wallet.updateUI(); }
      else UI.showToast(data.error || '领取红包失败');
    } catch (error) { console.error('领取红包失败:', error); UI.showToast('领取红包失败'); }
  },
  showRedPacketResult(data) {
    UI.showModal('领取结果', '<div class="redpacket-result"><div class="rp-amount">' + data.amount + ' 星币</div><div class="rp-type">' + (data.type === 'random' ? '随机红包' : '普通红包') + '</div><div class="rp-message">' + (data.message || '') + '</div></div>', [{text: '确定', class: 'btn-primary'}]);
  },
  handleRedPacketClick(redPacketId, claimed, isOwner) {
    if (!redPacketId || isNaN(parseInt(redPacketId))) {
      UI.showToast('红包信息异常');
      return;
    }
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
    
    const isDestroy = this.burnMode;
    const isAnonymous = this.anonymousMode;
    const burnAfter = isDestroy ? this.burnSeconds : 0;
    
    // ===== 第一步：加密 =====
    let encryptedContent = content;
    try {
      if (!isAnonymous && this.currentChat.type !== 'group') {
        const otherMember = this.currentChat.members?.find(m => m.id !== Auth.getCurrentUserId());
        if (otherMember) {
          let recipientKey = this.userPublicKeys[otherMember.id];
          if (!recipientKey && otherMember.publicKey) {
            try { recipientKey = typeof otherMember.publicKey === 'string' ? JSON.parse(otherMember.publicKey) : otherMember.publicKey; this.userPublicKeys[otherMember.id] = recipientKey; } catch(e) {}
          }
          if (recipientKey && NovaCrypto && NovaCrypto.privateKey) {
            const encrypted = await NovaCrypto.encryptMessage(content, recipientKey);
            const senderPublicKey = JSON.stringify(NovaCrypto.publicKeyJwk);
            encryptedContent = `${encrypted.iv}:${encrypted.ciphertext}:${senderPublicKey}`;
          } else {
            encryptedContent = JSON.stringify({ plain: true, content });
          }
        } else {
          encryptedContent = JSON.stringify({ plain: true, content });
        }
      } else if (this.currentChat.type === 'group') {
        encryptedContent = JSON.stringify({ plain: true, content });
      }
    } catch (encErr) {
      encryptedContent = JSON.stringify({ plain: true, content });
    }
    
    // ===== 第二步：先在本地显示（即时反馈） =====
    const tempId = 'local-' + Date.now();
    const localMessage = {
      id: tempId,
      chatId: this.currentChat.id,
      senderId: Auth.getCurrentUserId(),
      galNumber: Auth.currentUser?.galNumber || '',
      nickname: Auth.currentUser?.nickname || '',
      encryptedContent: content,
      type: isAnonymous ? 'anonymous' : (isDestroy ? 'self-destruct' : 'normal'),
      burnAfter,
      isAnonymous,
      createdAt: new Date().toISOString()
    };
    this.messageStatus[tempId] = 'sending';
    this.displayMessage(localMessage, true);
    if (!this.chatMessages[localMessage.chatId]) this.chatMessages[localMessage.chatId] = [];
    this.chatMessages[localMessage.chatId].push(localMessage);
    input.value = '';
    
    // ===== 第三步：HTTP POST 发送（可靠通道，确保消息入库+广播） =====
    const message = {
      chatId: this.currentChat.id,
      senderId: Auth.getCurrentUserId(),
      encryptedContent,
      type: isAnonymous ? 'anonymous' : (isDestroy ? 'self-destruct' : 'normal'),
      ttl: null,
      burnAfter,
      isAnonymous,
      tempId
    };
    
    if (this.quotedMessage) {
      try { message.quotedContent = this.quotedMessage.encryptedContent?.substring(0, 50) || ''; message.quotedSender = this.quotedMessage.nickname || '对方'; this.cancelQuote(); } catch(e) {}
    }
    
    try {
      const response = await fetch(`/api/chats/${message.chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + Auth.getToken()
        },
        body: JSON.stringify(message)
      });
      const result = await response.json();
      
      if (result.success) {
        // 发送成功 - 更新本地消息ID和状态
        this.messageStatus[tempId] = 'delivered';
        const localEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (localEl && result.message && result.message.id) {
          localEl.dataset.messageId = result.message.id;
          const statusEl = localEl.querySelector('.message-status');
          if (statusEl) {
            statusEl.textContent = '✓✓';
            statusEl.className = 'message-status msg-delivered';
          }
        }
        // 更新缓存中的消息ID
        const cached = this.chatMessages[localMessage.chatId];
        if (cached) {
          const idx = cached.findIndex(m => m.id === tempId);
          if (idx >= 0 && result.message && result.message.id) {
            cached[idx].id = result.message.id;
            this.messageStatus[result.message.id] = 'delivered';
            delete this.messageStatus[tempId];
          }
        }
        // HTTP POST已经触发服务端广播new-message，不需要再socket emit
      } else {
        throw new Error(result.error || '发送失败');
      }
    } catch (sendError) {
      console.error('消息发送失败:', sendError);
      this.messageStatus[tempId] = 'failed';
      const localEl = document.querySelector(`[data-message-id="${tempId}"]`);
      if (localEl) {
        const statusEl = localEl.querySelector('.message-status');
        if (statusEl) {
          statusEl.textContent = '✗';
          statusEl.className = 'message-status msg-failed';
          statusEl.style.color = '#ff4444';
        }
      }
      UI.showToast('发送失败，请重试');
    }
    
    // ===== 第四步：非关键操作 =====
    try { this.sendStopTyping(); } catch(e) {}
    if (isDestroy) {
      try {
        const btnDestroy = document.getElementById('btn-destroy');
        const destroyTimer = document.getElementById('destroy-timer');
        if (btnDestroy) btnDestroy.classList.remove('active');
        if (destroyTimer) destroyTimer.classList.add('hidden');
      } catch(e) {}
    }
    // 刷新聊天列表，确保最新消息预览更新
    try { this.loadChatList(); } catch(e) {}
  },
  
  /**
   * 发送正在输入状态
   */
  sendTypingStatus() {
    if (!window.socket || !window.socket.connected) return;
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
    if (!this.currentChat || !window.socket || !window.socket.connected) return;
    
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
   * 浏览器推送通知（不在聊天页面时可见）
   */
  sendBrowserNotification(senderName, message) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        let preview = '新消息';
        try {
          const raw = message.encryptedContent || '';
          if (raw.startsWith('{')) {
            const parsed = JSON.parse(raw);
            if (parsed.plain && parsed.content) preview = parsed.content.substring(0, 50);
            else if (parsed.type === 'image') preview = '[图片]';
            else preview = '[加密消息]';
          }
        } catch(e) { preview = '新消息'; }
        new Notification(`Nova-OS - ${senderName}`, { body: preview, icon: '/favicon.ico' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch(e) {}
  },
  
  /**
   * 启动消息轮询（Socket断线/后台恢复时的兜底）
   */
  startMessagePolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._lastPollTime = Date.now();
    this._pollTimer = setInterval(() => {
      this.pollNewMessages();
    }, 15000); // 15秒轮询（避免频繁API调用）
  },
  
  stopMessagePolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },
  
  async pollNewMessages() {
    if (!Auth.isLoggedIn()) return;
    try {
      // 刷新聊天列表（检测未读和最新消息）
      this.loadChatList();
      
      // 如果在聊天页面，检查是否有新消息
      if (this.currentChat) {
        const chatId = this.currentChat.id;
        const response = await fetch(`/api/chats/${chatId}/messages?limit=5`);
        const data = await response.json();
        if (data.success && data.messages) {
          const serverMessages = data.messages.reverse();
          const localIds = new Set(
            (this.chatMessages[chatId] || []).map(m => String(m.id))
          );
          for (const msg of serverMessages) {
            if (!localIds.has(String(msg.id))) {
              // 发现新消息，显示
              const isSent = msg.sender_id === Auth.getCurrentUserId();
              const message = {
                id: msg.id,
                chatId: chatId,
                senderId: msg.sender_id,
                galNumber: msg.gal_number || '',
                nickname: msg.nickname || '',
                encryptedContent: msg.encrypted_content,
                type: msg.type || 'normal',
                isRecalled: msg.is_recalled,
                createdAt: msg.created_at
              };
              if (!this.chatMessages[chatId]) this.chatMessages[chatId] = [];
              this.chatMessages[chatId].push(message);
              this.displayMessage(message, isSent);
            }
          }
        }
      }
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
    this.closeAllPanels();
    this.cancelQuote();
    this.disableBurnMode();
    this.anonymousMode = false;
    const anonBtn = document.getElementById('btn-anonymous');
    if (anonBtn) anonBtn.classList.remove('active');
    if (this.currentChat) {
      this.sendStopTyping();
      if (!this.unreadCounts) this.unreadCounts = {};
      this.unreadCounts[this.currentChat.id] = 0;
      this.updateChatListBadge(this.currentChat.id);
      // 离开Socket房间
      if (window.socket && window.socket.connected) {
        window.socket.emit('leave-chat', this.currentChat.id);
      }
      this.currentChat = null;
    }
    // 清理聊天信息面板
    const infoPanel = document.getElementById('chat-info-panel');
    if (infoPanel) infoPanel.remove();
    UI.hideChatWindow();
    // 更新全局状态
    if (window.AppState) {
      AppState.inChat = false;
      AppState.inChatInfo = false;
    }
    // 返回聊天列表时刷新，确保显示最新消息
    this.loadChatList();
    UI.showPage('chats');
  },
  
  /**
   * 处理收到的消息
   */
  handleNewMessage(message) {
    // 如果是自己发送的消息回显，检查是否需要替换本地临时消息
    if (message.senderId === Auth.getCurrentUserId()) {
      if (this.chatMessages[message.chatId]) {
        const localMsg = this.chatMessages[message.chatId].find(m => 
          m.id && m.id.startsWith('local-') && 
          Math.abs(new Date(m.createdAt) - new Date(message.createdAt)) < 15000
        );
        if (localMsg) {
          const localEl = document.querySelector(`[data-message-id="${localMsg.id}"]`);
          if (localEl) {
            localEl.dataset.messageId = message.id;
            const statusEl = localEl.querySelector('.message-status');
            if (statusEl) {
              statusEl.textContent = '✓✓';
              statusEl.className = 'message-status msg-delivered';
            }
          }
          this.messageStatus[message.id] = 'delivered';
          delete this.messageStatus[localMsg.id];
          localMsg.id = message.id;
          return;
        }
      }
      // 如果没有找到本地临时消息，说明可能是HTTP POST已处理的，忽略重复
      if (this.messageStatus[message.id]) return;
    }
    
    // 检查是否已经在UI中显示过
    const existingEl = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingEl) return;
    
    // 不在当前聊天页面 - 显示通知
    if (!this.currentChat || this.currentChat.id !== message.chatId) {
      if (message.senderId !== Auth.getCurrentUserId()) {
        if (!this.unreadCounts[message.chatId]) this.unreadCounts[message.chatId] = 0;
        this.unreadCounts[message.chatId]++;
        this.updateChatListBadge(message.chatId);
        const senderName = message.nickname || message.galNumber || '未知用户';
        this.showNotification(senderName, message);
        this.playNotificationSound();
        this.sendBrowserNotification(senderName, message);
      }
      this.loadChatList();
      return;
    }
    
    // 在当前聊天页面 - 直接显示
    if (!this.chatMessages[message.chatId]) this.chatMessages[message.chatId] = [];
    this.chatMessages[message.chatId].push(message);
    
    const isSent = message.senderId === Auth.getCurrentUserId();
    this.displayMessage(message, isSent);
    this.scrollToBottom();
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
  // Online user status tracking
  if (window.socket) {
    socket.on('user-status', (data) => {
      if (data.status === 'online') {
        window.onlineUsers.add(data.userId);
      } else {
        window.onlineUsers.delete(data.userId);
      }
    });
    socket.on('user-online', (userId) => {
      window.onlineUsers.add(userId);
    });
    socket.on('user-offline', (userId) => {
      window.onlineUsers.delete(userId);
    });
  }
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
    
    const wasOpen = !panel.classList.contains('hidden');
    this.closeAllPanels();
    
    if (!wasOpen) {
      panel.classList.remove('hidden');
      this.renderTranslatePanel();
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
  
  // 语音录制相关 (属性已在对象初始化时定义)
  
  /**
   * 切换语音录制
   */
  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.closeAllPanels();
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
      this._cancelAnimFrame && cancelAnimationFrame(this._cancelAnimFrame);
      this._cancelAnimFrame = null;
      
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
    
    this._cancelAnimFrame = requestAnimationFrame(() => this.updateRecordingTime());
  },
  
  /**
   * 发送语音消息
   */
  async sendVoiceMessage() {
    if (!this.currentChat) return;
    
    // 优先使用pending blob（来自旧版录音回调）
    const blob = this._pendingVoiceBlob || new Blob(this.audioChunks, { type: 'audio/webm' });
    this._pendingVoiceBlob = null;
    if (blob.size === 0) return;
    const reader = new FileReader();
    
    reader.onloadend = async () => {
      const base64 = reader.result;
      const duration = Math.floor((Date.now() - (this.recordingStartTime || Date.now())) / 1000) || this.recordingSeconds || 0;
      const content = JSON.stringify({ type: 'voice', duration, content: base64 });
      
      // HTTP POST发送（可靠通道）
      try {
        await fetch('/api/chats/' + this.currentChat.id + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() },
          body: JSON.stringify({
            chatId: this.currentChat.id,
            senderId: Auth.getCurrentUserId(),
            encryptedContent: content,
            type: 'voice',
            burnAfter: 0,
            isAnonymous: false
          })
        });
      } catch(e) { console.error('语音发送失败:', e); }
      
      // 本地显示
      const localMessage = {
        id: 'local-' + Date.now(),
        chatId: this.currentChat.id,
        senderId: Auth.getCurrentUserId(),
        galNumber: Auth.currentUser?.galNumber || '',
        nickname: Auth.currentUser?.nickname || '',
        encryptedContent: content,
        type: 'voice',
        duration,
        createdAt: new Date().toISOString()
      };
      
      if (!this.chatMessages[this.currentChat.id]) this.chatMessages[this.currentChat.id] = [];
      this.chatMessages[this.currentChat.id].push(localMessage);
      this.displayMessage(localMessage, true);
      document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
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
    
    const wasOpen = !panel.classList.contains('hidden');
    this.closeAllPanels();
    
    if (!wasOpen) {
      panel.classList.remove('hidden');
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
  
  /**
   * 显示聊天信息面板
   */
  async showChatInfoPanel() {
    if (!this.currentChat) return;
    
    // 移除旧面板
    const oldPanel = document.getElementById('chat-info-panel');
    if (oldPanel) oldPanel.remove();
    
    // 从服务器获取最新成员数据
    let members = this.currentChat.members || [];
    let chatInfo = this.currentChat;
    const currentUserId = Auth.getCurrentUserId();
    
    if (this.currentChat.type === 'group') {
      try {
        const resp = await fetch(`/api/chats/${this.currentChat.id}`);
        const data = await resp.json();
        if (data.success) {
          members = data.members || members;
          chatInfo = { ...this.currentChat, ...data.chat, members };
        }
      } catch (e) { console.error('获取群成员失败:', e); }
    }
    
    const chat = chatInfo;
    const isGroup = chat.type === 'group';
    const currentMember = isGroup ? members.find(m => m.id === currentUserId) : null;
    const isOwner = currentMember?.role === 'owner';
    const isAdmin = currentMember && ['owner', 'admin'].includes(currentMember.role);
    const isAICompany = chat.groupMode === 'ai_company';
    
    // 创建信息面板
    let panel = document.createElement('div');
    panel.id = 'chat-info-panel';
    panel.className = 'chat-info-panel';
    
    let html = '<div class="panel-header"><h3>聊天信息</h3><button class="btn-icon" id="btn-close-chat-info">✕</button></div>';
    
    if (isGroup) {
      // === 群组头像和名称 ===
      html += '<div class="info-group-header">';
      html += '<div class="info-group-avatar">👥</div>';
      html += '<div class="info-group-meta">';
      html += '<div class="info-group-name-row"><span class="info-group-name">' + UI.escapeHtml(chat.name || '未命名群组') + '</span>';
      if (isAdmin) {
        html += '<button class="btn-icon-sm" id="btn-edit-group-name" title="修改群名">✏️</button>';
      }
      html += '</div>';
      if (chat.description) {
        html += '<div class="info-group-desc">' + UI.escapeHtml(chat.description) + '</div>';
      }
      html += '</div></div>';
      
      // === 群模式标签 ===
      const modeLabels = { open: '🟢 开放群', meeting: '🔵 会议群', quiet: '🟣 防互扰群', ai_company: '🤖 AI公司' };
      const modeDescs = { open: '任何人可自由发言', meeting: '仅管理员可发言', quiet: '成员间不可私聊', ai_company: 'AI自动回复模式' };
      html += '<div class="info-mode-tag">' + (modeLabels[chat.groupMode] || '🟢 开放群') + ' · ' + (modeDescs[chat.groupMode] || '') + '</div>';
      
      // === 成员区域 ===
      html += '<div class="info-section">';
      html += '<div class="info-section-header"><span>群成员 (' + members.length + ')</span>';
      if (isAdmin) {
        html += '<button class="btn-text" id="btn-invite-members">＋ 邀请</button>';
      }
      html += '</div>';
      
      // 成员网格
      html += '<div class="info-members-grid">';
      members.forEach(m => {
        const isAI = m.galNumber && m.galNumber.startsWith && m.galNumber.startsWith('AI-');
        const roleIcon = m.role === 'owner' ? '👑' : m.role === 'admin' ? '⚡' : (isAI ? '🤖' : '');
        const mutedIcon = m.is_muted ? '🔇' : '';
        html += '<div class="info-member-card" data-user-id="' + m.id + '">';
        html += '<div class="info-member-avatar">' + (UI.avatarMap[m.avatar] || (isAI ? '🤖' : '👤')) + '</div>';
        html += '<div class="info-member-name">' + UI.escapeHtml(m.nickname) + (m.id === currentUserId ? '(我)' : '') + '</div>';
        if (roleIcon || mutedIcon) {
          html += '<div class="info-member-badges">' + roleIcon + mutedIcon + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
      
      // === 群公告 ===
      if (chat.announcement) {
        html += '<div class="info-section">';
        html += '<div class="info-section-header"><span>📌 群公告</span>';
        if (isAdmin) html += '<button class="btn-text" id="btn-edit-announcement">编辑</button>';
        html += '</div>';
        html += '<div class="info-announcement-content">' + UI.escapeHtml(chat.announcement) + '</div>';
        html += '</div>';
      } else if (isAdmin) {
        html += '<div class="info-section">';
        html += '<div class="info-section-header"><span>📌 群公告</span>';
        html += '<button class="btn-text" id="btn-edit-announcement">发布</button>';
        html += '</div>';
        html += '<div class="info-announcement-empty">暂无公告</div>';
        html += '</div>';
      }
      
      // === 管理功能（管理员可见）===
      if (isAdmin) {
        html += '<div class="info-section info-admin-section">';
        html += '<div class="info-section-header"><span>⚙️ 群管理</span></div>';
        
        // 邀请码
        html += '<div class="info-action-row" id="row-invite-code">';
        html += '<span>邀请码入群</span>';
        html += '<button class="btn-text" id="btn-generate-invite-inline">' + (chat.inviteCode ? chat.inviteCode : '生成邀请码') + '</button>';
        html += '</div>';
        
        // 全体禁言切换
        const hasMutedMembers = members.some(m => m.is_muted && m.role !== 'owner' && m.role !== 'admin');
        html += '<div class="info-action-row">';
        html += '<span>全体禁言</span>';
        html += '<label class="toggle-switch"><input type="checkbox" id="toggle-mute-all"' + (hasMutedMembers ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
        html += '</div>';
        
        // 群模式切换（AI公司不显示）
        if (!isAICompany) {
          html += '<div class="info-action-row" id="row-mode-switch">';
          html += '<span>群模式</span>';
          html += '<select class="info-select" id="select-group-mode">';
          html += '<option value="open"' + (chat.groupMode === 'open' ? ' selected' : '') + '>🟢 开放群</option>';
          html += '<option value="meeting"' + (chat.groupMode === 'meeting' ? ' selected' : '') + '>🔵 会议群</option>';
          html += '<option value="quiet"' + (chat.groupMode === 'quiet' ? ' selected' : '') + '>🟣 防互扰群</option>';
          html += '</select>';
          html += '</div>';
        }
        
        // 转让群主（仅群主可见）
        if (isOwner) {
          html += '<div class="info-action-row">';
          html += '<span>转让群主</span>';
          html += '<button class="btn-text btn-warn" id="btn-transfer-ownership">转让</button>';
          html += '</div>';
        }
        
        html += '</div>';
      }
      
      // === 常规功能 ===
      html += '<div class="info-section">';
      html += '<div class="info-section-header"><span>🔧 设置</span></div>';
      
      // 消息免打扰
      html += '<div class="info-action-row">';
      html += '<span>消息免打扰</span>';
      html += '<label class="toggle-switch"><input type="checkbox" id="toggle-mute-notif"' + (chat.isMuted ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
      html += '</div>';
      
      // 群组设置（完整版）
      html += '<div class="info-action-row" id="row-full-settings">';
      html += '<span>完整群设置</span>';
      html += '<button class="btn-text" id="btn-open-group-settings">前往 →</button>';
      html += '</div>';
      
      html += '</div>';
      
      // === AI公司专属 ===
      if (isAICompany) {
        html += '<div class="info-section">';
        html += '<button class="btn btn-primary" style="width:100%" id="btn-trigger-ai-meeting">📋 召开AI会议</button>';
        html += '</div>';
      }
      
    } else {
      // === 私聊信息 ===
      const otherMember = chat.members?.find(m => m.id !== currentUserId);
      if (otherMember) {
        html += '<div class="info-group-header">';
        html += '<div class="info-member-avatar-lg">' + (UI.avatarMap[otherMember.avatar] || '👤') + '</div>';
        html += '<div class="info-group-meta">';
        html += '<div class="info-group-name">' + UI.escapeHtml(otherMember.nickname) + '</div>';
        html += '<div class="info-group-desc">Gal: ' + UI.formatGalNumber(otherMember.galNumber) + '</div>';
        html += '</div></div>';
      }
    }
    
    // === 底部操作 ===
    html += '<div class="info-section info-danger-section">';
    html += '<button class="btn btn-secondary" style="width:100%" id="btn-clear-chat-history">🗑️ 清空聊天记录</button>';
    if (isGroup) {
      if (isOwner) {
        html += '<button class="btn btn-danger" style="width:100%" id="btn-disband-group">❌ 解散群组</button>';
      } else {
        html += '<button class="btn btn-danger" style="width:100%" id="btn-leave-group">🚪 退出群组</button>';
      }
    }
    html += '</div>';
    
    panel.innerHTML = html;
    
    // 插入到聊天窗口
    const chatWindow = document.getElementById('chat-window');
    chatWindow.appendChild(panel);
    
    // === 绑定事件 ===
    
    // 关闭面板
    document.getElementById('btn-close-chat-info')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
    
    // 清空聊天记录
    document.getElementById('btn-clear-chat-history')?.addEventListener('click', () => {
      UI.showConfirm('清空聊天记录', '确定要清空所有聊天记录吗？此操作不可恢复。', async () => {
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/messages', { method: 'DELETE' });
          const data = await resp.json();
          if (data.success) {
            document.getElementById('chat-messages').innerHTML = '';
            this.chatMessages[this.currentChat.id] = [];
            UI.showToast('聊天记录已清空');
            panel.classList.add('hidden');
          } else {
            UI.showToast(data.error || '清空失败');
          }
        } catch(e) { UI.showToast('清空失败'); }
      });
    });
    
    if (isGroup) {
      // 修改群名
      document.getElementById('btn-edit-group-name')?.addEventListener('click', () => {
        const newName = prompt('修改群名称:', chat.name || '');
        if (newName && newName.trim() && newName.trim() !== chat.name) {
          fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, name: newName.trim() })
          }).then(r => r.json()).then(data => {
            if (data.success) {
              UI.showToast('群名已更新');
              this.showChatInfoPanel(); // 刷新面板
            } else { UI.showToast(data.error || '更新失败'); }
          });
        }
      });
      
      // 编辑群公告
      document.getElementById('btn-edit-announcement')?.addEventListener('click', () => {
        const newAnn = prompt('编辑群公告:', chat.announcement || '');
        if (newAnn !== null) {
          fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, announcement: newAnn })
          }).then(r => r.json()).then(data => {
            if (data.success) {
              UI.showToast('公告已更新');
              this.showChatInfoPanel();
            } else { UI.showToast(data.error || '更新失败'); }
          });
        }
      });
      
      // 邀请成员
      document.getElementById('btn-invite-members')?.addEventListener('click', () => {
        this.showInviteMembersModal(members);
      });
      
      // 成员卡片点击 -> 成员详情
      panel.querySelectorAll('.info-member-card').forEach(card => {
        card.addEventListener('click', () => {
          const userId = parseInt(card.dataset.userId);
          this.showMemberDetail(userId, members, isOwner, isAdmin, currentUserId);
        });
      });
      
      // 生成/显示邀请码
      document.getElementById('btn-generate-invite-inline')?.addEventListener('click', async () => {
        if (chat.inviteCode) {
          // 复制邀请码
          try {
            await navigator.clipboard.writeText(chat.inviteCode);
            UI.showToast('邀请码已复制: ' + chat.inviteCode);
          } catch(e) {
            UI.showToast('邀请码: ' + chat.inviteCode);
          }
          return;
        }
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/invite-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId })
          });
          const data = await resp.json();
          if (data.success) {
            chat.inviteCode = data.inviteCode;
            document.getElementById('btn-generate-invite-inline').textContent = data.inviteCode;
            UI.showToast('邀请码已生成');
          } else { UI.showToast(data.error || '生成失败'); }
        } catch(e) { UI.showToast('生成失败'); }
      });
      
      // 全体禁言
      document.getElementById('toggle-mute-all')?.addEventListener('change', async (e) => {
        const isMuted = e.target.checked;
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/mute-all', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast(isMuted ? '已开启全体禁言' : '已关闭全体禁言');
          } else {
            e.target.checked = !isMuted;
            UI.showToast(data.error || '操作失败');
          }
        } catch(e) {
          e.target.checked = !isMuted;
          UI.showToast('操作失败');
        }
      });
      
      // 群模式切换
      document.getElementById('select-group-mode')?.addEventListener('change', async (e) => {
        const newMode = e.target.value;
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, mode: newMode })
          });
          const data = await resp.json();
          if (data.success) {
            this.currentChat.groupMode = newMode;
            UI.showToast('群模式已切换');
            this.showChatInfoPanel(); // 刷新
          } else { UI.showToast(data.error || '切换失败'); }
        } catch(e) { UI.showToast('切换失败'); }
      });
      
      // 转让群主
      document.getElementById('btn-transfer-ownership')?.addEventListener('click', () => {
        this.showTransferOwnershipModal(members, currentUserId);
      });
      
      // 消息免打扰
      document.getElementById('toggle-mute-notif')?.addEventListener('change', async (e) => {
        const isMuted = e.target.checked;
        try {
          await fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted })
          });
          UI.showToast(isMuted ? '已开启免打扰' : '已关闭免打扰');
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 完整群设置
      document.getElementById('btn-open-group-settings')?.addEventListener('click', () => {
        panel.classList.add('hidden');
        if (window.GroupSettings) {
          GroupSettings.show(this.currentChat.id);
        }
      });
      
      // AI会议
      document.getElementById('btn-trigger-ai-meeting')?.addEventListener('click', () => {
        panel.classList.add('hidden');
        if (window.AICompany) {
          AICompany.showMeeting(this.currentChat.id);
        }
      });
      
      // 退群
      document.getElementById('btn-leave-group')?.addEventListener('click', () => {
        UI.showConfirm('退出群组', '确定要退出该群组吗？', async () => {
          try {
            const resp = await fetch('/api/chats/' + this.currentChat.id + '/leave', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('已退出群组');
              this.closeChat();
              this.loadChatList();
            } else { UI.showToast(data.error || '退群失败'); }
          } catch(e) { UI.showToast('退群失败'); }
        });
      });
      
      // 解散群组
      document.getElementById('btn-disband-group')?.addEventListener('click', () => {
        UI.showConfirm('解散群组', '确定要解散该群组吗？此操作不可恢复，所有成员将被移除。', async () => {
          try {
            const resp = await fetch('/api/chats/' + this.currentChat.id + '/leave', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('群组已解散');
              this.closeChat();
              this.loadChatList();
            } else { UI.showToast(data.error || '解散失败'); }
          } catch(e) { UI.showToast('解散失败'); }
        });
      });
    }
    
    // 更新AppState
    if (window.AppState) AppState.inChatInfo = true;
  },
  
  // === 邀请成员弹窗（从联系人选择）===
  showInviteMembersModal(currentMembers) {
    const currentMemberIds = new Set(currentMembers.map(m => m.id));
    const currentUserId = Auth.getCurrentUserId();
    
    // 获取联系人列表
    let contacts = [];
    if (window.Contacts && Contacts.contacts) {
      contacts = Contacts.contacts.filter(c => c.status === 'accepted' && !currentMemberIds.has(c.id));
    }
    
    if (contacts.length === 0) {
      UI.showToast('没有可邀请的联系人');
      return;
    }
    
    let html = '<div class="invite-contacts-list">';
    contacts.forEach(c => {
      html += '<label class="invite-contact-item">';
      html += '<input type="checkbox" class="invite-check" data-gal="' + c.galNumber + '" data-name="' + UI.escapeHtml(c.nickname) + '">';
      html += '<span class="avatar">' + (UI.avatarMap[c.avatar] || '👤') + '</span>';
      html += '<span class="name">' + UI.escapeHtml(c.nickname) + '</span>';
      html += '<span class="gal">' + UI.formatGalNumber(c.galNumber) + '</span>';
      html += '</label>';
    });
    html += '</div>';
    
    UI.showModal('邀请成员加入群组', html, [
      { text: '取消', class: 'btn-secondary' },
      { text: '邀请 (' + contacts.length + '人可选)', class: 'btn-primary', id: 'btn-confirm-invite', closeOnClick: false, onClick: async () => {
        const checks = document.querySelectorAll('.invite-check:checked');
        if (checks.length === 0) {
          UI.showToast('请选择要邀请的成员');
          return;
        }
        const galNumbers = Array.from(checks).map(c => c.dataset.gal);
        
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/invite-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, galNumbers })
          });
          const data = await resp.json();
          if (data.success) {
            const addedCount = data.added.length;
            UI.showToast('成功邀请 ' + addedCount + ' 人加入群组');
            UI.closeModal();
            this.showChatInfoPanel(); // 刷新面板
          } else {
            UI.showToast(data.error || '邀请失败');
          }
        } catch(e) { UI.showToast('邀请失败'); }
      }}
    ]);
  },
  
  // === 成员详情弹窗 ===
  showMemberDetail(userId, members, isOwner, isAdmin, currentUserId) {
    const member = members.find(m => m.id === userId);
    if (!member) return;
    
    const isAI = member.galNumber && member.galNumber.startsWith && member.galNumber.startsWith('AI-');
    const isSelf = userId === currentUserId;
    const canManage = isAdmin && !isSelf && member.role !== 'owner';
    
    let html = '<div class="member-detail">';
    html += '<div class="member-detail-avatar">' + (UI.avatarMap[member.avatar] || (isAI ? '🤖' : '👤')) + '</div>';
    html += '<div class="member-detail-name">' + UI.escapeHtml(member.nickname) + '</div>';
    html += '<div class="member-detail-gal">Gal: ' + UI.formatGalNumber(member.galNumber) + '</div>';
    html += '<div class="member-detail-role">' + (member.role === 'owner' ? '👑 群主' : member.role === 'admin' ? '⚡ 管理员' : isAI ? '🤖 AI' : '👤 成员') + '</div>';
    
    if (canManage) {
      html += '<div class="member-detail-actions">';
      
      // 设为/取消管理员（仅群主）
      if (isOwner) {
        if (member.role === 'admin') {
          html += '<button class="btn btn-secondary" id="btn-demote-admin">取消管理员</button>';
        } else {
          html += '<button class="btn btn-secondary" id="btn-promote-admin">设为管理员</button>';
        }
      }
      
      // 禁言/解禁
      if (member.is_muted) {
        html += '<button class="btn btn-secondary" id="btn-unmute-member">解除禁言</button>';
      } else {
        html += '<button class="btn btn-secondary" id="btn-mute-member">禁言</button>';
      }
      
      // 移除成员
      html += '<button class="btn btn-danger" id="btn-remove-member">移除出群</button>';
      html += '</div>';
    }
    
    html += '</div>';
    
    UI.showModal('成员详情', html, [
      { text: '关闭', class: 'btn-secondary' }
    ]);
    
    // 绑定操作事件
    setTimeout(() => {
      // 设为管理员
      document.getElementById('btn-promote-admin')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, role: 'admin' })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已设为管理员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 取消管理员
      document.getElementById('btn-demote-admin')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, role: 'member' })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已取消管理员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 禁言
      document.getElementById('btn-mute-member')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/mute`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted: true })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已禁言该成员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 解除禁言
      document.getElementById('btn-unmute-member')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/mute`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted: false })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已解除禁言');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 移除成员
      document.getElementById('btn-remove-member')?.addEventListener('click', () => {
        UI.showConfirm('移除成员', '确定要移除 ' + member.nickname + ' 吗？', async () => {
          try {
            const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('成员已移除');
              UI.closeModal();
              this.showChatInfoPanel();
            } else { UI.showToast(data.error || '移除失败'); }
          } catch(e) { UI.showToast('移除失败'); }
        });
      });
    }, 100);
  },
  
  // === 转让群主弹窗 ===
  showTransferOwnershipModal(members, currentUserId) {
    const otherMembers = members.filter(m => m.id !== currentUserId);
    
    if (otherMembers.length === 0) {
      UI.showToast('群内没有其他成员可转让');
      return;
    }
    
    let html = '<div class="transfer-members-list">';
    otherMembers.forEach(m => {
      html += '<div class="transfer-member-item" data-user-id="' + m.id + '">';
      html += '<span class="avatar">' + (UI.avatarMap[m.avatar] || '👤') + '</span>';
      html += '<span class="name">' + UI.escapeHtml(m.nickname) + '</span>';
      html += '<span class="role">' + (m.role === 'admin' ? '⚡ 管理员' : '👤 成员') + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">⚠️ 转让后你将变为管理员，无法撤回</p>';
    
    UI.showModal('转让群主', html, [
      { text: '取消', class: 'btn-secondary' }
    ]);
    
    // 点击成员选择转让
    setTimeout(() => {
      document.querySelectorAll('.transfer-member-item').forEach(item => {
        item.addEventListener('click', () => {
          const targetUserId = parseInt(item.dataset.userId);
          const targetName = item.querySelector('.name').textContent;
          UI.showConfirm('确认转让', '确定要将群主转让给 ' + targetName + ' 吗？此操作不可撤回。', async () => {
            try {
              const resp = await fetch('/api/chats/' + this.currentChat.id + '/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUserId, targetUserId })
              });
              const data = await resp.json();
              if (data.success) {
                UI.showToast('群主已转让');
                UI.closeModal();
                this.closeChat();
                this.loadChatList();
              } else { UI.showToast(data.error || '转让失败'); }
            } catch(e) { UI.showToast('转让失败'); }
          });
        });
      });
    }, 100);
  },
  // 关闭所有面板
  closeAllPanels() {
    // 关闭所有工具栏面板
    const panels = ['emoji-panel', 'translate-panel', 'burn-panel', 'redpacket-panel', 'anonymous-panel'];
    panels.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) {
        panel.classList.add('hidden');
      }
    });
    // 同时关闭所有input-panel类元素
    document.querySelectorAll('.input-panel').forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('visible');
    });
    // 重置工具栏按钮状态
    const toolBtns = document.querySelectorAll('.toolbar-btn');
    toolBtns.forEach(btn => btn.classList.remove('active'));
  }
});

// 绑定红包和翻译按钮事件
document.addEventListener('DOMContentLoaded', () => {
  // 红包发送按钮
  const sendRpBtn = document.getElementById('btn-send-redpacket');
  if (sendRpBtn) {
    sendRpBtn.addEventListener('click', () => {
      Chat.sendRedPacket();
    });
  }
  
  // 红包类型切换
  document.querySelectorAll('.rp-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rp-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  
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
    
    // 检查禁言状态
    if (member && member.is_muted && !isAdmin) {
      return { allowed: false, reason: 'muted' };
    }
    
    // 检查群模式
    if (this.currentChat.groupMode === 'meeting') {
      // 会议群：只有管理员可以发言
      if (!isAdmin) {
        return { allowed: false, reason: 'meeting' };
      }
    }
    
    // AI公司群组：所有人可发言，AI会自动回复
    if (this.currentChat.groupMode === 'ai_company') {
      return { allowed: true, reason: '' };
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
          'quiet': '防互扰群',
          'ai_company': 'AI公司'
        };
        const modeIcons = {
          'open': '🟢',
          'meeting': '🔵',
          'quiet': '🟣',
          'ai_company': '🤖'
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
  const permission = this.canSendMessage();
  if (!permission.allowed) {
    if (permission.reason === 'meeting') {
      UI.showToast('🔵 会议群模式：只有管理员可以发言');
    } else if (permission.reason === 'muted') {
      UI.showToast('🔇 你已被禁言，无法发送消息');
    }
    return;
  }
  return originalSendMessage.apply(this, arguments);
};

// 覆盖原有的openChat，添加群模式初始化
const originalOpenChat = Chat.openChat;
Chat.openChat = async function(chatId, contactInfo = null) {
  // 调用原始打开函数（内部已调用loadChatInfo获取群组信息）
  await originalOpenChat.apply(this, arguments);
  
  // 如果是群聊，初始化群模式和公告
  if (this.currentChat && this.currentChat.type === 'group') {
    // loadChatInfo override已经设置了groupMode和announcement
    if (this.currentChat.groupMode) {
      this.updateGroupMode(this.currentChat.groupMode);
    }
    if (this.currentChat.announcement) {
      this.showAnnouncementBanner(this.currentChat.announcement);
    }
  }
};

// 覆盖loadChatInfo，获取群组详情（原始版本从列表API获取，缺少groupMode/announcement）
const originalLoadChatInfo = Chat.loadChatInfo;
Chat.loadChatInfo = async function(chatId) {
  await originalLoadChatInfo.apply(this, arguments);
  
  // 获取群组详情（含groupMode和announcement）
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
    // 初始化关闭菜单的事件处理器
    if (!this.boundCloseMenu) {
      this.boundCloseMenu = (e) => {
        if (this.currentMessageMenu && !this.currentMessageMenu.contains(e.target)) {
          this.closeMessageMenu();
        }
      };
    }
    
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
      { icon: "⭐", text: "收藏", action: () => this.favoriteMessage(message, content) },
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
    
    // 删除消息选项
    menuItems.push({ icon: "🗑️", text: "删除", action: () => this.deleteMessage(messageEl, message), danger: true });
    
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
    
    // 存储当前菜单引用
    this.currentMessageMenu = menu;
    this.currentMessage = message;
    this.currentMessageEl = messageEl;
    
    document.body.appendChild(menu);
    
    // 定位菜单：横排居中于消息上方，边界保护
    const menuRect = menu.getBoundingClientRect();
    const msgRect = messageEl.getBoundingClientRect();
    let menuLeft = msgRect.left + msgRect.width / 2 - menuRect.width / 2;
    let menuTop = msgRect.top - menuRect.height - 10;
    // 右边界保护
    if (menuLeft + menuRect.width > window.innerWidth - 8) {
      menuLeft = window.innerWidth - menuRect.width - 8;
    }
    // 左边界保护
    if (menuLeft < 8) menuLeft = 8;
    // 如果上方放不下，放到消息下方
    if (menuTop < 60) {
      menuTop = msgRect.bottom + 10;
    }
    menu.style.left = menuLeft + "px";
    menu.style.top = menuTop + "px";
    menu.style.transform = "none";
    
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
        const response = await fetch(`/api/chats?userId=${Auth.getCurrentUserId()}`, {
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
      
      // HTTP POST发送（唯一可靠通道，不重复发送）
      try {
        await fetch('/api/chats/' + forwardMessage.chatId + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() },
          body: JSON.stringify(forwardMessage)
        });
        UI.showToast('消息已转发');
        UI.closeModal();
      } catch(e) {
        UI.showToast('转发失败');
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
   * 5. 收藏消息
   */
  favoriteMessage(message, content) {
    const senderName = message.nickname || (message.senderId === Auth.getCurrentUserId() ? '我' : '对方');
    if (window.Collection) {
      Collection.add(content, senderName);
    } else {
      // 直接用localStorage
      let collections = JSON.parse(localStorage.getItem('nova_collections') || '[]');
      collections.unshift({
        content,
        from: senderName,
        time: new Date().toLocaleString('zh-CN')
      });
      if (collections.length > 100) collections = collections.slice(0, 100);
      localStorage.setItem('nova_collections', JSON.stringify(collections));
      UI.showToast('已添加到收藏 ⭐');
    }
  },
  
  /**
   * 6. 删除消息
   */
  async deleteMessage(messageEl, message) {
    UI.showConfirm('删除消息', '确定要删除这条消息吗？', async () => {
      try {
        const msgId = message.id;
        if (msgId && !msgId.startsWith('local-')) {
          await fetch('/api/messages/' + msgId, { method: 'DELETE' });
        }
        // 从UI移除
        if (messageEl && messageEl.parentNode) {
          messageEl.remove();
        }
        // 从本地缓存移除
        if (this.currentChat && this.chatMessages[this.currentChat.id]) {
          const idx = this.chatMessages[this.currentChat.id].findIndex(m => m.id === msgId);
          if (idx >= 0) this.chatMessages[this.currentChat.id].splice(idx, 1);
        }
        UI.showToast('消息已删除');
      } catch (e) {
        console.error('删除消息失败:', e);
        UI.showToast('删除失败');
      }
    });
  },
  
  /**
   * 7. 撤回消息
   */
  async recallMessage(messageEl, message) {
    // 不在前端做2分钟限制判断，由后端数据库端统一判断（避免JS/PG时区不一致）
    
    UI.showConfirm("撤回消息", "确定要撤回这条消息吗？", async () => {
      try {
        if (window.socket && window.socket.connected) {
          window.socket.emit("recall-message", {
            messageId: message.id,
            chatId: this.currentChat?.id,
            userId: Auth.getCurrentUserId()
          });
        } else {
          const response = await fetch(`/api/chats/${this.currentChat?.id}/messages/${message.id}/recall`, {
            method: 'PUT',
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + Auth.getToken()
            },
            body: JSON.stringify({
              userId: Auth.getCurrentUserId()
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) {
            UI.showToast(data.error || "撤回失败");
            return;
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

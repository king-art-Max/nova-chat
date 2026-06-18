/**
 * Nova-OS AI对话模块
 * 处理AI人格选择和对话
 */

const AIChat = {
  currentPersona: null,
  conversationHistory: {}, // galNumber -> history[]
  
  /**
   * 初始化AI模块
   */
  async init() {
    // 加载AI人格列表
    await this.loadPersonas();
    
    // 绑定事件
    this.bindEvents();
  },
  
  /**
   * 加载AI人格列表
   */
  async loadPersonas() {
    try {
      const response = await fetch('/api/ai/personas');
      const data = await response.json();
      
      if (data.success) {
        this.personas = data.personas;
        this.renderPersonas();
      }
    } catch (error) {
      console.error('加载AI人格失败:', error);
    }
  },
  
  /**
   * 渲染AI人格卡片
   */
  renderPersonas() {
    const container = document.getElementById('ai-personas');
    
    container.innerHTML = this.personas.map(persona => 
      UI.renderAIPersona(persona)
    ).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.ai-persona').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const gal = card.dataset.gal;
        console.log('AI人格点击, gal:', gal);
        const persona = this.personas.find(p => p.gal_number === gal);
        if (persona) {
          console.log('启动AI对话:', persona.name);
          this.startChat(persona);
        } else {
          console.warn('未找到AI人格:', gal);
          UI.showToast('加载失败，请刷新重试');
        }
      });
    });
  },
  
  /**
   * 绑定事件
   */
  bindEvents() {
    // 返回按钮
    document.getElementById('btn-ai-chat-back').addEventListener('click', () => {
      this.closeChat();
    });
    
    // 发送消息
    document.getElementById('btn-send-ai-message').addEventListener('click', () => {
      this.sendMessage();
    });
    
    // 回车发送
    document.getElementById('ai-message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  },
  
  /**
   * 开始AI对话
   */
  startChat(persona) {
    this.currentPersona = persona;
    
    // 初始化对话历史
    if (!this.conversationHistory[persona.gal_number]) {
      this.conversationHistory[persona.gal_number] = [];
    }
    
    // 显示AI聊天窗口
    UI.showAIChatWindow(persona.name);
    
    // 添加欢迎消息
    if (this.conversationHistory[persona.gal_number].length === 0) {
      const welcomeMessages = {
        'AI-NOVA000001': '你好！我是Nova助手，有什么我可以帮你的吗？',
        'AI-TOXIC00002': '呵，又来一个找我聊天的。说吧，你想知道什么？',
        'AI-EMOTI00003': '你好呀~ 我在这里等你，想说什么都可以哦。',
        'AI-DATA000004': '你好，我是数据分析师。请提供你想要分析的问题。'
      };
      
      const welcome = welcomeMessages[persona.gal_number] || '你好，有什么问题吗？';
      this.addAIMessage(welcome);
    } else {
      // 恢复对话历史
      this.restoreHistory();
    }
    
    // 聚焦输入框
    document.getElementById('ai-message-input').focus();
  },
  
  /**
   * 恢复对话历史
   */
  restoreHistory() {
    const history = this.conversationHistory[this.currentPersona.gal_number];
    const container = document.getElementById('ai-chat-messages');
    container.innerHTML = '';
    
    for (const item of history) {
      if (item.isUser) {
        this.addUserMessage(item.content, false);
      } else {
        this.addAIMessage(item.content, false);
      }
    }
  },
  
  /**
   * 添加用户消息
   */
  addUserMessage(content, scroll = true) {
    const container = document.getElementById('ai-chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message sent';
    
    messageEl.innerHTML = `
      <div class="message-header">
        <span class="message-time">${UI.formatFullTime(new Date())}</span>
      </div>
      <div class="message-content">${UI.escapeHtml(content)}</div>
    `;
    
    container.appendChild(messageEl);
    
    if (scroll) {
      container.scrollTop = container.scrollHeight;
    }
  },
  
  /**
   * 添加AI消息
   */
  addAIMessage(content, scroll = true) {
    const container = document.getElementById('ai-chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message received';
    
    messageEl.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${this.currentPersona?.name || 'AI'}</span>
        <span class="message-time">${UI.formatFullTime(new Date())}</span>
      </div>
      <div class="message-content">${UI.escapeHtml(content)}</div>
    `;
    
    container.appendChild(messageEl);
    
    if (scroll) {
      container.scrollTop = container.scrollHeight;
    }
  },
  
  /**
   * 发送消息
   */
  async sendMessage() {
    const input = document.getElementById('ai-message-input');
    const content = input.value.trim();
    
    if (!content || !this.currentPersona) return;
    
    // 添加用户消息
    this.addUserMessage(content);
    
    // 清空输入框
    input.value = '';
    
    // 添加到历史
    this.conversationHistory[this.currentPersona.gal_number].push({
      isUser: true,
      content
    });
    
    // 显示正在输入状态
    this.addTypingIndicator();
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiGalNumber: this.currentPersona.gal_number,
          message: content,
          history: this.conversationHistory[this.currentPersona.gal_number].slice(-10)
        })
      });
      
      const data = await response.json();
      
      // 移除正在输入状态
      this.removeTypingIndicator();
      
      if (data.success) {
        // 添加AI回复
        this.addAIMessage(data.reply);
        
        // 添加到历史
        this.conversationHistory[this.currentPersona.gal_number].push({
          isUser: false,
          content: data.reply
        });
        
        // 如果是预设回复，显示提示
        if (data.isFallback) {
          console.log('使用预设回复（未配置API Key）');
        }
      } else {
        this.addAIMessage('抱歉，我现在有点问题，请稍后再试。');
      }
    } catch (error) {
      console.error('AI对话错误:', error);
      this.removeTypingIndicator();
      this.addAIMessage('网络错误，请检查网络连接。');
    }
  },
  
  /**
   * 添加正在输入指示器
   */
  addTypingIndicator() {
    const container = document.getElementById('ai-chat-messages');
    const indicator = document.createElement('div');
    indicator.className = 'message received typing-indicator';
    indicator.id = 'ai-typing';
    indicator.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${this.currentPersona?.name || 'AI'}</span>
      </div>
      <div class="message-content">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    `;
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
  },
  
  /**
   * 移除正在输入指示器
   */
  removeTypingIndicator() {
    const indicator = document.getElementById('ai-typing');
    if (indicator) {
      indicator.remove();
    }
  },
  
  /**
   * 关闭AI聊天
   */
  closeChat() {
    this.currentPersona = null;
    UI.hideAIChatWindow();
  },
  
  /**
   * 清空对话历史
   */
  clearHistory() {
    if (this.currentPersona) {
      this.conversationHistory[this.currentPersona.gal_number] = [];
      UI.showConfirm('清空对话', '确定要清空与 ' + this.currentPersona.name + ' 的对话历史吗？', () => {
        const container = document.getElementById('ai-chat-messages');
        container.innerHTML = '';
        this.addAIMessage('对话历史已清空，有什么想聊的吗？');
      });
    }
  }
};

// 添加typing指示器样式
const style = document.createElement('style');
style.textContent = `
  .typing-indicator .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--text-muted);
    border-radius: 50%;
    margin-right: 4px;
    animation: typingBounce 1.4s infinite ease-in-out;
  }
  .typing-indicator .dot:nth-child(1) { animation-delay: 0s; }
  .typing-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-indicator .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typingBounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
    40% { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

// 导出AI模块
window.AIChat = AIChat;

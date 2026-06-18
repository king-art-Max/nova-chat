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
    // 加载本地历史
    this.loadHistoryFromStorage();
    
    // 加载AI人格列表
    await this.loadPersonas();
    
    // 绑定事件
    this.bindEvents();
  },
  
  /**
   * 从localStorage加载对话历史
   */
  loadHistoryFromStorage() {
    try {
      const saved = localStorage.getItem('nova_ai_history');
      if (saved) {
        this.conversationHistory = JSON.parse(saved);
        console.log('✅ AI对话历史已恢复');
      }
    } catch (error) {
      console.error('加载AI历史失败:', error);
      this.conversationHistory = {};
    }
  },
  
  /**
   * 保存对话历史到localStorage
   */
  saveHistoryToStorage() {
    try {
      // 按 galNumber 保存，每个最多保留50条
      const toSave = {};
      for (const gal in this.conversationHistory) {
        if (this.conversationHistory[gal] && Array.isArray(this.conversationHistory[gal])) {
          // 只保留最近50条
          toSave[gal] = this.conversationHistory[gal].slice(-50);
        }
      }
      localStorage.setItem('nova_ai_history', JSON.stringify(toSave));
    } catch (error) {
      console.error('保存AI历史失败:', error);
    }
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
    
    container.innerHTML = this.personas.map(persona => {
      const hasHistory = this.conversationHistory[persona.galNumber]?.length > 0;
      return `
        <div class="ai-persona" data-gal="${persona.galNumber}">
          ${hasHistory ? '<span class="history-badge" title="有对话历史">📜</span>' : ''}
          <div class="avatar">${UI.avatarMap[persona.avatar] || '🤖'}</div>
          <div class="name">${UI.escapeHtml(persona.name)}</div>
          <div class="gal">${UI.formatGalNumber(persona.galNumber)}</div>
        </div>
      `;
    }).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.ai-persona').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const gal = card.dataset.gal;
        console.log('AI人格点击, gal:', gal);
        const persona = this.personas.find(p => p.galNumber === gal);
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
    
    // 清空历史按钮
    document.getElementById('btn-clear-history')?.addEventListener('click', () => {
      this.confirmClearHistory();
    });
  },
  
  /**
   * 开始AI对话
   */
  startChat(persona) {
    this.currentPersona = persona;
    
    // 初始化对话历史
    if (!this.conversationHistory[persona.galNumber]) {
      this.conversationHistory[persona.galNumber] = [];
    }
    
    // 显示AI聊天窗口
    UI.showAIChatWindow(persona.name);
    
    // 添加欢迎消息（如果没有历史）
    if (this.conversationHistory[persona.galNumber].length === 0) {
      const welcomeMessages = {
        'AI-NOVA000001': '你好！我是Nova助手，有什么我可以帮你的吗？',
        'AI-TOXIC00002': '呵，又来一个找我聊天的。说吧，你想知道什么？',
        'AI-EMOTI00003': '你好呀~ 我在这里等你，想说什么都可以哦。',
        'AI-DATA000004': '你好，我是数据分析师。请提供你想要分析的问题。'
      };
      
      const welcome = welcomeMessages[persona.galNumber] || '你好，有什么问题吗？';
      this.addAIMessage(welcome);
      
      // 添加到历史
      this.conversationHistory[persona.galNumber].push({
        isUser: false,
        content: welcome
      });
      this.saveHistoryToStorage();
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
    const history = this.conversationHistory[this.currentPersona.galNumber];
    const container = document.getElementById('ai-chat-messages');
    container.innerHTML = '';
    
    for (const item of history) {
      if (item.isUser) {
        this.addUserMessage(item.content, false);
      } else {
        this.addAIMessage(item.content, false);
      }
    }
    
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
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
      <div class="message-content">${this.formatContent(content)}</div>
    `;
    
    container.appendChild(messageEl);
    
    if (scroll) {
      container.scrollTop = container.scrollHeight;
    }
  },
  
  /**
   * 格式化消息内容
   */
  formatContent(content) {
    // 支持简单的Markdown
    let formatted = UI.escapeHtml(content);
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
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
      <div class="message-content">${this.formatContent(content)}</div>
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
    this.conversationHistory[this.currentPersona.galNumber].push({
      isUser: true,
      content
    });
    this.saveHistoryToStorage();
    
    // 显示正在输入状态
    this.addTypingIndicator();
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiGalNumber: this.currentPersona.galNumber,
          message: content,
          history: this.conversationHistory[this.currentPersona.galNumber].slice(-10)
        })
      });
      
      const data = await response.json();
      
      // 移除正在输入状态
      this.removeTypingIndicator();
      
      if (data.success) {
        // 添加AI回复
        this.addAIMessage(data.reply);
        
        // 添加到历史
        this.conversationHistory[this.currentPersona.galNumber].push({
          isUser: false,
          content: data.reply
        });
        this.saveHistoryToStorage();
        
        // 更新人格卡片显示
        this.renderPersonas();
        
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
   * 确认清空对话历史
   */
  confirmClearHistory() {
    if (this.currentPersona) {
      UI.showConfirm('清空对话', '确定要清空与 ' + this.currentPersona.name + ' 的对话历史吗？', () => {
        this.clearHistory();
      });
    }
  },
  
  /**
   * 清空对话历史
   */
  clearHistory() {
    if (this.currentPersona) {
      this.conversationHistory[this.currentPersona.galNumber] = [];
      this.saveHistoryToStorage();
      
      const container = document.getElementById('ai-chat-messages');
      container.innerHTML = '';
      
      // 添加欢迎消息
      const welcomeMessages = {
        'AI-NOVA000001': '你好！我是Nova助手，对话历史已清空，有什么我可以帮你的吗？',
        'AI-TOXIC00002': '呵，对话历史清空了。说吧，这次又想聊什么？',
        'AI-EMOTI00003': '对话已清空~ 我们重新开始吧，有什么想聊的呢？',
        'AI-DATA000004': '对话历史已清空。请提供你想要分析的新问题。'
      };
      
      const welcome = welcomeMessages[this.currentPersona.galNumber] || '你好，有什么问题吗？';
      this.addAIMessage(welcome);
      
      // 更新人格卡片
      this.renderPersonas();
      
      UI.showToast('对话历史已清空');
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
  .ai-persona .history-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 14px;
  }
  .ai-persona {
    position: relative;
  }
  .message-content code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9em;
  }
`;
document.head.appendChild(style);

// 导出AI模块
window.AIChat = AIChat;

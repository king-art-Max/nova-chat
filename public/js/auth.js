/**
 * Nova-OS 认证模块
 * 处理用户注册、登录、会话管理
 */

// 认证状态
const Auth = {
  currentUser: null,
  token: null,
  
  /**
   * 初始化认证模块
   */
  init() {
    // 从localStorage恢复会话
    const savedUser = localStorage.getItem('nova_user');
    const savedToken = localStorage.getItem('nova_token');
    
    if (savedUser && savedToken) {
      this.currentUser = JSON.parse(savedUser);
      this.token = savedToken;
      
      // 恢复加密密钥
      NovaCrypto.loadPrivateKey(this.currentUser.password || '').then(loaded => {
        if (loaded) {
          console.log('✅ 加密密钥已恢复');
        }
        
        // 初始化Socket连接
        initSocket();
        
        // 显示主界面
        UI.showScreen('main-screen');
        App.onLoggedIn();
      });
    } else {
      // 显示登录界面
      UI.showScreen('auth-screen');
    }
    
    // 绑定认证表单事件
    this.bindEvents();
  },
  
  /**
   * 绑定表单事件
   */
  bindEvents() {
    // 切换登录/注册表单
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
      document.getElementById('auth-error').classList.add('hidden');
    });
    
    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('auth-error').classList.add('hidden');
    });
    
    // 登录表单提交
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
    
    // 注册表单提交
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });
  },
  
  /**
   * 处理登录
   */
  async handleLogin() {
    const galNumber = document.getElementById('login-gal').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!galNumber || !password) {
      errorEl.textContent = '请填写所有字段';
      errorEl.classList.remove('hidden');
      return;
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galNumber, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 保存用户信息
        this.currentUser = {
          id: data.user.id,
          galNumber: data.user.galNumber,
          nickname: data.user.nickname,
          avatar: data.user.avatar || 'astronaut',
          publicKey: data.user.publicKey
        };
        this.token = data.token;
        
        localStorage.setItem('nova_user', JSON.stringify(this.currentUser));
        localStorage.setItem('nova_token', this.token);
        
        // 尝试加载私钥（如果存在）
        const keyLoaded = await NovaCrypto.loadPrivateKey(password);
        
        if (!keyLoaded) {
          // 如果没有本地私钥，生成新的
          const keyPair = await NovaCrypto.generateKeyPair();
          
          // 保存私钥
          NovaCrypto.savePrivateKey(password);
          
          // 更新服务器公钥
          await fetch('/api/user', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: this.currentUser.id,
              publicKey: JSON.stringify(NovaCrypto.publicKeyJwk)
            })
          });
        }
        
        errorEl.classList.add('hidden');
        UI.showScreen('main-screen');
        App.onLoggedIn();
        
        UI.showToast('登录成功');
      } else {
        errorEl.textContent = data.error || '登录失败';
        errorEl.classList.remove('hidden');
      }
    } catch (error) {
      console.error('登录错误:', error);
      errorEl.textContent = '网络错误，请重试';
      errorEl.classList.remove('hidden');
    }
  },
  
  /**
   * 处理注册
   */
  async handleRegister() {
    const nickname = document.getElementById('register-nickname').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!nickname || !password || !confirm) {
      errorEl.textContent = '请填写所有字段';
      errorEl.classList.remove('hidden');
      return;
    }
    
    if (password !== confirm) {
      errorEl.textContent = '两次密码输入不一致';
      errorEl.classList.remove('hidden');
      return;
    }
    
    if (password.length < 6) {
      errorEl.textContent = '密码至少6位';
      errorEl.classList.remove('hidden');
      return;
    }
    
    try {
      // 生成加密密钥对
      const keyPair = await NovaCrypto.generateKeyPair();
      
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          password,
          publicKey: JSON.stringify(NovaCrypto.publicKeyJwk)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 保存私钥
        NovaCrypto.savePrivateKey(password);
        
        // 保存用户信息
        this.currentUser = {
          id: data.user.id,
          galNumber: data.user.galNumber,
          nickname: data.user.nickname,
          avatar: 'astronaut',
          password: password // 用于解锁私钥
        };
        this.token = data.token;
        
        localStorage.setItem('nova_user', JSON.stringify(this.currentUser));
        localStorage.setItem('nova_token', this.token);
        
        errorEl.classList.add('hidden');
        UI.showScreen('main-screen');
        App.onLoggedIn();
        
        UI.showToast(`注册成功！你的Gal号码是 ${data.user.galNumber}`);
      } else {
        errorEl.textContent = data.error || '注册失败';
        errorEl.classList.remove('hidden');
      }
    } catch (error) {
      console.error('注册错误:', error);
      errorEl.textContent = '网络错误，请重试';
      errorEl.classList.remove('hidden');
    }
  },
  
  /**
   * 退出登录
   */
  logout() {
    UI.showConfirm('退出登录', '确定要退出登录吗？', () => {
      // 断开Socket连接
      if (socket) {
        socket.disconnect();
      }
      
      // 清除本地数据
      this.currentUser = null;
      this.token = null;
      NovaCrypto.clearKeys();
      localStorage.removeItem('nova_user');
      localStorage.removeItem('nova_token');
      
      UI.showScreen('auth-screen');
      UI.showToast('已退出登录');
    });
  },
  
  /**
   * 获取当前用户ID
   */
  getCurrentUserId() {
    return this.currentUser?.id;
  },
  
  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!this.currentUser;
  }
};

// 导出认证模块
window.Auth = Auth;

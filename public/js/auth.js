/**
 * Nova-OS 认证模块
 * 处理用户注册、登录、会话管理
 */

const Auth = {
  currentUser: null,
  token: null,
  
  init() {
    const savedUser = localStorage.getItem('nova_user');
    const savedToken = localStorage.getItem('nova_token');
    
    if (savedUser && savedToken) {
      this.currentUser = JSON.parse(savedUser);
      this.token = savedToken;
      
      // 尝试恢复加密密钥，即使失败也要继续
      this.restoreSession();
    } else {
      UI.showScreen('auth-screen');
    }
    
    this.bindEvents();
  },
  
  async restoreSession() {
    try {
      const password = this.currentUser.password || '';
      if (password) {
        await NovaCrypto.loadPrivateKey(password);
      }
    } catch (e) {
      console.warn('加密密钥恢复失败，将继续使用基本功能:', e);
    }
    
    // 不管加密是否恢复成功，都要继续初始化
    try {
      initSocket();
    } catch (e) {
      console.warn('Socket初始化失败:', e);
    }
    
    UI.showScreen('main-screen');
    App.onLoggedIn();
  },
  
  bindEvents() {
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
    
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });
  },
  
  async handleLogin() {
    const account = document.getElementById('login-account').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!account || !password) {
      errorEl.textContent = '请填写所有字段';
      errorEl.classList.remove('hidden');
      return;
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.currentUser = {
          id: data.user.id,
          galNumber: data.user.galNumber,
          nickname: data.user.nickname,
          avatar: data.user.avatar || 'astronaut',
          publicKey: data.user.publicKey,
          password: password,
          email: data.user.email
        };
        this.token = data.token;
        
        localStorage.setItem('nova_user', JSON.stringify(this.currentUser));
        localStorage.setItem('nova_token', this.token);
        
        try {
          const keyLoaded = await NovaCrypto.loadPrivateKey(password);
          if (!keyLoaded) {
            const keyPair = await NovaCrypto.generateKeyPair();
            NovaCrypto.savePrivateKey(password);
            await fetch('/api/user', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: this.currentUser.id,
                publicKey: JSON.stringify(NovaCrypto.publicKeyJwk)
              })
            });
          }
        } catch (e) {
          console.warn('加密初始化失败，将继续使用基本功能:', e);
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
  
  async handleRegister() {
    const nickname = document.getElementById('register-nickname').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!nickname || !password || !confirm || !email) {
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
      let publicKeyStr = null;
      try {
        const keyPair = await NovaCrypto.generateKeyPair();
        NovaCrypto.savePrivateKey(password);
        publicKeyStr = JSON.stringify(NovaCrypto.publicKeyJwk);
      } catch (e) {
        console.warn('加密密钥生成失败，将跳过加密功能:', e);
      }
      
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          password,
          publicKey: publicKeyStr,
          email
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.currentUser = {
          id: data.user.id,
          galNumber: data.user.galNumber,
          nickname: data.user.nickname,
          avatar: 'astronaut',
          password: password,
          email: data.user.email || email
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
  
  logout() {
    UI.showConfirm('退出登录', '确定要退出登录吗？', () => {
      if (socket) {
        socket.disconnect();
      }
      this.currentUser = null;
      this.token = null;
      try { NovaCrypto.clearKeys(); } catch(e) {}
      localStorage.removeItem('nova_user');
      localStorage.removeItem('nova_token');
      UI.showScreen('auth-screen');
      UI.showToast('已退出登录');
    }
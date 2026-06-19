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
    
    // initSocket由App.onLoggedIn统一调用，避免重复创建socket
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
    
    // 忘记密码链接
    document.getElementById('forgot-password').addEventListener('click', (e) => {
      e.preventDefault();
      this.showForgotPasswordModal();
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
  
  /**
   * 显示忘记密码模态框
   */
  showForgotPasswordModal() {
    this.showStep1();
  },
  
  /**
   * 步骤1：输入邮箱
   */
  showStep1() {
    UI.showModal('找回密码', `
      <div class="forgot-password-content">
        <p style="color:var(--text-secondary);margin-bottom:16px;">请输入注册时使用的邮箱地址</p>
        <div class="form-group">
          <label>邮箱地址</label>
          <input type="email" id="fp-email" placeholder="your@email.com">
        </div>
        <p id="fp-step1-hint" style="color:var(--accent-blue);font-size:12px;margin-top:8px;"></p>
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '发送验证码', class: 'btn-primary', closeOnClick: false, onClick: () => this.handleSendCode() }
    ]);
    
    setTimeout(() => document.getElementById('fp-email')?.focus(), 100);
  },
  
  /**
   * 发送验证码
   */
  async handleSendCode() {
    const email = document.getElementById('fp-email')?.value.trim();
    const hint = document.getElementById('fp-step1-hint');
    
    if (!email) {
      hint.style.color = '#ff4444';
      hint.textContent = '请输入邮箱地址';
      return;
    }
    
    hint.style.color = 'var(--text-muted)';
    hint.textContent = '正在发送...';
    
    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Demo模式：显示验证码
        if (data.demo && data.code) {
          hint.innerHTML = `验证码已发送！<br><span style="color:var(--accent-blue);font-size:18px;font-weight:bold;">${data.code}</span><br><small style="color:var(--text-muted);">(Demo模式：验证码也会显示在服务器控制台)</small>`;
          this.tempData = { email, code: data.code };
        } else {
          hint.innerHTML = `验证码已发送到您的邮箱<br><small style="color:var(--text-muted);">(Demo模式)</small>`;
          this.tempData = { email };
        }
        
        // 3秒后显示下一步按钮
        setTimeout(() => {
          hint.innerHTML += `<br><button class="btn btn-secondary" style="margin-top:12px;" onclick="Auth.showStep2()">下一步</button>`;
        }, 3000);
      } else {
        hint.style.color = '#ff4444';
        hint.textContent = data.error || '发送失败';
      }
    } catch (error) {
      console.error('发送验证码失败:', error);
      hint.style.color = '#ff4444';
      hint.textContent = '网络错误，请重试';
    }
  },
  
  /**
   * 步骤2：输入验证码和新密码
   */
  showStep2() {
    if (!this.tempData?.email) {
      this.showStep1();
      return;
    }
    
    UI.showModal('重置密码', `
      <div class="reset-password-content">
        <p style="color:var(--text-secondary);margin-bottom:16px;">验证码已发送到 ${this.tempData.email}</p>
        <div class="form-group">
          <label>验证码</label>
          <input type="text" id="rp-code" placeholder="6位验证码" maxlength="6" style="text-align:center;font-size:18px;letter-spacing:4px;">
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input type="password" id="rp-new-password" placeholder="至少6位" minlength="6">
        </div>
        <div class="form-group">
          <label>确认密码</label>
          <input type="password" id="rp-confirm-password" placeholder="再输一次">
        </div>
        <p id="rp-hint" style="color:var(--text-muted);font-size:12px;margin-top:8px;"></p>
      </div>
    `, [
      { text: '取消', class: 'btn-secondary' },
      { text: '重置密码', class: 'btn-primary', closeOnClick: false, onClick: () => this.handleResetPassword() }
    ]);
  },
  
  /**
   * 重置密码
   */
  async handleResetPassword() {
    const code = document.getElementById('rp-code')?.value.trim();
    const newPassword = document.getElementById('rp-new-password')?.value;
    const confirmPassword = document.getElementById('rp-confirm-password')?.value;
    const hint = document.getElementById('rp-hint');
    
    if (!code || code.length !== 6) {
      hint.style.color = '#ff4444';
      hint.textContent = '请输入6位验证码';
      return;
    }
    
    if (!newPassword || newPassword.length < 6) {
      hint.style.color = '#ff4444';
      hint.textContent = '密码至少6位';
      return;
    }
    
    if (newPassword !== confirmPassword) {
      hint.style.color = '#ff4444';
      hint.textContent = '两次密码输入不一致';
      return;
    }
    
    // Demo模式：检查本地验证码
    if (this.tempData?.code && code !== this.tempData.code) {
      hint.style.color = '#ff4444';
      hint.textContent = '验证码错误';
      return;
    }
    
    hint.style.color = 'var(--text-muted)';
    hint.textContent = '正在重置...';
    
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.tempData.email,
          code,
          newPassword
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        UI.closeModal();
        UI.showToast('密码重置成功！请使用新密码登录');
        this.tempData = null;
        
        // 清空登录表单并显示
        document.getElementById('login-account').value = this.tempData?.email || '';
        document.getElementById('login-password').value = '';
      } else {
        hint.style.color = '#ff4444';
        hint.textContent = data.error || '重置失败';
      }
    } catch (error) {
      console.error('重置密码失败:', error);
      hint.style.color = '#ff4444';
      hint.textContent = '网络错误，请重试';
    }
  },
  
  async handleLogin() {
    const rawAccount = document.getElementById("login-account").value.trim();
    const account = rawAccount.includes("@") ? rawAccount.toLowerCase() : rawAccount;
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
    });
  },
  
  getCurrentUserId() {
    return this.currentUser ? this.currentUser.id : null;
  },
  
  isLoggedIn() {
    return !!this.currentUser;
  },
  
  getToken() {
    return this.token || localStorage.getItem('nova_token') || '';
  }
};

window.Auth = Auth;

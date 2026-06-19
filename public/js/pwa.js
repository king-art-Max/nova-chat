// Nova-OS PWA管理器 v1.0
(function() {
  'use strict';

  let deferredPrompt = null;
  let isInstalled = false;

  // 检测是否已安装（standalone模式运行）
  function checkInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
  }

  // 注册Service Worker
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[PWA] Service Worker 注册成功', reg.scope);
      
      // 检查更新
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            // 新版本激活，可提示用户刷新
            console.log('[PWA] 新版本已激活');
          }
        });
      });
    } catch (err) {
      console.warn('[PWA] Service Worker 注册失败', err);
    }
  }

  // 显示安装横幅
  function showInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner || isInstalled) return;
    
    // 延迟3秒显示，不打扰用户首次加载
    setTimeout(() => {
      // 检查是否之前7天内关闭过
      const dismissed = localStorage.getItem('pwa-banner-dismissed');
      if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 3600 * 1000) return;
      
      banner.classList.remove('hidden');
      banner.classList.add('show');
    }, 3000);
  }

  // 隐藏安装横幅
  function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.remove('show');
    banner.classList.add('hidden');
  }

  // iOS安装指引弹窗
  function showIOSInstallGuide() {
    const modal = document.createElement('div');
    modal.className = 'pwa-ios-modal';
    modal.innerHTML = `
      <div class="pwa-ios-modal-content">
        <div class="pwa-ios-modal-title">添加到主屏幕</div>
        <div class="pwa-ios-steps">
          <div class="pwa-ios-step">
            <span class="pwa-ios-step-num">1</span>
            <span>点击底部浏览器的 <span class="pwa-ios-share-icon">⬆ 分享</span> 按钮</span>
          </div>
          <div class="pwa-ios-step">
            <span class="pwa-ios-step-num">2</span>
            <span>在弹出的菜单中找到「添加到主屏幕」</span>
          </div>
          <div class="pwa-ios-step">
            <span class="pwa-ios-step-num">3</span>
            <span>点击「添加」，即可在桌面打开 Nova-OS</span>
          </div>
        </div>
        <button class="pwa-ios-close-btn" onclick="this.closest('.pwa-ios-modal').remove()">知道了</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // 触发安装
  async function installPWA() {
    if (deferredPrompt) {
      // Chrome/Edge 等支持的 beforeinstallprompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] 安装结果:', outcome);
      deferredPrompt = null;
      hideInstallBanner();
    } else {
      // iOS Safari - 显示手动安装指引
      showIOSInstallGuide();
    }
  }

  // 初始化
  function init() {
    isInstalled = checkInstalled();
    if (isInstalled) return; // 已安装就不显示横幅

    // 监听 beforeinstallprompt（Android Chrome / Desktop Chrome）
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });

    // 安装按钮
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', installPWA);
    }

    // 关闭按钮
    const dismissBtn = document.getElementById('pwa-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        hideInstallBanner();
        localStorage.setItem('pwa-banner-dismissed', Date.now().toString());
      });
    }

    // 安装成功事件
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] 安装成功');
      deferredPrompt = null;
      hideInstallBanner();
    });

    // iOS检测 - 没有beforeinstallprompt但可能是Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      showInstallBanner(); // iOS也显示横幅，点击后走iOS指引
    }

    // 注册Service Worker
    registerSW();
  }

  // DOM就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Nova-OS 端到端加密模块
 * 使用 Web Crypto API 实现 ECDH + AES-GCM 加密
 */

const NovaCrypto = {
  // 密钥存储
  keyPair: null,
  privateKeyJwk: null,
  publicKeyJwk: null,
  
  /**
   * 生成 ECDH 密钥对
   */
  async generateKeyPair() {
    try {
      this.keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        true, // 密钥可导出
        ['deriveKey', 'deriveBits']
      );
      
      // 导出公钥和私钥
      this.publicKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
      this.privateKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.privateKey);
      
      return {
        publicKey: this.publicKeyJwk,
        privateKey: this.privateKeyJwk
      };
    } catch (error) {
      console.error('生成密钥对失败:', error);
      throw error;
    }
  },
  
  /**
   * 从 JWK 导入公钥
   */
  async importPublicKey(jwk) {
    try {
      return await crypto.subtle.importKey(
        'jwk',
        jwk,
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        true,
        []
      );
    } catch (error) {
      console.error('导入公钥失败:', error);
      throw error;
    }
  },
  
  /**
   * 从 JWK 导入私钥
   */
  async importPrivateKey(jwk) {
    try {
      return await crypto.subtle.importKey(
        'jwk',
        jwk,
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        true,
        ['deriveKey', 'deriveBits']
      );
    } catch (error) {
      console.error('导入私钥失败:', error);
      throw error;
    }
  },
  
  /**
   * 使用 ECDH 协商共享密钥
   */
  async deriveSharedKey(theirPublicKeyJwk) {
    if (!this.keyPair) {
      throw new Error('本地密钥对未初始化');
    }
    
    try {
      const theirPublicKey = await this.importPublicKey(theirPublicKeyJwk);
      
      const sharedKey = await crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public: theirPublicKey
        },
        this.keyPair.privateKey,
        {
          name: 'AES-GCM',
          length: 256
        },
        false, // 共享密钥不可导出
        ['encrypt', 'decrypt']
      );
      
      return sharedKey;
    } catch (error) {
      console.error('协商共享密钥失败:', error);
      throw error;
    }
  },
  
  /**
   * 加密消息
   * @param {string} message - 明文消息
   * @param {Object} recipientPublicKeyJwk - 接收者公钥 (JWK格式)
   * @returns {Object} 加密结果 { iv, ciphertext }
   */
  async encryptMessage(message, recipientPublicKeyJwk) {
    try {
      // 协商共享密钥
      const sharedKey = await this.deriveSharedKey(recipientPublicKeyJwk);
      
      // 生成随机IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // 编码消息
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      
      // 加密
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        sharedKey,
        data
      );
      
      return {
        iv: this.arrayBufferToBase64(iv),
        ciphertext: this.arrayBufferToBase64(ciphertext)
      };
    } catch (error) {
      console.error('加密消息失败:', error);
      throw error;
    }
  },
  
  /**
   * 解密消息
   * @param {string} ivBase64 - IV (Base64)
   * @param {string} ciphertextBase64 - 密文 (Base64)
   * @param {Object} senderPublicKeyJwk - 发送者公钥 (JWK格式)
   * @returns {string} 解密后的明文
   */
  async decryptMessage(ivBase64, ciphertextBase64, senderPublicKeyJwk) {
    try {
      // 协商共享密钥
      const sharedKey = await this.deriveSharedKey(senderPublicKeyJwk);
      
      // 解码IV和密文
      const iv = this.base64ToArrayBuffer(ivBase64);
      const ciphertext = this.base64ToArrayBuffer(ciphertextBase64);
      
      // 解密
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        sharedKey,
        ciphertext
      );
      
      // 解码明文
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('解密消息失败:', error);
      throw error;
    }
  },
  
  /**
   * 加密消息（使用预共享密钥，适用于群聊）
   */
  async encryptMessageWithKey(message, sharedKey) {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        sharedKey,
        data
      );
      
      return {
        iv: this.arrayBufferToBase64(iv),
        ciphertext: this.arrayBufferToBase64(ciphertext)
      };
    } catch (error) {
      console.error('加密消息失败:', error);
      throw error;
    }
  },
  
  /**
   * 解密消息（使用预共享密钥）
   */
  async decryptMessageWithKey(ivBase64, ciphertextBase64, sharedKey) {
    try {
      const iv = this.base64ToArrayBuffer(ivBase64);
      const ciphertext = this.base64ToArrayBuffer(ciphertextBase64);
      
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        sharedKey,
        ciphertext
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('解密消息失败:', error);
      throw error;
    }
  },
  
  /**
   * 导入预共享密钥
   */
  async importSharedKey(keyData) {
    try {
      return await crypto.subtle.importKey(
        'raw',
        this.base64ToArrayBuffer(keyData),
        {
          name: 'AES-GCM',
          length: 256
        },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('导入共享密钥失败:', error);
      throw error;
    }
  },
  
  /**
   * 生成随机共享密钥（用于群聊）
   */
  async generateSharedKey() {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    const exported = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  },
  
  /**
   * 将 ArrayBuffer 转换为 Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
  
  /**
   * 将 Base64 转换为 ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },
  
  /**
   * 保存私钥到 localStorage（加密存储）
   */
  savePrivateKey(password) {
    if (!this.privateKeyJwk) {
      throw new Error('私钥未初始化');
    }
    
    // 使用密码派生密钥来加密私钥
    const keyMaterial = new TextEncoder().encode(password);
    
    crypto.subtle.digest('SHA-256', keyMaterial).then(hash => {
      const key = new Uint8Array(hash);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const privateKeyData = new TextEncoder().encode(JSON.stringify(this.privateKeyJwk));
      
      crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        privateKeyData
      ).then(encrypted => {
        const storage = {
          iv: this.arrayBufferToBase64(iv),
          data: this.arrayBufferToBase64(encrypted)
        };
        localStorage.setItem('nova_private_key', JSON.stringify(storage));
        console.log('私钥已加密保存');
      });
    });
  },
  
  /**
   * 从 localStorage 加载私钥
   */
  async loadPrivateKey(password) {
    const stored = localStorage.getItem('nova_private_key');
    if (!stored) {
      return false;
    }
    
    try {
      const { iv, data } = JSON.parse(stored);
      
      // 使用密码派生密钥
      const keyMaterial = new TextEncoder().encode(password);
      const hash = await crypto.subtle.digest('SHA-256', keyMaterial);
      const key = new Uint8Array(hash);
      
      // 解密私钥
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.base64ToArrayBuffer(iv) },
        key,
        this.base64ToArrayBuffer(data)
      );
      
      const decoder = new TextDecoder();
      this.privateKeyJwk = JSON.parse(decoder.decode(decrypted));
      
      // 重新构建密钥对对象
      this.keyPair = {
        privateKey: await this.importPrivateKey(this.privateKeyJwk),
        publicKey: await crypto.subtle.importKey(
          'jwk',
          this.privateKeyJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          []
        )
      };
      
      this.publicKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
      
      return true;
    } catch (error) {
      console.error('加载私钥失败:', error);
      return false;
    }
  },
  
  /**
   * 清除所有密钥数据
   */
  clearKeys() {
    this.keyPair = null;
    this.privateKeyJwk = null;
    this.publicKeyJwk = null;
    localStorage.removeItem('nova_private_key');
  },
  
  /**
   * 检查是否有本地密钥
   */
  hasLocalKey() {
    return !!localStorage.getItem('nova_private_key');
  }
};

// 导出加密模块
window.NovaCrypto = NovaCrypto;

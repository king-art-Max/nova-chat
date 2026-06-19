/**
 * Nova-OS 主服务器
 * Express + Socket.io + API路由
 */

require('dotenv').config();

const fetch = require('node-fetch');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./database');

// 预设的AI回复（当没有配置API Key时使用）
const AI_FALLBACK_REPLIES = {
  'AI-NOVA000001': [
    '你好！有什么我可以帮你的吗？',
    '这是一个有趣的问题，让我来帮你分析一下。',
    '好的，我已经理解你的需求了。',
    '很高兴和你聊天！还有什么想了解的？',
    '根据我的分析，这个问题可以从几个角度来看。'
  ],
  'AI-TOXIC00002': [
    '哈？这也要问？你是不是没上过学？',
    '说真的，这个问题有点低级，我都懒得吐槽了。',
    '行吧，既然你这么问了，我就勉为其难回答一下。',
    '你是不是在网上冲浪冲傻了？这种问题也来问我？',
    '好吧好吧，我忍住了，答案就是这样的。'
  ],
  'AI-EMOTI00003': [
    '听起来你现在有些困惑呢，没关系的，慢慢来。',
    '我理解你的感受，能和我多说一些吗？',
    '谢谢你愿意和我分享这些。',
    '不管怎样，我都在这里倾听你。',
    '你的感受是很重要的，让我陪你想一想。'
  ],
  'AI-DATA000004': [
    '根据数据分析，这个问题涉及以下几个关键指标。',
    '从概率学角度来说，这种情况发生的可能性约为37%。',
    '让我用数据来为你解答：首先，我们需要收集足够的样本。',
    '从统计学角度来看，你的观察是准确的。',
    '基于现有数据模型，我的建议是：保持谨慎乐观。'
  ]
};

function getFallbackReply(aiGalNumber) {
  const replies = AI_FALLBACK_REPLIES[aiGalNumber] || AI_FALLBACK_REPLIES['AI-NOVA000001'];
  return replies[Math.floor(Math.random() * replies.length)];
}

async function startServer() {
  // 初始化数据库
  await db.initDatabase();

  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // 支持大图片
  app.use(express.static(path.join(__dirname, 'public')));

  const onlineUsers = new Map();

  // ==================== API 路由 ====================

  app.post('/api/register', async (req, res) => {
    const { nickname, password, publicKey, email } = req.body;
    if (!nickname || !password) {
      return res.status(400).json({ success: false, error: '昵称和密码不能为空' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: '密码至少6位' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: '请填写邮箱，用于找回账号' });
    }
    try {
      const result = await db.registerUser(nickname, password, publicKey, email);
      if (result.success) {
        const token = uuidv4();
        res.json({ success: true, user: result.user, token });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('注册错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { account, password } = req.body;
    console.log(`🔐 登录请求: account="${account}", dbMode=${process.env.DATABASE_URL ? "PostgreSQL" : "SQLite"}`);
    if (!account || !password) {
      return res.status(400).json({ success: false, error: '账号和密码不能为空' });
    }
    try {
      const result = await db.loginUser(account, password);
      if (result.success) {
        const token = uuidv4();
        res.json({ success: true, user: result.user, token });
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      console.error('登录错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 忘记密码 - 发送验证码
  app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: '请输入邮箱地址' });
    }
    
    try {
      // 检查邮箱是否存在
      const user = await db.getUserByEmail(email);
      if (!user) {
        // 为了安全，不告诉用户邮箱是否存在
        return res.json({ success: true, message: '如果邮箱存在，验证码已发送' });
      }
      
      const reset = await db.createPasswordReset(email);
      // Demo模式：在响应中返回验证码（生产环境应发送邮件）
      console.log(`📧 密码重置验证码 [${email}]: ${reset.code}`);
      
      res.json({ 
        success: true, 
        message: '验证码已发送（Demo模式：验证码会显示在控制台）',
        demo: true,
        code: reset.code // Demo模式下返回验证码
      });
    } catch (error) {
      console.error('忘记密码错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 重置密码
  app.post('/api/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '密码至少6位' });
    }
    
    try {
      const reset = await db.verifyPasswordReset(email, code);
      if (!reset) {
        return res.status(400).json({ success: false, error: '验证码无效或已过期' });
      }
      
      const success = await db.resetPassword(email, newPassword);
      if (success) {
        res.json({ success: true, message: '密码重置成功' });
      } else {
        res.status(400).json({ success: false, error: '密码重置失败' });
      }
    } catch (error) {
      console.error('重置密码错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.get('/api/user/:galNumber', async (req, res) => {
    try {
      const user = await db.getUserByGal(req.params.galNumber);
      if (user) {
        res.json({
          success: true,
          user: {
            id: user.id,
            galNumber: user.gal_number,
            nickname: user.nickname,
            avatar: user.avatar,
            publicKey: user.public_key,
            isOnline: onlineUsers.has(user.id)
          }
        });
      } else {
        res.status(404).json({ success: false, error: '用户不存在' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.put('/api/user', async (req, res) => {
    const { userId, nickname, avatar, publicKey } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    try {
      const success = await db.updateUser(userId, { nickname, avatar, public_key: publicKey });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });


  // 获取用户完整信息
  app.get('/api/user/info/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    try {
      const user = await db.getUserFullInfo(userId);
      if (user) {
        res.json({
          success: true,
          user: {
            id: user.id,
            galNumber: user.gal_number,
            email: user.email,
            nickname: user.nickname,
            avatar: user.avatar,
            publicKey: user.public_key,
            createdAt: user.created_at
          }
        });
      } else {
        res.status(404).json({ success: false, error: '用户不存在' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 修改密码
  app.put('/api/user/password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码至少6位' });
    }
    try {
      const isValid = await db.verifyPassword(userId, oldPassword);
      if (!isValid) {
        return res.status(401).json({ success: false, error: '旧密码错误' });
      }
      const success = await db.updateUserPassword(userId, newPassword);
      if (success) {
        res.json({ success: true, message: '密码修改成功' });
      } else {
        res.status(500).json({ success: false, error: '密码修改失败' });
      }
    } catch (error) {
      console.error('修改密码错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.get('/api/contacts', async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    try {
      const contacts = (await db.getContacts(userId)).map(c => ({
        id: c.id,
        galNumber: c.gal_number,
        nickname: c.nickname,
        avatar: c.avatar,
        publicKey: c.public_key,
        direction: c.direction,
        status: c.status,
        isOnline: onlineUsers.has(c.id)
      }));
      res.json({ success: true, contacts });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/contacts/add', async (req, res) => {
    const { userId, contactGal } = req.body;
    if (!userId || !contactGal) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    try {
      const result = await db.addContact(userId, contactGal);
      if (result.success && result.contact) {
        // 通知被添加的用户
        const targetSocketId = onlineUsers.get(result.contact.id);
        if (targetSocketId) {
          io.to(targetSocketId).emit('friend-request', {
            from: userId,
            galNumber: result.contact.galNumber || contactGal
          });
        }
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/contacts/accept', async (req, res) => {
    const { userId, contactId } = req.body;
    console.log('接受好友请求:', { userId, contactId });
    if (!userId || !contactId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    try {
      const success = await db.acceptContact(userId, parseInt(contactId));
      console.log('接受结果:', success);
      if (success) {
        // 通知请求发起人
        const targetSocketId = onlineUsers.get(parseInt(contactId));
        if (targetSocketId) {
          io.to(targetSocketId).emit('friend-accepted', {
            from: userId
          });
        }
      }
      res.json({ success });
    } catch (error) {
      console.error('接受请求错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.get('/api/chats', async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    try {
      const chats = await db.getChats(userId);
      const enrichedChats = [];
      for (const chat of chats) {
        const members = await db.getChatMembers(chat.id);
        // 获取最后一条消息和未读数
        const lastMsg = await db.getLastMessage(chat.id);
        const unreadCount = await db.getUnreadCount(chat.id, userId);
        enrichedChats.push({
          ...chat,
          members: members.map(m => ({
            id: m.id,
            galNumber: m.gal_number,
            nickname: m.nickname,
            avatar: m.avatar,
            publicKey: m.public_key,
            role: m.role,
            is_muted: m.is_muted || false
          })),
          lastMessage: lastMsg ? {
            content: lastMsg.encrypted_content,
            type: lastMsg.type,
            senderId: lastMsg.sender_id,
            createdAt: lastMsg.created_at
          } : null,
          unreadCount: unreadCount
        });
      }
      res.json({ success: true, chats: enrichedChats });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/chats', async (req, res) => {
    const { type, name, userId, memberIds } = req.body;
    if (!type || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    try {
      let chatId;
      if (type === 'private' && memberIds && memberIds.length > 0) {
        chatId = await db.createPrivateChat(userId, memberIds[0]);
      } else if (type === 'group' && name) {
        chatId = await db.createGroupChat(name, userId);
        if (memberIds && memberIds.length > 0) {
          for (const memberId of memberIds) {
            if (memberId !== userId) {
              await db.addChatMember(chatId, memberId);
            }
          }
        }
      } else {
        return res.status(400).json({ success: false, error: '参数不完整' });
      }
      const members = await db.getChatMembers(chatId);
      res.json({
        success: true,
        chat: {
          id: chatId,
          type,
          name: name || '私聊',
          members: members.map(m => ({
            id: m.id,
            galNumber: m.gal_number,
            nickname: m.nickname,
            avatar: m.avatar,
            publicKey: m.public_key
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.get('/api/chats/:id/messages', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    try {
      const messages = (await db.getMessages(chatId, limit, offset)).map(m => ({
        id: m.id,
        chatId: m.chat_id,
        senderId: m.sender_id,
        galNumber: m.gal_number,
        nickname: m.nickname,
        avatar: m.avatar,
        encryptedContent: m.encrypted_content,
        type: m.type,
        ttl: m.ttl,
        isRecalled: m.is_recalled,
        readBy: m.read_by,
        createdAt: m.created_at
      }));
      res.json({ success: true, messages });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/chats/:id/messages', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { senderId, encryptedContent, type, ttl, burnAfter, isAnonymous } = req.body;
    if (!chatId || !senderId || !encryptedContent) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    try {
      // 群组消息权限检查
      const chat = await db.getChatById(chatId);
      if (chat && chat.type === 'group') {
        const chatMembers = await db.getChatMembers(chatId);
        const senderMember = chatMembers.find(m => m.id === senderId);
        
        // 检查禁言状态
        if (senderMember && senderMember.is_muted) {
          return res.status(403).json({ success: false, error: '你已被禁言' });
        }
        
        // 会议模式：仅管理员可发言
        if (chat.group_mode === 'meeting' && senderMember && !['owner', 'admin'].includes(senderMember.role)) {
          return res.status(403).json({ success: false, error: '会议模式下仅管理员可发言' });
        }
      }
      
      const messageId = await db.saveMessage(chatId, senderId, encryptedContent, type || 'normal', ttl || null, burnAfter || 0, isAnonymous || false);
      const sender = await db.getUserById(senderId);
      const message = {
        id: messageId,
        chatId,
        senderId,
        galNumber: sender ? sender.gal_number : 'ANONYMOUS',
        nickname: sender ? sender.nickname : '匿名',
        avatar: sender ? sender.avatar : 'anonymous',
        encryptedContent,
        type: type || 'normal',
        ttl: ttl || null,
        burnAfter: burnAfter || 0,
        isAnonymous: isAnonymous || false,
        isRecalled: false,
        createdAt: new Date().toISOString()
      };
      // 通过Socket广播给聊天室的所有成员
      io.to(`chat-${chatId}`).emit('new-message', message);
      
      // AI公司群组：自动触发AI回复
      if (type !== 'self-destruct' && type !== 'red_packet') {
        triggerAICompanyReply(chatId, senderId, encryptedContent, type, io);
      }
      
      res.json({ success: true, message });
    } catch (error) {
      console.error('保存消息失败:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });


  // 清空聊天记录（删除该聊天下所有消息）
  app.delete('/api/chats/:id/messages', async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (!chatId) {
      return res.status(400).json({ success: false, error: '缺少聊天ID' });
    }
    try {
      const success = await db.deleteChatMessages(chatId);
      res.json({ success });
    } catch (error) {
      console.error('清空聊天记录错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 删除聊天
  app.delete('/api/chats/:id', async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (!chatId) {
      return res.status(400).json({ success: false, error: '缺少聊天ID' });
    }
    try {
      const success = await db.deleteChat(chatId);
      res.json({ success });
    } catch (error) {
      console.error('删除聊天错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 删除消息
  app.delete('/api/messages/:id', async (req, res) => {
    const messageId = parseInt(req.params.id);
    if (!messageId) {
      return res.status(400).json({ success: false, error: '缺少消息ID' });
    }
    try {
      const success = await db.deleteMessage(messageId);
      res.json({ success });
    } catch (error) {
      console.error('删除消息错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 删除联系人
  app.delete('/api/contacts/:id', async (req, res) => {
    const contactId = parseInt(req.params.id);
    const { userId } = req.body;
    if (!contactId || !userId) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }
    try {
      const success = await db.deleteContact(userId, contactId);
      res.json({ success });
    } catch (error) {
      console.error('删除联系人错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // 消息撤回
  app.put('/api/chats/:id/messages/:messageId/recall', async (req, res) => {
    const messageId = parseInt(req.params.messageId);
    const userId = parseInt(req.body.userId);
    
    if (!messageId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 验证消息是否属于该用户且在2分钟内
      const message = await db.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ success: false, error: '消息不存在' });
      }
      
      if (message.sender_id !== userId) {
        return res.status(403).json({ success: false, error: '只能撤回自己的消息' });
      }
      
      const messageTime = new Date(message.created_at);
      const now = new Date();
      const diffMinutes = (now - messageTime) / 1000 / 60;
      
      if (diffMinutes > 2) {
        return res.status(400).json({ success: false, error: '消息已超过2分钟，无法撤回' });
      }
      
      const success = await db.recallMessage(messageId);
      if (success) {
        // 广播撤回事件
        io.to(`chat-${message.chat_id}`).emit('message-recalled', { 
          messageId, 
          chatId: message.chat_id 
        });
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: '撤回失败' });
      }
    } catch (error) {
      console.error('撤回消息错误:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    const { aiGalNumber, message, history } = req.body;
    if (!aiGalNumber || !message) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    try {
      const persona = await db.getAIPersona(aiGalNumber);
      if (!persona) {
        return res.status(404).json({ success: false, error: 'AI人格不存在' });
      }
      if (process.env.DEEPSEEK_API_KEY) {
        console.log('🔑 调用DeepSeek API, Key前6位:', process.env.DEEPSEEK_API_KEY.substring(0, 6));
        try {
          const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: persona.system_prompt },
                ...(history || []).map(h => ({
                  role: h.isUser ? 'user' : 'assistant',
                  content: h.content
                })),
                { role: 'user', content: message }
              ],
              stream: false
            })
          });
          const data = await response.json();
          console.log('📡 DeepSeek响应:', JSON.stringify(data).substring(0, 200));
          if (data.error) {
            console.error('❌ DeepSeek API错误:', data.error);
            // 降级到预设回复
          } else if (data.choices && data.choices[0]) {
            return res.json({
              success: true,
              reply: data.choices[0].message.content,
              aiName: persona.name,
              aiGal: persona.gal_number,
              aiAvatar: persona.avatar
            });
          }
        } catch (error) {
          console.error('❌ DeepSeek请求失败:', error.message);
        }
      } else {
        console.log('⚠️ 未配置DEEPSEEK_API_KEY环境变量');
      }
      const reply = getFallbackReply(aiGalNumber);
      res.json({
        success: true,
        reply,
        aiName: persona.name,
        aiGal: persona.gal_number,
        aiAvatar: persona.avatar,
        isFallback: true
      });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.get('/api/ai/personas', async (req, res) => {
    try {
      const personas = (await db.getAIPersonas()).map(p => ({
        id: p.id,
        galNumber: p.gal_number,
        name: p.name,
        avatar: p.avatar,
        systemPrompt: p.system_prompt
      }));
      res.json({ success: true, personas });
    } catch (error) {
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  app.post('/api/wallet/create', (req, res) => {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    res.json({
      success: true,
      address,
      balance: '1.0000',
      privateKey: null
    });
  });

  // ==================== 红包API ====================
  app.post('/api/red-packets', async (req, res) => {
    try {
      const { chatId, senderId, amount, count, type, message } = req.body;
      if (!chatId || !senderId || !amount || amount <= 0 || !count || count <= 0) {
        return res.status(400).json({ error: '参数无效' });
      }
      // 检查余额
      const sender = await db.getUserByGalNumber(senderId);
      if (!sender || (sender.balance || 0) < amount) {
        return res.status(400).json({ error: '余额不足' });
      }
      // 扣除余额
      await db.updateBalance(senderId, -(amount));
      // 创建红包
      const redPacket = await db.createRedPacket(chatId, senderId, amount, count, type || 'random', message || '恭喜发财，大吉大利');
      // 发送红包消息
      const msgId = await db.saveMessage(chatId, senderId, String(redPacket.id), 'red_packet', 0, 0, false);
      // 通知聊天室
      io.to(`chat-${chatId}`).emit('new-message', {
        id: msgId, chatId, senderId, encryptedContent: String(redPacket.id),
        type: 'red_packet', burnAfter: 0, isAnonymous: false,
        createdAt: new Date().toISOString()
      });
      res.json({ success: true, redPacketId: redPacket.id });
    } catch (err) {
      console.error('创建红包失败:', err);
      res.status(500).json({ error: '创建红包失败' });
    }
  });

  app.post('/api/red-packets/:id/claim', async (req, res) => {
    try {
      const { userId } = req.body;
      const rpId = req.params.id;
      const redPacket = await db.getRedPacket(rpId);
      if (!redPacket) return res.status(404).json({ error: '红包不存在' });
      // 检查是否已领
      const claimed = await db.hasClaimedRedPacket(rpId, userId);
      if (claimed) return res.status(400).json({ error: '已领取过' });
      // 检查是否领完
      if (redPacket.claimed_count >= redPacket.count) return res.status(400).json({ error: '红包已领完' });
      // 计算金额
      let claimAmount;
      if (redPacket.type === 'normal') {
        claimAmount = Math.floor(redPacket.amount / redPacket.count * 100) / 100;
      } else {
        // 随机红包
        const remaining = redPacket.amount - (redPacket.claimed_amount || 0);
        const remainingCount = redPacket.count - redPacket.claimed_count;
        if (remainingCount === 1) {
          claimAmount = Math.round(remaining * 100) / 100;
        } else {
          const avg = remaining / remainingCount;
          claimAmount = Math.round((Math.random() * avg * 2) * 100) / 100;
          claimAmount = Math.min(claimAmount, remaining - 0.01 * (remainingCount - 1));
        }
      }
      // 创建领取记录
      await db.claimRedPacket(rpId, userId, claimAmount);
      // 增加余额
      await db.updateBalance(userId, claimAmount);
      res.json({ success: true, amount: claimAmount, type: redPacket.type, message: redPacket.message });
    } catch (err) {
      console.error('领取红包失败:', err);
      res.status(500).json({ error: '领取红包失败' });
    }
  });

  app.get('/api/red-packets/:id', async (req, res) => {
    try {
      const rpId = req.params.id;
      const redPacket = await db.getRedPacketWithClaims(rpId);
      if (!redPacket) return res.status(404).json({ error: '红包不存在' });
      res.json({ success: true, redPacket });
    } catch (err) {
      console.error('获取红包详情失败:', err);
      res.status(500).json({ error: '获取红包详情失败' });
    }
  });

  // 联系人收藏
  app.post('/api/contacts/:id/star', async (req, res) => {
    try {
      const contactId = req.params.id;
      const { isStarred } = req.body;
      await db.toggleContactStar(contactId, isStarred);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: '操作失败' });
    }
  });

  // ==================== 翻译API ====================
  app.post('/api/translate', async (req, res) => {
    const { text, from, to } = req.body;
    if (!text || !from || !to) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      if (process.env.DEEPSEEK_API_KEY) {
        const langNames = {
          'zh': '中文', 'zh-TW': '中文繁体', 'en': '英语', 'en-GB': '英式英语',
          'ja': '日语', 'ko': '韩语', 'fr': '法语', 'de': '德语',
          'es': '西班牙语', 'it': '意大利语', 'ru': '俄语', 'ar': '阿拉伯语'
        };
        const fromName = langNames[from] || from;
        const toName = langNames[to] || to;
        
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'user', content: `请将以下文本从${fromName}翻译为${toName}，只返回翻译结果，不要任何解释：

${text}` }
            ],
            stream: false
          })
        });
        
        const data = await response.json();
        if (data.error) {
          console.error('翻译API错误:', data.error);
          return res.status(500).json({ success: false, error: '翻译服务错误' });
        }
        
        const translatedText = data.choices?.[0]?.message?.content?.trim() || text;
        return res.json({ success: true, translatedText });
      } else {
        // 无API Key时返回原文
        return res.json({ success: true, translatedText: text, fallback: true });
      }
    } catch (error) {
      console.error('翻译请求失败:', error);
      return res.status(500).json({ success: false, error: '翻译请求失败' });
    }
  });

  // 标记消息已读并处理阅后即焚
  app.post('/api/chats/:id/messages/:messageId/read', async (req, res) => {
    const messageId = parseInt(req.params.messageId);
    const chatId = parseInt(req.params.id);
    const { userId } = req.body;
    
    if (!messageId || !chatId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      await db.markMessageRead(chatId, userId, messageId);
      
      // 检查是否是阅后即焚消息
      const message = await db.getMessageById(messageId);
      if (message && message.burn_after > 0 && !message.burned_at) {
        // 广播已读事件
        io.to(`chat-${chatId}`).emit('message-read-by', { messageId, userId });
        
        // 设置阅后即焚定时器
        const burnAfterSeconds = message.burn_after;
        setTimeout(async () => {
          try {
            await db.markMessageBurned(messageId);
            io.to(`chat-${chatId}`).emit('message-burned', { messageId, chatId });
          } catch (err) {
            console.error('销毁消息失败:', err);
          }
        }, burnAfterSeconds * 1000);
        
        return res.json({ success: true, burnAfter: burnAfterSeconds });
      }
      
      io.to(`chat-${chatId}`).emit('message-read-by', { messageId, userId });
      res.json({ success: true });
    } catch (error) {
      console.error('标记已读失败:', error);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  });

  // ==================== Socket.io 事件 ====================

// AI公司群组自动回复
async function triggerAICompanyReply(chatId, senderId, encryptedContent, messageType, io) {
  try {
    // 检查是否是AI公司群组
    const chat = await db.getChatById(chatId);
    if (!chat || chat.group_mode !== 'ai_company') return;
    
    // 获取群成员
    const members = await db.getChatMembers(chatId);
    const aiMembers = members.filter(m => m.gal_number && m.gal_number.startsWith('AI-'));
    
    // 不为自己发的AI消息触发回复
    const sender = await db.getUserById(senderId);
    if (sender && sender.gal_number && sender.gal_number.startsWith('AI-')) return;
    
    if (aiMembers.length === 0) return;
    
    // 解析消息内容
    let userMessage = '';
    try {
      const parsed = JSON.parse(encryptedContent);
      userMessage = parsed.content || parsed.plain || encryptedContent;
    } catch (e) {
      userMessage = encryptedContent;
    }
    
    // 只对文本和普通消息触发回复，不对图片/语音/文件/红包触发
    if (messageType && !['normal', 'text', undefined].includes(messageType)) return;
    
    // 随机选择1-3个AI回复（模拟会议讨论）
    const replyCount = Math.min(aiMembers.length, Math.floor(Math.random() * 3) + 1);
    const shuffled = aiMembers.sort(() => Math.random() - 0.5);
    const responders = shuffled.slice(0, replyCount);
    
    for (const aiMember of responders) {
      // 每个AI延迟不同时间回复
      const delay = 1500 + Math.random() * 3000 + responders.indexOf(aiMember) * 2000;
      
      setTimeout(async () => {
        try {
          const persona = await db.getAIPersona(aiMember.gal_number);
          if (!persona) return;
          
          let replyText = '';
          
          if (process.env.DEEPSEEK_API_KEY) {
            try {
              const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                  model: 'deepseek-chat',
                  messages: [
                    { role: 'system', content: persona.system_prompt },
                    { role: 'user', content: `在公司群聊中，老板说："${userMessage}"，请从你的岗位角度简短回复（50字以内）。` }
                  ],
                  stream: false,
                  max_tokens: 150
                })
              });
              const data = await response.json();
              if (data.choices && data.choices[0]) {
                replyText = data.choices[0].message.content;
              }
            } catch (e) {
              console.error('AI回复API调用失败:', e.message);
            }
          }
          
          // 降级预设回复
          if (!replyText) {
            replyText = getAICompanyFallbackReply(aiMember.gal_number, userMessage);
          }
          
          // 保存AI消息到数据库
          const aiMessageContent = JSON.stringify({ type: 'ai-reply', content: replyText, plain: replyText });
          const aiMsgId = await db.saveMessage(chatId, aiMember.id, aiMessageContent, 'normal', null, 0, false);
          
          // 广播AI消息
          io.to(`chat-${chatId}`).emit('new-message', {
            id: aiMsgId,
            chatId,
            senderId: aiMember.id,
            galNumber: aiMember.gal_number,
            nickname: persona.name || aiMember.nickname,
            avatar: aiMember.avatar || 'robot',
            encryptedContent: aiMessageContent,
            type: 'normal',
            isAnonymous: false,
            isRecalled: false,
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          console.error('AI自动回复失败:', e.message);
        }
      }, delay);
    }
  } catch (e) {
    console.error('triggerAICompanyReply error:', e.message);
  }
}

// AI公司降级预设回复
function getAICompanyFallbackReply(galNumber, userMessage) {
  const fallbacks = {
    'AI-CEO000005': '收到，我会统筹安排。大家有什么建议？',
    'AI-CFO000006': '从财务角度，需要评估预算可行性后给出意见。',
    'AI-COO000007': '运营方面可以配合执行，具体方案我来制定。',
    'AI-CMO000008': '这个方向不错，从市场角度我非常支持！',
    'AI-CTO000009': '技术实现上没有障碍，我安排研发评估。',
    'AI-LAW000010': '需要确认合规性，建议先做风险评估。',
    'AI-AUD000011': '我关注执行过程的合规和效率，后续跟踪。'
  };
  return fallbacks[galNumber] || '收到，我会跟进处理。';
}

  io.on('connection', (socket) => {
    console.log('🔌 用户连接:', socket.id);
    
    socket.on('user-online', async (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      io.emit('user-status', { userId, status: 'online' });
      
      // 自动加入该用户所有聊天房间，确保任何页面都能收到消息
      try {
        const chats = await db.getChats(userId);
        for (const chat of chats) {
          socket.join(`chat-${chat.id}`);
        }
        console.log(`✅ 用户${userId}已加入${chats.length}个聊天房间`);
      } catch (err) {
        console.error('加入聊天房间失败:', err);
      }
    });
    
    socket.on('join-chat', (chatId) => {
      socket.join(`chat-${chatId}`);
    });
    
    socket.on('leave-chat', (chatId) => {
      // 不再离开房间，保持连接以持续接收消息推送
      // socket.leave(`chat-${chatId}`);
    });
    
    socket.on('send-message', async (data) => {
      const { chatId, senderId, encryptedContent, type, ttl, burnAfter, isAnonymous } = data;
      try {
        // 群组消息权限检查
        const chat = await db.getChatById(chatId);
        if (chat && chat.type === 'group') {
          const chatMembers = await db.getChatMembers(chatId);
          const senderMember = chatMembers.find(m => m.id === senderId);
          if (senderMember && senderMember.is_muted) {
            socket.emit('error', { message: '你已被禁言' });
            return;
          }
          if (chat.group_mode === 'meeting' && senderMember && !['owner', 'admin'].includes(senderMember.role)) {
            socket.emit('error', { message: '会议模式下仅管理员可发言' });
            return;
          }
        }
        
        const messageId = await db.saveMessage(chatId, senderId, encryptedContent, type, ttl, burnAfter || 0, isAnonymous || false);
        const sender = await db.getUserById(senderId);
        const messageData = {
          id: messageId,
          chatId,
          senderId,
          galNumber: sender ? sender.gal_number : 'ANONYMOUS',
          nickname: sender ? sender.nickname : '匿名',
          avatar: sender ? sender.avatar : 'anonymous',
          encryptedContent,
          type: type || 'normal',
          ttl: ttl || null,
          burnAfter: burnAfter || 0,
          isAnonymous: isAnonymous || false,
          isRecalled: false,
          createdAt: new Date().toISOString()
        };
        // 向聊天室所有人广播新消息
        io.to(`chat-${chatId}`).emit('new-message', messageData);
        // 向发送者确认消息已送达服务器
        socket.emit('message-sent', { tempId: data.tempId, messageId: messageId, createdAt: messageData.createdAt });
        
        // AI公司群组：自动触发AI回复
        if (type !== 'self-destruct') {
          triggerAICompanyReply(chatId, senderId, encryptedContent, type, io);
        }
        
        if (type === 'self-destruct' && ttl) {
          setTimeout(async () => {
            await db.deleteMessage(messageId);
            io.to(`chat-${chatId}`).emit('message-destroyed', { messageId });
          }, ttl * 1000);
        }
      } catch (error) {
        console.error('发送消息失败:', error);
        socket.emit('error', { message: '发送消息失败' });
      }
    });
    
    socket.on('typing', (data) => {
      const { chatId, userId, nickname } = data;
      socket.to(`chat-${chatId}`).emit('user-typing', { userId, nickname });
    });
    
    socket.on('stop-typing', (data) => {
      const { chatId, userId } = data;
      socket.to(`chat-${chatId}`).emit('user-stop-typing', { userId });
    });
    
    socket.on('message-read', async (data) => {
      const { messageId, chatId, userId } = data;
      try {
        await db.markMessageRead(chatId, userId, messageId);
        const message = await db.getMessageById(messageId);
        
        if (message && message.burn_after > 0 && !message.burned_at) {
          setTimeout(async () => {
            try {
              await db.markMessageBurned(messageId);
              io.to(`chat-${chatId}`).emit('message-burned', { messageId, chatId });
            } catch (err) {
              console.error('销毁消息失败:', err);
            }
          }, message.burn_after * 1000);
        }
        
        io.to(`chat-${chatId}`).emit('message-read-by', { messageId, userId });
      } catch (error) {
        console.error('消息已读处理失败:', error);
      }
    });
    
    socket.on('recall-message', async (data) => {
      const { messageId, chatId, userId } = data;
      try {
        const message = await db.getMessageById(messageId);
        if (!message || message.sender_id !== userId) {
          socket.emit('error', { message: '无法撤回此消息' });
          return;
        }
        
        const success = await db.recallMessage(messageId);
        if (success) {
          io.to(`chat-${chatId}`).emit('message-recalled', { messageId, chatId });
        }
      } catch (error) {
        console.error('撤回消息失败:', error);
        socket.emit('error', { message: '撤回失败' });
      }
    });
    
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('user-status', { userId: socket.userId, status: 'offline' });
      }
    });
    

  });

  // 数据库状态接口
  app.get('/api/status', (req, res) => {
    res.json({
      success: true,
      dbMode: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite (MEMORY - DATA WILL BE LOST!)',
      hasDatabase: !!process.env.DATABASE_URL,
      hasAI: !!process.env.DEEPSEEK_API_KEY
    });
  });

  // ==================== 启动服务器 ====================

  const PORT = process.env.PORT || 3000;


  // ==================== V3.0 新增API ====================
  app.post('/api/ai-company/create', async (req, res) => {
    const { userId, companyName, industry, selectedRoles } = req.body;
    
    if (!userId || !companyName || !selectedRoles || selectedRoles.length === 0) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 获取用户信息
      const user = await db.getUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      
      // 检查是否已存在同名AI公司（防重复创建）
      const existingChats = await db.getChats(userId);
      const duplicate = existingChats.find(c => c.name === `${companyName} AI公司` && c.type === 'group');
      if (duplicate) {
        return res.json({
          success: true,
          chatId: duplicate.id,
          chatName: duplicate.name,
          members: [],
          isExisting: true
        });
      }
      
      // 创建群组
      const chatId = await db.createGroupChat(`${companyName} AI公司`, userId);
      
      // 更新群组信息
      await db.updateChatGroupMode(chatId, 'ai_company', `${industry || '综合'}`);
      
      // 添加用户为群主
      await db.updateChatMemberRole(chatId, userId, 'owner');
      
      // 获取选中的AI人格，为每个AI创建用户账号并添加为群成员
      const personas = await db.getAIPersonasByGalNumbers(selectedRoles);
      const addedMembers = [];
      for (const persona of personas) {
        try {
          // 确保AI人格有对应的用户账号
          const aiUser = await db.ensureAIUser(persona);
          await db.addChatMember(chatId, aiUser.id, 'member');
          addedMembers.push({
            id: aiUser.id,
            galNumber: persona.gal_number,
            nickname: persona.name,
            role: 'member'
          });
        } catch (e) {
          console.error('添加AI成员失败:', persona.gal_number, e.message);
          // 单个AI成员失败不影响整体创建
        }
      }
      
      res.json({
        success: true,
        chatId,
        chatName: `${companyName} AI公司`,
        members: [
          {
            id: user.id,
            galNumber: user.gal_number,
            nickname: user.nickname,
            role: 'owner'
          },
          ...addedMembers
        ]
      });
    } catch (error) {
      console.error('创建AI公司失败:', error);
      res.status(500).json({ success: false, error: '创建失败' });
    }
  });
  
  // 召开AI会议
  app.post('/api/ai-company/:chatId/meeting', async (req, res) => {
    const chatId = parseInt(req.params.chatId);
    const { userId, agenda } = req.body;
    
    if (!userId || !chatId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 获取群组成员
      const members = await db.getChatMembers(chatId);
      const aiMembers = members.filter(m => m.gal_number.startsWith('AI-'));
      
      if (aiMembers.length === 0) {
        return res.status(400).json({ success: false, error: '该群组不是AI公司群组' });
      }
      
      // 创建会议记录
      const meetingId = await db.createMeeting(chatId, userId, agenda || '公司例会');
      
      // 生成AI会议内容
      const meetingContent = await generateAIMeetingContent(aiMembers, members, agenda);
      
      res.json({
        success: true,
        meetingId,
        content: meetingContent
      });
    } catch (error) {
      console.error('召开会议失败:', error);
      res.status(500).json({ success: false, error: '会议召开失败' });
    }
  });
  
  // 获取会议历史
  app.get('/api/ai-company/:chatId/meetings', async (req, res) => {
    const chatId = parseInt(req.params.chatId);
    
    try {
      const meetings = await db.getMeetings(chatId);
      res.json({ success: true, meetings });
    } catch (error) {
      console.error('获取会议历史失败:', error);
      res.status(500).json({ success: false, error: '获取失败' });
    }
  });
  
  // AI会议内容生成（使用DeepSeek API）
  async function generateAIMeetingContent(aiMembers, allMembers, agenda) {
    const user = allMembers.find(m => !m.gal_number.startsWith('AI-'));
    const companyName = user?.nickname ? `${user.nickname}的公司` : '公司';
    
    const ceo = aiMembers.find(m => m.gal_number === 'AI-CEO000005');
    const cfo = aiMembers.find(m => m.gal_number === 'AI-CFO000006');
    const coo = aiMembers.find(m => m.gal_number === 'AI-COO000007');
    const cmo = aiMembers.find(m => m.gal_number === 'AI-CMO000008');
    const cto = aiMembers.find(m => m.gal_number === 'AI-CTO000009');
    const law = aiMembers.find(m => m.gal_number === 'AI-LAW000010');
    const aud = aiMembers.find(m => m.gal_number === 'AI-AUD000011');
    
    const messages = [];
    
    // 会议开始
    if (ceo) {
      messages.push({
        sender: ceo.name,
        galNumber: ceo.gal_number,
        content: `各位同事，大家好！我是${ceo.name}，今天由我主持本次${agenda || '公司例会'}。请各部门依次汇报工作。`
      });
    }
    
    // 财务汇报
    if (cfo) {
      messages.push({
        sender: cfo.name,
        galNumber: cfo.gal_number,
        content: `${cfo.name}汇报：本月财务状况良好，收入同比增长15%，成本控制在预算范围内。建议下季度加大研发投入。`
      });
    }
    
    // 运营汇报
    if (coo) {
      messages.push({
        sender: coo.name,
        galNumber: coo.gal_number,
        content: `${coo.name}汇报：运营效率提升20%，团队协作顺畅。建议优化部分工作流程，提高响应速度。`
      });
    }
    
    // 市场汇报
    if (cmo) {
      messages.push({
        sender: cmo.name,
        galNumber: cmo.gal_number,
        content: `${cmo.name}汇报：本月品牌曝光度提升30%，新用户增长25%。建议加强社交媒体运营。`
      });
    }
    
    // 技术汇报
    if (cto) {
      messages.push({
        sender: cto.name,
        galNumber: cto.gal_number,
        content: `${cto.name}汇报：核心系统稳定性达99.9%，新功能开发进度正常。建议关注技术债务问题。`
      });
    }
    
    // 法务建议
    if (law) {
      messages.push({
        sender: law.name,
        galNumber: law.gal_number,
        content: `${law.name}提示：近期需关注数据合规要求，建议进行合规审查。`
      });
    }
    
    // 监督官总结
    if (aud) {
      messages.push({
        sender: aud.name,
        galNumber: aud.gal_number,
        content: `${aud.name}总结：各部门工作稳步推进。改进建议：1)加强跨部门协作；2)优化决策流程；3)关注员工成长。会议纪要将同步给所有成员。`
      });
    }
    
    // 总经理总结
    if (ceo) {
      messages.push({
        sender: ceo.name,
        galNumber: ceo.gal_number,
        content: `感谢各位的汇报！会议到此结束，请各部门根据会议内容制定下周工作计划。`
      });
    }
    
    return messages;
  }
  
  // ==================== 超级商业群组API ====================
  
  // 更新群组设置
  app.put('/api/chats/:id', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId, mode, announcement, isMuted, name, description, joinMethod } = req.body;
    
    if (!chatId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 检查权限
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      const updates = {};
      if (mode !== undefined) updates.group_mode = mode;
      if (announcement !== undefined) updates.announcement = announcement;
      if (isMuted !== undefined) updates.is_muted = isMuted;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (joinMethod !== undefined) updates.join_method = joinMethod;
      
      if (Object.keys(updates).length > 0) {
        await db.updateChat(chatId, updates);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('更新群组失败:', error);
      res.status(500).json({ success: false, error: '更新失败' });
    }
  });
  
  // 添加群组成员
  app.post('/api/chats/:id/members', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId, targetGalNumber, role } = req.body;
    
    if (!chatId || !userId || !targetGalNumber) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 检查权限
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      // 获取目标用户
      const targetUser = await db.getUserByGal(targetGalNumber);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      
      // 检查是否已是成员
      const existing = members.find(m => m.id === targetUser.id);
      if (existing) {
        return res.status(400).json({ success: false, error: '该用户已是成员' });
      }
      
      // 添加成员
      await db.addChatMember(chatId, targetUser.id, role || 'member');
      
      res.json({ success: true, member: { id: targetUser.id, galNumber: targetUser.gal_number, nickname: targetUser.nickname } });
    } catch (error) {
      console.error('添加成员失败:', error);
      res.status(500).json({ success: false, error: '添加失败' });
    }
  });
  
  // 移除群组成员
  app.delete('/api/chats/:id/members/:userId', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);
    const { userId } = req.body;
    
    if (!chatId || !userId || !targetUserId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 检查权限
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      const target = members.find(m => m.id === targetUserId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      // 不能移除群主
      if (target?.role === 'owner') {
        return res.status(400).json({ success: false, error: '不能移除群主' });
      }
      
      await db.removeChatMember(chatId, targetUserId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('移除成员失败:', error);
      res.status(500).json({ success: false, error: '移除失败' });
    }
  });
  
  // 更新成员角色
  app.put('/api/chats/:id/members/:userId/role', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);
    const { userId, role } = req.body;
    
    if (!chatId || !userId || !targetUserId || !role) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 检查权限（只有群主可以修改角色）
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || member.role !== 'owner') {
        return res.status(403).json({ success: false, error: '只有群主可以修改成员角色' });
      }
      
      await db.updateChatMemberRole(chatId, targetUserId, role);
      
      res.json({ success: true });
    } catch (error) {
      console.error('更新角色失败:', error);
      res.status(500).json({ success: false, error: '更新失败' });
    }
  });
  

  // 禁言/解禁群成员
  app.put('/api/chats/:id/members/:userId/mute', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);
    const { userId, isMuted } = req.body;
    
    if (!chatId || !userId || !targetUserId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      const target = members.find(m => m.id === targetUserId);
      if (target?.role === 'owner') {
        return res.status(400).json({ success: false, error: '不能禁言群主' });
      }
      
      await db.muteChatMember(chatId, targetUserId, isMuted);
      
      res.json({ success: true });
    } catch (error) {
      console.error('禁言操作失败:', error);
      res.status(500).json({ success: false, error: '操作失败' });
    }
  });
  
  // 退群
  app.post('/api/chats/:id/leave', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId } = req.body;
    
    if (!chatId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member) {
        return res.status(400).json({ success: false, error: '你不是该群成员' });
      }
      
      if (member.role === 'owner') {
        // 群主退群 = 解散群
        await db.deleteChat(chatId);
        // 通知其他成员
        const otherMembers = members.filter(m => m.id !== userId);
        otherMembers.forEach(m => {
          io.emit(`chat_updated_${m.id}`, { action: 'deleted', chatId });
        });
      } else {
        // 普通成员退群
        await db.removeChatMember(chatId, userId);
        // 通知群内其他人
        members.forEach(m => {
          io.emit(`chat_updated_${m.id}`, { action: 'member_left', chatId, leftUserId: userId });
        });
      }
      
      res.json({ success: true, isDisbanded: member.role === 'owner' });
    } catch (error) {
      console.error('退群失败:', error);
      res.status(500).json({ success: false, error: '退群失败' });
    }
  });
  
  // 转让群主
  app.post('/api/chats/:id/transfer', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId, targetUserId } = req.body;
    
    if (!chatId || !userId || !targetUserId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || member.role !== 'owner') {
        return res.status(403).json({ success: false, error: '只有群主可以转让' });
      }
      
      const target = members.find(m => m.id === targetUserId);
      if (!target) {
        return res.status(400).json({ success: false, error: '目标用户不是群成员' });
      }
      
      await db.transferOwnership(chatId, userId, targetUserId);
      
      // 通知所有成员
      members.forEach(m => {
        io.emit(`chat_updated_${m.id}`, { action: 'ownership_transferred', chatId, newOwnerId: targetUserId });
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('转让群主失败:', error);
      res.status(500).json({ success: false, error: '转让失败' });
    }
  });
  
  // 全体禁言/解禁
  app.put('/api/chats/:id/mute-all', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId, isMuted } = req.body;
    
    if (!chatId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      if (isMuted) {
        // 禁言所有普通成员（保留群主和管理员）
        for (const m of members) {
          if (!['owner', 'admin'].includes(m.role)) {
            await db.muteChatMember(chatId, m.id, true);
          }
        }
      } else {
        await db.unmuteAllMembers(chatId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('全体禁言操作失败:', error);
      res.status(500).json({ success: false, error: '操作失败' });
    }
  });
  
  // 从联系人批量邀请成员
  app.post('/api/chats/:id/invite-contacts', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId, galNumbers } = req.body;
    
    if (!chatId || !userId || !galNumbers || !galNumbers.length) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      const existingIds = new Set(members.map(m => m.id));
      const added = [];
      const failed = [];
      
      for (const gal of galNumbers) {
        const targetUser = await db.getUserByGal(gal);
        if (!targetUser) {
          failed.push({ gal, reason: '用户不存在' });
          continue;
        }
        if (existingIds.has(targetUser.id)) {
          failed.push({ gal, reason: '已是成员' });
          continue;
        }
        await db.addChatMember(chatId, targetUser.id, 'member');
        existingIds.add(targetUser.id);
        added.push({ id: targetUser.id, nickname: targetUser.nickname, galNumber: targetUser.gal_number });
      }
      
      res.json({ success: true, added, failed });
    } catch (error) {
      console.error('批量邀请失败:', error);
      res.status(500).json({ success: false, error: '邀请失败' });
    }
  });

    // 获取收藏联系人
  app.get('/api/contacts/starred', async (req, res) => {
    const userId = parseInt(req.query.userId);
    
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    
    try {
      const contacts = await db.getStarredContacts(userId);
      res.json({ success: true, contacts });
    } catch (error) {
      console.error('获取收藏失败:', error);
      res.status(500).json({ success: false, error: '获取失败' });
    }
  });
  
  // 获取群组详情
  app.get('/api/chats/:id', async (req, res) => {
    const chatId = parseInt(req.params.id);
    
    if (!chatId) {
      return res.status(400).json({ success: false, error: '缺少聊天ID' });
    }
    
    try {
      const chat = await db.getChatById(chatId);
      const members = await db.getChatMembers(chatId);
      
      if (!chat) {
        return res.status(404).json({ success: false, error: '群组不存在' });
      }
      
      res.json({
        success: true,
        chat: {
          id: chat.id,
          type: chat.type,
          name: chat.name,
          avatar: chat.avatar,
          groupMode: chat.group_mode,
          description: chat.description,
          joinMethod: chat.join_method,
          inviteCode: chat.invite_code,
          announcement: chat.announcement,
          isMuted: chat.is_muted,
          createdAt: chat.created_at
        },
        members: members.map(m => ({
          id: m.id,
          galNumber: m.gal_number,
          nickname: m.nickname,
          avatar: m.avatar,
          role: m.role,
          is_muted: m.is_muted || false
        }))
      });
    } catch (error) {
      console.error('获取群组详情失败:', error);
      res.status(500).json({ success: false, error: '获取失败' });
    }
  });
  
  // 生成群邀请码
  app.post('/api/chats/:id/invite-code', async (req, res) => {
    const chatId = parseInt(req.params.id);
    const { userId } = req.body;
    
    if (!chatId || !userId) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 检查权限
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === userId);
      
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '无权限操作' });
      }
      
      // 生成邀请码
      const inviteCode = uuidv4().substring(0, 8).toUpperCase();
      await db.updateChat(chatId, { invite_code: inviteCode });
      
      res.json({ success: true, inviteCode });
    } catch (error) {
      console.error('生成邀请码失败:', error);
      res.status(500).json({ success: false, error: '生成失败' });
    }
  });
  
  // 加入群组（通过邀请码）
  app.post('/api/chats/join', async (req, res) => {
    const { userId, inviteCode } = req.body;
    
    if (!userId || !inviteCode) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    
    try {
      // 查找群组
      const chat = await db.getChatByInviteCode(inviteCode);
      if (!chat) {
        return res.status(404).json({ success: false, error: '邀请码无效' });
      }
      
      // 检查是否已是成员
      const members = await db.getChatMembers(chat.id);
      if (members.find(m => m.id === userId)) {
        return res.status(400).json({ success: false, error: '已在群组中' });
      }
      
      // 添加成员
      await db.addChatMember(chat.id, userId, 'member');
      
      res.json({ success: true, chatId: chat.id, chatName: chat.name });
    } catch (error) {
      console.error('加入群组失败:', error);
      res.status(500).json({ success: false, error: '加入失败' });
    }
  });
  

  server.listen(PORT, () => {
    console.log('═══════════════════════════════════════════');
    console.log('🚀 Nova-OS 服务器启动成功！');
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`💾 数据库模式: ${process.env.DATABASE_URL ? 'PostgreSQL (云端)' : 'SQLite (本地)'}`);
    console.log('═══════════════════════════════════════════');
    
    if (!process.env.DEEPSEEK_API_KEY) {
      console.log('⚠️  提示: 未配置 DeepSeek API Key，AI将使用预设回复');
      console.log('💡 如需启用真实AI，请设置环境变量 DEEPSEEK_API_KEY');
    }
  });
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
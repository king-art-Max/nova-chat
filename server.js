/**
 * Nova-OS 主服务器
 * Express + Socket.io + API路由
 */

require('dotenv').config();

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
  app.use(express.json());
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

  app.get('/api/user/:galNumber', async (req, res) => {
    try {
      const user = await db.getUserByGal(req.params.galNumber);
      if (user) {
        res.json({
          success: true,
          user: {
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

  app.get('/api/contacts', async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少用户ID' });
    }
    try {
      const contacts = (await db.getContacts(userId)).map(c => ({
        ...c,
        galNumber: c.gal_number,
        direction: c.direction,
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
        enrichedChats.push({
          ...chat,
          members: members.map(m => ({
            id: m.id,
            galNumber: m.gal_number,
            nickname: m.nickname,
            avatar: m.avatar
          }))
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
            avatar: m.avatar
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
        readBy: m.read_by,
        createdAt: m.created_at
      }));
      res.json({ success: true, messages });
    } catch (error) {
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

  // ==================== Socket.io 事件处理 ====================

  io.on('connection', (socket) => {
    console.log('🔌 用户连接:', socket.id);
    
    socket.on('user-online', (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      io.emit('user-status', { userId, status: 'online' });
    });
    
    socket.on('join-chat', (chatId) => {
      socket.join(`chat-${chatId}`);
    });
    
    socket.on('leave-chat', (chatId) => {
      socket.leave(`chat-${chatId}`);
    });
    
    socket.on('send-message', async (data) => {
      const { chatId, senderId, encryptedContent, type, ttl } = data;
      try {
        const messageId = await db.saveMessage(chatId, senderId, encryptedContent, type, ttl);
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
          createdAt: new Date().toISOString()
        };
        io.to(`chat-${chatId}`).emit('new-message', messageData);
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
      await db.markMessageRead(chatId, userId, messageId);
      io.to(`chat-${chatId}`).emit('message-read-by', { messageId, userId });
    });
    
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('user-status', { userId: socket.userId, status: 'offline' });
      }
    });
  });

  // ==================== 启动服务器 ====================

  const PORT = process.env.PORT || 3000;

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

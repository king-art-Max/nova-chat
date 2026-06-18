/**
 * Nova-OS 数据库模块
 * 使用 better-sqlite3 操作 SQLite 数据库
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// 数据库路径配置
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/tmp/nova-os.db' 
  : path.join(__dirname, 'nova-os.db');

let db;

/**
 * 初始化数据库连接和表结构
 */
function initDatabase() {
  db = new Database(DB_PATH);
  
  // 启用外键约束
  db.pragma('foreign_keys = ON');
  
  // 创建用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gal_number TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT DEFAULT 'astronaut',
      public_key TEXT,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建联系人表
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (contact_id) REFERENCES users(id),
      UNIQUE(user_id, contact_id)
    )
  `);
  
  // 创建聊天表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'private',
      name TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建聊天成员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(chat_id, user_id)
    )
  `);
  
  // 创建消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER,
      encrypted_content TEXT,
      type TEXT DEFAULT 'normal',
      ttl INTEGER,
      read_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )
  `);
  
  // 创建AI人格表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gal_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT 'robot',
      system_prompt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 初始化AI人格
  initAIPersonas();
  
  console.log('✅ 数据库初始化完成');
}

/**
 * 初始化预设的AI人格
 */
function initAIPersonas() {
  const aiPersonas = [
    {
      gal_number: 'AI-NOVA000001',
      name: 'Nova助手',
      avatar: 'robot',
      system_prompt: '你是Nova助手，一个友善且高效的AI助手。用简洁、有帮助的语言回答问题。'
    },
    {
      gal_number: 'AI-TOXIC00002',
      name: '毒舌评论员',
      avatar: 'devil',
      system_prompt: '你是毒舌评论员，说话犀利、一针见血，善于吐槽和调侃，但不失幽默感。'
    },
    {
      gal_number: 'AI-EMOTI00003',
      name: '情感树洞',
      avatar: 'heart',
      system_prompt: '你是情感树洞，温柔、善解人意，擅长倾听和给予情感支持。'
    },
    {
      gal_number: 'AI-DATA000004',
      name: '数据分析师',
      avatar: 'chart',
      system_prompt: '你是数据分析师，专业、严谨，擅长用数据和逻辑分析问题。回答要精确、有条理。'
    }
  ];
  
  const insertAI = db.prepare(`
    INSERT OR IGNORE INTO ai_personas (gal_number, name, avatar, system_prompt)
    VALUES (@gal_number, @name, @avatar, @system_prompt)
  `);
  
  for (const persona of aiPersonas) {
    insertAI.run(persona);
  }
}

/**
 * 生成唯一的Gal号码
 * 格式: GAL + 9位大写字母数字 + 1位校验位
 */
function generateGalNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let gal;
  let attempts = 0;
  
  do {
    let result = 'GAL';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 添加校验位
    gal = result + calculateCheckDigit(result);
    attempts++;
  } while (isGalExists(gal) && attempts < 100);
  
  return gal;
}

/**
 * 计算校验位
 */
function calculateCheckDigit(base) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += base.charCodeAt(i);
  }
  return chars[(sum % 36)];
}

/**
 * 检查Gal号码是否已存在
 */
function isGalExists(galNumber) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE gal_number = ?');
  return stmt.get(galNumber).count > 0;
}

/**
 * 注册新用户
 */
function registerUser(nickname, password, publicKey) {
  const galNumber = generateGalNumber();
  const passwordHash = bcrypt.hashSync(password, 10);
  
  const stmt = db.prepare(`
    INSERT INTO users (gal_number, nickname, public_key, password_hash)
    VALUES (?, ?, ?, ?)
  `);
  
  try {
    const result = stmt.run(galNumber, nickname, publicKey || null, passwordHash);
    return {
      success: true,
      user: {
        id: result.lastInsertRowid,
        galNumber,
        nickname
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 用户登录
 */
function loginUser(galNumber, password) {
  const stmt = db.prepare(`
    SELECT id, gal_number, nickname, avatar, public_key, password_hash
    FROM users WHERE gal_number = ?
  `);
  
  const user = stmt.get(galNumber);
  
  if (!user) {
    return { success: false, error: '用户不存在' };
  }
  
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { success: false, error: '密码错误' };
  }
  
  return {
    success: true,
    user: {
      id: user.id,
      galNumber: user.gal_number,
      nickname: user.nickname,
      avatar: user.avatar,
      publicKey: user.public_key
    }
  };
}

/**
 * 根据Gal号码获取用户信息
 */
function getUserByGal(galNumber) {
  const stmt = db.prepare(`
    SELECT id, gal_number, nickname, avatar, public_key
    FROM users WHERE gal_number = ?
  `);
  return stmt.get(galNumber);
}

/**
 * 根据ID获取用户信息
 */
function getUserById(userId) {
  const stmt = db.prepare(`
    SELECT id, gal_number, nickname, avatar, public_key
    FROM users WHERE id = ?
  `);
  return stmt.get(userId);
}

/**
 * 更新用户资料
 */
function updateUser(userId, data) {
  const allowed = ['nickname', 'avatar', 'public_key'];
  const updates = [];
  const values = [];
  
  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  
  if (updates.length === 0) return false;
  
  values.push(userId);
  const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
  return stmt.run(...values).changes > 0;
}

/**
 * 获取联系人列表
 */
function getContacts(userId) {
  const stmt = db.prepare(`
    SELECT u.id, u.gal_number, u.nickname, u.avatar,
           c.status, c.created_at
    FROM contacts c
    JOIN users u ON (c.contact_id = u.id OR c.user_id = u.id)
    WHERE (c.user_id = ? OR c.contact_id = ?) AND u.id != ?
    ORDER BY c.created_at DESC
  `);
  return stmt.all(userId, userId, userId);
}

/**
 * 发送好友请求
 */
function addContact(userId, contactGal) {
  const contact = getUserByGal(contactGal);
  if (!contact) {
    return { success: false, error: '用户不存在' };
  }
  
  if (contact.id === userId) {
    return { success: false, error: '不能添加自己为好友' };
  }
  
  // 检查是否已存在关系
  const existing = db.prepare(`
    SELECT * FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
  `).get(userId, contact.id, contact.id, userId);
  
  if (existing) {
    return { success: false, error: '已是好友或请求已存在' };
  }
  
  const stmt = db.prepare(`
    INSERT INTO contacts (user_id, contact_id, status)
    VALUES (?, ?, 'pending')
  `);
  
  stmt.run(userId, contact.id);
  return { success: true, contact };
}

/**
 * 接受好友请求
 */
function acceptContact(userId, contactId) {
  const stmt = db.prepare(`
    UPDATE contacts SET status = 'accepted'
    WHERE user_id = ? AND contact_id = ? AND status = 'pending'
  `);
  return stmt.run(contactId, userId).changes > 0;
}

/**
 * 获取聊天列表
 */
function getChats(userId) {
  const stmt = db.prepare(`
    SELECT c.*, cm.role,
           (SELECT m.encrypted_content FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message,
           (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.read_by NOT LIKE '%"' || ? || '"%') as unread_count
    FROM chats c
    JOIN chat_members cm ON c.id = cm.chat_id
    WHERE cm.user_id = ?
    ORDER BY c.created_at DESC
  `);
  return stmt.all(userId);
}

/**
 * 创建私聊
 */
function createPrivateChat(userId1, userId2) {
  // 检查是否已存在私聊
  const existing = db.prepare(`
    SELECT c.id FROM chats c
    JOIN chat_members cm1 ON c.id = cm1.chat_id
    JOIN chat_members cm2 ON c.id = cm2.chat_id
    WHERE c.type = 'private' AND cm1.user_id = ? AND cm2.user_id = ?
  `).get(userId1, userId2);
  
  if (existing) {
    return existing.id;
  }
  
  const insertChat = db.prepare(`
    INSERT INTO chats (type) VALUES ('private')
  `);
  const result = insertChat.run();
  const chatId = result.lastInsertRowid;
  
  const insertMember = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'member')
  `);
  insertMember.run(chatId, userId1);
  insertMember.run(chatId, userId2);
  
  return chatId;
}

/**
 * 创建群聊
 */
function createGroupChat(name, creatorId) {
  const insertChat = db.prepare(`
    INSERT INTO chats (type, name) VALUES ('group', ?)
  `);
  const result = insertChat.run(name);
  const chatId = result.lastInsertRowid;
  
  const insertMember = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'admin')
  `);
  insertMember.run(chatId, creatorId);
  
  return chatId;
}

/**
 * 添加群聊成员
 */
function addChatMember(chatId, userId, role = 'member') {
  const stmt = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)
  `);
  return stmt.run(chatId, userId, role).changes > 0;
}

/**
 * 获取聊天成员
 */
function getChatMembers(chatId) {
  const stmt = db.prepare(`
    SELECT u.id, u.gal_number, u.nickname, u.avatar, cm.role
    FROM chat_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.chat_id = ?
  `);
  return stmt.all(chatId);
}

/**
 * 保存消息
 */
function saveMessage(chatId, senderId, encryptedContent, type = 'normal', ttl = null) {
  const stmt = db.prepare(`
    INSERT INTO messages (chat_id, sender_id, encrypted_content, type, ttl)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(chatId, senderId, encryptedContent, type, ttl);
  return result.lastInsertRowid;
}

/**
 * 获取聊天消息
 */
function getMessages(chatId, limit = 50, offset = 0) {
  const stmt = db.prepare(`
    SELECT m.*, u.gal_number, u.nickname, u.avatar
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.chat_id = ?
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(chatId, limit, offset);
}

/**
 * 删除消息（阅后即焚到期）
 */
function deleteMessage(messageId) {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  return stmt.run(messageId).changes > 0;
}

/**
 * 标记消息已读
 */
function markMessageRead(chatId, userId, messageId) {
  const message = db.prepare('SELECT read_by FROM messages WHERE id = ?').get(messageId);
  if (!message) return false;
  
  let readBy = message.read_by ? JSON.parse(message.read_by) : [];
  const userIdStr = String(userId);
  
  if (!readBy.includes(userIdStr)) {
    readBy.push(userIdStr);
    db.prepare('UPDATE messages SET read_by = ? WHERE id = ?').run(JSON.stringify(readBy), messageId);
  }
  
  return true;
}

/**
 * 获取AI人格列表
 */
function getAIPersonas() {
  const stmt = db.prepare('SELECT * FROM ai_personas');
  return stmt.all();
}

/**
 * 获取特定AI人格
 */
function getAIPersona(galNumber) {
  const stmt = db.prepare('SELECT * FROM ai_personas WHERE gal_number = ?');
  return stmt.get(galNumber);
}

module.exports = {
  initDatabase,
  registerUser,
  loginUser,
  getUserByGal,
  getUserById,
  updateUser,
  getContacts,
  addContact,
  acceptContact,
  getChats,
  createPrivateChat,
  createGroupChat,
  addChatMember,
  getChatMembers,
  saveMessage,
  getMessages,
  deleteMessage,
  markMessageRead,
  getAIPersonas,
  getAIPersona
};

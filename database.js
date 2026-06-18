/**
 * Nova-OS 数据库模块
 * 使用 sql.js 操作 SQLite 数据库（纯JS实现，无需编译）
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 数据库路径配置
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/tmp/nova-os.db' 
  : path.join(__dirname, 'nova-os.db');

let db;
let saveTimeout;

/**
 * 初始化数据库连接和表结构
 */
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // 尝试加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // 创建用户表
  db.run(`
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
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, contact_id)
    )
  `);
  
  // 创建聊天表
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'private',
      name TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建聊天成员表
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chat_id, user_id)
    )
  `);
  
  // 创建消息表
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER,
      encrypted_content TEXT,
      type TEXT DEFAULT 'normal',
      ttl INTEGER,
      read_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建AI人格表
  db.run(`
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
  
  // 保存初始数据库
  saveDatabase();
  
  console.log('✅ 数据库初始化完成');
}

/**
 * 保存数据库到文件
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('数据库保存失败:', err.message);
  }
}

/**
 * 延迟保存（避免频繁写入）
 */
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDatabase, 1000);
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
  
  for (const persona of aiPersonas) {
    try {
      db.run(
        'INSERT OR IGNORE INTO ai_personas (gal_number, name, avatar, system_prompt) VALUES (?, ?, ?, ?)',
        [persona.gal_number, persona.name, persona.avatar, persona.system_prompt]
      );
    } catch (e) {
      // 忽略已存在的记录
    }
  }
}

/**
 * 生成唯一的Gal号码
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
    gal = result;
    attempts++;
  } while (isGalExists(gal) && attempts < 100);
  
  return gal;
}

/**
 * 检查Gal号码是否已存在
 */
function isGalExists(galNumber) {
  const result = queryOne('SELECT COUNT(*) as count FROM users WHERE gal_number = ?', [galNumber]);
  return result.count > 0;
}

/**
 * 查询一条记录
 */
function queryOne(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * 查询多条记录
 */
function queryAll(sql, params) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * 执行写操作
 */
function runSql(sql, params) {
  db.run(sql, params);
  scheduleSave();
  return {
    lastInsertRowid: getlastInsertRowId(),
    changes: getChanges()
  };
}

function getlastInsertRowId() {
  const result = queryOne('SELECT last_insert_rowid() as id');
  return result ? result.id : 0;
}

function getChanges() {
  const result = queryOne('SELECT changes() as count');
  return result ? result.count : 0;
}

/**
 * 注册新用户
 */
function registerUser(nickname, password, publicKey) {
  const galNumber = generateGalNumber();
  const passwordHash = bcrypt.hashSync(password, 10);
  
  try {
    const result = runSql(
      'INSERT INTO users (gal_number, nickname, public_key, password_hash) VALUES (?, ?, ?, ?)',
      [galNumber, nickname, publicKey || null, passwordHash]
    );
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
  const user = queryOne(
    'SELECT id, gal_number, nickname, avatar, public_key, password_hash FROM users WHERE gal_number = ?',
    [galNumber]
  );
  
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
  return queryOne(
    'SELECT id, gal_number, nickname, avatar, public_key FROM users WHERE gal_number = ?',
    [galNumber]
  );
}

/**
 * 根据ID获取用户信息
 */
function getUserById(userId) {
  return queryOne(
    'SELECT id, gal_number, nickname, avatar, public_key FROM users WHERE id = ?',
    [userId]
  );
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
  runSql(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  return getChanges() > 0;
}

/**
 * 获取联系人列表
 */
function getContacts(userId) {
  return queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar,
            c.status, c.created_at
     FROM contacts c
     JOIN users u ON (c.contact_id = u.id OR c.user_id = u.id)
     WHERE (c.user_id = ? OR c.contact_id = ?) AND u.id != ?
     ORDER BY c.created_at DESC`,
    [userId, userId, userId]
  );
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
  
  const existing = queryOne(
    'SELECT * FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)',
    [userId, contact.id, contact.id, userId]
  );
  
  if (existing) {
    return { success: false, error: '已是好友或请求已存在' };
  }
  
  runSql('INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, \'pending\')', [userId, contact.id]);
  return { success: true, contact };
}

/**
 * 接受好友请求
 */
function acceptContact(userId, contactId) {
  runSql('UPDATE contacts SET status = \'accepted\' WHERE user_id = ? AND contact_id = ? AND status = \'pending\'', [contactId, userId]);
  return getChanges() > 0;
}

/**
 * 获取聊天列表
 */
function getChats(userId) {
  return queryAll(
    `SELECT c.id, c.type, c.name, c.avatar, c.created_at, cm.role
     FROM chats c
     JOIN chat_members cm ON c.id = cm.chat_id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`,
    [userId]
  );
}

/**
 * 创建私聊
 */
function createPrivateChat(userId1, userId2) {
  const existing = queryOne(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON c.id = cm1.chat_id
     JOIN chat_members cm2 ON c.id = cm2.chat_id
     WHERE c.type = 'private' AND cm1.user_id = ? AND cm2.user_id = ?`,
    [userId1, userId2]
  );
  
  if (existing) {
    return existing.id;
  }
  
  runSql('INSERT INTO chats (type) VALUES (\'private\')', []);
  const chatId = getlastInsertRowId();
  runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'member\')', [chatId, userId1]);
  runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'member\')', [chatId, userId2]);
  
  return chatId;
}

/**
 * 创建群聊
 */
function createGroupChat(name, creatorId) {
  runSql('INSERT INTO chats (type, name) VALUES (\'group\', ?)', [name]);
  const chatId = getlastInsertRowId();
  runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'admin\')', [chatId, creatorId]);
  
  return chatId;
}

/**
 * 添加群聊成员
 */
function addChatMember(chatId, userId, role = 'member') {
  runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatId, userId, role]);
  return getChanges() > 0;
}

/**
 * 获取聊天成员
 */
function getChatMembers(chatId) {
  return queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar, cm.role
     FROM chat_members cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.chat_id = ?`,
    [chatId]
  );
}

/**
 * 保存消息
 */
function saveMessage(chatId, senderId, encryptedContent, type = 'normal', ttl = null) {
  runSql(
    'INSERT INTO messages (chat_id, sender_id, encrypted_content, type, ttl) VALUES (?, ?, ?, ?, ?)',
    [chatId, senderId, encryptedContent, type, ttl]
  );
  return getlastInsertRowId();
}

/**
 * 获取聊天消息
 */
function getMessages(chatId, limit = 50, offset = 0) {
  return queryAll(
    `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_content, m.type, m.ttl, m.read_by, m.created_at,
            u.gal_number, u.nickname, u.avatar
     FROM messages m
     LEFT JOIN users u ON m.sender_id = u.id
     WHERE m.chat_id = ?
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`,
    [chatId, limit, offset]
  );
}

/**
 * 删除消息（阅后即焚到期）
 */
function deleteMessage(messageId) {
  runSql('DELETE FROM messages WHERE id = ?', [messageId]);
  return getChanges() > 0;
}

/**
 * 标记消息已读
 */
function markMessageRead(chatId, userId, messageId) {
  const message = queryOne('SELECT read_by FROM messages WHERE id = ?', [messageId]);
  if (!message) return false;
  
  let readBy = message.read_by ? JSON.parse(message.read_by) : [];
  const userIdStr = String(userId);
  
  if (!readBy.includes(userIdStr)) {
    readBy.push(userIdStr);
    runSql('UPDATE messages SET read_by = ? WHERE id = ?', [JSON.stringify(readBy), messageId]);
  }
  
  return true;
}

/**
 * 获取AI人格列表
 */
function getAIPersonas() {
  return queryAll('SELECT * FROM ai_personas', []);
}

/**
 * 获取特定AI人格
 */
function getAIPersona(galNumber) {
  return queryOne('SELECT * FROM ai_personas WHERE gal_number = ?', [galNumber]);
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

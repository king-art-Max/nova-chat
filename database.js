/**
 * Nova-OS 数据库模块
 * 生产环境: PostgreSQL (Neon/云端)
 * 本地开发: sql.js (SQLite内存数据库)
 */

const isProduction = !!process.env.DATABASE_URL;

let pool;   // PostgreSQL 连接池
let sqlDb;  // sql.js 内存数据库
let saveTimeout;

// ==================== 通用工具 ====================

// SQL占位符转换: ? → $1, $2, $3...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ==================== PostgreSQL 模式 ====================

async function initPostgres() {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL连接成功');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL连接失败:', err.message);
    throw err;
  }

  // 创建用户表
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    gal_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    nickname VARCHAR(50) NOT NULL,
    avatar VARCHAR(50) DEFAULT 'astronaut',
    public_key TEXT,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建联系人表
  await pool.query(`CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    contact_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, contact_id)
  )`);

  // 创建聊天表
  await pool.query(`CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) DEFAULT 'private',
    name VARCHAR(100),
    avatar VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建聊天成员表
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_members (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
  )`);

  // 创建消息表
  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id),
    sender_id INTEGER REFERENCES users(id),
    encrypted_content TEXT,
    type VARCHAR(20) DEFAULT 'normal',
    ttl INTEGER,
    read_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建AI人格表
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_personas (
    id SERIAL PRIMARY KEY,
    gal_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    avatar VARCHAR(50) DEFAULT 'robot',
    system_prompt TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await initAIPersonas();
  console.log('✅ PostgreSQL数据库初始化完成');
}

// PostgreSQL 查询辅助
async function pgQueryOne(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const { rows } = await pool.query(pgSql, params);
  return rows[0] || null;
}

async function pgQueryAll(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const { rows } = await pool.query(pgSql, params);
  return rows;
}

async function pgRunSql(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return {
    lastInsertRowid: result.rows[0]?.id || 0,
    changes: result.rowCount || 0
  };
}

async function pgRunReturning(sql, params = []) {
  const pgSql = convertPlaceholders(sql) + ' RETURNING id';
  const { rows } = await pool.query(pgSql, params);
  return {
    lastInsertRowid: rows[0]?.id || 0,
    changes: rows.length
  };
}

// ==================== sql.js 模式 (本地开发) ====================

async function initSqlite() {
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const path = require('path');

  const DB_PATH = path.join(__dirname, 'nova-os.db');
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gal_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    nickname TEXT NOT NULL,
    avatar TEXT DEFAULT 'astronaut',
    public_key TEXT,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, contact_id)
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'private',
    name TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS chat_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER,
    encrypted_content TEXT,
    type TEXT DEFAULT 'normal',
    ttl INTEGER,
    read_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS ai_personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gal_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT DEFAULT 'robot',
    system_prompt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await initAIPersonas();
  saveDatabase();
  console.log('✅ SQLite数据库初始化完成');
}

function saveDatabase() {
  if (!sqlDb) return;
  try {
    const fs = require('fs');
    const path = require('path');
    const DB_PATH = path.join(__dirname, 'nova-os.db');
    const data = sqlDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('数据库保存失败:', err.message);
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDatabase, 1000);
}

// sql.js 查询辅助
function sqliteQueryOne(sql, params) {
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params || []);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function sqliteQueryAll(sql, params) {
  const results = [];
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params || []);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function sqliteRunSql(sql, params) {
  sqlDb.run(sql, params);
  scheduleSave();
  const idResult = sqliteQueryOne('SELECT last_insert_rowid() as id');
  const chResult = sqliteQueryOne('SELECT changes() as count');
  return {
    lastInsertRowid: idResult ? idResult.id : 0,
    changes: chResult ? chResult.count : 0
  };
}

// ==================== 统一接口 ====================

async function queryOne(sql, params = []) {
  if (isProduction) return await pgQueryOne(sql, params);
  return sqliteQueryOne(sql, params);
}

async function queryAll(sql, params = []) {
  if (isProduction) return await pgQueryAll(sql, params);
  return sqliteQueryAll(sql, params);
}

async function runSql(sql, params = []) {
  if (isProduction) return await pgRunSql(sql, params);
  return sqliteRunSql(sql, params);
}

async function runInsert(sql, params = []) {
  if (isProduction) return await pgRunReturning(sql, params);
  return sqliteRunSql(sql, params);
}

// ==================== 初始化 ====================

async function initDatabase() {
  if (isProduction) {
    await initPostgres();
  } else {
    await initSqlite();
  }
}

async function initAIPersonas() {
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
      if (isProduction) {
        await pool.query(
          'INSERT INTO ai_personas (gal_number, name, avatar, system_prompt) VALUES ($1, $2, $3, $4) ON CONFLICT (gal_number) DO NOTHING',
          [persona.gal_number, persona.name, persona.avatar, persona.system_prompt]
        );
      } else {
        sqlDb.run(
          'INSERT OR IGNORE INTO ai_personas (gal_number, name, avatar, system_prompt) VALUES (?, ?, ?, ?)',
          [persona.gal_number, persona.name, persona.avatar, persona.system_prompt]
        );
      }
    } catch (e) {
      // 忽略已存在
    }
  }
}

// ==================== Gal号码生成 ====================

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
  } while (attempts < 100);
  
  return gal;
}

// ==================== 用户操作 ====================

async function registerUser(nickname, password, publicKey, email) {
  const galNumber = generateGalNumber();
  const bcrypt = require('bcryptjs');
  const passwordHash = bcrypt.hashSync(password, 10);

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return { success: false, error: '该邮箱已被注册' };
    }
  }

  try {
    const result = await runInsert(
      'INSERT INTO users (gal_number, email, nickname, public_key, password_hash) VALUES (?, ?, ?, ?, ?)',
      [galNumber, email || null, nickname, publicKey || null, passwordHash]
    );
    return {
      success: true,
      user: {
        id: result.lastInsertRowid,
        galNumber,
        nickname,
        email: email || null
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function loginUser(account, password) {
  const bcrypt = require('bcryptjs');
  let user;
  if (account.includes('@')) {
    user = await queryOne(
      'SELECT id, gal_number, email, nickname, avatar, public_key, password_hash FROM users WHERE email = ?',
      [account]
    );
  } else {
    user = await queryOne(
      'SELECT id, gal_number, email, nickname, avatar, public_key, password_hash FROM users WHERE gal_number = ?',
      [account]
    );
  }

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
      publicKey: user.public_key,
      email: user.email
    }
  };
}

async function getUserByGal(galNumber) {
  return await queryOne(
    'SELECT id, gal_number, email, nickname, avatar, public_key FROM users WHERE gal_number = ?',
    [galNumber]
  );
}

async function getUserById(userId) {
  return await queryOne(
    'SELECT id, gal_number, email, nickname, avatar, public_key FROM users WHERE id = ?',
    [userId]
  );
}

async function updateUser(userId, data) {
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
  const result = await runSql(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  return result.changes > 0;
}

// ==================== 联系人操作 ====================

async function getContacts(userId) {
  // 查询我发出的请求
  const sent = await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar,
            c.status, c.created_at, 'sent' as direction
     FROM contacts c
     JOIN users u ON c.contact_id = u.id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [userId]
  );
  
  // 查询我收到的请求
  const received = await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar,
            c.status, c.created_at, 'received' as direction
     FROM contacts c
     JOIN users u ON c.user_id = u.id
     WHERE c.contact_id = ?
     ORDER BY c.created_at DESC`,
    [userId]
  );
  
  return [...sent, ...received];
}

async function addContact(userId, contactGal) {
  const contact = await getUserByGal(contactGal);
  if (!contact) {
    return { success: false, error: '用户不存在' };
  }

  if (contact.id === userId) {
    return { success: false, error: '不能添加自己为好友' };
  }

  const existing = await queryOne(
    'SELECT * FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)',
    [userId, contact.id, contact.id, userId]
  );

  if (existing) {
    return { success: false, error: '已是好友或请求已存在' };
  }

  await runSql('INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, \'pending\')', [userId, contact.id]);
  return { success: true, contact };
}

async function acceptContact(userId, contactId) {
  const result = await runSql(
    'UPDATE contacts SET status = \'accepted\' WHERE user_id = ? AND contact_id = ? AND status = \'pending\'',
    [contactId, userId]
  );
  return result.changes > 0;
}

// ==================== 聊天操作 ====================

async function getChats(userId) {
  return await queryAll(
    `SELECT c.id, c.type, c.name, c.avatar, c.created_at, cm.role
     FROM chats c
     JOIN chat_members cm ON c.id = cm.chat_id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`,
    [userId]
  );
}

async function createPrivateChat(userId1, userId2) {
  const existing = await queryOne(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON c.id = cm1.chat_id
     JOIN chat_members cm2 ON c.id = cm2.chat_id
     WHERE c.type = 'private' AND cm1.user_id = ? AND cm2.user_id = ?`,
    [userId1, userId2]
  );

  if (existing) {
    return existing.id;
  }

  const result = await runInsert('INSERT INTO chats (type) VALUES (\'private\')', []);
  const chatId = result.lastInsertRowid;
  await runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'member\')', [chatId, userId1]);
  await runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'member\')', [chatId, userId2]);

  return chatId;
}

async function createGroupChat(name, creatorId) {
  const result = await runInsert('INSERT INTO chats (type, name) VALUES (\'group\', ?)', [name]);
  const chatId = result.lastInsertRowid;
  await runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, \'admin\')', [chatId, creatorId]);

  return chatId;
}

async function addChatMember(chatId, userId, role = 'member') {
  const result = await runSql('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatId, userId, role]);
  return result.changes > 0;
}

async function getChatMembers(chatId) {
  return await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar, cm.role
     FROM chat_members cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.chat_id = ?`,
    [chatId]
  );
}

// ==================== 消息操作 ====================

async function saveMessage(chatId, senderId, encryptedContent, type = 'normal', ttl = null) {
  const result = await runInsert(
    'INSERT INTO messages (chat_id, sender_id, encrypted_content, type, ttl) VALUES (?, ?, ?, ?, ?)',
    [chatId, senderId, encryptedContent, type, ttl]
  );
  return result.lastInsertRowid;
}

async function getMessages(chatId, limit = 50, offset = 0) {
  return await queryAll(
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

async function deleteMessage(messageId) {
  const result = await runSql('DELETE FROM messages WHERE id = ?', [messageId]);
  return result.changes > 0;
}

async function markMessageRead(chatId, userId, messageId) {
  const message = await queryOne('SELECT read_by FROM messages WHERE id = ?', [messageId]);
  if (!message) return false;

  let readBy = message.read_by ? JSON.parse(message.read_by) : [];
  const userIdStr = String(userId);

  if (!readBy.includes(userIdStr)) {
    readBy.push(userIdStr);
    await runSql('UPDATE messages SET read_by = ? WHERE id = ?', [JSON.stringify(readBy), messageId]);
  }

  return true;
}

// ==================== AI人格操作 ====================

async function getAIPersonas() {
  return await queryAll('SELECT * FROM ai_personas', []);
}

async function getAIPersona(galNumber) {
  return await queryOne('SELECT * FROM ai_personas WHERE gal_number = ?', [galNumber]);
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

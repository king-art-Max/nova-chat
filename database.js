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
    is_muted BOOLEAN DEFAULT FALSE,
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
    is_recalled BOOLEAN DEFAULT FALSE,
    burn_after INTEGER DEFAULT 0,
    burned_at TIMESTAMP,
    is_anonymous BOOLEAN DEFAULT FALSE,
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

  // 创建密码重置表
  await pool.query(`CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建红包表
  await pool.query(`CREATE TABLE IF NOT EXISTS red_packets (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    sender_id VARCHAR(20) REFERENCES users(gal_number),
    amount DECIMAL(10,2) NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    claimed_count INTEGER DEFAULT 0,
    claimed_amount DECIMAL(10,2) DEFAULT 0,
    type VARCHAR(10) DEFAULT 'random',
    message TEXT DEFAULT '恭喜发财，大吉大利',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建红包领取记录表
  await pool.query(`CREATE TABLE IF NOT EXISTS red_packet_claims (
    id SERIAL PRIMARY KEY,
    red_packet_id INTEGER REFERENCES red_packets(id),
    user_id VARCHAR(20) REFERENCES users(gal_number),
    amount DECIMAL(10,2) NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(red_packet_id, user_id)
  )`);

  // users表添加balance字段
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 100`);

  // contacts表添加is_starred字段
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE`);

  await initAIPersonas();
  console.log('✅ PostgreSQL数据库初始化完成');

  // 保活：每5分钟ping一次，防止Neon数据库休眠
  setInterval(async () => {
    try {
      await pool.query("SELECT 1");
      console.log("💚 PostgreSQL保活ping成功");
    } catch (err) {
      console.error("❌ PostgreSQL保活ping失败:", err.message);
    }
  }, 5 * 60 * 1000);
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
    is_muted INTEGER DEFAULT 0,
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
    is_recalled INTEGER DEFAULT 0,
    burn_after INTEGER DEFAULT 0,
    is_anonymous INTEGER DEFAULT 0,
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

  sqlDb.run(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS red_packets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    sender_id TEXT,
    amount REAL NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    claimed_count INTEGER DEFAULT 0,
    claimed_amount REAL DEFAULT 0,
    type TEXT DEFAULT 'random',
    message TEXT DEFAULT '恭喜发财，大吉大利',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  sqlDb.run(`CREATE TABLE IF NOT EXISTS red_packet_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    red_packet_id INTEGER,
    user_id TEXT,
    amount REAL NOT NULL,
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(red_packet_id, user_id)
  )`);

  // 添加balance字段（如果不存在）
  try { sqlDb.run('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 100'); } catch(e) {}
  // 添加is_starred字段（如果不存在）
  try { sqlDb.run('ALTER TABLE contacts ADD COLUMN is_starred INTEGER DEFAULT 0'); } catch(e) {}

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
    const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
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
      'SELECT id, gal_number, email, nickname, avatar, public_key, password_hash FROM users WHERE LOWER(email) = LOWER(?)',
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


// ==================== 密码修改与验证 ====================

async function updateUserPassword(userId, newPassword) {
  const bcrypt = require('bcryptjs');
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  if (isPostgres) {
    const result = await pgRunSql('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    return result.rowCount > 0;
  } else {
    const result = await runSql('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    return result.changes > 0;
  }
}

async function verifyPassword(userId, password) {
  const bcrypt = require('bcryptjs');
  let user;
  if (isPostgres) {
    user = await pgQueryOne('SELECT password_hash FROM users WHERE id = $1', [userId]);
  } else {
    user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
  }
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

async function getUserFullInfo(userId) {
  if (isPostgres) {
    return await pgQueryOne(
      'SELECT id, gal_number, email, nickname, avatar, public_key, created_at FROM users WHERE id = $1',
      [userId]
    );
  } else {
    return await queryOne(
      'SELECT id, gal_number, email, nickname, avatar, public_key, created_at FROM users WHERE id = ?',
      [userId]
    );
  }
}

// ==================== 密码重置操作 ====================

async function createPasswordReset(email) {
  // 生成6位验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15分钟后过期
  
  // 标记旧的验证码为已使用
  await runSql('UPDATE password_resets SET used = ? WHERE email = ?', [true, email]);
  
  // 创建新验证码
  if (isProduction) {
    await runInsert(
      'INSERT INTO password_resets (email, code, expires_at) VALUES (?, ?, ?)',
      [email, code, expiresAt]
    );
  } else {
    await runSql(
      'INSERT INTO password_resets (email, code, expires_at) VALUES (?, ?, ?)',
      [email, code, expiresAt.toISOString()]
    );
  }
  
  return { code, expiresAt };
}

async function verifyPasswordReset(email, code) {
  const reset = await queryOne(
    'SELECT * FROM password_resets WHERE email = ? AND code = ? AND used = ? AND expires_at > ?',
    [email, code, false, new Date().toISOString()]
  );
  return reset;
}

async function resetPassword(email, newPassword) {
  const bcrypt = require('bcryptjs');
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  
  const result = await runSql('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);
  
  if (result.changes > 0) {
    // 标记验证码已使用
    await runSql('UPDATE password_resets SET used = ? WHERE email = ?', [true, email]);
    return true;
  }
  return false;
}

async function getUserByEmail(email) {
  return await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
}

// ==================== 联系人操作 ====================

async function getContacts(userId) {
  // 查询我发出的请求
  const sent = await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key,
            c.status, c.created_at, 'sent' as direction
     FROM contacts c
     JOIN users u ON c.contact_id = u.id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [userId]
  );
  
  // 查询我收到的请求
  const received = await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key,
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
  try {
    return await queryAll(
      `SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key, cm.role, cm.is_muted
       FROM chat_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.chat_id = ?`,
      [chatId]
    );
  } catch (e) {
    // is_muted列可能还不存在，回退到不含该列的查询
    console.warn('getChatMembers: is_muted列查询失败，使用回退查询', e.message);
    return await queryAll(
      `SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key, cm.role
       FROM chat_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.chat_id = ?`,
      [chatId]
    );
  }
}


// ==================== 消息辅助查询 ====================

async function getLastMessage(chatId) {
  return await queryOne(
    `SELECT id, sender_id, encrypted_content, type, created_at 
     FROM messages 
     WHERE chat_id = ? AND is_recalled = false
     ORDER BY created_at DESC LIMIT 1`,
    [chatId]
  );
}

async function getUnreadCount(chatId, userId) {
  const result = await queryOne(
    `SELECT COUNT(*) as count FROM messages 
     WHERE chat_id = ? AND sender_id != ? AND is_recalled = false
     AND (read_by IS NULL OR read_by = '[]' OR NOT read_by LIKE ?)`,
    [chatId, userId, `%"${userId}"%`]
  );
  return result ? (result.count || 0) : 0;
}

// ==================== 消息操作 ====================

async function saveMessage(chatId, senderId, encryptedContent, type = 'normal', ttl = null, burnAfter = 0, isAnonymous = false) {
  const result = await runInsert(
    'INSERT INTO messages (chat_id, sender_id, encrypted_content, type, ttl, burn_after, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [chatId, senderId, encryptedContent, type, ttl, burnAfter, isAnonymous]
  );
  return result.lastInsertRowid;
}

async function getMessages(chatId, limit = 50, offset = 0) {
  return await queryAll(
    `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_content, m.type, m.ttl, m.read_by, m.is_recalled, m.burn_after, m.burned_at, m.is_anonymous, m.created_at,
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

// 删除联系人
async function deleteContact(userId, contactId) {
  // 双向删除（user_id->contact_id 和 contact_id->user_id）
  const result1 = await runSql(
    'DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
    [userId, contactId]
  );
  const result2 = await runSql(
    'DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
    [contactId, userId]
  );
  return result1.changes > 0 || result2.changes > 0;
}

// 清空聊天记录（只删消息，不删聊天）
async function deleteChatMessages(chatId) {
  const result = await runSql('DELETE FROM messages WHERE chat_id = ?', [chatId]);
  return result.changes >= 0;
}

// 删除聊天（及其消息）
async function deleteChat(chatId) {
  // 先删除聊天成员
  await runSql('DELETE FROM chat_members WHERE chat_id = ?', [chatId]);
  // 再删除消息
  await runSql('DELETE FROM messages WHERE chat_id = ?', [chatId]);
  // 最后删除聊天
  const result = await runSql('DELETE FROM chats WHERE id = ?', [chatId]);
  return result.changes > 0;
}

async function recallMessage(messageId) {
  const result = await runSql(
    `UPDATE messages SET encrypted_content = ?, is_recalled = ? WHERE id = ?`,
    ['[此消息已撤回]', true, messageId]
  );
  return result.changes > 0;
}

async function getMessageById(messageId) {
  return await queryOne('SELECT * FROM messages WHERE id = ?', [messageId]);
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

// ==================== 阅后即焚操作 ====================

async function markMessageBurned(messageId) {
  const result = await runSql(
    'UPDATE messages SET encrypted_content = ?, burned_at = ? WHERE id = ?',
    ['🔥 此消息已销毁', new Date().toISOString(), messageId]
  );
  return result.changes > 0;
}

async function getUnburnedMessages(chatId) {
  return await queryAll(
    'SELECT * FROM messages WHERE chat_id = ? AND burn_after > 0 AND burned_at IS NULL',
    [chatId]
  );
}

async function updateMessageTranslation(messageId, translation) {
  const result = await runSql(
    'UPDATE messages SET translation = ? WHERE id = ?',
    [translation, messageId]
  );
  return result.changes > 0;
}

// ==================== AI人格操作 ====================

async function getAIPersonas() {
  return await queryAll('SELECT * FROM ai_personas', []);
}

async function getAIPersona(galNumber) {
  return await queryOne('SELECT * FROM ai_personas WHERE gal_number = ?', [galNumber]);
}


// ==================== 红包操作 ====================

async function createRedPacket(chatId, senderId, amount, count, type, message) {
  const result = await runInsert(
    'INSERT INTO red_packets (chat_id, sender_id, amount, count, type, message) VALUES (?, ?, ?, ?, ?, ?)',
    [chatId, senderId, amount, count, type, message]
  );
  return { id: result.lastInsertRowid };
}

async function getRedPacket(id) {
  return await queryOne(
    'SELECT * FROM red_packets WHERE id = ?',
    [id]
  );
}

async function getRedPacketWithClaims(id) {
  const rp = await queryOne('SELECT * FROM red_packets WHERE id = ?', [id]);
  if (!rp) return null;
  const claims = await queryAll(
    `SELECT rpc.*, u.nickname, u.avatar 
     FROM red_packet_claims rpc 
     JOIN users u ON rpc.user_id = u.gal_number 
     WHERE rpc.red_packet_id = ? 
     ORDER BY rpc.claimed_at`,
    [id]
  );
  return { ...rp, claims };
}

async function claimRedPacket(rpId, userId, amount) {
  await runSql(
    'UPDATE red_packets SET claimed_count = claimed_count + 1, claimed_amount = claimed_amount + ? WHERE id = ?',
    [amount, rpId]
  );
  await runSql(
    'INSERT INTO red_packet_claims (red_packet_id, user_id, amount) VALUES (?, ?, ?)',
    [rpId, userId, amount]
  );
}

async function hasClaimedRedPacket(rpId, userId) {
  const claim = await queryOne(
    'SELECT * FROM red_packet_claims WHERE red_packet_id = ? AND user_id = ?',
    [rpId, userId]
  );
  return !!claim;
}

// ==================== 余额操作 ====================

async function getUserByGalNumber(galNumber) {
  return await queryOne('SELECT * FROM users WHERE gal_number = ?', [galNumber]);
}

async function updateBalance(galNumber, delta) {
  await runSql(
    'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE gal_number = ?',
    [delta, galNumber]
  );
}

// ==================== 联系人收藏 ====================

async function toggleContactStar(contactId, isStarred) {
  await runSql(
    'UPDATE contacts SET is_starred = ? WHERE id = ?',
    [isStarred, contactId]
  );
}


// ==================== AI用户账号管理 ====================
async function ensureAIUser(persona) {
  // 检查是否已有对应用户
  let user = await getUserByGal(persona.gal_number);
  if (user) return user;
  
  // 为AI人格创建用户账号
  const bcrypt = require('bcryptjs');
  const passwordHash = bcrypt.hashSync('AI_PERSONA_' + persona.gal_number, 10);
  try {
    const result = await runInsert(
      'INSERT INTO users (gal_number, email, nickname, public_key, password_hash, avatar) VALUES (?, ?, ?, ?, ?, ?)',
      [persona.gal_number, null, persona.name, null, passwordHash, persona.avatar || 'robot']
    );
    return {
      id: result.lastInsertRowid,
      gal_number: persona.gal_number,
      nickname: persona.name,
      avatar: persona.avatar || 'robot'
    };
  } catch (e) {
    // 可能并发创建，再次查询
    user = await getUserByGal(persona.gal_number);
    if (user) return user;
    throw e;
  }
}

module.exports = {
  initDatabase,
  registerUser,
  loginUser,
  getUserByGal,
  getUserById,
  getUserByGalNumber,
  updateUser,
  updateUserPassword,
  verifyPassword,
  getUserFullInfo,
  getContacts,
  addContact,
  acceptContact,
  toggleContactStar,
  getChats,
  createPrivateChat,
  createGroupChat,
  addChatMember,
  getChatMembers,
  getLastMessage,
  getUnreadCount,
  saveMessage,
  getMessages,
  deleteMessage,
  deleteContact,
  deleteChat,
  recallMessage,
  getMessageById,
  markMessageRead,
  markMessageBurned,
  getUnburnedMessages,
  updateMessageTranslation,
  getAIPersonas,
  getAIPersona,
  createPasswordReset,
  verifyPasswordReset,
  resetPassword,
  getUserByEmail,
  createRedPacket,
  getRedPacket,
  getRedPacketWithClaims,
  claimRedPacket,
  hasClaimedRedPacket,
  updateBalance
};

// ==================== AI公司群组数据库操作 ====================

async function getAIPersonasByGalNumbers(galNumbers) {
  const placeholders = galNumbers.map(() => '?').join(',');
  return await queryAll(
    `SELECT * FROM ai_personas WHERE gal_number IN (${placeholders})`,
    galNumbers
  );
}

async function updateChatGroupMode(chatId, groupMode, description) {
  return await runSql(
    'UPDATE chats SET group_mode = ?, description = ? WHERE id = ?',
    [groupMode, description, chatId]
  );
}

async function updateChat(chatId, updates) {
  const allowed = ['name', 'group_mode', 'description', 'join_method', 'invite_code', 'announcement', 'is_muted'];
  const keys = Object.keys(updates).filter(k => allowed.includes(k));
  if (keys.length === 0) return false;
  
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => updates[k]);
  values.push(chatId);
  
  const result = await runSql(`UPDATE chats SET ${sets} WHERE id = ?`, values);
  return result.changes > 0;
}

async function updateChatMemberRole(chatId, userId, role) {
  const result = await runSql(
    'UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?',
    [role, chatId, userId]
  );
  return result.changes > 0;
}

async function removeChatMember(chatId, userId) {
  const result = await runSql(
    'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  return result.changes > 0;
}


async function muteChatMember(chatId, userId, isMuted) {
  try {
    const result = await runSql(
      'UPDATE chat_members SET is_muted = ? WHERE chat_id = ? AND user_id = ?',
      [isMuted ? 1 : 0, chatId, userId]
    );
    return result.changes > 0;
  } catch (e) {
    console.warn('muteChatMember失败(is_muted列可能不存在):', e.message);
    return false;
  }
}

async function unmuteAllMembers(chatId) {
  try {
    const result = await runSql(
      'UPDATE chat_members SET is_muted = 0 WHERE chat_id = ?',
      [chatId]
    );
    return result.changes > 0;
  } catch (e) {
    console.warn('unmuteAllMembers失败(is_muted列可能不存在):', e.message);
    return false;
  }
}

async function transferOwnership(chatId, fromUserId, toUserId) {
  // 先将原群主降为管理员
  await runSql(
    'UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?',
    ['admin', chatId, fromUserId]
  );
  // 再将目标用户升为群主
  await runSql(
    'UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?',
    ['owner', chatId, toUserId]
  );
  return true;
}

async function getMutedMembers(chatId) {
  return await queryAll(
    'SELECT user_id FROM chat_members WHERE chat_id = ? AND is_muted = 1',
    [chatId]
  );
}

async function createMeeting(chatId, hostId, title) {
  const result = await runInsert(
    'INSERT INTO meetings (chat_id, host_id, title) VALUES (?, ?, ?)',
    [chatId, hostId, title]
  );
  return result.lastInsertRowid;
}

async function getMeetings(chatId) {
  return await queryAll(
    'SELECT * FROM meetings WHERE chat_id = ? ORDER BY created_at DESC',
    [chatId]
  );
}

async function getStarredContacts(userId) {
  return await queryAll(
    `SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key, c.is_starred
     FROM contacts c
     JOIN users u ON c.contact_id = u.id
     WHERE c.user_id = ? AND c.is_starred = 1 AND c.status = 'accepted'`,
    [userId]
  );
}

async function getChatById(chatId) {
  return await queryOne('SELECT * FROM chats WHERE id = ?', [chatId]);
}

async function getChatByInviteCode(inviteCode) {
  return await queryOne('SELECT * FROM chats WHERE invite_code = ?', [inviteCode]);
}

// ==================== PostgreSQL新增表 ====================
async function createAdditionalTables() {
  // AI公司会议表
  try { await pool.query(`CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    host_id INTEGER REFERENCES users(id),
    title VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`); } catch(e) { console.warn('创建meetings表失败:', e.message); }
  
  // chats表新增字段
  const chatColumns = [
    ['group_mode', 'VARCHAR(20) DEFAULT \'open\''],
    ['description', 'TEXT'],
    ['join_method', 'VARCHAR(20) DEFAULT \'invite\''],
    ['invite_code', 'VARCHAR(20)'],
    ['announcement', 'TEXT'],
    ['is_muted', 'BOOLEAN DEFAULT FALSE']
  ];
  for (const [col, type] of chatColumns) {
    try { await pool.query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS ${col} ${type}`); } catch(e) { console.warn(`chats.${col}列添加失败:`, e.message); }
  }
  
  // messages表新增字段
  const msgColumns = [
    ['is_recalled', 'BOOLEAN DEFAULT FALSE'],
    ['burn_after', 'INTEGER DEFAULT 0'],
    ['burned_at', 'TIMESTAMP'],
    ['is_anonymous', 'BOOLEAN DEFAULT FALSE']
  ];
  for (const [col, type] of msgColumns) {
    try { await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS ${col} ${type}`); } catch(e) { console.warn(`messages.${col}列添加失败:`, e.message); }
  }
  
  // chat_members表新增字段
  try { await pool.query(`ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE`); } catch(e) { console.warn('chat_members.is_muted列添加失败:', e.message); }
}

// ==================== SQLite新增表 ====================
async function createAdditionalTablesSQLite() {
  sqlDb.run(`CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    host_id INTEGER,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN group_mode TEXT DEFAULT 'open'`); } catch(e) {}
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN description TEXT`); } catch(e) {}
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN join_method TEXT DEFAULT 'invite'`); } catch(e) {}
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN invite_code TEXT`); } catch(e) {}
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN announcement TEXT`); } catch(e) {}
  try { sqlDb.run(`ALTER TABLE chats ADD COLUMN is_muted INTEGER DEFAULT 0`); } catch(e) {}
  // messages表新增字段
  try { sqlDb.run('ALTER TABLE messages ADD COLUMN is_recalled INTEGER DEFAULT 0'); } catch(e) {}
  try { sqlDb.run('ALTER TABLE messages ADD COLUMN burn_after INTEGER DEFAULT 0'); } catch(e) {}
  try { sqlDb.run('ALTER TABLE messages ADD COLUMN burned_at TEXT'); } catch(e) {}
  try { sqlDb.run('ALTER TABLE messages ADD COLUMN is_anonymous INTEGER DEFAULT 0'); } catch(e) {}
  try { sqlDb.run('ALTER TABLE chat_members ADD COLUMN is_muted INTEGER DEFAULT 0'); } catch(e) {}
}

// 修改initDatabase函数末尾添加新表创建
const originalInit = initDatabase;
initDatabase = async function() {
  await originalInit();
  if (isProduction) {
    await createAdditionalTables();
  } else {
    await createAdditionalTablesSQLite();
  }
};

// ==================== AI公司岗位人格初始化 ====================
const AI_COMPANY_PERSONAS = [
  {
    gal_number: 'AI-CEO000005',
    name: '总经理',
    avatar: 'robot',
    system_prompt: `你是公司的总经理。你负责公司的战略决策和日常管理。在会议中，你主持讨论，分配任务，听取汇报后做出决策。说话风格：沉稳、有条理、有决断力。每次发言控制在100字以内。`
  },
  {
    gal_number: 'AI-CFO000006',
    name: '财务总监',
    avatar: 'chart',
    system_prompt: `你是公司的财务总监。你负责财务分析、预算管理和投资决策。在汇报时提供具体的财务数据和趋势分析。说话风格：严谨、数据驱动、注重ROI。每次发言控制在100字以内。`
  },
  {
    gal_number: 'AI-COO000007',
    name: '运营总监',
    avatar: 'robot',
    system_prompt: `你是公司的运营总监。你负责运营策略、流程优化和团队管理。汇报运营KPI和改进方案。说话风格：务实、高效、结果导向。每次发言控制在100字以内。`
  },
  {
    gal_number: 'AI-CMO000008',
    name: '市场总监',
    avatar: 'heart',
    system_prompt: `你是公司的市场总监。你负责市场推广、品牌策略和用户增长。汇报市场动态和营销效果。说话风格：有创意、洞察力强、善于讲故事。每次发言控制在100字以内。`
  },
  {
    gal_number: 'AI-CTO000009',
    name: '技术总监',
    avatar: 'robot',
    system_prompt: `你是公司的技术总监。你负责技术方案、架构决策和研发管理。汇报技术进展和技术风险。说话风格：技术权威、前瞻性、注重可落地性。每次发言控制在100字以内。`
  },
  {
    gal_number: 'AI-LAW000010',
    name: '法务顾问',
    avatar: 'robot',
    system_prompt: `你是公司的法务顾问。你负责法律合规、合同审查和风险评估。在会议中提供法律意见和风险提示。说话风格：严谨、专业、审慎。每次发言控制在80字以内。`
  },
  {
    gal_number: 'AI-AUD000011',
    name: '监督官',
    avatar: 'robot',
    system_prompt: `你是公司的独立监督官。你的职责是监督各部门工作质量，发现问题并提出改进建议。你不属于任何部门，直接向总经理负责。在会议最后发言，客观评价各部门表现。说话风格：犀利、公正、一针见血。每次发言控制在100字以内。`
  }
];

// 插入AI公司人格
async function initAICompanyPersonas() {
  for (const persona of AI_COMPANY_PERSONAS) {
    try {
      await runSql(
        'INSERT INTO ai_personas (gal_number, name, avatar, system_prompt) VALUES (?, ?, ?, ?)',
        [persona.gal_number, persona.name, persona.avatar, persona.system_prompt]
      );
    } catch (e) {
      // 忽略重复插入错误
    }
  }
  console.log('✅ AI公司岗位人格初始化完成');
}

// 修改initAIPersonas函数末尾添加AI公司人格
const originalInitAI = initAIPersonas;
initAIPersonas = async function() {
  await originalInitAI();
  await initAICompanyPersonas();
};

// 导出新函数
module.exports.getAIPersonasByGalNumbers = getAIPersonasByGalNumbers;
module.exports.ensureAIUser = ensureAIUser;
module.exports.updateChatGroupMode = updateChatGroupMode;
module.exports.updateChat = updateChat;
module.exports.updateChatMemberRole = updateChatMemberRole;
module.exports.removeChatMember = removeChatMember;
module.exports.muteChatMember = muteChatMember;
module.exports.unmuteAllMembers = unmuteAllMembers;
module.exports.transferOwnership = transferOwnership;
module.exports.getMutedMembers = getMutedMembers;
module.exports.createMeeting = createMeeting;
module.exports.getMeetings = getMeetings;
module.exports.getStarredContacts = getStarredContacts;
module.exports.getChatById = getChatById;
module.exports.getChatByInviteCode = getChatByInviteCode;

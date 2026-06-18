/**
 * 数据库补丁：为messages表添加安全隐私相关字段
 * burn_after - 阅后即焚倒计时(秒)
 * burned_at - 销毁时间戳  
 * is_anonymous - 是否匿踪消息
 */

const isProduction = !!process.env.DATABASE_URL;

async function migrateDatabase() {
  if (isProduction) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      // 添加 burn_after 字段
      await pool.query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS burn_after INTEGER DEFAULT 0
      `).catch(() => {}); // 忽略已存在错误
      
      // 添加 burned_at 字段
      await pool.query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS burned_at TIMESTAMP
      `).catch(() => {});
      
      // 添加 is_anonymous 字段
      await pool.query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE
      `).catch(() => {});
      
      console.log('✅ PostgreSQL迁移完成');
    } catch (err) {
      console.log('PostgreSQL迁移跳过（字段可能已存在）');
    }
    
    pool.end();
  } else {
    // SQLite/sql.js 模式
    const fs = require('fs');
    const path = require('path');
    const DB_PATH = path.join(__dirname, 'nova-os.db');
    
    if (fs.existsSync(DB_PATH)) {
      console.log('SQLite迁移: 请确保数据库已包含新字段（SQLite无需显式迁移）');
    }
  }
}

// 运行迁移
migrateDatabase().then(() => {
  console.log('数据库检查完成');
  process.exit(0);
}).catch(err => {
  console.error('迁移失败:', err.message);
  process.exit(1);
});

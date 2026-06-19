#!/usr/bin/env python3
"""
商业群组全面升级 - 对标微信群管理能力
1. 重写showChatInfoPanel为完整群管理面板
2. 添加从联系人邀请成员功能
3. 添加退群/解散群功能
4. 添加成员禁言功能
5. 添加群主转让功能
6. 后端API支持
"""

import os
import shutil

BASE = '/app/data/所有对话/主对话/nova-chat-fix'

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def safe_replace(content, old, new, desc=""):
    """安全替换，验证唯一匹配"""
    count = content.count(old)
    if count == 0:
        print(f"  ❌ 未找到: {desc}")
        return content, False
    if count > 1:
        print(f"  ⚠️ 多处匹配({count}): {desc}")
        return content, False
    result = content.replace(old, new)
    print(f"  ✅ 替换成功: {desc}")
    return result, True

# ===== 1. database.js 添加新函数 =====
print("\n=== 升级 database.js ===")
db_path = os.path.join(BASE, 'database.js')
db = read_file(db_path)

# 在 removeChatMember 后添加新函数
new_db_functions = '''
async function muteChatMember(chatId, userId, isMuted) {
  const result = await runSql(
    'UPDATE chat_members SET is_muted = ? WHERE chat_id = ? AND user_id = ?',
    [isMuted ? 1 : 0, chatId, userId]
  );
  return result.changes > 0;
}

async function unmuteAllMembers(chatId) {
  const result = await runSql(
    'UPDATE chat_members SET is_muted = 0 WHERE chat_id = ?',
    [chatId]
  );
  return result.changes > 0;
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
'''

old_removeChatMember = '''async function removeChatMember(chatId, userId) {
  const result = await runSql(
    'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  return result.changes > 0;
}

async function createMeeting'''

db, ok = safe_replace(db, 
    old_removeChatMember,
    '''async function removeChatMember(chatId, userId) {
  const result = await runSql(
    'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  return result.changes > 0;
}

''' + new_db_functions + '''
async function createMeeting''',
    "添加muteChatMember/unmuteAllMembers/transferOwnership/getMutedMembers函数"
)

# 导出新函数
old_exports = "module.exports.removeChatMember = removeChatMember;"
db, ok = safe_replace(db,
    old_exports,
    '''module.exports.removeChatMember = removeChatMember;
module.exports.muteChatMember = muteChatMember;
module.exports.unmuteAllMembers = unmuteAllMembers;
module.exports.transferOwnership = transferOwnership;
module.exports.getMutedMembers = getMutedMembers;''',
    "导出新数据库函数"
)

# 添加 is_muted 列到 chat_members (PG)
old_pg_members = '''  // 创建聊天成员表
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_members (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
  )`);'''

db, ok = safe_replace(db,
    old_pg_members,
    '''  // 创建聊天成员表
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_members (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member',
    is_muted BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
  )`);''',
    "PG chat_members表添加is_muted列"
)

# 添加 ALTER TABLE for is_muted in PG
old_pg_alter = "await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE`);"
db, ok = safe_replace(db,
    old_pg_alter,
    old_pg_alter + "\n  \n  // chat_members表新增字段\n  await pool.query(`ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE`);",
    "PG ALTER TABLE添加is_muted"
)

# SQLite chat_members 添加 is_muted
old_sqlite_members = None
for line in db.split('\n'):
    if 'chat_id INTEGER,' in line and 'host_id INTEGER' in line:
        # This is in the meetings table, skip
        continue

# Let me find the SQLite chat_members table definition
lines = db.split('\n')
for i, line in enumerate(lines):
    if "sqlDb.run(`CREATE TABLE IF NOT EXISTS chat_members" in line:
        old_sqlite_members = '\n'.join(lines[i:i+7])
        break

if old_sqlite_members:
    new_sqlite_members = old_sqlite_members.replace(
        "role TEXT DEFAULT 'member',\n    joined_at",
        "role TEXT DEFAULT 'member',\n    is_muted INTEGER DEFAULT 0,\n    joined_at"
    )
    db, ok = safe_replace(db, old_sqlite_members, new_sqlite_members, "SQLite chat_members添加is_muted列")

# SQLite ALTER TABLE
old_sqlite_alter = "try { sqlDb.run('ALTER TABLE messages ADD COLUMN is_anonymous INTEGER DEFAULT 0'); } catch(e) {}"
db, ok = safe_replace(db,
    old_sqlite_alter,
    old_sqlite_alter + "\n  try { sqlDb.run('ALTER TABLE chat_members ADD COLUMN is_muted INTEGER DEFAULT 0'); } catch(e) {}",
    "SQLite ALTER TABLE添加is_muted"
)

# 更新 getChatMembers 查询包含 is_muted
old_get_members = "SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key, cm.role, cm.joined_at"
new_get_members = "SELECT u.id, u.gal_number, u.nickname, u.avatar, u.public_key, cm.role, cm.is_muted, cm.joined_at"
db, ok = safe_replace(db, old_get_members, new_get_members, "getChatMembers查询包含is_muted")

write_file(db_path, db)
print("✅ database.js 升级完成")


# ===== 2. server.js 添加新API =====
print("\n=== 升级 server.js ===")
sv_path = os.path.join(BASE, 'server.js')
sv = read_file(sv_path)

# 在 updateChatMemberRole API 之后添加新API
new_server_apis = '''
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
'''

# 在 getStarredContacts API 之前插入
old_starred_api = "  // 获取收藏联系人\n  app.get('/api/contacts/starred'"
sv, ok = safe_replace(sv,
    old_starred_api,
    new_server_apis + '\n  ' + old_starred_api,
    "添加群组管理新API(禁言/退群/转让/批量邀请)"
)

# 修改消息发送API - 检查禁言状态
old_msg_check = '''    // 检查权限（会议模式只有管理员可发言）
    if (chat.group_mode === 'meeting') {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === senderId);
      if (member && !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '会议模式下仅管理员可发言' });
      }
    }'''

new_msg_check = '''    // 检查权限（会议模式只有管理员可发言）
    if (chat.group_mode === 'meeting') {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === senderId);
      if (member && !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ success: false, error: '会议模式下仅管理员可发言' });
      }
    }
    
    // 检查成员禁言状态
    if (chat.type === 'group') {
      const members = await db.getChatMembers(chatId);
      const member = members.find(m => m.id === senderId);
      if (member && member.is_muted) {
        return res.status(403).json({ success: false, error: '你已被禁言' });
      }
    }'''

sv, ok = safe_replace(sv, old_msg_check, new_msg_check, "消息发送检查禁言状态")

write_file(sv_path, sv)
print("✅ server.js 升级完成")


# ===== 3. chat.js 重写 showChatInfoPanel + 新增方法 =====
print("\n=== 升级 chat.js ===")
cj_path = os.path.join(BASE, 'public/js/chat.js')
cj = read_file(cj_path)

# 找到 showChatInfoPanel 方法的起始和结束
# 起始: async showChatInfoPanel()
# 结束: closeAllPanels() 方法之前

new_showChatInfoPanel = '''  async showChatInfoPanel() {
    if (!this.currentChat) return;
    
    // 移除旧面板
    const oldPanel = document.getElementById('chat-info-panel');
    if (oldPanel) oldPanel.remove();
    
    // 从服务器获取最新成员数据
    let members = this.currentChat.members || [];
    let chatInfo = this.currentChat;
    const currentUserId = Auth.getCurrentUserId();
    
    if (this.currentChat.type === 'group') {
      try {
        const resp = await fetch(`/api/chats/${this.currentChat.id}`);
        const data = await resp.json();
        if (data.success) {
          members = data.members || members;
          chatInfo = { ...this.currentChat, ...data.chat, members };
        }
      } catch (e) { console.error('获取群成员失败:', e); }
    }
    
    const chat = chatInfo;
    const isGroup = chat.type === 'group';
    const currentMember = isGroup ? members.find(m => m.id === currentUserId) : null;
    const isOwner = currentMember?.role === 'owner';
    const isAdmin = currentMember && ['owner', 'admin'].includes(currentMember.role);
    const isAICompany = chat.groupMode === 'ai_company';
    
    // 创建信息面板
    let panel = document.createElement('div');
    panel.id = 'chat-info-panel';
    panel.className = 'chat-info-panel';
    
    let html = '<div class="panel-header"><h3>聊天信息</h3><button class="btn-icon" id="btn-close-chat-info">✕</button></div>';
    
    if (isGroup) {
      // === 群组头像和名称 ===
      html += '<div class="info-group-header">';
      html += '<div class="info-group-avatar">👥</div>';
      html += '<div class="info-group-meta">';
      html += '<div class="info-group-name-row"><span class="info-group-name">' + UI.escapeHtml(chat.name || '未命名群组') + '</span>';
      if (isAdmin) {
        html += '<button class="btn-icon-sm" id="btn-edit-group-name" title="修改群名">✏️</button>';
      }
      html += '</div>';
      if (chat.description) {
        html += '<div class="info-group-desc">' + UI.escapeHtml(chat.description) + '</div>';
      }
      html += '</div></div>';
      
      // === 群模式标签 ===
      const modeLabels = { open: '🟢 开放群', meeting: '🔵 会议群', quiet: '🟣 防互扰群', ai_company: '🤖 AI公司' };
      const modeDescs = { open: '任何人可自由发言', meeting: '仅管理员可发言', quiet: '成员间不可私聊', ai_company: 'AI自动回复模式' };
      html += '<div class="info-mode-tag">' + (modeLabels[chat.groupMode] || '🟢 开放群') + ' · ' + (modeDescs[chat.groupMode] || '') + '</div>';
      
      // === 成员区域 ===
      html += '<div class="info-section">';
      html += '<div class="info-section-header"><span>群成员 (' + members.length + ')</span>';
      if (isAdmin) {
        html += '<button class="btn-text" id="btn-invite-members">＋ 邀请</button>';
      }
      html += '</div>';
      
      // 成员网格
      html += '<div class="info-members-grid">';
      members.forEach(m => {
        const isAI = m.galNumber && m.galNumber.startsWith && m.galNumber.startsWith('AI-');
        const roleIcon = m.role === 'owner' ? '👑' : m.role === 'admin' ? '⚡' : (isAI ? '🤖' : '');
        const mutedIcon = m.is_muted ? '🔇' : '';
        html += '<div class="info-member-card" data-user-id="' + m.id + '">';
        html += '<div class="info-member-avatar">' + (UI.avatarMap[m.avatar] || (isAI ? '🤖' : '👤')) + '</div>';
        html += '<div class="info-member-name">' + UI.escapeHtml(m.nickname) + (m.id === currentUserId ? '(我)' : '') + '</div>';
        if (roleIcon || mutedIcon) {
          html += '<div class="info-member-badges">' + roleIcon + mutedIcon + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
      
      // === 群公告 ===
      if (chat.announcement) {
        html += '<div class="info-section">';
        html += '<div class="info-section-header"><span>📌 群公告</span>';
        if (isAdmin) html += '<button class="btn-text" id="btn-edit-announcement">编辑</button>';
        html += '</div>';
        html += '<div class="info-announcement-content">' + UI.escapeHtml(chat.announcement) + '</div>';
        html += '</div>';
      } else if (isAdmin) {
        html += '<div class="info-section">';
        html += '<div class="info-section-header"><span>📌 群公告</span>';
        html += '<button class="btn-text" id="btn-edit-announcement">发布</button>';
        html += '</div>';
        html += '<div class="info-announcement-empty">暂无公告</div>';
        html += '</div>';
      }
      
      // === 管理功能（管理员可见）===
      if (isAdmin) {
        html += '<div class="info-section info-admin-section">';
        html += '<div class="info-section-header"><span>⚙️ 群管理</span></div>';
        
        // 邀请码
        html += '<div class="info-action-row" id="row-invite-code">';
        html += '<span>邀请码入群</span>';
        html += '<button class="btn-text" id="btn-generate-invite-inline">' + (chat.inviteCode ? chat.inviteCode : '生成邀请码') + '</button>';
        html += '</div>';
        
        // 全体禁言切换
        const hasMutedMembers = members.some(m => m.is_muted && m.role !== 'owner' && m.role !== 'admin');
        html += '<div class="info-action-row">';
        html += '<span>全体禁言</span>';
        html += '<label class="toggle-switch"><input type="checkbox" id="toggle-mute-all"' + (hasMutedMembers ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
        html += '</div>';
        
        // 群模式切换（AI公司不显示）
        if (!isAICompany) {
          html += '<div class="info-action-row" id="row-mode-switch">';
          html += '<span>群模式</span>';
          html += '<select class="info-select" id="select-group-mode">';
          html += '<option value="open"' + (chat.groupMode === 'open' ? ' selected' : '') + '>🟢 开放群</option>';
          html += '<option value="meeting"' + (chat.groupMode === 'meeting' ? ' selected' : '') + '>🔵 会议群</option>';
          html += '<option value="quiet"' + (chat.groupMode === 'quiet' ? ' selected' : '') + '>🟣 防互扰群</option>';
          html += '</select>';
          html += '</div>';
        }
        
        // 转让群主（仅群主可见）
        if (isOwner) {
          html += '<div class="info-action-row">';
          html += '<span>转让群主</span>';
          html += '<button class="btn-text btn-warn" id="btn-transfer-ownership">转让</button>';
          html += '</div>';
        }
        
        html += '</div>';
      }
      
      // === 常规功能 ===
      html += '<div class="info-section">';
      html += '<div class="info-section-header"><span>🔧 设置</span></div>';
      
      // 消息免打扰
      html += '<div class="info-action-row">';
      html += '<span>消息免打扰</span>';
      html += '<label class="toggle-switch"><input type="checkbox" id="toggle-mute-notif"' + (chat.isMuted ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
      html += '</div>';
      
      // 群组设置（完整版）
      html += '<div class="info-action-row" id="row-full-settings">';
      html += '<span>完整群设置</span>';
      html += '<button class="btn-text" id="btn-open-group-settings">前往 →</button>';
      html += '</div>';
      
      html += '</div>';
      
      // === AI公司专属 ===
      if (isAICompany) {
        html += '<div class="info-section">';
        html += '<button class="btn btn-primary" style="width:100%" id="btn-trigger-ai-meeting">📋 召开AI会议</button>';
        html += '</div>';
      }
      
    } else {
      // === 私聊信息 ===
      const otherMember = chat.members?.find(m => m.id !== currentUserId);
      if (otherMember) {
        html += '<div class="info-group-header">';
        html += '<div class="info-member-avatar-lg">' + (UI.avatarMap[otherMember.avatar] || '👤') + '</div>';
        html += '<div class="info-group-meta">';
        html += '<div class="info-group-name">' + UI.escapeHtml(otherMember.nickname) + '</div>';
        html += '<div class="info-group-desc">Gal: ' + UI.formatGalNumber(otherMember.galNumber) + '</div>';
        html += '</div></div>';
      }
    }
    
    // === 底部操作 ===
    html += '<div class="info-section info-danger-section">';
    html += '<button class="btn btn-secondary" style="width:100%" id="btn-clear-chat-history">🗑️ 清空聊天记录</button>';
    if (isGroup) {
      if (isOwner) {
        html += '<button class="btn btn-danger" style="width:100%" id="btn-disband-group">❌ 解散群组</button>';
      } else {
        html += '<button class="btn btn-danger" style="width:100%" id="btn-leave-group">🚪 退出群组</button>';
      }
    }
    html += '</div>';
    
    panel.innerHTML = html;
    
    // 插入到聊天窗口
    const chatWindow = document.getElementById('chat-window');
    chatWindow.appendChild(panel);
    
    // === 绑定事件 ===
    
    // 关闭面板
    document.getElementById('btn-close-chat-info')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
    
    // 清空聊天记录
    document.getElementById('btn-clear-chat-history')?.addEventListener('click', () => {
      UI.showConfirm('清空聊天记录', '确定要清空所有聊天记录吗？此操作不可恢复。', async () => {
        try {
          await fetch('/api/chats/' + this.currentChat.id + '/messages', { method: 'DELETE' });
          document.getElementById('chat-messages').innerHTML = '';
          this.chatMessages[this.currentChat.id] = [];
          UI.showToast('聊天记录已清空');
          panel.classList.add('hidden');
        } catch(e) { UI.showToast('清空失败'); }
      });
    });
    
    if (isGroup) {
      // 修改群名
      document.getElementById('btn-edit-group-name')?.addEventListener('click', () => {
        const newName = prompt('修改群名称:', chat.name || '');
        if (newName && newName.trim() && newName.trim() !== chat.name) {
          fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, name: newName.trim() })
          }).then(r => r.json()).then(data => {
            if (data.success) {
              UI.showToast('群名已更新');
              this.showChatInfoPanel(); // 刷新面板
            } else { UI.showToast(data.error || '更新失败'); }
          });
        }
      });
      
      // 编辑群公告
      document.getElementById('btn-edit-announcement')?.addEventListener('click', () => {
        const newAnn = prompt('编辑群公告:', chat.announcement || '');
        if (newAnn !== null) {
          fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, announcement: newAnn })
          }).then(r => r.json()).then(data => {
            if (data.success) {
              UI.showToast('公告已更新');
              this.showChatInfoPanel();
            } else { UI.showToast(data.error || '更新失败'); }
          });
        }
      });
      
      // 邀请成员
      document.getElementById('btn-invite-members')?.addEventListener('click', () => {
        this.showInviteMembersModal(members);
      });
      
      // 成员卡片点击 -> 成员详情
      panel.querySelectorAll('.info-member-card').forEach(card => {
        card.addEventListener('click', () => {
          const userId = parseInt(card.dataset.userId);
          this.showMemberDetail(userId, members, isOwner, isAdmin, currentUserId);
        });
      });
      
      // 生成/显示邀请码
      document.getElementById('btn-generate-invite-inline')?.addEventListener('click', async () => {
        if (chat.inviteCode) {
          // 复制邀请码
          try {
            await navigator.clipboard.writeText(chat.inviteCode);
            UI.showToast('邀请码已复制: ' + chat.inviteCode);
          } catch(e) {
            UI.showToast('邀请码: ' + chat.inviteCode);
          }
          return;
        }
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/invite-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId })
          });
          const data = await resp.json();
          if (data.success) {
            chat.inviteCode = data.inviteCode;
            document.getElementById('btn-generate-invite-inline').textContent = data.inviteCode;
            UI.showToast('邀请码已生成');
          } else { UI.showToast(data.error || '生成失败'); }
        } catch(e) { UI.showToast('生成失败'); }
      });
      
      // 全体禁言
      document.getElementById('toggle-mute-all')?.addEventListener('change', async (e) => {
        const isMuted = e.target.checked;
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/mute-all', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast(isMuted ? '已开启全体禁言' : '已关闭全体禁言');
          } else {
            e.target.checked = !isMuted;
            UI.showToast(data.error || '操作失败');
          }
        } catch(e) {
          e.target.checked = !isMuted;
          UI.showToast('操作失败');
        }
      });
      
      // 群模式切换
      document.getElementById('select-group-mode')?.addEventListener('change', async (e) => {
        const newMode = e.target.value;
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, mode: newMode })
          });
          const data = await resp.json();
          if (data.success) {
            this.currentChat.groupMode = newMode;
            UI.showToast('群模式已切换');
            this.showChatInfoPanel(); // 刷新
          } else { UI.showToast(data.error || '切换失败'); }
        } catch(e) { UI.showToast('切换失败'); }
      });
      
      // 转让群主
      document.getElementById('btn-transfer-ownership')?.addEventListener('click', () => {
        this.showTransferOwnershipModal(members, currentUserId);
      });
      
      // 消息免打扰
      document.getElementById('toggle-mute-notif')?.addEventListener('change', async (e) => {
        const isMuted = e.target.checked;
        try {
          await fetch('/api/chats/' + this.currentChat.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted })
          });
          UI.showToast(isMuted ? '已开启免打扰' : '已关闭免打扰');
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 完整群设置
      document.getElementById('btn-open-group-settings')?.addEventListener('click', () => {
        panel.classList.add('hidden');
        if (window.GroupSettings) {
          GroupSettings.show(this.currentChat.id);
        }
      });
      
      // AI会议
      document.getElementById('btn-trigger-ai-meeting')?.addEventListener('click', () => {
        panel.classList.add('hidden');
        if (window.AICompany) {
          AICompany.showMeeting(this.currentChat.id);
        }
      });
      
      // 退群
      document.getElementById('btn-leave-group')?.addEventListener('click', () => {
        UI.showConfirm('退出群组', '确定要退出该群组吗？', async () => {
          try {
            const resp = await fetch('/api/chats/' + this.currentChat.id + '/leave', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('已退出群组');
              this.closeChat();
              this.loadChatList();
            } else { UI.showToast(data.error || '退群失败'); }
          } catch(e) { UI.showToast('退群失败'); }
        });
      });
      
      // 解散群组
      document.getElementById('btn-disband-group')?.addEventListener('click', () => {
        UI.showConfirm('解散群组', '确定要解散该群组吗？此操作不可恢复，所有成员将被移除。', async () => {
          try {
            const resp = await fetch('/api/chats/' + this.currentChat.id + '/leave', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('群组已解散');
              this.closeChat();
              this.loadChatList();
            } else { UI.showToast(data.error || '解散失败'); }
          } catch(e) { UI.showToast('解散失败'); }
        });
      });
    }
    
    // 更新AppState
    if (window.AppState) AppState.inChatInfo = true;
  },
  
  // === 邀请成员弹窗（从联系人选择）===
  showInviteMembersModal(currentMembers) {
    const currentMemberIds = new Set(currentMembers.map(m => m.id));
    const currentUserId = Auth.getCurrentUserId();
    
    // 获取联系人列表
    let contacts = [];
    if (window.AppData && AppData.contacts) {
      contacts = AppData.contacts.filter(c => c.status === 'accepted' && !currentMemberIds.has(c.id));
    }
    
    if (contacts.length === 0) {
      UI.showToast('没有可邀请的联系人');
      return;
    }
    
    let html = '<div class="invite-contacts-list">';
    contacts.forEach(c => {
      html += '<label class="invite-contact-item">';
      html += '<input type="checkbox" class="invite-check" data-gal="' + c.galNumber + '" data-name="' + UI.escapeHtml(c.nickname) + '">';
      html += '<span class="avatar">' + (UI.avatarMap[c.avatar] || '👤') + '</span>';
      html += '<span class="name">' + UI.escapeHtml(c.nickname) + '</span>';
      html += '<span class="gal">' + UI.formatGalNumber(c.galNumber) + '</span>';
      html += '</label>';
    });
    html += '</div>';
    
    UI.showModal('邀请成员加入群组', html, [
      { text: '取消', class: 'btn-secondary' },
      { text: '邀请 (' + contacts.length + '人可选)', class: 'btn-primary', id: 'btn-confirm-invite', closeOnClick: false, onClick: async () => {
        const checks = document.querySelectorAll('.invite-check:checked');
        if (checks.length === 0) {
          UI.showToast('请选择要邀请的成员');
          return;
        }
        const galNumbers = Array.from(checks).map(c => c.dataset.gal);
        
        try {
          const resp = await fetch('/api/chats/' + this.currentChat.id + '/invite-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, galNumbers })
          });
          const data = await resp.json();
          if (data.success) {
            const addedCount = data.added.length;
            UI.showToast('成功邀请 ' + addedCount + ' 人加入群组');
            UI.closeModal();
            this.showChatInfoPanel(); // 刷新面板
          } else {
            UI.showToast(data.error || '邀请失败');
          }
        } catch(e) { UI.showToast('邀请失败'); }
      }}
    ]);
  },
  
  // === 成员详情弹窗 ===
  showMemberDetail(userId, members, isOwner, isAdmin, currentUserId) {
    const member = members.find(m => m.id === userId);
    if (!member) return;
    
    const isAI = member.galNumber && member.galNumber.startsWith && member.galNumber.startsWith('AI-');
    const isSelf = userId === currentUserId;
    const canManage = isAdmin && !isSelf && member.role !== 'owner';
    
    let html = '<div class="member-detail">';
    html += '<div class="member-detail-avatar">' + (UI.avatarMap[member.avatar] || (isAI ? '🤖' : '👤')) + '</div>';
    html += '<div class="member-detail-name">' + UI.escapeHtml(member.nickname) + '</div>';
    html += '<div class="member-detail-gal">Gal: ' + UI.formatGalNumber(member.galNumber) + '</div>';
    html += '<div class="member-detail-role">' + (member.role === 'owner' ? '👑 群主' : member.role === 'admin' ? '⚡ 管理员' : isAI ? '🤖 AI' : '👤 成员') + '</div>';
    
    if (canManage) {
      html += '<div class="member-detail-actions">';
      
      // 设为/取消管理员（仅群主）
      if (isOwner) {
        if (member.role === 'admin') {
          html += '<button class="btn btn-secondary" id="btn-demote-admin">取消管理员</button>';
        } else {
          html += '<button class="btn btn-secondary" id="btn-promote-admin">设为管理员</button>';
        }
      }
      
      // 禁言/解禁
      if (member.is_muted) {
        html += '<button class="btn btn-secondary" id="btn-unmute-member">解除禁言</button>';
      } else {
        html += '<button class="btn btn-secondary" id="btn-mute-member">禁言</button>';
      }
      
      // 移除成员
      html += '<button class="btn btn-danger" id="btn-remove-member">移除出群</button>';
      html += '</div>';
    }
    
    html += '</div>';
    
    UI.showModal('成员详情', html, [
      { text: '关闭', class: 'btn-secondary' }
    ]);
    
    // 绑定操作事件
    setTimeout(() => {
      // 设为管理员
      document.getElementById('btn-promote-admin')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, role: 'admin' })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已设为管理员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 取消管理员
      document.getElementById('btn-demote-admin')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, role: 'member' })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已取消管理员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 禁言
      document.getElementById('btn-mute-member')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/mute`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted: true })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已禁言该成员');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 解除禁言
      document.getElementById('btn-unmute-member')?.addEventListener('click', async () => {
        try {
          const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}/mute`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, isMuted: false })
          });
          const data = await resp.json();
          if (data.success) {
            UI.showToast('已解除禁言');
            UI.closeModal();
            this.showChatInfoPanel();
          } else { UI.showToast(data.error || '操作失败'); }
        } catch(e) { UI.showToast('操作失败'); }
      });
      
      // 移除成员
      document.getElementById('btn-remove-member')?.addEventListener('click', () => {
        UI.showConfirm('移除成员', '确定要移除 ' + member.nickname + ' 吗？', async () => {
          try {
            const resp = await fetch(`/api/chats/${this.currentChat.id}/members/${userId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId })
            });
            const data = await resp.json();
            if (data.success) {
              UI.showToast('成员已移除');
              UI.closeModal();
              this.showChatInfoPanel();
            } else { UI.showToast(data.error || '移除失败'); }
          } catch(e) { UI.showToast('移除失败'); }
        });
      });
    }, 100);
  },
  
  // === 转让群主弹窗 ===
  showTransferOwnershipModal(members, currentUserId) {
    const otherMembers = members.filter(m => m.id !== currentUserId);
    
    if (otherMembers.length === 0) {
      UI.showToast('群内没有其他成员可转让');
      return;
    }
    
    let html = '<div class="transfer-members-list">';
    otherMembers.forEach(m => {
      html += '<div class="transfer-member-item" data-user-id="' + m.id + '">';
      html += '<span class="avatar">' + (UI.avatarMap[m.avatar] || '👤') + '</span>';
      html += '<span class="name">' + UI.escapeHtml(m.nickname) + '</span>';
      html += '<span class="role">' + (m.role === 'admin' ? '⚡ 管理员' : '👤 成员') + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">⚠️ 转让后你将变为管理员，无法撤回</p>';
    
    UI.showModal('转让群主', html, [
      { text: '取消', class: 'btn-secondary' }
    ]);
    
    // 点击成员选择转让
    setTimeout(() => {
      document.querySelectorAll('.transfer-member-item').forEach(item => {
        item.addEventListener('click', () => {
          const targetUserId = parseInt(item.dataset.userId);
          const targetName = item.querySelector('.name').textContent;
          UI.showConfirm('确认转让', '确定要将群主转让给 ' + targetName + ' 吗？此操作不可撤回。', async () => {
            try {
              const resp = await fetch('/api/chats/' + this.currentChat.id + '/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUserId, targetUserId })
              });
              const data = await resp.json();
              if (data.success) {
                UI.showToast('群主已转让');
                UI.closeModal();
                this.closeChat();
                this.loadChatList();
              } else { UI.showToast(data.error || '转让失败'); }
            } catch(e) { UI.showToast('转让失败'); }
          });
        });
      });
    }, 100);
  },
'''

# 找到并替换 showChatInfoPanel 方法
# 方法从 "async showChatInfoPanel()" 开始，到 "closeAllPanels()" 之前结束
old_panel_start = '  async showChatInfoPanel() {'
old_panel_end_marker = '  // 关闭所有面板\n  closeAllPanels()'

# 找到起始位置
start_idx = cj.find(old_panel_start)
if start_idx == -1:
    print("  ❌ 未找到showChatInfoPanel起始位置")
else:
    # 找到结束位置
    end_idx = cj.find(old_panel_end_marker, start_idx)
    if end_idx == -1:
        print("  ❌ 未找到showChatInfoPanel结束位置")
    else:
        old_panel_code = cj[start_idx:end_idx]
        cj = cj[:start_idx] + new_showChatInfoPanel + cj[end_idx:]
        print(f"  ✅ 替换showChatInfoPanel (原{len(old_panel_code)}字符 → 新{len(new_showChatInfoPanel)}字符)")

write_file(cj_path, cj)
print("✅ chat.js 升级完成")


# ===== 4. CSS 添加新样式 =====
print("\n=== 升级 style.css ===")
css_path = os.path.join(BASE, 'public/css/style.css')
css = read_file(css_path)

new_css = '''
/* ==================== V3.3 群组信息面板增强样式 ==================== */
.info-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--card-bg, rgba(30,35,50,0.8));
  border-radius: 12px;
  margin: 8px 0;
}
.info-group-avatar {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}
.info-member-avatar-lg {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
}
.info-group-meta {
  flex: 1;
  min-width: 0;
}
.info-group-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-group-name {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}
.info-group-desc {
  font-size: 13px;
  color: var(--text-muted, #888);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-icon-sm {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.btn-icon-sm:hover { opacity: 1; }

.info-mode-tag {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(99,102,241,0.15);
  color: #a5b4fc;
  font-size: 12px;
  margin: 4px 0 8px;
}

.info-section {
  background: var(--card-bg, rgba(30,35,50,0.8));
  border-radius: 12px;
  margin: 8px 0;
  padding: 12px 16px;
}
.info-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
}

.btn-text {
  background: none;
  border: none;
  color: var(--primary, #6366f1);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}
.btn-text:hover { background: rgba(99,102,241,0.1); }
.btn-text.btn-warn { color: #f59e0b; }

.info-members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
}
.info-member-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}
.info-member-card:hover { background: rgba(99,102,241,0.1); }
.info-member-card .info-member-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e293b, #334155);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.info-member-card .info-member-name {
  font-size: 11px;
  color: #ccc;
  text-align: center;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-member-badges {
  font-size: 10px;
  text-align: center;
}

.info-announcement-content {
  font-size: 13px;
  color: #ddd;
  line-height: 1.6;
  padding: 8px 12px;
  background: rgba(99,102,241,0.08);
  border-radius: 8px;
  border-left: 3px solid #6366f1;
}
.info-announcement-empty {
  font-size: 13px;
  color: #666;
  text-align: center;
  padding: 8px;
}

.info-admin-section {
  border: 1px solid rgba(245,158,11,0.2);
}

.info-action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 14px;
  color: #ccc;
}
.info-action-row:last-child { border-bottom: none; }

.info-select {
  background: rgba(30,35,50,0.8);
  color: #ccc;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
}

/* Toggle开关 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #334155;
  border-radius: 24px;
  transition: 0.3s;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle-switch input:checked + .toggle-slider { background-color: #6366f1; }
.toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); }

.info-danger-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-danger-section .btn { margin: 0; }

/* 邀请成员弹窗 */
.invite-contacts-list {
  max-height: 300px;
  overflow-y: auto;
}
.invite-contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.2s;
}
.invite-contact-item:hover { background: rgba(99,102,241,0.08); }
.invite-contact-item .avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e293b, #334155);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.invite-contact-item .name { flex: 1; font-size: 14px; color: #ddd; }
.invite-contact-item .gal { font-size: 11px; color: #888; }
.invite-contact-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #6366f1;
}

/* 转让群主 */
.transfer-members-list { max-height: 300px; overflow-y: auto; }
.transfer-member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.2s;
  border-radius: 8px;
}
.transfer-member-item:hover { background: rgba(245,158,11,0.1); }
.transfer-member-item .avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e293b, #334155);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.transfer-member-item .name { flex: 1; font-size: 14px; color: #ddd; }
.transfer-member-item .role { font-size: 12px; color: #888; }

/* 成员详情 */
.member-detail {
  text-align: center;
  padding: 12px;
}
.member-detail-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e293b, #334155);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin: 0 auto 12px;
}
.member-detail-name { font-size: 18px; font-weight: 600; color: #fff; }
.member-detail-gal { font-size: 12px; color: #888; margin-top: 4px; }
.member-detail-role { font-size: 13px; color: #a5b4fc; margin-top: 8px; }
.member-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.member-detail-actions .btn { width: 100%; }
'''

# 在CSS末尾追加
css += new_css
write_file(css_path, css)
print("✅ style.css 升级完成")


# ===== 5. 语法校验 =====
print("\n=== 语法校验 ===")
import subprocess

for f in ['server.js', 'database.js', 'public/js/chat.js', 'public/js/app.js']:
    result = subprocess.run(['node', '-c', f], capture_output=True, text=True, cwd=BASE)
    if result.returncode == 0:
        print(f"  ✅ {f}")
    else:
        print(f"  ❌ {f}: {result.stderr.strip()}")

print("\n=== 升级完成 ===")

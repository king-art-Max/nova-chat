# Nova-OS 星尘聊天生态系统

> 🔐 端到端加密 · 🤖 AI助手 · 🌙 暗黑太空主题

Nova-OS 是一个真正可用的加密聊天应用，让你可以和朋友、同事安全地交流。

![Nova-OS](https://via.placeholder.com/800x400/0a0a1a/00d4ff?text=Nova-OS)

## ✨ 功能特性

### 🔐 端到端加密聊天
- 使用 ECDH 密钥协商 + AES-256-GCM 对称加密
- 服务器只转发密文，无法查看消息内容
- 每条消息使用独立随机密钥

### 📨 消息类型
- **普通消息**：标准加密传输
- **阅后即焚**：消息打开后自动倒计时销毁（3/10/30/60秒可选）
- **匿踪消息**：发送者完全匿名，退出聊天后消息消失

### 🤖 AI 助手
- 4种预设AI人格可选
  - 🤖 Nova助手 - 通用助手
  - 🎭 毒舌评论员 - 犀利吐槽
  - 🌙 情感树洞 - 温柔倾听
  - 📊 数据分析师 - 专业严谨
- 支持多AI群聊讨论
- 配置API Key可启用真实AI对话

### 👥 社交功能
- Gal号码：独特的加密身份标识
- 联系人管理：通过Gal号码添加好友
- 群聊支持：创建群组邀请成员

### 💰 钱包模块
- 测试网钱包地址生成
- 转账功能（测试网）
- 交易记录查看

### 📱 移动优先
- 暗黑太空主题设计
- 流畅的动画效果
- 适配手机和桌面浏览器

## 🛠 技术架构

```
nova-os/
├── server.js          # Express + Socket.io 服务器
├── database.js        # SQLite 数据库操作
├── public/            # 前端静态文件
│   ├── index.html    # 主页面
│   ├── css/style.css # 暗黑太空主题样式
│   └── js/           # 模块化JavaScript
│       ├── crypto.js # E2EE加密
│       ├── auth.js   # 认证模块
│       ├── chat.js   # 聊天功能
│       ├── ai.js     # AI对话
│       ├── wallet.js # 钱包
│       └── app.js    # 主应用
```

### 技术栈
- **后端**：Node.js, Express, Socket.io, better-sqlite3
- **前端**：原生JavaScript（无框架），CSS3动画
- **加密**：Web Crypto API (ECDH + AES-GCM)
- **部署**：Render.com 免费层

## 🚀 快速开始

### 本地运行

1. **克隆项目**
```bash
git clone <repository-url>
cd nova-os
```

2. **安装依赖**
```bash
npm install
```

3. **启动服务器**
```bash
npm start
```

4. **打开浏览器**
```
http://localhost:3000
```

### 部署到 Render.com

详见 [DEPLOY.md](./DEPLOY.md)

## 📖 使用指南

### 注册账号
1. 点击"立即注册"
2. 输入昵称和密码
3. 系统自动生成唯一的 Gal 号码
4. 记住你的 Gal 号码，下次登录用

### 添加好友
1. 点击底部的"联系人"
2. 点击右下角的添加按钮
3. 输入对方的 Gal 号码
4. 等待对方接受请求

### 发送加密消息
1. 打开与好友的聊天
2. 输入消息并发送
3. 消息自动端到端加密

### 使用阅后即焚
1. 在输入框上方点击火焰图标 🔥
2. 选择销毁时间（3/10/30/60秒）
3. 发送消息
4. 对方打开后开始倒计时

### AI 对话
1. 点击底部的"AI"
2. 选择一个AI人格
3. 开始对话
4. 可同时和多个AI聊天

## 🔒 加密原理

### 密钥生成
- 注册时在浏览器本地生成 ECDH 密钥对
- 公钥上传服务器，私钥加密存储在本地

### 消息加密
1. 获取接收者的公钥
2. 使用 ECDH 协商共享密钥
3. 用 AES-256-GCM 加密消息
4. 服务器只存储和转发密文

### 阅后即焚
- 消息带 TTL 字段
- 接收方打开后开始倒计时
- 到期后客户端删除，服务器定期清理

## ⚙️ 配置说明

### 环境变量 (.env)

```env
# DeepSeek API Key（可选，不配置使用预设回复）
DEEPSEEK_API_KEY=your_api_key_here

# 服务器端口
PORT=3000

# 环境模式
NODE_ENV=production
```

### AI 配置

不配置 API Key 时，AI 使用预设的有趣回复。如需启用真实 AI：

1. 获取 DeepSeek API Key
2. 在 `.env` 中设置 `DEEPSEEK_API_KEY`
3. 重启服务器

## 📝 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/register | 用户注册 |
| POST | /api/login | 用户登录 |
| GET | /api/user/:gal | 获取用户信息 |
| GET | /api/contacts | 获取联系人列表 |
| POST | /api/contacts/add | 添加联系人 |
| POST | /api/contacts/accept | 接受好友请求 |
| GET | /api/chats | 获取聊天列表 |
| POST | /api/chats | 创建聊天 |
| GET | /api/chats/:id/messages | 获取消息历史 |
| POST | /api/ai/chat | AI对话 |
| GET | /api/ai/personas | 获取AI人格列表 |

## 🎨 自定义

### 修改AI人格
在 `database.js` 的 `initAIPersonas()` 函数中添加新的AI人格。

### 修改样式
编辑 `public/css/style.css` 中的 CSS 变量来自定义主题色。

### 添加头像
在 `public/js/ui.js` 的 `avatarMap` 对象中添加新的头像emoji。

## 📄 许可证

MIT License

## 🙏 致谢

- [Socket.io](https://socket.io/) - 实时通信
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite数据库
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) - 加密功能

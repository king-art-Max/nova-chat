# Nova-OS 部署指南

> 📖 本指南面向没有技术背景的用户，一步一步教你把 Nova-OS 部署到网上，让朋友可以访问你的聊天应用。

## 🌐 什么是部署？

部署就像把你的应用"搬家"到一个永远开着的电脑上。这样：
- 你不用一直开着电脑
- 朋友随时都能访问
- 24小时都能用

## 🚀 选择部署平台：Render.com

我们推荐使用 **Render.com**，因为：
- ✅ 有免费版本
- ✅ 不需要信用卡
- ✅ 支持 Node.js
- ✅ 操作简单

## 📋 部署前准备

你需要准备：

1. **一个 GitHub 账号**（如果没有，请先注册）
   - 访问 https://github.com
   - 点击 "Sign up" 注册

2. **把代码上传到 GitHub**
   - 如果你已经有代码，直接看下一步
   - 如果你是从我这里获得的代码，需要创建仓库

## 📦 第一步：创建 GitHub 仓库

### 方法一：从网页创建（推荐新手）

1. 登录 GitHub 后，点击右上角的 **"+"** → **"New repository"**

2. 填写信息：
   - **Repository name**: `nova-os`（仓库名字）
   - **Description**: `加密AI聊天应用`（描述，可选）
   - **Public**（公开）或 **Private**（私有）都可以
   - ✅ 勾选 "Add a README file"
   - 点击 **"Create repository"**

3. 进入你创建的仓库，点击 **"Add file"** → **"Upload files"**

4. 把 Nova-OS 文件夹里的**所有文件**拖到上传区域：
   ```
   注意：不是上传 nova-os 文件夹本身，而是里面的所有内容！
   ```

5. 点击 **"Commit changes"**

恭喜！你的代码已经在 GitHub 上了。

## 🌐 第二步：部署到 Render.com

### 1. 注册 Render 账号

1. 打开 https://render.com
2. 点击 **"Get Started"** 或 **"Sign Up"**
3. 可以用 **GitHub 账号登录**（最简单）
4. 授权 Render 访问你的 GitHub

### 2. 创建 Web Service

1. 登录后，点击 **"New +"** 按钮
2. 选择 **"Web Service"**

3. 配置服务：

   **Build Command**（构建命令）:
   ```
   npm install
   ```

   **Start Command**（启动命令）:
   ```
   npm start
   ```

4.向下滚动，找到 **"Environment"**（环境）：
   - 选择 **"Free"**（免费）

5. 点击 **"Create Web Service"**（创建网络服务）

### 3. 等待部署

Render 会自动：
- 从 GitHub 获取代码
- 运行 `npm install` 安装依赖
- 启动服务器

你会看到类似这样的日志：
```
==> Deploying...
==> Node.js runtime detected
==> npm install
...
==> Service deployed!
```

看到 **"Your service is live"** 就成功了！

### 4. 获取访问地址

部署成功后，Render 会给你一个网址：
```
https://nova-os.onrender.com
```

（具体地址可能不同，以你看到的为准）

把这个地址分享给朋友，他们就能用了！

## ⚙️ 第三步：配置 AI 功能（可选）

AI 功能需要 API Key，这是可选的，不配置也能用基础功能。

### 获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com
2. 注册账号
3. 在控制台找到 API Key

### 在 Render 上设置环境变量

1. 进入你的 Render Web Service
2. 点击 **"Environment"**（环境）标签
3. 在 **"Environment Variables"** 部分添加：

   | 名称 | 值 |
   |------|-----|
   | DEEPSEEK_API_KEY | 你的API密钥 |
   | NODE_ENV | production |

4. 点击 **"Save Changes"**

Render 会自动重新部署。

## 🔧 常见问题

### Q: 部署失败了怎么办？

**A:** 检查日志：
1. 点击失败的部署
2. 查看错误日志
3. 常见问题：
   - `npm install` 失败 → 检查 package.json
   - 端口错误 → 确保代码使用 `process.env.PORT`

### Q: 为什么朋友访问不了？

**A:** 
1. 确认部署状态是 "Live"
2. 检查网址是否正确
3. 等待1-2分钟让服务完全启动

### Q: 免费版有什么限制？

**A:**
- 15分钟没有活动会自动休眠
- 第一次访问需要等待30秒唤醒
- 每月有750小时免费额度
- 数据在免费版重启后会清空

### Q: 数据会丢失吗？

**A:** 
- 免费版使用 `/tmp` 目录存储数据库
- Render 重启服务器会清空数据
- 适合测试，不适合重要数据
- 如需持久化，可升级付费版使用 PostgreSQL

## 🎉 完成后

恭喜！你已经成功部署了 Nova-OS！

### 测试你的应用

1. 打开你获得的网址
2. 注册一个新账号
3. 试试发送消息

### 分享给朋友

把网址分享给朋友，让他们：
1. 也打开网址注册
2. 互相添加好友
3. 开始聊天

## 📞 需要帮助？

如果遇到问题：
1. 查看 Render 的部署日志
2. 检查 GitHub 仓库代码是否完整
3. 搜索错误信息寻求解决方案

## 💡 进阶：自定义域名（可选）

如果你有自己的域名，可以绑定到 Render：

1. 在 Render 服务设置中点击 **"Custom Domains"**
2. 添加你的域名
3. 按提示在域名服务商处添加 DNS 记录
4. 等待验证生效

---

**祝你使用愉快！** 🎈

# 🚀 电报大师兄 (Telegram Master) SaaS 系统开发指南

你好，Claude Code。如果你阅读到了这个文件，用户当前正在请求你将之前编写的 5 个独立的 Telegram TypeScript 脚本，重构成一个**完整的、带有用户隔离的电报大师兄 SaaS 平台**。

项目将使用 **Next.js** 构建，最终目标部署在 **Railway** 等支持长驻进程的容器云上。要求代码结构清晰，严格贯彻用户数据隔离，界面采用现代化设计风格。

## 🎯 业务需求与系统路由设计

### 1. Auth & Landing Page (着陆页与认证)
- **注册/登录机制**：Landing Page 需具备醒目的注册/登录按钮。
  - **新用户注册 (Magic Link)**：用户输入邮箱注册，通过集成 **Resend** 发送验证码/Magic Link 登入。
  - **免费试用控制**：新注册用户自动获得 **3 个小时** 的试试用权限。(在数据库层面记录 `trialEndsAt`)。超时后强行登出并限制访问，提示需付费续航。
  - **正式用户登录**：用于付费用户（已避开 3 小时限制）的正常登入。
- **Admin 登录入口**：
  - 系统唯一超级管理员账号为 `fchow@gmail.com`，密码 `Tgbot.!2022`。(建议逻辑上做强校验，非明文比对最佳)。
  - 管理员登录后进入 `/admin` 专属控制台。
  - **Admin 功能**：查看所有注册用户、手动给指定邮箱用户延长使用时长/重置试用期、封禁等操作。

### 2. Core Features (SaaS 核心路由规划)
这四大功能需封装为前端页面 + 后端 API。**绝对红线：所有的增删改查、拉取、发送，必须带上当前用户的 ID 进行隔离，A 用户的 Session 绝对不可见或混用于 B 用户！**

- **`/session-gen` (Session 管理)**
  - 引导用户完成 GramJS 登入流程（手机号 -> 验证码 -> 2FA）。
  - 生成的 `StringSession` 需加密或安全落库，并绑定到当前用户邮箱/ID 之下。
- **`/profile-modifier` (资料修改器)**
  - 读取当前用户的所有可用 session，允许修改指定账号的名字 (First/Last Name)、Username、和头像 (Avatar)。
- **`/scrape` (数据采集与洗稿)**
  - 用户输入目标群组链接（支持包含 Topic ID 的 Forum 类型群组 `t.me/group/123`）。
  - 执行爬虫任务：抓取指定条数的消息存入 CSV，并下载配套的媒体文件到服务器指定用户隔离目录。
  - **UX 要求**：爬取完成后，前端提供打包下载按钮 (ZIP 包含 CSV 和媒体文件夹)。用户可以在本地修改洗稿后，准备进入下一步。
- **`/auto-chat` (自动化群发)**
  - 用户上传修改好的 CSV 和对应的媒体压缩包。
  - 用户配置群发规则（目标群组、发送间隔等）。
  - 后台使用该用户池子里的 `StringSession` 进行轮换群发。

## 🏗️ 架构与技术实现约束 (Constraints)

1. **部署环境 (Railway)**
   - 我们运行在类似 Railway 的常驻容器中，**不是** Vercel 的 Serverless。所以允许使用后台驻留进程。
   - 强烈建议使用 **独立 Worker 服务 / 任务队列** (如基于 Redis 的 BullMQ) 来处理 `scrape` 和 `auto-chat` 这种耗时的长任务。不要在 Next.js 的常规 API 里强行 await 阻断响应。
2. **实时通信**
   - 有关 `/session-gen` 这种由于 Telegram 动态验证码导致的多步交互，建议使用 **SSE (Server-Sent Events) + API 轮询**，确保流畅地把“请输入验证码”的指令推给前端。
3. **数据库与隔离**
   - 推荐使用 Prisma 或 Drizzle 连接 Postgres/MySQL。
   - 所有存储的用户媒体文件、CSV、Session 记录，必须严格通过 `userId` 或 `email` 进行数据库行级别和文件系统目录级别的隔离。
4. **底层库避坑指南 (来自独立脚本的血泪史)**
   - 必须使用 `dotenv`（或 Next.js 的本地环境配置）。不要代码里裸写 API_ID 和 API_HASH。
   - 上传头像、发送图片等多媒体时，严禁直接塞系统 Node `Buffer`。**必须包装缓冲数据**，否则会报 `Could not create buffer from file`，核心代码如下：
     ```typescript
     import { CustomFile } from "telegram/client/uploads";
     const customFile = new CustomFile("avatar.jpg", buffer.length, "", buffer);
     ```
   - 请求频率控制：触发 Telegram 的 `FLOOD_WAIT` 必须要 Catch，拿到延迟秒数 `setTimeout` 等待后自动重试，绝不允许任务直接挂掉。

如果在架构设计或者实现 API 接口遇到卡壳的地方，请主动在这条上下文中跟我讨论。确认无误后，优先帮我搭建带 Resend 验证和 Admin 鉴权的基础 Next.js 结构。

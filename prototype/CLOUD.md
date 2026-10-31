# 账号、云工作区与管理后台

这是现有 React 工作区上的实际后端实现。开发环境使用本机持久化 PGlite；正式环境通过 `pg` 连接 PostgreSQL。本机数据库不等于已部署的公网云服务。

## 本机启动与登录

需要 Node.js 24。

```powershell
npm install
npm run dev
```

一个命令启动前端和 API：工作区 `http://127.0.0.1:4174/`，管理后台 `http://127.0.0.1:4174/admin`，API 健康检查 `http://127.0.0.1:4175/api/cloud/health`。端口占用会报错，不自动换地址。

已有前端进程时可以单独运行 `npm run dev:api`；已有 API 时可以运行 `npm run dev:client -- --port 4174 --strictPort`。不要让两个 API 同时打开同一个 PGlite 目录。

默认开发管理员邮箱是 `owner@luli.local`，可在 `.env` 中设置 `BOOTSTRAP_ADMIN_EMAIL`。角色仅由服务端初始化；已存在的普通账号不会因为改环境变量自动升级。管理员可先签发一次性初始化码，再在 `/admin` 设置密码并绑定验证器：

```powershell
node --env-file-if-exists=.env scripts/create-admin-setup.mjs .data/admin-setup.txt
```

初始化说明仅写入指定私有文件，数据库只存码的哈希。码有效期 24 小时、只能消费一次；管理员存在后不能再次签发。不要把说明文件上传到仓库或静态站点。普通用户不能用密码注册或登录。

在页面申请验证码后，读取本机开发邮箱：

```powershell
Get-Content .data/cloud/development-mailbox.jsonl -Tail 1
```

未配置 SMTP 时不会发送真实邮件。验证码 5 分钟有效。开发邮箱、开发密钥和测试验证器仅存于 `.data/`，已从版本控制和 Vite 文件服务中排除，不要上传到静态发布包。

首次进入后台需绑定自己的验证器，并保存一次性恢复代码。管理员密码登录不依赖邮件，绑定后登录还须通过验证器或恢复代码。每次取得 30 分钟后台授权；仅登录账号没有后台操作权限。已绑定的验证器不能通过首次设置接口重置。

## 个人资料的保存与恢复

- 无需登录即可本机编辑。左下角账号入口打开完整登录页面。
- 登录后显示目标邮箱、本机简历和素材清单；用户选择导入，也可直接进入空白云工作区。
- 导入新增副本，重映射引用，保留本机原件。服务端计算内容指纹，重复提交同一批资料不重复导入。仅导入项目或个人资料也支持；更改后的内容视作新一批资料。
- 云端编辑先写当前账号缓存，约 700ms 后同步。联网、聚焦和每 15 秒尝试同步；界面区分同步中、已同步、断网和登录过期。
- 写入使用服务端版本号比较。冲突提供保留双方、使用本机或云端；替换前保存本机恢复副本，覆盖云端前保存服务端恢复副本。账号页可下载恢复文件。
- 退出回到本机空间。不同账号缓存不混用；发现其他账号登录时先切换工作区，旧草稿不上传到新账号。
- 注销须再次验证邮箱，删除该账号的服务端私有记录、会话及当前窗口缓存。其他离线设备已有的本机副本不会远程抹除。

本机缓存仍是浏览器数据，拥有电脑或浏览器配置目录访问权的人能够读取它；不能把本机缓存隔离等同于硬盘加密。

## 管理功能

| 页面 | 已实现能力 |
| --- | --- |
| 运行概览 | 活跃用户、月调用量与成功率、有效邀请、最近失败及配置提醒 |
| 用户与邀请 | 搜索、筛选、独立详情、启停、额度、撤销会话；登记和撤销 7 天邀请 |
| AI 服务 | 平台连接、启停、输出上限、总额度、凭据掩码、允许的域名 |
| 邮件服务 | 启停、SMTP 465/587、发件身份、加密凭据、验证连接、向当前管理员发送测试邮件 |
| 简历模板 | 实际预览、排版参数、草稿版本、发布、下架、回滚 |
| 使用记录 | 时间、邮箱、模型、来源、状态、耗时和供应商返回的 token 用量 |
| 操作记录 | 操作人、目标、原因及前后值，隐藏密钥 |

邀请登记建立准入名单，由管理员分享登录链接；本版不自动发送独立邀请邮件。受邀者在登录页申请验证码。

邮件服务未配置时，正式环境不产生开发验证码，也不开放邮箱验证码登录。邮件设置支持 SMTP 密码或授权码认证；若服务商只允许 OAuth，需要选择兼容发送通道。管理员邮箱与发件邮箱可以不同。保存后立即生效，留空密码保留原凭据，更换服务器、端口或登录账号须重新提供凭据。测试邮件只发给已验证的当前管理员，实际收件仍需管理员确认。

SMTP 凭据通过 AES-256-GCM 加密，绑定服务器、端口和账号；读取接口及审计均不返回原值。连接仅允许公开域名的 465/TLS 或 587/STARTTLS，检查并固定 DNS，验证服务器证书。后台设置优先于环境中的 SMTP 配置。

模板的 `catalogId / catalogVersion / catalogDefaults` 固定在每份简历中。后台发布和下架不会改写旧简历；用户主动更新后才改变排版。五种布局共享同一简历渲染组件。

后台没有读取用户简历、项目原始资料和聊天正文的接口。每个业务请求均校验真实会话、账号状态、资源归属；后台还校验角色和额外授权。公开认证接口不接受管理员角色指定。

## AI 与安全边界

三种来源：无模型的本地规则、管理员配置的平台模型、用户自己的模型连接。统一层处理权限、资料范围、额度、SSE 输出、取消和超时。当前提供 Chat Completions 兼容适配器；其他供应商通过服务端 `registerCloudAdapter` 扩展。

凭据使用 AES-256-GCM，绑定账号和连接 ID；`CREDENTIAL_KEY` 独立于 `BETTER_AUTH_SECRET`。前台和后台只收到掩码，更换地址必须重新填写凭据。加密密钥要单独保管，丢失后无法解密已有连接。

云端只允许 HTTPS、443 端口及 `MODEL_ALLOWED_HOSTS` 中的精确域名。拒绝 IP、内嵌凭据、查询参数、私网/保留地址和跳转；DNS 检查后固定该次解析结果。云端不能访问用户电脑的 localhost；本地模型继续在本机开发模式使用。

月额度按已接受的调用尝试计数，包括连接测试、失败和取消。本地整理不计数。账号锁和平台模型锁预留额度，防止并发绕过；每账号最多两个进行中的请求。使用记录不含请求或回复正文，供应商未提供 token 用量时显示“—”。

同步资料和发送模型是独立动作。详细素材仍需逐次确认接收地址和字段范围，后端再次检查；重试不复用上一次详细素材授权。

## 正式部署

已有静态发布配置保持不变，但账号能力需要常驻 Node.js API 和 PostgreSQL。只发布 `dist/` 或现有 Sites Worker 不会启用此后端。

1. 创建独立 PostgreSQL 数据库及备份/恢复流程。当前隔离由 API 查询实现，未配置数据库 RLS。
2. 按 `.env.example` 设置 `NODE_ENV=production`、HTTPS `APP_ORIGIN`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、`CREDENTIAL_KEY`、真实 `BOOTSTRAP_ADMIN_EMAIL`。SMTP 可以在后台稍后配置，不阻塞管理员首次初始化。
3. 认证密钥使用至少 32 字符随机值；凭据密钥使用 32 字节随机值的 Base64。密钥不进入前端变量、仓库或截图。
4. 执行 `npm run build`，再运行 `npm start`。启动时创建认证和业务表、初始化内置模板，首次启动需要建表权限。生产升级前备份并在预发验证，不要多副本同时做首次初始化。
5. HTTPS 反向代理将同一域名转发至 Node，保留 Origin；不缓存 `/api/`，关闭 SSE 缓冲，允许 120 秒长请求。默认仅绑定回环地址，容器需要时显式配置 `API_HOST` 并控制网络入口。
6. 在服务器私有路径签发初始化说明：`node --env-file=/etc/luli/luli.env scripts/create-admin-setup.mjs /etc/luli/admin-setup.txt`。管理员本人使用初始化码设置密码并绑定验证器，随后配置邮件服务、登记体验用户和平台模型。

API 默认依据实际 socket 地址限流。同机 Apache 会先删除客户端提供的转发 IP 并写入真实地址，此配置下可设置 `TRUST_PROXY_LOOPBACK=true`；服务只接受回环代理传来的单个合法 IP，覆盖内部身份头。不能在未经清理的代理链上启用该设置。

开发 PGlite 不会自动复制进 PostgreSQL。需要保留开发资料时导出 JSON，在正式账号经备份导入/本机迁移流程导入；备份不含模型密钥。

真实邮件投递、两台用户设备同步和真实模型调用需要在对应服务配置后验证。自动化验收使用独立 HTTP 会话、虚构资料和模拟邮件/模型，不消费正式初始化码，也不发送私人内容。服务器部署记录列出真实 PostgreSQL、HTTPS 和备份恢复检查结果。

## 代码与验证

核心代码：`server/cloud/`（认证、业务表、权限、同步、AI、管理），`src/lib/cloudSync.js`（缓存/冲突状态机），`src/components/account/`（登录、迁移、账号及后台）。

```powershell
npm test
npm run test:cloud
npm run test:sites
npm run build
```

测试无需 SMTP、Docker 或外部模型，使用内存 PGlite 和回环端口。`tests/fixtures/cloud-browser.mjs` 是独立浏览器验收的虚构账号环境，不能用于部署。

`tests/admin-setup.test.mjs` 也可通过 `LULI_TEST_DATABASE_URL` 指向空白、独立 PostgreSQL 数据库，名称必须以 `luli_test_` 开头。此测试会创建虚构账号和邮件设置，严禁指向正式数据库。

实现依据：[Better Auth 邮箱验证码](https://better-auth.com/docs/plugins/email-otp)、[二次验证](https://better-auth.com/docs/plugins/2fa)、[PostgreSQL 适配器](https://better-auth.com/docs/adapters/postgresql)、[OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)、[SSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)。

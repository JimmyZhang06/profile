# 履历 · Resume workspace

以简历为中心的项目素材、岗位匹配与编辑工作区。React 前端与独立 Node.js API，支持黑白主题、可调预览、富文本排版、版本记录与可插拔 AI。

在线地址：[打开履历](https://resume.jimmyzhang.xyz)，[管理后台](https://resume.jimmyzhang.xyz/admin)。已启用 HTTPS、独立 PostgreSQL 和账号后端；无需登录仍可本机编辑。管理员通过私有初始化说明设置密码和验证器，邮件服务可在后台配置后启用受邀用户登录。外部模型需另行配置。

[临时地址](https://resume-47-93-237-199.sslip.io) 继续保留。如曾在临时地址编辑资料，请先在「AI 与设置 → 本机数据」导出备份，再到正式地址导入；两个域名的浏览器数据不会自动共享。

## 本地开发

需要 Node.js 24 与 npm。

```sh
cd prototype
npm ci
npm run dev
```

开发访问 `http://127.0.0.1:4174`。示例经历均为虚构数据。

```sh
npm test
npm run test:sites
npm run build
```

## 发布模式

- **本机工作区**：显式设置 `CLOUD_ENABLED=false`。编辑、项目素材、模板、导入导出与内置整理在浏览器运行；服务器不初始化账号、数据库、邮件或外部模型代理。
- **个人云工作区**：默认开启。生产启动必须提供 PostgreSQL、HTTPS、管理员邮箱及独立密钥。支持邀请登录、账号隔离、冲突恢复、个人模型和独立管理后台。SMTP 可稍后在后台配置；未配置时不开放邮箱验证码登录。

部署说明见 [deploy/README.md](deploy/README.md)，完整账号及安全配置见 [prototype/CLOUD.md](prototype/CLOUD.md)。开发数据、私钥、真实凭据与参考截图不进入仓库。

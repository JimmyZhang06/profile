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

## 许可与原创署名

Copyright (c) 2026 JimmyZhang06。本仓库由作者提供的原创代码、文档和资源采用 **PolyForm Noncommercial License 1.0.0**，支持协议许可范围内的学习、研究、修改、分享和非商业使用。完整条款见 [LICENSE](LICENSE)。

复制或分发本项目的代码及其修改版时，须按协议保留 [NOTICE](NOTICE) 中的作者署名、原始仓库地址，以及许可证全文或其官方链接。原始仓库为 [JimmyZhang06/profile](https://github.com/JimmyZhang06/profile)。

商业使用需要事先取得作者的书面授权，包括对外收费部署、销售软件或基于本项目提供商业服务等用途。可通过原始仓库的 [Issues](https://github.com/JimmyZhang06/profile/issues) 联系作者，说明使用场景和授权需求。具体许可范围以 LICENSE 和另行取得的书面授权为准。

第三方组件和素材适用其各自的许可证及版权声明。用户自行填写、上传的内容按其各自权利归属处理，用户可正常编辑、导出和投递自己的简历。

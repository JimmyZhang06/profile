# 履历 · Resume workspace

以简历为中心的项目素材、岗位匹配与编辑工作区。React 前端与独立 Node.js API，支持黑白主题、可调预览、富文本排版、版本记录与可插拔 AI。

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
- **个人云工作区**：默认开启。生产启动必须提供 PostgreSQL、HTTPS、SMTP、管理员邮箱及独立密钥。支持邀请登录、账号隔离、冲突恢复、个人模型和独立管理后台。

部署说明见 [deploy/README.md](deploy/README.md)，完整账号及安全配置见 [prototype/CLOUD.md](prototype/CLOUD.md)。开发数据、私钥、真实凭据与参考截图不进入仓库。

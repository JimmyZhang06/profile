import { writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../server/cloud/config.mjs";
import { createCloudApp } from "../server/cloud/app.mjs";
import { issueBootstrap } from "../server/cloud/bootstrap.mjs";

const output = process.argv[2];
if (!output) throw new Error("请指定私有初始化说明文件的绝对路径。");
const config = await loadConfig();
if (!config.cloudEnabled) throw new Error("请先启用云端服务并配置数据库。");
const app = await createCloudApp(config);
try {
  const code = await issueBootstrap(app.db);
  await writeFile(
    resolve(output),
    [
      "履历管理后台 · 首次初始化",
      "",
      "地址：" + config.origin + "/admin",
      "管理员邮箱：" + config.adminEmail,
      "一次性初始化码：" + code.token,
      "失效时间：" + new Date(code.expiresAt).toISOString(),
      "",
      "打开后台，输入邮箱和初始化码，设置自己的管理员密码。",
      "随后绑定验证器并保存恢复代码，即可进入后台。",
      "初始化码只能使用一次；不要转发此文件或将它加入代码仓库。",
      "邮件服务可在后台的「邮件服务」页面配置。",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(resolve(output), 0o600);
  console.log("初始化说明已写入指定私有文件；有效期 24 小时。");
} finally {
  await app.close();
}

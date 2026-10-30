import { createServer } from "vite";
import { loadConfig } from "../server/cloud/config.mjs";
import { createCloudApp } from "../server/cloud/app.mjs";

const args = process.argv.slice(2),
  portIndex = args.indexOf("--port");
const port =
  portIndex >= 0
    ? Number(args[portIndex + 1])
    : Number(
        new URL(process.env.APP_ORIGIN || "http://127.0.0.1:4174").port || 4174,
      );
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("开发端口无效");
if (process.env.NODE_ENV === "production")
  throw new Error("正式环境请使用 npm start");
const config = await loadConfig({
  ...process.env,
  APP_ORIGIN: `http://127.0.0.1:${port}`,
});
let api,
  vite,
  closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await vite?.close();
  await api?.close();
}
try {
  api = await createCloudApp(config);
  await new Promise((resolve, reject) => {
    api.server.once("error", reject);
    api.server.listen(config.port, config.host, resolve);
  });
  vite = await createServer({
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await vite.listen();
  console.log(
    `履历工作区：http://127.0.0.1:${port}/\n独立管理后台：http://127.0.0.1:${port}/admin\nAPI：http://127.0.0.1:${config.port}`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await close();
      process.exit(0);
    });
} catch (error) {
  console.error("启动失败：", error.message);
  await close();
  process.exitCode = 1;
}

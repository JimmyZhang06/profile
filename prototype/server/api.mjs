import { loadConfig } from "./cloud/config.mjs";
try {
  process.loadEnvFile(".env");
} catch {
  /* Environment variables can also be supplied by deployment. */
}
const config = await loadConfig();
const app = config.cloudEnabled
  ? await (await import("./cloud/app.mjs")).createCloudApp(config)
  : await (await import("./local.mjs")).createLocalApp(config);
app.server.listen(config.port, config.host, () =>
  console.log(
    `履历 API 已启动：http://${config.host}:${config.port} · ${config.production ? "正式环境" : "本机开发环境"}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });

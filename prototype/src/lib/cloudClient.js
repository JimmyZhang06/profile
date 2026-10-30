export async function cloudRequest(
  path,
  { method = "GET", body, ownerId, signal } = {},
) {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Luli-Client": "workspace",
      ...(ownerId ? { "X-Luli-Account": ownerId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("无法连接账号服务，请稍后重试。");
  }
  if (!response.ok) {
    const error = new Error(data.error || data.message || "请求未完成");
    error.status = response.status;
    error.code = data.code;
    error.remote = data.remote;
    throw error;
  }
  return data;
}

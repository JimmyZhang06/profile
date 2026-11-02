// Shared syntax checks; the server separately resolves and pins public DNS addresses.
export function normalizeModelHost(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (host.length > 253 || !host.includes('.') || /[\s/:@?#*\\]/.test(host)) return null;
  const labels = host.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (!/^[a-z][a-z0-9-]*$/.test(labels.at(-1))) return null;
  if (['localhost', 'local', 'internal', 'lan'].includes(labels.at(-1))) return null;
  try { if (new URL('https://' + host).hostname !== host) return null; }
  catch { return null; }
  return host;
}

export function checkModelAddress(value, allowedHosts = []) {
  if (!value?.trim()) return { state: 'empty', message: '填写模型服务的完整 API 地址，例如 https://api.example.com/v1。' };
  let url;
  try { url = new URL(value.trim()); }
  catch { return { state: 'invalid', message: '请输入完整的 HTTPS 地址。' }; }
  const host = normalizeModelHost(url.hostname);
  if (url.protocol !== 'https:' || !host || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) {
    return { state: 'invalid', message: '使用公网 HTTPS 域名和默认端口；地址中不能包含密钥、账号或查询参数。' };
  }
  const baseUrl = url.href.replace(/\/+$/, '');
  return allowedHosts.includes(host)
    ? { state: 'allowed', host, baseUrl, message: `${host} 已允许，保存后可测试连接。` }
    : { state: 'blocked', host, baseUrl, message: `${host} 尚未允许，请先在“允许域名”中添加。` };
}

export function modelTestFailure(error) {
  const messages = {
    PROVIDER_401: '模型服务拒绝认证，请检查 API Key。',
    PROVIDER_403: '当前凭据没有模型访问权限，请检查服务商的授权设置。',
    PROVIDER_404: '未找到模型接口，请检查 API 地址的路径与模型 ID。',
    PROVIDER_429: '模型服务限流或额度不足，请检查服务商额度后重试。',
    INVALID_MODEL_RESPONSE: '服务未返回有效的模型回复，请检查模型 ID 与接口兼容性。',
    MODEL_TEST_TIMEOUT: '20 秒内未收到模型回复，请检查服务状态后重试。',
  };
  return messages[error.code] || error.message;
}

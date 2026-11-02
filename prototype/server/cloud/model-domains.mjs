import { lookup } from 'node:dns/promises';
import { one, query } from './database.mjs';
import { assert, audit, publicAddress, HttpError } from './security.mjs';
import { normalizeModelHost } from '../../src/lib/modelDestination.js';

const key = 'model-domains';
export async function readModelDomains(db, config) {
  const row = await one(db, 'SELECT data,revision,updated_at FROM platform_settings WHERE key=$1', [key]);
  return {
    hosts: row ? row.data.hosts : (config.allowedModelHosts || []),
    revision: row?.revision || 0,
    source: row ? 'admin' : 'deployment',
    updatedAt: row?.updated_at || null,
  };
}

export async function modelDomainSettings(db, config) {
  const settings = await readModelDomains(db, config);
  // Aggregate counts only. No personal names, credentials or workspace data leave this endpoint.
  const rows = await query(db, "SELECT data->>'baseUrl' AS url,scope,COUNT(*)::int AS count FROM model_connections GROUP BY data->>'baseUrl',scope");
  const usage = {};
  for (const row of rows) {
    let host;
    try { host = new URL(row.url).hostname; } catch { continue; }
    const counts = usage[host] ||= { platform: 0, personal: 0 };
    counts[row.scope === 'platform' ? 'platform' : 'personal'] += row.count;
  }
  return { ...settings, usage };
}

async function checkPublicHost(host, resolve) {
  let addresses;
  try { addresses = await resolve(host, { all: true, verbatim: true }); }
  catch { throw new HttpError(400, `${host} 无法解析，请检查域名后重试。`, 'DOMAIN_UNRESOLVED'); }
  assert(addresses.length && addresses.every(item => publicAddress(item.address)), 400,
    `${host} 解析到了内网或保留地址，不能添加。`, 'DESTINATION_BLOCKED');
}

export async function saveModelDomains(db, config, body, actor) {
  assert(Array.isArray(body.hosts) && body.hosts.length <= 100, 400, '最多允许 100 个模型服务域名。');
  const hosts = body.hosts.map(value => {
    const host = normalizeModelHost(value);
    assert(host, 400, '请填写完整域名，不含协议、路径、端口或通配符。', 'INVALID_DOMAIN');
    return host;
  });
  assert(new Set(hosts).size === hosts.length, 400, '域名列表中有重复项。');
  assert(Number.isInteger(body.revision) && body.revision >= 0, 400, '配置版本无效，请重新载入。');
  assert(typeof body.reason === 'string' && body.reason.trim().length >= 2 && body.reason.length <= 500, 400, '请填写操作原因。');
  const previous = await readModelDomains(db, config);
  // Removing an unavailable provider must not require its DNS to be healthy.
  for (const host of hosts.filter(host => !previous.hosts.includes(host))) {
    await checkPublicHost(host, config.modelLookup || lookup);
  }
  await db.transaction().execute(async tx => {
    await query(tx, 'INSERT INTO platform_settings(key,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
      [key, JSON.stringify({ hosts: config.allowedModelHosts || [] })]);
    const current = await one(tx, 'SELECT data,revision FROM platform_settings WHERE key=$1 FOR UPDATE', [key]);
    assert(body.revision === current.revision, 409, '域名设置已被其他页面更新。你的输入仍保留，请载入最新配置后再修改。', 'SETTINGS_CONFLICT');
    await audit(tx, actor, 'model.domains.save', key,
      { hosts: current.data.hosts, revision: current.revision },
      { hosts, revision: current.revision + 1 }, body.reason);
    await query(tx, 'UPDATE platform_settings SET data=$2::jsonb,revision=revision+1,updated_at=NOW() WHERE key=$1', [key, JSON.stringify({ hosts })]);
  });
  return modelDomainSettings(db, config);
}

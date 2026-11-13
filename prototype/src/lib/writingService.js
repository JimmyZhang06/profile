// Older workspaces used "offline" as both the initial chat binding and a chat
// preference. Their JD flow independently offered the available online service.
export function writingConnectionId(settings, { preferredId, tailoring = false } = {}) {
  const binding = settings.bindings.rewrite;
  if (!settings.enabled || !settings.capabilities.rewrite || binding === 'local-only') return 'offline';
  const available = settings.connections.filter(service => service.enabled !== false);
  const choice = preferredId ?? (binding === 'offline' && tailoring ? 'auto' : binding);
  if (choice && choice !== 'auto') return available.find(service => service.id === choice)?.id ?? 'offline';
  const platform = available.find(service => service.source === 'platform');
  if (platform) return platform.id;
  // Before automatic routing, a single personal service was offered by default
  // for a JD. Sending still requires the explicitly labelled generation action.
  return tailoring && available.length === 1 ? available[0].id : 'offline';
}

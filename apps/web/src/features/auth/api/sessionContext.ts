let currentSessionKey: string | null = null;
let currentTenantId: string | null = null;

export function getCurrentSessionKey(): string | null {
  return currentSessionKey;
}

export function getCurrentSessionContext(): { tenantId: string; sessionKey: string } | null {
  if (!currentTenantId || !currentSessionKey) return null;
  return {
    tenantId: currentTenantId,
    sessionKey: currentSessionKey,
  };
}

export function setSessionContext(tenantId: string | null, sessionKey: string | null) {
  currentTenantId = tenantId;
  currentSessionKey = sessionKey;
}

export function resetTenantTracker(
  sessionKey: string | null = null,
  tenantId: string | null = null,
) {
  currentSessionKey = sessionKey;
  currentTenantId = tenantId ?? (sessionKey ? (sessionKey.split(":")[0] ?? null) : null);
}

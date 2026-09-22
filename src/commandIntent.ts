type StoredCommandIntent = {
  commandId: string;
  fingerprint: string;
};

const prefix = "ccvi:unresolved-command:";

const newCommandId = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error("SECURE_RANDOM_UNAVAILABLE");
  return globalThis.crypto.randomUUID();
};

const storage = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
};

export const getOrCreateCommandIntent = (scope: string, fingerprint: string) => {
  const key = `${prefix}${scope}`;
  const target = storage();
  if (target) {
    try {
      const parsed = JSON.parse(target.getItem(key) ?? "null") as StoredCommandIntent | null;
      if (parsed?.fingerprint === fingerprint && typeof parsed.commandId === "string") return parsed.commandId;
    } catch {
      // A malformed local value is not an authoritative command receipt.
    }
  }
  const commandId = newCommandId();
  target?.setItem(key, JSON.stringify({ commandId, fingerprint } satisfies StoredCommandIntent));
  return commandId;
};

export const clearCommandIntent = (scope: string, commandId: string) => {
  const key = `${prefix}${scope}`;
  const target = storage();
  if (!target) return;
  try {
    const parsed = JSON.parse(target.getItem(key) ?? "null") as StoredCommandIntent | null;
    if (parsed?.commandId === commandId) target.removeItem(key);
  } catch {
    target.removeItem(key);
  }
};

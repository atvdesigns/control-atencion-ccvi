import type { PublicDisplayEntry } from "./types";

type DisplayCandidate = {
  entry: PublicDisplayEntry;
  canonical: boolean;
};

export const publicDisplayEntriesFromSnapshot = (value: unknown): PublicDisplayEntry[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const byPublicCode = new Map<string, DisplayCandidate>();

  for (const [projectionKey, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const projection = candidate as Record<string, unknown>;
    if (
      typeof projection.publicCode !== "string" ||
      typeof projection.isPriority !== "boolean" ||
      typeof projection.status !== "string" ||
      typeof projection.destination !== "string" ||
      typeof projection.updatedAt !== "number"
    ) continue;

    const entry: PublicDisplayEntry = {
      publicCode: projection.publicCode,
      isPriority: projection.isPriority,
      status: projection.status,
      destination: projection.destination,
      updatedAt: projection.updatedAt,
    };
    const canonical = projectionKey === entry.publicCode;
    const current = byPublicCode.get(entry.publicCode);
    if (!current || canonical) byPublicCode.set(entry.publicCode, { entry, canonical });
  }

  return [...byPublicCode.values()].map(({ entry }) => entry);
};

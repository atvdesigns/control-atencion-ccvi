#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const ACTIVE_STATES = new Set([
  "called_to_window",
  "in_document_validation",
  "called_to_cashier",
  "in_cashier_attention",
]);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const valuesOf = (value) => isRecord(value) ? Object.values(value) : Array.isArray(value) ? value : [];
const safePublicCode = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const stableJson = (value) => JSON.stringify(value, Object.keys(value || {}).sort());

const publicProjectionForCase = (caseRecord, center) => {
  if (!isRecord(caseRecord) || !ACTIVE_STATES.has(caseRecord.currentState) || !safePublicCode(caseRecord.publicCode) ||
    typeof caseRecord.isPriority !== "boolean" || typeof caseRecord.updatedAt !== "number") return null;

  if (["called_to_window", "in_document_validation"].includes(caseRecord.currentState)) {
    if (!Number.isInteger(caseRecord.assignedWindowNumber)) return null;
    const destination = `Ventanilla ${caseRecord.assignedWindowNumber}`;
    return {
      publicCode: caseRecord.publicCode,
      isPriority: caseRecord.isPriority,
      status: caseRecord.currentState === "called_to_window" ? `Diríjase a ${destination}` : "Atención en ventanilla",
      destination,
      updatedAt: caseRecord.updatedAt,
    };
  }

  const cashier = valuesOf(center?.cashiers).find((item) => isRecord(item) && item.cashierId === caseRecord.cashierId);
  if (!cashier || typeof cashier.name !== "string" || !cashier.name.trim()) return null;
  return {
    publicCode: caseRecord.publicCode,
    isPriority: caseRecord.isPriority,
    status: caseRecord.currentState === "called_to_cashier" ? `Diríjase a ${cashier.name}` : "Atención en caja",
    destination: cashier.name,
    updatedAt: caseRecord.updatedAt,
  };
};

const legacyRecord = (kind, centerId, dayId, key, payload) => ({ kind, centerId, dayId, key, payload });

const planLegacyDisplayMigration = ({ displays, days, centers }) => {
  displays = isRecord(displays) ? displays : {};
  days = isRecord(days) ? days : {};
  centers = isRecord(centers) ? centers : {};
  const records = [];
  const collisions = [];
  const batches = {};

  for (const [centerId, centerDays] of Object.entries(displays)) {
    if (!isRecord(centerDays)) continue;
    for (const [dayId, dayDisplays] of Object.entries(centerDays)) {
      if (!isRecord(dayDisplays)) continue;
      for (const [key, payload] of Object.entries(dayDisplays)) {
        if (key === "cases") {
          if (isRecord(payload)) for (const [caseId, nested] of Object.entries(payload)) {
            records.push(legacyRecord("LEGACY_CASES", centerId, dayId, caseId, nested));
          }
          continue;
        }
        const kind = isRecord(payload) && key === payload.publicCode ? "CANONICAL" : "LEGACY_ROOT";
        records.push(legacyRecord(kind, centerId, dayId, key, payload));
      }
    }
  }

  for (const [centerId, centerDays] of Object.entries(days)) {
    if (!isRecord(centerDays)) continue;
    for (const [dayId, day] of Object.entries(centerDays)) {
      const byCode = new Map();
      for (const [caseKey, item] of Object.entries(isRecord(day?.cases) ? day.cases : {})) {
        if (!isRecord(item) || !safePublicCode(item.publicCode)) continue;
        const list = byCode.get(item.publicCode) || [];
        list.push(caseKey);
        byCode.set(item.publicCode, list);
      }
      for (const [publicCode, caseKeys] of byCode) if (caseKeys.length > 1) {
        collisions.push({ centerId, dayId, publicCode, count: caseKeys.length });
      }
    }
  }

  const canonicalByDayAndCode = new Map();
  for (const record of records) if (record.kind === "CANONICAL" && isRecord(record.payload)) {
    canonicalByDayAndCode.set(`${record.centerId}/${record.dayId}/${record.key}`, record);
  }

  let authoritativeMatches = 0;
  let activeLegacy = 0;
  let stale = 0;
  const projectionGroups = new Map();
  for (const record of records) if (isRecord(record.payload) && safePublicCode(record.payload.publicCode)) {
    const groupKey = `${record.centerId}/${record.dayId}/${record.payload.publicCode}`;
    projectionGroups.set(groupKey, (projectionGroups.get(groupKey) || 0) + 1);
  }
  const duplicate = [...projectionGroups.values()].filter((count) => count > 1).length;
  let invalidOrphan = 0;
  let staleLegacyToDelete = 0;
  let compatibilityToRemove = 0;
  let canonicalCreates = 0;
  let canonicalUpdates = 0;
  let canonicalDeletes = 0;
  let legacyDeletes = 0;
  const legacyDays = new Set();
  const legacy = records.filter((record) => record.kind !== "CANONICAL");
  const plannedCanonicalCreates = new Set();
  const plannedCanonicalUpdates = new Set();
  const plannedCanonicalDeletes = new Set();

  const ensureBatch = (centerId, dayId) => {
    const id = `${centerId}/${dayId}`;
    if (!batches[id]) batches[id] = { centerId, dayId, updates: {} };
    return batches[id];
  };

  for (const record of legacy) {
    legacyDays.add(`${record.centerId}/${record.dayId}`);
    const payload = record.payload;
    const authoritative = days?.[record.centerId]?.[record.dayId]?.cases?.[record.key];
    const mapped = isRecord(payload) && safePublicCode(payload.publicCode) && isRecord(authoritative) &&
      authoritative.caseId === record.key && authoritative.centerId === record.centerId &&
      authoritative.publicCode === payload.publicCode;
    if (!mapped) {
      record.classification = "INVALID_ORPHAN";
      invalidOrphan += 1;
      continue;
    }
    authoritativeMatches += 1;
    const canonical = canonicalByDayAndCode.get(`${record.centerId}/${record.dayId}/${authoritative.publicCode}`);
    const desired = publicProjectionForCase(authoritative, centers[record.centerId]);
    const batch = ensureBatch(record.centerId, record.dayId);
    const legacyPath = record.kind === "LEGACY_CASES" ? `cases/${record.key}` : record.key;
    batch.updates[legacyPath] = null;
    legacyDeletes += 1;
    if (record.kind === "LEGACY_CASES") compatibilityToRemove += 1;

    if (desired) {
      record.classification = "ACTIVE_LEGACY";
      activeLegacy += 1;
      if (!canonical) {
        batch.updates[authoritative.publicCode] = desired;
        const target = `${record.centerId}/${record.dayId}/${authoritative.publicCode}`;
        if (!plannedCanonicalCreates.has(target)) {
          plannedCanonicalCreates.add(target);
          canonicalCreates += 1;
        }
      } else if (stableJson(canonical.payload) !== stableJson(desired)) {
        batch.updates[authoritative.publicCode] = desired;
        const target = `${record.centerId}/${record.dayId}/${authoritative.publicCode}`;
        if (!plannedCanonicalUpdates.has(target)) {
          plannedCanonicalUpdates.add(target);
          canonicalUpdates += 1;
        }
      }
    } else {
      record.classification = "STALE";
      stale += 1;
      staleLegacyToDelete += 1;
      if (canonical && batch.updates[authoritative.publicCode] !== null) {
        batch.updates[authoritative.publicCode] = null;
        const target = `${record.centerId}/${record.dayId}/${authoritative.publicCode}`;
        if (!plannedCanonicalDeletes.has(target)) {
          plannedCanonicalDeletes.add(target);
          canonicalDeletes += 1;
        }
      }
    }
  }

  for (const record of records.filter((item) => item.kind === "CANONICAL")) {
    const candidates = Object.values(days?.[record.centerId]?.[record.dayId]?.cases || {})
      .filter((item) => isRecord(item) && item.publicCode === record.key);
    if (candidates.length !== 1) {
      record.classification = "INVALID_ORPHAN";
      invalidOrphan += 1;
    } else if (!publicProjectionForCase(candidates[0], centers[record.centerId])) {
      record.classification = "STALE";
      stale += 1;
    } else record.classification = "CANONICAL";
  }

  const actionableBatches = Object.values(batches).filter((batch) => Object.keys(batch.updates).length > 0);
  return {
    summary: {
      totalPublicDisplayRecords: records.length,
      canonical: records.filter((record) => record.kind === "CANONICAL").length,
      legacyRoot: records.filter((record) => record.kind === "LEGACY_ROOT").length,
      legacyCases: records.filter((record) => record.kind === "LEGACY_CASES").length,
      stale,
      duplicate,
      invalidOrphan,
      legacyDays: legacyDays.size,
      authoritativeMatches,
      authoritativeTotal: legacy.length,
      publicCodeCollisions: collisions.length,
      activeLegacyToMigrate: activeLegacy,
      staleLegacyToDelete,
      compatibilityToRemove,
      canonicalRecordsToCreate: canonicalCreates,
      canonicalRecordsToUpdate: canonicalUpdates,
      canonicalRecordsToDelete: canonicalDeletes,
      legacyRecordsToDelete: legacyDeletes,
    },
    collisions,
    batches: actionableBatches,
    safeForMigration: collisions.length === 0 && invalidOrphan === 0,
  };
};

const parseArgs = (argv) => {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply" || arg === "--firebase-cli-session") flags.set(arg.slice(2), true);
    else if (arg.startsWith("--")) flags.set(arg.slice(2), argv[++i]);
  }
  return flags;
};

const loadJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));

const firebaseCliCredential = () => {
  const configPath = path.join(os.homedir(), ".config/configstore/firebase-tools.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const accessToken = config?.tokens?.access_token;
  const expiresAt = Number(config?.tokens?.expires_at);
  if (typeof accessToken !== "string" || !accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) {
    throw new Error("Firebase CLI session is unavailable or expired");
  }
  return {
    getAccessToken: async () => ({ access_token: accessToken, expires_in: Math.max(60, Math.floor((expiresAt - Date.now()) / 1000)) }),
  };
};

const loadLive = async (projectId, useFirebaseCliSession) => {
  const requireFromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
  const { applicationDefault, getApps, initializeApp } = requireFromFunctions("firebase-admin/app");
  const { getDatabase } = requireFromFunctions("firebase-admin/database");
  const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
  const credential = useFirebaseCliSession ? firebaseCliCredential() : applicationDefault();
  const app = getApps()[0] || initializeApp({ credential, databaseURL, projectId });
  if (app.options.projectId !== projectId || app.options.databaseURL !== databaseURL) throw new Error("Firebase target mismatch");
  const snapshot = await getDatabase(app).ref().get();
  const root = snapshot.val() || {};
  return { displays: root.public?.displays || {}, days: root.days || {}, centers: root.centers || {}, database: getDatabase(app) };
};

const main = async () => {
  const flags = parseArgs(process.argv.slice(2));
  const apply = flags.get("apply") === true;
  const projectId = flags.get("project");
  const centerId = flags.get("center");
  if (!projectId) throw new Error("--project is required");
  const snapshotMode = flags.has("displays") || flags.has("days") || flags.has("centers");
  if (snapshotMode && !(flags.has("displays") && flags.has("days") && flags.has("centers"))) {
    throw new Error("Snapshot dry-run requires --displays, --days and --centers");
  }
  if (apply && snapshotMode) throw new Error("--apply requires live Admin SDK access; snapshot application is forbidden");
  if (apply && !centerId) throw new Error("--apply requires an explicit --center");

  const source = snapshotMode ? {
    displays: loadJson(flags.get("displays")), days: loadJson(flags.get("days")), centers: loadJson(flags.get("centers")),
    database: null,
  } : await loadLive(projectId, flags.get("firebase-cli-session") === true);
  if (centerId) {
    source.displays = source.displays?.[centerId] ? { [centerId]: source.displays[centerId] } : {};
    source.days = source.days?.[centerId] ? { [centerId]: source.days[centerId] } : {};
    source.centers = source.centers?.[centerId] ? { [centerId]: source.centers[centerId] } : {};
  }
  const plan = planLegacyDisplayMigration(source);
  if (apply) {
    if (!plan.safeForMigration) throw new Error("Migration blocked by collision or orphan safety gate");
    if (plan.batches.some((batch) => batch.centerId !== centerId)) throw new Error("Migration center mismatch");
    for (const batch of plan.batches) {
      await source.database.ref(`public/displays/${batch.centerId}/${batch.dayId}`).update(batch.updates);
    }
  }
  process.stdout.write(`${JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    projectId,
    centerId: centerId || "ALL",
    summary: plan.summary,
    safeForMigration: plan.safeForMigration,
    atomicCenterDayBatches: plan.batches.length,
  }, null, 2)}\n`);
};

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { ACTIVE_STATES, planLegacyDisplayMigration, publicProjectionForCase };

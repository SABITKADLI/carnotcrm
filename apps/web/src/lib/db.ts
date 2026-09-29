import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import type { Base, Entities, Kind, Role, Settings, User } from "./types";

type StoredUser = User & { password: string };
type SessionRecord = { token: string; userId: string; expires: number };
type LoginAttempt = { key: string; attempts: number; reset: number };
type OperationRecord = {
  id: string;
  actor: string;
  payload: string;
  result: string;
  created: number;
};

type Store = {
  entities: Map<Kind, Map<string, Entities[Kind]>>;
  users: StoredUser[];
  sessions: SessionRecord[];
  attempts: LoginAttempt[];
  operations: OperationRecord[];
  settings?: Settings;
  dirtyEntities: Set<string>;
  dirtyUsers: Set<string>;
  dirtySessions: Set<string>;
  deletedSessions: Set<string>;
  dirtyAttempts: Set<string>;
  deletedAttempts: Set<string>;
  dirtyOperations: Set<string>;
  settingsDirty: boolean;
};

const kinds: Kind[] = [
  "contacts",
  "fabrics",
  "purchases",
  "orders",
  "jobs",
  "products",
  "invoices",
  "payments",
  "movements",
  "activities",
];

const defaults: Settings = {
  companyName: "Carnot",
  email: "",
  phone: "",
  address: "",
  taxId: "",
  currency: "INR",
  taxRate: 0,
  invoicePrefix: "INV",
  paymentDetails: "",
};

const storage = new AsyncLocalStorage<Store>();
const globalState = globalThis as unknown as {
  carnotDb?: DatabaseSync;
  carnotPool?: Pool;
  carnotReady?: Promise<void>;
};

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function isPostgres() {
  return !!databaseUrl();
}

function pool() {
  if (!globalState.carnotPool)
    globalState.carnotPool = new Pool({ connectionString: databaseUrl() });
  return globalState.carnotPool;
}

async function ensurePostgres() {
  if (!globalState.carnotReady) {
    globalState.carnotReady = (async () => {
      await pool().query(`
        CREATE TABLE IF NOT EXISTS entities (
          kind text NOT NULL,
          id text NOT NULL,
          data jsonb NOT NULL,
          PRIMARY KEY(kind,id)
        );
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          name text NOT NULL,
          email text NOT NULL UNIQUE,
          role text NOT NULL CHECK(role IN ('admin','tailor')),
          password text NOT NULL,
          active boolean NOT NULL DEFAULT true
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          id integer PRIMARY KEY CHECK(id=1),
          data jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS operations (
          id text PRIMARY KEY,
          actor text NOT NULL,
          payload text NOT NULL,
          result text NOT NULL,
          created bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
          key text PRIMARY KEY,
          attempts integer NOT NULL,
          reset bigint NOT NULL
        );
      `);
    })();
  }
  await globalState.carnotReady;
}

function defaultDatabasePath() {
  if (process.env.VERCEL)
    throw new Error(
      "DATABASE_URL is required in production. Attach Neon storage to the Vercel project and redeploy.",
    );
  return resolve(process.cwd(), "data/carnot.sqlite");
}

export function db() {
  if (!globalState.carnotDb) {
    const path = process.env.CRM_DATABASE_PATH || defaultDatabasePath();
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const connection = new DatabaseSync(path);
    connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('admin','tailor')), password TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, actor TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    globalState.carnotDb = connection;
  }
  return globalState.carnotDb;
}

function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? JSON.parse(value) : (value as T);
}

function fromStore<K extends Kind>(store: Store, kind: K) {
  if (!store.entities.has(kind)) store.entities.set(kind, new Map());
  return store.entities.get(kind)! as Map<string, Entities[K]>;
}

function activeStore() {
  const store = storage.getStore();
  if (!store && isPostgres())
    throw new Error("Database access must run inside a Neon request context");
  return store;
}

async function loadStore(client: PoolClient): Promise<Store> {
  await ensurePostgres();
  const [entities, usersRows, sessionsRows, settingsRows, operationRows, attemptsRows] =
    await Promise.all([
      client.query("SELECT kind,id,data FROM entities"),
      client.query(
        "SELECT id,name,email,role,password,active FROM users ORDER BY name",
      ),
      client.query("SELECT token,user_id,expires FROM sessions"),
      client.query("SELECT data FROM settings WHERE id=1"),
      client.query("SELECT id,actor,payload,result,created FROM operations"),
      client.query("SELECT key,attempts,reset FROM login_attempts"),
    ]);
  const entitiesByKind = new Map<Kind, Map<string, Entities[Kind]>>();
  for (const kind of kinds) entitiesByKind.set(kind, new Map());
  for (const row of entities.rows as {
    kind: Kind;
    id: string;
    data: unknown;
  }[]) {
    if (kinds.includes(row.kind))
      entitiesByKind.get(row.kind)!.set(row.id, parseJson(row.data));
  }
  return {
    entities: entitiesByKind,
    users: (usersRows.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      role: row.role as Role,
      password: String(row.password),
      active: row.active === true || row.active === 1,
    })),
    sessions: (sessionsRows.rows as Record<string, unknown>[]).map((row) => ({
      token: String(row.token),
      userId: String(row.user_id),
      expires: Number(row.expires),
    })),
    attempts: (attemptsRows.rows as Record<string, unknown>[]).map((row) => ({
      key: String(row.key),
      attempts: Number(row.attempts),
      reset: Number(row.reset),
    })),
    operations: (operationRows.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      actor: String(row.actor),
      payload: String(row.payload),
      result: String(row.result),
      created: Number(row.created),
    })),
    settings: settingsRows.rows[0]?.data
      ? parseJson<Settings>(settingsRows.rows[0].data)
      : undefined,
    dirtyEntities: new Set(),
    dirtyUsers: new Set(),
    dirtySessions: new Set(),
    deletedSessions: new Set(),
    dirtyAttempts: new Set(),
    deletedAttempts: new Set(),
    dirtyOperations: new Set(),
    settingsDirty: false,
  };
}

async function commitStore(client: PoolClient, store: Store) {
  for (const key of store.dirtyEntities) {
    const [kind, id] = key.split(":", 2) as [Kind, string];
    await client.query(
      "INSERT INTO entities(kind,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      [kind, id, JSON.stringify(fromStore(store, kind).get(id))],
    );
  }
  for (const userId of store.dirtyUsers) {
    const user = store.users.find((candidate) => candidate.id === userId);
    if (!user) continue;
    await client.query(
      `INSERT INTO users(id,name,email,role,password,active)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,email=excluded.email,role=excluded.role,password=excluded.password,active=excluded.active`,
      [user.id, user.name, user.email, user.role, user.password, user.active],
    );
  }
  for (const token of store.deletedSessions)
    await client.query("DELETE FROM sessions WHERE token=$1", [token]);
  for (const token of store.dirtySessions) {
    const session = store.sessions.find((candidate) => candidate.token === token);
    if (!session) continue;
    await client.query(
      "INSERT INTO sessions(token,user_id,expires) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,expires=excluded.expires",
      [session.token, session.userId, session.expires],
    );
  }
  for (const key of store.deletedAttempts)
    await client.query("DELETE FROM login_attempts WHERE key=$1", [key]);
  for (const key of store.dirtyAttempts) {
    const attempt = store.attempts.find((candidate) => candidate.key === key);
    if (!attempt) continue;
    await client.query(
      "INSERT INTO login_attempts(key,attempts,reset) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,reset=excluded.reset",
      [attempt.key, attempt.attempts, attempt.reset],
    );
  }
  for (const operationId of store.dirtyOperations) {
    const operation = store.operations.find(
      (candidate) => candidate.id === operationId,
    );
    if (!operation) continue;
    await client.query(
      "INSERT INTO operations(id,actor,payload,result,created) VALUES($1,$2,$3,$4,$5)",
      [
        operation.id,
        operation.actor,
        operation.payload,
        operation.result,
        operation.created,
      ],
    );
  }
  if (store.settingsDirty)
    await client.query(
      "INSERT INTO settings(id,data) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      [JSON.stringify(store.settings || defaults)],
    );
}

export function withStore<T>(fn: () => T): T | Promise<T> {
  if (!isPostgres()) return fn();
  return (async () => {
    const client = await pool().connect();
    try {
      const store = await loadStore(client);
      return storage.run(store, fn);
    } finally {
      client.release();
    }
  })();
}

export function all<K extends Kind>(kind: K): Entities[K][] {
  const store = activeStore();
  if (store)
    return [...fromStore(store, kind).values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  return db()
    .prepare(
      "SELECT data FROM entities WHERE kind=? ORDER BY json_extract(data,'$.createdAt') DESC",
    )
    .all(kind)
    .map((r) => JSON.parse(r.data as string));
}

export function get<K extends Kind>(kind: K, id: string): Entities[K] {
  const store = activeStore();
  if (store) {
    const record = fromStore(store, kind).get(id);
    if (!record) throw new Error(`${kind.slice(0, -1)} not found`);
    return record;
  }
  const row = db()
    .prepare("SELECT data FROM entities WHERE kind=? AND id=?")
    .get(kind, id);
  if (!row) throw new Error(`${kind.slice(0, -1)} not found`);
  return JSON.parse(row.data as string);
}

export function put<K extends Kind>(kind: K, value: Entities[K]): Entities[K] {
  const record = { ...value, updatedAt: new Date().toISOString() };
  const store = activeStore();
  if (store) {
    fromStore(store, kind).set(record.id, record);
    store.dirtyEntities.add(`${kind}:${record.id}`);
    return record;
  }
  db()
    .prepare(
      "INSERT INTO entities(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
    )
    .run(kind, record.id, JSON.stringify(record));
  return record;
}

export function base(prefix: string): Base {
  const now = new Date().toISOString();
  return { id: `${prefix}_${randomUUID()}`, createdAt: now, updatedAt: now };
}

export function transaction<T>(fn: () => T): T | Promise<T> {
  if (isPostgres()) {
    return (async () => {
      const client = await pool().connect();
      try {
        await ensurePostgres();
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('carnotcrm'))");
        const store = await loadStore(client);
        const result = storage.run(store, fn);
        await commitStore(client, store);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    })();
  }
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function sequence(kind: Kind, prefix: string) {
  return `${prefix}-${String(all(kind).length + 1).padStart(4, "0")}`;
}

export function settings(): Settings {
  const store = activeStore();
  if (store) return store.settings || defaults;
  const row = db().prepare("SELECT data FROM settings WHERE id=1").get();
  return row ? JSON.parse(row.data as string) : defaults;
}

export function saveSettings(value: Settings) {
  const store = activeStore();
  if (store) {
    store.settings = value;
    store.settingsDirty = true;
    return;
  }
  db()
    .prepare(
      "INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(JSON.stringify(value));
}

export function storedUsers(): StoredUser[] {
  const store = activeStore();
  if (store) return store.users;
  return db()
    .prepare("SELECT id,name,email,role,password,active FROM users ORDER BY name")
    .all()
    .map((row) => ({ ...row, active: !!row.active })) as unknown as StoredUser[];
}

export function saveUser(user: StoredUser) {
  const store = activeStore();
  if (store) {
    const index = store.users.findIndex((candidate) => candidate.id === user.id);
    if (index >= 0) store.users[index] = user;
    else store.users.push(user);
    store.users.sort((a, b) => a.name.localeCompare(b.name));
    store.dirtyUsers.add(user.id);
    return;
  }
  db()
    .prepare(
      `INSERT INTO users(id,name,email,role,password,active)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,email=excluded.email,role=excluded.role,password=excluded.password,active=excluded.active`,
    )
    .run(user.id, user.name, user.email, user.role, user.password, user.active ? 1 : 0);
}

export function sessions() {
  const store = activeStore();
  if (store) return store.sessions;
  return db()
    .prepare("SELECT token,user_id AS userId,expires FROM sessions")
    .all() as unknown as SessionRecord[];
}

export function saveSession(session: SessionRecord) {
  const store = activeStore();
  if (store) {
    store.sessions = store.sessions.filter(
      (candidate) => candidate.token !== session.token,
    );
    store.sessions.push(session);
    store.dirtySessions.add(session.token);
    store.deletedSessions.delete(session.token);
    return;
  }
  db()
    .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)")
    .run(session.token, session.userId, session.expires);
}

export function deleteSession(token: string) {
  const store = activeStore();
  if (store) {
    store.sessions = store.sessions.filter((session) => session.token !== token);
    store.deletedSessions.add(token);
    store.dirtySessions.delete(token);
    return;
  }
  db().prepare("DELETE FROM sessions WHERE token=?").run(token);
}

export function deleteSessionsForUser(userId: string) {
  for (const session of sessions().filter((candidate) => candidate.userId === userId))
    deleteSession(session.token);
}

export function deleteExpiredSessions(now = Date.now()) {
  for (const session of sessions().filter((candidate) => candidate.expires < now))
    deleteSession(session.token);
}

export function attempts() {
  const store = activeStore();
  if (store) return store.attempts;
  return db()
    .prepare("SELECT key,attempts,reset FROM login_attempts")
    .all() as unknown as LoginAttempt[];
}

export function saveAttempt(attempt: LoginAttempt) {
  const store = activeStore();
  if (store) {
    store.attempts = store.attempts.filter(
      (candidate) => candidate.key !== attempt.key,
    );
    store.attempts.push(attempt);
    store.dirtyAttempts.add(attempt.key);
    store.deletedAttempts.delete(attempt.key);
    return;
  }
  db()
    .prepare(
      "INSERT INTO login_attempts(key,attempts,reset) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,reset=excluded.reset",
    )
    .run(attempt.key, attempt.attempts, attempt.reset);
}

export function deleteAttempt(key: string) {
  const store = activeStore();
  if (store) {
    store.attempts = store.attempts.filter((attempt) => attempt.key !== key);
    store.deletedAttempts.add(key);
    store.dirtyAttempts.delete(key);
    return;
  }
  db().prepare("DELETE FROM login_attempts WHERE key=?").run(key);
}

export function deleteExpiredAttempts(now = Date.now()) {
  for (const attempt of attempts().filter((candidate) => candidate.reset < now))
    deleteAttempt(attempt.key);
}

export function operation(id: string) {
  const store = activeStore();
  if (store) return store.operations.find((candidate) => candidate.id === id);
  return db()
    .prepare("SELECT actor,payload,result FROM operations WHERE id=?")
    .get(id) as OperationRecord | undefined;
}

export function saveOperation(operation: OperationRecord) {
  const store = activeStore();
  if (store) {
    store.operations.push(operation);
    store.dirtyOperations.add(operation.id);
    return;
  }
  db()
    .prepare(
      "INSERT INTO operations(id,actor,payload,result,created) VALUES(?,?,?,?,?)",
    )
    .run(
      operation.id,
      operation.actor,
      operation.payload,
      operation.result,
      operation.created,
    );
}

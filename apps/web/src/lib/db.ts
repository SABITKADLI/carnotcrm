import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Base, Entities, Kind, Settings } from "./types";

const globalDb = globalThis as unknown as { carnotDb?: DatabaseSync };
export function db() {
  if (!globalDb.carnotDb) {
    const path =
      process.env.CRM_DATABASE_PATH ||
      resolve(process.cwd(), "data/carnot.sqlite");
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
    globalDb.carnotDb = connection;
  }
  return globalDb.carnotDb;
}
export function all<K extends Kind>(kind: K): Entities[K][] {
  return db()
    .prepare(
      "SELECT data FROM entities WHERE kind=? ORDER BY json_extract(data,'$.createdAt') DESC",
    )
    .all(kind)
    .map((r) => JSON.parse(r.data as string));
}
export function get<K extends Kind>(kind: K, id: string): Entities[K] {
  const row = db()
    .prepare("SELECT data FROM entities WHERE kind=? AND id=?")
    .get(kind, id);
  if (!row) throw new Error(`${kind.slice(0, -1)} not found`);
  return JSON.parse(row.data as string);
}
export function put<K extends Kind>(kind: K, value: Entities[K]): Entities[K] {
  const record = { ...value, updatedAt: new Date().toISOString() };
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
export function transaction<T>(fn: () => T): T {
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
  const row = db().prepare("SELECT data FROM settings WHERE id=1").get();
  return row
    ? JSON.parse(row.data as string)
    : {
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
}
export function saveSettings(value: Settings) {
  db()
    .prepare(
      "INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(JSON.stringify(value));
}

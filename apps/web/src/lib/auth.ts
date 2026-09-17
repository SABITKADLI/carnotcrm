import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { db } from "./db";
import type { User, Role } from "./types";

export const SESSION_COOKIE = "carnot_session";
export const isDemo = () =>
  process.env.CRM_DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verify(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
const dummyHash = hashPassword("dummy-password-for-timing");
export function users(): User[] {
  return db()
    .prepare("SELECT id,name,email,role,active FROM users ORDER BY name")
    .all()
    .map((r) => ({ ...r, active: !!r.active })) as unknown as User[];
}
export function createUser(
  name: string,
  email: string,
  password: string,
  role: Role,
) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters");
  const user = {
    id: randomUUID(),
    name,
    email: email.toLowerCase(),
    role,
    active: true,
  };
  if (users().some((u) => u.email.toLowerCase() === user.email))
    throw new Error("An account with this email already exists");
  db()
    .prepare("INSERT INTO users(id,name,email,role,password) VALUES(?,?,?,?,?)")
    .run(user.id, name, user.email, role, hashPassword(password));
  return user;
}
export function login(email: string, password: string) {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  db().prepare("DELETE FROM login_attempts WHERE reset < ?").run(now);
  const attempt = db()
    .prepare("SELECT attempts,reset FROM login_attempts WHERE key=?")
    .get(key);
  if (attempt && Number(attempt.attempts) >= 8 && Number(attempt.reset) > now)
    throw new Error("Too many attempts. Try again in 15 minutes.");
  const record = db()
    .prepare("SELECT * FROM users WHERE email=? AND active=1")
    .get(key);
  const valid = verify(password, record ? String(record.password) : dummyHash);
  if (!record || !valid) {
    db()
      .prepare(
        "INSERT INTO login_attempts(key,attempts,reset) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
      )
      .run(key, now + 15 * 60_000);
    throw new Error("Email or password is incorrect");
  }
  db().prepare("DELETE FROM login_attempts WHERE key=?").run(key);
  return startSession(String(record.id));
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  db().prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  db()
    .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)")
    .run(digest(token), userId, Date.now() + 12 * 60 * 60_000);
  return token;
}
export function sessionUser(token?: string): User | null {
  if (!token) return null;
  const row = db()
    .prepare(
      "SELECT u.id,u.name,u.email,u.role,u.active FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
    )
    .get(digest(token), Date.now());
  return row ? ({ ...row, active: true } as unknown as User) : null;
}
export function logout(token?: string) {
  if (token)
    db().prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
}
export function resetPassword(userId: string, password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters");
  db()
    .prepare("UPDATE users SET password=? WHERE id=?")
    .run(hashPassword(password), userId);
  db().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}

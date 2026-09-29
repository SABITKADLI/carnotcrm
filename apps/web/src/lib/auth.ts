import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  attempts,
  deleteAttempt,
  deleteExpiredAttempts,
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  saveAttempt,
  saveSession,
  saveUser,
  sessions,
  storedUsers,
  transaction,
  withStore,
} from "./db";
import type { Role, User } from "./types";

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
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function publicUser(user: User & { password?: string }): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export function users(): User[] {
  return storedUsers().map(publicUser);
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
    password: hashPassword(password),
  };
  if (storedUsers().some((u) => u.email.toLowerCase() === user.email))
    throw new Error("An account with this email already exists");
  saveUser(user);
  return publicUser(user);
}

function startSessionSync(userId: string) {
  const token = randomBytes(32).toString("hex");
  deleteExpiredSessions();
  saveSession({
    token: digest(token),
    userId,
    expires: Date.now() + 12 * 60 * 60_000,
  });
  return token;
}

export function startSession(userId: string) {
  return startSessionSync(userId);
}

function loginSync(email: string, password: string) {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  deleteExpiredAttempts(now);
  const attempt = attempts().find((candidate) => candidate.key === key);
  if (attempt && attempt.attempts >= 8 && attempt.reset > now)
    throw new Error("Too many attempts. Try again in 15 minutes.");
  const record = storedUsers().find(
    (candidate) => candidate.email.toLowerCase() === key && candidate.active,
  );
  const valid = verify(password, record ? record.password : dummyHash);
  if (!record || !valid) {
    saveAttempt({
      key,
      attempts: (attempt?.attempts || 0) + 1,
      reset: now + 15 * 60_000,
    });
    throw new Error("Email or password is incorrect");
  }
  deleteAttempt(key);
  return startSessionSync(record.id);
}

export function login(email: string, password: string): string {
  const unwrap = (value: { token?: string; error?: unknown }) => {
    if (value.error) throw value.error;
    return value.token!;
  };
  const result = transaction(() => {
    try {
      return { token: loginSync(email, password) };
    } catch (error) {
      return { error };
    }
  });
  if (result instanceof Promise) return result.then(unwrap) as unknown as string;
  return unwrap(result);
}

function sessionUserSync(token?: string): User | null {
  if (!token) return null;
  const hash = digest(token);
  const session = sessions().find(
    (candidate) => candidate.token === hash && candidate.expires > Date.now(),
  );
  if (!session) return null;
  const user = storedUsers().find(
    (candidate) => candidate.id === session.userId && candidate.active,
  );
  return user ? publicUser(user) : null;
}

export function sessionUser(token?: string): User | null {
  return withStore(() => sessionUserSync(token)) as User | null;
}

export async function logout(token?: string) {
  if (!token) return;
  await transaction(() => deleteSession(digest(token)));
}

export function resetPassword(userId: string, password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters");
  const user = storedUsers().find((candidate) => candidate.id === userId);
  if (!user) throw new Error("User not found");
  saveUser({ ...user, password: hashPassword(password) });
  deleteSessionsForUser(userId);
}

export function setUserActive(userId: string, active: boolean) {
  const user = storedUsers().find((candidate) => candidate.id === userId);
  if (!user) throw new Error("User not found");
  saveUser({ ...user, active });
  deleteSessionsForUser(userId);
}

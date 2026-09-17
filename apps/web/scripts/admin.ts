import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { createUser } from "../src/lib/auth";
import { transaction } from "../src/lib/db";
import { z } from "zod";
try {
  process.loadEnvFile();
} catch {
  /* .env is optional */
}
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
try {
  const name =
    process.env.CRM_ADMIN_NAME ||
    (await prompt.question("Administrator name: "));
  const email =
    process.env.CRM_ADMIN_EMAIL ||
    (await prompt.question("Administrator email: "));
  const password =
    process.env.CRM_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  z.string().trim().min(1).max(100).parse(name);
  z.email().parse(email);
  transaction(() => createUser(name.trim(), email.trim(), password, "admin"));
  console.log(
    "Administrator created. Sign in and change the temporary password in Settings.",
  );
  if (!process.env.CRM_ADMIN_PASSWORD)
    console.log(`Temporary password: ${password}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  prompt.close();
}

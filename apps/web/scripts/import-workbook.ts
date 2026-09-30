import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { users } from "../src/lib/auth";
import { withStore } from "../src/lib/db";
import { commitWorkbook, previewWorkbook } from "../src/lib/workbook";

async function main() {
  const filePath = resolve(
    process.argv[2] || "C:/Users/Microsoft/Downloads/SF_Fabric Tracker.xlsx",
  );
  const user = await withStore(() =>
    users().find((candidate) => candidate.role === "admin"),
  );
  if (!user)
    throw new Error("Create an administrator before importing the workbook");
  const preview = await previewWorkbook(
    await readFile(filePath),
    basename(filePath),
    user,
  );
  console.log(
    "Preview",
    preview.summary,
    `${preview.issues.length} issues shown`,
  );
  const result = await commitWorkbook(preview.runId, user);
  console.log("Committed", result);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

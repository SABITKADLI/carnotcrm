import { normalizeParties } from "../src/lib/partner-normalization";

try {
  process.loadEnvFile();
} catch {
  /* Environment variables can be supplied by Vercel or the shell. */
}

void normalizeParties()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

import { normalizeParties } from "../src/lib/partner-normalization";
import { retireLegacyWorkflow } from "../src/lib/legacy-retirement";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production data migrations outside Vercel production.");
} else {
  void normalizeParties()
    .then(async (result) => {
      console.log(`Production partner normalization: ${JSON.stringify(result)}`);
      console.log(`Legacy workflow retirement: ${JSON.stringify(await retireLegacyWorkflow())}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

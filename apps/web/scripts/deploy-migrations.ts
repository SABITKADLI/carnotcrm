import { normalizeParties } from "../src/lib/partner-normalization";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production data migrations outside Vercel production.");
} else {
  void normalizeParties()
    .then((result) =>
      console.log(`Production partner normalization: ${JSON.stringify(result)}`),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

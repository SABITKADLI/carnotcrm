import { all, base, put, transaction } from "../src/lib/db";
import type { Organization } from "../src/lib/types";

try {
  process.loadEnvFile();
} catch {
  /* Environment variables can be supplied by Vercel or the shell. */
}

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const split = (value: string) =>
  value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

async function main() {
  const result = await transaction(() => {
    const organizations = all("organizations");
    const byName = new Map(
      organizations
        .filter((item) => !item.archived && !/[,;\n]/.test(item.name))
        .map((item) => [normalize(item.name), item]),
    );
    let created = 0;
    let archived = 0;
    let updatedOrders = 0;
    const ensureParty = (name: string, source?: Organization) => {
      const key = normalize(name);
      let party = byName.get(key);
      if (!party) {
        party = put("organizations", {
          ...base("org"),
          version: 1,
          name,
          roles: ["distributor"],
          email: "",
          phone: "",
          address: "",
          taxId: "",
          notes: "Split from a combined workbook party entry",
          sourceSheet: source?.sourceSheet,
          sourceRow: source?.sourceRow,
          legacyId: name,
        });
        byName.set(key, party);
        created += 1;
      } else if (!party.roles.includes("distributor")) {
        party = put("organizations", {
          ...party,
          roles: [...party.roles, "distributor"],
          version: party.version + 1,
        });
        byName.set(key, party);
      }
      return party;
    };
    for (const organization of organizations) {
      const names = split(organization.name);
      if (
        !organization.archived &&
        names.length > 1 &&
        organization.roles.includes("distributor")
      ) {
        names.forEach((name) => ensureParty(name, organization));
        put("organizations", {
          ...organization,
          archived: true,
          notes: [
            organization.notes,
            "Archived after splitting combined party names",
          ]
            .filter(Boolean)
            .join(" · "),
          version: organization.version + 1,
        });
        archived += 1;
      }
    }
    for (const order of all("fabricOrders")) {
      const names = split(order.purposeParty);
      const partyIds = names.map((name) => ensureParty(name).id);
      if (
        partyIds.length &&
        JSON.stringify(partyIds) !== JSON.stringify(order.partyIds || [])
      ) {
        put("fabricOrders", {
          ...order,
          partyIds,
          version: order.version + 1,
        });
        updatedOrders += 1;
      }
    }
    return { created, archived, updatedOrders };
  });
  console.log(JSON.stringify(result));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

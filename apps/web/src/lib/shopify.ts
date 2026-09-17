import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { parse } from "lossless-json";
import { z } from "zod";
import { all, base, db, get, put, settings, transaction } from "./db";
import { audit } from "./service";
import type { Product, User } from "./types";

const VERSION = "2026-07";
function config() {
  const domain = process.env.SHOPIFY_SHOP || "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
    throw new Error(
      "Configure a valid SHOPIFY_SHOP myshopify.com hostname on the server",
    );
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token)
    throw new Error("The Shopify Admin access token has not been configured");
  return { domain, token };
}
class ShopifyRejected extends Error {}
async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const { domain, token } = config();
  const response = await fetch(
    `https://${domain}/admin/api/${VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Shopify returned HTTP ${response.status}. Check the connection and app permissions.`,
    );
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length)
    throw new ShopifyRejected(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new Error("Shopify returned no data");
  for (const payload of Object.values(body.data as Record<string, unknown>)) {
    if (payload && typeof payload === "object" && "userErrors" in payload) {
      const errors = (payload as { userErrors: { message: string }[] })
        .userErrors;
      if (errors.length)
        throw new ShopifyRejected(errors.map((e) => e.message).join("; "));
    }
  }
  return body.data;
}
type RemoteProduct = {
  id: string;
  handle: string;
  tags: string[];
  variants: { nodes: { id: string; inventoryItem: { id: string } }[] };
};
function patchProduct(id: string, changes: Partial<Product>) {
  return transaction(() =>
    put("products", { ...get("products", id), ...changes }),
  );
}
export async function sendToShopify(
  user: User,
  id: string,
  publish: boolean,
  quantity: number,
) {
  if (user.role !== "admin") throw new Error("Administrator access required");
  const { domain } = config();
  const publicationId = process.env.SHOPIFY_PUBLICATION_ID,
    locationId = process.env.SHOPIFY_LOCATION_ID;
  if (
    publish &&
    (!/^gid:\/\/shopify\/Publication\/\d+$/.test(publicationId || "") ||
      !/^gid:\/\/shopify\/Location\/\d+$/.test(locationId || ""))
  )
    throw new Error(
      "Configure a Shopify publication and stock location before publishing",
    );
  let local = transaction(() => {
    const p = get("products", id);
    if (p.shopifyStatus === "published")
      throw new Error(
        "This batch is already published. Manage its Shopify allocation in the store.",
      );
    if (
      p.shopifyStatus === "syncing" &&
      Date.now() - Date.parse(p.updatedAt) < 120000
    )
      throw new Error(
        "This listing is already being synchronized. Try again in two minutes if it does not finish.",
      );
    if (publish && !p.allocationKey) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > p.stock)
        throw new Error("Choose an available whole-piece quantity to allocate");
      p.channelStock = quantity;
      p.allocationKey = randomUUID();
    }
    return put("products", {
      ...p,
      shopifyStatus: "syncing",
      shopifyError: "",
    });
  });
  try {
    const shop = await graphql<{ shop: { currencyCode: string } }>(
      "query StoreCurrency { shop { currencyCode } }",
    );
    if (shop.shop.currencyCode !== settings().currency)
      throw new Error(
        "Shopify store currency must match the CRM currency before listing products",
      );
    if (!local.shopifyId) {
      const handle = `carnot-${id.toLowerCase().replaceAll("_", "-")}`;
      const tag = `carnot-product-${id}`;
      const existing = await graphql<{
        productByIdentifier: RemoteProduct | null;
      }>(
        "query FindProduct($identifier: ProductIdentifierInput!) { productByIdentifier(identifier: $identifier) { id handle tags variants(first: 1) { nodes { id inventoryItem { id } } } } }",
        { identifier: { handle } },
      );
      let remote = existing.productByIdentifier;
      if (remote && !remote.tags.includes(tag))
        throw new Error(
          "A Shopify product already uses this handle without the Carnot ownership tag",
        );
      if (!remote) {
        const result = await graphql<{
          productCreate: { product: RemoteProduct };
        }>(
          "mutation CreateProduct($product: ProductCreateInput!) { productCreate(product: $product) { product { id handle tags variants(first: 1) { nodes { id inventoryItem { id } } } } userErrors { field message } } }",
          {
            product: {
              title: local.name,
              handle,
              vendor: settings().companyName,
              productType: local.category,
              status: "DRAFT",
              tags: ["carnot", tag],
            },
          },
        );
        remote = result.productCreate.product;
      }
      if (!remote?.variants.nodes[0])
        throw new Error("The Shopify product has no initial variant");
      local = patchProduct(id, {
        shopifyId: remote.id,
        variantId: remote.variants.nodes[0].id,
        inventoryItemId: remote.variants.nodes[0].inventoryItem.id,
        shopifyUrl: `https://${domain}/admin/products/${remote.id.split("/").pop()}`,
      });
    }
    await graphql(
      "mutation SetVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } } }",
      {
        productId: local.shopifyId,
        variants: [
          {
            id: local.variantId,
            price: (local.price / 100).toFixed(2),
            inventoryPolicy: "DENY",
            inventoryItem: {
              sku: local.sku,
              tracked: true,
              requiresShipping: true,
            },
          },
        ],
      },
    );
    if (publish) {
      if (!local.inventorySynced) {
        if (local.inventoryAttempted)
          throw new Error(
            "A previous inventory request has an uncertain outcome. Stock remains reserved. Reconcile the allocation before retrying; it will not be replenished automatically.",
          );
        const level = await graphql<{
          inventoryItem: {
            inventoryLevel: {
              quantities: { name: string; quantity: number }[];
            } | null;
          };
        }>(
          'query InventoryAtLocation($itemId: ID!, $locationId: ID!) { inventoryItem(id: $itemId) { inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } } } }',
          { itemId: local.inventoryItemId, locationId },
        );
        if (!level.inventoryItem.inventoryLevel) {
          await graphql(
            "mutation ActivateInventory($itemId: ID!, $locationId: ID!, $key: String!) { inventoryActivate(inventoryItemId: $itemId, locationId: $locationId) @idempotent(key: $key) { inventoryLevel { id } userErrors { field message } } }",
            {
              itemId: local.inventoryItemId,
              locationId,
              key: `${local.allocationKey}-activate`,
            },
          );
        } else if (
          level.inventoryItem.inventoryLevel.quantities.find(
            (q) => q.name === "available",
          )?.quantity !== 0
        ) {
          throw new Error(
            "This Shopify location already has stock for the variant. Reconcile it before allocating this batch.",
          );
        }
        patchProduct(id, { inventoryAttempted: true });
        try {
          await graphql(
            "mutation SetInventory($input: InventorySetQuantitiesInput!, $key: String!) { inventorySetQuantities(input: $input) @idempotent(key: $key) { inventoryAdjustmentGroup { createdAt } userErrors { code field message } } }",
            {
              input: {
                name: "available",
                reason: "correction",
                referenceDocumentUri: `gid://carnot/ChannelAllocation/${local.allocationKey}`,
                quantities: [
                  {
                    inventoryItemId: local.inventoryItemId,
                    locationId,
                    quantity: local.channelStock,
                    changeFromQuantity: 0,
                  },
                ],
              },
              key: local.allocationKey,
            },
          );
        } catch (error) {
          if (error instanceof ShopifyRejected)
            patchProduct(id, { inventoryAttempted: false });
          throw error;
        }
        local = patchProduct(id, { inventorySynced: true });
      }
      await graphql(
        "mutation ActivateProduct($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id status } userErrors { field message } } }",
        { product: { id: local.shopifyId, status: "ACTIVE" } },
      );
      await graphql(
        "mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }",
        { id: local.shopifyId, input: [{ publicationId }] },
      );
    }
    transaction(() => {
      put("products", {
        ...get("products", id),
        shopifyStatus: publish ? "published" : "draft",
        shopifyError: "",
      });
      audit(
        user,
        publish ? "Published to Shopify" : "Created Shopify draft",
        local.sku,
        publish ? `${local.channelStock} pieces allocated to Shopify` : domain,
      );
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify synchronization failed";
    patchProduct(id, {
      shopifyStatus: "error",
      shopifyError: message.slice(0, 1000),
    });
    throw new Error(message);
  }
}

/** Raw-body authentication, lossless IDs and transactional event/order deduplication. */
export function processPaidWebhook(raw: Buffer, headers: Headers) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) throw new Error("Shopify webhook secret is not configured");
  const expected = createHmac("sha256", secret).update(raw).digest();
  const supplied = Buffer.from(
    headers.get("x-shopify-hmac-sha256") || "",
    "base64",
  );
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new Error("Invalid webhook signature");
  if (
    headers.get("x-shopify-shop-domain") !== process.env.SHOPIFY_SHOP ||
    headers.get("x-shopify-topic") !== "orders/paid"
  )
    throw new Error("Unexpected Shopify store or webhook topic");
  const body = z
    .object({
      admin_graphql_api_id: z.string().min(1),
      name: z.string(),
      currency: z.string(),
      line_items: z.array(
        z.object({
          variant_id: z.union([z.string(), z.null()]),
          quantity: z.coerce.number().int().positive(),
          price: z.string(),
        }),
      ),
    })
    .parse(parse(raw.toString("utf8"), undefined, (value) => value));
  const key = `shopify-paid-${body.admin_graphql_api_id}`;
  const actor: User = {
    id: "shopify",
    name: "Shopify",
    email: "",
    role: "admin",
    active: true,
  };
  return transaction(() => {
    if (db().prepare("SELECT id FROM operations WHERE id=?").get(key))
      return { duplicate: true };
    for (const line of body.line_items) {
      const p = all("products").find(
        (p) =>
          p.variantId === `gid://shopify/ProductVariant/${line.variant_id}`,
      );
      if (!p) {
        audit(
          actor,
          "Unmapped Shopify sale",
          body.name,
          `Variant ${line.variant_id || "custom"} · ${line.quantity} pcs; reconcile manually.`,
        );
        continue;
      }
      if (line.quantity > p.channelStock || line.quantity > p.stock)
        throw new Error(
          "Shopify sale exceeds the tracked allocation; reconcile the batch before retrying",
        );
      put("products", {
        ...p,
        stock: p.stock - line.quantity,
        channelStock: p.channelStock - line.quantity,
      });
      put("movements", {
        ...base("mov"),
        productId: p.id,
        quantity: -line.quantity,
        type: "Shopify sale",
        reference: body.name,
        actor: "Shopify",
        note: `${line.price} ${body.currency} per piece; invoice and payment held in Shopify.`,
      });
    }
    audit(
      actor,
      "Reconciled Shopify paid order",
      body.name,
      "Channel stock updated. Shopify retains the customer invoice and payment record.",
    );
    db()
      .prepare(
        "INSERT INTO operations(id,actor,payload,result,created) VALUES(?,?,?,?,?)",
      )
      .run(
        key,
        "shopify",
        createHash("sha256").update(raw).digest("hex"),
        "{}",
        Date.now(),
      );
    return { success: true };
  });
}

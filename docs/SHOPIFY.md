# Shopify connection

Carnot uses the **2026-07 Admin GraphQL API** from the server. Credentials never enter browser state or CSV exports.

## Configure the custom app

Supply these environment values and restart the server:

```dotenv
SHOPIFY_SHOP=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=your-private-admin-token
SHOPIFY_PUBLICATION_ID=gid://shopify/Publication/123
SHOPIFY_LOCATION_ID=gid://shopify/Location/456
SHOPIFY_WEBHOOK_SECRET=your-app-client-secret
```

Use a custom app authorized for your store. Obtain an access token through the appropriate Shopify app installation flow. Required scopes include `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_locations`, `read_publications`, `write_publications`; configuring the paid-order webhook may require `read_orders` and appropriate app access. Grant only scopes needed by your installation. Store currency must match the CRM currency.

For apps using a client-credentials grant, tokens expire after 24 hours. This implementation accepts a provisioned token; it does **not** implement automatic OAuth token renewal. Supply a valid refreshed token through your hosting secrets mechanism when required.

The location must support stocking the product. Select the intended publication/sales channel explicitly. Inspect IDs with the Admin GraphQL API:

```graphql
query CarnotConnection {
  shop { name currencyCode }
  locations(first: 20) { nodes { id name } }
  publications(first: 20) { nodes { id name } }
}
```

## Product flow

1. Complete a garment order and accept its final quality review.
2. In Finished goods, choose **Send to Shopify**.
3. **Draft listing** creates or resumes a draft product and updates the default variant's SKU and price. It is not channel publication.
4. **Publish with stock** reserves the chosen number of local pieces, activates the stock location, allocates inventory with compare-and-swap and an idempotency key, activates the product and publishes to the configured channel.

One production batch maps to one Shopify product/default variant. Split production by size or color when you need independently counted SKUs. Add photography, rich descriptions and optional merchandising attributes in Shopify after export.

Remote product and variant IDs are saved before subsequent operations. A deterministic handle and ownership tag allow recovery after an uncertain product-creation response. Stock remains allocated during partial failures so a retry cannot cause direct-sale overselling. The interface records error details and permits retries. Already-published batches cannot be allocated again through this release.

If an inventory network request has an uncertain outcome, automatic retries stop before writing inventory again. Inspect Shopify available/committed stock, orders and the local allocation before reconciling. Never clear a local reservation simply because a network request failed. Cancellations/refunds/returns and uncertain inventory outcomes currently require an operator/developer reconciliation; there is no automatic reconciliation UI.

## Paid-order webhook

Configure Shopify's `orders/paid` subscription to:

```text
https://your-crm.example.com/api/shopify/webhook
```

Use API version 2026-07 and the same custom app's **client secret** for `SHOPIFY_WEBHOOK_SECRET`; it is not the Admin access token. Ensure the configured payload includes `admin_graphql_api_id`, `name`, `currency`, `line_items.variant_id`, `line_items.quantity` and `line_items.price`.

The handler verifies the raw-body HMAC, store and topic, parses numeric IDs losslessly, and deduplicates by Shopify order identity in the same transaction as stock changes. Mapped lines reduce local on-hand and allocated stock once. Shopify controls its own sale-related inventory decrement; the webhook does not decrement remote stock again. Unmapped lines generate an activity record for reconciliation.

Shopify retains its invoice/payment records. CRM billing reports cover invoices issued inside Carnot, not Shopify revenue. No cancellation, refund, return, edit or fulfillment webhook handlers are included. Monitor delivery errors in Shopify and reconcile failed events. Test on a development store before enabling real sales.

## Primary references

- [API versioning](https://shopify.dev/docs/api/usage/versioning)
- [Admin API authentication](https://shopify.dev/docs/api/usage/authentication)
- [Product creation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate)
- [Variant updates](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkUpdate)
- [Inventory compare-and-swap changes](https://shopify.dev/changelog/finalizing-compare-and-swap-redesign-for-inventory-set-quantities)
- [Inventory quantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities)
- [Channel publication](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish)
- [Webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)

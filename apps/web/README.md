# Carnot web application

Next.js App Router with React, TypeScript, Tailwind and Node's SQLite database.

From this directory:

```sh
npm ci
npm run demo        # Fictional sample workspace on 127.0.0.1:3000
npm run admin:create # Provision an administrator for the normal database
npm run dev         # Normal workspace, no demo access
npm run build
npm run start
npm test
npm run lint
npm run typecheck
npm run db:backup
```

Requires Node 24+. See the [root README](../../README.md), [operations guide](../../docs/OPERATIONS.md) and [Shopify guide](../../docs/SHOPIFY.md) for configuration, workflow and explicit implementation boundaries.

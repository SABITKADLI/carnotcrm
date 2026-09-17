# Running Carnot

## Persistent Node server

Use Node 24+ and one application instance backed by a persistent local disk. Copy `apps/web/.env.example` to `.env`, set an absolute `CRM_DATABASE_PATH` for deployment, and set `CRM_PUBLIC_URL` to the exact HTTPS origin seen by users. Keep `.env` and the data directory out of source control.

```sh
cd apps/web
npm ci
npm run admin:create
npm run build
npm run start
```

Put a TLS reverse proxy in front of the Node process. Production session cookies require HTTPS. Forward the original host consistently; `CRM_PUBLIC_URL` controls mutation origin checks. Run with `NODE_ENV=production` and keep `CRM_DEMO_MODE=false`.

The default data file is `data/carnot.sqlite` relative to the web app working directory. `npm run demo` instead uses `data/demo.sqlite`, binds only to loopback and opts into development-only sample login. Do not copy a demo database into production.

## Docker

Provision the real data directory with `npm run admin:create` before mounting it into the container. The standalone runtime intentionally excludes development provisioning tools.

```sh
docker build -t carnot-crm ./apps/web
docker run -d --name carnot-crm --restart unless-stopped \
  -p 3000:3000 \
  --env-file ./apps/web/.env \
  -e CRM_DATABASE_PATH=/app/data/carnot.sqlite \
  -e CRM_PUBLIC_URL=https://crm.example.com \
  --mount type=bind,source=/absolute/path/to/apps/web/data,target=/app/data \
  carnot-crm
```

Use a persistent directory writable by container UID 1000. Terminate HTTPS at your reverse proxy. The Dockerfile is supplied but is not claimed to have been built in this session if Docker is unavailable.

## Accounts

The provisioning command creates, never replaces, an admin account. Generated temporary passwords print once to the local terminal; store and share them securely. For noninteractive creation, inject `CRM_ADMIN_NAME`, `CRM_ADMIN_EMAIL`, `CRM_ADMIN_PASSWORD` into the provisioning process only.

Administrators create tailor/admin accounts in Settings. No invitation emails are sent. Accounts with unfinished assigned work cannot be disabled. Password reset invalidates the account's sessions. There is no public sign-up or anonymous production access.

## Backups

```sh
cd apps/web
npm run db:backup
```

The command uses SQLite's online backup API, which includes committed WAL changes, and writes timestamped snapshots to `data/backups/`. Schedule it and copy snapshots to separate protected storage. A backup on the same disk is not disaster recovery.

To restore, stop all app processes, retain the current database and associated `-wal`/`-shm` files as a rollback copy, then replace the configured database with the chosen snapshot. Remove only the stale sidecars for the replaced database while the application is stopped. Start the app and verify account access and recent records before accepting writes. Never overwrite a live database file.

## Database and limits

Schema initialization is idempotent and sets `user_version=1`. Tables include typed business entities, users, sessions, settings, login attempts and durable mutation IDs. Writes use `BEGIN IMMEDIATE`, with a five-second busy timeout and WAL journaling. No network calls execute inside write transactions.

This release serves a single organization. Reads currently load collections to build the workspace; add pagination and indexed projections before high-volume use. Use PostgreSQL or another networked database and explicit migrations before horizontally scaling. Do not place the SQLite file on an ephemeral serverless filesystem or run multiple hosts against a shared network drive.

Mutation/audit records are retained. Plan data retention and offsite backup access around your business needs. CSV files contain operational/customer data and should be handled accordingly.

## Validation

`npm test` exercises the domain and mocked external integration. `node scripts/smoke.mjs` checks the running demo through HTTP. CI runs install, lint, types, tests and production build. Browser interaction, live Shopify configuration and your hosting environment still require acceptance testing before rollout to staff.

# Carnot CRM / FRP System

Monorepo for a modern Fabric Resource Planning (FRP) / CRM-style system.

## Structure

- `apps/web` – Next.js 16 App Router frontend (TypeScript + Tailwind)
- `apps/api` – Backend/API (Next.js API routes or separate Node app) [planned]
- `packages/` – Shared libraries (db / Prisma client, UI kit, types) [planned]
- `docs/` – Architecture, setup, and design docs

## Getting Started (Frontend)

```bash
cd apps/web
npm install
npm run dev

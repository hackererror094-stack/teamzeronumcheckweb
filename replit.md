# WA Number Cleaner

A WhatsApp number verification tool — paste bulk phone numbers and instantly see which are active on WhatsApp vs invalid/banned.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/wa-cleaner run dev` — run the frontend (port 22384)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- WhatsApp: @whiskeysockets/baileys (multi-file auth state, QR code login)
- QR: qrcode (converts QR string to base64 data URL for frontend display)
- Frontend: React + Vite + Tailwind CSS
- Validation: Zod (`zod/v4`), Orval codegen

## Where things live

- `artifacts/wa-cleaner/` — React frontend
- `artifacts/api-server/` — Express API server
- `artifacts/api-server/src/lib/whatsapp.ts` — WhatsApp connection manager (singleton)
- `artifacts/api-server/src/routes/whatsapp.ts` — API routes for WA status, disconnect, verify
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validation schemas
- `auth_info_baileys/` — WhatsApp session credentials (auto-created on first QR scan)

## Architecture decisions

- WhatsApp manager is a singleton EventEmitter — auto-reconnects on disconnect
- QR code is converted to base64 data URL server-side (via `qrcode` pkg) before sending to frontend
- `@whiskeysockets/baileys` is marked external in esbuild (`build.mjs`) so it resolves its own `protobufjs` dependency at runtime (bundling it causes ERR_MODULE_NOT_FOUND for protobufjs)
- `protobufjs` and `@whiskeysockets/baileys` added to `onlyBuiltDependencies` in `pnpm-workspace.yaml` so their build scripts run on install
- Numbers are verified sequentially one-by-one via the frontend loop (no bulk batch endpoint)

## Product

- Paste bulk phone numbers (one per line, format: 923xxxxxxxx)
- Scan WhatsApp QR code to link your account
- Live streaming log shows each number's result: Active (green), Deleted/Invalid (red), Error (amber)
- Running stats: Total Scanned, Active/Safe, Deleted/Invalid

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Must add `@whiskeysockets/baileys` to esbuild externals — if bundled, it fails at runtime on protobufjs
- `pnpm-workspace.yaml` `onlyBuiltDependencies` must include `protobufjs` and `@whiskeysockets/baileys`
- `auth_info_baileys/` folder stores session — deleting it forces re-login via QR

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

# Monorepo Setup — Turborepo

## Overview

Turborepo manages the workspace. Two apps share the root `pnpm-workspace.yaml`: `apps/api` (NestJS) and `apps/web` (Next.js). Shared packages live under `packages/` if needed (deferred to post-MVP).

---

## Prerequisites

- Node.js 20 LTS
- pnpm 9+: `npm i -g pnpm`

---

## Implementation

### 1. Workspace root

```bash
# from repo root (berlin-transit-alert/)
pnpm add -D turbo -w
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json`:

```json
{
  "name": "berlin-transit-alert",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

### 2. `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "lint": {},
    "typecheck": {}
  }
}
```

### 3. App scaffolding

```bash
# NestJS backend
mkdir -p apps/api
cd apps/api
pnpm dlx @nestjs/cli new . --package-manager pnpm --strict --skip-git

# Next.js frontend
cd ../../
pnpm dlx create-next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --skip-install
```

### 4. Workspace layout

```
berlin-transit-alert/
├── apps/
│   ├── api/          # NestJS — API, bot, crawler, scheduler
│   └── web/          # Next.js — public dashboard
├── packages/         # (empty for MVP)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── pnpm-lock.yaml
```

### 5. Install all dependencies

```bash
# from root
pnpm install
```

---

## Decisions & Trade-offs

| Decision                          | Rationale                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Turborepo over Nx                 | Simpler config; pnpm-native caching; no plugin ecosystem needed at MVP scale |
| Two apps only, no shared packages | Shared types add overhead; the API and web don't share runtime code at MVP   |
| `persistent: true` on dev task    | Keeps both dev servers running in parallel via `turbo dev`                   |
| `--skip-git` on NestJS scaffold   | Root repo already has git; avoid nested `.git` directory                     |

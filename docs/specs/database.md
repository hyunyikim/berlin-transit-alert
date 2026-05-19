# Database — Supabase

## Overview

Managed PostgreSQL via Supabase. The NestJS app uses `@supabase/supabase-js` to query the database. Schema is defined and applied manually via the Supabase SQL editor.

## Prerequisites

- Supabase account (free tier sufficient for MVP)
- Supabase project created
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` available from Project Settings → API

## Implementation

### 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose region closest to EC2 (e.g. Frankfurt / `eu-central-1`)
3. Copy `SUPABASE_URL` and the **secret key** (`sb_secret_...`) from Project Settings → API

### 2. Set environment variables

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Use the **secret key** (not the publishable key) — the backend needs full table access, bypassing RLS. Supabase has migrated from the old `anon`/`service_role` JWT key naming to `publishable`/`secret`.

Add to `.env` locally and to EC2 environment (via PM2 ecosystem config or `/etc/environment`).

### 3. Install Supabase client

```bash
pnpm add @supabase/supabase-js --filter @berlin-transit-alert/api
```

### 4. Schema

Run in the Supabase SQL editor (Dashboard → SQL Editor):

```sql
create table bta_users (
  id bigint generated always as identity primary key,
  telegram_id bigint unique not null,
  created_at timestamptz default now()
);

create table bta_subscriptions (
  id bigint generated always as identity primary key,
  user_id bigint references bta_users(id) on delete cascade,
  line text not null,
  created_at timestamptz default now(),
  unique(user_id, line)
);

create table bta_disruptions (
  id          bigint generated always as identity primary key,
  source      text not null,              -- 'bvg' | 'sbahn'
  line        text not null,              -- e.g. 'U2'
  stops       text not null default '',   -- e.g. 'U Senefelderplatz' or 'Between S+U Wuhletal and U Hellersdorf'
  tag         text not null default '',   -- e.g. 'No Stop'
  "from"      text not null default '',   -- ISO date string or '' when unknown
  "until"     text not null default '',   -- ISO date string or '' when unknown
  headline    text not null,              -- h4 text
  description text not null default '',   -- paragraph text
  detected_at timestamptz default now(),
  resolved_at timestamptz,               -- null = still active
  notified    boolean default false,

  unique (source, line, "from", "until", headline)
);

create index on bta_disruptions(line, resolved_at);
```

### 5. Initialize client in NestJS

```ts
// apps/api/src/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
```

Inject or import `supabase` directly in services — no module wrapper needed for MVP.

## Decisions & Trade-offs

| Decision                                      | Rationale                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase over self-hosted PostgreSQL          | Eliminates PostgreSQL ops on EC2 (install, config, backups, security patches). Free tier covers MVP volume.                                                                        |
| Secret key (new) over service_role (legacy)   | Supabase replaced `anon`/`service_role` JWT keys with `publishable`/`secret`. Secret key gives unrestricted access; RLS is unnecessary overhead for a server-only app.             |
| `resolved_at` nullable on disruptions         | `null` = active disruption; set when crawler no longer reports the line as affected.                                                                                               |
| `unique(source, line, from, until, headline)` | Deduplication key — same disruption crawled repeatedly inserts only once via `ON CONFLICT DO NOTHING`. `source` is included because BVG and S-Bahn could have identical headlines. |

# Backend Setup — NestJS

## Overview

NestJS app at `apps/api` within the Turborepo workspace. Hosts all backend concerns: REST API, Telegram bot, crawler scheduler, and notification logic. Runs under PM2 on EC2, proxied by Nginx.

**Prerequisite:** complete [monorepo setup](monorepo.md) first.

---

## Prerequisites

- Node.js 20 LTS on the host
- pnpm 9+: `npm i -g pnpm`

---

## Implementation

### 1. Scaffold

```bash
# from repo root
pnpm dlx @nestjs/cli new apps/api --package-manager pnpm --strict --skip-git
```

### 2. Core dependencies

```bash
# Database
pnpm add @nestjs/typeorm typeorm pg

# Config
pnpm add @nestjs/config

# Scheduler (crawler cron)
pnpm add @nestjs/schedule

# Telegram bot
pnpm add nestjs-telegraf telegraf

# HTTP client (Gemini calls)
pnpm add @nestjs/axios axios

# Playwright (crawler — no Python sidecar needed)
pnpm add playwright
pnpm exec playwright install chromium

# Validation
pnpm add class-validator class-transformer
```

### 3. Module structure

```
src/
├── app.module.ts          # root — imports all feature modules
├── config/
│   └── configuration.ts   # typed env config (db, telegram token, gemini key)
├── database/
│   └── database.module.ts # TypeORM async setup
├── telegram/
│   ├── telegram.module.ts
│   ├── telegram.service.ts  # send messages
│   └── telegram.update.ts   # command handlers (/start, /add, …)
├── crawler/
│   ├── crawler.module.ts
│   ├── crawler.service.ts   # Playwright — fetches BVG + S-Bahn HTML
│   └── crawler.schedule.ts  # @Cron every 10 min
├── parser/
│   ├── parser.module.ts
│   └── parser.service.ts    # Gemini Flash — raw text → structured delay
├── disruptions/
│   ├── disruptions.module.ts
│   ├── disruptions.service.ts
│   └── disruption.entity.ts
├── subscriptions/
│   ├── subscriptions.module.ts
│   ├── subscriptions.service.ts
│   └── subscription.entity.ts
└── notifications/
    ├── notifications.module.ts
    └── notifications.service.ts  # match disruptions → subscriptions → send
```

### 4. Environment variables (`.env`)

```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=berlin_transit
DATABASE_USER=transit_user
DATABASE_PASSWORD=

TELEGRAM_BOT_TOKEN=

GEMINI_API_KEY=
```

Load via `@nestjs/config` with a `configuration.ts` factory; access through `ConfigService` everywhere — never read `process.env` directly in feature code.

### 5. TypeORM config (`database.module.ts`)

```ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: "postgres",
    host: config.get("database.host"),
    port: config.get<number>("database.port"),
    database: config.get("database.name"),
    username: config.get("database.user"),
    password: config.get("database.password"),
    entities: [__dirname + "/../**/*.entity{.ts,.js}"],
    synchronize: false, // use migrations in prod
    migrations: ["dist/migrations/*{.ts,.js}"],
    migrationsRun: true,
  }),
});
```

### 6. Global validation pipe (`main.ts`)

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

### 7. PM2 config (`ecosystem.config.js` at repo root, not inside `apps/api`)

```js
module.exports = {
  apps: [
    {
      name: "transit-api",
      script: "apps/api/dist/main.js",
      cwd: "/home/ec2-user/berlin-transit-alert",
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
```

---

## Decisions & Trade-offs

| Decision                                           | Rationale                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Single NestJS process for API + crawler + bot      | No separate infra; t3.micro budget; traffic is negligible                   |
| `synchronize: false` in TypeORM                    | Avoid accidental schema mutations in prod; use explicit migrations          |
| `nestjs-telegraf` over raw `node-telegram-bot-api` | Decorator-based handlers align with NestJS DI; less boilerplate             |
| Playwright for crawling (not Crawl4AI)             | Keeps everything in Node; no Python sidecar or subprocess management on EC2 |
| `@nestjs/config` typed factory                     | Catches missing env vars at startup, not at runtime                         |

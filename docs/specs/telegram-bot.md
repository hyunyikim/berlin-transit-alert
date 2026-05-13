# Telegram Bot

## Overview

Telegram bot living inside the NestJS app at `apps/api`. Uses `nestjs-telegraf` for decorator-based command handlers. Handles user registration, subscription management, and manual status queries.

**Prerequisite:** complete [backend setup](backend-setup.md) and [database setup](database.md) first.

---

## Prerequisites

- A Telegram bot token from [@BotFather](https://t.me/BotFather) (`/newbot`)
- `nestjs-telegraf` and `telegraf` already installed (listed in backend-setup.md)
- Supabase client initialized at `src/supabase.ts`
- `bta_users` and `bta_subscriptions` tables created in Supabase

---

## Implementation

### 1. Environment variable

```
TELEGRAM_BOT_TOKEN=<your token from BotFather>
```

Add to `.env` locally and to EC2 environment.

### 2. Register `TelegrafModule` in `AppModule`

```ts
// app.module.ts
import { TelegrafModule } from "nestjs-telegraf";

@Module({
  imports: [
    TelegrafModule.forRoot({
      token: process.env.TELEGRAM_BOT_TOKEN!,
    }),
    TelegramModule,
  ],
})
export class AppModule {}
```

### 3. Module structure

```
src/telegram/
├── telegram.module.ts
├── telegram.update.ts   # command handlers
└── telegram.service.ts  # Supabase queries
```

### 4. `TelegramModule`

```ts
// telegram/telegram.module.ts
import { Module } from "@nestjs/common";
import { TelegramUpdate } from "./telegram.update";
import { TelegramService } from "./telegram.service";

@Module({
  providers: [TelegramUpdate, TelegramService],
})
export class TelegramModule {}
```

### 5. `TelegramService` — Supabase queries

```ts
// telegram/telegram.service.ts
import { Injectable } from "@nestjs/common";
import { supabase } from "../supabase";

@Injectable()
export class TelegramService {
  async upsertUser(telegramId: number): Promise<void> {
    await supabase
      .from("bta_users")
      .upsert({ telegram_id: telegramId }, { onConflict: "telegram_id" });
  }

  async getUserId(telegramId: number): Promise<number | null> {
    const { data } = await supabase
      .from("bta_users")
      .select("id")
      .eq("telegram_id", telegramId)
      .single();
    return data?.id ?? null;
  }

  async addSubscription(
    telegramId: number,
    line: string,
  ): Promise<"added" | "exists"> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return "exists";
    const { error } = await supabase
      .from("bta_subscriptions")
      .insert({ user_id: userId, line: line.toUpperCase() });
    return error?.code === "23505" ? "exists" : "added";
  }

  async removeSubscription(
    telegramId: number,
    line: string,
  ): Promise<"removed" | "not_found"> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return "not_found";
    const { data } = await supabase
      .from("bta_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("line", line.toUpperCase())
      .select();
    return data && data.length > 0 ? "removed" : "not_found";
  }

  async getSubscriptions(telegramId: number): Promise<string[]> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return [];
    const { data } = await supabase
      .from("bta_subscriptions")
      .select("line")
      .eq("user_id", userId)
      .order("line");
    return data?.map((r) => r.line) ?? [];
  }

  async getActiveDisruptions(
    line: string,
  ): Promise<{ status: string; message: string }[]> {
    const { data } = await supabase
      .from("bta_disruptions")
      .select("status, message")
      .eq("line", line.toUpperCase())
      .is("resolved_at", null);
    return data ?? [];
  }
}
```

### 6. `TelegramUpdate` — command handlers

```ts
// telegram/telegram.update.ts
import { Update, Start, Command, Ctx } from "nestjs-telegraf";
import { Context } from "telegraf";
import { TelegramService } from "./telegram.service";

@Update()
export class TelegramUpdate {
  constructor(private readonly svc: TelegramService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await this.svc.upsertUser(ctx.from!.id);
    await ctx.reply(
      "Welcome to Berlin Transit Alert! 🚆\n\n" +
        "Commands:\n" +
        "/add <line> — subscribe to a line (e.g. /add U8)\n" +
        "/remove <line> — unsubscribe\n" +
        "/mylines — list your subscriptions\n" +
        "/status <line> — check current disruptions",
    );
  }

  @Command("add")
  async onAdd(@Ctx() ctx: Context) {
    const line = (ctx.message as any)?.text?.split(" ")[1]?.trim();
    if (!line) return ctx.reply("Usage: /add <line>  e.g. /add U8");

    await this.svc.upsertUser(ctx.from!.id);
    const result = await this.svc.addSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === "added"
        ? `Subscribed to ${line.toUpperCase()}. You'll be notified of disruptions.`
        : `You're already subscribed to ${line.toUpperCase()}.`,
    );
  }

  @Command("remove")
  async onRemove(@Ctx() ctx: Context) {
    const line = (ctx.message as any)?.text?.split(" ")[1]?.trim();
    if (!line) return ctx.reply("Usage: /remove <line>  e.g. /remove U8");

    const result = await this.svc.removeSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === "removed"
        ? `Unsubscribed from ${line.toUpperCase()}.`
        : `You weren't subscribed to ${line.toUpperCase()}.`,
    );
  }

  @Command("mylines")
  async onMyLines(@Ctx() ctx: Context) {
    const lines = await this.svc.getSubscriptions(ctx.from!.id);
    await ctx.reply(
      lines.length > 0
        ? `Your subscriptions:\n${lines.join("\n")}`
        : "You have no subscriptions. Use /add <line> to subscribe.",
    );
  }

  @Command("status")
  async onStatus(@Ctx() ctx: Context) {
    const line = (ctx.message as any)?.text?.split(" ")[1]?.trim();
    if (!line) return ctx.reply("Usage: /status <line>  e.g. /status U8");

    const disruptions = await this.svc.getActiveDisruptions(line);
    if (disruptions.length === 0) {
      return ctx.reply(`${line.toUpperCase()}: No active disruptions.`);
    }
    const text = disruptions
      .map((d) => `[${d.status.toUpperCase()}] ${d.message}`)
      .join("\n\n");
    await ctx.reply(`${line.toUpperCase()} disruptions:\n\n${text}`);
  }
}
```

---

## Commands summary

| Command          | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `/start`         | Register user, show help                                 |
| `/add <line>`    | Subscribe to a line (e.g. `U8`, `S1`, `M10`)             |
| `/remove <line>` | Unsubscribe from a line                                  |
| `/mylines`       | List all subscriptions for the calling user              |
| `/status <line>` | Show active (unresolved) disruptions for a specific line |

Line names are normalized to uppercase on write and query.

---

## Decisions & Trade-offs

| Decision                                         | Rationale                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `nestjs-telegraf` decorator style                | Keeps handlers in NestJS DI; matches module pattern from rest of app    |
| Long-polling (default) not webhooks              | Simpler for MVP on EC2 — no public HTTPS endpoint config needed for bot |
| `upsertUser` on every `/start` and `/add`        | Idempotent registration; user can `/start` multiple times safely        |
| Error code `23505` for duplicate subscription    | PostgreSQL unique-constraint violation code; avoids a pre-check SELECT  |
| Line normalized to uppercase at service boundary | Consistent storage regardless of user input (`u8` → `U8`)               |

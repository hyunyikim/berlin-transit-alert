# Notification Logic

## Overview

After each crawler run, the system scans for unnotified active disruptions and sends formatted Telegram messages to all users subscribed to the affected lines.

## Prerequisites

- `bta_disruptions` table with `notified boolean default false` and `resolved_at` columns
- `bta_subscriptions` and `bta_users` tables
- `TelegrafModule.forRoot()` configured in `AppModule`

## Module Structure

```
src/notification/
  notification.module.ts   — imports TelegramModule; exports NotificationService
  notification.service.ts  — orchestrates fetch → match → send → mark
```

## Flow

1. `CrawlerScheduler.runCrawl()` saves all disruptions for both sources
2. Calls `NotificationService.notifyNewDisruptions()`
3. Queries `bta_disruptions WHERE notified = false AND resolved_at IS NULL`
4. Groups results by `line`
5. For each line: two-query subscriber lookup
   - `bta_subscriptions WHERE line = ?` → `user_id[]`
   - `bta_users WHERE id IN (user_ids)` → `telegram_id[]`
6. Sends formatted message to each subscriber via `TelegramService.sendMessage()`
7. Marks all processed disruption IDs as `notified = true` in a single `UPDATE`

## Message Format

```
⚠️ {line} — {tag}

{headline}
{description if non-empty}

📍 {stops if non-empty}
🕐 Until {until if non-empty}
🔗 {disruption detail url, or source homepage as fallback}
```

## Multi-Line Disruptions

S-Bahn disruptions may list several lines (e.g. `"S8, S85, S9"`). `CrawlerService.saveDisruptions()` splits these by comma before upserting, so `bta_disruptions.line` always holds a single token. The subscriber query can therefore use an exact `WHERE line = ?` match.

## Deduplication

The `notified` boolean on `bta_disruptions` is the single source of truth. A disruption is notified exactly once on its first active appearance. If it reappears after resolution (new row via unique constraint), it triggers a fresh notification — correct behaviour.

## Error Handling

| Scenario                         | Behaviour                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| Telegram send fails for one user | Logged as warning; other users still receive the message        |
| No subscribers for a line        | Disruption still marked `notified = true`                       |
| Supabase query error             | Logged as error; unnotified rows remain for retry on next cycle |

## Decisions & Trade-offs

| Decision                                                  | Rationale                                              |
| --------------------------------------------------------- | ------------------------------------------------------ |
| Mark notified even on partial Telegram failure            | Prevents indefinite duplicate notifications            |
| Two-query subscriber lookup                               | Avoids PostgREST FK join configuration dependency      |
| Single `notifyNewDisruptions()` call after full save loop | One DB scan per cycle covers both BVG and S-Bahn       |
| `NotificationModule` imported by `CrawlerModule`          | Clean encapsulation; avoids wiring through `AppModule` |

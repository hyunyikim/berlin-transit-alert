## 1. Overview

### Purpose

A service that automatically detects delays and disruptions on Berlin public transportation lines and instantly notifies users via Telegram, removing the need to manually check apps or websites.

### Problem Statement

Berlin public transportation users — particularly daily commuters — often miss delay information until they are already at the station. Existing apps like BVG Fahrinfo provide this information, but they require users to actively open and check them. There is no push-based notification system that proactively alerts users about disruptions on the specific lines they use.

---

## 2. Goals & Success Metrics

### MVP Goals

- Users can subscribe to U-Bahn and S-Bahn lines via a Telegram bot
- Users receive a Telegram notification within 10 minutes of a delay or disruption being published
- A public web dashboard shows the current status of all lines at a glance
- The system runs reliably at minimal or no cost

### Success Metrics

- Number of active bot users (users with at least one subscribed line)
- Number of notifications sent per day
- Notification delivery time: from delay published → message sent (target: under 10 minutes)
- Dashboard visits tracked via Google Analytics

---

## 3. Target Users

Berlin residents who commute regularly on U-Bahn or S-Bahn lines and want to be proactively informed about delays without having to check apps manually. Primary persona: a daily commuter with fixed lines they ride every weekday.

---

## 4. Features & Requirements

### 4.1 Telegram Bot (User-facing)

All user interactions happen inside the Telegram bot. No account creation or external login is required.

| Command          | Description                                     |
| ---------------- | ----------------------------------------------- |
| `/start`         | Welcome message and onboarding instructions     |
| `/add [line]`    | Subscribe to a line (e.g. `/add U8`, `/add S1`) |
| `/remove [line]` | Unsubscribe from a line                         |
| `/mylines`       | Show currently subscribed lines                 |
| `/status`        | Show current status of subscribed lines         |

**Notification format (example):**

⚠️ _U8 — Delay_

Delays of approx. 10 minutes due to a signal failure near Hermannstraße.

_Updated: 08:42_

### 4.2 Web Dashboard (Next.js)

A read-only public page showing the current status of all U-Bahn and S-Bahn lines at a glance. No login required.

- Displays all lines with a status indicator (normal / delayed / disrupted)
- Shows the latest disruption message per affected line
- Shows the last updated timestamp
- Tracked with Google Analytics

### 4.3 System / Backend Features

- Crawler runs on a schedule (every 10 minutes) to collect delay data from BVG and S-Bahn Berlin websites
- Collected data is parsed into a structured format (line, status, message, timestamp)
- Parsed data is stored in the database
- The system matches disrupted lines against subscribed users and sends Telegram notifications
- Duplicate notifications for the same active disruption are suppressed

---

## 5. Data Sources

| Source                                                      | Coverage          |
| ----------------------------------------------------------- | ----------------- |
| BVG ([bvg.de](http://bvg.de))                               | U-Bahn, Bus, Tram |
| S-Bahn Berlin ([s-bahn-berlin.de](http://s-bahn-berlin.de)) | S-Bahn            |

**MVP scope:** U-Bahn and S-Bahn only. Bus and Tram are out of scope for MVP.

---

## 6. Tech Stack

| Layer           | Technology                                          |
| --------------- | --------------------------------------------------- |
| Monorepo        | Turborepo + pnpm workspaces                         |
| Frontend        | Next.js (`apps/web`)                                |
| Backend         | NestJS (`apps/api`)                                 |
| Database        | Supabase (managed PostgreSQL)                       |
| Crawler         | Playwright (Node.js)                                |
| Scheduler       | `@nestjs/schedule` (cron inside NestJS)             |
| Notifications   | Telegram Bot API                                    |
| Hosting         | AWS EC2 t3.micro                                    |
| Reverse Proxy   | Nginx + PM2                                         |
| DNS / TLS / CDN | Cloudflare                                          |
| CI/CD           | GitHub Actions (auto-deploy to EC2 on push to main) |
| Analytics       | Google Analytics (dashboard only)                   |

---

## 7. System Architecture

### High-level Flow

```
[BVG / S-Bahn websites]
        ↓  (every 10 min via @nestjs/schedule)
[Playwright — structured delay data]
        ↓
[PostgreSQL — store parsed delays]
        ↓
[NestJS — match delays to subscribed users]
        ↓
[Telegram Bot API — send notifications]
```

### Infrastructure Overview

```
User → Cloudflare → EC2 (Nginx → NestJS app)
                          ↓
                     Supabase (managed PostgreSQL)
```

- PM2 keeps the NestJS process alive and auto-restarts on crash
- GitHub Actions SSHes into EC2 on every push to `main`, pulls latest code, rebuilds, and restarts PM2
- Crawler and cron jobs run inside NestJS via `@nestjs/schedule` — no separate infrastructure needed
- Supabase handles database hosting, backups, and connection pooling — no PostgreSQL installation on EC2

---

## 8. Out of Scope (MVP)

- Bus and Tram lines
- Station-level subscription (line-level only)
- User accounts or web-based login
- Multiple notification channels (email, SMS, etc.)
- Historical delay data or analytics for users
- Native mobile app
- Multi-language support (English only for MVP)

---

## 10. Implementation Checklist

**Infrastructure**

- [ ] Provision AWS EC2 t3.micro instance
- [ ] Install and configure Nginx and PM2
- [ ] Point domain to Cloudflare, set up TLS
- [ ] Set up GitHub Actions CI/CD pipeline to EC2

**Backend**

- [x] Initialize Turborepo monorepo → [spec](docs/specs/monorepo.md)
- [x] Initialize NestJS project → [spec](docs/specs/backend-setup.md)
- [x] Set up Supabase project and define schema → [spec](docs/specs/database.md)
- [x] Build Telegram bot with basic commands (`/start`, `/add`, `/remove`, `/mylines`, `/status`) → [spec](docs/specs/telegram-bot.md)
- [x] Implement Playwright crawler with `@nestjs/schedule` → [spec](docs/specs/crawler.md)
- [x] Store parsed delay data in the database
- [ ] Implement notification logic (match delays → users → send message)
- [ ] Handle deduplication (don't re-notify for the same ongoing disruption)

**Frontend**

- [ ] Initialize Next.js project
- [ ] Build lines status dashboard
- [ ] Integrate Google Analytics

**Launch**

- [ ] End-to-end testing
- [ ] Deploy and go live

---

## 9. Open Questions

These are items to revisit during implementation as the codebase and usage patterns become clearer.

| #   | Question                                                          | Notes                                                   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | How to reliably detect that a disruption has ended?               | Avoid sending redundant "resolved" messages             |
| 2   | How to deduplicate notifications for the same ongoing disruption? | Need a strategy to track already-notified events        |
| 3   | What happens if BVG or S-Bahn changes their website structure?    | Crawler may break — need a monitoring/alerting strategy |
| 4   | Should the Telegram bot support German language?                  | Depends on target user feedback post-launch             |
| 5   | Database backup strategy                                          | Handled by Supabase (daily backups on free tier)        |

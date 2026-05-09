# Berlin Transit Alert — Project Instructions

## Documentation Pattern

`prd.md` stays high-level. Each implementation step gets a dedicated spec file under `docs/specs/` containing the concrete how — commands, schemas, config, decisions.

### When implementing a checklist item

1. Create or update `docs/specs/<step-slug>.md` with: Overview, Prerequisites, Implementation, Schema/Contracts, Decisions & Trade-offs.
2. Link it from the checklist item in `prd.md`: `- [ ] Build Telegram bot → [spec](docs/specs/telegram-bot.md)`
3. Then write the code.

Keep specs concise — bullet points and code over prose, no filler sentences.

### Spec file map

| Step                           | Spec                           |
| ------------------------------ | ------------------------------ |
| EC2, Nginx, PM2, Cloudflare    | `docs/specs/infrastructure.md` |
| GitHub Actions CI/CD           | `docs/specs/cicd.md`           |
| NestJS setup                   | `docs/specs/backend-setup.md`  |
| PostgreSQL schema              | `docs/specs/database.md`       |
| Telegram bot                   | `docs/specs/telegram-bot.md`   |
| Crawler (Crawl4AI + scheduler) | `docs/specs/crawler.md`        |
| Gemini Flash LLM parser        | `docs/specs/llm-parser.md`     |
| Notification + deduplication   | `docs/specs/notifications.md`  |
| Next.js dashboard              | `docs/specs/frontend.md`       |
| Launch & testing               | `docs/specs/launch.md`         |

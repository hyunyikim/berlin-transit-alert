# Crawler Spec

## Overview

A NestJS module that scrapes live disruption data from BVG and S-Bahn Berlin every 10 minutes using Playwright (headless Chromium). Both sites are JS-rendered, so static fetching is insufficient. Raw visible text is handed off to the LLM parser (next step).

## Prerequisites

```bash
pnpm --filter api add @nestjs/schedule playwright
npx playwright install chromium --with-deps   # EC2: also installs system deps
```

## Target URLs

| Source        | URL                                                     |
| ------------- | ------------------------------------------------------- |
| BVG (U-Bahn)  | `https://www.bvg.de/de/verbindungen/stoerungsmeldungen` |
| S-Bahn Berlin | `https://sbahn.berlin/fahren/bauen-stoerung/`           |

## Extraction approach

**BVG:** targets `section[aria-labelledby="Underground Service"]`, iterates `li` elements, and extracts specific fields via CSS selectors (see table below). Result is a JSON array of `BvgDisruption`.

**S-Bahn:** `page.innerText('main')` — raw visible text, falls back to `body`.

### BVG field selectors

| Field            | Selector                                             |
| ---------------- | ---------------------------------------------------- |
| `line`           | `a[class*="BdsSignetLine"] span[aria-hidden="true"]` |
| `stops`          | `[class*="LineStopsRange"]` aria-label, fallback `i` |
| `tag`            | `strong[class*="BdsTag"]`                            |
| `from` / `until` | `time[datetime]` (1st / 2nd occurrence)              |
| `headline`       | `h4`                                                 |
| `description`    | `p` (all, joined with space)                         |

## Module structure

```
src/crawler/
  crawler.module.ts      # imports ScheduleModule
  crawler.service.ts     # Playwright browser lifecycle + scrape methods
  crawler.scheduler.ts   # @Cron every 10 min, calls crawlAll()
```

## Crawler lifecycle

- `OnModuleInit` → launch browser once (singleton, headless Chromium)
- `OnModuleDestroy` → close browser
- Each crawl opens a new page, navigates, waits for `networkidle`, extracts text, closes page

## Output contract

```ts
interface BvgDisruption {
  line: string;
  stops: string;
  tag: string;
  from: string; // ISO date string, e.g. "2025-11-03"
  until: string; // ISO date string
  headline: string;
  description: string;
}

interface CrawlResult {
  source: "bvg" | "sbahn";
  text: string; // BVG: JSON array of BvgDisruption; S-Bahn: raw visible text
  crawledAt: Date;
}
```

`CrawlerService.crawlAll()` returns `CrawlResult[]`. The LLM parser (next step) consumes this.

## Cron schedule

`0 */10 * * * *` — fires at second 0 of every 10th minute.

## EC2 deployment note

Run once after deploy to install Chromium and its system dependencies:

```bash
npx playwright install chromium --with-deps
```

## Decisions & Trade-offs

| Decision                              | Reason                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| Singleton browser, new page per crawl | Avoids cold-start cost; isolates crashes between crawls           |
| `innerText` over CSS selectors        | Resilient to DOM changes; LLM handles parsing noise               |
| `networkidle` wait                    | Both sites load disruption data via XHR/fetch after initial paint |
| Playwright over Crawl4AI              | Native Node.js — no Python sidecar needed on EC2                  |

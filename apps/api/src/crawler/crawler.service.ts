import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Browser, chromium, Page } from 'playwright';
import { getSupabase } from '../supabase';

export interface Disruption {
  line: string;
  stops: string;
  tag: string;
  from: string;
  until: string;
  headline: string;
  description: string;
  lastUpdatedAt: string;
  href?: string;
}

/** @deprecated use Disruption */
export type BvgDisruption = Disruption;

export interface CrawlResult {
  source: 'bvg' | 'sbahn';
  text: Disruption[];
  crawledAt: Date;
}

const SOURCES = {
  bvg: 'https://www.bvg.de/en/connections/traffic-news',
  sbahn:
    'https://sbahn.berlin/en/plan-a-journey/timetable-changes/?timeframetab=2',
} as const;

const SBAHN_BASE = 'https://sbahn.berlin';

@Injectable()
export class CrawlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlerService.name);
  private browser: Browser;

  async onModuleInit() {
    try {
      this.browser = await chromium.launch({ headless: true });
      this.logger.log('Browser launched');
    } catch (err) {
      this.logger.error(
        'Failed to launch browser — run: pnpm exec playwright install chromium',
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.browser?.close();
    this.logger.log('Browser closed');
  }

  async crawlAll(): Promise<CrawlResult[]> {
    const results = await Promise.allSettled([
      this.crawl('bvg'),
      this.crawl('sbahn'),
    ]);

    return results
      .map((r, i) => {
        const source = i === 0 ? 'bvg' : 'sbahn';
        if (r.status === 'fulfilled') return r.value;
        this.logger.error(`Crawl failed for ${source}: ${r.reason}`);
        return null;
      })
      .filter((r): r is CrawlResult => r !== null);
  }

  private async extractBvg(page: Page): Promise<Disruption[]> {
    const section = await page.$(
      'section[aria-labelledby="Underground Service"]',
    );
    if (!section) return [];
    const items = await section.$$(
      'li[class*="DisruptionsOverviewVersionTwo_item"]',
    );

    const disruptions: Disruption[] = await Promise.all(
      items.map(async (li) => {
        const line = await li
          .$eval(
            'a[class*="BdsSignetLine"] span[aria-hidden="true"]',
            (el) => el.textContent?.trim() ?? '',
          )
          .catch(() => '');

        const stops = await li
          .$eval(
            '[class*="LineStopsRange"]',
            (el) => el.getAttribute('aria-label')?.trim() ?? '',
          )
          .catch(() =>
            li.$eval('i', (el) => el.textContent?.trim() ?? '').catch(() => ''),
          );

        const tag = await li
          .$eval(
            'strong[class*="BdsTag"]',
            (el) => el.textContent?.trim() ?? '',
          )
          .catch(() => '');

        const times = await li
          .$$eval('[class*="timeBlock"] time[datetime]', (els) =>
            els.map((el) => el.getAttribute('datetime') ?? ''),
          )
          .catch(() => [] as string[]);

        const headline = await li
          .$eval('h4', (el) => el.textContent?.trim() ?? '')
          .catch(() => '');

        const description = await li
          .$$eval('p', (els) =>
            els
              .map((el) => el.textContent?.trim().replace(/\n+/g, ' ') ?? '')
              .filter(Boolean)
              .join(' '),
          )
          .catch(() => '');

        const lastUpdatedAt = await li
          .$eval(
            '[class*="modDate"] time[datetime]',
            (el) => el.getAttribute('datetime') ?? '',
          )
          .catch(() => '');

        return {
          line,
          stops,
          tag,
          from: times[0] ?? '',
          until:
            times[1] ??
            (await li
              .$eval(
                '[class*="timeBlock"] div',
                (el) => el.textContent?.trim() ?? '',
              )
              .catch(() => '')),
          headline,
          description,
          lastUpdatedAt,
        };
      }),
    );

    return disruptions.filter((d) => d.line);
  }

  private parseSbahnDates(raw: string): { from: string; until: string } {
    const toIso = (dateStr: string): string => {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    };

    const s = raw.trim();

    // "19 May 2026, 10:00 – 22 May 2026, 18:00"
    const fullRange = s.match(
      /^(\d{1,2}\s+\w+\s+\d{4}),?\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}\s+\w+\s+\d{4}),?\s+(\d{1,2}:\d{2})$/,
    );
    if (fullRange) {
      return {
        from: toIso(`${fullRange[1]} ${fullRange[2]}`),
        until: toIso(`${fullRange[3]} ${fullRange[4]}`),
      };
    }

    // "19 May – 22 May 2026" (shared year in until part)
    const partialRange = s.match(
      /^(\d{1,2}\s+\w+(?:\s+\d{4})?)\s*[–-]\s*(\d{1,2}\s+\w+\s+\d{4})$/,
    );
    if (partialRange) {
      const until = partialRange[2];
      const fromRaw = partialRange[1];
      const yearMatch = until.match(/\d{4}/);
      const from =
        /\d{4}/.test(fromRaw) || !yearMatch
          ? fromRaw
          : `${fromRaw} ${yearMatch[0]}`;
      return { from: toIso(from), until: toIso(until) };
    }

    // "From 19 May 2026, 10:00" or "19 May 2026, 10:00"
    const singleDt = s.match(
      /^(?:[Ff]rom\s+)?(\d{1,2}\s+\w+\s+\d{4}),?\s+(\d{1,2}:\d{2})$/,
    );
    if (singleDt) {
      return { from: toIso(`${singleDt[1]} ${singleDt[2]}`), until: '' };
    }

    // "From 19 May 2026" or "19 May 2026"
    const singleDate = s.match(/^(?:[Ff]rom\s+)?(\d{1,2}\s+\w+\s+\d{4})$/);
    if (singleDate) {
      return { from: toIso(singleDate[1]), until: '' };
    }

    return { from: s, until: '' };
  }

  private async extractSbahn(page: Page): Promise<Disruption[]> {
    const raw = await page.evaluate(() => {
      // Real selector from the live site — cards are article.c-box
      const cards = Array.from(document.querySelectorAll('article.c-box'));

      return cards.map((card) => {
        // Line names from badge links (e.g. "S46", "S1")
        const lineEls = Array.from(card.querySelectorAll('a.o-icon-css-line'));
        const line = lineEls
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .join(', ');

        // Headline text and href
        const headlineEl = card.querySelector('h3 a, h2 a, h4 a');
        const headline = (headlineEl as HTMLElement)?.innerText?.trim() ?? '';
        const href = headlineEl?.getAttribute('href') ?? '';

        // Period span: "Last updated: 19/05/2026 · 13:10 Uhr" (disorder)
        // or "from 06.09. (Saturday) at 05:00 to 01:00 on 10.08. (Monday)" (construction)
        const periodEl = card.querySelector('.c-box__period span');
        const periodText = (periodEl as HTMLElement)?.innerText?.trim() ?? '';

        // Disorder cards either carry c-box--disorder class, a "Last updated: …" period text,
        // or no period text at all (and aren't explicitly marked as construction)
        const isDisorder =
          card.classList.contains('c-box--disorder') ||
          periodText.toLowerCase().startsWith('last updated') ||
          (!periodText && !card.classList.contains('c-box--construction'));

        // Effect label (e.g. "Disturbance", "No stop at station")
        const effectEl = card.querySelector('.c-con-detail__effect');
        const spans = effectEl
          ? Array.from(effectEl.querySelectorAll('span'))
          : [];
        const tag =
          spans
            .map((s) => s.innerText?.trim())
            .filter((t) => t && !t.toLowerCase().includes('status'))
            .pop() ?? '';

        return { line, headline, href, periodText, isDisorder, tag };
      });
    });

    const disruptions: Disruption[] = [];
    for (const card of raw) {
      if (!card.headline) continue;

      let from = '';
      let until = '';
      let lastUpdatedAt = '';

      if (card.isDisorder) {
        // "Last updated: 19/05/2026 · 13:10 Uhr" → extract datetime
        const m = card.periodText.match(
          /(\d{2})\/(\d{2})\/(\d{4})\s*[·•]\s*(\d{2}:\d{2})/,
        );
        if (m) {
          lastUpdatedAt = new Date(
            `${m[3]}-${m[2]}-${m[1]}T${m[4]}`,
          ).toISOString();
        }
      } else {
        // Construction: store the raw period string as `from`; parse if possible
        const parsed = this.parseSbahnDates(card.periodText);
        from = parsed.from;
        until = parsed.until;
      }

      disruptions.push({
        line: card.line,
        stops: '',
        tag: card.tag,
        from,
        until,
        headline: card.headline,
        description: '',
        lastUpdatedAt,
        href: card.href,
      });
    }

    this.logger.log(
      `[sbahn] found ${disruptions.length} disruptions on list page`,
    );
    return disruptions;
  }

  private async enrichFromDetail(
    disruptions: Disruption[],
    page: Page,
  ): Promise<Disruption[]> {
    const enriched: Disruption[] = [];

    for (const d of disruptions) {
      if (!d.href) {
        enriched.push(d);
        continue;
      }

      const url = d.href.startsWith('http') ? d.href : `${SBAHN_BASE}${d.href}`;

      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
        await page
          .waitForSelector('.c-con-detail__content', { timeout: 10_000 })
          .catch(() => {});

        const detail = await page.evaluate(() => {
          const scope =
            document.querySelector('main, [role="main"], article') ?? document;

          const description = Array.from(scope.querySelectorAll('p'))
            .map((p) => (p as HTMLElement).innerText?.trim() ?? '')
            .filter((t) => t.length > 40)
            .join('\n\n');

          const shortInfoEl = Array.from(
            scope.querySelectorAll('.c-con-detail__content'),
          ).find((el) =>
            el
              .querySelector('.o-kicker')
              ?.textContent?.toLowerCase()
              .includes('short information'),
          );
          const shortInfo = shortInfoEl
            ? Array.from(shortInfoEl.querySelectorAll('li'))
                .map((li) => (li as HTMLElement).innerText?.trim() ?? '')
                .filter(Boolean)
                .join('\n')
            : '';

          return { description, shortInfo };
        });

        enriched.push({
          ...d,
          description: detail.shortInfo,
        });
      } catch (err) {
        this.logger.warn(`Detail page failed for ${url}: ${err}`);
        enriched.push(d);
      }

      await new Promise((res) => setTimeout(res, 800));
    }

    return enriched;
  }

  async saveDisruptions(
    disruptions: Disruption[],
    source: 'bvg' | 'sbahn',
  ): Promise<void> {
    if (!disruptions.length) return;

    // Split multi-line disruptions (e.g. "S8, S85, S9") into one row per line
    const expanded = disruptions.flatMap((d) =>
      d.line
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ ...d, line: l })),
    );

    const rows = expanded.map((d) => ({
      source,
      line: d.line,
      stops: d.stops,
      tag: d.tag,
      from: d.from,
      until: d.until,
      headline: d.headline,
      description: d.description,
      last_updated_at: d.lastUpdatedAt,
      url: d.href ?? '',
    }));

    const { error } = await getSupabase().from('bta_disruptions').upsert(rows, {
      onConflict: 'source,line,from,until,headline,last_updated_at',
      ignoreDuplicates: true,
    });

    if (error)
      this.logger.error(`Failed to save disruptions: ${error.message}`);
    else
      this.logger.log(`Saved ${rows.length} disruptions (duplicates skipped)`);
  }

  async crawl(source: 'bvg' | 'sbahn'): Promise<CrawlResult> {
    this.logger.log(`Crawling ${source}...`);
    const page = await this.browser.newPage();
    try {
      await page.goto(SOURCES[source], {
        waitUntil: source === 'sbahn' ? 'networkidle' : 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForSelector(
        source === 'bvg'
          ? 'section[aria-labelledby="Underground Service"]'
          : 'article.c-box',
        { timeout: 30_000 },
      );

      let text: Disruption[];
      if (source === 'bvg') {
        text = await this.extractBvg(page);
      } else {
        const list = await this.extractSbahn(page);
        text = await this.enrichFromDetail(list, page);
      }

      this.logger.log(`[${source}] returning ${text.length} disruptions`);
      return { source, text, crawledAt: new Date() };
    } finally {
      await page.close();
    }
  }
}

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
  sbahn: 'https://sbahn.berlin/fahren/bauen-stoerung/',
} as const;

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
        };
      }),
    );

    return disruptions.filter((d) => d.line);
  }

  async saveDisruptions(
    disruptions: Disruption[],
    source: 'bvg' | 'sbahn',
  ): Promise<void> {
    if (!disruptions.length) return;

    const rows = disruptions.map((d) => ({
      source,
      line: d.line,
      stops: d.stops,
      tag: d.tag,
      from: d.from,
      until: d.until,
      headline: d.headline,
      description: d.description,
    }));

    const { error } = await getSupabase().from('bta_disruptions').upsert(rows, {
      onConflict: 'source,line,from,until,headline',
      ignoreDuplicates: true,
    });

    if (error)
      this.logger.error(`Failed to save disruptions: ${error.message}`);
    else
      this.logger.log(`Saved ${rows.length} disruptions (duplicates skipped)`);
  }

  async crawl(source: 'bvg' | 'sbahn'): Promise<CrawlResult> {
    const page = await this.browser.newPage();
    console.log(`Crawling ${source}...`);
    try {
      await page.goto(SOURCES[source], {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForSelector(
        source === 'bvg'
          ? 'section[aria-labelledby="Underground Service"]'
          : 'main',
        { timeout: 30_000 },
      );

      const text = source === 'bvg' ? await this.extractBvg(page) : [];

      console.log('text', text);

      return { source, text, crawledAt: new Date() };
    } finally {
      await page.close();
    }
  }
}

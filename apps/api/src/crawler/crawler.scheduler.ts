import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from './crawler.service';

@Injectable()
export class CrawlerScheduler {
  private readonly logger = new Logger(CrawlerScheduler.name);

  constructor(private readonly crawlerService: CrawlerService) {}

  @Cron('0 */10 * * * *')
  async runCrawl() {
    this.logger.log('Crawl started');
    const results = await this.crawlerService.crawlAll();
    for (const result of results) {
      this.logger.log(
        `[${result.source}] crawled at ${result.crawledAt.toISOString()}`,
      );
      await this.crawlerService.saveDisruptions(result.text, result.source);
    }
  }
}

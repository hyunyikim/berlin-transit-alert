import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerService } from './crawler.service';
import { CrawlerScheduler } from './crawler.scheduler';

describe('CrawlerService', () => {
  let service: CrawlerService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), ScheduleModule.forRoot()],
      providers: [CrawlerService, CrawlerScheduler],
    }).compile();

    service = module.get<CrawlerService>(CrawlerService);
    await module.init();
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  it('crawls BVG and returns a CrawlResult', async () => {
    const result = await service.crawl('bvg');
    expect(result.source).toBe('bvg');
    expect(result.crawledAt).toBeInstanceOf(Date);
    expect(Array.isArray(result.text)).toBe(true);
  }, 60_000);

  it.only('saves BVG disruptions to Supabase', async () => {
    const result = await service.crawl('bvg');
    await expect(
      service.saveDisruptions(result.text, 'bvg'),
    ).resolves.not.toThrow();
  }, 60_000);
});

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerScheduler } from './crawler.scheduler';
import { CrawlerService } from './crawler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CrawlerService, CrawlerScheduler],
  exports: [CrawlerService],
})
export class CrawlerModule {}

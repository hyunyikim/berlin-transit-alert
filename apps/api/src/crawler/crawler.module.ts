import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification/notification.module';
import { CrawlerScheduler } from './crawler.scheduler';
import { CrawlerService } from './crawler.service';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule],
  providers: [CrawlerService, CrawlerScheduler],
  exports: [CrawlerService],
})
export class CrawlerModule {}

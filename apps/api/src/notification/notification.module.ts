import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationService } from './notification.service';

@Module({
  imports: [TelegramModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}

import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { TelegramService } from './telegram.service';

@Module({
  imports: [TelegrafModule],
  providers: [TelegramUpdate, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}

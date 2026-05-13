import { Command, Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly svc: TelegramService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await this.svc.upsertUser(ctx.from!.id);
    await ctx.reply(
      'Welcome to Berlin Transit Alert!\n\n' +
        'Commands:\n' +
        '/add <line> — subscribe (e.g. /add U8)\n' +
        '/remove <line> — unsubscribe\n' +
        '/mylines — list your subscriptions\n' +
        '/status <line> — check current disruptions',
    );
  }

  @Command('add')
  async onAdd(@Ctx() ctx: Context): Promise<void> {
    const line = (ctx.message as any)?.text?.split(' ')[1]?.trim();
    if (!line) {
      await ctx.reply('Usage: /add <line>  e.g. /add U8');
      return;
    }

    await this.svc.upsertUser(ctx.from!.id);
    const result = await this.svc.addSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === 'added'
        ? `Subscribed to ${line.toUpperCase()}. You'll be notified of disruptions.`
        : `You're already subscribed to ${line.toUpperCase()}.`,
    );
  }

  @Command('remove')
  async onRemove(@Ctx() ctx: Context): Promise<void> {
    const line = (ctx.message as any)?.text?.split(' ')[1]?.trim();
    if (!line) {
      await ctx.reply('Usage: /remove <line>  e.g. /remove U8');
      return;
    }

    const result = await this.svc.removeSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === 'removed'
        ? `Unsubscribed from ${line.toUpperCase()}.`
        : `You weren't subscribed to ${line.toUpperCase()}.`,
    );
  }

  @Command('mylines')
  async onMyLines(@Ctx() ctx: Context) {
    const lines = await this.svc.getSubscriptions(ctx.from!.id);
    await ctx.reply(
      lines.length > 0
        ? `Your subscriptions:\n${lines.join('\n')}`
        : 'No subscriptions yet. Use /add <line> to subscribe.',
    );
  }

  @Command('status')
  async onStatus(@Ctx() ctx: Context): Promise<void> {
    const line = (ctx.message as any)?.text?.split(' ')[1]?.trim();
    if (!line) {
      await ctx.reply('Usage: /status <line>  e.g. /status U8');
      return;
    }

    const disruptions = await this.svc.getActiveDisruptions(line);
    if (disruptions.length === 0) {
      await ctx.reply(`${line.toUpperCase()}: No active disruptions.`);
      return;
    }
    const text = disruptions
      .map((d) => `[${d.status.toUpperCase()}] ${d.message}`)
      .join('\n\n');
    await ctx.reply(`${line.toUpperCase()} disruptions:\n\n${text}`);
  }
}

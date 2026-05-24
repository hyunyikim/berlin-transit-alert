import { Command, Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { formatDisruption } from '../disruption-format';
import { TelegramService } from './telegram.service';

const VALID_LINES = new Set([
  'U1',
  'U2',
  'U3',
  'U4',
  'U5',
  'U6',
  'U7',
  'U8',
  'U9',
  'S1',
  'S2',
  'S25',
  'S26',
  'S3',
  'S41',
  'S42',
  'S46',
  'S47',
  'S5',
  'S7',
  'S75',
  'S8',
  'S85',
  'S9',
]);

const INVALID_LINE_MSG = 'Unknown line. Try something like U8 or S5.';

function parseLineArg(ctx: Context): string | undefined {
  const msg = ctx.message;
  if (!msg || !('text' in msg)) return undefined;
  return msg.text.split(' ')[1]?.trim().toUpperCase();
}

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
    const line = parseLineArg(ctx);
    if (!line) {
      await ctx.reply('Usage: /add <line>  e.g. /add U8');
      return;
    }
    if (!VALID_LINES.has(line)) {
      await ctx.reply(INVALID_LINE_MSG);
      return;
    }

    await this.svc.upsertUser(ctx.from!.id);
    const result = await this.svc.addSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === 'added'
        ? `Subscribed to ${line}. You'll be notified of disruptions.`
        : `You're already subscribed to ${line}.`,
    );
  }

  @Command('remove')
  async onRemove(@Ctx() ctx: Context): Promise<void> {
    const line = parseLineArg(ctx);
    if (!line) {
      await ctx.reply('Usage: /remove <line>  e.g. /remove U8');
      return;
    }
    if (!VALID_LINES.has(line)) {
      await ctx.reply(INVALID_LINE_MSG);
      return;
    }

    const result = await this.svc.removeSubscription(ctx.from!.id, line);
    await ctx.reply(
      result === 'removed'
        ? `Unsubscribed from ${line}.`
        : `You weren't subscribed to ${line}.`,
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
    const line = parseLineArg(ctx);
    if (!line) {
      await ctx.reply('Usage: /status <line>  e.g. /status U8');
      return;
    }
    if (!VALID_LINES.has(line)) {
      await ctx.reply(INVALID_LINE_MSG);
      return;
    }

    const disruptions = await this.svc.getActiveDisruptions(line);
    if (disruptions.length === 0) {
      await ctx.reply(`${line}: No active disruptions.`);
      return;
    }
    await ctx.reply(disruptions.map(formatDisruption).join('\n\n'));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Disruption, formatDisruption } from '../disruption-format';
import { getSupabase } from '../supabase';
import { TelegramService } from '../telegram/telegram.service';

interface UnnotifiedDisruption extends Disruption {
  id: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly telegram: TelegramService) {}

  async notifyNewDisruptions(): Promise<void> {
    const disruptions = await this.fetchUnnotified();
    if (!disruptions.length) return;

    this.logger.log(`Notifying for ${disruptions.length} new disruptions`);

    const byLine = new Map<string, UnnotifiedDisruption[]>();
    for (const d of disruptions) {
      const bucket = byLine.get(d.line) ?? [];
      bucket.push(d);
      byLine.set(d.line, bucket);
    }

    const notifiedIds: number[] = [];

    for (const [line, lineDisruptions] of byLine.entries()) {
      const telegramIds = await this.fetchSubscribersForLine(line);

      if (!telegramIds.length) {
        notifiedIds.push(...lineDisruptions.map((d) => d.id));
        continue;
      }

      for (const disruption of lineDisruptions) {
        const message = formatDisruption(disruption);
        for (const telegramId of telegramIds) {
          try {
            await this.telegram.sendMessage(telegramId, message);
          } catch (err) {
            this.logger.warn(`Failed to send to ${telegramId}: ${err.message}`);
          }
        }
        notifiedIds.push(disruption.id);
      }
    }

    if (notifiedIds.length) {
      await this.markNotified(notifiedIds);
    }
  }

  private async fetchUnnotified(): Promise<UnnotifiedDisruption[]> {
    const { data, error } = await getSupabase()
      .from('bta_disruptions')
      .select(
        'id, source, line, tag, headline, description, stops, from, until, url',
      )
      .eq('notified', false)
      .is('resolved_at', null);
    if (error) this.logger.error(`fetchUnnotified: ${error.message}`);
    return data ?? [];
  }

  private async fetchSubscribersForLine(line: string): Promise<string[]> {
    const { data: subs } = await getSupabase()
      .from('bta_subscriptions')
      .select('user_id')
      .eq('line', line);

    if (!subs?.length) return [];

    const userIds = subs.map((s) => s.user_id);

    const { data: users } = await getSupabase()
      .from('bta_users')
      .select('telegram_id')
      .in('id', userIds);

    return users?.map((u) => String(u.telegram_id)) ?? [];
  }

  private async markNotified(ids: number[]): Promise<void> {
    const { error } = await getSupabase()
      .from('bta_disruptions')
      .update({ notified: true })
      .in('id', ids);
    if (error) this.logger.error(`markNotified: ${error.message}`);
  }
}

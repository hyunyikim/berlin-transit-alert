import { Injectable, Logger } from '@nestjs/common';
import { getSupabase } from '../supabase';
import { TelegramService } from '../telegram/telegram.service';

const SBAHN_BASE = 'https://sbahn.berlin';
const SOURCE_FALLBACK_URLS: Record<string, string> = {
  bvg: 'https://www.bvg.de/en/connections/traffic-news',
  sbahn: SBAHN_BASE,
};

interface UnnotifiedDisruption {
  id: number;
  source: string;
  line: string;
  tag: string;
  headline: string;
  description: string;
  stops: string;
  until: string;
  url: string;
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
        const message = this.formatMessage(disruption);
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

  private formatMessage(d: UnnotifiedDisruption): string {
    const lines: string[] = [`⚠️ ${d.line} — ${d.tag}`, ''];
    lines.push(d.headline);
    if (d.description) lines.push(d.description);
    lines.push('');
    if (d.stops) lines.push(`📍 ${d.stops}`);
    if (d.until) lines.push(`🕐 Until ${d.until}`);
    const url =
      d.source === 'sbahn' && d.url
        ? `${SBAHN_BASE}${d.url}`
        : SOURCE_FALLBACK_URLS[d.source];
    if (url) lines.push(`🔗 ${url}`);
    return lines.join('\n').trimEnd();
  }

  private async fetchUnnotified(): Promise<UnnotifiedDisruption[]> {
    const { data, error } = await getSupabase()
      .from('bta_disruptions')
      .select('id, source, line, tag, headline, description, stops, until, url')
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

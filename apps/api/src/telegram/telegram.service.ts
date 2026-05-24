import { Injectable } from '@nestjs/common';
import { Disruption } from '../disruption-format';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { getSupabase } from '../supabase';

@Injectable()
export class TelegramService {
  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async sendMessage(telegramId: string | number, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(telegramId, text);
  }

  async upsertUser(telegramId: number): Promise<void> {
    await getSupabase()
      .from('bta_users')
      .upsert({ telegram_id: telegramId }, { onConflict: 'telegram_id' });
  }

  private async getUserId(telegramId: number): Promise<number | null> {
    const { data } = await getSupabase()
      .from('bta_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    return data?.id ?? null;
  }

  async addSubscription(
    telegramId: number,
    line: string,
  ): Promise<'added' | 'exists'> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return 'exists';
    const { error } = await getSupabase()
      .from('bta_subscriptions')
      .insert({ user_id: userId, line: line.toUpperCase() });
    return error?.code === '23505' ? 'exists' : 'added';
  }

  async removeSubscription(
    telegramId: number,
    line: string,
  ): Promise<'removed' | 'not_found'> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return 'not_found';
    const { data } = await getSupabase()
      .from('bta_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('line', line.toUpperCase())
      .select();
    return data && data.length > 0 ? 'removed' : 'not_found';
  }

  async getSubscriptions(telegramId: number): Promise<string[]> {
    const userId = await this.getUserId(telegramId);
    if (!userId) return [];
    const { data } = await getSupabase()
      .from('bta_subscriptions')
      .select('line')
      .eq('user_id', userId)
      .order('line');
    return data?.map((r) => r.line) ?? [];
  }

  async getActiveDisruptions(line: string): Promise<Disruption[]> {
    const { data } = await getSupabase()
      .from('bta_disruptions')
      .select('source, line, tag, headline, description, stops, until, url')
      .eq('line', line.toUpperCase())
      .is('resolved_at', null);
    return data ?? [];
  }
}

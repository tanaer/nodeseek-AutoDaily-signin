/**
 * 双通道通知：Telegram + PushPlus
 */
import { Env } from './types';

export class Notifier {
  static async sendTg(botToken: string, chatId: string, message: string): Promise<boolean> {
    if (!botToken || !chatId) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      return res.ok;
    } catch (e) {
      console.error('TG notify error:', e);
      return false;
    }
  }

  static async sendPushPlus(token: string, title: string, content: string): Promise<boolean> {
    if (!token) return false;
    try {
      const res = await fetch('http://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, title, content, template: 'html' }),
      });
      return res.ok;
    } catch (e) {
      console.error('PushPlus notify error:', e);
      return false;
    }
  }

  static async notify(env: Env, channel: string, title: string, message: string): Promise<boolean> {
    if (channel === 'tg' || channel === 'telegram') {
      return this.sendTg(env.TG_BOT_TOKEN, env.TG_CHAT_ID, `<b>${title}</b>\n\n${message}`);
    } else if (channel === 'pushplus') {
      return this.sendPushPlus(env.PUSHPLUS_TOKEN || '', title, message);
    }
    return false;
  }
}

/**
 * Telegram Bot 命令处理
 */
import { DB } from './db';

function genId(): string {
  return Math.random().toString(36).substring(2, 10);
}

interface TgUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

export class TelegramBot {
  private botToken: string;
  private db: DB;

  constructor(botToken: string, db: DB) {
    this.botToken = botToken;
    this.db = db;
  }

  /** 处理 Webhook 传入的 Update */
  async handleUpdate(update: TgUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/@\w+$/, ''); // 去掉 @botname

    switch (cmd) {
      case '/start':
      case '/help':
        await this.reply(chatId, this.helpText());
        break;
      case '/add_bump':
        await this.handleAddBump(chatId, parts.slice(1));
        break;
      case '/add_notify':
        await this.handleAddNotify(chatId, parts.slice(1));
        break;
      case '/list':
        await this.handleList(chatId);
        break;
      case '/delete':
        await this.handleDelete(chatId, parts.slice(1));
        break;
      default:
        // 不回复未知命令
        break;
    }
  }

  private helpText(): string {
    return [
      '🤖 <b>NodeSeek Bot 控制台</b>\n',
      '<b>自动顶贴:</b>',
      '<code>/add_bump &lt;帖子ID&gt; &lt;冷却分钟&gt;</code>',
      '帖子最后回复超过N分钟时自动顶贴\n',
      '<b>关键词监控:</b>',
      '<code>/add_notify &lt;关键字&gt; &lt;tg|pushplus&gt; &lt;冷却分钟&gt;</code>',
      '搜索关键字，有新帖时推送通知\n',
      '<b>任务管理:</b>',
      '<code>/list</code> - 查看所有任务',
      '<code>/delete &lt;任务ID&gt;</code> - 删除任务\n',
      '💡 <b>示例:</b>',
      '<code>/add_bump 12345 60</code>',
      '<code>/add_notify 服务器 tg 10</code>',
    ].join('\n');
  }

  private async handleAddBump(chatId: number, args: string[]): Promise<void> {
    if (args.length !== 2) {
      await this.reply(chatId, '⛔ 格式错误\n用法: /add_bump <帖子ID> <冷却分钟>\n示例: /add_bump 12345 60');
      return;
    }
    const threadId = args[0];
    const cooldown = parseInt(args[1]);
    if (isNaN(cooldown) || cooldown <= 0) {
      await this.reply(chatId, '⛔ 冷却时间须为正整数');
      return;
    }

    const tid = genId();
    await this.db.addBumpTask(tid, threadId, cooldown);
    await this.reply(chatId,
      `✅ <b>顶贴任务添加成功</b>\n\n` +
      `📋 编号: <code>${tid}</code>\n` +
      `🎯 帖子: ${threadId}\n` +
      `⏱ 冷却: ${cooldown} 分钟`
    );
  }

  private async handleAddNotify(chatId: number, args: string[]): Promise<void> {
    if (args.length < 3) {
      await this.reply(chatId, '⛔ 格式错误\n用法: /add_notify <关键字> <tg|pushplus> <冷却分钟>\n示例: /add_notify 服务器 tg 10');
      return;
    }
    const cooldown = parseInt(args[args.length - 1]);
    const channel = args[args.length - 2].toLowerCase();
    const keyword = args.slice(0, -2).join(' ');

    if (isNaN(cooldown) || cooldown <= 0) {
      await this.reply(chatId, '⛔ 冷却时间须为正整数');
      return;
    }
    if (!['tg', 'telegram', 'pushplus'].includes(channel)) {
      await this.reply(chatId, '⛔ 通知渠道支持: tg / pushplus');
      return;
    }

    const tid = genId();
    await this.db.addMonitorTask(tid, keyword, channel, cooldown);
    await this.reply(chatId,
      `✅ <b>监控任务添加成功</b>\n\n` +
      `📋 编号: <code>${tid}</code>\n` +
      `🔍 关键字: ${keyword}\n` +
      `📢 渠道: ${channel}\n` +
      `⏱ 冷却: ${cooldown} 分钟`
    );
  }

  private async handleList(chatId: number): Promise<void> {
    const tasks = await this.db.getAllTasks();
    const keys = Object.keys(tasks);
    if (keys.length === 0) {
      await this.reply(chatId, '📭 当前没有任何任务');
      return;
    }

    const lines: string[] = ['📝 <b>任务列表</b>\n'];
    for (const tid of keys) {
      const t = tasks[tid];
      const cd = await this.db.isInCooldown(tid);
      const status = cd ? '⏳冷却中' : '🟢活跃';
      if (t.type === 'bump') {
        lines.push(`<code>${tid}</code> 🆙 帖号:${t.thread_id} | ${t.cooldown}分 | ${status}`);
      } else if (t.type === 'monitor') {
        lines.push(`<code>${tid}</code> 🔍 词:${t.keyword} | ${t.channel} | ${t.cooldown}分 | ${status}`);
      }
    }
    await this.reply(chatId, lines.join('\n'));
  }

  private async handleDelete(chatId: number, args: string[]): Promise<void> {
    if (args.length !== 1) {
      await this.reply(chatId, '⛔ 用法: /delete <任务ID>');
      return;
    }
    const ok = await this.db.deleteTask(args[0]);
    if (ok) {
      await this.reply(chatId, `✅ 任务 <code>${args[0]}</code> 已删除`);
    } else {
      await this.reply(chatId, `❌ 未找到任务 ${args[0]}`);
    }
  }

  private async reply(chatId: number, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }
}

/**
 * Cloudflare Worker 入口
 * - fetch handler: 接收 Telegram Webhook + 提供管理路由
 * - scheduled handler: Cron 定时执行巡检任务
 */

import { DB } from './db';
import { NodeSeek } from './nodeseek';
import { TelegramBot } from './telegram';
import { Notifier } from './notifier';
import { Env } from './types';

export { Env };

export default {
  /**
   * HTTP 请求处理 (Telegram Webhook + 管理路由)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ─── 注册 Webhook ───
    if (url.pathname === '/register') {
      const workerUrl = env.WORKER_URL || url.origin;
      const webhookUrl = `${workerUrl}/webhook`;
      const setUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

      const res = await fetch(setUrl);
      const data: any = await res.json();

      if (data.ok) {
        return new Response(
          `✅ Webhook 注册成功!\n\nWebhook URL: ${webhookUrl}\n\n现在可以去 Telegram 和 Bot 对话了。`,
          { status: 200 }
        );
      }
      return new Response(`❌ 注册失败: ${JSON.stringify(data)}`, { status: 500 });
    }

    // ─── Telegram Webhook ───
    if (url.pathname === '/webhook' && request.method === 'POST') {
      // 可选验证密钥
      if (env.WEBHOOK_SECRET) {
        const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secret !== env.WEBHOOK_SECRET) {
          return new Response('Unauthorized', { status: 403 });
        }
      }

      try {
        const update = await request.json();
        const db = new DB(env.REDIS_URL);
        const bot = new TelegramBot(env.TG_BOT_TOKEN, db);
        await bot.handleUpdate(update as any);
      } catch (e) {
        console.error('Webhook error:', e);
      }
      return new Response('OK');
    }

    // ─── 手动触发巡检（调试用） ───
    if (url.pathname === '/check') {
      await runScheduledTasks(env);
      return new Response('✅ 巡检完成');
    }

    // ─── 健康检查 ───
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'NodeSeek Bot Worker',
        routes: ['/register', '/webhook', '/check'],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  },

  /**
   * Cron 定时触发 (wrangler.toml 中配置)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledTasks(env));
  },
};

/**
 * 执行所有巡检任务
 */
async function runScheduledTasks(env: Env): Promise<void> {
  const db = new DB(env.REDIS_URL);
  const ns = new NodeSeek(env.NS_COOKIE);

  const tasks = await db.getAllTasks();

  for (const [tid, task] of Object.entries(tasks)) {
    try {
      const inCooldown = await db.isInCooldown(tid);
      if (inCooldown) continue;

      if (task.type === 'bump') {
        await handleBumpTask(tid, task, db, ns, env);
      } else if (task.type === 'monitor') {
        await handleMonitorTask(tid, task, db, ns, env);
      }
    } catch (e) {
      console.error(`Task ${tid} error:`, e);
    }
  }
}

async function handleBumpTask(
  tid: string,
  task: { thread_id: string; cooldown: number },
  db: DB,
  ns: NodeSeek,
  env: Env
): Promise<void> {
  const diffMins = await ns.getLastReplyMinutes(task.thread_id);
  if (diffMins < 0) {
    console.log(`⚠️ 无法获取帖子 ${task.thread_id} 信息`);
    return;
  }

  console.log(`顶贴检查: 帖子 ${task.thread_id} 最后回复 ${diffMins.toFixed(1)} 分钟前 (阈值 ${task.cooldown})`);

  if (diffMins >= task.cooldown) {
    const ok = await ns.bumpThread(task.thread_id);
    if (ok) {
      console.log(`✅ 帖子 ${task.thread_id} 顶贴成功`);
      await db.setCooldown(tid, task.cooldown);
      await Notifier.notify(env, 'tg', '🆙 自动顶贴完成',
        `任务: <code>${tid}</code>\n帖子: ${task.thread_id}\n距上次回复: ${diffMins.toFixed(0)} 分钟`
      );
    } else {
      console.log(`❌ 帖子 ${task.thread_id} 顶贴失败`);
    }
  }
}

async function handleMonitorTask(
  tid: string,
  task: { keyword: string; channel: string; cooldown: number },
  db: DB,
  ns: NodeSeek,
  env: Env
): Promise<void> {
  const result = await ns.searchLatest(task.keyword);
  if (!result) return;

  // 防止重复通知
  const lastRecorded = await db.getLastPostTime(task.keyword);
  if (lastRecorded === result.timeStr) return;

  // 仅通知"新帖"
  if (result.diffMinutes <= task.cooldown) {
    const msg = [
      `🔍 <b>关键字:</b> ${task.keyword}`,
      `🏷 <b>标题:</b> ${result.title}`,
      `🔗 <a href="${result.link}">点击直达</a>`,
      `🕒 <b>距今:</b> ${result.diffMinutes.toFixed(1)} 分钟`,
    ].join('\n');

    console.log(`监控命中: [${task.keyword}] → ${result.title}`);
    await Notifier.notify(env, task.channel, `💡 新帖通知 (${task.keyword})`, msg);
    await db.setLastPostTime(task.keyword, result.timeStr);
    await db.setCooldown(tid, task.cooldown);
  }
}

/**
 * 一键注册 Webhook 脚本
 * 用法: WORKER_URL=https://your-worker.workers.dev TG_BOT_TOKEN=xxx node scripts/register-webhook.mjs
 */
const workerUrl = process.env.WORKER_URL;
const botToken = process.env.TG_BOT_TOKEN;

if (!workerUrl || !botToken) {
  console.error('请设置环境变量: WORKER_URL, TG_BOT_TOKEN');
  process.exit(1);
}

const webhookUrl = `${workerUrl}/webhook`;
const apiUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

fetch(apiUrl)
  .then((r) => r.json())
  .then((data) => {
    if (data.ok) {
      console.log(`✅ Webhook 注册成功: ${webhookUrl}`);
    } else {
      console.error('❌ 注册失败:', data);
    }
  })
  .catch(console.error);

/**
 * 全局类型定义
 */
export interface Env {
  TG_BOT_TOKEN: string;
  TG_CHAT_ID: string;
  NS_COOKIE: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  WORKER_URL: string;
  PUSHPLUS_TOKEN?: string;
  WEBHOOK_SECRET?: string;
}

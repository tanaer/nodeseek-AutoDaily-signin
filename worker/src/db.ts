/**
 * Upstash Redis 数据管理层（REST API）
 * 负责任务 CRUD 和冷却时间管理
 */

export interface BumpTask {
  type: 'bump';
  thread_id: string;
  cooldown: number; // 分钟
  created_at: number;
}

export interface MonitorTask {
  type: 'monitor';
  keyword: string;
  channel: string; // tg | pushplus
  cooldown: number; // 分钟
  created_at: number;
}

export type Task = BumpTask | MonitorTask;

export class DB {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  /** 发送 Upstash Redis REST 命令 */
  private async cmd(...args: string[]): Promise<any> {
    const res = await fetch(`${this.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const data: any = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  /** Pipeline: 批量执行命令 */
  private async pipeline(commands: string[][]): Promise<any[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    const data: any = await res.json();
    return data.map((d: any) => d.result);
  }

  async addBumpTask(taskId: string, threadId: string, cooldown: number): Promise<boolean> {
    const task: BumpTask = {
      type: 'bump',
      thread_id: threadId,
      cooldown,
      created_at: Date.now(),
    };
    await this.cmd('HSET', 'ns_tasks', taskId, JSON.stringify(task));
    return true;
  }

  async addMonitorTask(taskId: string, keyword: string, channel: string, cooldown: number): Promise<boolean> {
    const task: MonitorTask = {
      type: 'monitor',
      keyword,
      channel,
      cooldown,
      created_at: Date.now(),
    };
    await this.cmd('HSET', 'ns_tasks', taskId, JSON.stringify(task));
    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const res = await this.cmd('HDEL', 'ns_tasks', taskId);
    return res > 0;
  }

  async getAllTasks(): Promise<Record<string, Task>> {
    const raw = await this.cmd('HGETALL', 'ns_tasks');
    const tasks: Record<string, Task> = {};
    if (!raw) return tasks;
    // HGETALL 返回 [key, val, key, val, ...]
    for (let i = 0; i < raw.length; i += 2) {
      tasks[raw[i]] = JSON.parse(raw[i + 1]);
    }
    return tasks;
  }

  async isInCooldown(taskId: string): Promise<boolean> {
    const res = await this.cmd('EXISTS', `cooldown:${taskId}`);
    return res > 0;
  }

  async setCooldown(taskId: string, minutes: number): Promise<void> {
    if (minutes <= 0) return;
    await this.cmd('SETEX', `cooldown:${taskId}`, String(Math.floor(minutes * 60)), '1');
  }

  async getLastPostTime(keyword: string): Promise<string | null> {
    return await this.cmd('GET', `last_post_time:${keyword}`);
  }

  async setLastPostTime(keyword: string, timeStr: string): Promise<void> {
    await this.cmd('SETEX', `last_post_time:${keyword}`, String(7 * 24 * 3600), timeStr);
  }
}

/**
 * NodeSeek HTTP 客户端
 * 通过 fetch + Cookie 直接与 NodeSeek 交互，无需浏览器
 */

const RANDOM_COMMENTS = [
  'bd', '绑定', '帮顶', '好价', '前排', '公道公道',
  '还可以', '挺不错的 bdbd', '好价 好价', '祝早出',
  '观望一下 早出', 'bd一下', '顶一下', '支持支持',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class NodeSeek {
  private cookie: string;

  constructor(cookie: string) {
    this.cookie = cookie;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'User-Agent': UA,
      Cookie: this.cookie,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...extra,
    };
  }

  /**
   * 获取帖子最后回复距今的分钟数
   */
  async getLastReplyMinutes(threadId: string): Promise<number> {
    try {
      const res = await fetch(`https://www.nodeseek.com/post-${threadId}-1`, {
        headers: this.headers(),
        redirect: 'follow',
      });
      if (!res.ok) {
        console.error(`Fetch thread ${threadId} failed: ${res.status}`);
        return -1;
      }

      const html = await res.text();

      // 从 HTML 中提取所有 <time datetime="..."> 标签
      const timeRegex = /<time[^>]+datetime="([^"]+)"/g;
      let lastMatch: string | null = null;
      let m: RegExpExecArray | null;
      while ((m = timeRegex.exec(html)) !== null) {
        lastMatch = m[1];
      }

      if (!lastMatch) return -1;

      const postTime = new Date(lastMatch).getTime();
      const now = Date.now();
      return (now - postTime) / 60000;
    } catch (e) {
      console.error(`getLastReplyMinutes error for ${threadId}:`, e);
      return -1;
    }
  }

  /**
   * 从页面提取 CSRF Token
   */
  private extractCsrfToken(html: string): string | null {
    // 方案1: 从 meta 标签提取
    const metaMatch = html.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i);
    if (metaMatch) return metaMatch[1];
    // 方案2: 从 window 对象提取
    const windowMatch = html.match(/csrfToken["']?\s*[:=]\s*["']([^"']+)["']/);
    if (windowMatch) return windowMatch[1];
    // 方案3: 从 cookie 中提取 (有些站用 cookie 存 csrf)
    const cookieMatch = this.cookie.match(/(?:csrf|token)=([^;]+)/i);
    if (cookieMatch) return cookieMatch[1];
    return null;
  }

  /**
   * 顶贴：发送评论到指定帖子
   */
  async bumpThread(threadId: string, content?: string): Promise<boolean> {
    try {
      // 先获取页面提取 CSRF Token
      const pageRes = await fetch(`https://www.nodeseek.com/post-${threadId}-1`, {
        headers: this.headers(),
      });
      const pageHtml = await pageRes.text();

      // 提取帖子的 post_id (需要传给评论 API)
      const postIdMatch = pageHtml.match(/data-post-id="(\d+)"/);
      const csrfToken = this.extractCsrfToken(pageHtml);

      const commentText = content || RANDOM_COMMENTS[Math.floor(Math.random() * RANDOM_COMMENTS.length)];

      const apiHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Origin: 'https://www.nodeseek.com',
        Referer: `https://www.nodeseek.com/post-${threadId}-1`,
      };
      if (csrfToken) {
        apiHeaders['Csrf-Token'] = csrfToken;
      }

      const body: any = {
        content: commentText,
      };

      // 如果解析到 post_id，传递它
      if (postIdMatch) {
        body.post_id = parseInt(postIdMatch[1]);
      }

      const res = await fetch('https://www.nodeseek.com/api/content/new-comment', {
        method: 'POST',
        headers: this.headers(apiHeaders),
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data: any = await res.json();
        console.log(`Bump thread ${threadId} response:`, JSON.stringify(data));
        return data.success !== false;
      } else {
        console.error(`Bump thread ${threadId} failed: ${res.status}`);
        return false;
      }
    } catch (e) {
      console.error(`bumpThread error for ${threadId}:`, e);
      return false;
    }
  }

  /**
   * 搜索关键词，返回最新结果
   */
  async searchLatest(keyword: string): Promise<{
    title: string;
    link: string;
    timeStr: string;
    diffMinutes: number;
  } | null> {
    try {
      const q = encodeURIComponent(keyword);
      const res = await fetch(`https://www.nodeseek.com/search?q=${q}`, {
        headers: this.headers(),
        redirect: 'follow',
      });
      if (!res.ok) return null;

      const html = await res.text();

      // 解析第一个搜索结果
      // 标题和链接
      const titleMatch = html.match(/<a[^>]+href="(\/post-\d+-\d+)"[^>]*class="[^"]*post-title[^"]*"[^>]*>([^<]+)<\/a>/);
      if (!titleMatch) {
        // 备选: 更宽泛地匹配帖子链接
        const altMatch = html.match(/<a[^>]+href="(\/post-\d+-\d+)"[^>]*>([^<]{2,})<\/a>/);
        if (!altMatch) return null;
        return this.parseSearchResult(altMatch[1], altMatch[2], html);
      }

      return this.parseSearchResult(titleMatch[1], titleMatch[2], html);
    } catch (e) {
      console.error(`searchLatest error for '${keyword}':`, e);
      return null;
    }
  }

  private parseSearchResult(
    link: string,
    title: string,
    html: string
  ): { title: string; link: string; timeStr: string; diffMinutes: number } | null {
    // 找到该链接附近的时间标签
    const linkPos = html.indexOf(link);
    const nearbyHtml = html.substring(Math.max(0, linkPos - 200), linkPos + 500);
    const timeMatch = nearbyHtml.match(/<time[^>]+datetime="([^"]+)"/);
    if (!timeMatch) return null;

    const timeStr = timeMatch[1];
    const postTime = new Date(timeStr).getTime();
    const diffMinutes = (Date.now() - postTime) / 60000;

    return {
      title: title.trim(),
      link: `https://www.nodeseek.com${link}`,
      timeStr,
      diffMinutes,
    };
  }
}

# NodeSeek 自动签到 - GitHub Actions 版

基于 GitHub Actions 的 NodeSeek 论坛自动化工具，无需服务器，Fork 即用。

## 功能

- ✅ 自动签到 + 领取奖励
- 💬 随机评论交易区帖子（5-10 篇）
- 📱 Telegram 执行结果通知
- 🔄 失败自动重试
- 🔐 Cookie 过期检测告警

## 快速开始

1. Fork 本仓库
2. 在 `Settings → Secrets` 中添加：

| Secret | 必填 | 说明 |
|--------|------|------|
| `NS_COOKIE` | ✅ | NodeSeek 登录 Cookie |
| `NS_RANDOM` | ❌ | 设为 `true` 启用"试试手气" |
| `TG_BOT_TOKEN` | ❌ | Telegram Bot Token |
| `TG_CHAT_ID` | ❌ | Telegram Chat ID |

3. Actions 将每天 **北京时间 00:30** 自动执行

## 配置说明

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `NS_COOKIE` | - | NodeSeek Cookie（必需） |
| `NS_RANDOM` | `false` | `true`: 试试手气 / `false`: 鸡腿 x 5 |
| `HEADLESS` | `true` | 无头模式 |
| `TG_BOT_TOKEN` | - | Telegram 通知 |
| `TG_CHAT_ID` | - | Telegram 通知 |

## 通知示例

```
🎯 NodeSeek 自动任务完成

📝 签到状态: ✅ 成功
💬 评论数量: 7 条

⏰ 执行时间: 北京时间 2026-02-08 00:30:00
```

## License

MIT

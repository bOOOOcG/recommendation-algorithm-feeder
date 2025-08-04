# 观看历史记录

这个文件夹用于存储视频观看历史和统计信息。

## 文件说明

- `watch-history.jsonl` - 观看历史记录（JSONL格式，每行一个记录）
- `watch-stats.json` - 统计信息汇总
- `.gitkeep` - 确保目录被Git跟踪

## 数据格式

### 观看历史记录格式
```json
{
  "timestamp": "2025-08-02T12:00:00.000Z",
  "video": {
    "id": "BV1234567890",
    "title": "视频标题",
    "author": "UP主名称",
    "url": "https://www.bilibili.com/video/BV1234567890",
    "duration": 300,
    "tags": ["标签1", "标签2"]
  },
  "playDuration": 30000,
  "matchedKeywords": ["关键词1", "关键词2"],
  "source": "home",
  "sessionId": "session-123"
}
```

### 统计信息格式
```json
{
  "totalVideos": 100,
  "totalPlayTime": 3000000,
  "keywordStats": {
    "关键词1": 50,
    "关键词2": 30
  },
  "sourceStats": {
    "home": 60,
    "related": 30,
    "short": 10
  },
  "dailyStats": {
    "2025-08-02": 10,
    "2025-08-01": 8
  },
  "topAuthors": {
    "UP主1": 20,
    "UP主2": 15
  }
}
```

## 功能特性

- 📝 详细记录每个观看的视频信息
- 📊 自动生成统计报告
- 🔍 支持历史记录搜索
- 🧹 自动清理过期记录
- 📈 多维度数据分析

## 隐私说明

- 历史记录仅存储在本地
- 不会上传到任何服务器
- 包含敏感信息，已被.gitignore排除
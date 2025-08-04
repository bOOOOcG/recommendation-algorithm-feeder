# Recommendation Algorithm Feeder

**[English](README.md) | 中文**

> 面向研究的用户行为模拟工具，用于研究和影响视频推荐系统。

一个开源框架，通过模拟结构化用户交互来探索视频平台推荐算法的行为。专为个人信息流定制、测试和算法透明度研究而设计。

## 功能特性

- **多平台支持**：Bilibili、YouTube（扩展中）
- **智能匹配**：基于关键词的视频筛选，支持多种匹配模式
- **API模式**：直接调用平台推荐API，高效稳定
- **模拟播放**：无需实际播放视频，可配置播放速度和时长
- **高性能并发处理**：支持多线程同时处理，可配置并发数量
  - **性能实例**：10并发 + 模拟播放 = 2分钟内处理121.5分钟的视频内容
- **主动搜索**：推荐效果不佳时自动触发关键词搜索
- **智能队列**：自动管理视频处理队列，避免重复处理
- **多源推荐**：支持首页、相关推荐、短视频等多种内容源
- **历史记录**：完整的观看历史和匹配统计数据
- **灵活配置**：50+可配置参数，适应不同使用场景

## 项目结构

```
recommendation-algorithm-feeder/
├── src/
│   ├── core/                    # 核心架构
│   │   ├── feeder.ts           # 主控制器
│   │   └── logger.ts           # 日志系统
│   ├── platforms/              # 平台适配器
│   │   ├── bilibili/           # Bilibili 实现
│   │   ├── youtube/            # YouTube 实现
│   │   └── platform-factory.ts # 平台工厂
│   ├── services/               # 业务服务
│   │   ├── concurrent-player.ts        # 并发处理
│   │   ├── simulated-playback-manager.ts # 模拟播放
│   │   ├── history-service.ts           # 历史记录
│   │   └── match-service.ts             # 匹配服务
│   ├── matchers/               # 匹配算法
│   ├── config/                 # 配置管理
│   ├── utils/                  # 工具函数
│   └── types/                  # 类型定义
├── tests/                      # 测试代码
├── docs/                       # 文档
├── cookies/                    # Cookie 存储
├── history/                    # 历史数据
└── logs/                       # 日志文件
```

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的目标关键词和设置

# 创建 cookies 目录并添加平台 Cookie
mkdir cookies
# 将 Bilibili Cookie 放入: cookies/bilibili.txt
# 将 YouTube Cookie 放入: cookies/youtube.txt
```

### 3. 运行程序
```bash
npm run dev
```

详细使用说明请查看 [docs/usage.zh-CN.md](docs/usage.zh-CN.md)

## 核心配置选项

### 基础配置
- **平台选择**：`PLATFORM` - 支持 bilibili/youtube
- **目标关键词**：`TARGET_KEYWORDS` - 逗号分隔的关键词列表
- **匹配模式**：`MATCH_MODE` - any（任意匹配）或 all（全部匹配）
- **执行轮数**：`BROWSE_COUNT` - 总执行轮数
- **播放时长**：`PLAY_DURATION` - 每个视频播放时长（秒）

### 高效模式
- **API模式**：`USE_API_MODE` - 直接调用平台API，无需浏览器渲染
- **模拟播放**：`USE_SIMULATED_PLAYBACK` - 模拟播放行为，节省带宽
- **播放速度**：`SIMULATED_PLAYBACK_SPEED` - 模拟播放的倍速（1-5倍）
- **并发数量**：`CONCURRENT_PLAYERS` - 同时处理的视频数量（1-10+个）  
- **超高性能**：模拟播放模式下，同等时间内可处理60倍以上的内容量

### 智能功能
- **主动搜索**：`ENABLE_ACTIVE_SEARCH` - 推荐效果不佳时自动搜索
- **搜索阈值**：`ACTIVE_SEARCH_THRESHOLD` - 触发搜索的连续未匹配轮数
- **队列管理**：`MAX_VIDEOS_PER_QUEUE` - 每轮最多处理的视频数
- **视频源切换**：`INITIAL_VIDEO_SOURCE` - home/related/short

### 系统配置
- **无头模式**：`HEADLESS` - 后台运行，不显示浏览器界面
- **日志级别**：`LOG_LEVEL` - error/warn/info/debug
- **历史记录**：`HISTORY_CLEANUP_DAYS` - 历史数据保留天数
- **代理支持**：`HTTP_PROXY`/`HTTPS_PROXY` - 网络代理配置

## 架构设计

项目采用模块化设计，易于扩展：

- **核心模块**：`AlgorithmFeeder` 主控制器，协调所有组件
- **平台接口**：`PlatformInterface` 抽象层，支持 Bilibili/YouTube 扩展
- **匹配服务**：`MatchService` 智能关键词匹配和筛选
- **并发处理**：`ConcurrentPlayer` 多线程视频处理
- **模拟播放**：`SimulatedPlaybackManager` 高效的播放模拟
- **历史服务**：`HistoryService` 完整的数据记录和统计
- **配置管理**：统一的配置加载、验证和向导
- **日志系统**：分级日志输出和文件记录

## 使用说明

详细配置和使用方法请参考：
- [完整使用指南](docs/usage.zh-CN.md) - 详细的配置说明

## 免责声明

本工具仅用于个人学习和研究目的，用于主动调整个人的推荐算法偏好。请遵守相关平台的服务条款，理性使用。

## 许可证

AGPL-3.0 License
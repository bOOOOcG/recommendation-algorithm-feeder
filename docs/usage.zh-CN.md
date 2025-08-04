# 使用指南

## 快速开始

### 1. 安装项目
```bash
git clone https://github.com/bOOOOcG/recommendation-algorithm-feeder.git
cd recommendation-algorithm-feeder
npm install
```

### 2. 配置环境
```bash
# 创建配置文件
touch .env
# 或在 Windows 下
echo. > .env

# 创建 cookies 目录
mkdir cookies

# 根据下方的配置示例编辑 .env 文件
```

### 3. 获取平台 Cookie

#### Bilibili Cookie:
1. 登录 https://www.bilibili.com
2. 按 F12 打开开发者工具
3. 切换到 Network 标签页
4. 刷新页面
5. 找到任意请求，在 Request Headers 中复制 Cookie 值
6. 保存到 cookies/bilibili.txt

#### YouTube Cookie:
1. 登录 https://www.youtube.com
2. 按相同方法获取 Cookie
3. 保存到 cookies/youtube.txt

### 4. 运行程序
```bash
npm run dev
```

## 配置参数详解

### 中文配置示例

#### 基础配置
```env
# 平台选择
PLATFORM=bilibili                    # bilibili | youtube

# 目标关键词（必填）
TARGET_KEYWORDS=编程,算法,数据科学,人工智能

# 匹配模式
MATCH_MODE=any                       # any: 匹配任意关键词 | all: 匹配所有关键词
CASE_SENSITIVE=false                 # 是否区分大小写

# 执行参数
BROWSE_COUNT=50                      # 总执行轮数
PLAY_DURATION=30                     # 视频播放时长（秒）
SEARCH_INTERVAL=30                   # 搜索间隔（秒）
```

## 运行模式详解

### 无头模式 vs 浏览器模式
```env
# 无头模式（推荐）
HEADLESS=true
```
- **无头模式 (HEADLESS=true)**：后台运行，不显示浏览器界面
  - 优点：节省系统资源，运行速度快，可以在服务器上运行
  - 缺点：无法看到实际操作过程，调试相对困难
  - 适用场景：生产环境、长时间运行、资源有限的环境

- **浏览器模式 (HEADLESS=false)**：显示浏览器界面，可以看到操作过程
  - 优点：直观看到程序操作，便于调试和理解流程
  - 缺点：占用更多系统资源，需要图形界面环境
  - 适用场景：开发调试、第一次使用、需要监控操作过程

### API模式 vs 浏览器抓取模式
```env
# API模式（推荐）
USE_API_MODE=true
API_TIMEOUT=30000                    # API请求超时时间（毫秒）
```
- **API模式 (USE_API_MODE=true)**：直接调用平台官方API获取推荐数据
  - 优点：速度快、稳定性高、资源占用少、不受页面变化影响
  - 缺点：依赖API接口稳定性
  - 工作原理：直接请求 Bilibili/YouTube 的推荐接口，解析JSON数据

- **浏览器抓取模式 (USE_API_MODE=false)**：启动浏览器访问页面抓取数据
  - 优点：更接近真实用户行为
  - 缺点：速度慢、资源占用大、可能受页面结构变化影响
  - 工作原理：打开浏览器，访问网页，解析HTML内容

### 模拟播放 vs 真实播放
```env
# 模拟播放（推荐）
USE_SIMULATED_PLAYBACK=true          # 启用模拟播放
SIMULATED_PLAYBACK_SPEED=2           # 播放速度倍数（1-5）
SIMULATED_WATCH_DURATION=30          # 向平台报告的观看时长（秒）
SIMULATED_ACTUAL_WAIT_TIME=10           # 每个视频的实际处理耗时（秒）
SIMULATED_DURATION_VARIATION=5       # 时长随机变化（百分比）
```
- **模拟播放 (USE_SIMULATED_PLAYBACK=true)**：不实际播放视频，只发送播放心跳
  - 优点：节省带宽、速度快、可设置播放倍速、资源占用极低
  - **性能优势**：由于无需实际播放视频，可以开启高并发（10+ 并发播放器）而完全不影响系统性能
  - 工作原理：向平台发送观看进度心跳包，模拟正在观看视频
  - 参数说明：
    - `SIMULATED_PLAYBACK_SPEED=2`：2倍速模拟，实际等待时间是视频时长的1/2
    - `SIMULATED_WATCH_DURATION=30`：告诉平台观看了30秒
    - `SIMULATED_ACTUAL_WAIT_TIME=10`：每个视频实际处理10秒后再处理下一个

- **真实播放 (USE_SIMULATED_PLAYBACK=false)**：真实加载和播放视频
  - 优点：完全模拟真实用户行为
  - 缺点：消耗大量带宽、速度慢、占用系统资源多
  - 工作原理：实际打开视频页面，加载视频流，静音播放

### 并发处理
```env
# 并发配置
CONCURRENT_PLAYERS=3                 # 并发处理器数量（1-10）
PLAYER_START_DELAY=5000             # 播放器启动延迟（毫秒）
```
- **单线程 (CONCURRENT_PLAYERS=1)**：一次只处理一个视频
  - 优点：对平台压力小、不容易被检测、稳定性高
  - 缺点：处理速度慢
  - 适用场景：保守使用、新账户、网络环境不稳定

- **多线程 (CONCURRENT_PLAYERS=3-10+)**：同时处理多个视频
  - 优点：处理效率高、节省总体时间
  - 缺点：对平台压力较大、可能增加被检测风险
  - 适用场景：成熟账户、网络环境良好、追求效率
  - **配合模拟播放**：可以安全使用10+并发播放器，对系统性能影响极小
  - **配合真实播放**：建议3-5个并发，受系统资源限制

### 推荐配置组合

#### 高效安全组合（推荐）
```env
HEADLESS=true                        # 无头模式
USE_API_MODE=true                    # API模式
USE_SIMULATED_PLAYBACK=true          # 模拟播放
SIMULATED_PLAYBACK_SPEED=2           # 2倍速
CONCURRENT_PLAYERS=5                 # 5个并发（模拟播放模式下可以更高）
```

#### 保守安全组合
```env
HEADLESS=true                        # 无头模式
USE_API_MODE=true                    # API模式
USE_SIMULATED_PLAYBACK=true          # 模拟播放
SIMULATED_PLAYBACK_SPEED=1           # 1倍速（真实时间）
CONCURRENT_PLAYERS=1                 # 单线程
```

#### 高性能组合（高级用户）
```env
HEADLESS=true                        # 无头模式
USE_API_MODE=true                    # API模式
USE_SIMULATED_PLAYBACK=true          # 模拟播放
SIMULATED_PLAYBACK_SPEED=3           # 3倍速
CONCURRENT_PLAYERS=10                # 10个并发（模拟播放模式下高性能运行）
```

#### 调试开发组合
```env
HEADLESS=false                       # 显示浏览器
USE_API_MODE=false                   # 浏览器抓取
USE_SIMULATED_PLAYBACK=false         # 真实播放
CONCURRENT_PLAYERS=1                 # 单线程
```

### 智能功能配置
```env
# 主动搜索
ENABLE_ACTIVE_SEARCH=true            # 启用主动搜索
ACTIVE_SEARCH_THRESHOLD=10           # 连续未匹配多少轮后触发搜索
ACTIVE_SEARCH_STRATEGY=keyword       # keyword: 关键词搜索 | random: 随机搜索

# 队列管理
MAX_VIDEOS_PER_QUEUE=5              # 每轮最多处理的视频数量
MAX_QUEUE_SIZE=20                   # 队列最大容量

# 视频源配置
INITIAL_VIDEO_SOURCE=home           # home: 首页推荐 | related: 相关推荐 | short: 短视频
VIDEOS_PER_PAGE=12                  # 每页获取的视频数量（1-30）
```

### 系统配置
```env
# 浏览器设置
HEADLESS=true                       # 无头模式，后台运行
BROWSER_TYPE=chrome                 # chrome | firefox | edge
ACTION_DELAY=3000                   # 操作延迟（毫秒）

# 日志配置
LOG_LEVEL=info                      # error | warn | info | debug
LOG_TO_FILE=true                   # 是否保存到日志文件

# 数据管理
HISTORY_CLEANUP_DAYS=30             # 历史记录保留天数
MAX_VIDEOS_PER_SESSION=1000         # 单次会话最大处理视频数
RETRY_ATTEMPTS=3                    # 失败重试次数

# 代理设置（可选）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

## 运行模式

### 开发模式
```bash
npm run dev
```
实时显示运行状态

### 生产模式
```bash
npm run build
npm start
```
编译后运行，性能更好

### 测试连接
```bash
npm run test-bilibili    # 测试 Bilibili 连接
npm run test-youtube     # 测试 YouTube 连接
npm run test-cookies     # 验证 Cookie 有效性
```

### 查看历史
```bash
npm run view-history     # 查看观看历史和统计
```

## 常见问题

### Cookie 失效怎么办？
重新登录平台，获取新的 Cookie 并更新配置文件

### 找不到匹配的视频？
- 调整关键词，使用更通用的词汇
- 启用主动搜索功能
- 增加执行轮数

### 程序运行太慢？
- 启用 API 模式和模拟播放
- 增加并发处理器数量
- 使用无头模式

## 注意事项

1. 保护隐私：Cookie 包含登录信息，请妥善保管
2. 遵守规则：仅用于个人推荐算法调优，不得恶意使用
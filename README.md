# Recommendation Algorithm Feeder

**English | [中文](README.zh-CN.md)**

> A research-oriented tool for simulating user behavior to study and influence video recommendation systems.

An open-source framework to explore the behavior of video platform recommendation algorithms by simulating structured user interactions. Designed for personal feed customization, testing, and algorithm transparency research.

## Features

- **Multi-platform Support**: Bilibili, YouTube (expanding)
- **Smart Matching**: Keyword-based video filtering with multiple matching modes
- **API Mode**: Direct platform API calls for efficiency and stability
- **Simulated Playback**: No actual video playback required, configurable speed and duration
- **High-Performance Concurrent Processing**: Multi-threaded processing with configurable concurrency
  - **Performance Example**: 10 concurrent + simulated playback = 121.5 minutes of video processing in just 2 minutes
- **Active Search**: Automatic keyword search when recommendation effectiveness is poor
- **Smart Queue**: Automatic video processing queue management, avoiding duplicates
- **Multi-source Recommendations**: Support for homepage, related, shorts and other content sources
- **History Tracking**: Complete viewing history and matching statistics
- **Flexible Configuration**: 50+ configurable parameters for different use cases

## Project Structure

```
recommendation-algorithm-feeder/
├── src/
│   ├── core/                    # Core architecture
│   │   ├── feeder.ts           # Main controller
│   │   └── logger.ts           # Logging system
│   ├── platforms/              # Platform adapters
│   │   ├── bilibili/           # Bilibili implementation
│   │   ├── youtube/            # YouTube implementation
│   │   └── platform-factory.ts # Platform factory
│   ├── services/               # Business services
│   │   ├── concurrent-player.ts        # Concurrent processing
│   │   ├── simulated-playback-manager.ts # Simulated playback
│   │   ├── history-service.ts           # History tracking
│   │   └── match-service.ts             # Matching service
│   ├── matchers/               # Matching algorithms
│   ├── config/                 # Configuration management
│   ├── utils/                  # Utility functions
│   └── types/                  # Type definitions
├── tests/                      # Test code
├── docs/                       # Documentation
├── cookies/                    # Cookie storage
├── history/                    # Historical data
└── logs/                       # Log files
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env file with your target keywords and settings

# Create cookies directory and add your platform cookies
mkdir cookies
# Place your Bilibili cookie in: cookies/bilibili.txt
# Place your YouTube cookie in: cookies/youtube.txt
```

### 3. Run Program
```bash
npm run dev
```

For detailed usage instructions, see [docs/usage.md](docs/usage.md)

## Core Configuration Options

### Basic Configuration
- **Platform Selection**: `PLATFORM` - Supports bilibili/youtube
- **Target Keywords**: `TARGET_KEYWORDS` - Comma-separated keyword list
- **Match Mode**: `MATCH_MODE` - any (match any keyword) or all (match all keywords)
- **Execution Rounds**: `BROWSE_COUNT` - Total execution rounds
- **Play Duration**: `PLAY_DURATION` - Video playback duration per video (seconds)

### Efficiency Mode
- **API Mode**: `USE_API_MODE` - Direct platform API calls, no browser rendering needed
- **Simulated Playback**: `USE_SIMULATED_PLAYBACK` - Simulate playback behavior, save bandwidth
- **Playback Speed**: `SIMULATED_PLAYBACK_SPEED` - Simulated playback speed multiplier (1-5x)
- **Concurrent Count**: `CONCURRENT_PLAYERS` - Number of videos processed simultaneously (1-10+)
- **Ultra-High Performance**: With simulated playback, process 60x more content in the same time

### Smart Features
- **Active Search**: `ENABLE_ACTIVE_SEARCH` - Automatic search when recommendations are ineffective
- **Search Threshold**: `ACTIVE_SEARCH_THRESHOLD` - Consecutive unmatched rounds to trigger search
- **Queue Management**: `MAX_VIDEOS_PER_QUEUE` - Maximum videos processed per round
- **Video Source Switching**: `INITIAL_VIDEO_SOURCE` - home/related/short

### System Configuration
- **Headless Mode**: `HEADLESS` - Run in background without browser interface
- **Log Level**: `LOG_LEVEL` - error/warn/info/debug
- **History Retention**: `HISTORY_CLEANUP_DAYS` - Days to retain historical data
- **Proxy Support**: `HTTP_PROXY`/`HTTPS_PROXY` - Network proxy configuration

## Architecture Design

The project uses modular design for easy extension:

- **Core Module**: `AlgorithmFeeder` main controller, coordinates all components
- **Platform Interface**: `PlatformInterface` abstraction layer, supports Bilibili/YouTube extension
- **Matching Service**: `MatchService` intelligent keyword matching and filtering
- **Concurrent Processing**: `ConcurrentPlayer` multi-threaded video processing
- **Simulated Playback**: `SimulatedPlaybackManager` efficient playback simulation
- **History Service**: `HistoryService` complete data recording and statistics
- **Configuration Management**: Unified configuration loading, validation and wizard
- **Logging System**: Hierarchical log output and file recording

## Usage Instructions

For detailed configuration and usage methods, please refer to:
- [Complete Usage Guide](docs/usage.md) - Detailed configuration instructions

## Disclaimer

This tool is for personal learning and research purposes only, intended for actively adjusting personal recommendation algorithm preferences. Please comply with relevant platform terms of service and use responsibly.

## License

AGPL-3.0 License
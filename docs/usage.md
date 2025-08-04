# Usage Guide

## Quick Start

### 1. Install Project
```bash
git clone https://github.com/bOOOOcG/recommendation-algorithm-feeder.git
cd recommendation-algorithm-feeder
npm install
```

### 2. Configure Environment
```bash
# Create configuration file
touch .env
# Or on Windows
echo. > .env

# Create cookies directory
mkdir cookies

# Edit .env file according to the configuration examples below
```

### 3. Get Platform Cookies

#### Bilibili Cookie:
1. Login to https://www.bilibili.com
2. Press F12 to open developer tools
3. Switch to Network tab
4. Refresh the page
5. Find any request, copy Cookie value from Request Headers
6. Save to cookies/bilibili.txt

#### YouTube Cookie:
1. Login to https://www.youtube.com
2. Follow the same method to get Cookie
3. Save to cookies/youtube.txt

### 4. Run Program
```bash
npm run dev
```

## Configuration Parameters

### English Configuration Example

#### Basic Configuration
```env
# Platform selection
PLATFORM=youtube                     # bilibili | youtube

# Target keywords (required)
TARGET_KEYWORDS=programming,algorithm,data science,artificial intelligence

# Match mode
MATCH_MODE=any                       # any: match any keyword | all: match all keywords
CASE_SENSITIVE=false                 # Case sensitive matching

# Execution parameters
BROWSE_COUNT=50                      # Total execution rounds
PLAY_DURATION=30                     # Video play duration (seconds)
SEARCH_INTERVAL=30                   # Search interval (seconds)
```

## Operation Mode Details

### Headless Mode vs Browser Mode
```env
# Headless mode (recommended)
HEADLESS=true
```
- **Headless Mode (HEADLESS=true)**: Run in background without browser interface
  - Pros: Save system resources, faster execution, can run on servers
  - Cons: Cannot see actual operations, relatively difficult to debug
  - Use cases: Production environment, long-term running, resource-limited environments

- **Browser Mode (HEADLESS=false)**: Display browser interface to see operations
  - Pros: Visually see program operations, easy to debug and understand process
  - Cons: Consume more system resources, requires graphical interface environment
  - Use cases: Development debugging, first-time use, need to monitor operations

### API Mode vs Browser Scraping Mode
```env
# API mode (recommended)
USE_API_MODE=true
API_TIMEOUT=30000                    # API request timeout (milliseconds)
```
- **API Mode (USE_API_MODE=true)**: Directly call platform official APIs to get recommendation data
  - Pros: Fast speed, high stability, low resource usage, not affected by page changes
  - Cons: Depends on API interface stability
  - How it works: Directly request Bilibili/YouTube recommendation APIs, parse JSON data

- **Browser Scraping Mode (USE_API_MODE=false)**: Launch browser to visit pages and scrape data
  - Pros: Closer to real user behavior
  - Cons: Slow speed, high resource usage, may be affected by page structure changes
  - How it works: Open browser, visit web pages, parse HTML content

### Simulated Playback vs Real Playback
```env
# Simulated playback (recommended)
USE_SIMULATED_PLAYBACK=true          # Enable simulated playback
SIMULATED_PLAYBACK_SPEED=2           # Playback speed multiplier (1-5)
SIMULATED_WATCH_DURATION=30          # Watch duration reported to platform (seconds)
SIMULATED_ACTUAL_WAIT_TIME=10        # Actual processing time per video (seconds)
SIMULATED_DURATION_VARIATION=5       # Duration random variation (percentage)
```
- **Simulated Playback (USE_SIMULATED_PLAYBACK=true)**: Don't actually play videos, only send playback heartbeats
  - Pros: Save bandwidth, fast speed, configurable playback speed, extremely low resource usage
  - **Performance Advantage**: Since no actual video playback, you can run high concurrency (10+ concurrent players) without performance impact
  - How it works: Send viewing progress heartbeats to platform, simulating watching videos
  - Parameter explanation:
    - `SIMULATED_PLAYBACK_SPEED=2`: 2x speed simulation, actual wait time is 1/2 of video duration
    - `SIMULATED_WATCH_DURATION=30`: Tell platform watched for 30 seconds
    - `SIMULATED_ACTUAL_WAIT_TIME=10`: Actually process each video for 10 seconds before next one

- **Real Playback (USE_SIMULATED_PLAYBACK=false)**: Actually load and play videos
  - Pros: Completely simulate real user behavior
  - Cons: Consume large bandwidth, slow speed, high system resource usage
  - How it works: Actually open video pages, load video streams, play silently

### Concurrent Processing
```env
# Concurrent configuration
CONCURRENT_PLAYERS=3                 # Number of concurrent processors (1-10)
PLAYER_START_DELAY=5000             # Player startup delay (milliseconds)
```
- **Single Thread (CONCURRENT_PLAYERS=1)**: Process only one video at a time
  - Pros: Low platform pressure, less likely to be detected, high stability
  - Cons: Slow processing speed
  - Use cases: Conservative usage, new accounts, unstable network environments

- **Multi-thread (CONCURRENT_PLAYERS=3-10+)**: Process multiple videos simultaneously
  - Pros: High processing efficiency, save overall time
  - Cons: Higher platform pressure, may increase detection risk
  - Use cases: Mature accounts, good network environment, pursuing efficiency
  - **With Simulated Playback**: Can safely use 10+ concurrent players with minimal system impact
  - **With Real Playback**: Recommended 3-5 concurrent players due to resource limitations

### Recommended Configuration Combinations

#### Efficient and Safe Combination (Recommended)
```env
HEADLESS=true                        # Headless mode
USE_API_MODE=true                    # API mode
USE_SIMULATED_PLAYBACK=true          # Simulated playback
SIMULATED_PLAYBACK_SPEED=2           # 2x speed
CONCURRENT_PLAYERS=5                 # 5 concurrent (can go higher with simulated playback)
```

#### Conservative and Safe Combination
```env
HEADLESS=true                        # Headless mode
USE_API_MODE=true                    # API mode
USE_SIMULATED_PLAYBACK=true          # Simulated playback
SIMULATED_PLAYBACK_SPEED=1           # 1x speed (real time)
CONCURRENT_PLAYERS=1                 # Single thread
```

#### High Performance Combination (Advanced Users)
```env
HEADLESS=true                        # Headless mode
USE_API_MODE=true                    # API mode
USE_SIMULATED_PLAYBACK=true          # Simulated playback
SIMULATED_PLAYBACK_SPEED=3           # 3x speed
CONCURRENT_PLAYERS=10                # 10 concurrent (high performance with simulated playback)
```

#### Debug Development Combination
```env
HEADLESS=false                       # Show browser
USE_API_MODE=false                   # Browser scraping
USE_SIMULATED_PLAYBACK=false         # Real playback
CONCURRENT_PLAYERS=1                 # Single thread
```

### Smart Features Configuration
```env
# Active search
ENABLE_ACTIVE_SEARCH=true            # Enable active search
ACTIVE_SEARCH_THRESHOLD=10           # Trigger search after consecutive unmatched rounds
ACTIVE_SEARCH_STRATEGY=keyword       # keyword: keyword search | random: random search

# Queue management
MAX_VIDEOS_PER_QUEUE=5              # Maximum videos processed per round
MAX_QUEUE_SIZE=20                   # Maximum queue capacity

# Video source configuration
INITIAL_VIDEO_SOURCE=home           # home: homepage | related: related | short: shorts
VIDEOS_PER_PAGE=12                  # Number of videos per page (1-30)
```

### System Configuration
```env
# Browser settings
HEADLESS=true                       # Headless mode, run in background
BROWSER_TYPE=chrome                 # chrome | firefox | edge
ACTION_DELAY=3000                   # Operation delay (milliseconds)

# Logging configuration
LOG_LEVEL=info                      # error | warn | info | debug
LOG_TO_FILE=true                   # Whether to save to log file

# Data management
HISTORY_CLEANUP_DAYS=30             # History retention days
MAX_VIDEOS_PER_SESSION=1000         # Maximum videos per session
RETRY_ATTEMPTS=3                    # Retry attempts on failure

# Proxy settings (optional)
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

## Running Modes

### Development Mode
```bash
npm run dev
```
Real-time display of running status

### Production Mode
```bash
npm run build
npm start
```
Compiled execution, better performance

### Test Connections
```bash
npm run test-bilibili    # Test Bilibili connection
npm run test-youtube     # Test YouTube connection
npm run test-cookies     # Verify cookie validity
```

### View History
```bash
npm run view-history     # View watch history and statistics
```

## Common Issues

### Cookie Expired?
Re-login to the platform, get new Cookie and update configuration file

### Cannot find matching videos?
- Adjust keywords, use more general terms
- Enable active search feature
- Increase execution rounds

### Program running too slowly?
- Enable API mode and simulated playback
- Increase number of concurrent processors
- Use headless mode

## Important Notes

1. **Privacy Protection**: Cookies contain login information, keep them secure
2. **Follow Rules**: Only use for personal recommendation algorithm optimization, no malicious use
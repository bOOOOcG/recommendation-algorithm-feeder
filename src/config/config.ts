import { config } from 'dotenv';
import { AppConfig, PlatformConfig, MatcherConfig } from '../types/index.js';
import { CookieLoader } from '../utils/cookie-loader.js';

config();

export class ConfigManager {
  private static instance: ConfigManager;
  private appConfig: AppConfig;

  private constructor() {
    this.appConfig = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    const platformType = (process.env.PLATFORM as any) || 'bilibili';
    
    return {
      // 平台配置
      platformType,
      platform: this.loadPlatformConfig(platformType),
      matcher: this.loadMatcherConfig(),
      
      // 基础配置
      browseCount: parseInt(process.env.BROWSE_COUNT || '10'),
      playDuration: parseInt(process.env.PLAY_DURATION || '30') * 1000,
      actionDelay: parseInt(process.env.ACTION_DELAY || '3000'),
      searchInterval: parseInt(process.env.SEARCH_INTERVAL || '30') * 1000,
      
      // 浏览器配置
      headless: process.env.HEADLESS !== 'false',
      browserType: (process.env.BROWSER_TYPE as any) || 'chrome',
      userAgent: process.env.USER_AGENT,
      
      // 日志配置
      logLevel: (process.env.LOG_LEVEL as any) || 'info',
      logToFile: process.env.LOG_TO_FILE !== 'false',
      
      // API相关配置
      videosPerPage: Math.min(parseInt(process.env.VIDEOS_PER_PAGE || '12'), 30),
      initialVideoSource: (process.env.INITIAL_VIDEO_SOURCE as any) || 'home',
      useApiMode: process.env.USE_API_MODE !== 'false',
      apiTimeout: parseInt(process.env.API_TIMEOUT || '30000'),
      
      // 多线程配置
      concurrentPlayers: Math.max(1, Math.min(parseInt(process.env.CONCURRENT_PLAYERS || '1'), 10)),
      playerStartDelay: parseInt(process.env.PLAYER_START_DELAY || '5000'),
      
      // 高级配置
      maxVideosPerSession: parseInt(process.env.MAX_VIDEOS_PER_SESSION || '1000'),
      historyCleanupDays: parseInt(process.env.HISTORY_CLEANUP_DAYS || '30'),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      
      // 主动搜索配置
      enableActiveSearch: process.env.ENABLE_ACTIVE_SEARCH !== 'false',
      activeSearchThreshold: parseInt(process.env.ACTIVE_SEARCH_THRESHOLD || '10'),
      activeSearchStrategy: (process.env.ACTIVE_SEARCH_STRATEGY as any) || 'random',
      
      // 队列管理配置
      maxVideosPerQueue: parseInt(process.env.MAX_VIDEOS_PER_QUEUE || '5'),
      maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '20'),
      
      // 模拟播放配置
      useSimulatedPlayback: process.env.USE_SIMULATED_PLAYBACK === 'true',
      simulatedPlaybackSpeed: Math.min(parseFloat(process.env.SIMULATED_PLAYBACK_SPEED || '2'), 5), // 最大5倍速
      simulatedWatchDuration: parseInt(process.env.SIMULATED_WATCH_DURATION || '30'),
      simulatedActualWaitTime: parseInt(process.env.SIMULATED_ACTUAL_WAIT_TIME || '5'),
      simulatedDurationVariation: Math.max(0, Math.min(parseFloat(process.env.SIMULATED_DURATION_VARIATION || '5'), 50)) // 0-50%范围
    };
  }

  private loadPlatformConfig(platformType: string): PlatformConfig {
    const baseConfig = {
      name: platformType,
      cookies: CookieLoader.loadCookie(platformType)
    };

    switch (platformType) {
      case 'bilibili':
        return {
          ...baseConfig,
          baseUrl: 'https://www.bilibili.com',
          headers: {
            'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          }
        };
      
      case 'youtube':
        return {
          ...baseConfig,
          baseUrl: 'https://www.youtube.com',
          headers: {
            'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          }
        };
      
      case 'twitch':
        return {
          ...baseConfig,
          baseUrl: 'https://www.twitch.tv',
          headers: {
            'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          }
        };
      
      default:
        throw new Error(`不支持的平台: ${platformType}`);
    }
  }

  private loadMatcherConfig(): MatcherConfig {
    return {
      keywords: (process.env.TARGET_KEYWORDS || '').split(',').map(k => k.trim()).filter(k => k),
      matchMode: (process.env.MATCH_MODE as any) || 'any',
      caseSensitive: process.env.CASE_SENSITIVE === 'true'
    };
  }

  public getConfig(): AppConfig {
    return this.appConfig;
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    this.appConfig = { ...this.appConfig, ...updates };
  }

  public validateConfig(): boolean {
    const config = this.appConfig;
    
    if (!config.platform.cookies) {
      throw new Error(`Platform cookies are required. Please place cookie file in cookies/${config.platformType}.txt or cookies/default.txt`);
    }

    if (!CookieLoader.validatePlatformCookie(config.platform.cookies, config.platformType)) {
      throw new Error(`Invalid ${config.platformType} cookie format. Please check your cookie string for ${config.platformType} platform`);
    }
    
    if (config.matcher.keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }

    if (config.videosPerPage && (config.videosPerPage < 1 || config.videosPerPage > 30)) {
      throw new Error('Videos per page must be between 1 and 30');
    }

    if (config.initialVideoSource && !['home', 'related', 'short'].includes(config.initialVideoSource)) {
      throw new Error('Initial video source must be one of: home, related, short');
    }
    
    return true;
  }

  /**
   * 获取API配置
   */
  public getApiConfig() {
    const config = this.getConfig();
    return {
      videosPerPage: config.videosPerPage,
      initialVideoSource: config.initialVideoSource,
      useApiMode: config.useApiMode,
      timeout: config.apiTimeout
    };
  }
}
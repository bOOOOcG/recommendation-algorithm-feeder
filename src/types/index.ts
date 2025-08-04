export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  url: string;
  duration?: number;
  tags?: string[];
  platform?: string;
  description?: string;
  viewCount?: number;
  publishTime?: string;
  thumbnail?: string;
}

export interface PlatformConfig {
  name: string;
  baseUrl: string;
  cookies: string;
  headers?: Record<string, string>;
  simulatedWatchDuration?: number;   // 模拟观看时长(秒)
  simulatedActualWaitTime?: number;    // 模拟播放过程的实际耗时(秒)
}

export interface MatcherConfig {
  keywords: string[];
  matchMode: 'any' | 'all';
  caseSensitive: boolean;
}

export interface AppConfig {
  // 平台配置
  platformType: 'bilibili' | 'youtube' | 'twitch';
  platform: PlatformConfig;
  matcher: MatcherConfig;
  
  // 多平台Cookie配置
  cookies?: {
    bilibili?: string;
    youtube?: string;
  };
  
  // 基础配置
  browseCount: number;
  playDuration: number;
  actionDelay: number;
  searchInterval: number;
  
  // 浏览器配置
  headless: boolean;
  browserType?: 'chrome' | 'firefox' | 'safari';
  userAgent?: string;
  
  // 日志配置
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logToFile?: boolean;
  
  // API相关配置
  videosPerPage?: number;
  initialVideoSource?: 'home' | 'related' | 'short';
  useApiMode?: boolean;
  apiTimeout?: number;
  
  // 多线程配置
  concurrentPlayers?: number;
  playerStartDelay?: number;
  
  // 高级配置
  maxVideosPerSession?: number;
  historyCleanupDays?: number;
  retryAttempts?: number;
  
  // 主动搜索配置
  enableActiveSearch?: boolean;
  activeSearchThreshold?: number;
  activeSearchStrategy?: 'random' | 'sequential' | 'weighted';
  
  // 队列管理配置
  maxVideosPerQueue?: number;        // 每次搜索最多添加多少个视频到队列
  maxQueueSize?: number;             // 队列最大大小，超过此数量不再获取推荐
  
  // 模拟播放配置
  useSimulatedPlayback?: boolean;    // 是否启用模拟播放模式
  simulatedPlaybackSpeed?: number;   // 模拟播放速率 (1=正常，10=10倍速)
  simulatedWatchDuration?: number;   // 模拟观看时长(秒) - 告诉平台我们看了多久
  simulatedActualWaitTime?: number;    // 模拟播放过程的实际耗时(秒)
  simulatedDurationVariation?: number; // 模拟播放时长随机浮动范围(百分比)
}

export interface PlatformInterface {
  initialize(): Promise<void>;
  getRecommendedVideos(): Promise<VideoInfo[]>;
  searchVideos?(keyword: string, limit?: number): Promise<VideoInfo[]>;
  playVideo(video: VideoInfo): Promise<void>;
  cleanup(): Promise<void>;
  switchVideoSource?(source: 'home' | 'related' | 'short'): void;
}

export interface MatcherInterface {
  match(video: VideoInfo): boolean;
  configure(config: MatcherConfig): void;
}
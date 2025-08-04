import { PlatformInterface, MatcherInterface, AppConfig, VideoInfo } from '../types/index.js';
import { logger } from './logger.js';
import { HistoryService } from '../services/history-service.js';
import { ConcurrentPlayer } from '../services/concurrent-player.js';
import { SimulatedPlaybackManager } from '../services/simulated-playback-manager.js';
import { MatchService } from '../services/match-service.js';

/**
 * 推荐算法喂养器核心类
 * 负责协调平台操作和视频匹配逻辑
 */
export class AlgorithmFeeder {
  private platform: PlatformInterface;
  private matcher: MatcherInterface;
  private config: AppConfig;
  private historyService: HistoryService;
  private concurrentPlayer?: ConcurrentPlayer;
  private simulatedPlaybackManager?: SimulatedPlaybackManager;
  private matchService: MatchService;
  private isRunning: boolean = false;
  private sessionId: string;
  
  // 主动搜索相关
  private missedRounds: number = 0;
  private keywordIndex: number = 0;
  
  // 队列管理
  private videoQueue: VideoInfo[] = [];

  constructor(
    platform: PlatformInterface,
    matcher: MatcherInterface,
    config: AppConfig
  ) {
    this.platform = platform;
    this.matcher = matcher;
    this.config = config;
    this.historyService = new HistoryService(config.platformType);
    this.matchService = new MatchService(config.matcher);
    this.sessionId = `session-${Date.now()}`;
    this.matcher.configure(config.matcher);
  }

  /**
   * 启动喂养流程
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('喂养器已在运行中');
      return;
    }

    try {
      this.isRunning = true;
      logger.info('启动推荐算法喂养器...');
      
      // 初始化平台（用于获取推荐视频）
      await this.platform.initialize();
      logger.info('平台初始化成功');

      // 根据配置选择播放模式
      if (this.config.useSimulatedPlayback) {
        // 初始化模拟播放管理器
        this.simulatedPlaybackManager = new SimulatedPlaybackManager(
          {
            playbackSpeed: this.config.simulatedPlaybackSpeed || 2,
            watchDuration: this.config.simulatedWatchDuration || 30,
            minWaitTime: this.config.simulatedActualWaitTime || 5,
            platform: this.config.platformType,
            cookies: this.config.platform.cookies || '',
            concurrentWorkers: this.config.concurrentPlayers || 1,
            workerStartDelay: this.config.playerStartDelay || 2000,
            durationVariation: this.config.simulatedDurationVariation || 5
          },
          this.historyService,
          this.matchService,
          this.sessionId
        );
        logger.info('🎭 模拟播放管理器已初始化');
      } else {
        // 初始化并发播放器（传统模式）
        const useConcurrent = (this.config.concurrentPlayers || 1) > 1;
        if (useConcurrent) {
          this.concurrentPlayer = new ConcurrentPlayer(this.config, this.historyService, this.sessionId);
          await this.concurrentPlayer.initialize();
          
          // 启动并发播放（异步执行）
          this.concurrentPlayer.startPlaying().catch(error => {
            logger.error('并发播放器错误:', error);
          });
        }
      }

      // 开始喂养循环
      await this.feedingLoop();
      
    } catch (error) {
      logger.error('喂养器运行错误:', error);
      throw error;
    } finally {
      await this.stop();
    }
  }

  /**
   * 停止喂养流程
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('停止推荐算法喂养器...');
    this.isRunning = false;
    
    // 停止播放管理器
    if (this.simulatedPlaybackManager) {
      this.simulatedPlaybackManager.cleanup();
    }
    
    if (this.concurrentPlayer) {
      await this.concurrentPlayer.stop();
    }
    
    await this.platform.cleanup();
    
    // 显示本次会话统计信息
    this.showSessionStats();
    
    logger.info('喂养器已停止');
  }

  /**
   * 显示本次会话统计信息
   */
  private showSessionStats(): void {
    try {
      const report = this.historyService.generateSessionReport(this.sessionId);
      
      logger.info(report);
      
      // 简化的实时统计
      logger.info('💡 使用提示:');
      logger.info('  - 查看完整历史: 检查 history/watch-history.jsonl');
      logger.info('  - 详细统计: 检查 history/watch-stats.json');
      
    } catch (error) {
      logger.error('生成统计报告失败:', error);
    }
  }

  /**
   * 主要的喂养循环逻辑 - 持续搜索和播放目标视频
   */
  private async feedingLoop(): Promise<void> {
    let roundCount = 0;
    const checkInterval = this.config.searchInterval; // 从配置读取检查间隔
    
    logger.info('开始持续监控目标视频...');
    
    while (this.isRunning) {
      try {
        roundCount++;
        logger.info(`第 ${roundCount} 轮搜索 - 获取最新推荐视频...`);
        
        // 获取推荐视频列表
        const videos = await this.platform.getRecommendedVideos();
        logger.info(`发现 ${videos.length} 个推荐视频`);
        
        // 检查队列大小限制
        if (this.videoQueue.length >= (this.config.maxQueueSize || 20)) {
          logger.info(`⚠️  队列已满 (${this.videoQueue.length}/${this.config.maxQueueSize || 20})，跳过本轮推荐获取`);
          
          // 等待下次检查
          if (this.isRunning) {
            logger.info(`等待 ${checkInterval / 1000} 秒后进行下一轮搜索...`);
            await this.delay(checkInterval);
          }
          continue;
        }
        
        // 筛选符合条件的目标视频
        const targetVideos = videos.filter(video => this.matcher.match(video));
        
        if (targetVideos.length > 0) {
          logger.info(`✅ 找到 ${targetVideos.length} 个符合条件的目标视频！`);
          
          // 限制每次添加到队列的视频数量
          const maxVideosPerQueue = this.config.maxVideosPerQueue || 5;
          const videosToAdd = targetVideos.slice(0, maxVideosPerQueue);
          
          if (videosToAdd.length < targetVideos.length) {
            logger.info(`📝 限制本轮最多添加 ${maxVideosPerQueue} 个视频到队列`);
          }
          
          // 重置主动搜索计数器
          this.missedRounds = 0;
          
          if (this.simulatedPlaybackManager) {
            // 使用模拟播放管理器（非阻塞添加到队列）
            const currentSource = this.getCurrentVideoSource();
            this.simulatedPlaybackManager.addToQueue(videosToAdd, currentSource);
            const status = this.simulatedPlaybackManager.getStatus();
            logger.info(`🎭 模拟播放队列状态: ${status.activeWorkers}/${status.concurrentWorkers} 个工作器运行中, 队列: ${status.queueLength} 个视频`);
            
          } else if (this.concurrentPlayer) {
            // 使用并发播放器
            const currentSource = this.getCurrentVideoSource();
            this.concurrentPlayer.addToQueue(videosToAdd, this.config.matcher.keywords, currentSource);
            
            // 显示并发播放状态
            const status = this.concurrentPlayer.getStatus();
            logger.info(`🎬 并发播放状态: ${status.activePlayers}/${status.totalPlayers} 个播放器工作中, 队列: ${status.queueLength} 个视频`);
            
          } else {
            // 单线程播放 - 添加到队列
            videosToAdd.forEach(video => {
              if (!this.historyService.hasWatched(video.id)) {
                this.videoQueue.push(video);
              }
            });
            
            logger.info(`📋 队列状态: ${this.videoQueue.length} 个视频待播放`);
            
            // 处理队列中的视频
            await this.processVideoQueue();
          }
          
          logger.info('本轮目标视频处理完成');
        } else {
          logger.info('本轮未找到符合条件的目标视频');
          
          // 增加未找到目标视频的计数
          this.missedRounds++;
          
          // 检查是否需要进行主动搜索
          await this.checkActiveSearch();
        }
        
        // 等待下次检查
        if (this.isRunning) {
          logger.info(`等待 ${checkInterval / 1000} 秒后进行下一轮搜索...`);
          await this.delay(checkInterval);
        }
        
      } catch (error) {
        logger.error('本轮搜索出错:', error);
        // 出错后等待更长时间再重试
        if (this.isRunning) {
          logger.info('等待 60 秒后重试...');
          await this.delay(60000);
        }
      }
    }
    
    logger.info('喂养循环结束');
  }

  /**
   * 检查是否需要进行主动搜索
   */
  private async checkActiveSearch(): Promise<void> {
    // 检查是否启用主动搜索功能
    if (!this.config.enableActiveSearch) {
      return;
    }

    const threshold = this.config.activeSearchThreshold || 10;
    
    if (this.missedRounds >= threshold) {
      logger.info(`🔍 连续 ${this.missedRounds} 轮未找到目标视频，触发主动搜索...`);
      
      const success = await this.performActiveSearch();
      
      if (success) {
        // 主动搜索成功后重置计数器
        this.missedRounds = 0;
        logger.info('✅ 主动搜索完成，重置未命中计数器');
      } else {
        logger.warn('⚠️ 主动搜索未找到合适视频，继续等待推荐算法');
        // 即使失败也将计数器减半，避免频繁搜索
        this.missedRounds = Math.floor(this.missedRounds / 2);
      }
    } else {
      logger.debug(`未命中计数: ${this.missedRounds}/${threshold}`);
    }
  }

  /**
   * 执行主动搜索
   */
  private async performActiveSearch(): Promise<boolean> {
    try {
      // 检查平台是否支持搜索功能
      if (!this.platform.searchVideos) {
        logger.warn('当前平台不支持搜索功能，跳过主动搜索');
        return false;
      }

      // 选择搜索关键词
      const keyword = this.selectSearchKeyword();
      if (!keyword) {
        logger.warn('没有可用的搜索关键词');
        return false;
      }

      logger.info(`🔎 主动搜索关键词: "${keyword}"`);
      
      // 执行搜索
      const searchResults = await this.platform.searchVideos(keyword, 20);
      
      if (searchResults.length === 0) {
        logger.warn(`搜索关键词 "${keyword}" 没有找到任何视频`);
        return false;
      }

      logger.info(`🔍 搜索到 ${searchResults.length} 个视频`);
      
      // 筛选符合条件的视频
      const targetVideos = searchResults.filter(video => this.matcher.match(video));
      
      if (targetVideos.length === 0) {
        logger.info(`搜索结果中没有符合关键词匹配条件的视频`);
        
        // 即使不完全匹配，也可以播放第一个搜索结果来"教育"算法
        if (searchResults.length > 0) {
          const firstVideo = searchResults[0];
          logger.info(`🎯 播放搜索结果中的第一个视频来引导算法: ${firstVideo.title}`);
          
          if (this.simulatedPlaybackManager) {
            this.simulatedPlaybackManager.addToQueue([firstVideo], 'search');
          } else if (this.concurrentPlayer) {
            this.concurrentPlayer.addToQueue([firstVideo], [keyword], 'search');
          } else {
            await this.playTargetVideo(firstVideo, keyword, 'search');
          }
          
          return true;
        }
        
        return false;
      }

      logger.info(`✅ 在搜索结果中找到 ${targetVideos.length} 个符合条件的目标视频`);
      
      // 播放找到的目标视频
      if (this.simulatedPlaybackManager) {
        this.simulatedPlaybackManager.addToQueue(targetVideos, 'search');
        logger.info(`🎭 搜索视频已添加到模拟播放队列: ${targetVideos.length}个视频`);
      } else if (this.concurrentPlayer) {
        this.concurrentPlayer.addToQueue(targetVideos, this.config.matcher.keywords, 'search');
      } else {
        // 只播放第一个匹配的视频
        const selectedVideo = targetVideos[0];
        await this.playTargetVideo(selectedVideo, keyword, 'search');
      }
      
      return true;
      
    } catch (error) {
      logger.error('主动搜索过程中发生错误:', error);
      return false;
    }
  }

  /**
   * 选择搜索关键词
   */
  private selectSearchKeyword(): string | null {
    const keywords = this.config.matcher.keywords;
    if (keywords.length === 0) {
      return null;
    }

    const strategy = this.config.activeSearchStrategy || 'random';
    
    switch (strategy) {
      case 'random':
        // 随机选择关键词
        return keywords[Math.floor(Math.random() * keywords.length)];
        
      case 'sequential': {
        // 按顺序循环选择关键词
        const keyword = keywords[this.keywordIndex % keywords.length];
        this.keywordIndex++;
        return keyword;
      }
        
      case 'weighted':
        // 加权选择（未来可以根据历史成功率实现）
        // 目前回退到随机选择
        return keywords[Math.floor(Math.random() * keywords.length)];
        
      default:
        return keywords[0];
    }
  }

  /**
   * 播放目标视频
   */
  private async playTargetVideo(
    video: VideoInfo, 
    searchKeyword?: string, 
    source: 'home' | 'related' | 'short' | 'search' = 'home'
  ): Promise<void> {
    const startTime = Date.now();
    let actualPlayDuration = 0;
    
    try {
      logger.info(`播放目标视频: ${video.title} - 作者: ${video.author}`);
      
      await this.platform.playVideo(video);
      
      // 模拟播放模式下不需要额外等待
      if (this.config.useSimulatedPlayback) {
        logger.info(`🎭 模拟播放完成，无需额外等待`);
        actualPlayDuration = Date.now() - startTime;
      } else {
        logger.info(`🎬 真实播放模式，等待播放完成: ${this.config.playDuration / 1000}秒`);
        // 等待播放完成
        await this.delay(this.config.playDuration);
        actualPlayDuration = Date.now() - startTime;
      }
      
      // 获取匹配的关键词
      const matchedKeywords = searchKeyword ? [searchKeyword] : this.getMatchedKeywords(video);
      
      // 记录观看历史
      this.historyService.recordWatch(
        video,
        actualPlayDuration,
        matchedKeywords,
        source,
        this.sessionId
      );
      
    } catch (error) {
      actualPlayDuration = Date.now() - startTime;
      logger.error(`播放视频 ${video.title} 时出错:`, error);
      
      // 即使播放失败也记录历史（标记为错误）
      if (actualPlayDuration > 1000) { // 如果播放了超过1秒才记录
        const matchedKeywords = searchKeyword ? [searchKeyword] : this.getMatchedKeywords(video);
        
        this.historyService.recordWatch(
          video,
          actualPlayDuration,
          matchedKeywords,
          source,
          this.sessionId
        );
      }
    }
  }

  /**
   * 处理视频队列
   */
  private async processVideoQueue(): Promise<void> {
    while (this.videoQueue.length > 0 && this.isRunning) {
      const video = this.videoQueue.shift();
      if (!video) break;
      
      // 检查是否已经看过这个视频
      if (this.historyService.hasWatched(video.id)) {
        logger.info(`⏭️  跳过已观看视频: ${video.title}`);
        continue;
      }
      
      await this.playTargetVideo(video);
      await this.delay(this.config.actionDelay);
    }
  }

  /**
   * 获取视频匹配的关键词
   */
  private getMatchedKeywords(video: VideoInfo): string[] {
    const matchedKeywords: string[] = [];
    const searchText = `${video.title} ${video.author}`.toLowerCase();
    
    for (const keyword of this.config.matcher.keywords) {
      const keywordLower = this.config.matcher.caseSensitive ? keyword : keyword.toLowerCase();
      if (searchText.includes(keywordLower)) {
        matchedKeywords.push(keyword);
      }
    }
    
    return matchedKeywords;
  }

  /**
   * 获取当前视频源
   */
  private getCurrentVideoSource(): 'home' | 'related' | 'short' {
    // 从平台获取当前视频源，如果获取失败则使用配置的初始源
    if (this.platform && typeof (this.platform as any).getCurrentVideoSource === 'function') {
      return (this.platform as any).getCurrentVideoSource();
    }
    return this.config.initialVideoSource || 'home';
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查喂养器是否正在运行
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}
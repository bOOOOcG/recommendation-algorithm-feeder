import { VideoInfo } from '../types/index.js';
import { logger } from '../core/logger.js';
import { BilibiliPlaybackSimulator } from '../platforms/bilibili/bilibili-simulator.js';
import { HistoryService } from './history-service.js';
import { MatchService } from './match-service.js';

/**
 * 模拟播放配置接口
 */
export interface SimulatedPlaybackConfig {
  playbackSpeed: number;
  watchDuration: number;
  minWaitTime: number;
  platform: string;
  cookies: string;
  concurrentWorkers?: number; // 并发工作线程数
  workerStartDelay?: number;  // 工作线程启动间隔
  durationVariation?: number; // 播放时长随机浮动范围(百分比)
}

/**
 * 专门的模拟播放管理器
 * 独立处理模拟播放，避免与传统播放系统冲突，支持多线程并发
 */
export class SimulatedPlaybackManager {
  private config: SimulatedPlaybackConfig;
  private simulators: BilibiliPlaybackSimulator[] = [];
  private historyService: HistoryService;
  private matchService: MatchService;
  private isProcessing: boolean = false;
  private currentVideoSource: 'home' | 'related' | 'short' | 'search' = 'home';
  private sessionId: string;
  private concurrentWorkers: number;
  private activeWorkers: number = 0;
  private videoQueue: Array<{video: VideoInfo, source: 'home' | 'related' | 'short' | 'search'}> = [];
  private processingPromises: Promise<void>[] = [];
  private lastStatsReport: number = 0;
  private statsReportInterval: number = 60000; // 60秒输出一次统计

  constructor(
    config: SimulatedPlaybackConfig,
    historyService: HistoryService,
    matchService: MatchService,
    sessionId: string = 'default'
  ) {
    this.config = config;
    this.historyService = historyService;
    this.matchService = matchService;
    this.sessionId = sessionId;
    this.concurrentWorkers = Math.max(1, Math.min(config.concurrentWorkers || 1, 10)); // 限制1-10个并发

    this.initializeSimulators();
  }

  /**
   * 初始化多个模拟播放器
   */
  private initializeSimulators(): void {
    if (this.config.platform === 'bilibili' && this.config.cookies) {
      // 创建多个模拟播放器实例
      for (let i = 0; i < this.concurrentWorkers; i++) {
        const simulator = new BilibiliPlaybackSimulator(this.config.cookies, this.config.playbackSpeed, this.config.durationVariation || 5);
        this.simulators.push(simulator);
      }
      logger.info(`🎭 模拟播放管理器已初始化 - ${this.config.platform} (${this.concurrentWorkers}个并发工作器, ${this.config.playbackSpeed}x速度)`);
    } else {
      logger.error('模拟播放管理器初始化失败：不支持的平台或缺少cookies');
    }
  }

  /**
   * 处理单个视频的模拟播放
   */
  private async processVideo(video: VideoInfo, simulator: BilibiliPlaybackSimulator, workerId: number): Promise<boolean> {
    return this.processVideoWithSource(video, simulator, workerId, this.currentVideoSource);
  }

  /**
   * 处理单个视频的模拟播放（指定来源）
   */
  private async processVideoWithSource(video: VideoInfo, simulator: BilibiliPlaybackSimulator, workerId: number, source: 'home' | 'related' | 'short' | 'search'): Promise<boolean> {
    try {
      logger.info(`🎭 工作器${workerId} 模拟播放开始: ${video.title}`);
      const startTime = Date.now();

      // 执行模拟播放，获取实际模拟的时长
      const actualSimulatedDuration = await simulator.simulatePlayback(
        video,
        this.config.watchDuration,
        this.config.minWaitTime,
        source
      );

      const playDuration = Date.now() - startTime;

      // 检查关键词匹配
      const matchedKeywords = this.matchService.checkVideoMatch(video);
      const isMatched = matchedKeywords.length > 0;

      // 记录观看历史（包含模拟播放数据）
      this.historyService.recordWatch(
        video,
        playDuration,
        matchedKeywords,
        source,
        this.sessionId,
        {
          isSimulated: true,
          simulatedWatchDuration: actualSimulatedDuration, // 使用实际模拟的时长
          actualWaitTime: playDuration,
          playbackSpeed: this.config.playbackSpeed
        }
      );

      logger.info(`✅ 工作器${workerId} 模拟播放完成: ${video.title} (${(playDuration / 1000).toFixed(1)}秒)`);
      
      if (isMatched) {
        logger.info(`🎯 工作器${workerId} 匹配成功: ${matchedKeywords.join(', ')}`);
      }

      // 检查是否需要输出统计报告
      this.checkAndOutputStats();

      return true;

    } catch (error) {
      logger.error(`❌ 工作器${workerId} 模拟播放失败: ${video.title}`, error);
      return false;
    }
  }

  /**
   * 添加视频到队列（非阻塞）
   */
  addToQueue(videos: VideoInfo[], source?: 'home' | 'related' | 'short' | 'search'): void {
    const sourceToUse = source || this.currentVideoSource;
    const newVideos = videos.filter(video => {
      if (this.historyService.hasWatched(video.id)) {
        logger.debug(`跳过已观看视频: ${video.title}`);
        return false;
      }
      // 检查是否已在队列中
      if (this.videoQueue.some(queuedVideo => queuedVideo.video.id === video.id)) {
        logger.debug(`跳过队列中已存在的视频: ${video.title}`);
        return false;
      }
      return true;
    });

    if (newVideos.length > 0) {
      const videoItems = newVideos.map(video => ({ video, source: sourceToUse }));
      this.videoQueue.push(...videoItems);
      logger.info(`📋 添加${newVideos.length}个新视频到队列(来源:${sourceToUse})，当前队列: ${this.videoQueue.length}个视频`);
      
      // 如果当前没有在处理，立即开始处理
      if (!this.isProcessing) {
        // 立即启动处理，不等待完成
        setImmediate(() => {
          this.startProcessing().catch(error => {
            logger.error('启动队列处理失败:', error);
          });
        });
      }
    }
  }

  /**
   * 批量处理视频队列（智能多线程版本）
   */
  async processVideoQueue(videos: VideoInfo[]): Promise<{ processed: number; matched: number }> {
    // 直接添加到队列，不检查isProcessing
    this.addToQueue(videos);
    
    // 等待当前批次处理完成
    if (this.isProcessing) {
      await this.waitForProcessingComplete();
    }
    
    // 返回统计信息（这里简化，实际应该跟踪具体的处理结果）
    return { processed: 0, matched: 0 };
  }

  /**
   * 开始处理队列中的视频（真正的异步并发版本）
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (this.simulators.length === 0) {
      logger.error('模拟播放器未初始化');
      return;
    }

    this.isProcessing = true;
    logger.info(`🎭 启动模拟播放处理器，${this.concurrentWorkers}个工作器待命`);

    try {
      // 启动持续的队列处理循环
      const processingLoop = async () => {
        while (this.isProcessing) {
          if (this.videoQueue.length === 0) {
            // 队列为空，短暂等待
            await this.sleep(100);
            continue;
          }

          // 检查是否有可用工作器
          if (this.activeWorkers >= this.concurrentWorkers) {
            // 所有工作器都忙，等待
            await this.sleep(200);
            continue;
          }

          // 取出一个视频立即处理
          const videoItem = this.videoQueue.shift();
          if (!videoItem) {
            continue;
          }

          // 启动异步工作器处理（不等待完成）
          logger.info(`🚀 启动工作器${this.activeWorkers} 处理: ${videoItem.video.title} (队列剩余: ${this.videoQueue.length})`);
          this.processVideoAsync(videoItem.video, videoItem.source);
        }
      };

      // 启动处理循环
      await processingLoop();

      // 等待所有工作器完成
      while (this.activeWorkers > 0) {
        await this.sleep(100);
      }

      logger.info(`🎭 队列处理器停止`);

    } catch (error) {
      logger.error('队列处理过程中发生错误:', error);
    } finally {
      this.isProcessing = false;
      this.activeWorkers = 0;
    }
  }

  /**
   * 异步处理单个视频（不阻塞）
   */
  private processVideoAsync(video: VideoInfo, source: 'home' | 'related' | 'short' | 'search'): void {
    const workerId = this.activeWorkers % this.concurrentWorkers;
    this.activeWorkers++;

    // 异步处理，不阻塞主循环
    this.processVideoWithSource(video, this.simulators[workerId], workerId, source)
      .then(success => {
        if (success) {
          const matchedKeywords = this.matchService.checkVideoMatch(video);
          // 可以在这里记录成功统计
        }
      })
      .catch(error => {
        logger.error(`异步处理视频失败: ${video.title}`, error);
      })
      .finally(() => {
        this.activeWorkers--;
      });
  }

  /**
   * 等待处理完成
   */
  private async waitForProcessingComplete(): Promise<void> {
    while (this.isProcessing) {
      await this.sleep(1000);
    }
  }

  /**
   * 找到可用的工作器ID
   */
  private findAvailableWorker(): number {
    // 简化版本：轮询选择工作器
    // 实际应该追踪每个工作器的忙碌状态，这里先用简单的轮询
    return Math.floor(Math.random() * this.concurrentWorkers);
  }

  /**
   * 运行单个工作器
   */
  private async runWorker(workerId: number, videos: VideoInfo[]): Promise<{ processed: number; matched: number }> {
    if (workerId >= this.simulators.length) {
      logger.error(`工作器${workerId}超出模拟器数量范围`);
      return { processed: 0, matched: 0 };
    }

    const simulator = this.simulators[workerId];
    let processed = 0;
    let matched = 0;

    // 工作器启动延迟
    if (workerId > 0) {
      const startDelay = (this.config.workerStartDelay || 2000) * workerId;
      logger.debug(`工作器${workerId} 延迟${startDelay}ms启动`);
      await this.sleep(startDelay);
    }

    this.activeWorkers++;
    logger.info(`🚀 工作器${workerId} 开始处理 ${videos.length} 个视频`);

    try {
      for (const video of videos) {
        if (!this.isProcessing) {
          logger.info(`工作器${workerId} 收到停止信号，提前结束`);
          break;
        }

        const success = await this.processVideo(video, simulator, workerId);
        if (success) {
          processed++;
          
          // 检查是否匹配
          const matchedKeywords = this.matchService.checkVideoMatch(video);
          if (matchedKeywords.length > 0) {
            matched++;
          }
        }

        // 视频间随机延迟 (1-4秒，多线程情况下减少延迟)
        const delay = 1000 + Math.random() * 3000;
        await this.sleep(delay);
      }

      logger.info(`✅ 工作器${workerId} 完成: 处理${processed}个视频，匹配${matched}个目标视频`);
      return { processed, matched };

    } catch (error) {
      logger.error(`❌ 工作器${workerId} 发生错误:`, error);
      return { processed, matched };
    } finally {
      this.activeWorkers--;
    }
  }

  /**
   * 设置视频来源（已废弃，保留向后兼容）
   * @deprecated 使用 addToQueue(videos, source) 代替
   */
  setVideoSource(source: 'home' | 'related' | 'short' | 'search'): void {
    this.currentVideoSource = source;
    logger.debug(`模拟播放管理器切换视频源: ${source} [废弃方法]`);
  }

  /**
   * 获取当前视频来源
   */
  getCurrentVideoSource(): 'home' | 'related' | 'short' | 'search' {
    return this.currentVideoSource;
  }

  /**
   * 检查是否正在处理
   */
  isProcessingVideos(): boolean {
    return this.isProcessing;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<SimulatedPlaybackConfig>): void {
    const oldWorkerCount = this.concurrentWorkers;
    this.config = { ...this.config, ...newConfig };
    
    // 更新并发工作器数量
    if (newConfig.concurrentWorkers !== undefined) {
      this.concurrentWorkers = Math.max(1, Math.min(newConfig.concurrentWorkers, 10));
    }
    
    // 如果更新了关键配置，重新初始化模拟器
    if (newConfig.playbackSpeed || newConfig.cookies || newConfig.platform || newConfig.concurrentWorkers) {
      this.simulators = []; // 清空旧的模拟器
      this.initializeSimulators();
    }
    
    logger.info(`模拟播放管理器配置已更新 (工作器: ${oldWorkerCount} → ${this.concurrentWorkers})`);
  }

  /**
   * 更新cookies
   */
  updateCookies(cookies: string): void {
    this.config.cookies = cookies;
    this.simulators = []; // 清空旧的模拟器
    this.initializeSimulators();
    logger.info('模拟播放管理器cookies已更新');
  }

  /**
   * 获取运行状态信息
   */
  getStatus(): { 
    isProcessing: boolean; 
    currentSource: string; 
    config: SimulatedPlaybackConfig;
    hasSimulators: boolean;
    concurrentWorkers: number;
    activeWorkers: number;
    queueLength: number;
  } {
    return {
      isProcessing: this.isProcessing,
      currentSource: this.currentVideoSource,
      config: this.config,
      hasSimulators: this.simulators.length > 0,
      concurrentWorkers: this.concurrentWorkers,
      activeWorkers: this.activeWorkers,
      queueLength: this.videoQueue.length
    };
  }

  /**
   * 停止当前处理
   */
  stop(): void {
    if (this.isProcessing) {
      logger.info('停止模拟播放管理器...');
      this.isProcessing = false;
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.stop();
    this.simulators = [];
    this.videoQueue = [];
    this.processingPromises = [];
    logger.info('模拟播放管理器资源已清理');
  }

  /**
   * 检查并输出统计报告
   */
  private checkAndOutputStats(): void {
    const now = Date.now();
    if (now - this.lastStatsReport >= this.statsReportInterval) {
      this.outputCurrentStats();
      this.lastStatsReport = now;
    }
  }

  /**
   * 输出当前统计数据
   */
  private outputCurrentStats(): void {
    try {
      const stats = this.historyService.getSessionStats(this.sessionId);
      
      if (stats && stats.simulatedStats && stats.simulatedStats.totalSimulatedVideos > 0) {
        const simStats = stats.simulatedStats;
        
        logger.info('');
        logger.info('🎭 ====== 本次会话统计 ======');
        logger.info(`📊 已处理视频: ${simStats.totalSimulatedVideos} 个`);
        logger.info(`⏱️  模拟观看时长: ${(simStats.totalSimulatedWatchTime / 60).toFixed(1)} 分钟`);
        logger.info(`⚡ 累计处理时间: ${(simStats.totalActualWaitTime / 1000 / 60).toFixed(1)} 分钟`);
        
        // 计算真实运行时间 (考虑并发)
        const realRunTime = simStats.totalActualWaitTime / 1000 / 60 / this.concurrentWorkers;
        logger.info(`⏰ 实际运行时间: ${realRunTime.toFixed(1)} 分钟 (${this.concurrentWorkers}并发)`);
        logger.info(`🚀 平均播放速度: ${simStats.averagePlaybackSpeed.toFixed(1)}x`);
        // 计算真实整体效率 (模拟时长 ÷ 实际运行时间)
        const realEfficiency = (simStats.totalSimulatedWatchTime / 60) / realRunTime;
        logger.info(`🔥 整体效率提升: ${realEfficiency.toFixed(1)}x (含并发加速)`);
        logger.info(`💰 节省时间: ${((simStats.totalSimulatedWatchTime / 60) - realRunTime).toFixed(1)} 分钟`);
        
        // 计算真实时间节省率
        const realTimeSavingRate = (1 - realRunTime / (simStats.totalSimulatedWatchTime / 60)) * 100;
        logger.info(`📈 时间节省率: ${realTimeSavingRate.toFixed(1)}%`);
        
        // 当前队列状态
        const status = this.getStatus();
        if (status.queueLength > 0 || status.activeWorkers > 0) {
          logger.info(`🔄 当前状态: ${status.activeWorkers}/${status.concurrentWorkers} 个工作器运行中, 队列: ${status.queueLength} 个视频`);
        }
        
        logger.info('🎭 ============================');
        logger.info('');
      }
    } catch (error) {
      logger.debug('输出统计数据失败:', error);
    }
  }

  /**
   * 强制输出统计报告
   */
  public forceOutputStats(): void {
    this.outputCurrentStats();
    this.lastStatsReport = Date.now();
  }

  /**
   * 工具方法：延时
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
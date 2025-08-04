import { PlatformInterface, VideoInfo, AppConfig } from '../types/index.js';
import { PlatformFactory } from '../platforms/platform-factory.js';
import { HistoryService } from './history-service.js';
import { logger } from '../core/logger.js';

/**
 * 播放任务状态
 */
interface PlayTask {
  id: string;
  video: VideoInfo;
  matchedKeywords: string[];
  source: 'home' | 'related' | 'short' | 'search';
  status: 'pending' | 'playing' | 'completed' | 'failed';
  startTime?: number;
  duration?: number;
  playerId?: number;
}

/**
 * 播放器实例
 */
interface PlayerInstance {
  id: number;
  platform: PlatformInterface;
  isActive: boolean;
  currentTask?: PlayTask;
}

/**
 * 并发播放管理器
 * 管理多个浏览器实例同时播放不同视频
 */
export class ConcurrentPlayer {
  private players: PlayerInstance[] = [];
  private taskQueue: PlayTask[] = [];
  private completedTasks: PlayTask[] = [];
  private config: AppConfig;
  private historyService: HistoryService;
  private sessionId: string;
  private isRunning: boolean = false;
  private taskIdCounter: number = 0;

  constructor(config: AppConfig, historyService: HistoryService, sessionId: string) {
    this.config = config;
    this.historyService = historyService;
    this.sessionId = sessionId;
  }

  /**
   * 初始化所有播放器
   */
  async initialize(): Promise<void> {
    const playerCount = this.config.concurrentPlayers || 1;
    logger.info(`🎬 初始化 ${playerCount} 个并发播放器...`);

    for (let i = 0; i < playerCount; i++) {
      try {
        // 错开启动时间，避免同时启动过多浏览器
        if (i > 0) {
          await this.delay(this.config.playerStartDelay || 5000);
        }

        logger.info(`启动播放器 #${i + 1}...`);
        
        const platform = PlatformFactory.createPlatform(
          this.config.platformType,
          this.config.platform,
          this.config.headless,
          this.config.videosPerPage || 12,
          this.config.apiTimeout || 30000,
          this.config.useSimulatedPlayback || false,
          {
            watchDuration: this.config.simulatedWatchDuration || 30,
            minWaitTime: this.config.simulatedActualWaitTime || 5,
            playbackSpeed: this.config.simulatedPlaybackSpeed || 2
          }
        );

        // 每个播放器使用独立的初始化，避免共享状态
        await platform.initialize();

        const player: PlayerInstance = {
          id: i + 1,
          platform,
          isActive: false
        };

        this.players.push(player);
        logger.info(`✅ 播放器 #${i + 1} 初始化完成`);

      } catch (error) {
        logger.error(`❌ 播放器 #${i + 1} 初始化失败:`, error);
        // 继续初始化其他播放器
      }
    }

    if (this.players.length === 0) {
      throw new Error('所有播放器初始化失败');
    }

    logger.info(`🎉 成功初始化 ${this.players.length}/${playerCount} 个播放器`);
  }

  /**
   * 添加视频到播放队列
   */
  addToQueue(videos: VideoInfo[], matchedKeywords: string[], source: 'home' | 'related' | 'short' | 'search'): void {
    const newTasks = videos.map(video => {
      // 获取该视频匹配的关键词
      const videoKeywords = this.getVideoMatchedKeywords(video, matchedKeywords);
      
      const task: PlayTask = {
        id: `task-${++this.taskIdCounter}`,
        video,
        matchedKeywords: videoKeywords,
        source,
        status: 'pending'
      };
      
      return task;
    });

    this.taskQueue.push(...newTasks);
    logger.info(`📝 添加 ${newTasks.length} 个视频到播放队列，当前队列长度: ${this.taskQueue.length}`);
  }

  /**
   * 开始并发播放
   */
  async startPlaying(): Promise<void> {
    if (this.isRunning) {
      logger.warn('并发播放器已在运行中');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 开始并发播放...');

    // 启动所有播放器的工作循环
    const workerPromises = this.players.map(player => this.playerWorker(player));
    
    try {
      await Promise.all(workerPromises);
    } catch (error) {
      logger.error('并发播放过程中发生错误:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 单个播放器的工作循环
   */
  private async playerWorker(player: PlayerInstance): Promise<void> {
    logger.info(`🎯 播放器 #${player.id} 开始工作循环`);

    while (this.isRunning) {
      try {
        // 获取下一个任务
        const task = this.getNextTask();
        if (!task) {
          // 没有任务时等待一段时间
          await this.delay(1000);
          continue;
        }

        // 检查是否已经播放过
        if (this.historyService.hasWatched(task.video.id)) {
          logger.info(`⏭️  播放器 #${player.id} 跳过已观看视频: ${task.video.title}`);
          task.status = 'completed';
          this.completedTasks.push(task);
          continue;
        }

        // 执行播放任务
        await this.executeTask(player, task);

      } catch (error) {
        logger.error(`播放器 #${player.id} 工作循环错误:`, error);
        await this.delay(5000); // 发生错误时等待更长时间
      }
    }

    logger.info(`🎯 播放器 #${player.id} 工作循环结束`);
  }

  /**
   * 获取下一个待播放任务
   */
  private getNextTask(): PlayTask | null {
    const task = this.taskQueue.find(t => t.status === 'pending');
    if (task) {
      task.status = 'playing';
    }
    return task || null;
  }

  /**
   * 执行播放任务
   */
  private async executeTask(player: PlayerInstance, task: PlayTask): Promise<void> {
    const startTime = Date.now();
    player.isActive = true;
    player.currentTask = task;
    task.playerId = player.id;
    task.startTime = startTime;

    try {
      logger.info(`🎬 播放器 #${player.id} 开始播放: ${task.video.title}`);

      // 播放视频
      await player.platform.playVideo(task.video);
      
      // 等待播放完成
      await this.delay(this.config.playDuration);
      
      const actualDuration = Date.now() - startTime;
      task.duration = actualDuration;
      task.status = 'completed';

      // 记录观看历史
      this.historyService.recordWatch(
        task.video,
        actualDuration,
        task.matchedKeywords,
        task.source,
        this.sessionId
      );

      logger.info(`✅ 播放器 #${player.id} 完成播放: ${task.video.title} (${(actualDuration / 1000).toFixed(1)}秒)`);

    } catch (error) {
      const actualDuration = Date.now() - startTime;
      task.duration = actualDuration;
      task.status = 'failed';

      logger.error(`❌ 播放器 #${player.id} 播放失败: ${task.video.title}`, error);

      // 即使失败也记录历史（如果播放了超过1秒）
      if (actualDuration > 1000) {
        this.historyService.recordWatch(
          task.video,
          actualDuration,
          task.matchedKeywords,
          task.source,
          this.sessionId
        );
      }
    } finally {
      player.isActive = false;
      player.currentTask = undefined;
      this.completedTasks.push(task);
    }
  }

  /**
   * 获取视频匹配的关键词
   */
  private getVideoMatchedKeywords(video: VideoInfo, allKeywords: string[]): string[] {
    const matched: string[] = [];
    const searchText = `${video.title} ${video.author}`.toLowerCase();
    
    for (const keyword of allKeywords) {
      const keywordLower = this.config.matcher.caseSensitive ? keyword : keyword.toLowerCase();
      if (searchText.includes(keywordLower)) {
        matched.push(keyword);
      }
    }
    
    return matched;
  }

  /**
   * 停止所有播放器
   */
  async stop(): Promise<void> {
    logger.info('🛑 停止并发播放器...');
    this.isRunning = false;

    // 等待所有播放器完成当前任务
    const activePlayerCount = this.players.filter(p => p.isActive).length;
    if (activePlayerCount > 0) {
      logger.info(`等待 ${activePlayerCount} 个播放器完成当前任务...`);
      
      // 等待最多30秒
      let waitTime = 0;
      while (waitTime < 30000 && this.players.some(p => p.isActive)) {
        await this.delay(1000);
        waitTime += 1000;
      }
    }

    // 清理所有播放器
    for (const player of this.players) {
      try {
        await player.platform.cleanup();
        logger.info(`🧹 播放器 #${player.id} 清理完成`);
      } catch (error) {
        logger.error(`播放器 #${player.id} 清理失败:`, error);
      }
    }

    this.players = [];
    logger.info('✅ 所有播放器已停止');
  }

  /**
   * 获取状态统计
   */
  getStatus() {
    const totalTasks = this.taskQueue.length + this.completedTasks.length;
    const completedCount = this.completedTasks.filter(t => t.status === 'completed').length;
    const failedCount = this.completedTasks.filter(t => t.status === 'failed').length;
    const pendingCount = this.taskQueue.filter(t => t.status === 'pending').length;
    const playingCount = this.taskQueue.filter(t => t.status === 'playing').length;

    return {
      totalPlayers: this.players.length,
      activePlayers: this.players.filter(p => p.isActive).length,
      totalTasks,
      completedCount,
      failedCount,
      pendingCount,
      playingCount,
      queueLength: this.taskQueue.length
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.taskQueue = this.taskQueue.filter(t => t.status === 'playing');
    logger.info('🧹 已清空播放队列（保留正在播放的任务）');
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
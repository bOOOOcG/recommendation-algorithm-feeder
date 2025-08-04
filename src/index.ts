import { AlgorithmFeeder } from './core/feeder.js';
import { PlatformFactory } from './platforms/platform-factory.js';
import { KeywordMatcher } from './matchers/keyword-matcher.js';
import { ConfigManager } from './config/config.js';
import { logger } from './core/logger.js';

/**
 * 应用程序入口点
 */
async function main() {
  try {
    // 获取配置
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();
    
    // 验证配置
    configManager.validateConfig();
    
    // 设置日志级别
    logger.setLevel(config.logLevel);
    
    logger.info('='.repeat(50));
    logger.info('🚀 推荐算法喂养器启动');
    logger.info('='.repeat(50));
    
    // 显示配置信息
    logger.info(`🎯 平台: ${config.platformType} (${config.platform.baseUrl})`);
    logger.info(`🔍 目标关键词: ${config.matcher.keywords.join(', ')}`);
    logger.info(`🎬 播放时长: ${config.playDuration / 1000}秒`);
    logger.info(`⏱️  搜索间隔: ${config.searchInterval / 1000}秒`);
    logger.info(`🎭 并发播放器: ${config.concurrentPlayers || 1} 个`);
    logger.info(`👤 无头模式: ${config.headless ? '是' : '否'}`);
    logger.info(`🔧 API模式: ${config.useApiMode ? '启用' : '禁用'}`);
    logger.info(`📺 初始视频源: ${config.initialVideoSource || 'home'}`);
    logger.info(`📊 每页视频数: ${config.videosPerPage || 12}`);
    logger.info(`🔍 主动搜索: ${config.enableActiveSearch ? '启用' : '禁用'} (阈值: ${config.activeSearchThreshold || 10}轮, 策略: ${config.activeSearchStrategy || 'random'})`);
    logger.info(`📋 队列管理: 每轮最多${config.maxVideosPerQueue || 5}个视频, 队列最大${config.maxQueueSize || 20}个`);
    logger.info(`🎭 模拟播放: ${config.useSimulatedPlayback ? '启用' : '禁用'}${config.useSimulatedPlayback ? ` (模拟${config.simulatedWatchDuration || 30}秒, 实际等待${config.simulatedActualWaitTime || 5}秒, ${config.simulatedPlaybackSpeed || 2}x速度, ${config.concurrentPlayers || 1}个并发工作器)` : ''}`);
    
    if (config.useSimulatedPlayback) {
      logger.info('🚨 模拟播放模式: 不会真实打开浏览器，仅通过API调用模拟播放');
      if ((config.concurrentPlayers || 1) > 1) {
        logger.info(`⚡ 多线程模拟播放: ${config.concurrentPlayers}个并发工作器同时处理视频`);
      }
    }
    
    // 创建平台实例
    const platform = PlatformFactory.createPlatform(
      config.platformType,
      config.platform, 
      config.headless,
      config.videosPerPage || 12,
      config.apiTimeout || 30000,
      config.useSimulatedPlayback || false,
      {
        watchDuration: config.simulatedWatchDuration || 30,
        minWaitTime: config.simulatedActualWaitTime || 5,
        playbackSpeed: config.simulatedPlaybackSpeed || 2,
        durationVariation: config.simulatedDurationVariation || 5
      }
    );
    
    // 设置初始视频源
    if (config.initialVideoSource && platform.switchVideoSource) {
      platform.switchVideoSource(config.initialVideoSource);
    }
    
    // 创建匹配器实例
    const matcher = new KeywordMatcher(config.matcher);
    
    // 创建喂养器实例
    const feeder = new AlgorithmFeeder(platform, matcher, config);
    
    // 处理进程退出信号
    setupGracefulShutdown(feeder);
    
    // 启动喂养流程
    await feeder.start();
    
  } catch (error) {
    logger.error('应用程序启动失败:', error);
    process.exit(1);
  }
}

/**
 * 设置优雅退出处理
 */
function setupGracefulShutdown(feeder: AlgorithmFeeder) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`接收到 ${signal} 信号，正在出...`);
      
      try {
        await feeder.stop();
        logger.info('应用程序已安全退出');
        process.exit(0);
      } catch (error) {
        logger.error('退出过程中出错:', error);
        process.exit(1);
      }
    });
  });
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝:', reason);
    process.exit(1);
  });
}

// 运行主程序
main().catch(error => {
  logger.error('主程序运行失败:', error);
  process.exit(1);
});
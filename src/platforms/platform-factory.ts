import { PlatformInterface, PlatformConfig } from '../types/index.js';
import { BilibiliPlatform } from './bilibili/bilibili-platform.js';
import { YouTubePlatform } from './youtube/youtube-platform.js';
import { logger } from '../core/logger.js';

/**
 * 平台工厂类
 * 根据配置创建相应的平台实例
 */
export class PlatformFactory {
  /**
   * 创建平台实例
   */
  static createPlatform(
    platformType: string,
    config: PlatformConfig,
    headless: boolean = true,
    videosPerPage: number = 20,
    apiTimeout: number = 30000,
    useSimulatedPlayback: boolean = false,
    simulatedConfig?: { watchDuration?: number; minWaitTime?: number; playbackSpeed?: number; durationVariation?: number }
  ): PlatformInterface {
    
    logger.info(`创建平台实例: ${platformType}`);
    
    switch (platformType.toLowerCase()) {
      case 'bilibili':
        return new BilibiliPlatform(config, headless, videosPerPage, apiTimeout, useSimulatedPlayback, simulatedConfig);
      
      case 'youtube':
        return new YouTubePlatform(config, headless, videosPerPage, apiTimeout, useSimulatedPlayback);
      
      case 'twitch':
        logger.warn('Twitch平台尚未实现，回退到Bilibili');
        return new BilibiliPlatform(config, headless, videosPerPage, apiTimeout, useSimulatedPlayback, simulatedConfig);
      
      default:
        logger.warn(`不支持的平台类型: ${platformType}，使用默认Bilibili平台`);
        return new BilibiliPlatform(config, headless, videosPerPage, apiTimeout, useSimulatedPlayback, simulatedConfig);
    }
  }

  /**
   * 获取支持的平台列表
   */
  static getSupportedPlatforms(): string[] {
    return ['bilibili', 'youtube', 'twitch'];
  }

  /**
   * 检查平台是否受支持
   */
  static isPlatformSupported(platformType: string): boolean {
    return this.getSupportedPlatforms().includes(platformType.toLowerCase());
  }
}
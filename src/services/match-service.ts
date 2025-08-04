import { VideoInfo, MatcherConfig } from '../types/index.js';
import { logger } from '../core/logger.js';

/**
 * 视频匹配服务
 * 提供视频内容与关键词匹配的功能
 */
export class MatchService {
  private config: MatcherConfig;

  constructor(config: MatcherConfig) {
    this.config = config;
  }

  /**
   * 检查视频是否匹配关键词
   * @param video 视频信息
   * @returns 匹配的关键词数组
   */
  checkVideoMatch(video: VideoInfo): string[] {
    const matchedKeywords: string[] = [];
    
    // 构建搜索文本
    const searchText = `${video.title} ${video.author || ''}`.toLowerCase();
    
    // 检查每个关键词
    for (const keyword of this.config.keywords) {
      const keywordToCheck = this.config.caseSensitive ? keyword : keyword.toLowerCase();
      
      if (searchText.includes(keywordToCheck)) {
        matchedKeywords.push(keyword);
      }
    }

    // 根据匹配模式决定是否匹配
    if (this.config.matchMode === 'all') {
      // 需要匹配所有关键词
      return matchedKeywords.length === this.config.keywords.length ? matchedKeywords : [];
    } else {
      // 匹配任意关键词即可
      return matchedKeywords;
    }
  }

  /**
   * 检查视频是否匹配（返回布尔值）
   * @param video 视频信息
   * @returns 是否匹配
   */
  isVideoMatched(video: VideoInfo): boolean {
    return this.checkVideoMatch(video).length > 0;
  }

  /**
   * 从视频列表中筛选匹配的视频
   * @param videos 视频列表
   * @returns 匹配的视频列表
   */
  filterMatchedVideos(videos: VideoInfo[]): VideoInfo[] {
    return videos.filter(video => this.isVideoMatched(video));
  }

  /**
   * 更新匹配配置
   * @param newConfig 新的匹配配置
   */
  updateConfig(newConfig: MatcherConfig): void {
    this.config = newConfig;
    logger.debug('匹配服务配置已更新');
  }

  /**
   * 获取当前配置
   * @returns 当前匹配配置
   */
  getConfig(): MatcherConfig {
    return { ...this.config };
  }

  /**
   * 获取匹配统计信息
   * @param videos 视频列表
   * @returns 匹配统计
   */
  getMatchStats(videos: VideoInfo[]): {
    total: number;
    matched: number;
    matchRate: number;
    matchedKeywords: Record<string, number>;
  } {
    let matched = 0;
    const matchedKeywords: Record<string, number> = {};

    for (const video of videos) {
      const keywords = this.checkVideoMatch(video);
      if (keywords.length > 0) {
        matched++;
        keywords.forEach(keyword => {
          matchedKeywords[keyword] = (matchedKeywords[keyword] || 0) + 1;
        });
      }
    }

    return {
      total: videos.length,
      matched,
      matchRate: videos.length > 0 ? (matched / videos.length) * 100 : 0,
      matchedKeywords
    };
  }
}
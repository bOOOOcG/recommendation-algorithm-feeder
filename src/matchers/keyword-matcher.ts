import { MatcherInterface, MatcherConfig, VideoInfo } from '../types/index.js';
import { logger } from '../core/logger.js';

/**
 * 关键词匹配器
 * 根据设定的关键词匹配视频标题和标签
 */
export class KeywordMatcher implements MatcherInterface {
  private config: MatcherConfig;

  constructor(config?: MatcherConfig) {
    this.config = config || {
      keywords: [],
      matchMode: 'any',
      caseSensitive: false
    };
  }

  /**
   * 配置匹配器
   */
  configure(config: MatcherConfig): void {
    this.config = config;
    logger.debug(`关键词匹配器配置更新: ${JSON.stringify(config)}`);
  }

  /**
   * 匹配视频是否符合条件
   */
  match(video: VideoInfo): boolean {
    if (this.config.keywords.length === 0) {
      logger.warn('关键词列表为空，跳过匹配');
      return false;
    }

    // 准备要匹配的文本内容
    const textToMatch = this.prepareTextForMatching(video);
    
    // 执行匹配逻辑
    const matchResult = this.performMatching(textToMatch);
    
    if (matchResult) {
      logger.info(`视频匹配成功: ${video.title}`);
    } else {
      logger.debug(`视频不匹配: ${video.title}`);
    }
    
    return matchResult;
  }

  /**
   * 准备用于匹配的文本内容
   */
  private prepareTextForMatching(video: VideoInfo): string {
    const texts = [video.title];
    
    // 添加作者信息
    if (video.author) {
      texts.push(video.author);
    }
    
    // 添加标签信息
    if (video.tags && video.tags.length > 0) {
      texts.push(...video.tags);
    }
    
    const combinedText = texts.join(' ');
    
    // 根据配置决定是否区分大小写
    return this.config.caseSensitive ? combinedText : combinedText.toLowerCase();
  }

  /**
   * 执行具体的匹配逻辑
   */
  private performMatching(text: string): boolean {
    const keywords = this.config.caseSensitive 
      ? this.config.keywords 
      : this.config.keywords.map(k => k.toLowerCase());

    switch (this.config.matchMode) {
      case 'all':
        // 所有关键词都必须匹配
        return keywords.every(keyword => text.includes(keyword));
      
      case 'any':
      default:
        // 任意一个关键词匹配即可
        return keywords.some(keyword => text.includes(keyword));
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): MatcherConfig {
    return { ...this.config };
  }

  /**
   * 添加关键词
   */
  public addKeywords(keywords: string[]): void {
    this.config.keywords.push(...keywords);
    logger.debug(`添加关键词: ${keywords.join(', ')}`);
  }

  /**
   * 移除关键词
   */
  public removeKeywords(keywords: string[]): void {
    this.config.keywords = this.config.keywords.filter(k => !keywords.includes(k));
    logger.debug(`移除关键词: ${keywords.join(', ')}`);
  }

  /**
   * 清空所有关键词
   */
  public clearKeywords(): void {
    this.config.keywords = [];
    logger.debug('清空所有关键词');
  }
}
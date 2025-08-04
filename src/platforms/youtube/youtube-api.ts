import { VideoInfo } from '../../types/index.js';
import { logger } from '../../core/logger.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

/**
 * YouTube API客户端
 * 通过网页API获取个性化推荐内容
 */
export class YouTubeAPI {
  private cookies: string;
  private userAgent: string;
  private proxyAgent: any;

  constructor(cookies: string, timeout: number = 30000) {
    this.cookies = cookies;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
    this.proxyAgent = this.createProxyAgent();
    
    logger.info('YouTube API客户端初始化完成');
  }

  /**
   * 获取真正的首页个性化推荐
   */
  async getHomeFeedRecommendations(count: number = 20): Promise<VideoInfo[]> {
    try {
      logger.info(`从YouTube获取个性化首页推荐 (数量: ${count})`);
      
      const homePageData = await this.fetchHomePage();
      const videos = this.extractVideosFromHomePage(homePageData, count);
      
      logger.info(`获取到 ${videos.length} 个YouTube个性化推荐视频`);
      return videos;
      
    } catch (error) {
      logger.error('获取YouTube个性化推荐失败:', error);
      return [];
    }
  }

  /**
   * 获取用户的观看历史推荐
   */
  async getWatchHistoryRecommendations(count: number = 20): Promise<VideoInfo[]> {
    try {
      logger.info(`获取基于观看历史的推荐 (数量: ${count})`);
      
      // 先获取最近观看的视频
      const recentVideo = await this.getRecentWatchedVideo();
      if (!recentVideo) {
        logger.warn('无法获取最近观看的视频，回退到首页推荐');
        return this.getHomeFeedRecommendations(count);
      }
      
      // 基于最近观看的视频获取相关推荐
      return this.getRelatedVideos(recentVideo, count);
      
    } catch (error) {
      logger.error('获取基于历史的推荐失败:', error);
      return [];
    }
  }

  /**
   * 获取相关视频推荐
   */
  async getRelatedVideos(videoId: string, count: number = 20): Promise<VideoInfo[]> {
    try {
      logger.info(`获取相关视频推荐: ${videoId} (数量: ${count})`);
      
      const watchPageData = await this.fetchWatchPage(videoId);
      const videos = this.extractRelatedVideos(watchPageData, count);
      
      logger.info(`获取到 ${videos.length} 个相关视频`);
      return videos;
      
    } catch (error) {
      logger.error(`获取相关视频失败: ${videoId}`, error);
      return [];
    }
  }

  /**
   * 获取短视频推荐 (基于观看历史的推荐)
   */
  async getShortVideoFeed(count: number = 20): Promise<VideoInfo[]> {
    try {
      logger.info(`获取YouTube短视频推荐 (数量: ${count})`);
      
      // 使用基于观看历史的推荐
      const videos = await this.getWatchHistoryRecommendations(count);
      
      logger.info(`获取到 ${videos.length} 个YouTube短视频`);
      return videos;
      
    } catch (error) {
      logger.error('获取YouTube短视频失败:', error);
      return [];
    }
  }

  /**
   * 搜索视频（保持原有功能）
   */
  async searchVideos(query: string, count: number = 20): Promise<VideoInfo[]> {
    try {
      logger.info(`搜索YouTube视频: "${query}" (数量: ${count})`);
      
      const searchData = await this.fetchSearchResults(query);
      const videos = this.extractSearchResults(searchData, count);
      
      logger.info(`搜索到 ${videos.length} 个YouTube视频`);
      return videos;
      
    } catch (error) {
      logger.error(`搜索YouTube视频失败: "${query}"`, error);
      return [];
    }
  }

  /**
   * 验证Cookie有效性
   */
  async verifyCookie(): Promise<{ valid: boolean; reason: string; userInfo?: any }> {
    try {
      logger.info('验证YouTube Cookie有效性...');
      
      const response = await this.makeRequest('https://www.youtube.com/account');
      
      if (response.status === 302 && response.headers.get('location')?.includes('accounts.google.com')) {
        return {
          valid: false,
          reason: 'Cookie已过期，被重定向到登录页面'
        };
      }
      
      const text = await response.text();
      
      if (text.includes('Sign in') || text.includes('登入') || text.includes('登录')) {
        return {
          valid: false,
          reason: '页面显示需要登录'
        };
      }
      
      // 尝试提取用户信息
      const channelMatch = text.match(/"channelName":"([^"]+)"/);
      const emailMatch = text.match(/"email":"([^"]+)"/);
      
      return {
        valid: true,
        reason: '成功验证账户',
        userInfo: {
          channelName: channelMatch ? channelMatch[1] : 'Unknown',
          email: emailMatch ? emailMatch[1] : 'Unknown'
        }
      };
      
    } catch (error) {
      logger.error('验证Cookie失败:', error);
      return {
        valid: false,
        reason: `验证失败: ${error.message}`
      };
    }
  }

  /**
   * 获取首页数据
   */
  private async fetchHomePage(): Promise<string> {
    const response = await this.makeRequest('https://www.youtube.com/');
    return response.text();
  }

  /**
   * 获取观看页面数据
   */
  private async fetchWatchPage(videoId: string): Promise<string> {
    const response = await this.makeRequest(`https://www.youtube.com/watch?v=${videoId}`);
    return response.text();
  }

  /**
   * 获取搜索结果数据
   */
  private async fetchSearchResults(query: string): Promise<string> {
    const encodedQuery = encodeURIComponent(query);
    const response = await this.makeRequest(`https://www.youtube.com/results?search_query=${encodedQuery}`);
    return response.text();
  }

  /**
   * 从首页提取视频信息
   */
  private extractVideosFromHomePage(html: string, count: number): VideoInfo[] {
    const videos: VideoInfo[] = [];
    
    try {
      // 查找ytInitialData
      const ytDataMatch = html.match(/var ytInitialData = ({.*?});/);
      if (!ytDataMatch) {
        logger.warn('无法找到ytInitialData');
        return [];
      }
      
      const ytData = JSON.parse(ytDataMatch[1]);
      
      // 导航到推荐视频section
      const contents = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.richGridRenderer?.contents;
      
      if (!contents) {
        logger.warn('无法找到推荐视频内容');
        return [];
      }
      
      for (const item of contents) {
        if (videos.length >= count) break;
        
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (!videoRenderer) continue;
        
        const video = this.parseVideoRenderer(videoRenderer);
        if (video) {
          videos.push(video);
        }
      }
      
    } catch (error) {
      logger.error('解析首页视频数据失败:', error);
    }
    
    return videos;
  }

  /**
   * 从观看页面提取相关视频
   */
  private extractRelatedVideos(html: string, count: number): VideoInfo[] {
    const videos: VideoInfo[] = [];
    
    try {
      // 类似的解析逻辑，但针对相关视频区域
      const ytDataMatch = html.match(/var ytInitialData = ({.*?});/);
      if (!ytDataMatch) {
        return [];
      }
      
      const ytData = JSON.parse(ytDataMatch[1]);
      
      // 查找相关视频区域
      const secondaryResults = ytData?.contents?.twoColumnWatchNextResultsRenderer?.secondaryResults?.secondaryResultsRenderer?.results;
      
      if (!secondaryResults) {
        return [];
      }
      
      for (const item of secondaryResults) {
        if (videos.length >= count) break;
        
        const videoRenderer = item?.compactVideoRenderer;
        if (!videoRenderer) continue;
        
        const video = this.parseCompactVideoRenderer(videoRenderer);
        if (video) {
          videos.push(video);
        }
      }
      
    } catch (error) {
      logger.error('解析相关视频数据失败:', error);
    }
    
    return videos;
  }

  /**
   * 从搜索结果提取视频
   */
  private extractSearchResults(html: string, count: number): VideoInfo[] {
    const videos: VideoInfo[] = [];
    
    try {
      const ytDataMatch = html.match(/var ytInitialData = ({.*?});/);
      if (!ytDataMatch) {
        return [];
      }
      
      const ytData = JSON.parse(ytDataMatch[1]);
      
      const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
      
      if (!contents) {
        return [];
      }
      
      for (const item of contents) {
        if (videos.length >= count) break;
        
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;
        
        const video = this.parseVideoRenderer(videoRenderer);
        if (video) {
          videos.push(video);
        }
      }
      
    } catch (error) {
      logger.error('解析搜索结果失败:', error);
    }
    
    return videos;
  }

  /**
   * 解析标准视频渲染器
   */
  private parseVideoRenderer(renderer: any): VideoInfo | null {
    try {
      if (!renderer.videoId || !renderer.title) {
        return null;
      }

      const title = renderer.title.runs?.[0]?.text || renderer.title.simpleText || '';
      const author = renderer.ownerText?.runs?.[0]?.text || renderer.longBylineText?.runs?.[0]?.text || '';
      const duration = this.parseDuration(renderer.lengthText?.simpleText || '');
      const viewCount = this.parseViewCount(renderer.viewCountText?.simpleText || '');
      const publishTime = renderer.publishedTimeText?.simpleText || '';

      return {
        id: renderer.videoId,
        title,
        author,
        duration,
        url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
        platform: 'youtube',
        description: renderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '',
        tags: [],
        viewCount,
        publishTime,
        thumbnail: renderer.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${renderer.videoId}/mqdefault.jpg`
      };
    } catch (error) {
      logger.error('解析视频渲染器失败:', error);
      return null;
    }
  }

  /**
   * 解析紧凑视频渲染器
   */
  private parseCompactVideoRenderer(renderer: any): VideoInfo | null {
    try {
      if (!renderer.videoId || !renderer.title) {
        return null;
      }

      const title = renderer.title.simpleText || renderer.title.runs?.[0]?.text || '';
      const author = renderer.longBylineText?.runs?.[0]?.text || '';
      const duration = this.parseDuration(renderer.lengthText?.simpleText || '');
      const viewCount = this.parseViewCount(renderer.viewCountText?.simpleText || '');

      return {
        id: renderer.videoId,
        title,
        author,
        duration,
        url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
        platform: 'youtube',
        description: '',
        tags: [],
        viewCount,
        publishTime: '',
        thumbnail: renderer.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${renderer.videoId}/mqdefault.jpg`
      };
    } catch (error) {
      logger.error('解析紧凑视频渲染器失败:', error);
      return null;
    }
  }

  /**
   * 解析时长
   */
  private parseDuration(durationText: string): number {
    try {
      if (!durationText) return 0;
      
      const parts = durationText.split(':');
      if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
      
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 解析观看次数
   */
  private parseViewCount(viewText: string): number {
    try {
      if (!viewText) return 0;
      
      const match = viewText.match(/([\d,]+)/);
      if (match) {
        return parseInt(match[1].replace(/,/g, ''));
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取最近观看的视频ID
   */
  private async getRecentWatchedVideo(): Promise<string | null> {
    try {
      const response = await this.makeRequest('https://www.youtube.com/feed/history');
      const html = await response.text();
      
      // 从观看历史中提取最新的视频ID
      const videoMatch = html.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
      return videoMatch ? videoMatch[1] : null;
      
    } catch (error) {
      logger.error('获取观看历史失败:', error);
      return null;
    }
  }

  /**
   * 创建HTTP请求
   */
  private async makeRequest(url: string, options: any = {}): Promise<any> {
    const fetchOptions: any = {
      method: 'GET',
      headers: {
        'Cookie': this.cookies,
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        ...options.headers
      },
      ...options
    };

    // 添加代理配置
    if (this.proxyAgent) {
      fetchOptions.agent = this.proxyAgent;
    }

    // 增加超时时间
    fetchOptions.timeout = 15000;

    try {
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`HTTP请求失败: ${url}`, error);
      throw error;
    }
  }

  /**
   * 创建代理Agent
   */
  private createProxyAgent(): any {
    const useProxy = process.env.USE_PROXY?.toLowerCase() === 'true';
    if (!useProxy) {
      return null;
    }

    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const socksProxy = process.env.SOCKS_PROXY || process.env.socks_proxy;

    if (httpsProxy) {
      logger.info(`使用HTTPS代理: ${httpsProxy}`);
      return new HttpsProxyAgent(httpsProxy);
    }

    if (httpProxy) {
      logger.info(`使用HTTP代理: ${httpProxy}`);
      return new HttpsProxyAgent(httpProxy);
    }

    if (socksProxy) {
      logger.info(`使用SOCKS代理: ${socksProxy}`);
      return new SocksProxyAgent(socksProxy);
    }

    return null;
  }

  /**
   * 更新Cookie
   */
  updateCookie(newCookie: string): void {
    this.cookies = newCookie;
    logger.info('YouTube API Cookie已更新');
  }
}
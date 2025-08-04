import axios, { AxiosInstance } from 'axios';
import { VideoInfo, PlatformConfig } from '../../types/index.js';
import { logger } from '../../core/logger.js';

/**
 * B站API响应接口
 */
interface BilibiliResponse<T> {
  code: number;
  message: string;
  ttl: number;
  data: T;
}

/**
 * 首页推荐视频列表数据结构
 */
interface RecommendFeedData {
  item: RecommendVideoItem[];
  mid: number;
}

/**
 * 推荐视频项
 */
interface RecommendVideoItem {
  id: number;
  bvid: string;
  cid: number;
  goto: string;
  uri: string;
  pic: string;
  title: string;
  duration: number;
  pubdate: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: {
    view: number;
    like: number;
    danmaku: number;
  };
  rcmd_reason?: {
    content?: string;
    reason_type: number;
  };
}

/**
 * 相关视频推荐数据（单视频推荐）
 */
interface RelatedVideoData extends Array<RelatedVideoItem> {}

interface RelatedVideoItem {
  aid: number;
  bvid: string;
  cid: number;
  pic: string;
  title: string;
  duration: number;
  pubdate: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: {
    view: number;
    like: number;
    danmaku: number;
  };
}

/**
 * 搜索响应数据结构
 */
interface SearchData {
  seid: string;
  page: number;
  pagesize: number;
  numResults: number;
  numPages: number;
  suggest_keyword: string;
  rqt_type: string;
  cost_time: any;
  exp_list: any;
  egg_hit: number;
  result: SearchVideoItem[];
  show_column: number;
}

/**
 * 搜索视频项
 */
interface SearchVideoItem {
  type: string;
  id: number;
  author: string;
  mid: number;
  typeid: string;
  typename: string;
  arcurl: string;
  aid: number;
  bvid: string;
  title: string;
  description: string;
  arcrank: string;
  pic: string;
  play: number;
  video_review: number;
  favorites: number;
  tag: string;
  review: number;
  pubdate: number;
  senddate: number;
  duration: string;
  badgepay: boolean;
  hit_columns: string[];
  view_type: string;
  is_pay: number;
  is_union_video: number;
  rec_tags: any;
  new_rec_tags: any[];
  rank_score: number;
}

/**
 * B站API客户端
 * 用于调用B站的推荐算法API
 */
export class BilibiliAPI {
  private client: AxiosInstance;
  private config: PlatformConfig;
  private videosPerPage: number;

  constructor(config: PlatformConfig, videosPerPage: number = 12, timeout: number = 30000) {
    this.config = config;
    this.videosPerPage = videosPerPage;
    this.client = this.createHttpClient(timeout);
  }

  /**
   * 创建HTTP客户端
   */
  private createHttpClient(timeout: number): AxiosInstance {
    const client = axios.create({
      timeout,
      headers: {
        'User-Agent': this.config.headers?.['User-Agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.bilibili.com/',
        'Cookie': this.config.cookies
      }
    });

    // 请求拦截器
    client.interceptors.request.use(request => {
      logger.debug(`API请求: ${request.method?.toUpperCase()} ${request.url}`);
      return request;
    });

    // 响应拦截器
    client.interceptors.response.use(
      response => {
        const data = response.data as BilibiliResponse<any>;
        if (data.code !== 0) {
          logger.warn(`API返回错误: ${data.code} - ${data.message}`);
        }
        return response;
      },
      error => {
        logger.error('API请求失败:', error.message);
        return Promise.reject(error);
      }
    );

    return client;
  }

  /**
   * 获取首页推荐视频列表
   */
  async getHomeFeedRecommendations(params?: {
    fresh_type?: number;
    ps?: number;
    fresh_idx?: number;
  }): Promise<VideoInfo[]> {
    try {
      const defaultParams = {
        fresh_type: 4,
        ps: this.videosPerPage,
        fresh_idx: 1,
        ...params
      };

      const response = await this.client.get<BilibiliResponse<RecommendFeedData>>(
        'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd',
        { params: defaultParams }
      );

      if (response.data.code !== 0) {
        throw new Error(`API错误: ${response.data.message}`);
      }

      return this.parseRecommendVideos(response.data.data.item);
    } catch (error) {
      logger.error('获取首页推荐失败:', error);
      return [];
    }
  }

  /**
   * 获取单视频相关推荐
   */
  async getRelatedVideos(bvid: string): Promise<VideoInfo[]> {
    try {
      const response = await this.client.get<BilibiliResponse<RelatedVideoData>>(
        'https://api.bilibili.com/x/web-interface/archive/related',
        { params: { bvid } }
      );

      if (response.data.code !== 0) {
        throw new Error(`API错误: ${response.data.message}`);
      }

      return this.parseRelatedVideos(response.data.data);
    } catch (error) {
      logger.error('获取相关视频失败:', error);
      return [];
    }
  }

  /**
   * 获取短视频推荐列表
   */
  async getShortVideoFeed(params?: {
    login_event?: number;
    mobi_app?: string;
    platform?: string;
  }): Promise<VideoInfo[]> {
    try {
      const defaultParams = {
        login_event: 0,
        mobi_app: 'web',
        platform: 'web',
        ...params
      };

      const response = await this.client.get<BilibiliResponse<any>>(
        'https://app.bilibili.com/x/v2/feed/index',
        { params: defaultParams }
      );

      if (response.data.code !== 0) {
        throw new Error(`API错误: ${response.data.message}`);
      }

      return this.parseShortVideoFeed(response.data.data.items || []);
    } catch (error) {
      logger.error('获取短视频推荐失败:', error);
      return [];
    }
  }

  /**
   * 搜索视频
   */
  async searchVideos(keyword: string, params?: {
    order?: string;
    duration?: number;
    tids?: number;
    page?: number;
  }): Promise<VideoInfo[]> {
    try {
      const defaultParams = {
        search_type: 'video',
        keyword: keyword,
        order: 'totalrank', // 综合排序
        duration: 0, // 全部时长
        tids: 0, // 全部分区
        page: 1,
        ...params
      };

      logger.info(`搜索B站视频: "${keyword}" (页码: ${defaultParams.page})`);

      const response = await this.client.get<BilibiliResponse<SearchData>>(
        'https://api.bilibili.com/x/web-interface/search/type',
        { params: defaultParams }
      );

      if (response.data.code !== 0) {
        throw new Error(`搜索API错误: ${response.data.message}`);
      }

      const videos = this.parseSearchVideos(response.data.data.result || []);
      logger.info(`搜索到 ${videos.length} 个B站视频`);
      return videos;

    } catch (error) {
      logger.error(`B站视频搜索失败: "${keyword}"`, error);
      return [];
    }
  }

  /**
   * 综合搜索（所有类型）
   */
  async searchAll(keyword: string): Promise<{
    videos: VideoInfo[];
    totalResults: number;
    seid: string;
  }> {
    try {
      logger.info(`B站综合搜索: "${keyword}"`);

      const response = await this.client.get<BilibiliResponse<any>>(
        'https://api.bilibili.com/x/web-interface/search/all/v2',
        { params: { keyword } }
      );

      if (response.data.code !== 0) {
        throw new Error(`综合搜索API错误: ${response.data.message}`);
      }

      const data = response.data.data;
      let videos: VideoInfo[] = [];

      // 从综合搜索结果中提取视频
      if (data.result && Array.isArray(data.result)) {
        const videoResult = data.result.find((item: any) => item.result_type === 'video');
        if (videoResult && videoResult.data) {
          videos = this.parseSearchVideos(videoResult.data);
        }
      }

      logger.info(`综合搜索到 ${videos.length} 个视频`);

      return {
        videos,
        totalResults: data.numResults || 0,
        seid: data.seid || ''
      };

    } catch (error) {
      logger.error(`B站综合搜索失败: "${keyword}"`, error);
      return {
        videos: [],
        totalResults: 0,
        seid: ''
      };
    }
  }

  /**
   * 解析首页推荐视频数据
   */
  private parseRecommendVideos(items: RecommendVideoItem[]): VideoInfo[] {
    return items
      .filter(item => item.goto === 'av') // 只处理视频类型
      .map(item => ({
        id: item.bvid || item.id.toString(),
        title: item.title,
        author: item.owner?.name || '未知UP主',
        url: this.buildVideoUrl(item.bvid || item.id.toString()),
        duration: item.duration,
        tags: item.rcmd_reason?.content ? [item.rcmd_reason.content] : []
      }));
  }

  /**
   * 解析相关视频推荐数据
   */
  private parseRelatedVideos(items: RelatedVideoItem[]): VideoInfo[] {
    return items.map(item => ({
      id: item.bvid || item.aid.toString(),
      title: item.title,
      author: item.owner?.name || '未知UP主',
      url: this.buildVideoUrl(item.bvid || item.aid.toString()),
      duration: item.duration,
      tags: []
    }));
  }

  /**
   * 解析短视频推荐数据
   */
  private parseShortVideoFeed(items: any[]): VideoInfo[] {
    return items
      .filter(item => item.goto === 'av')
      .map(item => ({
        id: item.param,
        title: item.title,
        author: item.desc_button?.text || '未知UP主',
        url: item.uri || this.buildVideoUrl(item.param),
        duration: item.player_args?.duration,
        tags: []
      }));
  }

  /**
   * 解析搜索视频数据
   */
  private parseSearchVideos(items: SearchVideoItem[]): VideoInfo[] {
    return items
      .filter(item => item.type === 'video' && item.bvid) // 只处理视频类型且有bvid的项
      .map(item => {
        // 处理时长格式 "4:18" -> 转换为秒数
        const durationInSeconds = this.parseDurationToSeconds(item.duration);
        
        // 清理标题中的HTML标签
        const cleanTitle = item.title.replace(/<[^>]*>/g, '');
        
        // 处理标签
        const tags = item.tag ? item.tag.split(',').map(tag => tag.trim()) : [];

        return {
          id: item.bvid,
          title: cleanTitle,
          author: item.author || '未知UP主',
          url: this.buildVideoUrl(item.bvid),
          duration: durationInSeconds,
          description: item.description || '',
          tags: tags,
          viewCount: item.play || 0,
          publishTime: new Date(item.pubdate * 1000).toISOString(),
          thumbnail: item.pic || '',
          platform: 'bilibili'
        } as VideoInfo;
      });
  }

  /**
   * 将时长字符串转换为秒数
   */
  private parseDurationToSeconds(duration: string): number {
    if (!duration) return 0;
    
    try {
      const parts = duration.split(':');
      if (parts.length === 2) {
        // MM:SS 格式
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        // HH:MM:SS 格式
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 构建视频URL
   */
  private buildVideoUrl(videoId: string): string {
    if (videoId.startsWith('BV')) {
      return `https://www.bilibili.com/video/${videoId}`;
    }
    if (videoId.startsWith('av')) {
      return `https://www.bilibili.com/video/${videoId}`;
    }
    // 如果是纯数字，当作aid处理
    return `https://www.bilibili.com/video/av${videoId}`;
  }

  /**
   * 更新Cookie
   */
  updateCookies(cookies: string): void {
    this.config.cookies = cookies;
    this.client.defaults.headers['Cookie'] = cookies;
    logger.info('Cookie已更新');
  }

  /**
   * 检查API连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.client.get<BilibiliResponse<any>>(
        'https://api.bilibili.com/x/web-interface/nav'
      );
      return response.data.code === 0;
    } catch (error) {
      logger.error('API连接检查失败:', error);
      return false;
    }
  }
}
import { chromium, Browser, Page } from 'playwright';
import { PlatformInterface, VideoInfo, PlatformConfig } from '../../types/index.js';
import { YouTubeAPI } from './youtube-api.js';
import { YouTubePlaybackSimulator } from './youtube-simulator.js';
import { logger } from '../../core/logger.js';

/**
 * YouTube平台实现
 * 结合API获取推荐和浏览器播放视频
 */
export class YouTubePlatform implements PlatformInterface {
  private config: PlatformConfig;
  private api: YouTubeAPI;
  private simulator?: YouTubePlaybackSimulator;
  private browser?: Browser;
  private page?: Page;
  private headless: boolean;
  private videosPerPage: number;
  private useSimulatedPlayback: boolean;
  private currentVideoSource: 'home' | 'related' | 'short' = 'home';

  constructor(
    config: PlatformConfig,
    headless: boolean = true,
    videosPerPage: number = 20,
    apiTimeout: number = 30000,
    useSimulatedPlayback: boolean = false
  ) {
    this.config = config;
    this.headless = headless;
    this.videosPerPage = videosPerPage;
    this.useSimulatedPlayback = useSimulatedPlayback;
    
    this.api = new YouTubeAPI(config.cookies, apiTimeout);
    
    // 如果启用模拟播放，初始化模拟器
    if (this.useSimulatedPlayback) {
      this.simulator = new YouTubePlaybackSimulator(config.cookies);
      logger.info('YouTube平台初始化完成 (模拟播放模式)');
    } else {
      logger.info('YouTube平台初始化完成 (真实播放模式)');
    }
  }

  async initialize(): Promise<void> {
    logger.info('YouTube平台初始化完成');
  }

  /**
   * 延迟初始化浏览器（只在需要播放视频时调用）
   */
  private async initializeBrowser(): Promise<void> {
    if (this.browser) {
      return; // 已经初始化过了
    }

    logger.info('初始化YouTube浏览器...');
    
    this.browser = await chromium.launch({
      channel: 'chrome',
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-features=Translate',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--run-all-compositor-stages-before-draw',
        '--disable-threaded-animation',
        '--disable-threaded-scrolling',
        '--disable-checker-imaging',
        '--disable-new-content-rendering-timeout',
        '--disable-image-animation-resync',
        '--disable-background-networking',
        '--disable-background-downloads',
        '--disable-features=MediaRouter'
      ]
    });

    this.page = await this.browser.newPage();
    
    // 设置用户代理
    await this.page.setExtraHTTPHeaders({
      'User-Agent': this.config.headers?.['User-Agent'] || 
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    });

    // 设置Cookie
    if (this.config.cookies) {
      try {
        const cookieObjects = this.parseCookies(this.config.cookies);
        logger.debug(`准备设置 ${cookieObjects.length} 个Cookie`);
        
        if (cookieObjects.length > 0) {
          // 尝试逐个设置Cookie，找出有问题的Cookie
          let successCount = 0;
          for (const cookie of cookieObjects) {
            try {
              await this.page.context().addCookies([cookie]);
              successCount++;
            } catch (error) {
              logger.debug(`跳过有问题的Cookie: ${cookie.name}=${cookie.value.substring(0, 20)}...`);
            }
          }
          
          if (successCount > 0) {
            logger.info(`成功设置 ${successCount}/${cookieObjects.length} 个YouTube Cookie`);
          } else {
            logger.warn('所有Cookie都设置失败，将跳过Cookie设置');
          }
        } else {
          logger.warn('没有解析到有效的Cookie');
        }
      } catch (error) {
        logger.error('设置YouTube Cookie失败:', error);
        logger.warn('继续运行，但可能会影响YouTube API功能');
      }
    }

    // 设置视口
    await this.page.setViewportSize({ width: 1920, height: 1080 });

    logger.info('YouTube浏览器初始化完成');
  }

  async getRecommendedVideos(): Promise<VideoInfo[]> {
    logger.info(`从YouTube获取推荐视频 (来源: ${this.currentVideoSource})`);
    
    try {
      switch (this.currentVideoSource) {
        case 'home':
          return await this.api.getHomeFeedRecommendations(this.videosPerPage);
        case 'related':
          // 需要一个基础视频ID来获取相关视频
          logger.warn('相关视频模式需要基础视频ID，暂时返回首页推荐');
          return await this.api.getHomeFeedRecommendations(this.videosPerPage);
        case 'short':
          return await this.api.getShortVideoFeed(this.videosPerPage);
        default:
          return await this.api.getHomeFeedRecommendations(this.videosPerPage);
      }
    } catch (error) {
      logger.error('获取YouTube推荐视频失败:', error);
      return [];
    }
  }

  /**
   * 搜索视频
   */
  async searchVideos(keyword: string, limit: number = 10): Promise<VideoInfo[]> {
    try {
      logger.info(`YouTube搜索视频: "${keyword}" (限制: ${limit}个)`);
      
      const videos = await this.api.searchVideos(keyword, limit);
      
      logger.info(`YouTube搜索到 ${videos.length} 个相关视频`);
      return videos;
      
    } catch (error) {
      logger.error(`YouTube搜索失败: "${keyword}"`, error);
      return [];
    }
  }

  async playVideo(video: VideoInfo): Promise<void> {
    const playDuration = 30; // 默认播放30秒
    
    if (this.useSimulatedPlayback && this.simulator) {
      // 使用模拟播放 - 快速模拟
      await this.simulator.simulatePlayback(video, playDuration);
      return;
    }

    // 真实播放模式
    await this.realPlayVideo(video, playDuration);
  }

  private async realPlayVideo(video: VideoInfo, duration: number): Promise<void> {
    // 延迟初始化浏览器
    await this.initializeBrowser();
    
    if (!this.page) {
      logger.error('浏览器页面未初始化');
      return;
    }

    try {
      logger.info(`🎬 开始真实播放YouTube视频: ${video.title} (${duration}秒)`);
      
      // 导航到视频页面
      await this.page.goto(video.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      // 等待视频播放器加载
      await this.page.waitForSelector('video', { timeout: 10000 });

      // 点击播放按钮（如果需要）
      try {
        const playButton = await this.page.locator('button[aria-label*="播放"], button[title*="播放"], .ytp-play-button').first();
        if (await playButton.isVisible()) {
          await playButton.click();
          logger.debug('点击了播放按钮');
        }
      } catch (error) {
        logger.debug('未找到播放按钮或视频已自动播放');
      }

      // 等待播放时长
      await this.page.waitForTimeout(duration * 1000);

      logger.info(`✅ YouTube视频真实播放完成: ${video.title}`);

    } catch (error) {
      logger.error(`❌ YouTube视频播放失败: ${video.title}`, error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = undefined;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
      }
      
      logger.info('YouTube浏览器已关闭');
    } catch (error) {
      logger.error('关闭YouTube浏览器时出错:', error);
    }
  }

  switchVideoSource(source: 'home' | 'related' | 'short'): void {
    this.currentVideoSource = source;
    logger.info(`YouTube视频源已切换到: ${source}`);
  }

  getCurrentVideoSource(): string {
    return this.currentVideoSource;
  }

  /**
   * 解析Cookie字符串为Cookie对象数组
   */
  private parseCookies(cookieString: string): Array<{name: string, value: string, domain: string, path: string}> {
    const cookies: Array<{name: string, value: string, domain: string, path: string}> = [];
    
    try {
      const cookiePairs = cookieString.split(';');
      
      for (const pair of cookiePairs) {
        const trimmedPair = pair.trim();
        if (!trimmedPair) continue;
        
        const firstEqualIndex = trimmedPair.indexOf('=');
        if (firstEqualIndex === -1) continue;
        
        const name = trimmedPair.substring(0, firstEqualIndex).trim();
        const value = trimmedPair.substring(firstEqualIndex + 1).trim();
        
        // 跳过空的name或value
        if (!name || value === '') continue;
        
        // 跳过一些可能导致问题的Cookie属性
        if (['Domain', 'Path', 'Expires', 'Max-Age', 'HttpOnly', 'Secure', 'SameSite'].includes(name)) {
          continue;
        }
        
        // 验证Cookie名称格式 - 允许更多YouTube常用字符，包括__Secure-前缀
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(name.replace('__Secure-', '').replace('__Host-', ''))) {
          logger.debug(`跳过无效Cookie名称: ${name}`);
          continue;
        }
        
        // 清理Cookie值，移除可能有问题的字符
        let cleanValue = value.replace(/[\r\n\t]/g, '');
        
        // 如果值为空，跳过
        if (!cleanValue) {
          continue;
        }
        
        // 处理特殊的YouTube Cookie域名
        let domain = '.youtube.com';
        if (name.includes('CONSENT') || name.includes('NID')) {
          domain = '.google.com';
        } else if (name.includes('__Secure-3P')) {
          domain = '.youtube.com';
        }
        
        cookies.push({
          name: name,
          value: cleanValue,
          domain: domain,
          path: '/'
        });
      }
      
      logger.debug(`成功解析 ${cookies.length} 个YouTube Cookie`);
    } catch (error) {
      logger.error('解析YouTube Cookie失败:', error);
    }
    
    return cookies;
  }

  /**
   * 获取当前页面信息（用于调试）
   */
  async getCurrentPageInfo(): Promise<{title: string, url: string}> {
    if (!this.page) {
      return { title: '', url: '' };
    }
    
    try {
      const title = await this.page.title();
      const url = this.page.url();
      return { title, url };
    } catch (error) {
      logger.error('获取YouTube页面信息失败:', error);
      return { title: '', url: '' };
    }
  }
}
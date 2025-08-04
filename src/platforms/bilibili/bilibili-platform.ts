import { chromium, Browser, Page } from 'playwright';
import { PlatformInterface, VideoInfo, PlatformConfig } from '../../types/index.js';
import { logger } from '../../core/logger.js';
import { BilibiliAPI } from './bilibili-api.js';
import { BilibiliPlaybackSimulator } from './bilibili-simulator.js';

/**
 * Bilibili平台实现
 * 使用API获取推荐视频，使用浏览器播放目标视频
 */
export class BilibiliPlatform implements PlatformInterface {
  private api: BilibiliAPI;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: PlatformConfig;
  private headless: boolean;
  private currentVideoSource: 'home' | 'related' | 'short' = 'home';
  private lastPlayedVideoId: string | null = null;
  private useSimulatedPlayback: boolean;
  private simulator: BilibiliPlaybackSimulator | null = null;
  private playbackSpeed: number;

  constructor(
    config: PlatformConfig, 
    headless: boolean = true, 
    videosPerPage: number = 12, 
    apiTimeout: number = 30000, 
    useSimulatedPlayback: boolean = false,
    simulatedConfig?: { watchDuration?: number; minWaitTime?: number; playbackSpeed?: number; durationVariation?: number }
  ) {
    this.config = config;
    this.headless = headless;
    this.useSimulatedPlayback = useSimulatedPlayback;
    this.api = new BilibiliAPI(config, videosPerPage, apiTimeout);
    
    // 将模拟播放配置添加到config中以便访问
    this.config.simulatedWatchDuration = simulatedConfig?.watchDuration || 30;
    this.config.simulatedActualWaitTime = simulatedConfig?.minWaitTime || 5;
    this.playbackSpeed = simulatedConfig?.playbackSpeed || 2;
    
    // 初始化模拟播放器
    if (this.useSimulatedPlayback && config.cookies) {
      this.simulator = new BilibiliPlaybackSimulator(config.cookies, this.playbackSpeed, simulatedConfig?.durationVariation || 5);
      logger.info(`🎭 B站模拟播放模式已启用 (模拟${this.config.simulatedWatchDuration}秒，实际等待${this.config.simulatedActualWaitTime}秒，${this.playbackSpeed}x速度)`);
    }
  }

  /**
   * 初始化平台（仅初始化API，模拟播放模式下不初始化浏览器）
   */
  async initialize(): Promise<void> {
    try {
      if (this.useSimulatedPlayback) {
        logger.info(`🎭 初始化Bilibili平台 (模拟播放模式) - 跳过浏览器初始化`);
      } else {
        logger.info('初始化Bilibili平台...');
      }
      
      // 检查API连接
      const isConnected = await this.api.checkConnection();
      if (!isConnected) {
        logger.warn('API连接检查失败，但继续执行');
      }
      
      if (this.useSimulatedPlayback) {
        logger.info(`🎭 Bilibili平台初始化完成 (模拟播放模式) - 无需浏览器`);
      } else {
        logger.info('Bilibili平台初始化完成');
      }
      
    } catch (error) {
      logger.error('Bilibili平台初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取推荐视频列表
   * 根据当前状态选择不同的推荐源
   */
  async getRecommendedVideos(): Promise<VideoInfo[]> {
    try {
      logger.info(`获取推荐视频列表 (来源: ${this.currentVideoSource})...`);
      
      let videos: VideoInfo[] = [];

      switch (this.currentVideoSource) {
        case 'home':
          videos = await this.api.getHomeFeedRecommendations();
          break;
        
        case 'related':
          if (this.lastPlayedVideoId) {
            videos = await this.api.getRelatedVideos(this.lastPlayedVideoId);
          }
          // 如果没有获取到相关视频，回退到首页推荐
          if (videos.length === 0) {
            videos = await this.api.getHomeFeedRecommendations();
            this.currentVideoSource = 'home';
          }
          break;
        
        case 'short':
          videos = await this.api.getShortVideoFeed();
          break;
      }

      logger.info(`成功获取 ${videos.length} 个推荐视频`);
      
      // 随机化视频顺序，模拟真实的推荐体验
      return this.shuffleArray(videos);
      
    } catch (error) {
      logger.error('获取推荐视频失败:', error);
      return [];
    }
  }

  /**
   * 搜索视频
   */
  async searchVideos(keyword: string, limit: number = 10): Promise<VideoInfo[]> {
    try {
      logger.info(`B站搜索视频: "${keyword}" (限制: ${limit}个)`);
      
      const videos = await this.api.searchVideos(keyword, { page: 1 });
      const limitedVideos = videos.slice(0, limit);
      
      logger.info(`B站搜索到 ${limitedVideos.length} 个相关视频`);
      return limitedVideos;
      
    } catch (error) {
      logger.error(`B站搜索失败: "${keyword}"`, error);
      return [];
    }
  }

  /**
   * 播放指定视频
   */
  async playVideo(video: VideoInfo): Promise<void> {
    try {
      logger.info(`开始播放视频: ${video.title}`);
      
      // 如果启用了模拟播放，使用模拟器
      if (this.useSimulatedPlayback && this.simulator) {
        // 根据当前视频来源设置正确的source参数
        const source = this.currentVideoSource;
        // 从配置中获取模拟播放时长和等待时间
        const simulatedDuration = this.config.simulatedWatchDuration || 30;
        const minWaitTime = this.config.simulatedActualWaitTime || 5;
        
        await this.simulator.simulatePlayback(video, simulatedDuration, minWaitTime, source);
        
        // 更新状态
        this.lastPlayedVideoId = video.id;
        this.currentVideoSource = 'related'; // 下次获取相关推荐
        
        return;
      }
      
      // 真实播放模式：延迟初始化浏览器
      if (!this.browser) {
        await this.initializeBrowser();
      }

      if (!this.page) {
        throw new Error('浏览器页面未初始化');
      }
      
      logger.info(`🎬 开始真实播放模式: ${video.title}`);
      
      // 导航到视频页面
      await this.page.goto(video.url, { timeout: 60000 });
      
      // 只等待DOM加载完成，不等待网络空闲（B站页面会持续加载广告等内容）
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });

      // 等待视频播放器加载，增加超时时间
      await this.page.waitForSelector('video, .bilibili-player-video video, .bpx-player-video-wrap video', { timeout: 20000 });

      // 等待一小段时间确保播放器完全初始化
      await this.page.waitForTimeout(2000);

      // 开始播放视频
      await this.page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.muted = true; // 静音播放
          video.play();
        }
      });

      // 等待视频开始播放
      await this.page.waitForFunction(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && !video.paused;
      }, { timeout: 5000 });

      // 更新状态
      this.lastPlayedVideoId = video.id;
      this.currentVideoSource = 'related'; // 下次获取相关推荐

      logger.info('真实视频开始播放');
      
    } catch (error) {
      logger.debug(`播放视频时发生异常: ${video.title}`, error);
      // 不抛出错误，让程序继续运行播放计时
      // 因为很多"错误"实际上不影响视频播放
    }
  }

  /**
   * 延迟初始化浏览器
   */
  private async initializeBrowser(): Promise<void> {
    try {
      logger.info('初始化浏览器...');
      
      // 使用系统Chrome浏览器而不是Chromium
      logger.info('启动Chrome浏览器...');

      this.browser = await chromium.launch({
        channel: 'chrome', // 使用系统安装的Chrome
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--ignore-certificate-errors',
          '--disable-web-security',
          '--allow-running-insecure-content',
          '--autoplay-policy=no-user-gesture-required',
          '--disable-features=VizDisplayCompositor',
          '--enable-features=NetworkService',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-client-side-phishing-detection',
          '--disable-default-apps',
          '--disable-hang-monitor',
          '--disable-popup-blocking',
          '--disable-sync',
          '--disable-translate',
          '--no-first-run',
          '--enable-automation',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        ]
      });

      // 创建页面
      this.page = await this.browser.newPage();
      
      // 更全面的反检测脚本，参考成功的自动化项目
      await this.page.addInitScript(() => {
        // 删除webdriver痕迹
        delete (window as any).navigator.webdriver;
        delete (window as any).navigator.__webdriver_script_fn;
        delete (window as any).navigator.__driver_evaluate;
        delete (window as any).navigator.__webdriver_evaluate;
        delete (window as any).navigator.__selenium_evaluate;
        delete (window as any).navigator.__fxdriver_evaluate;
        delete (window as any).navigator.__driver_unwrapped;
        delete (window as any).navigator.__webdriver_unwrapped;
        delete (window as any).navigator.__selenium_unwrapped;
        delete (window as any).navigator.__fxdriver_unwrapped;
        
        // 覆盖关键属性
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => ({
            length: 5,
            item: () => {},
            namedItem: () => {},
            refresh: () => {}
          })
        });
        
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en-US', 'en']
        });
        
        // 覆盖chrome对象
        if (!(window as any).chrome) {
          (window as any).chrome = {
            runtime: {},
            loadTimes: function() {
              return {
                commitLoadTime: Date.now() / 1000,
                connectionInfo: 'http/1.1',
                finishDocumentLoadTime: Date.now() / 1000,
                finishLoadTime: Date.now() / 1000,
                firstPaintAfterLoadTime: 0,
                firstPaintTime: Date.now() / 1000,
                navigationType: 'Other',
                npnNegotiatedProtocol: 'unknown',
                requestTime: Date.now() / 1000 - 1,
                startLoadTime: Date.now() / 1000 - 1,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: false,
                wasNpnNegotiated: false
              };
            },
            csi: function() {
              return {
                onloadT: Date.now(),
                pageT: Date.now(),
                startE: Date.now(),
                tran: 15
              };
            }
          };
        }
        
        // 覆盖权限查询
        if (navigator.permissions && navigator.permissions.query) {
          const originalQuery = navigator.permissions.query;
          navigator.permissions.query = (parameters: any) => (
            parameters.name === 'notifications' ?
              Promise.resolve({ state: 'default' } as any) :
              originalQuery(parameters)
          );
        }
      });
      
      // 设置用户代理
      await this.page.setExtraHTTPHeaders({
        'User-Agent': this.config.headers?.['User-Agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      // 设置cookie
      if (this.config.cookies) {
        await this.setCookies();
      }
      
      logger.info('浏览器初始化完成');
      
    } catch (error) {
      logger.error('浏览器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置登录cookie
   */
  private async setCookies(): Promise<void> {
    if (!this.page || !this.config.cookies) return;

    try {
      // 解析cookie字符串
      const cookies = this.config.cookies.split(';').map(cookie => {
        const [name, value] = cookie.split('=').map(s => s.trim());
        return {
          name,
          value,
          domain: '.bilibili.com',
          path: '/'
        };
      });

      await this.page.context().addCookies(cookies);
      logger.debug('Cookie设置完成');
      
    } catch (error) {
      logger.error('设置Cookie失败:', error);
    }
  }

  /**
   * 随机化数组顺序
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 切换推荐视频源
   */
  public switchVideoSource(source: 'home' | 'related' | 'short'): void {
    this.currentVideoSource = source;
    logger.info(`切换视频源到: ${source}`);
  }

  /**
   * 更新Cookie
   */
  public updateCookies(cookies: string): void {
    this.config.cookies = cookies;
    this.api.updateCookies(cookies);
    
    // 更新模拟播放器的cookies
    if (this.useSimulatedPlayback && cookies) {
      const playbackSpeed = 2; // 默认速度，实际应该从配置中获取
      this.simulator = new BilibiliPlaybackSimulator(cookies, playbackSpeed, 5); // 使用默认5%浮动
    }
  }

  /**
   * 获取当前视频源
   */
  getCurrentVideoSource(): 'home' | 'related' | 'short' {
    return this.currentVideoSource;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      // 模拟播放模式下无需清理浏览器资源
      if (this.useSimulatedPlayback) {
        logger.info(`🎭 Bilibili平台资源清理完成 (模拟播放模式) - 无浏览器资源`);
        return;
      }
      
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      logger.info('Bilibili平台资源清理完成');
      
    } catch (error) {
      logger.error('清理Bilibili平台资源时出错:', error);
    }
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return true; // API总是可用的
  }

  /**
   * 获取当前视频源
   */
}
import { chromium, Browser, Page } from 'playwright';
import { ConfigManager } from './config/config.js';
import { logger } from './core/logger.js';

/**
 * 浏览器测试工具
 * 只启动浏览器供手动测试，不执行任何自动化操作
 */
class BrowserTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: any;

  constructor() {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getConfig();
  }

  async startBrowser() {
    try {
      logger.info('🔧 启动测试浏览器...');
      
      // 使用Chromium但配置成Chrome模式
      logger.info('🚀 启动Chromium（Chrome模式）...');
      
      this.browser = await chromium.launch({
        channel: 'chrome', // 使用系统安装的Chrome
        headless: false, // 强制有头模式用于测试
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
      
      // 注入反检测脚本
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
        
        // 强化Chrome对象伪装，确保所有Chrome特征都存在
        (window as any).chrome = {
          runtime: {
            onConnect: undefined,
            onMessage: undefined,
            onInstalled: undefined
          },
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
          },
          app: {
            isInstalled: false,
            InstallState: {
              DISABLED: 'disabled',
              INSTALLED: 'installed',
              NOT_INSTALLED: 'not_installed'
            },
            getDetails: function() { return undefined; },
            getIsInstalled: function() { return false; },
            runningState: function() { return 'cannot_run'; }
          }
        };

        // 修改User-Agent检测绕过
        Object.defineProperty(navigator, 'userAgent', {
          get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        });

        // 修改vendor信息
        Object.defineProperty(navigator, 'vendor', {
          get: () => 'Google Inc.'
        });

        // 添加Chrome特有的API
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8
        });

        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8
        });
        
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
      
      // 设置用户代理和Cookie
      await this.page.setExtraHTTPHeaders({
        'User-Agent': this.config.platform.headers?.['User-Agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      // 设置cookie
      await this.page.goto('https://www.bilibili.com');
      
      // 注入cookie
      if (this.config.platform.cookies) {
        const cookieStrings = this.config.platform.cookies.split(';');
        const cookies = cookieStrings.map((cookieStr: string) => {
          const [name, ...valueParts] = cookieStr.trim().split('=');
          const value = valueParts.join('=');
          return {
            name: name.trim(),
            value: value.trim(),
            domain: '.bilibili.com',
            path: '/'
          };
        });
        
        await this.page.context().addCookies(cookies);
        logger.info(`✅ 已注入 ${cookies.length} 个Cookie`);
      }

      // 刷新页面使cookie生效
      await this.page.reload();
      await this.page.waitForLoadState('networkidle');

      logger.info('✅ 浏览器启动成功！');
      logger.info('📋 测试说明：');
      logger.info('   1. 浏览器已启动，可以手动操作');
      logger.info('   2. 尝试播放视频，检查是否出现"不支持HTML5播放器"错误');
      logger.info('   3. 按 Ctrl+C 退出测试');
      logger.info('   4. 当前页面：https://www.bilibili.com');

      // 等待用户操作，直到收到退出信号
      return new Promise<void>((resolve) => {
        process.on('SIGINT', async () => {
          logger.info('🛑 收到退出信号，正在关闭浏览器...');
          await this.cleanup();
          resolve();
        });
      });

    } catch (error) {
      logger.error('浏览器启动失败:', error);
      await this.cleanup();
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info('🔧 浏览器已关闭');
    }
  }

  // 添加一些测试方法
  async navigateToVideo(bvid: string) {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }
    
    const url = `https://www.bilibili.com/video/${bvid}`;
    logger.info(`🎬 导航到视频：${url}`);
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async checkVideoPlayer() {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    try {
      // 检查视频播放器是否存在
      const videoSelector = 'video, .bilibili-player-video video, .bpx-player-video-wrap video';
      await this.page.waitForSelector(videoSelector, { timeout: 10000 });
      
      const videoInfo = await this.page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          return {
            found: true,
            readyState: video.readyState,
            networkState: video.networkState,
            paused: video.paused,
            muted: video.muted,
            currentTime: video.currentTime,
            duration: video.duration
          };
        }
        return { found: false };
      });

      logger.info('🎬 视频播放器检查结果:', videoInfo);
      return videoInfo;
    } catch (error) {
      logger.error('❌ 视频播放器检查失败:', error);
      return { found: false, error: error.message };
    }
  }
}

// 主函数
async function main() {
  const tester = new BrowserTester();
  
  try {
    await tester.startBrowser();
  } catch (error) {
    logger.error('测试失败:', error);
    process.exit(1);
  }
}

// 运行测试 - 直接执行，不做条件判断
main().catch(error => {
  logger.error('测试运行失败:', error);
  process.exit(1);
});
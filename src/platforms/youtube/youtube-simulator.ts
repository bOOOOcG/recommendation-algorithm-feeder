import { VideoInfo } from '../../types/index.js';
import { logger } from '../../core/logger.js';
import { YouTubeAPI } from './youtube-api.js';

/**
 * YouTube播放模拟器
 * 不真实播放视频，但模拟所有播放相关的API调用
 * 让YouTube认为我们真实观看了视频
 */
export class YouTubePlaybackSimulator {
  private api: YouTubeAPI;
  private cookies: string;
  private userAgent: string;

  constructor(cookies: string) {
    this.cookies = cookies;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.api = new YouTubeAPI(cookies);
  }

  /**
   * 模拟播放视频 - 不启动真实播放器
   * 只发送必要的API请求让YouTube认为我们在播放
   * @param video 视频信息
   * @param simulatedDuration 模拟观看的时长(秒) - 告诉YouTube我们看了多久
   * @param actualWaitTime 实际等待时间(秒) - 实际花费的时间(可以比simulatedDuration短)
   */
  async simulatePlayback(video: VideoInfo, simulatedDuration: number = 30, actualWaitTime?: number): Promise<void> {
    // 如果没有指定实际等待时间，默认为模拟时长的1/10 (快速模式)
    const waitTime = actualWaitTime || Math.max(1, Math.floor(simulatedDuration / 10));
    
    try {
      logger.info(`🎭 开始模拟播放: ${video.title} (模拟${simulatedDuration}秒，实际${waitTime}秒)`);

      // 1. 访问视频页面（获取初始数据）
      await this.visitVideoPage(video.id);
      
      // 2. 初始化播放器会话
      const playerData = await this.initializePlayer(video.id);
      
      // 3. 模拟播放过程 (告诉YouTube我们看了simulatedDuration秒，但实际只等待waitTime秒)
      await this.simulatePlaybackProgress(video.id, simulatedDuration, waitTime, playerData);
      
      // 4. 上报观看统计 (报告我们看了simulatedDuration秒)
      await this.reportWatchTime(video.id, simulatedDuration);
      
      logger.info(`✅ 模拟播放完成: ${video.title} (${waitTime}秒内模拟了${simulatedDuration}秒观看)`);
      
    } catch (error) {
      logger.error(`❌ 模拟播放失败: ${video.title}`, error);
    }
  }

  /**
   * 1. 访问视频页面，获取必要的token和参数
   */
  private async visitVideoPage(videoId: string): Promise<any> {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      method: 'GET',
      headers: {
        'Cookie': this.cookies,
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.youtube.com/',
      }
    });

    const html = await response.text();
    
    // 提取必要的参数
    const ytInitialData = this.extractYtInitialData(html);
    const ytcfg = this.extractYtConfig(html);
    
    logger.debug(`📄 访问视频页面成功: ${videoId}`);
    return { ytInitialData, ytcfg };
  }

  /**
   * 2. 初始化播放器会话
   */
  private async initializePlayer(videoId: string): Promise<any> {
    const playerEndpoint = 'https://www.youtube.com/youtubei/v1/player';
    
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20231201.01.00',
          hl: 'zh-CN',
          gl: 'CN',
          utcOffsetMinutes: 480
        },
        user: {
          lockedSafetyMode: false
        }
      },
      videoId: videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS'
        }
      }
    };

    const response = await fetch(playerEndpoint, {
      method: 'POST',
      headers: {
        'Cookie': this.cookies,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        'Origin': 'https://www.youtube.com'
      },
      body: JSON.stringify(payload)
    });

    const playerData = await response.json();
    logger.debug(`🎮 播放器初始化成功: ${videoId}`);
    
    return playerData;
  }

  /**
   * 3. 模拟播放进度 - 发送心跳请求 (带安全机制)
   */
  private async simulatePlaybackProgress(videoId: string, simulatedDuration: number, actualWaitTime: number, playerData: any): Promise<void> {
    const baseHeartbeatInterval = 5; // 基础心跳间隔5秒
    const totalSteps = Math.floor(simulatedDuration / baseHeartbeatInterval);
    const stepWaitTime = actualWaitTime / totalSteps; // 每步实际等待时间
    
    logger.debug(`📊 播放进度模拟: ${totalSteps}步，每步等待${stepWaitTime.toFixed(1)}秒`);
    
    for (let i = 1; i <= totalSteps; i++) {
      // 添加随机性 - 心跳时间随机偏移
      const randomOffset = (Math.random() - 0.5) * 2; // ±1秒随机
      const currentTime = i * baseHeartbeatInterval + randomOffset;
      const watchTimeMs = Math.max(0, currentTime * 1000);
      
      await this.sendHeartbeat(videoId, watchTimeMs, currentTime, playerData);
      
      // 随机化等待时间 (±20%变化)
      const randomizedWaitTime = stepWaitTime * (0.8 + Math.random() * 0.4);
      await this.sleep(randomizedWaitTime * 1000);
      
      // 偶尔模拟暂停行为 (5%概率)
      if (Math.random() < 0.05) {
        logger.debug(`⏸️  模拟暂停: ${currentTime.toFixed(1)}秒`);
        const pauseDuration = 1 + Math.random() * 3; // 1-4秒暂停
        await this.sleep(pauseDuration * 1000);
      }
      
      logger.debug(`💓 心跳 ${i}/${totalSteps}: ${currentTime.toFixed(1)}秒`);
    }
    
    // 发送最终心跳
    if (simulatedDuration % baseHeartbeatInterval > 0) {
      await this.sendHeartbeat(videoId, simulatedDuration * 1000, simulatedDuration, playerData);
    }
  }

  /**
   * 发送播放心跳
   */
  private async sendHeartbeat(videoId: string, watchTimeMs: number, currentTime: number, playerData: any): Promise<void> {
    const heartbeatEndpoint = 'https://www.youtube.com/youtubei/v1/player/heartbeat';
    
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20231201.01.00'
        }
      },
      heartbeatRequestParams: {
        heartbeatChecks: ['HEARTBEAT_CHECK_TYPE_LIVE_STREAM_STATUS'],
        heartbeatToken: playerData?.heartbeatParams?.heartbeatToken || '',
        intervalMs: 5000,
        mediaCurrentTime: currentTime.toString(),
        watchTimeMs: watchTimeMs.toString()
      }
    };

    try {
      await fetch(heartbeatEndpoint, {
        method: 'POST',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/json',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          'Origin': 'https://www.youtube.com'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      logger.debug('心跳发送失败:', error.message);
    }
  }

  /**
   * 4. 上报观看时长统计
   */
  private async reportWatchTime(videoId: string, duration: number): Promise<void> {
    const statsEndpoint = 'https://www.youtube.com/api/stats/watchtime';
    
    const params = new URLSearchParams({
      ns: 'yt',
      el: 'detailpage',
      cpn: this.generateCpn(), // 随机客户端播放标识
      docid: videoId,
      ver: '2',
      cmt: duration.toString(),
      rt: duration.toString(),
      of: 'EAE',
      vm: 'CAEQABgE'
    });

    try {
      await fetch(statsEndpoint, {
        method: 'POST',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          'Origin': 'https://www.youtube.com'
        },
        body: params.toString()
      });

      logger.debug(`📊 观看统计上报成功: ${duration}秒`);
    } catch (error) {
      logger.debug('统计上报失败:', error.message);
    }
  }

  /**
   * 工具方法
   */
  private extractYtInitialData(html: string): any {
    const match = html.match(/var ytInitialData = ({.*?});/);
    return match ? JSON.parse(match[1]) : {};
  }

  private extractYtConfig(html: string): any {
    const match = html.match(/ytcfg\.set\(({.*?})\)/);
    return match ? JSON.parse(match[1]) : {};
  }

  private generateCpn(): string {
    // 生成16位随机字符串，YouTube用于追踪播放会话
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
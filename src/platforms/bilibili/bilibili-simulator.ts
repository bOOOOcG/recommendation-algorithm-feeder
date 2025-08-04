import { VideoInfo } from '../../types/index.js';
import { logger } from '../../core/logger.js';

/**
 * B站播放模拟器
 * 模拟播放行为，发送必要的API请求让B站认为我们观看了视频
 */
export class BilibiliPlaybackSimulator {
  private cookies: string;
  private userAgent: string;
  private csrfToken: string = '';
  private userMid: string = '0';
  private playbackSpeed: number;
  private durationVariation: number;

  constructor(cookies: string, playbackSpeed: number = 2, durationVariation: number = 5) {
    this.cookies = cookies;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.playbackSpeed = Math.max(1, Math.min(playbackSpeed, 5)); // 限制在1-5倍速之间
    this.durationVariation = Math.max(0, Math.min(durationVariation, 50)); // 限制在0-50%之间
    this.extractCsrfToken();
    this.extractUserMid();
    
    logger.debug(`🎭 B站模拟播放器初始化: ${this.playbackSpeed}x速度, 时长浮动±${this.durationVariation}%, 用户MID: ${this.userMid}`);
  }

  /**
   * 模拟播放B站视频 - 根据速度配置计算安全版本
   * @param video 视频信息
   * @param simulatedDuration 模拟观看的时长(秒) - 告诉B站我们看了多久
   * @param actualWaitTime 实际等待时间(秒) - 实际花费的时间(可以比simulatedDuration短)
   * @param source 视频来源 - home(首页推荐) | search(搜索) | related(相关推荐) | short(短视频)
   * @returns 实际模拟的观看时长(秒)
   */
  async simulatePlayback(video: VideoInfo, simulatedDuration: number = 30, actualWaitTime?: number, source: 'home' | 'search' | 'related' | 'short' = 'home'): Promise<number> {
    // 根据速度配置计算实际等待时间：模拟时长 ÷ 速度倍率
    const calculatedWaitTime = Math.ceil(simulatedDuration / this.playbackSpeed);
    const waitTime = actualWaitTime || Math.max(3, calculatedWaitTime); // 最少等待3秒
    
    try {
      // 计算实际的播放速度（基于模拟时长和实际等待时间）
      const actualSpeed = simulatedDuration / waitTime;
      const speedDisplay = actualWaitTime ? `${actualSpeed.toFixed(1)}x速度(实际)` : `${this.playbackSpeed}x速度(配置)`;
      
      logger.info(`🎭 开始B站模拟播放: ${video.title} (模拟${simulatedDuration}秒，实际${waitTime}秒，${speedDisplay}，来源:${source})`);

      // 1. 访问视频页面
      const videoPageData = await this.visitVideoPage(video.id, source);
      
      // 2. 获取视频信息 (aid, cid等)
      const videoInfo = await this.getVideoInfo(video.id, source);
      
      // 2.5. 添加随机浮动：根据配置的浮动范围，让每次播放时长都不同
      const halfVariation = this.durationVariation / 100 / 2; // 例如：5% → 0.025
      const randomVariation = (1 - halfVariation) + Math.random() * (halfVariation * 2); // 例如：0.975-1.025 即 ±2.5%
      const randomizedDuration = simulatedDuration * randomVariation;
      
      // 2.6. 安全检查：模拟时长不超过实际视频时长，预留1-3秒缓冲  
      const actualVideoDuration = videoInfo.duration || 3600; // 默认60分钟，防止获取失败
      const bufferTime = 1 + Math.random() * 2; // 1-3秒随机缓冲
      const maxSafeSimulatedDuration = Math.max(5, actualVideoDuration - bufferTime); // 最少5秒
      const safeSimulatedDuration = Math.min(randomizedDuration, maxSafeSimulatedDuration);
      
      // 显示调整信息（包含随机浮动和安全限制）
      if (Math.abs(safeSimulatedDuration - simulatedDuration) > 0.1) {
        const randomPercent = ((randomVariation - 1) * 100).toFixed(1);
        const adjustmentReason = safeSimulatedDuration < randomizedDuration ? '(受视频时长限制)' : '';
        logger.debug(`🎲 播放时长调整: ${video.title}`);
        logger.debug(`   原始${simulatedDuration}秒 → 随机浮动${randomizedDuration.toFixed(1)}秒(${randomPercent}%) → 最终${safeSimulatedDuration.toFixed(1)}秒${adjustmentReason}`);
        if (adjustmentReason) {
          logger.debug(`   视频总长${actualVideoDuration}秒, 安全缓冲${bufferTime.toFixed(1)}秒`);
        }
      }
      
      // 3. 模拟播放心跳 (根据速度调整心跳间隔)
      await this.simulatePlaybackHeartbeat(videoInfo, safeSimulatedDuration, waitTime, source);
      
      // 4. 上报播放历史
      await this.reportPlayHistory(videoInfo, safeSimulatedDuration, source);
      
      logger.info(`✅ B站模拟播放完成: ${video.title} (${waitTime}秒内模拟了${safeSimulatedDuration.toFixed(1)}秒观看, ${this.playbackSpeed}x速度)`);
      
      return safeSimulatedDuration;
      
    } catch (error) {
      logger.error(`❌ B站模拟播放失败: ${video.title}`, error);
      return 0;
    }
  }

  /**
   * 1. 访问视频页面 - 根据来源设置正确的Referer
   */
  private async visitVideoPage(bvid: string, source: 'home' | 'search' | 'related' | 'short' = 'home'): Promise<any> {
    // 随机延迟访问 (0.5-2秒) 模拟真实用户行为
    const delay = 500 + Math.random() * 1500;
    await this.sleep(delay);
    
    // 根据视频来源设置正确的Referer
    let referer = 'https://www.bilibili.com/';
    switch (source) {
      case 'home':
        referer = 'https://www.bilibili.com/'; // 首页推荐
        break;
      case 'search':
        referer = 'https://search.bilibili.com/all'; // 搜索结果页
        break;
      case 'related':
        referer = `https://www.bilibili.com/video/`; // 相关推荐（从其他视频页面）
        break;
      case 'short':
        referer = 'https://www.bilibili.com/'; // 短视频也从首页来
        break;
    }
    
    const response = await fetch(`https://www.bilibili.com/video/${bvid}`, {
      method: 'GET',
      headers: {
        'Cookie': this.cookies,
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': referer,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const html = await response.text();
    logger.debug(`📄 访问B站视频页面成功: ${bvid} (来源: ${source})`);
    
    return { html };
  }

  /**
   * 2. 获取视频详细信息
   */
  private async getVideoInfo(bvid: string, source: 'home' | 'search' | 'related' | 'short' = 'home'): Promise<any> {
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Cookie': this.cookies,
        'User-Agent': this.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Referer': `https://www.bilibili.com/video/${bvid}`, // 这里始终是视频页面
      }
    });

    const data = await response.json();
    
    if (data.code === 0) {
      const videoInfo = {
        aid: data.data.aid,
        bvid: data.data.bvid,
        cid: data.data.pages[0].cid, // 第一个分P的cid
        duration: data.data.duration,
        title: data.data.title,
        source: source // 记录来源
      };
      
      logger.debug(`📺 获取视频信息成功: aid=${videoInfo.aid}, cid=${videoInfo.cid}`);
      return videoInfo;
    } else {
      throw new Error(`获取视频信息失败: ${data.message}`);
    }
  }

  /**
   * 3. 模拟播放心跳上报 - 根据速度调整心跳间隔
   */
  private async simulatePlaybackHeartbeat(videoInfo: any, simulatedDuration: number, actualWaitTime: number, source: string): Promise<void> {
    // 根据速度调整心跳间隔，保持合理范围
    // 速度越快，心跳间隔越小，但不低于5秒
    const baseHeartbeatInterval = Math.max(5, Math.floor(15 / this.playbackSpeed)); // 5-15秒间隔
    const totalSteps = Math.floor(simulatedDuration / baseHeartbeatInterval);
    const stepWaitTime = actualWaitTime / Math.max(1, totalSteps); // 每步实际等待时间
    
    logger.debug(`📊 B站播放进度模拟: ${totalSteps}步，每步等待${stepWaitTime.toFixed(1)}秒`);
    
    for (let i = 1; i <= totalSteps; i++) {
      // 添加随机性 - 心跳时间随机偏移 (±2秒)
      const randomOffset = (Math.random() - 0.5) * 4;
      const currentTime = i * baseHeartbeatInterval + randomOffset;
      const playedTime = Math.max(0, currentTime);
      
      await this.sendHeartbeat(videoInfo, playedTime);
      
      // 随机化等待时间 (±30%变化)
      const randomizedWaitTime = stepWaitTime * (0.7 + Math.random() * 0.6);
      await this.sleep(randomizedWaitTime * 1000);
      
      // 偶尔模拟暂停行为 (8%概率)
      if (Math.random() < 0.08) {
        logger.debug(`⏸️  B站模拟暂停: ${playedTime.toFixed(1)}秒`);
        const pauseDuration = 1 + Math.random() * 4; // 1-5秒暂停
        await this.sleep(pauseDuration * 1000);
        
        // 模拟暂停后恢复播放的心跳
        await this.sendHeartbeat(videoInfo, playedTime);
      }
      
      // 偶尔模拟拖拽进度条 (3%概率)
      if (Math.random() < 0.03 && i > 2) {
        const seekTime = Math.random() * currentTime;
        logger.debug(`🔄 B站模拟拖拽: 从${playedTime.toFixed(1)}秒到${seekTime.toFixed(1)}秒`);
        await this.sendHeartbeat(videoInfo, seekTime);
        await this.sleep(500 + Math.random() * 1500); // 拖拽后短暂停顿
      }
      
      logger.debug(`💓 B站心跳 ${i}/${totalSteps}: ${playedTime.toFixed(1)}秒`);
    }
    
    // 发送最终心跳
    if (simulatedDuration % baseHeartbeatInterval > 0) {
      const randomOffset = (Math.random() - 0.5) * 2;
      const finalTime = Math.max(0, simulatedDuration + randomOffset);
      await this.sendHeartbeat(videoInfo, finalTime);
    }
  }

  /**
   * 发送播放心跳到B站 - 增强安全版本
   */
  private async sendHeartbeat(videoInfo: any, playedTime: number): Promise<void> {
    const heartbeatUrl = 'https://api.bilibili.com/x/click-interface/web/heartbeat';
    
    // 添加随机性到真实播放时间 (85%-95%的播放时间)
    const realPlayedRatio = 0.85 + Math.random() * 0.1;
    const realPlayedTime = Math.floor(playedTime * realPlayedRatio);
    
    // 随机选择视频质量 (模拟用户的不同网络环境)
    const qualities = ['32', '64', '80', '112'];
    const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];
    
    const formData = new URLSearchParams({
      aid: videoInfo.aid.toString(),
      cid: videoInfo.cid.toString(), 
      bvid: videoInfo.bvid,
      mid: this.userMid, // 从cookie中提取的真实用户mid
      csrf: this.csrfToken,
      played_time: Math.floor(playedTime).toString(),
      real_played_time: realPlayedTime.toString(),
      refer_url: `https://www.bilibili.com/video/${videoInfo.bvid}`,
      quality: randomQuality,
      video_duration: videoInfo.duration.toString(),
      last_play_progress_time: Math.floor(playedTime).toString(),
      max_play_progress_time: Math.floor(playedTime).toString(),
      extra: JSON.stringify({
        player_version: '4.8.10', // 保持稳定的播放器版本
        danmaku_switch: Math.random() < 0.7 ? 1 : 0, // 70%概率开启弹幕
        subtitle_switch: Math.random() < 0.2 ? 1 : 0  // 20%概率开启字幕
      })
    });

    try {
      const response = await fetch(heartbeatUrl, {
        method: 'POST',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': this.userAgent, // 使用用户设置的UA，保持一致性
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}`, // 心跳Referer始终是视频页面
          'Origin': 'https://www.bilibili.com',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        body: formData.toString()
      });

      const result = await response.json();
      if (result.code !== 0) {
        logger.debug(`B站心跳响应: ${result.message}`);
      }
    } catch (error) {
      logger.debug('B站心跳发送失败:', error.message);
    }
  }

  /**
   * 4. 上报播放历史记录
   */
  private async reportPlayHistory(videoInfo: any, duration: number, source: string): Promise<void> {
    const historyUrl = 'https://api.bilibili.com/x/v2/history/report';
    
    const formData = new URLSearchParams({
      aid: videoInfo.aid.toString(),
      cid: videoInfo.cid.toString(),
      progress: duration.toString(), // 播放进度(秒)
      csrf: this.csrfToken,
      platform: 'web',
      real_time: duration.toString(),
      dt: '2', // desktop type
      play_type: '1' // 播放类型
    });

    try {
      const response = await fetch(historyUrl, {
        method: 'POST',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}`, // 历史上报Referer也是视频页面
          'Origin': 'https://www.bilibili.com'
        },
        body: formData.toString()
      });

      const result = await response.json();
      if (result.code === 0) {
        logger.debug(`📊 B站历史记录上报成功: ${duration}秒`);
      } else {
        logger.debug(`历史记录上报响应: ${result.message}`);
      }
    } catch (error) {
      logger.debug('B站历史记录上报失败:', error.message);
    }
  }

  /**
   * 从Cookie中提取CSRF Token
   */
  private extractCsrfToken(): void {
    try {
      const match = this.cookies.match(/bili_jct=([^;]+)/);
      if (match) {
        this.csrfToken = match[1];
        logger.debug(`🔑 提取CSRF Token成功: ${this.csrfToken.substring(0, 8)}...`);
      } else {
        logger.warn('⚠️  未找到CSRF Token，可能影响部分功能');
      }
    } catch (error) {
      logger.debug('提取CSRF Token失败:', error);
    }
  }

  /**
   * 从Cookie中提取用户MID
   */
  private extractUserMid(): void {
    try {
      const match = this.cookies.match(/DedeUserID=([^;]+)/);
      if (match) {
        this.userMid = match[1];
        logger.debug(`👤 提取用户MID成功: ${this.userMid}`);
      } else {
        logger.debug('⚠️  未找到用户MID，使用默认值0');
        this.userMid = '0';
      }
    } catch (error) {
      logger.debug('提取用户MID失败:', error);
      this.userMid = '0';
    }
  }

  /**
   * 工具方法：延时
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
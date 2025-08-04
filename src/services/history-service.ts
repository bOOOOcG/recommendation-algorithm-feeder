import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { VideoInfo } from '../types/index.js';
import { logger } from '../core/logger.js';

/**
 * 观看历史记录的详细信息
 */
export interface WatchHistory {
  timestamp: string; // ISO时间戳
  video: VideoInfo;
  playDuration: number; // 实际播放时长（毫秒）
  matchedKeywords: string[]; // 匹配的关键词
  source: 'home' | 'related' | 'short' | 'search'; // 视频来源，添加 search
  sessionId: string; // 会话ID，用于追踪
  platform: string; // 平台标识（bilibili, youtube等）
  // 模拟播放相关数据
  isSimulated?: boolean; // 是否为模拟播放
  simulatedWatchDuration?: number; // 模拟观看时长（秒）
  actualWaitTime?: number; // 实际等待时间（毫秒）
  playbackSpeed?: number; // 播放速度倍率
}

/**
 * 观看历史统计信息
 */
export interface HistoryStats {
  totalVideos: number;
  totalPlayTime: number; // 总播放时长（毫秒）
  keywordStats: Record<string, number>; // 每个关键词的匹配次数
  sourceStats: Record<string, number>; // 各来源的视频数量
  dailyStats: Record<string, number>; // 每日观看数量
  topAuthors: Record<string, number>; // 最常看的UP主
  platformStats: Record<string, number>; // 各平台的视频数量
  // 模拟播放统计
  simulatedStats?: {
    totalSimulatedVideos: number; // 模拟播放视频总数
    totalSimulatedWatchTime: number; // 模拟观看总时长（秒）
    totalActualWaitTime: number; // 实际等待总时长（毫秒）
    averagePlaybackSpeed: number; // 平均播放速度
    efficiencyRatio: number; // 效率比（模拟时长/实际时长）
    timeSaved: number; // 节省的时间（毫秒）
  };
}

/**
 * 观看历史管理服务
 */
export class HistoryService {
  private readonly historyDir = 'history';
  private readonly historyFile = 'watch-history.jsonl'; // 使用JSONL格式，每行一个记录
  private readonly statsFile = 'watch-stats.json';
  private readonly platform: string;

  constructor(platform: string = 'bilibili') {
    this.platform = platform;
    this.ensureDirectoryExists();
  }

  /**
   * 确保历史记录目录存在
   */
  private ensureDirectoryExists() {
    if (!existsSync(this.historyDir)) {
      mkdirSync(this.historyDir, { recursive: true });
      logger.info('创建观看历史目录: history/');
    }
  }

  /**
   * 记录观看历史
   */
  recordWatch(
    video: VideoInfo, 
    playDuration: number, 
    matchedKeywords: string[], 
    source: 'home' | 'related' | 'short' | 'search',
    sessionId: string = 'default',
    simulatedData?: {
      isSimulated: boolean;
      simulatedWatchDuration?: number;
      actualWaitTime?: number;
      playbackSpeed?: number;
    }
  ): void {
    try {
      const watchRecord: WatchHistory = {
        timestamp: new Date().toISOString(),
        video,
        playDuration,
        matchedKeywords,
        source,
        sessionId,
        platform: this.platform,
        // 模拟播放数据
        isSimulated: simulatedData?.isSimulated || false,
        simulatedWatchDuration: simulatedData?.simulatedWatchDuration,
        actualWaitTime: simulatedData?.actualWaitTime,
        playbackSpeed: simulatedData?.playbackSpeed
      };

      // 追加到JSONL文件
      const historyPath = join(this.historyDir, this.historyFile);
      const recordLine = JSON.stringify(watchRecord) + '\n';
      appendFileSync(historyPath, recordLine, 'utf-8');

      // 更新统计信息
      this.updateStats(watchRecord);

      logger.info(`📝 已记录观看历史: ${video.title}`);
      logger.info(`   ↳ 平台: ${this.platform}, 关键词: ${matchedKeywords.join(', ')}`);
      
      if (simulatedData?.isSimulated) {
        const efficiency = simulatedData.simulatedWatchDuration && simulatedData.actualWaitTime 
          ? (simulatedData.simulatedWatchDuration * 1000 / simulatedData.actualWaitTime).toFixed(1)
          : 'N/A';
        logger.info(`   ↳ 模拟播放: ${simulatedData.simulatedWatchDuration}秒观看用时${(playDuration / 1000).toFixed(1)}秒 (${simulatedData.playbackSpeed}x速度, 效率${efficiency}x)`);
      } else {
        logger.info(`   ↳ 来源: ${source}, 播放时长: ${(playDuration / 1000).toFixed(1)}秒`);
      }

    } catch (error) {
      logger.error('记录观看历史失败:', error);
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(record: WatchHistory): void {
    try {
      const stats = this.getStats();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // 确保所有统计对象都存在
      if (!stats.keywordStats) stats.keywordStats = {};
      if (!stats.sourceStats) stats.sourceStats = {};
      if (!stats.dailyStats) stats.dailyStats = {};
      if (!stats.topAuthors) stats.topAuthors = {};
      if (!stats.platformStats) stats.platformStats = {};

      // 更新基本统计
      stats.totalVideos = (stats.totalVideos || 0) + 1;
      stats.totalPlayTime = (stats.totalPlayTime || 0) + record.playDuration;

      // 更新关键词统计
      if (Array.isArray(record.matchedKeywords)) {
        record.matchedKeywords.forEach(keyword => {
          if (keyword && typeof keyword === 'string') {
            stats.keywordStats[keyword] = (stats.keywordStats[keyword] || 0) + 1;
          }
        });
      }

      // 更新来源统计
      if (record.source) {
        stats.sourceStats[record.source] = (stats.sourceStats[record.source] || 0) + 1;
      }

      // 更新每日统计
      if (today) {
        stats.dailyStats[today] = (stats.dailyStats[today] || 0) + 1;
      }

      // 更新UP主统计
      if (record.video && record.video.author) {
        stats.topAuthors[record.video.author] = (stats.topAuthors[record.video.author] || 0) + 1;
      }

      // 更新平台统计
      if (record.platform) {
        stats.platformStats[record.platform] = (stats.platformStats[record.platform] || 0) + 1;
      }

      // 更新模拟播放统计
      if (record.isSimulated) {
        if (!stats.simulatedStats) {
          stats.simulatedStats = {
            totalSimulatedVideos: 0,
            totalSimulatedWatchTime: 0,
            totalActualWaitTime: 0,
            averagePlaybackSpeed: 0,
            efficiencyRatio: 0,
            timeSaved: 0
          };
        }

        stats.simulatedStats.totalSimulatedVideos++;
        
        if (record.simulatedWatchDuration) {
          stats.simulatedStats.totalSimulatedWatchTime += record.simulatedWatchDuration;
        }
        
        if (record.actualWaitTime) {
          stats.simulatedStats.totalActualWaitTime += record.actualWaitTime;
        }

        // 重新计算平均播放速度和效率比
        if (stats.simulatedStats.totalActualWaitTime > 0) {
          stats.simulatedStats.efficiencyRatio = (stats.simulatedStats.totalSimulatedWatchTime * 1000) / stats.simulatedStats.totalActualWaitTime;
          stats.simulatedStats.averagePlaybackSpeed = stats.simulatedStats.efficiencyRatio;
          
          // 计算节省的时间（如果按正常速度播放需要的时间 - 实际等待时间）
          const normalPlayTime = stats.simulatedStats.totalSimulatedWatchTime * 1000;
          stats.simulatedStats.timeSaved = normalPlayTime - stats.simulatedStats.totalActualWaitTime;
        }
      }

      // 保存统计信息
      const statsPath = join(this.historyDir, this.statsFile);
      writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');

    } catch (error) {
      logger.error('更新统计信息失败:', error);
      logger.debug('错误详情:', {
        record: record,
        platform: record?.platform,
        error: error.message
      });
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): HistoryStats {
    const defaultStats: HistoryStats = {
      totalVideos: 0,
      totalPlayTime: 0,
      keywordStats: {},
      sourceStats: {},
      dailyStats: {},
      topAuthors: {},
      platformStats: {}
    };

    try {
      const statsPath = join(this.historyDir, this.statsFile);
      if (existsSync(statsPath)) {
        const statsContent = readFileSync(statsPath, 'utf-8');
        const parsedStats = JSON.parse(statsContent);
        
        // 确保所有必要属性都存在，合并默认值
        return {
          totalVideos: parsedStats.totalVideos || 0,
          totalPlayTime: parsedStats.totalPlayTime || 0,
          keywordStats: parsedStats.keywordStats || {},
          sourceStats: parsedStats.sourceStats || {},
          dailyStats: parsedStats.dailyStats || {},
          topAuthors: parsedStats.topAuthors || {},
          platformStats: parsedStats.platformStats || {},
          simulatedStats: parsedStats.simulatedStats
        };
      }
    } catch (error) {
      logger.debug('读取统计信息失败，返回默认值:', error);
    }

    // 返回默认统计信息
    return defaultStats;
  }

  /**
   * 获取观看历史记录（最近N条）
   */
  getRecentHistory(limit: number = 50): WatchHistory[] {
    try {
      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return [];
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // 获取最后N行并解析
      const recentLines = lines.slice(-limit);
      return recentLines.map(line => JSON.parse(line)).reverse(); // 最新的在前

    } catch (error) {
      logger.error('读取观看历史失败:', error);
      return [];
    }
  }

  /**
   * 搜索观看历史
   */
  searchHistory(query: string): WatchHistory[] {
    try {
      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return [];
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const searchResults: WatchHistory[] = [];
      const queryLower = query.toLowerCase();

      for (const line of lines) {
        try {
          const record: WatchHistory = JSON.parse(line);
          
          // 搜索标题、作者、关键词
          const searchText = [
            record.video.title,
            record.video.author,
            ...record.matchedKeywords
          ].join(' ').toLowerCase();

          if (searchText.includes(queryLower)) {
            searchResults.push(record);
          }
        } catch (parseError) {
          // 跳过损坏的记录
          continue;
        }
      }

      return searchResults.reverse(); // 最新的在前

    } catch (error) {
      logger.error('搜索观看历史失败:', error);
      return [];
    }
  }

  /**
   * 检查视频是否已经看过
   */
  hasWatched(videoId: string): boolean {
    try {
      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return false;
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const record: WatchHistory = JSON.parse(line);
          if (record.video.id === videoId) {
            return true;
          }
        } catch (parseError) {
          continue;
        }
      }

      return false;
    } catch (error) {
      logger.error('检查观看历史失败:', error);
      return false;
    }
  }

  /**
   * 生成统计报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const report = [];

    report.push('📊 观看历史统计报告');
    report.push('='.repeat(40));
    report.push(`总观看视频数: ${stats.totalVideos}`);
    report.push(`总播放时长: ${(stats.totalPlayTime / 1000 / 60).toFixed(1)} 分钟`);
    
    // 模拟播放统计
    if (stats.simulatedStats && stats.simulatedStats.totalSimulatedVideos > 0) {
      report.push('');
      report.push('🎭 模拟播放效率统计:');
      report.push(`  模拟播放视频数: ${stats.simulatedStats.totalSimulatedVideos}`);
      report.push(`  模拟观看总时长: ${(stats.simulatedStats.totalSimulatedWatchTime / 60).toFixed(1)} 分钟`);
      report.push(`  实际消耗时间: ${(stats.simulatedStats.totalActualWaitTime / 1000 / 60).toFixed(1)} 分钟`);
      report.push(`  平均播放速度: ${stats.simulatedStats.averagePlaybackSpeed.toFixed(1)}x`);
      report.push(`  效率比: ${stats.simulatedStats.efficiencyRatio.toFixed(1)}x (模拟时长/实际时长)`);
      report.push(`  节省时间: ${(stats.simulatedStats.timeSaved / 1000 / 60).toFixed(1)} 分钟`);
      
      const normalVideos = stats.totalVideos - stats.simulatedStats.totalSimulatedVideos;
      if (normalVideos > 0) {
        report.push(`  传统播放视频数: ${normalVideos}`);
      }
    }
    
    report.push('');

    // 关键词统计
    if (Object.keys(stats.keywordStats).length > 0) {
      report.push('🎯 关键词匹配统计:');
      const sortedKeywords = Object.entries(stats.keywordStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      sortedKeywords.forEach(([keyword, count]) => {
        report.push(`  ${keyword}: ${count} 次`);
      });
      report.push('');
    }

    // 来源统计
    if (Object.keys(stats.sourceStats).length > 0) {
      report.push('📺 视频来源统计:');
      Object.entries(stats.sourceStats).forEach(([source, count]) => {
        report.push(`  ${source}: ${count} 个视频`);
      });
      report.push('');
    }

    // TOP UP主
    if (Object.keys(stats.topAuthors).length > 0) {
      report.push('👤 热门UP主 (TOP 10):');
      const sortedAuthors = Object.entries(stats.topAuthors)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      sortedAuthors.forEach(([author, count]) => {
        report.push(`  ${author}: ${count} 个视频`);
      });
      report.push('');
    }

    // 平台统计
    if (Object.keys(stats.platformStats).length > 0) {
      report.push('🎥 平台统计:');
      Object.entries(stats.platformStats).forEach(([platform, count]) => {
        report.push(`  ${platform}: ${count} 个视频`);
      });
      report.push('');
    }

    // 最近7天统计
    const recentDays = Object.entries(stats.dailyStats)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7);
    
    if (recentDays.length > 0) {
      report.push('📅 最近7天观看统计:');
      recentDays.forEach(([date, count]) => {
        report.push(`  ${date}: ${count} 个视频`);
      });
    }

    return report.join('\n');
  }

  /**
   * 生成当前会话统计报告
   */
  generateSessionReport(sessionId: string): string {
    try {
      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return '📊 本次会话统计报告\n='.repeat(40) + '\n本次会话暂无观看记录';
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // 筛选当前会话的记录
      const sessionRecords: WatchHistory[] = [];
      for (const line of lines) {
        try {
          const record: WatchHistory = JSON.parse(line);
          if (record.sessionId === sessionId) {
            sessionRecords.push(record);
          }
        } catch (parseError) {
          continue;
        }
      }

      if (sessionRecords.length === 0) {
        return '📊 本次会话统计报告\n='.repeat(40) + '\n本次会话暂无观看记录';
      }

      // 计算会话统计
      const sessionStats = {
        totalVideos: sessionRecords.length,
        totalPlayTime: sessionRecords.reduce((sum, record) => sum + record.playDuration, 0),
        keywordStats: {} as Record<string, number>,
        sourceStats: {} as Record<string, number>,
        topAuthors: {} as Record<string, number>,
        platformStats: {} as Record<string, number>,
        // 模拟播放统计
        simulatedVideos: sessionRecords.filter(r => r.isSimulated).length,
        totalSimulatedWatchTime: 0,
        totalActualWaitTime: 0,
        averagePlaybackSpeed: 0
      };

      // 统计关键词
      sessionRecords.forEach(record => {
        record.matchedKeywords.forEach(keyword => {
          sessionStats.keywordStats[keyword] = (sessionStats.keywordStats[keyword] || 0) + 1;
        });
        
        // 统计来源
        sessionStats.sourceStats[record.source] = (sessionStats.sourceStats[record.source] || 0) + 1;
        
        // 统计UP主
        if (record.video.author) {
          sessionStats.topAuthors[record.video.author] = (sessionStats.topAuthors[record.video.author] || 0) + 1;
        }
        
        // 统计平台
        sessionStats.platformStats[record.platform] = (sessionStats.platformStats[record.platform] || 0) + 1;
        
        // 统计模拟播放数据
        if (record.isSimulated) {
          sessionStats.totalSimulatedWatchTime += record.simulatedWatchDuration || 0;
          sessionStats.totalActualWaitTime += record.playDuration;
        }
      });
      
      // 计算平均播放速度
      if (sessionStats.simulatedVideos > 0 && sessionStats.totalActualWaitTime > 0) {
        sessionStats.averagePlaybackSpeed = sessionStats.totalSimulatedWatchTime / (sessionStats.totalActualWaitTime / 1000);
      }

      // 生成报告
      const report = [];
      report.push('📊 本次会话统计报告');
      report.push('='.repeat(40));
      report.push(`本次观看视频数: ${sessionStats.totalVideos}`);
      
      // 区分模拟播放和普通播放
      if (sessionStats.simulatedVideos > 0) {
        report.push(`📺 模拟播放视频: ${sessionStats.simulatedVideos} 个`);
        report.push(`⏱️  模拟观看时长: ${(sessionStats.totalSimulatedWatchTime / 60).toFixed(1)} 分钟`);
        report.push(`⚡ 实际运行时间: ${(sessionStats.totalActualWaitTime / 1000 / 60).toFixed(1)} 分钟`);
        report.push(`🚀 平均播放速度: ${sessionStats.averagePlaybackSpeed.toFixed(1)}x`);
        
        // 计算效率
        const efficiency = sessionStats.totalSimulatedWatchTime / (sessionStats.totalActualWaitTime / 1000 / 60);
        report.push(`💡 播放效率提升: ${efficiency.toFixed(1)}x`);
        
        if (sessionStats.totalVideos > sessionStats.simulatedVideos) {
          const normalVideos = sessionStats.totalVideos - sessionStats.simulatedVideos;
          const normalTime = (sessionStats.totalPlayTime - sessionStats.totalActualWaitTime) / 1000 / 60;
          report.push(`🎬 普通播放视频: ${normalVideos} 个 (${normalTime.toFixed(1)} 分钟)`);
        }
      } else {
        report.push(`本次播放时长: ${(sessionStats.totalPlayTime / 1000 / 60).toFixed(1)} 分钟`);
      }
      report.push('');

      // 关键词统计
      if (Object.keys(sessionStats.keywordStats).length > 0) {
        report.push('🎯 本次关键词匹配统计:');
        const sortedKeywords = Object.entries(sessionStats.keywordStats)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10);
        sortedKeywords.forEach(([keyword, count]) => {
          report.push(`  ${keyword}: ${count} 次`);
        });
        report.push('');
      }

      // 来源统计
      if (Object.keys(sessionStats.sourceStats).length > 0) {
        report.push('📺 本次视频来源统计:');
        Object.entries(sessionStats.sourceStats).forEach(([source, count]) => {
          report.push(`  ${source}: ${count} 个视频`);
        });
        report.push('');
      }

      // UP主统计
      if (Object.keys(sessionStats.topAuthors).length > 0) {
        report.push('👤 本次热门UP主:');
        const sortedAuthors = Object.entries(sessionStats.topAuthors)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);
        sortedAuthors.forEach(([author, count]) => {
          report.push(`  ${author}: ${count} 个视频`);
        });
        report.push('');
      }

      // 平台统计
      if (Object.keys(sessionStats.platformStats).length > 0) {
        report.push('🎥 本次平台统计:');
        Object.entries(sessionStats.platformStats).forEach(([platform, count]) => {
          report.push(`  ${platform}: ${count} 个视频`);
        });
      }

      return report.join('\n');

    } catch (error) {
      logger.error('生成会话报告失败:', error);
      return '📊 本次会话统计报告\n='.repeat(40) + '\n报告生成失败';
    }
  }

  /**
   * 获取当前会话的统计数据（用于实时统计）
   */
  getSessionStats(sessionId: string): any {
    try {
      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return null;
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // 筛选当前会话的记录
      const sessionRecords: WatchHistory[] = [];
      for (const line of lines) {
        try {
          const record: WatchHistory = JSON.parse(line);
          if (record.sessionId === sessionId) {
            sessionRecords.push(record);
          }
        } catch (parseError) {
          continue;
        }
      }

      if (sessionRecords.length === 0) {
        return null;
      }

      // 计算会话统计（复用 generateSessionReport 中的逻辑）
      const sessionStats = {
        totalVideos: sessionRecords.length,
        totalPlayTime: sessionRecords.reduce((sum, record) => sum + record.playDuration, 0),
        simulatedVideos: sessionRecords.filter(r => r.isSimulated).length,
        totalSimulatedWatchTime: 0,
        totalActualWaitTime: 0,
        averagePlaybackSpeed: 0
      };

      // 统计模拟播放数据
      sessionRecords.forEach(record => {
        if (record.isSimulated) {
          sessionStats.totalSimulatedWatchTime += record.simulatedWatchDuration || 0;
          sessionStats.totalActualWaitTime += record.playDuration;
        }
      });
      
      // 计算平均播放速度
      if (sessionStats.simulatedVideos > 0 && sessionStats.totalActualWaitTime > 0) {
        sessionStats.averagePlaybackSpeed = sessionStats.totalSimulatedWatchTime / (sessionStats.totalActualWaitTime / 1000);
      }

      return {
        simulatedStats: {
          totalSimulatedVideos: sessionStats.simulatedVideos,
          totalSimulatedWatchTime: sessionStats.totalSimulatedWatchTime,
          totalActualWaitTime: sessionStats.totalActualWaitTime,
          averagePlaybackSpeed: sessionStats.averagePlaybackSpeed,
          efficiencyRatio: sessionStats.averagePlaybackSpeed,
          timeSaved: sessionStats.totalSimulatedWatchTime * 60 * 1000 - sessionStats.totalActualWaitTime
        }
      };

    } catch (error) {
      logger.error('获取会话统计失败:', error);
      return null;
    }
  }

  /**
   * 清理旧的历史记录（保留最近N天）
   */
  cleanupOldHistory(daysToKeep: number = 30): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const historyPath = join(this.historyDir, this.historyFile);
      if (!existsSync(historyPath)) {
        return;
      }

      const content = readFileSync(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const validLines: string[] = [];
      let cleanedCount = 0;

      for (const line of lines) {
        try {
          const record: WatchHistory = JSON.parse(line);
          const recordDate = new Date(record.timestamp);
          
          if (recordDate >= cutoffDate) {
            validLines.push(line);
          } else {
            cleanedCount++;
          }
        } catch (parseError) {
          // 保留无法解析的行（避免数据丢失）
          validLines.push(line);
        }
      }

      if (cleanedCount > 0) {
        writeFileSync(historyPath, validLines.join('\n') + '\n', 'utf-8');
        logger.info(`🧹 清理了 ${cleanedCount} 条过期历史记录（保留${daysToKeep}天）`);
      }

    } catch (error) {
      logger.error('清理历史记录失败:', error);
    }
  }
}
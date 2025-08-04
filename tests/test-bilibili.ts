import { BilibiliAPI } from './platforms/bilibili/bilibili-api.js';
import { CookieLoader } from './utils/cookie-loader.js';
import { logger } from './core/logger.js';
import { config } from 'dotenv';

// 加载环境变量
config();

/**
 * B站平台测试脚本
 */
async function testBilibiliAPI() {
  try {
    logger.info('开始测试B站API...');
    
    // 加载Cookie（优先使用COOKIE_FILE，然后尝试bilibili.txt）
    logger.info(`COOKIE_FILE环境变量: ${process.env.COOKIE_FILE}`);
    
    let cookies: string;
    try {
      cookies = CookieLoader.loadCookie('bilibili');
      logger.info('成功加载B站Cookie');
    } catch (error) {
      logger.warn('未找到B站Cookie，部分功能可能受限');
      logger.warn('错误详情:', error.message);
      cookies = '';
    }

    // 创建B站API客户端
    const platformConfig = {
      name: 'bilibili',
      baseUrl: 'https://www.bilibili.com',
      cookies: cookies,
      headers: {
        'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    };

    const api = new BilibiliAPI(platformConfig, 5, 30000);

    // 测试API连接
    logger.info('\n测试API连接状态...');
    const isConnected = await api.checkConnection();
    logger.info(`API连接状态: ${isConnected ? '正常' : '异常'}`);

    // 测试首页推荐
    logger.info('\n测试获取首页推荐视频...');
    const homeFeed = await api.getHomeFeedRecommendations();
    
    if (homeFeed.length > 0) {
      logger.info(`成功获取 ${homeFeed.length} 个首页推荐视频:`);
      homeFeed.forEach((video, index) => {
        const durationStr = formatDuration(video.duration);
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
        logger.info(`   URL: ${video.url}`);
        if (video.tags && video.tags.length > 0) {
          logger.info(`   标签: ${video.tags.join(', ')}`);
        }
      });
    } else {
      logger.warn('未获取到首页推荐视频');
    }

    // 测试相关视频推荐（如果有推荐视频的话）
    if (homeFeed.length > 0) {
      logger.info('\n测试获取相关视频推荐...');
      const firstVideo = homeFeed[0];
      const relatedVideos = await api.getRelatedVideos(firstVideo.id);
      
      if (relatedVideos.length > 0) {
        logger.info(`成功获取 ${relatedVideos.length} 个相关视频:`);
        relatedVideos.slice(0, 3).forEach((video, index) => {
          const durationStr = formatDuration(video.duration);
          logger.info(`${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
          logger.info(`   URL: ${video.url}`);
        });
      } else {
        logger.warn('未获取到相关视频');
      }
    }

    // 测试短视频推荐
    logger.info('\n测试获取短视频推荐...');
    const shortVideos = await api.getShortVideoFeed();
    
    if (shortVideos.length > 0) {
      logger.info(`成功获取 ${shortVideos.length} 个短视频推荐:`);
      shortVideos.slice(0, 3).forEach((video, index) => {
        const durationStr = formatDuration(video.duration);
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
        logger.info(`   URL: ${video.url}`);
      });
    } else {
      logger.warn('未获取到短视频推荐');
    }

    // 测试视频搜索
    logger.info('\n测试视频搜索功能...');
    const searchKeyword = 'mujica';
    const searchResults = await api.searchVideos(searchKeyword, { page: 1 });
    
    if (searchResults.length > 0) {
      logger.info(`成功搜索到 ${searchResults.length} 个相关视频:`);
      searchResults.forEach((video, index) => {
        const durationStr = formatDuration(video.duration);
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
        logger.info(`   URL: ${video.url}`);
        logger.info(`   播放量: ${video.viewCount || 0}`);
        if (video.tags && video.tags.length > 0) {
          logger.info(`   标签: ${video.tags.slice(0, 3).join(', ')}`);
        }
      });
    } else {
      logger.warn(`未搜索到关键词 "${searchKeyword}" 的相关视频`);
    }

    // 测试综合搜索
    logger.info('\n测试综合搜索功能...');
    const comprehensiveResult = await api.searchAll(searchKeyword);
    
    if (comprehensiveResult.videos.length > 0) {
      logger.info(`综合搜索结果: ${comprehensiveResult.totalResults} 总条数，返回 ${comprehensiveResult.videos.length} 个视频:`);
      comprehensiveResult.videos.slice(0, 3).forEach((video, index) => {
        const durationStr = formatDuration(video.duration);
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
        logger.info(`   URL: ${video.url}`);
        logger.info(`   播放量: ${video.viewCount || 0}`);
      });
      logger.info(`搜索ID: ${comprehensiveResult.seid}`);
    } else {
      logger.warn(`综合搜索未找到关键词 "${searchKeyword}" 的相关内容`);
    }

    // 测试不同搜索排序
    logger.info('\n测试不同搜索排序方式...');
    const sortOrders = [
      { order: 'totalrank', name: '综合排序' },
      { order: 'click', name: '最多点击' },
      { order: 'pubdate', name: '最新发布' },
      { order: 'dm', name: '最多弹幕' }
    ];

    for (const sortOrder of sortOrders) {
      const sortedResults = await api.searchVideos('MyGO', { 
        order: sortOrder.order, 
        page: 1 
      });
      
      if (sortedResults.length > 0) {
        const firstVideo = sortedResults[0];
        const durationStr = formatDuration(firstVideo.duration);
        logger.info(`${sortOrder.name}: ${firstVideo.title} - ${firstVideo.author} (${durationStr})`);
      }
    }
    
  } catch (error) {
    logger.error('B站API测试失败:', error);
  }
}

/**
 * 格式化时长
 */
function formatDuration(duration: number | undefined): string {
  if (!duration) return '未知';
  
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 运行测试
testBilibiliAPI().then(() => {
  logger.info('\nB站API测试完成');
  process.exit(0);
}).catch((error) => {
  logger.error('测试运行失败:', error);
  process.exit(1);
});
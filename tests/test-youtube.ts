import { YouTubeAPI } from './platforms/youtube/youtube-api.js';
import { logger } from './core/logger.js';

/**
 * YouTube平台测试脚本
 */
async function testYouTubeAPI() {
  try {
    logger.info('开始测试YouTube API...');
    
    // 临时启用代理进行测试
    process.env.USE_PROXY = 'true';
    process.env.HTTP_PROXY = 'http://127.0.0.1:10809';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10809';
    
    // 创建YouTube API客户端（无需Cookie即可测试基本功能）
    const api = new YouTubeAPI('', 30000);
    
    logger.info('测试获取推荐视频...');
    const recommendations = await api.getHomeFeedRecommendations(5);
    
    if (recommendations.length > 0) {
      logger.info(`成功获取 ${recommendations.length} 个推荐视频:`);
      recommendations.forEach((video, index) => {
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${video.duration})`);
        logger.info(`   URL: ${video.url}`);
      });
    } else {
      logger.warn('未获取到推荐视频');
    }
    
    logger.info('\n测试搜索功能...');
    const searchResults = await api.searchVideos('programming tutorial', 3);
    
    if (searchResults.length > 0) {
      logger.info(`成功搜索到 ${searchResults.length} 个视频:`);
      searchResults.forEach((video, index) => {
        logger.info(`${index + 1}. ${video.title} - ${video.author} (${video.duration})`);
        logger.info(`   URL: ${video.url}`);
      });
    } else {
      logger.warn('搜索未返回结果');
    }
    
  } catch (error) {
    logger.error('YouTube API测试失败:', error);
  }
}

// 运行测试
testYouTubeAPI().then(() => {
  logger.info('YouTube API测试完成');
  process.exit(0);
}).catch((error) => {
  logger.error('测试运行失败:', error);
  process.exit(1);
});
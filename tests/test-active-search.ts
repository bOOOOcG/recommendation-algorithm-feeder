import { BilibiliAPI } from './platforms/bilibili/bilibili-api.js';
import { BilibiliPlatform } from './platforms/bilibili/bilibili-platform.js';
import { KeywordMatcher } from './matchers/keyword-matcher.js';
import { ConfigManager } from './config/config.js';
import { logger } from './core/logger.js';
import { config } from 'dotenv';

// 加载环境变量
config();

/**
 * 主动搜索功能测试脚本
 */
async function testActiveSearch() {
  logger.info('='.repeat(60));
  logger.info('🔍 测试主动搜索功能');
  logger.info('='.repeat(60));

  try {
    // 获取配置
    const configManager = ConfigManager.getInstance();
    const appConfig = configManager.getConfig();
    
    logger.info('📋 主动搜索配置:');
    logger.info(`  启用状态: ${appConfig.enableActiveSearch ? '启用' : '禁用'}`);
    logger.info(`  触发阈值: ${appConfig.activeSearchThreshold || 10} 轮`);
    logger.info(`  搜索策略: ${appConfig.activeSearchStrategy || 'random'}`);
    logger.info(`  目标关键词: ${appConfig.matcher.keywords.join(', ')}`);
    
    // 创建平台实例
    const platform = new BilibiliPlatform(
      appConfig.platform,
      true, // headless
      5,    // videosPerPage
      30000 // timeout
    );
    
    await platform.initialize();
    logger.info('✅ 平台初始化完成');
    
    // 测试搜索功能
    if (platform.searchVideos) {
      logger.info('\n🔍 测试平台搜索功能...');
      
      for (const keyword of appConfig.matcher.keywords) {
        try {
          logger.info(`\n🔎 搜索关键词: "${keyword}"`);
          
          const searchResults = await platform.searchVideos(keyword, 5);
          
          if (searchResults.length > 0) {
            logger.info(`✅ 找到 ${searchResults.length} 个搜索结果:`);
            
            searchResults.forEach((video, index) => {
              const durationStr = video.duration ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}` : '未知';
              logger.info(`  ${index + 1}. ${video.title} - ${video.author} (${durationStr})`);
              logger.info(`     URL: ${video.url}`);
            });
            
            // 测试关键词匹配
            const matcher = new KeywordMatcher(appConfig.matcher);
            const matchedVideos = searchResults.filter(video => matcher.match(video));
            
            if (matchedVideos.length > 0) {
              logger.info(`🎯 其中 ${matchedVideos.length} 个视频匹配关键词条件:`);
              matchedVideos.forEach((video, index) => {
                logger.info(`  ✓ ${video.title} - ${video.author}`);
              });
            } else {
              logger.info(`⚠️  搜索结果中没有视频匹配关键词条件`);
              logger.info(`💡 在实际运行中，会播放第一个搜索结果来引导算法`);
            }
            
          } else {
            logger.warn(`❌ 关键词 "${keyword}" 没有搜索到任何结果`);
          }
          
        } catch (error) {
          logger.error(`搜索关键词 "${keyword}" 时出错:`, error);
        }
      }
    } else {
      logger.warn('❌ 当前平台不支持搜索功能');
    }
    
    // 模拟主动搜索触发条件
    logger.info('\n🎲 模拟主动搜索触发条件...');
    
    const strategies = ['random', 'sequential', 'weighted'];
    for (const strategy of strategies) {
      logger.info(`\n📝 测试 ${strategy} 策略:`);
      
      // 模拟关键词选择逻辑
      const keywords = appConfig.matcher.keywords;
      let selectedKeywords: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        let keyword: string;
        
        switch (strategy) {
          case 'random':
            keyword = keywords[Math.floor(Math.random() * keywords.length)];
            break;
          case 'sequential':
            keyword = keywords[i % keywords.length];
            break;
          case 'weighted':
            // 回退到随机策略
            keyword = keywords[Math.floor(Math.random() * keywords.length)];
            break;
          default:
            keyword = keywords[0];
        }
        
        selectedKeywords.push(keyword);
      }
      
      logger.info(`  选中的关键词序列: ${selectedKeywords.join(' -> ')}`);
    }
    
    logger.info('\n🎉 主动搜索功能测试完成！');
    
    // 显示使用建议
    logger.info('\n💡 使用建议:');
    logger.info('  1. 设置 ACTIVE_SEARCH_THRESHOLD=3 可以更快触发主动搜索（用于测试）');
    logger.info('  2. 设置 ACTIVE_SEARCH_STRATEGY=sequential 可以依次尝试所有关键词');
    logger.info('  3. 设置 ENABLE_ACTIVE_SEARCH=false 可以完全禁用主动搜索');
    logger.info('  4. 主动搜索会在历史记录中标记为 "search" 来源');
    
  } catch (error) {
    logger.error('测试过程中发生错误:', error);
  }
}

// 运行测试
testActiveSearch().then(() => {
  logger.info('\n✨ 测试脚本执行完成');
  process.exit(0);
}).catch((error) => {
  logger.error('💥 测试脚本执行失败:', error);
  process.exit(1);
});
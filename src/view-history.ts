import { HistoryService } from './services/history-service.js';
import { logger } from './core/logger.js';

/**
 * 历史记录查看工具
 */
async function main() {
  const historyService = new HistoryService();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';

  switch (command) {
    case 'stats':
    case 'report':
      // 显示统计报告
      console.log(historyService.generateReport());
      break;
      
    case 'recent':
      // 显示最近的观看记录
      const limit = parseInt(args[1]) || 10;
      const recentHistory = historyService.getRecentHistory(limit);
      
      console.log(`📺 最近 ${limit} 条观看记录:`);
      console.log('='.repeat(50));
      
      if (recentHistory.length === 0) {
        console.log('暂无观看记录');
      } else {
        recentHistory.forEach((record, index) => {
          const date = new Date(record.timestamp).toLocaleString('zh-CN');
          const keywords = record.matchedKeywords.join(', ');
          const duration = (record.playDuration / 1000).toFixed(1);
          
          console.log(`${index + 1}. ${record.video.title}`);
          console.log(`   作者: ${record.video.author}`);
          console.log(`   时间: ${date}`);
          console.log(`   关键词: ${keywords}`);
          console.log(`   来源: ${record.source}, 播放: ${duration}秒`);
          console.log(`   链接: ${record.video.url}`);
          console.log('');
        });
      }
      break;
      
    case 'search':
      // 搜索历史记录
      const query = args[1];
      if (!query) {
        console.log('请提供搜索关键词: npm run view-history search "关键词"');
        break;
      }
      
      const searchResults = historyService.searchHistory(query);
      console.log(`🔍 搜索 "${query}" 的结果 (${searchResults.length} 条):`);
      console.log('='.repeat(50));
      
      if (searchResults.length === 0) {
        console.log('未找到匹配的记录');
      } else {
        searchResults.slice(0, 20).forEach((record, index) => {
          const date = new Date(record.timestamp).toLocaleString('zh-CN');
          const keywords = record.matchedKeywords.join(', ');
          
          console.log(`${index + 1}. ${record.video.title}`);
          console.log(`   作者: ${record.video.author}`);
          console.log(`   时间: ${date}, 关键词: ${keywords}`);
          console.log('');
        });
        
        if (searchResults.length > 20) {
          console.log(`... 还有 ${searchResults.length - 20} 条记录`);
        }
      }
      break;
      
    case 'cleanup':
      // 清理旧记录
      const daysToKeep = parseInt(args[1]) || 30;
      historyService.cleanupOldHistory(daysToKeep);
      console.log(`✅ 清理完成，保留最近 ${daysToKeep} 天的记录`);
      break;
      
    case 'help':
    default:
      console.log('📖 历史记录查看工具使用说明:');
      console.log('');
      console.log('npm run view-history [command] [options]');
      console.log('');
      console.log('命令:');
      console.log('  stats              显示统计报告 (默认)');
      console.log('  recent [数量]      显示最近的观看记录 (默认10条)');
      console.log('  search <关键词>    搜索历史记录');
      console.log('  cleanup [天数]     清理旧记录，保留指定天数 (默认30天)');
      console.log('  help               显示此帮助信息');
      console.log('');
      console.log('示例:');
      console.log('  npm run view-history stats');
      console.log('  npm run view-history recent 20');
      console.log('  npm run view-history search "mujica"');
      console.log('  npm run view-history cleanup 7');
      break;
  }
}

// 运行工具
main().catch(error => {
  logger.error('历史查看工具运行失败:', error);
  process.exit(1);
});
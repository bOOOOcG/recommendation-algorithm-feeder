import { CookieLoader } from './utils/cookie-loader.js';
import { logger } from './core/logger.js';
import { config } from 'dotenv';

// 加载环境变量
config();

/**
 * 测试多平台Cookie加载功能
 */
async function testMultiPlatformCookies() {
  logger.info('='.repeat(60));
  logger.info('🍪 测试多平台Cookie加载功能');
  logger.info('='.repeat(60));

  // 显示当前环境变量配置
  logger.info('\n📋 当前环境变量配置:');
  logger.info(`COOKIE_FILE: ${process.env.COOKIE_FILE || '未设置'}`);
  logger.info(`BILIBILI_COOKIE_FILE: ${process.env.BILIBILI_COOKIE_FILE || '未设置'}`);
  logger.info(`YOUTUBE_COOKIE_FILE: ${process.env.YOUTUBE_COOKIE_FILE || '未设置'}`);

  // 测试各个平台的Cookie加载
  const platforms = ['bilibili', 'youtube'];
  
  for (const platform of platforms) {
    logger.info(`\n🔍 测试${platform}平台Cookie加载...`);
    
    try {
      const cookie = CookieLoader.loadCookie(platform);
      if (cookie) {
        // 只显示Cookie的前20个字符，保护隐私
        const preview = cookie.length > 20 ? cookie.substring(0, 20) + '...' : cookie;
        logger.info(`✅ ${platform}平台Cookie加载成功`);
        logger.info(`📝 Cookie预览: ${preview}`);
        logger.info(`📊 Cookie长度: ${cookie.length}字符`);
        
        // 验证Cookie格式（通用验证）
        const isValidGeneric = CookieLoader.validateCookie(cookie);
        // 验证平台特定格式
        const isValidPlatform = CookieLoader.validatePlatformCookie(cookie, platform);
        logger.info(`🔍 Cookie验证 (通用): ${isValidGeneric ? '✅ 有效' : '❌ 无效'}`);
        logger.info(`🔍 Cookie验证 (${platform}): ${isValidPlatform ? '✅ 有效' : '❌ 无效'}`);
      } else {
        logger.warn(`⚠️  ${platform}平台Cookie为空`);
      }
    } catch (error) {
      logger.error(`❌ ${platform}平台Cookie加载失败:`, error.message);
    }
  }

  // 测试批量加载功能
  logger.info('\n🔄 测试批量加载所有平台Cookie...');
  try {
    const allCookies = CookieLoader.loadAllSupportedPlatformCookies();
    
    logger.info('📊 批量加载结果汇总:');
    for (const [platform, cookie] of Object.entries(allCookies)) {
      const status = cookie ? '✅ 成功' : '❌ 失败';
      const length = cookie ? `${cookie.length}字符` : '0字符';
      logger.info(`  ${platform}: ${status} (${length})`);
    }
  } catch (error) {
    logger.error('❌ 批量加载失败:', error);
  }

  // 测试Cookie文件列表功能
  logger.info('\n📁 检查cookies目录中的文件...');
  try {
    const cookieFiles = CookieLoader.listCookieFiles();
    if (cookieFiles.length > 0) {
      logger.info('📋 发现的Cookie文件:');
      cookieFiles.forEach(file => {
        logger.info(`  📄 ${file}`);
      });
    } else {
      logger.info('📭 cookies目录中没有找到Cookie文件');
    }
  } catch (error) {
    logger.error('❌ 读取cookies目录失败:', error);
  }

  logger.info('\n🎉 多平台Cookie测试完成！');
}

// 运行测试
testMultiPlatformCookies().then(() => {
  logger.info('\n✨ 测试脚本执行完成');
  process.exit(0);
}).catch((error) => {
  logger.error('💥 测试脚本执行失败:', error);
  process.exit(1);
});
/**
 * YouTube推荐算法调试工具
 * 用于分析当前Cookie账户的推荐内容特征
 */

const fs = require('fs');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class YouTubeRecommendationDebugger {
  constructor(cookiePath) {
    this.cookiePath = cookiePath;
    this.cookies = this.loadCookies();
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
    this.proxy = process.env.USE_PROXY === 'true' ? this.getProxyAgent() : null;
  }

  loadCookies() {
    try {
      const content = fs.readFileSync(this.cookiePath, 'utf-8').trim();
      const cookieArray = JSON.parse(content);
      
      return cookieArray
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
    } catch (error) {
      console.error('加载Cookie失败:', error);
      process.exit(1);
    }
  }

  getProxyAgent() {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    return httpsProxy ? new HttpsProxyAgent(httpsProxy) : null;
  }

  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          ...options.headers
        }
      };

      if (this.proxy) {
        requestOptions.agent = this.proxy;
      }

      const req = https.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.end();
    });
  }

  async checkAccountInfo() {
    console.log('🔍 检查账户信息...');
    
    try {
      const response = await this.makeRequest('https://www.youtube.com/account');
      
      if (response.statusCode === 302 && response.headers.location?.includes('accounts.google.com')) {
        return {
          valid: false,
          reason: 'Cookie已过期，被重定向到登录页面'
        };
      }
      
      const body = response.body;
      
      // 检查语言设置
      const langMatch = body.match(/"hl":"([^"]+)"/);
      const glMatch = body.match(/"gl":"([^"]+)"/);
      
      // 检查频道信息
      const channelMatch = body.match(/"channelName":"([^"]+)"/);
      const emailMatch = body.match(/"email":"([^"]+)"/);
      
      return {
        valid: true,
        language: langMatch ? langMatch[1] : 'unknown',
        region: glMatch ? glMatch[1] : 'unknown',
        channelName: channelMatch ? channelMatch[1] : 'unknown',
        email: emailMatch ? emailMatch[1] : 'unknown'
      };
      
    } catch (error) {
      return {
        valid: false,
        reason: `请求失败: ${error.message}`
      };
    }
  }

  async analyzeHomeFeed() {
    console.log('🏠 分析首页推荐内容...');
    
    try {
      const response = await this.makeRequest('https://www.youtube.com/');
      
      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}`);
      }
      
      const body = response.body;
      
      // 提取ytInitialData
      const ytDataMatch = body.match(/var ytInitialData = ({.*?});/);
      if (!ytDataMatch) {
        throw new Error('无法找到ytInitialData');
      }
      
      const ytData = JSON.parse(ytDataMatch[1]);
      
      // 分析推荐内容
      const analysis = this.analyzeRecommendationData(ytData);
      
      return analysis;
      
    } catch (error) {
      console.error('分析首页推荐失败:', error);
      return null;
    }
  }

  analyzeRecommendationData(ytData) {
    const analysis = {
      totalVideos: 0,
      chineseVideos: 0,
      englishVideos: 0,
      otherLanguageVideos: 0,
      videoSamples: [],
      categories: {},
      authors: {},
      keywords: []
    };

    try {
      // 导航到推荐视频区域
      const contents = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.richGridRenderer?.contents;
      
      if (!contents) {
        console.warn('无法找到推荐视频内容结构');
        return analysis;
      }
      
      for (const item of contents) {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (!videoRenderer) continue;
        
        const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || '';
        const author = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.longBylineText?.runs?.[0]?.text || '';
        
        if (!title) continue;
        
        analysis.totalVideos++;
        
        // 语言分析
        if (this.containsChinese(title)) {
          analysis.chineseVideos++;
        } else if (this.containsEnglish(title)) {
          analysis.englishVideos++;
        } else {
          analysis.otherLanguageVideos++;
        }
        
        // 作者统计
        if (author) {
          analysis.authors[author] = (analysis.authors[author] || 0) + 1;
        }
        
        // 关键词提取
        const keywords = this.extractKeywords(title);
        analysis.keywords.push(...keywords);
        
        // 保存样本
        if (analysis.videoSamples.length < 20) {
          analysis.videoSamples.push({
            title,
            author,
            videoId: videoRenderer.videoId,
            language: this.detectLanguage(title)
          });
        }
      }
      
      // 处理重复的关键词
      const keywordCounts = {};
      analysis.keywords.forEach(keyword => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
      
      analysis.topKeywords = Object.entries(keywordCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([keyword, count]) => ({ keyword, count }));
      
      delete analysis.keywords; // 删除原始数组，节省内存
      
    } catch (error) {
      console.error('分析推荐数据时出错:', error);
    }
    
    return analysis;
  }

  containsChinese(text) {
    return /[\u4e00-\u9fa5]/.test(text);
  }

  containsEnglish(text) {
    return /[a-zA-Z]/.test(text);
  }

  detectLanguage(text) {
    if (this.containsChinese(text)) {
      return 'Chinese';
    } else if (this.containsEnglish(text)) {
      return 'English';
    } else {
      return 'Other';
    }
  }

  extractKeywords(title) {
    // 简单的关键词提取（中文和英文）
    const keywords = [];
    
    // 提取中文词汇（2-4个字符的词组）
    const chineseMatches = title.match(/[\u4e00-\u9fa5]{2,4}/g);
    if (chineseMatches) {
      keywords.push(...chineseMatches);
    }
    
    // 提取英文单词（3个字符以上）
    const englishMatches = title.match(/[a-zA-Z]{3,}/g);
    if (englishMatches) {
      keywords.push(...englishMatches.map(w => w.toLowerCase()));
    }
    
    return keywords;
  }

  async checkMujicaContent() {
    console.log('🎵 检查"mujica"相关内容...');
    
    try {
      const searchResponse = await this.makeRequest('https://www.youtube.com/results?search_query=mujica');
      
      if (searchResponse.statusCode !== 200) {
        throw new Error(`搜索请求失败: HTTP ${searchResponse.statusCode}`);
      }
      
      const body = searchResponse.body;
      const ytDataMatch = body.match(/var ytInitialData = ({.*?});/);
      
      if (!ytDataMatch) {
        throw new Error('无法解析搜索结果');
      }
      
      const ytData = JSON.parse(ytDataMatch[1]);
      const videos = this.extractSearchResults(ytData);
      
      return {
        totalResults: videos.length,
        videos: videos.slice(0, 10) // 只返回前10个结果
      };
      
    } catch (error) {
      console.error('检查mujica内容失败:', error);
      return null;
    }
  }

  extractSearchResults(ytData) {
    const videos = [];
    
    try {
      const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
      
      if (!contents) {
        return videos;
      }
      
      for (const item of contents) {
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;
        
        const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || '';
        const author = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.longBylineText?.runs?.[0]?.text || '';
        
        if (title) {
          videos.push({
            title,
            author,
            videoId: videoRenderer.videoId,
            language: this.detectLanguage(title)
          });
        }
      }
      
    } catch (error) {
      console.error('提取搜索结果失败:', error);
    }
    
    return videos;
  }

  printAnalysisReport(accountInfo, feedAnalysis, mujicaResults) {
    console.log('\n📊 YouTube推荐算法分析报告');
    console.log('=' .repeat(50));
    
    // 账户信息
    console.log('\n👤 账户信息:');
    if (accountInfo.valid) {
      console.log(`  ✅ Cookie状态: 有效`);
      console.log(`  🌐 语言设置: ${accountInfo.language}`);
      console.log(`  📍 地区设置: ${accountInfo.region}`);
      console.log(`  📺 频道名称: ${accountInfo.channelName}`);
      if (accountInfo.email !== 'unknown') {
        console.log(`  📧 邮箱: ${accountInfo.email}`);
      }
    } else {
      console.log(`  ❌ Cookie状态: 无效 (${accountInfo.reason})`);
      return; // Cookie无效时不继续分析
    }
    
    // 推荐内容分析
    if (feedAnalysis) {
      console.log('\n📺 首页推荐分析:');
      console.log(`  总视频数: ${feedAnalysis.totalVideos}`);
      console.log(`  中文视频: ${feedAnalysis.chineseVideos} (${((feedAnalysis.chineseVideos / feedAnalysis.totalVideos) * 100).toFixed(1)}%)`);
      console.log(`  英文视频: ${feedAnalysis.englishVideos} (${((feedAnalysis.englishVideos / feedAnalysis.totalVideos) * 100).toFixed(1)}%)`);
      console.log(`  其他语言: ${feedAnalysis.otherLanguageVideos} (${((feedAnalysis.otherLanguageVideos / feedAnalysis.totalVideos) * 100).toFixed(1)}%)`);
      
      // 语言预期检查
      if (feedAnalysis.chineseVideos / feedAnalysis.totalVideos < 0.7) {
        console.log(`  ⚠️  警告: 中文内容比例较低，可能存在地区/语言设置问题`);
      } else {
        console.log(`  ✅ 中文内容比例正常`);
      }
      
      // 热门关键词
      if (feedAnalysis.topKeywords && feedAnalysis.topKeywords.length > 0) {
        console.log('\n🔥 热门关键词:');
        feedAnalysis.topKeywords.slice(0, 10).forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.keyword} (${item.count}次)`);
        });
      }
      
      // 视频样本
      console.log('\n📋 视频样本:');
      feedAnalysis.videoSamples.slice(0, 10).forEach((video, index) => {
        console.log(`  ${index + 1}. [${video.language}] ${video.title} - ${video.author}`);
      });
    }
    
    // Mujica搜索结果
    if (mujicaResults) {
      console.log('\n🎵 "Mujica"搜索结果:');
      console.log(`  找到 ${mujicaResults.totalResults} 个相关视频`);
      
      if (mujicaResults.videos.length > 0) {
        console.log('  前10个结果:');
        mujicaResults.videos.forEach((video, index) => {
          console.log(`    ${index + 1}. [${video.language}] ${video.title} - ${video.author}`);
        });
      }
    }
    
    // 问题诊断和建议
    console.log('\n🔧 问题诊断和建议:');
    
    if (!accountInfo.valid) {
      console.log('  ❌ 主要问题: Cookie无效或已过期');
      console.log('  💡 建议: 重新获取YouTube的Cookie');
      return;
    }
    
    if (accountInfo.language !== 'zh-TW' && accountInfo.language !== 'zh-CN') {
      console.log('  ⚠️  语言设置问题: 当前语言不是中文');
      console.log('  💡 建议: 在YouTube设置中将语言改为中文');
    }
    
    if (accountInfo.region !== 'TW' && accountInfo.region !== 'CN' && accountInfo.region !== 'HK') {
      console.log('  ⚠️  地区设置问题: 当前地区不是中文区域');
      console.log('  💡 建议: 在YouTube设置中将地区改为台湾、香港或中国');
    }
    
    if (feedAnalysis && feedAnalysis.chineseVideos / feedAnalysis.totalVideos < 0.5) {
      console.log('  ⚠️  推荐内容问题: 中文内容比例过低');
      console.log('  💡 建议: 多观看中文视频以训练算法');
    }
    
    if (mujicaResults && mujicaResults.totalResults === 0) {
      console.log('  ⚠️  搜索问题: 找不到"mujica"相关内容');
      console.log('  💡 建议: 检查搜索关键词或网络连接');
    }
    
    console.log('\n✅ 分析完成');
  }
}

async function main() {
  console.log('YouTube推荐算法调试工具');
  console.log('========================');
  
  const cookiePath = process.argv[2] || 'cookies/monstera_yt.txt';
  console.log(`使用Cookie文件: ${cookiePath}`);
  
  if (!fs.existsSync(cookiePath)) {
    console.error(`错误: Cookie文件不存在: ${cookiePath}`);
    process.exit(1);
  }

  const debugger = new YouTubeRecommendationDebugger(cookiePath);
  
  try {
    // 1. 检查账户信息
    const accountInfo = await debugger.checkAccountInfo();
    
    // 2. 分析首页推荐
    let feedAnalysis = null;
    if (accountInfo.valid) {
      feedAnalysis = await debugger.analyzeHomeFeed();
    }
    
    // 3. 检查Mujica相关内容
    let mujicaResults = null;
    if (accountInfo.valid) {
      mujicaResults = await debugger.checkMujicaContent();
    }
    
    // 4. 生成报告
    debugger.printAnalysisReport(accountInfo, feedAnalysis, mujicaResults);
    
  } catch (error) {
    console.error('调试过程出错:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
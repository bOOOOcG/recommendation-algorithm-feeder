/**
 * YouTube Cookie验证工具
 * 用于验证Cookie是否有效且属于正确账户
 */

const https = require('https');
const fs = require('fs');

class YouTubeCookieVerifier {
  constructor(cookiePath) {
    this.cookiePath = cookiePath;
    this.cookies = this.loadCookies();
  }

  loadCookies() {
    try {
      const content = fs.readFileSync(this.cookiePath, 'utf-8').trim();
      const cookieArray = JSON.parse(content);
      
      // 转换为Cookie字符串格式
      return cookieArray
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
    } catch (error) {
      console.error('加载Cookie失败:', error);
      process.exit(1);
    }
  }

  async verifyAccount() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.youtube.com',
        port: 443,
        path: '/account',
        method: 'GET',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('HTTP状态码:', res.statusCode);
          console.log('响应头:', res.headers);
          
          // 检查是否重定向到登录页面
          if (res.statusCode === 302 && res.headers.location?.includes('accounts.google.com')) {
            resolve({
              valid: false,
              reason: 'Cookie已过期，被重定向到登录页面',
              statusCode: res.statusCode,
              location: res.headers.location
            });
            return;
          }
          
          // 检查响应内容
          if (data.includes('Sign in') || data.includes('登入') || data.includes('登录')) {
            resolve({
              valid: false,
              reason: '页面显示需要登录',
              statusCode: res.statusCode
            });
          } else if (data.includes('account') || data.includes('channel') || data.includes('頻道')) {
            // 尝试提取用户信息
            const channelMatch = data.match(/"channelName":"([^"]+)"/);
            const emailMatch = data.match(/"email":"([^"]+)"/);
            
            resolve({
              valid: true,
              reason: '成功访问账户页面',
              statusCode: res.statusCode,
              channelName: channelMatch ? channelMatch[1] : 'Unknown',
              email: emailMatch ? emailMatch[1] : 'Unknown'
            });
          } else {
            resolve({
              valid: false,
              reason: '无法确定账户状态',
              statusCode: res.statusCode,
              dataLength: data.length
            });
          }
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

  async checkRecommendationFeed() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.youtube.com',
        port: 443,
        path: '/',
        method: 'GET',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          // 检查是否为中文内容
          const hasChineseContent = /[\u4e00-\u9fa5]/.test(data);
          
          // 尝试提取视频标题
          const videoTitles = [];
          const titleMatches = data.matchAll(/"title":{"runs":\[{"text":"([^"]+)"/g);
          for (const match of titleMatches) {
            if (match[1] && match[1].length > 0) {
              videoTitles.push(match[1]);
            }
          }

          resolve({
            hasChineseContent,
            videoCount: videoTitles.length,
            sampleTitles: videoTitles.slice(0, 10),
            statusCode: res.statusCode
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
}

async function main() {
  console.log('YouTube Cookie验证工具');
  console.log('========================');
  
  const cookiePath = process.argv[2] || 'cookies/monstera_yt.txt';
  console.log(`验证Cookie文件: ${cookiePath}`);
  
  if (!fs.existsSync(cookiePath)) {
    console.error(`错误: Cookie文件不存在: ${cookiePath}`);
    process.exit(1);
  }

  const verifier = new YouTubeCookieVerifier(cookiePath);
  
  try {
    console.log('\n1. 验证账户状态...');
    const accountResult = await verifier.verifyAccount();
    console.log('账户验证结果:', accountResult);
    
    if (accountResult.valid) {
      console.log('✅ Cookie有效');
      if (accountResult.channelName) {
        console.log(`📺 频道名称: ${accountResult.channelName}`);
      }
      if (accountResult.email) {
        console.log(`📧 邮箱: ${accountResult.email}`);
      }
    } else {
      console.log('❌ Cookie无效:', accountResult.reason);
      return;
    }
    
    console.log('\n2. 检查推荐内容...');
    const feedResult = await verifier.checkRecommendationFeed();
    console.log('推荐内容分析:', feedResult);
    
    if (feedResult.hasChineseContent) {
      console.log('✅ 检测到中文内容，符合预期');
    } else {
      console.log('⚠️  未检测到中文内容，可能存在地区/语言设置问题');
    }
    
    if (feedResult.sampleTitles.length > 0) {
      console.log('\n📋 推荐视频样本:');
      feedResult.sampleTitles.forEach((title, index) => {
        console.log(`  ${index + 1}. ${title}`);
      });
    }
    
  } catch (error) {
    console.error('验证过程出错:', error);
  }
}

if (require.main === module) {
  main();
}
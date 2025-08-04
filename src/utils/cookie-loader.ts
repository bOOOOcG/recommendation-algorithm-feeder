import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../core/logger.js';

/**
 * Cookie加载器
 * 仅支持从文件加载Cookie
 */
export class CookieLoader {
  private static readonly COOKIES_DIR = 'cookies';

  /**
   * 加载Cookie
   * 仅从文件加载，优先级：平台特定文件 > 通用文件
   */
  static loadCookie(platformType: string = 'bilibili'): string {
    // 尝试加载平台特定的Cookie文件
    try {
      const platformPath = this.resolveCookiePath(`${platformType}.txt`);
      if (existsSync(platformPath)) {
        const content = readFileSync(platformPath, 'utf-8').trim();
        const cookie = this.parseCookieContent(content);
        logger.info(`使用${platformType}平台Cookie文件: ${platformType}.txt`);
        return cookie;
      }
    } catch (error) {
      logger.debug(`${platformType}平台Cookie文件读取失败: ${platformType}.txt`);
    }

    // 尝试加载通用默认Cookie文件
    try {
      const defaultPath = this.resolveCookiePath('default.txt');
      if (existsSync(defaultPath)) {
        const content = readFileSync(defaultPath, 'utf-8').trim();
        const cookie = this.parseCookieContent(content);
        logger.info('使用默认Cookie文件: default.txt');
        return cookie;
      }
    } catch (error) {
      logger.debug('默认Cookie文件不存在或无法读取');
    }

    throw new Error(`未找到可用的Cookie文件。请在以下位置放置Cookie文件：
- cookies/${platformType}.txt (推荐)
- cookies/default.txt (通用)`);
  }

  /**
   * 批量加载多个平台的Cookie
   */
  static loadMultiplePlatformCookies(platforms: string[]): Record<string, string> {
    const cookies: Record<string, string> = {};
    
    for (const platform of platforms) {
      try {
        cookies[platform] = this.loadCookie(platform);
        logger.info(`成功加载${platform}平台Cookie`);
      } catch (error) {
        logger.warn(`${platform}平台Cookie加载失败:`, error.message);
        cookies[platform] = '';
      }
    }
    
    return cookies;
  }

  /**
   * 获取所有支持的平台Cookie配置
   */
  static loadAllSupportedPlatformCookies(): Record<string, string> {
    const supportedPlatforms = ['bilibili', 'youtube'];
    return this.loadMultiplePlatformCookies(supportedPlatforms);
  }

  /**
   * 解析Cookie文件路径
   */
  private static resolveCookiePath(filePath: string): string {
    // 如果是绝对路径，直接使用
    if (filePath.includes(':') || filePath.startsWith('/')) {
      return filePath;
    }

    // 标准化路径分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // 如果以cookies/开头，直接使用
    if (normalizedPath.startsWith('cookies/')) {
      return normalizedPath;
    }

    // 否则加入cookies目录
    return join(this.COOKIES_DIR, filePath);
  }

  /**
   * 解析Cookie内容，支持JSON格式和字符串格式
   */
  private static parseCookieContent(content: string): string {
    try {
      // 尝试解析为JSON格式（浏览器导出的Cookie）
      const cookieArray = JSON.parse(content);
      if (Array.isArray(cookieArray)) {
        // 转换为Cookie字符串格式
        return cookieArray
          .map((cookie: any) => `${cookie.name}=${cookie.value}`)
          .join('; ');
      }
    } catch (error) {
      // 不是JSON格式，当作普通字符串处理
    }

    // 返回原始内容（字符串格式）
    return content;
  }

  /**
   * 验证Cookie格式（通用验证，仅检查基本格式）
   */
  static validateCookie(cookie: string): boolean {
    if (!cookie || cookie.trim() === '') {
      return false;
    }

    // 基本格式验证：检查是否包含 key=value 格式
    const cookiePattern = /\w+=[\w\-.%]+/;
    return cookiePattern.test(cookie);
  }

  /**
   * 验证平台特定的Cookie格式
   */
  static validatePlatformCookie(cookie: string, platform: string): boolean {
    if (!this.validateCookie(cookie)) {
      return false;
    }

    switch (platform.toLowerCase()) {
      case 'bilibili':
        return this.validateBilibiliCookie(cookie);
      case 'youtube':
        return this.validateYouTubeCookie(cookie);
      case 'twitch':
        return this.validateTwitchCookie(cookie);
      default:
        logger.warn(`未知平台: ${platform}，使用通用Cookie验证`);
        return true;
    }
  }

  /**
   * 验证Bilibili Cookie
   */
  private static validateBilibiliCookie(cookie: string): boolean {
    const requiredFields = ['SESSDATA'];
    const hasRequired = requiredFields.some(field => 
      cookie.includes(`${field}=`)
    );

    if (!hasRequired) {
      logger.warn('Bilibili Cookie可能无效：缺少必要字段 (SESSDATA)');
      return false;
    }

    return true;
  }

  /**
   * 验证YouTube Cookie
   */
  private static validateYouTubeCookie(cookie: string): boolean {
    // YouTube的关键Cookie字段
    const requiredFields = ['__Secure-3PSID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
    const hasRequired = requiredFields.some(field => 
      cookie.includes(`${field}=`)
    );

    if (!hasRequired) {
      logger.warn('YouTube Cookie可能无效：缺少必要字段 (__Secure-3PSID, HSID, SSID, APISID, SAPISID等)');
      return false;
    }

    return true;
  }

  /**
   * 验证Twitch Cookie
   */
  private static validateTwitchCookie(cookie: string): boolean {
    // Twitch的关键Cookie字段（未来实现）
    const requiredFields = ['auth-token', 'persistent'];
    const hasRequired = requiredFields.some(field => 
      cookie.includes(`${field}=`)
    );

    if (!hasRequired) {
      logger.warn('Twitch Cookie可能无效：缺少必要字段');
      return false;
    }

    return true;
  }

  /**
   * 列出可用的Cookie文件
   */
  static listCookieFiles(): string[] {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(this.COOKIES_DIR);
      return files.filter((file: string) => 
        file.endsWith('.txt') || file.endsWith('.cookie')
      );
    } catch (error) {
      logger.debug('读取cookies目录失败:', error);
      return [];
    }
  }
}
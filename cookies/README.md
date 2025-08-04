# Cookie 文件管理

这个文件夹用于存储不同的Bilibili Cookie文件。

## 文件命名规范

- `default.txt` - 默认Cookie文件
- `account1.txt` - 账户1的Cookie
- `account2.txt` - 账户2的Cookie
- 等等...

## Cookie文件格式

每个Cookie文件应包含完整的Bilibili Cookie字符串，例如：

```
SESSDATA=xxx; bili_jct=xxx; buvid3=xxx; DedeUserID=xxx; ...
```

## 使用方法

在 `.env` 文件中指定要使用的Cookie文件：

```env
# 方式1: 直接指定Cookie字符串
BILIBILI_COOKIE=your_cookie_string_here

# 方式2: 指定Cookie文件路径（推荐）
COOKIE_FILE=cookies/default.txt
```

## 安全提醒

- **不要**将Cookie文件提交到Git仓库
- Cookie包含敏感信息，请妥善保管
- 定期更新Cookie以保持有效性
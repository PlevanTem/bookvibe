# BookVibe 部署指南

## 快速部署选项

### 选项 1: Vercel（推荐，最简单）

#### 前端部署

1. 将代码推送到 GitHub
2. 访问 https://vercel.com
3. 导入项目，选择 `bookvibe` 目录
4. Vercel 会自动检测并部署

#### 后端部署（Vercel Serverless Functions）

1. 在项目根目录创建 `api/` 文件夹
2. 将 `api-example.js` 中的逻辑转换为 Vercel Serverless Function
3. 创建 `vercel.json`：

```json
{
  "functions": {
    "api/generate.js": {
      "runtime": "nodejs18.x"
    }
  },
  "env": {
    "OPENAI_API_KEY": "@openai_api_key",
    "UNSPLASH_ACCESS_KEY": "@unsplash_access_key"
  }
}
```

4. 在 Vercel 项目设置中配置环境变量

### 选项 2: Netlify

#### 前端部署

1. 将代码推送到 GitHub
2. 访问 https://netlify.com
3. 导入项目
4. 构建命令：留空（静态站点）
5. 发布目录：`bookvibe`

#### 后端部署（Netlify Functions）

1. 创建 `netlify/functions/generate.js`
2. 将 API 逻辑转换为 Netlify Function
3. 在 Netlify 项目设置中配置环境变量

### 选项 3: Railway（后端）

1. 访问 https://railway.app
2. 创建新项目，选择 "Deploy from GitHub repo"
3. 选择包含 `bookvibe` 的项目
4. Railway 会自动检测 `package.json` 并部署
5. 在项目设置中配置环境变量：
   - `OPENAI_API_KEY`
   - `UNSPLASH_ACCESS_KEY`
   - `PORT` (Railway 会自动设置)

### 选项 4: 传统服务器（VPS）

#### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start api-example.js --name bookvibe

# 设置开机自启
pm2 startup
pm2 save
```

#### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/bookvibe;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 环境变量配置

### 必需的环境变量

```env
OPENAI_API_KEY=sk-...
UNSPLASH_ACCESS_KEY=...
PORT=3000  # 可选，默认 3000
```

### 获取 API Keys

1. **OpenAI API Key**
   - 访问 https://platform.openai.com/api-keys
   - 登录并创建新的 API key
   - 注意：需要充值账户才能使用

2. **Unsplash API Key**
   - 访问 https://unsplash.com/developers
   - 点击 "Your apps"
   - 创建新应用
   - 复制 "Access Key"

## 前端配置

### 开发环境

编辑 `index.html`，在 `</body>` 前添加：

```html
<script>
    window.BOOKVIBE_CONFIG = {
        API_URL: 'http://localhost:3000/api/generate'
    };
</script>
```

### 生产环境

创建 `config.js`：

```javascript
window.BOOKVIBE_CONFIG = {
    API_URL: 'https://your-api-domain.com/api/generate'
};
```

然后在 `index.html` 中引入：

```html
<script src="config.js"></script>
```

## CORS 配置

如果前端和后端部署在不同域名，需要配置 CORS。

在 `api-example.js` 中已经包含了基本的 CORS 配置：

```javascript
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
```

生产环境建议限制 `Access-Control-Allow-Origin` 为具体的前端域名。

## 性能优化

### 1. 图片 CDN

考虑使用 Cloudflare 或 Cloudinary 作为图片 CDN，缓存 Unsplash 图片。

### 2. API 缓存

对于热门书籍，可以添加 Redis 缓存，避免重复调用 OpenAI API。

### 3. 静态资源优化

- 使用 Tailwind CSS CDN（已使用）
- 考虑使用本地字体文件，减少 Google Fonts 请求

## 监控和日志

### 使用 Sentry（错误监控）

```bash
npm install @sentry/node
```

### 使用 Winston（日志）

```bash
npm install winston
```

## 安全建议

1. **API Key 安全**
   - 永远不要将 API keys 提交到 Git
   - 使用环境变量存储敏感信息
   - 定期轮换 API keys

2. **速率限制**
   - 添加 API 速率限制，防止滥用
   - 使用 `express-rate-limit`

3. **输入验证**
   - 验证用户输入的书名长度
   - 防止 XSS 攻击

## 故障排查

### 常见问题

1. **CORS 错误**
   - 检查后端 CORS 配置
   - 确认前端 API URL 正确

2. **图片加载失败**
   - 检查 Unsplash API key 是否有效
   - 检查网络连接

3. **OpenAI API 错误**
   - 检查 API key 是否正确
   - 检查账户余额
   - 查看 API 使用限制

## 成本估算

### OpenAI API
- GPT-3.5 Turbo: ~$0.002 per request
- 预计每月成本：$10-50（取决于使用量）

### Unsplash API
- 免费额度：50 requests/hour
- 超出后需要付费计划

### 服务器
- Vercel/Netlify: 免费额度通常足够
- Railway: $5-20/月
- VPS: $5-20/月

## 下一步

- [ ] 添加用户反馈功能
- [ ] 实现图片缓存
- [ ] 添加更多书籍的模拟数据
- [ ] 优化移动端体验
- [ ] 添加分享功能（微信、微博等）

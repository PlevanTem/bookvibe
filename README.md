# BookVibe (书旅) - v2.0

**核心理念**：用一张卡片，连接文字与远方。

## ✨ 新版本特性

### 🎨 沉浸式设计
- **大卡片展示**：中间一张大卡片，沉浸式展示地点大图和原文段落
- **胶卷带预览**：底部一排小图预览，像胶卷带你走旅程
- **微交互动画**：切换卡片时的流畅动画效果

### 🎮 交互体验
- **左右箭头切换**：点击左右箭头切换卡片
- **键盘控制**：支持 `←` `→` 方向键切换
- **胶卷带点击**：点击底部小图快速跳转

### 🏷️ 地点类型区分
- **真实地点标签**：绿色标签，可点击打开谷歌地图搜索
- **虚构地点标签**：紫色标签，可点击生成 AI 图片

### ⚙️ 用户自定义配置
- **付费 API 需用户配置**：LLM 和 AIGC API 需要用户自己配置 API keys
- **免费图片源**：默认使用 Picsum Photos（无需配置）

## 🚀 快速开始

### 1. 配置 API Keys（必需）

编辑 `bookvibe/app.js` 或创建 `config.js`：

```javascript
const CONFIG = {
    // 必需：LLM API Key（用于提取地点和原文）
    LLM_API_KEY: "your-llm-api-key",
    
    // 可选：AIGC API Key（用于虚构地点生成图片）
    AIGC_API_KEY: "your-aigc-api-key",
    
    // 可选：图片搜索 API Keys
    PEXELS_API_KEY: "your-pexels-key",
    UNSPLASH_API_KEY: "your-unsplash-key",
};
```

### 2. 获取 API Keys

#### LLM API（必需）
- **OpenAI**: https://platform.openai.com/api-keys
- **智谱AI (GLM-4.7)**: https://open.bigmodel.cn/

#### AIGC API（可选，用于虚构地点）
- **OpenAI DALL-E**: https://platform.openai.com/api-keys
- 其他 AIGC 服务商

#### 图片搜索 API（可选）
- **Pexels**: https://www.pexels.com/api/ （免费）
- **Unsplash**: https://unsplash.com/developers （免费额度）

### 3. 直接使用

打开 `index.html`，输入书名即可使用！

## 📖 使用说明

### 基本操作

1. **输入书名** → 点击"出发"或按回车
2. **查看卡片** → 中间显示大卡片，底部显示胶卷带
3. **切换卡片**：
   - 点击左右箭头
   - 使用键盘 `←` `→` 键
   - 点击底部胶卷带小图
4. **真实地点** → 点击"在谷歌地图查看"按钮
5. **虚构地点** → 点击"AI生成图片"按钮（需配置 AIGC API）

### 功能说明

- **真实地点**：显示绿色"真实地点"标签，可打开谷歌搜索查看详情
- **虚构地点**：显示紫色"虚构地点"标签，可生成 AI 图片（需配置 AIGC API）
- **胶卷带**：底部横向滚动的小图预览，点击可快速跳转
- **键盘控制**：支持方向键切换，提升操作效率

## 🎨 设计特点

### 视觉设计
- **沉浸式大卡片**：16:10 比例，全屏展示地点图片
- **渐变遮罩**：底部渐变遮罩，确保文字可读性
- **胶卷带效果**：底部小图预览，营造时光旅程感

### 交互设计
- **微交互动画**：切换时的缩放和淡入效果
- **响应式设计**：适配桌面和移动设备
- **键盘友好**：支持键盘操作，提升可访问性

## ⚙️ 技术栈

- **前端**：HTML + Tailwind CSS + Vanilla JavaScript
- **AI**：用户配置的 LLM API（OpenAI / GLM-4.7 等）
- **图片**：
  - 真实地点：Picsum / Pexels / Unsplash
  - 虚构地点：用户配置的 AIGC API（DALL-E 等）

## 📝 API 配置说明

### 必需配置

```javascript
LLM_API_KEY: "your-key"  // 用于提取书籍地点和原文
```

### 可选配置

```javascript
AIGC_API_KEY: "your-key"  // 用于虚构地点生成图片
PEXELS_API_KEY: "your-key"  // 图片搜索（可选）
UNSPLASH_API_KEY: "your-key"  // 图片搜索（可选）
```

### 免费选项

- **图片搜索**：使用 `IMAGE_API_TYPE: "picsum"`（无需配置）
- **LLM API**：需要付费 API（OpenAI / GLM-4.7 等）

## 🌐 部署

### 静态文件部署

1. **Vercel**（推荐）
   - 访问 https://vercel.com
   - 导入 GitHub 仓库
   - 自动部署

2. **Netlify**
   - 访问 https://netlify.com
   - 拖拽文件夹
   - 完成部署

3. **GitHub Pages**
   - 推送到 GitHub
   - 在仓库设置中启用 Pages

### ⚠️ 注意事项

- **API Keys 安全**：不要将 API keys 提交到公开仓库
- **使用环境变量**：生产环境建议使用环境变量
- **CORS 配置**：如果 API 有 CORS 限制，需要后端代理

## 🐛 故障排查

### API 调用失败

1. 检查 API keys 是否正确配置
2. 检查 API 余额是否充足
3. 查看浏览器控制台错误信息

### 图片加载失败

1. 检查图片 API 配置
2. 系统会自动使用备用图片（Picsum）
3. 检查网络连接

### AIGC 生图失败

1. 检查 AIGC_API_KEY 是否配置
2. 检查 API 余额和限制
3. 查看控制台错误信息

## 📄 许可证

MIT License

---

**一句话总结**：沉浸式大卡片 + 胶卷带预览，用键盘和鼠标探索书中的每一个地点，真实地点看地图，虚构地点看 AI 生成。

// BookVibe 配置文件示例
// 复制此文件为 config.js 并填入实际配置

window.BOOKVIBE_CONFIG = {
    // 后端 API 地址
    // 本地开发: 'http://localhost:3000/api/generate'
    // 生产环境: 'https://your-api-domain.com/api/generate'
    API_URL: '/api/generate',
    
    // 是否启用模拟数据（当 API 不可用时）
    USE_MOCK_DATA: true,
    
    // Unsplash API Key（可选，如果后端未配置）
    UNSPLASH_ACCESS_KEY: '',
    
    // OpenAI API Key（可选，如果后端未配置）
    OPENAI_API_KEY: '',
    
    // ==================== AI 生图配置 ====================
    // AIGC_API_KEY: 付费 API Key（OpenAI DALL-E 等）
    // 如果不配置，系统会自动使用免费的 Pollinations.ai 服务
    
    // ⚠️ 免费 AI 生图服务限制规避方案：
    // 1. 注册 Pollinations.ai 账号获取免费额度（推荐）
    //    访问: https://pollinations.ai/ 或 https://enter.pollinations.ai
    //    注册后可获得免费每日额度，避免匿名用户的速率限制
    
    // 2. 系统已内置多个免费服务备选方案：
    //    - Pollinations.ai（主要）
    //    - Pollinations.ai 备用域名
    //    如果某个服务触发速率限制，会自动切换到下一个
    
    // 3. 系统已添加自动延迟机制：
    //    虚构地点的 AI 生图请求会自动添加 2-5 秒延迟
    //    避免同时触发多个请求导致速率限制
    
    // 4. 如需使用需要 Token 的服务（如 Hugging Face）：
    //    需要通过后端代理接口实现，避免在前端暴露 Token
    //    示例后端接口：POST /api/generate-image
    //    请求体：{ prompt: string, seed?: number }
    //    返回：图片二进制流（Content-Type: image/png）
    
    // AIGC_API_KEY: '', // 可选：配置付费 API Key 避免所有限制
    // AIGC_API_URL: 'https://api.openai.com/v1/images/generations',
    // AIGC_MODEL: 'dall-e-3'
    
    // AIGC_BACKEND_PROXY: '', // 可选：后端代理接口地址（用于需要 Token 的服务）
};

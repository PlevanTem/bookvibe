// BookVibe 后端 API 示例
// 使用 Node.js + Express

const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());
app.use(express.static('public')); // 静态文件服务

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// 环境变量配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'your-unsplash-access-key';

/**
 * 核心 API：生成明信片数据
 * POST /api/generate
 * Body: { bookName: "书名" }
 */
app.post('/api/generate', async (req, res) => {
    try {
        const { bookName } = req.body;
        
        if (!bookName) {
            return res.status(400).json({ error: '书名不能为空' });
        }
        
        // Step 1: 使用 LLM 提取地点和金句
        const bookData = await extractBookLocationAndQuote(bookName);
        
        // Step 2: 搜索图片
        const imageUrl = await searchImage(bookData.imageQuery);
        
        // Step 3: 返回完整数据
        res.json({
            location: bookData.location,
            locationEn: bookData.locationEn,
            quote: bookData.quote,
            imageQuery: bookData.imageQuery,
            imageUrl: imageUrl,
            bookTitle: bookName
        });
        
    } catch (error) {
        console.error('Error generating postcard:', error);
        res.status(500).json({ error: error.message || '生成失败，请稍后重试' });
    }
});

/**
 * 使用 OpenAI GPT 提取地点和金句
 */
async function extractBookLocationAndQuote(bookName) {
    const prompt = `你是一位文学评论家和旅行家。请为书籍《${bookName}》完成以下任务：

1. 识别书中**最经典/最具氛围感**的一个地理位置（可以是真实地点或虚构地点）
2. 摘取一段描写该地点或体现该地点情绪的**短句**（中文书籍用中文，英文书籍用英文，<50字）
3. 生成用于搜索图片的英文关键词（包含地点名 + atmospheric/cinematic 等氛围词）

请以 JSON 格式返回：
{
    "location": "地点中文名",
    "locationEn": "地点英文名",
    "quote": "金句（<50字）",
    "imageQuery": "搜索关键词，如 'Long Island dock mist night atmospheric'"
}

如果书籍不存在或无法识别，返回：
{
    "location": "未知之地",
    "locationEn": "Unknown Place",
    "quote": "每一本书都是一次旅行，每一页都是一个新的世界。",
    "imageQuery": "literature books reading atmospheric"
}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一位专业的文学评论家和旅行家，擅长从文学作品中提取地点和经典句子。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        
        // 尝试解析 JSON（可能包含 markdown 代码块）
        let jsonStr = content;
        if (content.includes('```json')) {
            jsonStr = content.match(/```json\n([\s\S]*?)\n```/)[1];
        } else if (content.includes('```')) {
            jsonStr = content.match(/```\n([\s\S]*?)\n```/)[1];
        }
        
        const result = JSON.parse(jsonStr);
        return result;
        
    } catch (error) {
        console.error('OpenAI API error:', error);
        // 返回默认值
        return {
            location: '未知之地',
            locationEn: 'Unknown Place',
            quote: '每一本书都是一次旅行，每一页都是一个新的世界。',
            imageQuery: 'literature books reading atmospheric'
        };
    }
}

/**
 * 使用 Unsplash API 搜索图片
 */
async function searchImage(query) {
    try {
        const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&client_id=${UNSPLASH_ACCESS_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Unsplash API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.urls.regular; // 或 data.urls.full 获取更高分辨率
        
    } catch (error) {
        console.error('Unsplash API error:', error);
        // 返回备用图片 URL
        return `https://source.unsplash.com/600x400/?${encodeURIComponent(query)}`;
    }
}

/**
 * 刷新图片 API（不重新生成文字，只换图）
 * POST /api/refresh-image
 * Body: { imageQuery: "搜索关键词" }
 */
app.post('/api/refresh-image', async (req, res) => {
    try {
        const { imageQuery } = req.body;
        
        if (!imageQuery) {
            return res.status(400).json({ error: '搜索关键词不能为空' });
        }
        
        const imageUrl = await searchImage(imageQuery);
        res.json({ imageUrl });
        
    } catch (error) {
        console.error('Error refreshing image:', error);
        res.status(500).json({ error: error.message || '刷新图片失败' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BookVibe API server running on http://localhost:${PORT}`);
    console.log(`Make sure to set OPENAI_API_KEY and UNSPLASH_ACCESS_KEY environment variables`);
});

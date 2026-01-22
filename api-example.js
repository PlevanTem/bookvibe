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
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ModelScope-Async-Mode, X-ModelScope-Task-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 环境变量配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'your-unsplash-access-key';
const MODELSCOPE_API_KEY = process.env.MODELSCOPE_API_KEY || 'ms-6718f25b-ad28-420a-9668-cbd6456c9759'; // 临时硬编码，生产环境请使用环境变量
const MODELSCOPE_MODEL = process.env.MODELSCOPE_MODEL || 'Tongyi-MAI/Z-Image-Turbo';

// 启动时检查配置
console.log(`🔧 ModelScope 配置检查:`);
console.log(`   API Key: ${MODELSCOPE_API_KEY ? MODELSCOPE_API_KEY.substring(0, 10) + '...' : '未配置'}`);
console.log(`   Model: ${MODELSCOPE_MODEL}`);

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

/**
 * ModelScope API 代理：创建生图任务
 * POST /api/modelscope/generate
 * Body: { prompt: "提示词", model?: "模型ID" }
 */
app.post('/api/modelscope/generate', async (req, res) => {
    try {
        const { prompt, model } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: '提示词不能为空' });
        }
        
        if (!MODELSCOPE_API_KEY) {
            return res.status(400).json({ error: 'ModelScope API Key 未配置' });
        }
        
        const baseUrl = 'https://api-inference.modelscope.cn';
        const useModel = model || MODELSCOPE_MODEL;
        const enhancedPrompt = `${prompt}, cinematic, atmospheric, high quality, 4k`;
        
        console.log(`🎨 ModelScope: 创建生图任务`);
        console.log(`   - 模型: ${useModel}`);
        console.log(`   - 提示词: ${enhancedPrompt.substring(0, 100)}...`);
        console.log(`   - API Key: ${MODELSCOPE_API_KEY ? MODELSCOPE_API_KEY.substring(0, 10) + '...' : '未配置'}`);
        
        // 按照 Python 示例的格式构建请求
        // Python: json.dumps({...}, ensure_ascii=False).encode('utf-8')
        // Node.js: JSON.stringify 会自动处理 UTF-8 编码
        const requestBody = {
            model: useModel,
            prompt: enhancedPrompt
        };
        
        console.log(`📤 请求 URL: ${baseUrl}/v1/images/generations`);
        console.log(`📤 请求体:`, JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(`${baseUrl}/v1/images/generations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MODELSCOPE_API_KEY}`,
                'Content-Type': 'application/json',
                'X-ModelScope-Async-Mode': 'true'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            console.error(`❌ ModelScope API 错误:`, errorData);
            return res.status(response.status).json({ 
                error: errorData.error?.message || errorData.message || 'ModelScope API 请求失败' 
            });
        }
        
        const data = await response.json();
        console.log(`📥 ModelScope API 响应:`, JSON.stringify(data, null, 2));
        
        const taskId = data.task_id;
        
        if (!taskId) {
            console.error(`❌ ModelScope API 未返回 task_id，响应:`, data);
            return res.status(500).json({ error: 'ModelScope API 未返回 task_id', response: data });
        }
        
        console.log(`✅ ModelScope: 任务已创建，task_id: ${taskId}`);
        res.json({ task_id: taskId });
        
    } catch (error) {
        console.error('Error creating ModelScope task:', error);
        res.status(500).json({ error: error.message || '创建任务失败' });
    }
});

/**
 * ModelScope API 代理：查询任务状态
 * GET /api/modelscope/task/:taskId
 */
app.get('/api/modelscope/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!MODELSCOPE_API_KEY) {
            return res.status(400).json({ error: 'ModelScope API Key 未配置' });
        }
        
        const baseUrl = 'https://api-inference.modelscope.cn';
        
        console.log(`🔄 查询任务状态 - task_id: ${taskId}`);
        
        const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${MODELSCOPE_API_KEY}`,
                'Content-Type': 'application/json',
                'X-ModelScope-Task-Type': 'image_generation'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            console.error(`❌ ModelScope 任务状态查询失败:`, errorData);
            return res.status(response.status).json({ 
                error: errorData.error?.message || errorData.message || '查询任务状态失败' 
            });
        }
        
        const data = await response.json();
        console.log(`📥 ModelScope 任务状态查询响应:`, {
            task_status: data.task_status,
            has_output_images: !!(data.output_images && data.output_images.length > 0),
            output_images_count: data.output_images ? data.output_images.length : 0
        });
        
        if (data.task_status === 'SUCCEED' && data.output_images && data.output_images.length > 0) {
            console.log(`✅ ModelScope 图片生成成功: ${data.output_images[0]}`);
        } else if (data.task_status === 'FAILED') {
            console.error(`❌ ModelScope 任务失败:`, data);
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('Error querying ModelScope task:', error);
        res.status(500).json({ error: error.message || '查询任务状态失败' });
    }
});

const PORT = process.env.PORT || 3000;

// 检查端口是否被占用
const server = app.listen(PORT, () => {
    console.log(`BookVibe API server running on http://localhost:${PORT}`);
    console.log(`Make sure to set OPENAI_API_KEY and UNSPLASH_ACCESS_KEY environment variables`);
    if (MODELSCOPE_API_KEY) {
        console.log(`✅ ModelScope API Key 已配置，模型: ${MODELSCOPE_MODEL}`);
    } else {
        console.log(`ℹ️ ModelScope API Key 未配置（可选）`);
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用！`);
        console.error(`💡 解决方案：`);
        console.error(`   1. 关闭占用端口的进程`);
        console.error(`   2. 或使用其他端口: PORT=3001 node api-example.js`);
        console.error(`   3. 查找占用进程: netstat -ano | findstr :${PORT}`);
        process.exit(1);
    } else {
        throw err;
    }
});

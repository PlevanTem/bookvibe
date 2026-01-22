# ModelScope API 配置指南

## 问题说明

由于浏览器的 CORS 策略限制，前端无法直接调用 ModelScope API（因为需要自定义请求头 `X-ModelScope-Async-Mode`）。因此需要使用后端代理来解决这个问题。

## 解决方案

### 方案 1：使用后端代理（推荐）

1. **启动后端服务器**

   在项目根目录运行：
   ```bash
   node api-example.js
   ```

2. **配置环境变量**

   设置 ModelScope API Key：
   ```bash
   # Windows PowerShell
   $env:MODELSCOPE_API_KEY="ms-6718f25b-ad28-420a-9668-cbd6456c9759"
   $env:MODELSCOPE_MODEL="Tongyi-MAI/Z-Image-Turbo"
   
   # Windows CMD
   set MODELSCOPE_API_KEY=ms-6718f25b-ad28-420a-9668-cbd6456c9759
   set MODELSCOPE_MODEL=Tongyi-MAI/Z-Image-Turbo
   
   # Linux/Mac
   export MODELSCOPE_API_KEY="ms-6718f25b-ad28-420a-9668-cbd6456c9759"
   export MODELSCOPE_MODEL="Tongyi-MAI/Z-Image-Turbo"
   ```

   或者创建 `.env` 文件（如果使用 dotenv）：
   ```
   MODELSCOPE_API_KEY=ms-6718f25b-ad28-420a-9668-cbd6456c9759
   MODELSCOPE_MODEL=Tongyi-MAI/Z-Image-Turbo
   ```

3. **配置前端**

   在 `config.js` 中确保设置了后端代理 URL：
   ```javascript
   BACKEND_PROXY_URL: "/api/modelscope", // 或 "http://localhost:3000/api/modelscope"
   ```

4. **访问应用**

   确保前端页面和后端服务器在同一域名下，或者使用相对路径 `/api/modelscope`。

### 方案 2：修改后端代码直接配置（简单）

如果不想使用环境变量，可以直接在 `api-example.js` 中修改：

```javascript
const MODELSCOPE_API_KEY = process.env.MODELSCOPE_API_KEY || 'ms-6718f25b-ad28-420a-9668-cbd6456c9759';
const MODELSCOPE_MODEL = process.env.MODELSCOPE_MODEL || 'Tongyi-MAI/Z-Image-Turbo';
```

## 后端 API 端点

后端提供了两个 API 端点：

1. **创建生图任务**
   ```
   POST /api/modelscope/generate
   Body: {
     "prompt": "提示词",
     "model": "Tongyi-MAI/Z-Image-Turbo" // 可选
   }
   Response: {
     "task_id": "任务ID"
   }
   ```

2. **查询任务状态**
   ```
   GET /api/modelscope/task/:taskId
   Response: {
     "task_status": "SUCCEED|FAILED|PENDING|RUNNING",
     "output_images": ["图片URL"]
   }
   ```

## 故障排查

### 1. CORS 错误

如果仍然遇到 CORS 错误，检查：
- 后端服务器是否正在运行
- `BACKEND_PROXY_URL` 配置是否正确
- 后端 CORS 配置是否正确

### 2. API Key 错误

检查：
- 环境变量是否正确设置
- API Key 是否有效
- 后端日志中的错误信息

### 3. 任务创建失败

检查：
- ModelScope API Key 是否有效
- 模型名称是否正确
- 网络连接是否正常

## 测试

启动后端服务器后，可以测试 API：

```bash
# 创建任务
curl -X POST http://localhost:3000/api/modelscope/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A golden cat"}'

# 查询任务状态（替换 TASK_ID）
curl http://localhost:3000/api/modelscope/task/TASK_ID
```

## 注意事项

1. **安全性**：不要在前端代码中暴露 API Key，始终使用后端代理
2. **性能**：ModelScope API 是异步的，需要轮询任务状态
3. **超时**：默认最多轮询 60 次（5分钟），如果任务超时，会返回错误

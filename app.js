// BookVibe - 核心逻辑
// 用一张卡片，连接文字与远方

// ===================== API 配置 =====================
// ⚠️ 重要：实际配置请在 config.js 中设置
// 这里的配置仅作为默认值，会被 config.js 中的 window.BOOKVIBE_CONFIG 覆盖
const CONFIG = {
    // 1. LLM API配置 (用于生成 地点+原文Quote)
    LLM_API_KEY: "", // 请在 config.js 中配置
    LLM_MODEL: "GLM-4",
    LLM_API_URL: "https://open.bigmodel.cn/api/paas/v4/chat/completions", // 智谱AI API 端点
    
    // 2. AIGC 生图API配置 (用于虚构地点生成图片，可选)
    // 注意：如果不配置 AIGC_API_KEY，系统会自动使用免费的 Pollinations.ai 服务
    AIGC_API_KEY: "", // 请在 config.js 中配置（可选，不配置则使用免费服务）
    AIGC_API_URL: "https://api-inference.modelscope.cn/v1/images/generations", // ModelScope 或 OpenAI API
    AIGC_MODEL: "Tongyi-MAI/Z-Image-Turbo", // ModelScope Model-Id 或 "dall-e-3"
    AIGC_API_TYPE: "modelscope", // "modelscope" 或 "openai"
    
    // 3. 图片搜索API配置 (用于真实地点搜索图片)
    IMAGE_API_TYPE: "picsum", // "picsum" (免费), "pexels", "unsplash"
    PEXELS_API_URL: "https://api.pexels.com/v1/search",
    PEXELS_API_KEY: "", // 请在 config.js 中配置（可选）
    UNSPLASH_API_URL: "https://api.unsplash.com/search/photos",
    UNSPLASH_API_KEY: "", // 请在 config.js 中配置（可选）
    
    // 后端代理配置（用于避免 CORS 问题）
    BACKEND_PROXY_URL: "", // 后端代理 URL，例如: "/api/modelscope" 或 "http://localhost:3000/api/modelscope"
    
    // 其他配置
    IMAGE_PER_PLACE: 1,
    MIN_PLACES: 10,
    MAX_PLACES: 30,
};

class BookVibe {
    constructor() {
        this.cardsData = []; // 所有卡片数据
        this.currentIndex = 0; // 当前显示的卡片索引
        this.isSwitching = false; // 是否正在切换
        this.currentMode = 'book'; // 当前模式：'book' 或 'place'
        this.checkinStatus = {}; // 打卡状态 {location: {checked: bool, note: string}}
        
        // 合并用户配置（优先级：localStorage > config.js > 默认值）
        // 1. 先从 localStorage 读取用户配置
        this.loadUserConfig();
        
        // 2. 再从 config.js 读取配置（如果 localStorage 中没有）
        if (window.BOOKVIBE_CONFIG) {
            Object.assign(CONFIG, window.BOOKVIBE_CONFIG);
        }
        
        // 规范化 AIGC_API_TYPE（转换为小写，确保大小写不敏感）
        if (CONFIG.AIGC_API_TYPE) {
            CONFIG.AIGC_API_TYPE = CONFIG.AIGC_API_TYPE.toLowerCase().trim();
        }
        
        // 规范化 BACKEND_PROXY_URL（确保以 / 开头，如果是相对路径）
        if (CONFIG.BACKEND_PROXY_URL && !CONFIG.BACKEND_PROXY_URL.startsWith('http')) {
            // 相对路径，确保以 / 开头
            if (!CONFIG.BACKEND_PROXY_URL.startsWith('/')) {
                CONFIG.BACKEND_PROXY_URL = '/' + CONFIG.BACKEND_PROXY_URL;
            }
        }
        
        // 初始化时打印配置信息（用于调试）
        console.log('📋 BookVibe 配置已加载:', {
            LLM_API_KEY: CONFIG.LLM_API_KEY ? CONFIG.LLM_API_KEY.substring(0, 10) + '...' : '未配置',
            LLM_MODEL: CONFIG.LLM_MODEL,
            AIGC_API_KEY: CONFIG.AIGC_API_KEY ? CONFIG.AIGC_API_KEY.substring(0, 10) + '...' : '未配置',
            AIGC_API_TYPE: CONFIG.AIGC_API_TYPE || '未配置',
            AIGC_API_URL: CONFIG.AIGC_API_URL,
            AIGC_MODEL: CONFIG.AIGC_MODEL,
            IMAGE_API_TYPE: CONFIG.IMAGE_API_TYPE
        });
        
        // 检查必要的 API 配置
        this.checkAPIConfig();
        
        // 加载打卡状态
        this.loadCheckinStatus();
        
        this.init();
    }
    
    checkAPIConfig() {
        const missingAPIs = [];
        
        if (!CONFIG.LLM_API_KEY) {
            missingAPIs.push('LLM_API_KEY (用于提取地点和quote)');
        }
        
        // AIGC API 是可选的（仅用于虚构地点）
        // 图片搜索 API 有免费备选方案
        
        if (missingAPIs.length > 0) {
            console.warn('⚠️ 缺少必要的 API 配置:', missingAPIs.join(', '));
            console.warn('💡 请点击右上角的设置按钮配置 API keys');
            
            // 在界面上显示提示
            this.showConfigPrompt();
        }
        
        // 检查 AIGC API 配置
        if (CONFIG.AIGC_API_KEY && CONFIG.AIGC_API_KEY.trim() !== '') {
            const apiType = (CONFIG.AIGC_API_TYPE || 'openai').toLowerCase().trim();
            if (apiType === 'modelscope') {
                // 验证 ModelScope 配置
                if (!CONFIG.AIGC_MODEL || CONFIG.AIGC_MODEL.trim() === '') {
                    console.warn('⚠️ ModelScope API 已配置，但 AIGC_MODEL 未设置，将使用默认模型');
                }
                if (!CONFIG.AIGC_API_URL || !CONFIG.AIGC_API_URL.includes('modelscope')) {
                    console.warn('⚠️ ModelScope API 已配置，但 AIGC_API_URL 可能不正确:', CONFIG.AIGC_API_URL);
                }
                
                // 检查后端代理配置
                const backendProxyUrl = CONFIG.BACKEND_PROXY_URL || '';
                if (!backendProxyUrl || backendProxyUrl.trim() === '') {
                    console.error('❌ ModelScope API 需要后端代理，但 BACKEND_PROXY_URL 未配置！');
                    console.error('💡 请在 config.js 中设置: BACKEND_PROXY_URL: "/api/modelscope"');
                    console.error('💡 并确保后端服务器正在运行: node api-example.js');
                } else {
                    console.log('✅ ModelScope API 配置完整:', {
                        model: CONFIG.AIGC_MODEL || 'Tongyi-MAI/Z-Image-Turbo (默认)',
                        apiUrl: CONFIG.AIGC_API_URL,
                        apiKeyPrefix: CONFIG.AIGC_API_KEY.substring(0, 10) + '...',
                        backendProxy: backendProxyUrl
                    });
                    console.log('💡 请确保后端服务器正在运行: node api-example.js');
                }
            } else {
                console.log('✅ OpenAI DALL-E API 已配置:', {
                    model: CONFIG.AIGC_MODEL,
                    apiUrl: CONFIG.AIGC_API_URL
                });
            }
        } else {
            console.log('ℹ️ 未配置 AIGC_API_KEY，将使用免费的 Pollinations.ai 服务');
        }
    }
    
    init() {
        // DOM 元素
        this.inputScreen = document.getElementById('input-screen');
        this.loadingScreen = document.getElementById('loading-screen');
        this.resultScreen = document.getElementById('result-screen');
        this.bookInput = document.getElementById('book-input');
        this.submitBtn = document.getElementById('submit-btn');
        this.errorMessage = document.getElementById('error-message');
        this.backBtn = document.getElementById('back-btn');
        
        // 结果页元素
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.mainCard = document.getElementById('main-card');
        this.filmstrip = document.getElementById('filmstrip');
        
        // 模式切换按钮
        this.modeBookBtn = document.getElementById('mode-book');
        this.modePlaceBtn = document.getElementById('mode-place');
        
        // 地点模式相关元素
        this.worksGridContainer = document.getElementById('works-grid-container');
        this.quoteSectionBookMode = document.getElementById('quote-section-book-mode');
        this.filterButtons = document.getElementById('filter-buttons');
        this.checkinBtn = document.getElementById('checkin-btn');
        this.noteBtn = document.getElementById('note-btn');
        
        // 配置界面元素
        this.settingsBtn = document.getElementById('settings-btn');
        this.configModal = document.getElementById('config-modal');
        this.configCloseBtn = document.getElementById('config-close-btn');
        this.configSaveBtn = document.getElementById('config-save-btn');
        this.configResetBtn = document.getElementById('config-reset-btn');
        
        // 事件监听
        this.submitBtn.addEventListener('click', () => this.handleSubmit());
        this.bookInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSubmit();
        });
        
        this.backBtn.addEventListener('click', () => this.reset());
        this.prevBtn.addEventListener('click', () => this.prevCard());
        this.nextBtn.addEventListener('click', () => this.nextCard());
        
        // 模式切换
        if (this.modeBookBtn) {
            this.modeBookBtn.addEventListener('click', () => this.switchMode('book'));
        }
        if (this.modePlaceBtn) {
            this.modePlaceBtn.addEventListener('click', () => this.switchMode('place'));
        }
        
        // 地点模式功能
        if (this.filterButtons) {
            this.filterButtons.addEventListener('click', (e) => {
                if (e.target.classList.contains('filter-btn')) {
                    this.handleFilter(e.target.dataset.filter);
                }
            });
        }
        
        // 可折叠信息
        const expandKnowledge = document.getElementById('expand-knowledge');
        const expandTips = document.getElementById('expand-tips');
        if (expandKnowledge) {
            expandKnowledge.addEventListener('click', () => this.toggleExpand('knowledge'));
        }
        if (expandTips) {
            expandTips.addEventListener('click', () => this.toggleExpand('tips'));
        }
        
        // 打卡和笔记
        if (this.checkinBtn) {
            this.checkinBtn.addEventListener('click', () => this.toggleCheckin());
        }
        if (this.noteBtn) {
            this.noteBtn.addEventListener('click', () => this.showNoteDialog());
        }
        
        // 调试信息切换按钮
        const toggleDebugBtn = document.getElementById('toggle-debug-btn');
        if (toggleDebugBtn) {
            toggleDebugBtn.addEventListener('click', () => this.toggleDebugInfo());
        }
        
        // 配置界面（延迟绑定，确保 DOM 完全加载）
        setTimeout(() => {
            // 重新获取元素，确保在生产环境中也能找到
            if (!this.settingsBtn) {
                this.settingsBtn = document.getElementById('settings-btn');
            }
            if (!this.configModal) {
                this.configModal = document.getElementById('config-modal');
            }
            if (!this.configCloseBtn) {
                this.configCloseBtn = document.getElementById('config-close-btn');
            }
            if (!this.configSaveBtn) {
                this.configSaveBtn = document.getElementById('config-save-btn');
            }
            if (!this.configResetBtn) {
                this.configResetBtn = document.getElementById('config-reset-btn');
            }
            
            if (this.settingsBtn) {
                // 移除旧的事件监听器（如果存在）
                const newSettingsBtn = this.settingsBtn.cloneNode(true);
                this.settingsBtn.parentNode.replaceChild(newSettingsBtn, this.settingsBtn);
                this.settingsBtn = newSettingsBtn;
                
                this.settingsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔧 设置按钮被点击');
                    this.showConfigModal();
                });
            } else {
                console.warn('⚠️ 设置按钮未找到，ID: settings-btn');
            }
            
            if (this.configCloseBtn) {
                this.configCloseBtn.addEventListener('click', () => this.hideConfigModal());
            }
            if (this.configModal) {
                this.configModal.addEventListener('click', (e) => {
                    if (e.target === this.configModal || e.target.classList.contains('config-modal-overlay')) {
                        this.hideConfigModal();
                    }
                });
            }
            if (this.configSaveBtn) {
                this.configSaveBtn.addEventListener('click', () => this.saveConfig());
            }
            if (this.configResetBtn) {
                this.configResetBtn.addEventListener('click', () => this.resetConfig());
            }
        }, 100);
        if (this.configCloseBtn) {
            this.configCloseBtn.addEventListener('click', () => this.hideConfigModal());
        }
        if (this.configModal) {
            this.configModal.addEventListener('click', (e) => {
                if (e.target === this.configModal || e.target.classList.contains('config-modal-overlay')) {
                    this.hideConfigModal();
                }
            });
        }
        if (this.configSaveBtn) {
            this.configSaveBtn.addEventListener('click', () => this.saveConfig());
        }
        if (this.configResetBtn) {
            this.configResetBtn.addEventListener('click', () => this.resetConfig());
        }
        
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (this.resultScreen.classList.contains('hidden')) return;
            
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.prevCard();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextCard();
            }
        });
        
        // 聚焦输入框
        this.bookInput.focus();
        
        // 调试：检查设置按钮
        setTimeout(() => {
            const btn = document.getElementById('settings-btn');
            if (btn) {
                console.log('✅ 设置按钮已找到:', btn);
                console.log('   位置:', btn.getBoundingClientRect());
                console.log('   z-index:', window.getComputedStyle(btn).zIndex);
            } else {
                console.error('❌ 设置按钮未找到');
            }
        }, 100);
    }
    
    /**
     * 切换模式
     */
    switchMode(mode) {
        // 如果模式没有变化，不执行任何操作
        if (this.currentMode === mode) return;
        
        // 清理之前的数据和UI
        this.clearPreviousResults();
        
        this.currentMode = mode;
        
        // 更新按钮状态
        if (this.modeBookBtn && this.modePlaceBtn) {
            if (mode === 'book') {
                this.modeBookBtn.classList.add('active');
                this.modePlaceBtn.classList.remove('active');
                if (this.bookInput) {
                    this.bookInput.placeholder = '输入书名，如《挪威的森林》';
                }
            } else {
                this.modeBookBtn.classList.remove('active');
                this.modePlaceBtn.classList.add('active');
                if (this.bookInput) {
                    this.bookInput.placeholder = '输入地点，如"大理"或"大理,丽江,香格里拉"';
                }
            }
        }
        
        // 切换模式时回到输入界面
        this.showInput();
    }
    
    /**
     * 清理之前的结果数据
     */
    clearPreviousResults() {
        // 清理数据
        this.cardsData = [];
        this.currentIndex = 0;
        this.isSwitching = false;
        
        // 清理胶卷带
        if (this.filmstrip) {
            this.filmstrip.innerHTML = '';
        }
        
        // 清理主卡片内容
        const locationBadge = document.getElementById('location-badge');
        const locationTitle = document.getElementById('location-title');
        const quoteTextMain = document.getElementById('quote-text-main');
        const quoteSource = document.getElementById('quote-source');
        const mainCardImage = document.getElementById('main-card-image');
        
        if (locationBadge) locationBadge.textContent = '';
        if (locationTitle) locationTitle.textContent = '';
        if (quoteTextMain) quoteTextMain.textContent = '';
        if (quoteSource) quoteSource.textContent = '';
        if (mainCardImage) {
            mainCardImage.style.backgroundImage = '';
        }
        
        // 清理作品网格（地点模式）
        const worksGrid = document.getElementById('works-grid');
        if (worksGrid) {
            worksGrid.innerHTML = '';
        }
        
        // 隐藏地点模式相关元素
        if (this.worksGridContainer) {
            this.worksGridContainer.classList.add('hidden');
        }
        if (this.quoteSectionBookMode) {
            this.quoteSectionBookMode.classList.remove('hidden');
        }
        
        // 隐藏所有操作按钮
        const googleBtn = document.getElementById('google-search-btn');
        if (googleBtn) googleBtn.classList.add('hidden');
        if (this.checkinBtn) this.checkinBtn.classList.add('hidden');
        if (this.noteBtn) this.noteBtn.classList.add('hidden');
        
        // 重置筛选按钮
        if (this.filterButtons) {
            const filterBtns = this.filterButtons.querySelectorAll('.filter-btn');
            filterBtns.forEach(btn => {
                if (btn.dataset.filter === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        // 重置可折叠内容
        const knowledgeContent = document.getElementById('knowledge-content');
        const tipsContent = document.getElementById('tips-content');
        if (knowledgeContent) {
            knowledgeContent.textContent = '';
            knowledgeContent.classList.remove('expanded');
        }
        if (tipsContent) {
            tipsContent.textContent = '';
            tipsContent.classList.remove('expanded');
        }
        
        // 更新计数器
        this.updateCounter();
    }
    
    async handleSubmit() {
        const inputValue = this.bookInput.value.trim();
        
        if (!inputValue) {
            this.showError(this.currentMode === 'book' ? '请输入书名' : '请输入地点');
            return;
        }
        
        // 显示加载界面
        this.showLoading();
        
        try {
            if (this.currentMode === 'book') {
                // 作品模式：原有逻辑
                await this.fetchBookDataStreaming(inputValue);
            } else {
                // 地点模式：新逻辑
                await this.fetchPlaceDataStreaming(inputValue);
            }
            
        } catch (error) {
            console.error('Error:', error);
            this.showError(error.message || (this.currentMode === 'book' ? '这本书太神秘，我们的旅行家迷路了。' : '这个地方太神秘，我们的旅行家迷路了。'));
            this.showInput();
        }
    }
    
    /**
     * 流式获取数据并显示（改进版 - 并行加载图片）
     */
    async fetchBookDataStreaming(bookName) {
        try {
            // 清理之前的结果
            this.clearPreviousResults();
            
            // Step 1: 调用 GLM API 提取多个地点和金句
            this.updateLoadingStatus('正在分析书籍内容...', 10);
            const placesData = await this.callGLMAPI(bookName);
            
            if (!placesData || !Array.isArray(placesData) || placesData.length === 0) {
                throw new Error('未提取到地点数据');
            }
            
            // LLM 生成完成，立即切换到结果界面
            this.loadingScreen.classList.add('hidden');
            
            // 立即创建所有地点的卡片数据（先不包含图片URL，后续会更新）
            const cardsData = placesData.map((place, i) => ({
                location: place.location,
                locationEn: place.locationEn || place.location,
                type: place.type || 'real',
                quote: place.quote,
                imageQuery: place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`,
                imageUrl: '', // 图片URL稍后更新
                bookTitle: bookName
            }));
            
            // 立即显示结果界面，显示所有地点的内容（图片稍后加载）
            this.showResult(cardsData, true); // 显示所有地点的内容，支持切换
            
            // 在 filmstrip 中为所有地点创建占位符
            placesData.forEach((place, i) => {
                this.addFilmstripPlaceholder(place, i);
            });
            
            // Step 2: 并行处理所有地点的图片搜索/生成（加快速度）
            const totalPlaces = placesData.length;
            let completedCount = 0;
            
            // 并行处理所有地点的图片
            const imagePromises = placesData.map(async (place, i) => {
                const imageQuery = place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`;
                const locationType = place.type || 'real';
                let imageUrl = null;
                
                // 获取对应的卡片数据引用
                const cardData = cardsData[i];
                
                try {
                    // 真实地点：搜索图片；虚构地点：使用AI生图（付费API → 免费AI生图 → 搜图）
                    if (locationType === 'fictional') {
                        // 虚构地点：尝试付费API → 免费AI生图 → 搜图（降级策略）
                        this.updateFilmstripPlaceholderStatus(i, 'AI生成中...');
                        
                        // Step 1: 尝试付费 API（如果配置了）
                        if (CONFIG.AIGC_API_KEY && CONFIG.AIGC_API_KEY.trim() !== '') {
                            const apiType = (CONFIG.AIGC_API_TYPE || 'openai').toLowerCase().trim();
                            const statusText = apiType === 'modelscope' ? 'ModelScope生成中...' : '付费API生成中...';
                            this.updateFilmstripPlaceholderStatus(i, statusText);
                            
                            try {
                                console.log(`🎨 [${place.location}] Step 1: 尝试付费 API 生成图片`);
                                imageUrl = await this.generateAIGCImage(imageQuery, 0, false); // false = 不降级到免费服务
                                console.log(`✅ [${place.location}] 付费 API 生成成功`);
                                // 成功：更新状态并刷新预览图
                                this.updateFilmstripPlaceholderStatus(i, '加载中...');
                                // 立即更新卡片数据并刷新预览
                                cardData.imageUrl = imageUrl;
                                this.updateFilmstripItem(cardData, i);
                                if (this.currentIndex === i) {
                                    this.updateMainCard();
                                }
                            } catch (error) {
                                console.warn(`⚠️ [${place.location}] Step 1 失败，降级到免费 AI 生图:`, error.message);
                                this.updateFilmstripPlaceholderStatus(i, '免费AI生成中...');
                                
                                // Step 2: 尝试免费 AI 生图
                                try {
                                    // 为免费 AI 生图添加延迟，避免触发速率限制
                                    const delay = 2000 + Math.random() * 3000; // 2-5秒随机延迟
                                    await new Promise(resolve => setTimeout(resolve, delay * i)); // 递增延迟
                                    
                                    console.log(`🎨 [${place.location}] Step 2: 尝试免费 AI 生图`);
                                    imageUrl = await this.generateAIGCImage(imageQuery, 0, true); // true = 使用免费服务
                                    console.log(`✅ [${place.location}] 免费 AI 生图成功`);
                                    // 成功：更新状态并刷新预览图
                                    this.updateFilmstripPlaceholderStatus(i, '加载中...');
                                    cardData.imageUrl = imageUrl;
                                    this.updateFilmstripItem(cardData, i);
                                    if (this.currentIndex === i) {
                                        this.updateMainCard();
                                    }
                                } catch (freeError) {
                                    console.warn(`⚠️ [${place.location}] Step 2 失败，降级到搜图:`, freeError.message);
                                    this.updateFilmstripPlaceholderStatus(i, '搜索图片中...');
                                    
                                    // Step 3: 最后尝试搜图
                                    try {
                                        console.log(`🔍 [${place.location}] Step 3: 尝试搜图`);
                                        imageUrl = await this.searchImage(imageQuery);
                                        console.log(`✅ [${place.location}] 搜图成功`);
                                        // 成功：更新状态并刷新预览图
                                        this.updateFilmstripPlaceholderStatus(i, '加载中...');
                                        cardData.imageUrl = imageUrl;
                                        this.updateFilmstripItem(cardData, i);
                                        if (this.currentIndex === i) {
                                            this.updateMainCard();
                                        }
                                    } catch (searchError) {
                                        console.error(`❌ [${place.location}] 所有方案都失败，使用备用图片`);
                                        this.updateFilmstripPlaceholderStatus(i, '加载失败');
                                        imageUrl = this.getFallbackImage(imageQuery);
                                        cardData.imageUrl = imageUrl;
                                        this.updateFilmstripItem(cardData, i);
                                        if (this.currentIndex === i) {
                                            this.updateMainCard();
                                        }
                                    }
                                }
                            }
                        } else {
                            // 未配置付费 API，直接使用免费 AI 生图
                            this.updateFilmstripPlaceholderStatus(i, '免费AI生成中...');
                            
                            // 为免费 AI 生图添加延迟，避免触发速率限制
                            const delay = 2000 + Math.random() * 3000; // 2-5秒随机延迟
                            await new Promise(resolve => setTimeout(resolve, delay * i)); // 递增延迟
                            
                            try {
                                console.log(`🎨 [${place.location}] 尝试免费 AI 生图`);
                                imageUrl = await this.generateAIGCImage(imageQuery, 0, true); // true = 使用免费服务
                                console.log(`✅ [${place.location}] 免费 AI 生图成功`);
                                // 成功：更新状态并刷新预览图
                                this.updateFilmstripPlaceholderStatus(i, '加载中...');
                                cardData.imageUrl = imageUrl;
                                this.updateFilmstripItem(cardData, i);
                                if (this.currentIndex === i) {
                                    this.updateMainCard();
                                }
                            } catch (freeError) {
                                console.warn(`⚠️ [${place.location}] 免费 AI 生图失败，降级到搜图:`, freeError.message);
                                this.updateFilmstripPlaceholderStatus(i, '搜索图片中...');
                                
                                // 降级到搜图
                                try {
                                    console.log(`🔍 [${place.location}] 尝试搜图`);
                                    imageUrl = await this.searchImage(imageQuery);
                                    console.log(`✅ [${place.location}] 搜图成功`);
                                    // 成功：更新状态并刷新预览图
                                    this.updateFilmstripPlaceholderStatus(i, '加载中...');
                                    cardData.imageUrl = imageUrl;
                                    this.updateFilmstripItem(cardData, i);
                                    if (this.currentIndex === i) {
                                        this.updateMainCard();
                                    }
                                } catch (searchError) {
                                    console.error(`❌ [${place.location}] 所有方案都失败，使用备用图片`);
                                    this.updateFilmstripPlaceholderStatus(i, '加载失败');
                                    imageUrl = this.getFallbackImage(imageQuery);
                                    cardData.imageUrl = imageUrl;
                                    this.updateFilmstripItem(cardData, i);
                                    if (this.currentIndex === i) {
                                        this.updateMainCard();
                                    }
                                }
                            }
                        }
                    } else {
                        // 真实地点搜索图片（可以并行，无速率限制问题）
                        this.updateFilmstripPlaceholderStatus(i, '搜索图片中...');
                        try {
                            imageUrl = await this.searchImage(imageQuery);
                            // 成功：更新状态并刷新预览图
                            this.updateFilmstripPlaceholderStatus(i, '加载中...');
                            cardData.imageUrl = imageUrl;
                            this.updateFilmstripItem(cardData, i);
                            if (this.currentIndex === i) {
                                this.updateMainCard();
                            }
                        } catch (error) {
                            console.warn(`⚠️ [${place.location}] 搜图失败，使用备用图片:`, error);
                            this.updateFilmstripPlaceholderStatus(i, '加载失败');
                            imageUrl = this.getFallbackImage(imageQuery);
                            cardData.imageUrl = imageUrl;
                            this.updateFilmstripItem(cardData, i);
                            if (this.currentIndex === i) {
                                this.updateMainCard();
                            }
                        }
                    }
                } catch (error) {
                    // 如果还没有设置 imageUrl，使用备用图片
                    if (!imageUrl) {
                        console.warn(`⚠️ 地点 ${place.location} 图片加载失败:`, error);
                        this.updateFilmstripPlaceholderStatus(i, '加载失败');
                        imageUrl = this.getFallbackImage(imageQuery);
                        cardData.imageUrl = imageUrl;
                        this.updateFilmstripItem(cardData, i);
                        if (this.currentIndex === i) {
                            this.updateMainCard();
                        }
                    }
                }
                
                // 确保 imageUrl 已设置到 cardData（在降级逻辑中已经设置并更新了预览）
                // 这里只做最终检查和进度更新
                if (!cardData.imageUrl && imageUrl) {
                    cardData.imageUrl = imageUrl;
                    this.updateFilmstripItem(cardData, i);
                    if (this.currentIndex === i) {
                        this.updateMainCard();
                    }
                }
                
                // 更新进度
                completedCount++;
                
                return cardData;
            });
            
            // 等待所有图片加载完成（使用 allSettled 确保即使部分失败也能继续）
            await Promise.allSettled(imagePromises);
            
            // 过滤掉 undefined（理论上不应该有，但为了安全）
            const finalCardsData = cardsData.filter(card => card !== undefined);
            
            // 更新所有数据（确保数据完整）
            this.cardsData = finalCardsData;
            if (this.currentIndex >= finalCardsData.length) {
                this.currentIndex = 0;
            }
            this.updateMainCard();
            this.updateFilmstripActive();
            this.updateCounter();
            
            this.currentData = finalCardsData;
            return finalCardsData;
            
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * 地点驱动的数据获取（流式）
     */
    async fetchPlaceDataStreaming(placeInput) {
        try {
            // 清理之前的结果
            this.clearPreviousResults();
            
            // 解析输入：单地点或多地点
            const places = placeInput.split(/[,，]/).map(p => p.trim()).filter(p => p);
            
            if (places.length === 0) {
                throw new Error('请输入有效的地点');
            }
            
            // Step 1: 调用 LLM API 提取地点相关作品和quote
            this.updateLoadingStatus('正在分析地点故事...', 10);
            const placesData = await this.callPlaceGLMAPI(places);
            
            if (!placesData || !Array.isArray(placesData) || placesData.length === 0) {
                throw new Error('未提取到地点数据');
            }
            
            // LLM 生成完成，立即切换到结果界面
            this.loadingScreen.classList.add('hidden');
            
            // 立即创建所有地点的卡片数据（先不包含图片URL，后续会更新）
            const cardsData = placesData.map((place, i) => ({
                location: place.location,
                locationEn: place.locationEn || place.location,
                type: 'real', // 地点模式默认都是真实地点
                works: place.works || [], // Top3作品列表
                imageQuery: place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`,
                imageUrl: '', // 图片URL稍后更新
                knowledge: place.knowledge || '', // 地点小知识
                tips: place.tips || '', // 打卡小贴士
                recommendedPlaces: place.recommendedPlaces || null, // 推荐地点组合
                mode: 'place' // 标记为地点模式
            }));
            
            // 立即显示结果界面
            this.showResult(cardsData, true);
            
            // 在 filmstrip 中为所有地点创建占位符
            placesData.forEach((place, i) => {
                this.addFilmstripPlaceholder(place, i);
            });
            
            // Step 2: 并行处理所有地点的图片搜索
            const imagePromises = placesData.map(async (place, i) => {
                const imageQuery = place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`;
                const cardData = cardsData[i];
                
                try {
                    this.updateFilmstripPlaceholderStatus(i, '搜索图片中...');
                    const imageUrl = await this.searchImage(imageQuery);
                    this.updateFilmstripPlaceholderStatus(i, '加载中...');
                    cardData.imageUrl = imageUrl;
                    this.updateFilmstripItem(cardData, i);
                    if (this.currentIndex === i) {
                        this.updateMainCard();
                    }
                } catch (error) {
                    console.warn(`⚠️ [${place.location}] 搜图失败，使用备用图片:`, error);
                    this.updateFilmstripPlaceholderStatus(i, '加载失败');
                    const imageUrl = this.getFallbackImage(imageQuery);
                    cardData.imageUrl = imageUrl;
                    this.updateFilmstripItem(cardData, i);
                    if (this.currentIndex === i) {
                        this.updateMainCard();
                    }
                }
                
                return cardData;
            });
            
            await Promise.allSettled(imagePromises);
            
            const finalCardsData = cardsData.filter(card => card !== undefined);
            this.cardsData = finalCardsData;
            if (this.currentIndex >= finalCardsData.length) {
                this.currentIndex = 0;
            }
            this.updateMainCard();
            this.updateFilmstripActive();
            this.updateCounter();
            
            this.currentData = finalCardsData;
            return finalCardsData;
            
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * 调用 LLM API 从地点提取相关作品和quote
     */
    async callPlaceGLMAPI(places) {
        if (!CONFIG.LLM_API_KEY) {
            // 显示配置提示
            this.showConfigPrompt();
            throw new Error('LLM_API_KEY 未配置，请点击右上角设置按钮配置 API Key');
        }
        
        const isMultiple = places.length > 1;
        const placesStr = places.join('、');
        
        // 如果是单个地点，询问是否推荐相关地点组合
        let recommendPrompt = '';
        if (!isMultiple) {
            recommendPrompt = `\n8. 如果该地点有同氛围感的相关地点组合（如"大理"可推荐"大理+丽江+香格里拉"），请在返回的JSON中添加"recommendedPlaces"字段，值为推荐的地点名称数组（最多3个），如果没有则不添加此字段。`;
        }
        
        const prompt = `你是一位文学评论家和旅行家。请为${isMultiple ? '以下地点' : '地点"'}${placesStr}${isMultiple ? '"' : ''}，完成以下要求，严格按照JSON格式返回，不要任何多余文字：

1. ${isMultiple ? '为每个地点' : ''}识别与该地点相关的**Top3作品**（可以是书籍、电影、诗词、散文等），按「经典度 + 贴合度」分层：
   - Top1：国民级经典（如北京故宫→《故宫博物院》课文/《我在故宫修文物》）
   - Top2：文艺向经典（如厦门鼓浪屿→舒婷的诗词）
   - Top3：小众宝藏（如某小众古镇→当地作家的散文）
2. 为每个作品从原文中quote一段描写该地点或体现该地点情绪的**原文段落**（中文作品用中文，英文作品用英文，50-100字）
3. 为每个作品标注类型：poetry（诗词）、prose（散文）、novel（小说）、movie（电影）
4. 为每个作品标注quote风格：healing（治愈）、bold（豪迈）、literary（文艺）、niche（小众）
5. 生成用于搜索最符合该地点特色的图片搜索关键词（外国地点用英文，中国地点用中文）
6. 提供地点小知识（quote的创作背景等，50-100字）
7. 提供打卡小贴士（最佳拍摄时间、角度等，30-50字）${recommendPrompt}

${isMultiple ? '以 JSON 数组格式返回，每个地点一个对象：' : '以 JSON 对象格式返回：'}
${isMultiple ? '[' : ''}
{
    "location": "${isMultiple ? '地点中文名' : places[0]}",
    "locationEn": "${isMultiple ? '地点英文名' : places[0]}",
    "works": [
        {
            "title": "作品1名称",
            "author": "作者/导演名",
            "type": "poetry|prose|novel|movie",
            "quote": "原文段落（50-100字）",
            "quoteStyle": "healing|bold|literary|niche",
            "tier": 1
        },
        {
            "title": "作品2名称",
            "author": "作者/导演名",
            "type": "poetry|prose|novel|movie",
            "quote": "原文段落（50-100字）",
            "quoteStyle": "healing|bold|literary|niche",
            "tier": 2
        },
        {
            "title": "作品3名称",
            "author": "作者/导演名",
            "type": "poetry|prose|novel|movie",
            "quote": "原文段落（50-100字）",
            "quoteStyle": "healing|bold|literary|niche",
            "tier": 3
        }
    ],
    "imageQuery": "搜索关键词",
    "knowledge": "地点小知识（50-100字）",
    "tips": "打卡小贴士（30-50字）"${!isMultiple ? ',\n    "recommendedPlaces": ["相关地点1", "相关地点2"] // 可选，同氛围感的地点组合' : ''}
}${isMultiple ? ', ...]' : ''}

如果地点不存在或无法识别，返回空数组 []`;

        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (CONFIG.LLM_API_URL.includes('bigmodel.cn')) {
            headers['Authorization'] = `Bearer ${CONFIG.LLM_API_KEY}`;
        } else {
            headers['Authorization'] = `Bearer ${CONFIG.LLM_API_KEY}`;
        }
        
        console.log('调用地点模式 LLM API:', {
            url: CONFIG.LLM_API_URL,
            model: CONFIG.LLM_MODEL,
            places: places
        });
        
        const response = await fetch(CONFIG.LLM_API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: CONFIG.LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: '你是一位专业的文学评论家和旅行家，擅长从地点提取相关作品和经典句子。请严格按照JSON格式返回，不要任何多余文字。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 3000
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `LLM API 请求失败: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        let content;
        if (data.choices && data.choices[0] && data.choices[0].message) {
            content = data.choices[0].message.content.trim();
        } else if (data.data && data.data.choices && data.data.choices[0]) {
            content = data.data.choices[0].message.content.trim();
        } else if (typeof data === 'string') {
            content = data.trim();
        } else {
            console.error('API 响应格式异常:', data);
            throw new Error('API 返回格式不正确，请检查 API 配置');
        }
        
        let jsonStr = content;
        if (content.includes('```json')) {
            const match = content.match(/```json\n([\s\S]*?)\n```/);
            if (match) jsonStr = match[1];
        } else if (content.includes('```')) {
            const match = content.match(/```\n([\s\S]*?)\n```/);
            if (match) jsonStr = match[1];
        }
        
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
            jsonStr = JSON.parse(jsonStr);
        }
        
        jsonStr = this.fixJSONString(jsonStr);
        
        try {
            const result = JSON.parse(jsonStr);
            
            // 确保返回数组格式
            if (!Array.isArray(result)) {
                return [result];
            }
            
            return result;
        } catch (error) {
            console.error('JSON 解析失败:', error);
            console.error('原始内容前500字符:', content.substring(0, 500));
            throw new Error(`JSON解析失败: ${error.message}。请检查API返回的格式是否正确。`);
        }
    }
    
    /**
     * 原有的 fetchBookData 方法（保留用于降级方案）
     */
    async fetchBookData(bookName) {
        // 优先尝试直接调用 LLM API（前端直连）
        try {
            // Step 1: 调用 GLM API 提取多个地点和金句
            const placesData = await this.callGLMAPI(bookName);
            
            if (!placesData || !Array.isArray(placesData) || placesData.length === 0) {
                throw new Error('未提取到地点数据');
            }
            
            // Step 2: 为每个地点搜索图片（并行加载）
            const cardsData = await Promise.all(
                placesData.map(async (place) => {
                    const imageQuery = place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`;
                    const locationType = place.type || 'real'; // 默认为真实地点
                    let imageUrl;
                    
                    try {
                        // 真实地点：搜索图片；虚构地点：使用AI生图（付费API或免费服务）
                        if (locationType === 'fictional') {
                            // 虚构地点优先使用AI生图（如果配置了付费API则使用付费，否则使用免费的Pollinations.ai）
                            console.log(`🎨 使用AI生图 - 地点: ${place.location}, 关键词: ${imageQuery}`);
                            imageUrl = await this.generateAIGCImage(imageQuery);
                        } else {
                            // 真实地点搜索图片
                            console.log(`🔍 搜索图片 - 地点: ${place.location}, 关键词: ${imageQuery}, API类型: ${CONFIG.IMAGE_API_TYPE || 'picsum'}`);
                            imageUrl = await this.searchImage(imageQuery);
                            console.log(`✅ 图片搜索成功 - 地点: ${place.location}, URL: ${imageUrl}`);
                        }
                    } catch (error) {
                        // 如果图片加载失败，使用备用图片
                        console.warn(`⚠️ 地点 ${place.location} 图片加载失败:`, error);
                        console.warn(`   使用备用图片，关键词: ${imageQuery}`);
                        imageUrl = this.getFallbackImage(imageQuery);
                    }
                    
                    return {
                        location: place.location,
                        locationEn: place.locationEn || place.location,
                        type: locationType,
                        quote: place.quote,
                        imageQuery: imageQuery,
                        imageUrl: imageUrl,
                        bookTitle: bookName
                    };
                })
            );
            
            return cardsData;
            
        } catch (error) {
            console.error('LLM API 调用失败:', error);
            console.error('错误详情:', {
                message: error.message,
                stack: error.stack,
                config: {
                    apiUrl: CONFIG.LLM_API_URL,
                    hasApiKey: !!CONFIG.LLM_API_KEY,
                    model: CONFIG.LLM_MODEL
                }
            });
            
            // 降级方案1: 尝试后端 API
            const config = window.BOOKVIBE_CONFIG || {};
            const API_ENDPOINT = config.API_URL || '/api/generate';
            
            if (API_ENDPOINT !== '/api/generate') {
                try {
                    const response = await fetch(API_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ bookName })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // 如果后端返回的是单个对象，转换为数组
                        return Array.isArray(data) ? data : [data];
                    }
                } catch (e) {
                    console.warn('后端 API 也失败:', e);
                }
            }
            
            // 降级方案2: 使用模拟数据（并行加载）
            console.warn('使用模拟数据作为降级方案');
            this.updateLoadingStatus('使用示例数据...', 20);
            const mockData = this.getMockData(bookName);
            
            // 立即显示结果界面，并在 filmstrip 中创建所有占位符
            this.showResult([], true);
            
            // 在 filmstrip 中为所有地点创建占位符
            mockData.forEach((place, i) => {
                this.addFilmstripPlaceholder(place, i);
            });
            
            // 并行处理所有地点的图片
            const cardsData = new Array(mockData.length);
            let completedCount = 0;
            
            const imagePromises = mockData.map(async (place, i) => {
                if (!place.imageUrl) {
                    const imageQuery = place.imageQuery || `${place.locationEn || place.location} atmospheric cinematic`;
                    place.imageUrl = this.getFallbackImage(imageQuery);
                }
                
                const cardData = {
                    ...place,
                    bookTitle: bookName
                };
                
                cardsData[i] = cardData;
                
                // 更新 filmstrip 项
                this.updateFilmstripItem(cardData, i);
                
                completedCount++;
                const progress = 20 + Math.floor((completedCount / mockData.length) * 70);
                this.updateLoadingStatus(`正在准备图片... (${completedCount}/${mockData.length})`, progress);
                
                // 如果有数据，立即显示第一个卡片
                if (completedCount === 1 && cardsData[0]) {
                    this.cardsData = [cardsData[0]];
                    this.currentIndex = 0;
                    this.updateMainCard();
                    this.updateFilmstripActive();
                    this.updateCounter();
                }
                
                return cardData;
            });
            
            await Promise.allSettled(imagePromises);
            
            const finalCardsData = cardsData.filter(card => card !== undefined);
            
            // 更新所有数据
            this.cardsData = finalCardsData;
            if (this.currentIndex >= finalCardsData.length) {
                this.currentIndex = 0;
            }
            this.updateMainCard();
            this.updateFilmstripActive();
            this.updateCounter();
            
            this.updateLoadingStatus('完成！', 100);
            setTimeout(() => {
                this.loadingScreen.classList.add('hidden');
            }, 500);
            
            this.currentData = finalCardsData;
            return finalCardsData;
        }
    }
    
    /**
     * 修复JSON字符串中的常见问题
     */
    fixJSONString(jsonStr) {
        if (!jsonStr || typeof jsonStr !== 'string') {
            return jsonStr;
        }
        
        // 1. 移除单行注释（// 开头的行，但不在字符串内）
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        
        // 2. 移除多行注释（/* ... */）
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 3. 修复尾随逗号（在对象和数组的最后一项后）
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        
        // 4. 修复字符串中的换行符（转义未转义的换行符）
        // 先标记所有转义的字符
        jsonStr = jsonStr.replace(/\\(.)/g, (match, char) => {
            return `\u0002${char.charCodeAt(0)}\u0002`;
        });
        
        // 修复字符串中的未转义换行符
        let inString = false;
        let result = '';
        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];
            const prevChar = i > 0 ? jsonStr[i - 1] : '';
            
            if (char === '"' && prevChar !== '\\') {
                inString = !inString;
            }
            
            // 如果遇到未转义的换行符且在字符串内，转义它
            if (char === '\n' && inString && prevChar !== '\\') {
                result += '\\n';
            } else {
                result += char;
            }
        }
        jsonStr = result;
        
        // 恢复转义的字符
        jsonStr = jsonStr.replace(/\u0002(\d+)\u0002/g, (match, code) => {
            return '\\' + String.fromCharCode(parseInt(code));
        });
        
        // 5. 修复属性名未加引号的情况（更安全的处理）
        // 匹配: { key: 或 , key: 但不在字符串内
        jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, (match, prefix, key) => {
            // 检查是否在字符串内（简单检查）
            const beforeMatch = jsonStr.substring(0, jsonStr.indexOf(match));
            const openQuotes = (beforeMatch.match(/"/g) || []).length;
            if (openQuotes % 2 === 0) {
                // 不在字符串内，添加引号
                return `${prefix}"${key}":`;
            }
            return match;
        });
        
        // 6. 修复单引号字符串为双引号（更安全的处理）
        // 只替换看起来像字符串的单引号（在冒号后或逗号后）
        jsonStr = jsonStr.replace(/([{,]\s*"[^"]*"\s*:\s*)'([^']*)'/g, '$1"$2"');
        
        // 7. 修复控制字符和特殊字符（保留转义字符）
        jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ''); // 移除控制字符，但保留已转义的
        
        // 8. 修复多个连续的逗号
        jsonStr = jsonStr.replace(/,+/g, ',');
        
        // 9. 修复对象/数组之间的多余逗号
        jsonStr = jsonStr.replace(/,\s*}/g, '}');
        jsonStr = jsonStr.replace(/,\s*]/g, ']');
        
        // 10. 移除多余的空白字符
        jsonStr = jsonStr.trim();
        
        return jsonStr;
    }
    
    /**
     * 调用 LLM API 提取多个地点和金句
     */
    async callGLMAPI(bookName) {
        if (!CONFIG.LLM_API_KEY) {
            // 显示配置提示
            this.showConfigPrompt();
            throw new Error('LLM_API_KEY 未配置，请点击右上角设置按钮配置 API Key');
        }
        
        const prompt = `你是一位文学评论家和旅行家。请为作品《${bookName}》，完成以下要求，严格按照JSON格式返回，不要任何多余文字：

1. 识别作品中**最经典/代表性/最具氛围感**的${CONFIG.MIN_PLACES}-${CONFIG.MAX_PLACES}个POI（可以是真实地点或虚构地点）
2. 为每个地点判断是"真实地点"还是"虚构地点"，真实地点是指现实中存在的地理位置，虚构地点是指作品中创造的地点
3. 为每个地点从作品（书籍-原文/电影-台词）中quote一段描写该地点或体现该地点情绪的**原文段落**（中文书籍用中文，英文书籍用英文，80-150字）
4. 根据地点类型（真实/虚拟），真实地点则生成用于搜索最符合该POI特色的图片搜索关键词（外国作品，用英文搜索词，中国作品，则用中文搜索词）；虚拟地点，则生成用于AI生图的提示词（提示词充分反映地点画面、特征、氛围、情绪等）；
5. 要求地点不能重复、细节深入一点、不要出现太大颗粒度（现市、国家）信息、越多越好
6. 地点顺序排列，贴合作品的逻辑：比如游记类作品按「行程顺序」排，诗歌 / 散文按「意象递进」排，小说按「情节场景」排序

以 JSON 数组格式返回：
[
    {
        "location": "地点1中文名",
        "locationEn": "地点1英文名",
        "type": "real" 或 "fictional",
        "quote": "原文段落（80-150字）",
        "imageQuery": "搜索关键词 / 生图提示词"
    },
    ...
]

如果书籍不存在或无法识别，返回空数组 []`;

        // 智谱AI的Authorization格式可能不同，尝试两种格式
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // 智谱AI可能使用不同的认证方式
        if (CONFIG.LLM_API_URL.includes('bigmodel.cn')) {
            // 智谱AI使用 API Key 作为 Bearer token
            headers['Authorization'] = `Bearer ${CONFIG.LLM_API_KEY}`;
        } else {
            // OpenAI格式
            headers['Authorization'] = `Bearer ${CONFIG.LLM_API_KEY}`;
        }
        
        console.log('调用 LLM API:', {
            url: CONFIG.LLM_API_URL,
            model: CONFIG.LLM_MODEL,
            hasKey: !!CONFIG.LLM_API_KEY
        });
        
        const response = await fetch(CONFIG.LLM_API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: CONFIG.LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: '你是一位专业的文学评论家和旅行家，擅长从文学作品中提取地点和经典句子。请严格按照JSON格式返回，不要任何多余文字。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000  // 增加 token 限制，确保能返回完整的地点数组
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `LLM API 请求失败: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 检查响应格式（智谱AI可能返回不同的格式）
        let content;
        if (data.choices && data.choices[0] && data.choices[0].message) {
            content = data.choices[0].message.content.trim();
        } else if (data.data && data.data.choices && data.data.choices[0]) {
            content = data.data.choices[0].message.content.trim();
        } else if (typeof data === 'string') {
            content = data.trim();
        } else {
            console.error('API 响应格式异常:', data);
            throw new Error('API 返回格式不正确，请检查 API 配置');
        }
        
        // 尝试解析 JSON（可能包含 markdown 代码块）
        let jsonStr = content;
        if (content.includes('```json')) {
            const match = content.match(/```json\n([\s\S]*?)\n```/);
            if (match) jsonStr = match[1];
        } else if (content.includes('```')) {
            const match = content.match(/```\n([\s\S]*?)\n```/);
            if (match) jsonStr = match[1];
        }
        
        // 清理可能的引号包裹
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
            jsonStr = JSON.parse(jsonStr);
        }
        
        // 修复常见的JSON格式问题
        jsonStr = this.fixJSONString(jsonStr);
        
        try {
            const result = JSON.parse(jsonStr);
            
            // 确保返回数组格式
            if (!Array.isArray(result)) {
                // 如果是单个对象，转换为数组
                return [result];
            }
            
            return result;
        } catch (error) {
            console.error('JSON 解析失败:', error);
            console.error('原始内容长度:', content.length);
            console.error('原始内容前500字符:', content.substring(0, 500));
            console.error('处理后的 JSON 长度:', jsonStr.length);
            console.error('处理后的 JSON 前500字符:', jsonStr.substring(0, 500));
            
            // 尝试定位错误位置
            const errorMatch = error.message.match(/position (\d+)/);
            if (errorMatch) {
                const errorPos = parseInt(errorMatch[1]);
                const startPos = Math.max(0, errorPos - 50);
                const endPos = Math.min(jsonStr.length, errorPos + 50);
                console.error('错误位置附近的代码:');
                console.error(jsonStr.substring(startPos, endPos));
                console.error(' '.repeat(Math.min(50, errorPos - startPos)) + '^');
            }
            
            // 尝试提取JSON数组部分
            const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                try {
                    console.log('尝试提取并修复JSON数组...');
                    const fixedJson = this.fixJSONString(arrayMatch[0]);
                    const result = JSON.parse(fixedJson);
                    if (Array.isArray(result) && result.length > 0) {
                        console.warn('✅ 使用修复后的JSON');
                        return result;
                    }
                } catch (e) {
                    console.error('修复JSON也失败:', e);
                    console.error('修复后的JSON片段:', arrayMatch[0].substring(0, 200));
                }
            }
            
            // 尝试提取所有可能的JSON对象并组合成数组
            const objectMatches = jsonStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
            if (objectMatches && objectMatches.length > 0) {
                console.log(`找到 ${objectMatches.length} 个可能的JSON对象，尝试解析...`);
                const validObjects = [];
                for (const objStr of objectMatches) {
                    try {
                        const fixedJson = this.fixJSONString(objStr);
                        const parsed = JSON.parse(fixedJson);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            // 检查必需字段
                            if (parsed.location || parsed.quote) {
                                validObjects.push(parsed);
                            }
                        }
                    } catch (e) {
                        // 忽略单个对象解析失败
                    }
                }
                if (validObjects.length > 0) {
                    console.warn(`✅ 成功提取 ${validObjects.length} 个有效的JSON对象`);
                    return validObjects;
                }
            }
            
            // 最后尝试：提取第一个完整的JSON对象
            const objectMatch = jsonStr.match(/\{[\s\S]*?\}/);
            if (objectMatch) {
                try {
                    console.log('尝试提取第一个JSON对象...');
                    const fixedJson = this.fixJSONString(objectMatch[0]);
                    const result = JSON.parse(fixedJson);
                    if (result && typeof result === 'object') {
                        console.warn('✅ 使用提取的单个JSON对象');
                        return [result];
                    }
                } catch (e) {
                    console.error('提取对象也失败:', e);
                }
            }
            
            throw new Error(`JSON解析失败: ${error.message}。请检查API返回的格式是否正确。原始内容已输出到控制台。`);
        }
    }
    
    /**
     * 搜索图片（支持多种图片源）
     */
    async searchImage(query) {
        const apiType = (CONFIG.IMAGE_API_TYPE || 'picsum').toLowerCase();
        
        console.log(`🔎 开始搜索图片 - 关键词: "${query}", API类型: ${apiType}`);
        
        // 按优先级尝试不同的图片源（统一转换为小写进行比较）
        if (apiType === 'picsum') {
            const url = this.getFallbackImage(query);
            console.log(`📷 Picsum图片URL: ${url}`);
            return url;
        } else if (apiType === 'pexels' && CONFIG.PEXELS_API_KEY) {
            try {
                const url = await this.searchPexelsImage(query);
                console.log(`📷 Pexels图片URL: ${url}`);
                return url;
            } catch (error) {
                console.warn('⚠️ Pexels API 失败，使用备用图片:', error);
                const fallbackUrl = this.getFallbackImage(query);
                console.log(`📷 备用图片URL: ${fallbackUrl}`);
                return fallbackUrl;
            }
        } else if (apiType === 'unsplash') {
            try {
                const url = await this.searchUnsplashImage(query);
                console.log(`📷 Unsplash图片URL: ${url}`);
                return url;
            } catch (error) {
                console.warn('⚠️ Unsplash API 失败，使用备用图片:', error);
                const fallbackUrl = this.getFallbackImage(query);
                console.log(`📷 备用图片URL: ${fallbackUrl}`);
                return fallbackUrl;
            }
        } else {
            // 默认使用 Picsum
            return this.getFallbackImage(query);
        }
    }
    
    /**
     * 调用 Pexels API 搜索图片（需要 API key）
     */
    async searchPexelsImage(query) {
        if (!CONFIG.PEXELS_API_KEY) {
            throw new Error('Pexels API key 未配置');
        }
        
        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.pexels.com/v1/search?query=${encodedQuery}&per_page=${CONFIG.IMAGE_PER_PLACE}&orientation=portrait`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': CONFIG.PEXELS_API_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error(`Pexels API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 图片兜底：无结果时使用备用图片
        if (!data.photos || data.photos.length === 0) {
            throw new Error('Pexels 未找到相关图片');
        }
        
        // 返回中等尺寸图片（适合卡片显示）
        return data.photos[0].src.large || data.photos[0].src.medium;
    }
    
    /**
     * 调用 Unsplash API 搜索图片（备用方案）
     */
    async searchUnsplashImage(query) {
        if (!CONFIG.UNSPLASH_API_KEY) {
            throw new Error('Unsplash API key 未配置');
        }
        
        const encodedQuery = encodeURIComponent(query);
        const url = `${CONFIG.UNSPLASH_API_URL}?query=${encodedQuery}&per_page=${CONFIG.IMAGE_PER_PLACE}&client_id=${CONFIG.UNSPLASH_API_KEY}`;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Unsplash API error: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 图片兜底：无结果时返回备用图片
            if (!data.results || data.results.length === 0) {
                return this.getFallbackImage(query);
            }
            
            return data.results[0].urls.regular; // Unsplash 高清图地址
            
        } catch (error) {
            console.warn('Unsplash API 失败，使用备用图片:', error);
            return this.getFallbackImage(query);
        }
    }
    
    /**
     * 获取图片（使用 Picsum Photos，无需 API key，稳定可靠）
     */
    getFallbackImage(query) {
        // 使用 Picsum Photos（无需 API key，稳定可靠）
        // 使用 query 作为 seed，确保相同查询返回相同图片
        const seed = this.hashString(query);
        return `https://picsum.photos/seed/${seed}/600/400`;
    }
    
    /**
     * 简单的字符串哈希函数（用于生成稳定的 seed）
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    // 模拟数据（用于演示，返回数组格式，包含类型字段）
    getMockData(bookName) {
        const mockData = {
            '挪威的森林': [
                {
                    location: '挪威森林',
                    locationEn: 'Norwegian Forest',
                    type: 'real',
                    quote: '每个人都有属于自己的一片森林，也许我们从来不曾去过，但它一直在那里，总会在那里。迷失的人迷失了，相逢的人会再相逢。',
                    imageQuery: 'Norwegian forest mist atmospheric cinematic',
                    bookTitle: '挪威的森林'
                },
                {
                    location: '阿美寮',
                    locationEn: 'Ami Lodge',
                    type: 'fictional',
                    quote: '死并非生的对立面，而作为生的一部分永存。',
                    imageQuery: 'Japanese mountain lodge peaceful atmospheric',
                    bookTitle: '挪威的森林'
                },
                {
                    location: '东京',
                    locationEn: 'Tokyo',
                    type: 'real',
                    quote: '哪里会有人喜欢孤独，不过是不喜欢失望。',
                    imageQuery: 'Tokyo cityscape urban atmospheric',
                    bookTitle: '挪威的森林'
                }
            ],
            '了不起的盖茨比': [
                {
                    location: '长岛西卵',
                    locationEn: 'West Egg, Long Island',
                    type: 'real',
                    quote: 'He stretched out his arms toward the dark water in a curious way, and far as I was from him I could have sworn he was trembling.',
                    imageQuery: 'Long Island dock mist night atmospheric',
                    bookTitle: '了不起的盖茨比'
                },
                {
                    location: '东卵',
                    locationEn: 'East Egg',
                    type: 'real',
                    quote: 'So we beat on, boats against the current, borne back ceaselessly into the past.',
                    imageQuery: 'Long Island mansion Gatsby atmospheric',
                    bookTitle: '了不起的盖茨比'
                },
                {
                    location: '灰烬谷',
                    locationEn: 'Valley of Ashes',
                    type: 'fictional',
                    quote: 'The eyes of Doctor T. J. Eckleburg are blue and gigantic—their retinas are one yard high.',
                    imageQuery: 'industrial wasteland desolate atmospheric',
                    bookTitle: '了不起的盖茨比'
                }
            ],
            '百年孤独': [
                {
                    location: '马孔多',
                    locationEn: 'Macondo',
                    type: 'fictional',
                    quote: '多年以后，面对行刑队，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个遥远的下午。',
                    imageQuery: 'Colombian jungle magical realism atmospheric',
                    bookTitle: '百年孤独'
                },
                {
                    location: '香蕉种植园',
                    locationEn: 'Banana Plantation',
                    type: 'real',
                    quote: '世界新生伊始，许多事物还没有名字，提到的时候尚需用手指指点点。',
                    imageQuery: 'tropical plantation Colombia atmospheric',
                    bookTitle: '百年孤独'
                }
            ]
        };
        
        // 检查是否有匹配的模拟数据
        for (const [key, value] of Object.entries(mockData)) {
            if (bookName.includes(key)) {
                return value;
            }
        }
        
        // 默认数据（返回数组）
        return [{
            location: '未知之地',
            locationEn: 'Unknown Place',
            type: 'real',
            quote: '每一本书都是一次旅行，每一页都是一个新的世界。',
            imageQuery: 'literature books reading atmospheric',
            bookTitle: bookName
        }];
    }
    
    async loadImage(query) {
        // 使用新的 searchImage 方法（支持 Pexels 和 Unsplash）
        const imageUrl = await this.searchImage(query);
        
        // 验证图片是否可加载
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                resolve(img.src);
            };
            
            img.onerror = () => {
                // 如果图片加载失败，使用备用图片
                console.warn('图片加载失败，使用备用图片');
                const fallbackUrl = this.getFallbackImage(query || 'literature atmospheric');
                resolve(fallbackUrl);
            };
            
            img.src = imageUrl;
        });
    }
    
    showLoading() {
        this.inputScreen.classList.add('hidden');
        this.resultScreen.classList.add('hidden');
        this.loadingScreen.classList.remove('hidden');
        this.errorMessage.classList.add('hidden');
        
        // 清空 filmstrip，避免显示上一轮的数据
        if (this.filmstrip) {
            this.filmstrip.innerHTML = '';
        }
        
        // 重置进度
        this.updateLoadingStatus('正在开始...', 0);
    }
    
    /**
     * 更新加载状态
     */
    updateLoadingStatus(statusText, progress) {
        // 更新状态文本（如果有状态显示区域）
        const statusElement = document.querySelector('.loading-text:last-child');
        if (statusElement && statusText) {
            statusElement.textContent = statusText;
        }
    }
    
    showResult(cardsData, isStreaming = false) {
        // 如果是流式模式且结果界面已显示，不重复隐藏加载界面
        if (!isStreaming) {
            this.loadingScreen.classList.add('hidden');
            // 非流式模式时，清理之前的结果
            this.clearPreviousResults();
        }
        this.resultScreen.classList.remove('hidden');
        
        // 确保 cardsData 是数组
        if (!Array.isArray(cardsData)) {
            cardsData = [cardsData];
        }
        
        // 清空 filmstrip，避免显示上一轮的数据
        if (this.filmstrip) {
            this.filmstrip.innerHTML = '';
        }
        
        // 保存数据
        this.cardsData = cardsData;
        this.currentIndex = 0;
        
        // 只有在有数据时才显示主卡片和创建胶卷带
        // 如果 cardsData 为空（流式模式初始状态），filmstrip 占位符已经在 fetchBookDataStreaming 中创建
        if (cardsData.length > 0) {
            // 显示主卡片
            this.updateMainCard();
            
            // 创建胶卷带（如果还没有创建）
            if (!this.filmstrip.querySelector('.filmstrip-item')) {
                this.createFilmstrip();
            }
            
            // 更新导航按钮显示状态
            this.updateNavigationButtons();
            
            // 更新计数器
            this.updateCounter();
        } else {
            // 空数据时，只更新计数器（显示占位符数量）
            this.updateCounter();
        }
    }
    
    /**
     * 添加新卡片到结果（流式模式）
     */
    addCardToResult(cardData) {
        // 检查是否已存在相同地点（防止重复）
        const existingIndex = this.cardsData.findIndex(card => 
            card.location === cardData.location && card.locationEn === cardData.locationEn
        );
        
        if (existingIndex !== -1) {
            console.warn(`⚠️ 地点 "${cardData.location}" 已存在，跳过重复添加`);
            return;
        }
        
        // 更新数据
        this.cardsData.push(cardData);
        
        // 只添加新卡片到胶卷带，而不是重新创建整个胶卷带
        this.addFilmstripItem(cardData, this.cardsData.length - 1);
        
        // 更新计数器
        this.updateCounter();
        
        // 如果当前是最后一张，自动切换到新卡片
        if (this.currentIndex === this.cardsData.length - 2) {
            setTimeout(() => {
                this.currentIndex = this.cardsData.length - 1;
                this.updateMainCard();
                this.updateFilmstripActive();
                this.updateCounter(); // 更新计数器
            }, 300);
        }
    }
    
    /**
     * 添加胶卷带占位符（在图片加载前显示）
     */
    addFilmstripPlaceholder(place, index) {
        if (!this.filmstrip) return;
        
        // 检查是否已存在
        const existingItem = this.filmstrip.querySelector(`[data-index="${index}"]`);
        if (existingItem) return;
        
        const itemIndex = parseInt(index, 10);
        if (isNaN(itemIndex) || itemIndex < 0) {
            console.error(`无效的索引: ${index}`);
            return;
        }
        
        const item = document.createElement('div');
        item.className = `filmstrip-item loading-placeholder ${itemIndex === this.currentIndex ? 'active' : ''}`;
        item.dataset.index = itemIndex.toString();
        
        // 根据地点类型确定加载状态文本
        const locationType = place.type || 'real';
        const isPlaceMode = place.mode === 'place';
        const statusText = isPlaceMode ? '搜索中...' : (locationType === 'fictional' ? '生成中...' : '搜索中...');
        
        // 创建加载占位符
        const placeholder = document.createElement('div');
        placeholder.className = 'filmstrip-placeholder-content';
        placeholder.innerHTML = `
            <div class="filmstrip-loading-spinner"></div>
            <div class="filmstrip-placeholder-text">${place.location}</div>
            <div class="filmstrip-loading-status">${statusText}</div>
        `;
        
        item.appendChild(placeholder);
        item.addEventListener('click', () => this.goToCard(itemIndex));
        
        // 添加淡入动画
        item.style.opacity = '0';
        item.style.transform = 'translateY(10px)';
        
        this.filmstrip.appendChild(item);
        
        // 触发动画
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 10);
    }
    
    /**
     * 更新占位符的加载状态文本
     */
    updateFilmstripPlaceholderStatus(index, statusText) {
        if (!this.filmstrip) return;
        
        const item = this.filmstrip.querySelector(`[data-index="${index}"]`);
        if (!item || !item.classList.contains('loading-placeholder')) return;
        
        const statusElement = item.querySelector('.filmstrip-loading-status');
        if (statusElement) {
            statusElement.textContent = statusText;
            
            // 根据状态文本添加错误样式
            if (statusText.includes('失败') || statusText.includes('错误')) {
                statusElement.style.color = '#DC2626';
                statusElement.style.opacity = '1';
                statusElement.style.fontWeight = '500';
            } else {
                statusElement.style.color = '#A8A29E';
                statusElement.style.opacity = '0.8';
                statusElement.style.fontWeight = 'normal';
            }
        }
    }
    
    /**
     * 更新胶卷带项（从占位符更新为实际图片）
     */
    updateFilmstripItem(cardData, index) {
        if (!this.filmstrip) return;
        
        const itemIndex = parseInt(index, 10);
        if (isNaN(itemIndex) || itemIndex < 0) {
            console.error(`无效的索引: ${index}`);
            return;
        }
        
        let item = this.filmstrip.querySelector(`[data-index="${itemIndex}"]`);
        
        // 如果不存在，创建新项
        if (!item) {
            this.addFilmstripItem(cardData, itemIndex);
            return;
        }
        
        // 如果存在但还是占位符，更新为实际图片
        if (item.classList.contains('loading-placeholder')) {
            // 检查图片URL是否有效
            if (!cardData.imageUrl || cardData.imageUrl.trim() === '') {
                // 图片URL无效，保持占位符状态并显示错误
                this.updateFilmstripPlaceholderStatus(itemIndex, '加载失败');
                return;
            }
            
            // 更新状态为"加载中..."
            this.updateFilmstripPlaceholderStatus(itemIndex, '加载中...');
            
            // 预加载图片，确保图片可以正常显示后再更新DOM
            const preloadImg = new Image();
            preloadImg.crossOrigin = 'anonymous';
            
            preloadImg.onload = () => {
                // 图片加载成功，移除占位符内容并显示图片
                item.innerHTML = '';
                item.classList.remove('loading-placeholder');
                
                const img = document.createElement('img');
                img.alt = cardData.location;
                img.loading = 'lazy';
                img.crossOrigin = 'anonymous';
                img.src = cardData.imageUrl;
                
                item.appendChild(img);
                
                // 更新激活状态
                if (itemIndex === this.currentIndex) {
                    item.classList.add('active');
                }
            };
            
            preloadImg.onerror = () => {
                // 图片加载失败，保持占位符状态并显示错误
                console.warn(`⚠️ 图片加载失败: ${cardData.imageUrl}`);
                this.updateFilmstripPlaceholderStatus(itemIndex, '加载失败');
                // 尝试使用备用图片
                const fallbackUrl = this.getFallbackImage(cardData.imageQuery || cardData.location);
                if (fallbackUrl && fallbackUrl !== cardData.imageUrl) {
                    console.log(`🔄 尝试使用备用图片: ${fallbackUrl}`);
                    cardData.imageUrl = fallbackUrl;
                    // 重新尝试加载备用图片
                    const retryImg = new Image();
                    retryImg.crossOrigin = 'anonymous';
                    retryImg.onload = () => {
                        item.innerHTML = '';
                        item.classList.remove('loading-placeholder');
                        const img = document.createElement('img');
                        img.alt = cardData.location;
                        img.loading = 'lazy';
                        img.crossOrigin = 'anonymous';
                        img.src = fallbackUrl;
                        item.appendChild(img);
                        if (itemIndex === this.currentIndex) {
                            item.classList.add('active');
                        }
                    };
                    retryImg.onerror = () => {
                        // 备用图片也失败，保持失败状态
                        console.error(`❌ 备用图片也加载失败`);
                    };
                    retryImg.src = fallbackUrl;
                }
            };
            
            preloadImg.src = cardData.imageUrl;
        } else {
            // 如果已经是图片项，只更新图片
            const img = item.querySelector('img');
            if (img && cardData.imageUrl) {
                // 预加载新图片
                const preloadImg = new Image();
                preloadImg.crossOrigin = 'anonymous';
                preloadImg.onload = () => {
                    img.src = cardData.imageUrl;
                };
                preloadImg.onerror = () => {
                    console.warn(`⚠️ 图片更新失败: ${cardData.imageUrl}`);
                };
                preloadImg.src = cardData.imageUrl;
            }
        }
    }
    
    /**
     * 添加单个胶卷带项（流式模式使用）
     */
    addFilmstripItem(cardData, index) {
        // 确保索引是数字类型
        const itemIndex = parseInt(index, 10);
        if (isNaN(itemIndex) || itemIndex < 0) {
            console.error(`无效的索引: ${index}`);
            return;
        }
        
        // 检查是否已存在
        const existingItem = this.filmstrip.querySelector(`[data-index="${itemIndex}"]`);
        if (existingItem && !existingItem.classList.contains('loading-placeholder')) {
            // 如果已存在且不是占位符，只更新图片
            const img = existingItem.querySelector('img');
            if (img && cardData.imageUrl) {
                img.src = cardData.imageUrl;
            }
            return;
        }
        
        // 如果存在占位符，更新它
        if (existingItem && existingItem.classList.contains('loading-placeholder')) {
            this.updateFilmstripItem(cardData, itemIndex);
            return;
        }
        
        const item = document.createElement('div');
        item.className = `filmstrip-item ${itemIndex === this.currentIndex ? 'active' : ''}`;
        item.dataset.index = itemIndex.toString();
        
        const img = document.createElement('img');
        img.alt = cardData.location;
        img.loading = 'lazy';
        img.crossOrigin = 'anonymous'; // 允许跨域加载
        
        // 预加载图片
        const preloadImg = new Image();
        preloadImg.crossOrigin = 'anonymous';
        preloadImg.onload = () => {
            img.src = cardData.imageUrl;
        };
        preloadImg.onerror = () => {
            // 即使预加载失败也尝试显示
            img.src = cardData.imageUrl;
        };
        preloadImg.src = cardData.imageUrl;
        
        item.appendChild(img);
        item.addEventListener('click', () => this.goToCard(itemIndex));
        
        // 添加淡入动画
        item.style.opacity = '0';
        item.style.transform = 'translateY(10px)';
        
        this.filmstrip.appendChild(item);
        
        // 触发动画
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 10);
    }
    
    /**
     * 更新主卡片显示
     */
    updateMainCard() {
        if (this.cardsData.length === 0) return;
        
        // 确保索引在有效范围内
        if (this.currentIndex < 0 || this.currentIndex >= this.cardsData.length) {
            console.warn(`⚠️ 索引 ${this.currentIndex} 超出范围 [0, ${this.cardsData.length - 1}]，重置为 0`);
            this.currentIndex = 0;
        }
        
        const cardData = this.cardsData[this.currentIndex];
        if (!cardData) {
            console.error('卡片数据不存在');
            return;
        }
        
        const isReal = cardData.type === 'real';
        
        // 更新图片（预加载确保显示）
        const mainCardImage = document.getElementById('main-card-image');
        // 清除任何动画效果
        mainCardImage.style.animation = 'none';
        mainCardImage.style.backgroundSize = 'cover';
        mainCardImage.style.backgroundPosition = 'center';
        
        if (cardData.imageUrl) {
            // 预加载图片
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                mainCardImage.style.backgroundImage = `url(${cardData.imageUrl})`;
                mainCardImage.style.animation = 'none'; // 确保清除动画
            };
            img.onerror = () => {
                // 即使预加载失败也尝试显示
                mainCardImage.style.backgroundImage = `url(${cardData.imageUrl})`;
                mainCardImage.style.animation = 'none'; // 确保清除动画
            };
            img.src = cardData.imageUrl;
        } else {
            // 图片加载中，显示静态渐变占位背景
            mainCardImage.style.backgroundImage = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            mainCardImage.style.animation = 'none'; // 确保清除动画
        }
        
        // 更新地点名称
        document.getElementById('location-badge').textContent = cardData.locationEn || cardData.location;
        document.getElementById('location-title').textContent = cardData.location;
        
        // 判断模式
        const isPlaceMode = cardData.mode === 'place';
        
        // 更新地点类型标签
        const typeBadge = document.getElementById('location-type-badge');
        if (isPlaceMode) {
            typeBadge.textContent = '真实地点';
            typeBadge.className = 'location-type-badge real';
        } else if (isReal) {
            typeBadge.textContent = '真实地点';
            typeBadge.className = 'location-type-badge real';
        } else {
            typeBadge.textContent = '虚构地点';
            typeBadge.className = 'location-type-badge fictional';
        }
        
        // 根据模式显示不同内容
        if (isPlaceMode) {
            // 地点模式：显示作品分栏
            this.quoteSectionBookMode.classList.add('hidden');
            if (this.worksGridContainer) {
                this.worksGridContainer.classList.remove('hidden');
            }
            this.renderWorksGrid(cardData);
            this.updatePlaceModeInfo(cardData);
        } else {
            // 作品模式：显示原有quote
            if (this.worksGridContainer) {
                this.worksGridContainer.classList.add('hidden');
            }
            this.quoteSectionBookMode.classList.remove('hidden');
            document.getElementById('quote-text-main').textContent = cardData.quote || '';
            document.getElementById('quote-source').textContent = cardData.bookTitle ? `—— 《${cardData.bookTitle}》` : '';
        }
        
        // 更新调试信息
        this.updateDebugInfo(cardData);
        
        // 更新操作按钮
        const googleBtn = document.getElementById('google-search-btn');
        const aigcBtn = document.getElementById('aigc-generate-btn');
        
        if (isPlaceMode) {
            // 地点模式：显示打卡和笔记按钮
            googleBtn.classList.add('hidden');
            if (this.checkinBtn) {
                this.checkinBtn.classList.remove('hidden');
                this.updateCheckinButton(cardData);
            }
            if (this.noteBtn) {
                this.noteBtn.classList.remove('hidden');
            }
        } else {
            // 作品模式：显示谷歌搜索按钮（仅真实地点）
            if (this.checkinBtn) this.checkinBtn.classList.add('hidden');
            if (this.noteBtn) this.noteBtn.classList.add('hidden');
            
            if (isReal) {
                googleBtn.classList.remove('hidden');
                googleBtn.href = `https://www.google.com/search?q=${encodeURIComponent(cardData.locationEn || cardData.location)}`;
            } else {
                googleBtn.classList.add('hidden');
            }
        }
        
        // 始终隐藏AI生成按钮（已移除该功能）
        if (aigcBtn) {
            aigcBtn.classList.add('hidden');
        }
        
        // 更新胶卷带激活状态
        this.updateFilmstripActive();
    }
    
    /**
     * 创建胶卷带
     */
    createFilmstrip() {
        this.filmstrip.innerHTML = '';
        
        this.cardsData.forEach((cardData, index) => {
            // 确保索引是数字类型
            const itemIndex = parseInt(index, 10);
            if (isNaN(itemIndex) || itemIndex < 0) {
                console.error(`无效的索引: ${index}`);
                return;
            }
            
            const item = document.createElement('div');
            item.className = `filmstrip-item ${itemIndex === this.currentIndex ? 'active' : ''}`;
            item.dataset.index = itemIndex.toString();
            
            const img = document.createElement('img');
            img.alt = cardData.location;
            img.loading = 'lazy';
            img.crossOrigin = 'anonymous'; // 允许跨域加载
            
            // 预加载图片
            const preloadImg = new Image();
            preloadImg.crossOrigin = 'anonymous';
            preloadImg.onload = () => {
                img.src = cardData.imageUrl;
            };
            preloadImg.onerror = () => {
                // 即使预加载失败也尝试显示
                img.src = cardData.imageUrl;
            };
            preloadImg.src = cardData.imageUrl;
            
            item.appendChild(img);
            item.addEventListener('click', () => this.goToCard(itemIndex));
            
            this.filmstrip.appendChild(item);
        });
        
        // 验证创建后的数量一致性
        const createdCount = this.filmstrip.querySelectorAll('.filmstrip-item').length;
        if (createdCount !== this.cardsData.length) {
            console.warn(`⚠️ 胶卷带创建后数量不一致: 创建了 ${createdCount} 个，数据有 ${this.cardsData.length} 个`);
        }
    }
    
    /**
     * 更新胶卷带激活状态
     */
    updateFilmstripActive() {
        const items = this.filmstrip.querySelectorAll('.filmstrip-item');
        items.forEach((item) => {
            // 使用 dataset.index 而不是数组索引，确保一致性
            const itemIndex = parseInt(item.dataset.index, 10);
            if (itemIndex === this.currentIndex) {
                item.classList.add('active');
                // 滚动到可见区域
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    /**
     * 切换到指定卡片
     */
    goToCard(index) {
        if (index < 0 || index >= this.cardsData.length || this.isSwitching) return;
        if (index === this.currentIndex) return;
        
        this.isSwitching = true;
        this.currentIndex = index;
        
        // 添加切换动画
        this.mainCard.classList.add('switching');
        
        setTimeout(() => {
            this.updateMainCard();
            // updateMainCard 内部不再调用 updateCounter，避免重复
            // 但我们需要在这里调用以确保计数器更新
            this.updateCounter();
            this.updateNavigationButtons();
            
            setTimeout(() => {
                this.mainCard.classList.remove('switching');
                this.isSwitching = false;
            }, 100);
        }, 200);
    }
    
    /**
     * 上一张卡片
     */
    prevCard() {
        const prevIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.cardsData.length - 1;
        this.goToCard(prevIndex);
    }
    
    /**
     * 下一张卡片
     */
    nextCard() {
        const nextIndex = this.currentIndex < this.cardsData.length - 1 ? this.currentIndex + 1 : 0;
        this.goToCard(nextIndex);
    }
    
    /**
     * 更新导航按钮显示状态
     */
    updateNavigationButtons() {
        if (this.cardsData.length > 1) {
            this.prevBtn.classList.remove('hidden');
            this.nextBtn.classList.remove('hidden');
        } else {
            this.prevBtn.classList.add('hidden');
            this.nextBtn.classList.add('hidden');
        }
    }
    
    /**
     * 更新计数器
     */
    updateCounter() {
        // 获取胶卷带中的实际项目数量（包括占位符）
        const filmstripItems = this.filmstrip.querySelectorAll('.filmstrip-item');
        const filmstripCount = filmstripItems.length;
        const dataCount = this.cardsData.length;
        
        // 确保索引在有效范围内
        if (dataCount > 0) {
            if (this.currentIndex < 0) {
                console.warn(`⚠️ 当前索引 ${this.currentIndex} 小于 0，重置为 0`);
                this.currentIndex = 0;
            } else if (this.currentIndex >= dataCount) {
                console.warn(`⚠️ 当前索引 ${this.currentIndex} 超出卡片数组长度 ${dataCount}，重置为 ${dataCount - 1}`);
                this.currentIndex = Math.max(0, dataCount - 1);
            }
        }
        
        const currentIndexEl = document.getElementById('current-index');
        const totalCountEl = document.getElementById('total-count');
        
        if (currentIndexEl) {
            // 如果有数据，显示当前索引+1；否则显示0
            const displayIndex = dataCount > 0 ? this.currentIndex + 1 : 0;
            currentIndexEl.textContent = displayIndex;
        }
        
        if (totalCountEl) {
            // 显示 filmstrip 中的实际项目数量（包括占位符）
            totalCountEl.textContent = filmstripCount > 0 ? filmstripCount : dataCount;
        }
    }
    
    /**
     * 使用 ModelScope API 生成图片（异步任务模式）
     * 优先使用后端代理避免 CORS 问题
     */
    async generateModelScopeImage(prompt) {
        const apiKey = CONFIG.AIGC_API_KEY;
        const model = CONFIG.AIGC_MODEL || 'Tongyi-MAI/Z-Image-Turbo';
        const backendProxyUrl = CONFIG.BACKEND_PROXY_URL || '/api/modelscope';
        
        // 验证配置
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('ModelScope API Key 未配置');
        }
        if (!model || model.trim() === '') {
            throw new Error('ModelScope Model 未配置');
        }
        
        console.log(`🔧 ModelScope API 配置:`, {
            model: model,
            hasApiKey: !!apiKey,
            apiKeyPrefix: apiKey.substring(0, 10) + '...',
            useBackendProxy: !!backendProxyUrl
        });
        
        // Step 1: 创建任务（优先使用后端代理）
        console.log(`🎨 ModelScope: 创建生图任务 - 提示词: ${prompt}`);
        const enhancedPrompt = `${prompt}, cinematic, atmospheric, high quality, 4k`;
        
        let taskId;
        let useBackendProxy = false;
        
        // 尝试使用后端代理（避免 CORS 问题）
        if (backendProxyUrl && backendProxyUrl !== '') {
            try {
                const proxyUrl = `${backendProxyUrl}/generate`;
                console.log(`📤 使用后端代理创建任务: ${proxyUrl}`);
                console.log(`   - 提示词: ${enhancedPrompt.substring(0, 50)}...`);
                console.log(`   - 模型: ${model}`);
                
                const createResponse = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: enhancedPrompt,
                        model: model
                    })
                });
                
                if (createResponse.ok) {
                    const createData = await createResponse.json();
                    taskId = createData.task_id;
                    useBackendProxy = true;
                    console.log(`✅ 后端代理创建任务成功，task_id: ${taskId}`);
                } else {
                    const errorText = await createResponse.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        errorData = { message: errorText };
                    }
                    const errorMsg = errorData.error || errorData.message || `HTTP ${createResponse.status}`;
                    console.error(`❌ 后端代理请求失败:`, {
                        status: createResponse.status,
                        statusText: createResponse.statusText,
                        error: errorMsg,
                        url: proxyUrl
                    });
                    throw new Error(`后端代理请求失败 (${createResponse.status}): ${errorMsg}。请确保后端服务器正在运行。`);
                }
            } catch (error) {
                // 如果是网络错误（后端服务器未运行），给出明确提示
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_')) {
                    console.error(`❌ 后端代理不可用:`, error.message);
                    console.error(`💡 请确保后端服务器正在运行:`);
                    console.error(`   1. 运行: node api-example.js`);
                    console.error(`   2. 检查后端服务器是否在 http://localhost:3000 运行`);
                    console.error(`   3. 检查 BACKEND_PROXY_URL 配置是否正确: ${backendProxyUrl}`);
                    throw new Error(`后端服务器不可用。请启动后端服务器（运行 node api-example.js）并确保它在运行。错误: ${error.message}`);
                }
                // 其他错误直接抛出
                throw error;
            }
        } else {
            // 如果没有配置后端代理，尝试直接调用（会失败，因为 CORS）
            console.warn(`⚠️ 未配置 BACKEND_PROXY_URL，尝试直接调用 ModelScope API（将失败，因为 CORS）`);
            throw new Error(`未配置后端代理（BACKEND_PROXY_URL）。ModelScope API 需要后端代理以避免 CORS 问题。请在 config.js 中设置 BACKEND_PROXY_URL: "/api/modelscope"`);
        }
        
        if (!taskId) {
            throw new Error('ModelScope API 未返回 task_id');
        }
        
        // Step 2: 轮询任务状态
        const maxAttempts = 60; // 最多轮询60次（5分钟）
        const pollInterval = 5000; // 每5秒轮询一次
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // 第一次立即检查，之后等待间隔
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            
            try {
                let statusResponse;
                
                if (useBackendProxy) {
                    // 使用后端代理查询状态
                    const statusUrl = `${backendProxyUrl}/task/${taskId}`;
                    statusResponse = await fetch(statusUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!statusResponse.ok) {
                        const errorText = await statusResponse.text();
                        let errorData;
                        try {
                            errorData = JSON.parse(errorText);
                        } catch (e) {
                            errorData = { message: errorText };
                        }
                        throw new Error(`后端代理状态查询失败 (${statusResponse.status}): ${errorData.error || errorData.message || statusResponse.statusText}`);
                    }
                } else {
                    // 不应该到达这里，因为我们已经要求使用后端代理
                    throw new Error('未使用后端代理，无法查询状态');
                }
                
                const statusData = await statusResponse.json();
                const taskStatus = statusData.task_status;
                
                console.log(`🔄 ModelScope: 任务状态检查 (${attempt + 1}/${maxAttempts}) - ${taskStatus}`);
                
                if (taskStatus === 'SUCCEED') {
                    // 任务成功，获取图片URL
                    if (statusData.output_images && statusData.output_images.length > 0) {
                        const imageUrl = statusData.output_images[0];
                        console.log(`✅ ModelScope: 图片生成成功！`);
                        console.log(`   📸 图片 URL: ${imageUrl}`);
                        console.log(`   🔍 URL 来源验证: ${imageUrl.includes('modelscope') || imageUrl.includes('aliyuncs') ? '✅ ModelScope' : '⚠️ 未知来源'}`);
                        return imageUrl;
                    } else {
                        console.error(`❌ 任务成功但未返回图片URL，响应数据:`, statusData);
                        throw new Error('任务成功但未返回图片URL');
                    }
                } else if (taskStatus === 'FAILED') {
                    console.error(`❌ ModelScope 任务失败，响应数据:`, statusData);
                    throw new Error(`图片生成失败: ${statusData.error_message || '未知错误'}`);
                }
                // 如果状态是 PENDING 或 RUNNING，继续轮询
                
            } catch (error) {
                // 如果是最后一次尝试，抛出错误
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
                // 否则继续轮询
                console.warn(`⚠️ ModelScope: 状态查询出错，继续重试:`, error.message);
            }
        }
        
        // 超时
        throw new Error('图片生成超时，请稍后重试');
    }
    
    /**
     * 为当前虚构地点生成AIGC图片
     */
    async generateAIGCImageForCurrent() {
        const cardData = this.cardsData[this.currentIndex];
        if (cardData.type !== 'fictional') return;
        
        const btn = document.getElementById('aigc-generate-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 生成中...';
        
        try {
            const imageUrl = await this.generateAIGCImage(cardData.imageQuery || cardData.location);
            
            // 更新图片
            cardData.imageUrl = imageUrl;
            const mainCardImage = document.getElementById('main-card-image');
            mainCardImage.style.animation = 'none'; // 确保清除动画
            mainCardImage.style.backgroundImage = `url(${imageUrl})`;
            
            // 更新胶卷带中的图片
            const filmstripItem = this.filmstrip.querySelector(`[data-index="${this.currentIndex}"]`);
            if (filmstripItem) {
                filmstripItem.querySelector('img').src = imageUrl;
            }
            
        } catch (error) {
            console.error('AI 生图失败:', error);
            alert('图片生成失败，请稍后重试');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
    
    /**
     * 生成 AI 图片（带降级策略）
     * @param {string} prompt - 提示词
     * @param {boolean} useFreeOnly - 是否只使用免费服务（true=跳过付费API，false=先尝试付费API）
     * @returns {Promise<string>} 图片 URL
     */
    async generateAIGCImageWithFallback(prompt, useFreeOnly = false) {
        // 如果不强制使用免费服务，先尝试付费 API
        if (!useFreeOnly && CONFIG.AIGC_API_KEY && CONFIG.AIGC_API_KEY.trim() !== '') {
            try {
                return await this.generateAIGCImage(prompt, 0, false); // false = 不降级
            } catch (error) {
                // 付费 API 失败，继续尝试免费服务
                console.warn('付费 API 失败，降级到免费服务');
            }
        }
        
        // 使用免费 AI 生图服务
        return await this.generateAIGCImage(prompt, 0, true); // true = 使用免费服务
    }
    
    /**
     * 调用 AIGC API 生成图片
     */
    /**
     * 使用多个免费 AI 生图服务（规避速率限制）
     * @param {string} prompt - 提示词
     * @param {number} retryCount - 重试次数
     * @param {boolean} allowFreeFallback - 是否允许降级到免费服务（false=只尝试付费API，失败就抛出错误）
     */
    async generateAIGCImage(prompt, retryCount = 0, allowFreeFallback = true) {
        // 如果配置了 AIGC_API_KEY，使用付费 API
        if (CONFIG.AIGC_API_KEY && CONFIG.AIGC_API_KEY.trim() !== '') {
            // 规范化 API 类型（转换为小写）
            const apiType = (CONFIG.AIGC_API_TYPE || 'openai').toLowerCase().trim();
            
            console.log(`🔑 AIGC API 配置检查:`, {
                hasApiKey: !!CONFIG.AIGC_API_KEY,
                apiKeyPrefix: CONFIG.AIGC_API_KEY.substring(0, 10) + '...',
                apiType: apiType,
                apiUrl: CONFIG.AIGC_API_URL,
                model: CONFIG.AIGC_MODEL
            });
            
            try {
                // ModelScope API（异步任务模式）
                if (apiType === 'modelscope') {
                    console.log(`🎨 使用 ModelScope API 生成图片 - 模型: ${CONFIG.AIGC_MODEL}`);
                    console.log(`📝 提示词: ${prompt}`);
                    const imageUrl = await this.generateModelScopeImage(prompt);
                    console.log(`✅ ModelScope API 生成成功: ${imageUrl}`);
                    return imageUrl;
                }
                
                // OpenAI DALL-E API（同步模式）
                console.log(`🎨 使用 OpenAI DALL-E API 生成图片 - 模型: ${CONFIG.AIGC_MODEL}`);
                const response = await fetch(CONFIG.AIGC_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${CONFIG.AIGC_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: CONFIG.AIGC_MODEL || 'dall-e-3',
                        prompt: `${prompt}, cinematic, atmospheric, high quality, 4k`,
                        n: 1,
                        size: '1024x1024'
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error?.message || `AIGC API 请求失败: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log(`✅ OpenAI DALL-E API 生成成功`);
                return data.data[0].url;
            } catch (error) {
                console.error(`❌ ${apiType === 'modelscope' ? 'ModelScope' : 'OpenAI'} API 失败:`, error);
                console.error(`错误详情:`, {
                    message: error.message,
                    stack: error.stack,
                    config: {
                        apiType: apiType,
                        apiUrl: CONFIG.AIGC_API_URL,
                        model: CONFIG.AIGC_MODEL,
                        hasApiKey: !!CONFIG.AIGC_API_KEY,
                        apiKeyPrefix: CONFIG.AIGC_API_KEY ? CONFIG.AIGC_API_KEY.substring(0, 10) + '...' : 'N/A'
                    }
                });
                
                // 如果允许降级，继续执行免费服务逻辑；否则抛出错误
                if (!allowFreeFallback) {
                    // 不允许降级，直接抛出错误
                    const errorMsg = `${apiType === 'modelscope' ? 'ModelScope' : 'OpenAI'} API 生成失败: ${error.message}`;
                    console.error(`❌ ${errorMsg}`);
                    if (apiType === 'modelscope') {
                        console.error(`💡 请检查以下配置:`);
                        console.error(`   - AIGC_API_KEY: ${CONFIG.AIGC_API_KEY ? '已配置 (' + CONFIG.AIGC_API_KEY.substring(0, 10) + '...)' : '未配置'}`);
                        console.error(`   - AIGC_API_TYPE: ${CONFIG.AIGC_API_TYPE}`);
                        console.error(`   - AIGC_MODEL: ${CONFIG.AIGC_MODEL}`);
                        console.error(`   - AIGC_API_URL: ${CONFIG.AIGC_API_URL}`);
                        console.error(`   - BACKEND_PROXY_URL: ${CONFIG.BACKEND_PROXY_URL || '未配置'}`);
                        console.error(`💡 如果遇到 CORS 错误，请确保后端服务器正在运行并配置了 BACKEND_PROXY_URL`);
                    }
                    throw new Error(errorMsg);
                }
                
                // 允许降级，继续执行免费服务逻辑
                console.warn(`⚠️ ${apiType === 'modelscope' ? 'ModelScope' : 'OpenAI'} API 失败，降级使用免费服务`);
            }
        } else {
            if (!allowFreeFallback) {
                throw new Error('未配置 AIGC_API_KEY，且不允许使用免费服务');
            }
            console.log('ℹ️ 未配置 AIGC_API_KEY，使用免费服务 Pollinations.ai');
        }
        
        // 多个免费 AI 生图服务备选方案（按优先级排序）
        // 注意：只包含可以直接通过 URL 访问的服务，避免需要 Token 或 POST 请求的服务
        const freeServices = [
            {
                name: 'Pollinations.ai',
                generateUrl: (prompt, seed) => {
                    const enhancedPrompt = `${prompt} cinematic atmospheric high quality 8k masterpiece`;
                    const encodedPrompt = encodeURIComponent(enhancedPrompt);
                    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=960&height=600&seed=${seed}&nologo=true`;
                },
                // 如果注册了账号，可以使用 API key 避免速率限制
                // 访问 https://pollinations.ai/ 注册获取免费额度
                useApiKey: false
            },
            {
                name: 'Pollinations.ai (备用域名)',
                generateUrl: (prompt, seed) => {
                    const enhancedPrompt = `${prompt} cinematic atmospheric high quality 8k masterpiece`;
                    const encodedPrompt = encodeURIComponent(enhancedPrompt);
                    // 使用不同的域名可能绕过某些限制
                    return `https://pollinations.ai/prompt/${encodedPrompt}?width=960&height=600&seed=${seed}&nologo=true`;
                }
            }
            // 注意：Hugging Face Inference API 需要 Token 和 POST 请求，不适合前端直接调用
            // 如需使用，请通过后端代理接口实现
        ];
        
        // 选择服务（如果重试，切换到下一个服务）
        const serviceIndex = Math.min(retryCount, freeServices.length - 1);
        const service = freeServices[serviceIndex];
        const seed = Math.floor(Math.random() * 10000);
        
        console.log(`🎨 使用免费 AI 生图服务 (${service.name}) - 提示词: ${prompt}${retryCount > 0 ? ` (重试 ${retryCount})` : ''}`);
        
        const imageUrl = service.generateUrl(prompt, seed);
        
        // 预加载图片，确保图片加载完成后再返回
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            // 设置超时（30秒）
            const timeout = setTimeout(() => {
                img.onerror = null;
                img.onload = null;
                console.warn(`⏱️ ${service.name} 请求超时，尝试下一个服务...`);
                // 如果还有备选服务，重试下一个
                if (retryCount < freeServices.length - 1) {
                    this.generateAIGCImage(prompt, retryCount + 1)
                        .then(resolve)
                        .catch(reject);
                } else {
                    // 所有服务都失败，返回备用图片
                    console.error(`❌ 所有免费 AI 生图服务都失败，使用备用图片`);
                    resolve(this.getFallbackImage(prompt));
                }
            }, 30000);
            
            img.onload = () => {
                clearTimeout(timeout);
                console.log(`✅ AI生图加载成功 (${service.name}): ${imageUrl}`);
                resolve(imageUrl);
            };
            
            img.onerror = (error) => {
                clearTimeout(timeout);
                console.warn(`⚠️ ${service.name} 加载失败: ${imageUrl}`);
                
                // 如果是速率限制错误，尝试下一个服务
                if (retryCount < freeServices.length - 1) {
                    console.log(`🔄 切换到下一个免费服务...`);
                    // 添加短暂延迟避免连续请求
                    setTimeout(() => {
                        this.generateAIGCImage(prompt, retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000 * (retryCount + 1)); // 递增延迟：1s, 2s, 3s...
                } else {
                    // 所有服务都失败，返回备用图片
                    console.error(`❌ 所有免费 AI 生图服务都失败，使用备用图片`);
                    resolve(this.getFallbackImage(prompt));
                }
            };
            
            img.src = imageUrl;
        });
    }
    
    // createCard 方法已移除，现在使用 updateMainCard 和 createFilmstrip
    
    showInput() {
        this.loadingScreen.classList.add('hidden');
        this.resultScreen.classList.add('hidden');
        this.inputScreen.classList.remove('hidden');
        this.bookInput.value = '';
        this.bookInput.focus();
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.remove('hidden');
        this.showInput();
    }
    
    // flipCard 方法已移除，现在每个卡片都有自己的点击事件
    
    async refreshImage() {
        // 这个方法已废弃，现在每个卡片都有自己的刷新按钮
        // 保留用于兼容性
        console.log('refreshImage 已废弃，请使用单个卡片的刷新按钮');
    }
    
    reset() {
        // 清理所有结果
        this.clearPreviousResults();
        
        // 重置模式为作品模式
        this.currentMode = 'book';
        if (this.modeBookBtn && this.modePlaceBtn) {
            this.modeBookBtn.classList.add('active');
            this.modePlaceBtn.classList.remove('active');
            if (this.bookInput) {
                this.bookInput.placeholder = '输入书名，如《挪威的森林》';
            }
        }
        this.showInput();
    }
    
    // setupLongPress 方法已移除，长按保存功能可以在 createCard 中为每个卡片单独添加
    
    async saveAsImage() {
        // 创建画布，将正反面拼接
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const cardWidth = 600;
        const cardHeight = 400;
        canvas.width = cardWidth;
        canvas.height = cardHeight * 2; // 正反面拼接
        
        // 绘制正面
        const frontImg = new Image();
        frontImg.crossOrigin = 'anonymous';
        
        await new Promise((resolve) => {
            frontImg.onload = () => {
                // 绘制背景图
                ctx.drawImage(frontImg, 0, 0, cardWidth, cardHeight);
                
                // 绘制文字
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = '14px "Libre Baskerville", serif';
                const currentCard = this.cardsData[this.currentIndex];
                if (currentCard) {
                    ctx.fillText(
                        `${currentCard.locationEn || currentCard.location} | ${currentCard.bookTitle}`,
                        24,
                        cardHeight - 24
                    );
                }
                
                resolve();
            };
            const currentCard = this.cardsData[this.currentIndex];
            if (!currentCard || !currentCard.imageUrl) {
                console.error('当前卡片数据不存在或图片URL未定义');
                resolve();
                return;
            }
            frontImg.src = currentCard.imageUrl;
        });
        
        // 绘制背面（纸质背景 + 文字）
        ctx.fillStyle = '#F5F1E8';
        ctx.fillRect(0, cardHeight, cardWidth, cardHeight);
        
        // 绘制纸质纹理（简化版）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
        for (let i = 0; i < cardWidth; i += 2) {
            ctx.fillRect(i, cardHeight, 1, cardHeight);
        }
        for (let i = cardHeight; i < cardHeight * 2; i += 2) {
            ctx.fillRect(0, i, cardWidth, 1);
        }
        
        // 绘制邮票
        const stampImg = new Image();
        stampImg.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
            stampImg.onload = () => {
                ctx.drawImage(stampImg, 32, cardHeight + 32, 80, 80);
                resolve();
            };
            const currentCard = this.cardsData[this.currentIndex];
            if (!currentCard || !currentCard.imageUrl) {
                console.error('当前卡片数据不存在或图片URL未定义');
                resolve();
                return;
            }
            stampImg.src = currentCard.imageUrl;
        });
        
        // 绘制金句（手写体样式）
        ctx.fillStyle = '#1C1917';
        ctx.font = '18px "Kalam", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const currentCard = this.cardsData[this.currentIndex];
        if (!currentCard) {
            console.error('当前卡片数据不存在');
            return;
        }
        const quoteLines = this.wrapText(ctx, currentCard.quote, cardWidth - 200);
        const lineHeight = 28;
        const startY = cardHeight + (cardHeight - (quoteLines.length * lineHeight)) / 2;
        
        quoteLines.forEach((line, index) => {
            ctx.fillText(line, cardWidth / 2, startY + index * lineHeight);
        });
        
        // 下载图片
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const currentCard = this.cardsData[this.currentIndex];
            a.download = `BookVibe_${currentCard ? currentCard.bookTitle : 'card'}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    wrapText(ctx, text, maxWidth) {
        const words = text.split('');
        const lines = [];
        let currentLine = '';
        
        for (let i = 0; i < words.length; i++) {
            const testLine = currentLine + words[i];
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    }
    
    // setupParallax 方法已移除，视差效果可以在 createCard 中为每个卡片单独添加
    
    /**
     * 更新调试信息
     */
    updateDebugInfo(cardData) {
        const debugImageSource = document.getElementById('debug-image-source');
        const debugImageQuery = document.getElementById('debug-image-query');
        const debugQueryLabel = document.getElementById('debug-query-label');
        const debugImageApi = document.getElementById('debug-image-api');
        const debugApiItem = document.getElementById('debug-api-item');
        const debugImageUrl = document.getElementById('debug-image-url');
        
        const isFictional = cardData.type === 'fictional';
        
        // 设置图片来源
        if (debugImageSource) {
            debugImageSource.textContent = isFictional ? 'AI生图' : '图片搜索';
        }
        
        // 设置关键词标签和内容
        if (debugQueryLabel) {
            debugQueryLabel.textContent = isFictional ? '生成提示词:' : '搜索关键词:';
        }
        
        if (debugImageQuery) {
            debugImageQuery.textContent = cardData.imageQuery || '未设置';
        }
        
        // 图片API/生成服务信息
        if (debugApiItem && debugImageApi) {
            debugApiItem.style.display = 'flex';
            if (isFictional) {
                // 虚构地点：显示AI生成服务信息
                let serviceName;
                if (CONFIG.AIGC_API_KEY) {
                    const apiType = CONFIG.AIGC_API_TYPE || 'openai';
                    if (apiType === 'modelscope') {
                        serviceName = CONFIG.AIGC_MODEL || 'ModelScope';
                    } else {
                        serviceName = CONFIG.AIGC_MODEL || 'DALL-E';
                    }
                } else {
                    serviceName = 'Pollinations.ai (免费)';
                }
                debugImageApi.textContent = serviceName;
                // 更新标签文本
                const apiLabel = debugApiItem.querySelector('.debug-label');
                if (apiLabel) {
                    apiLabel.textContent = '生成服务:';
                }
            } else {
                // 真实地点：显示图片搜索API信息
                const apiType = (CONFIG.IMAGE_API_TYPE || 'picsum').toLowerCase();
                debugImageApi.textContent = apiType === 'picsum' ? 'Picsum (免费)' : 
                                           apiType === 'pexels' ? 'Pexels' : 
                                           apiType === 'unsplash' ? 'Unsplash' : apiType;
                // 更新标签文本
                const apiLabel = debugApiItem.querySelector('.debug-label');
                if (apiLabel) {
                    apiLabel.textContent = '图片API:';
                }
            }
        }
        
        if (debugImageUrl && cardData.imageUrl) {
            debugImageUrl.href = cardData.imageUrl;
        }
        
        // 控制台输出详细信息
        let serviceInfo;
        if (isFictional) {
            if (CONFIG.AIGC_API_KEY) {
                const apiType = CONFIG.AIGC_API_TYPE || 'openai';
                serviceInfo = apiType === 'modelscope' ? 
                    (CONFIG.AIGC_MODEL || 'ModelScope') : 
                    (CONFIG.AIGC_MODEL || 'DALL-E');
            } else {
                serviceInfo = 'Pollinations.ai (免费)';
            }
        } else {
            serviceInfo = CONFIG.IMAGE_API_TYPE || 'picsum';
        }
        
        console.log(isFictional ? '🎨 AI生图信息:' : '📸 图片搜索信息:', {
            地点: cardData.location,
            '地点(英文)': cardData.locationEn,
            [isFictional ? '生成提示词' : '搜索关键词']: cardData.imageQuery,
            [isFictional ? '生成服务' : '图片API']: serviceInfo,
            图片URL: cardData.imageUrl,
            地点类型: isFictional ? '虚构地点' : '真实地点'
        });
    }
    
    /**
     * 切换调试信息显示/隐藏
     */
    toggleDebugInfo() {
        const debugContent = document.getElementById('debug-content');
        const toggleBtn = document.getElementById('toggle-debug-btn');
        
        if (debugContent && toggleBtn) {
            debugContent.classList.toggle('hidden');
            toggleBtn.classList.toggle('expanded');
        }
    }
    
    /**
     * 显示配置提示
     */
    showConfigPrompt() {
        // 延迟显示，确保 DOM 已加载
        setTimeout(() => {
            // 检查是否已经显示过提示
            if (document.getElementById('config-prompt')) {
                return;
            }
            
            const prompt = document.createElement('div');
            prompt.id = 'config-prompt';
            prompt.style.cssText = `
                position: fixed;
                top: 80px;
                right: 24px;
                background: #FEF3C7;
                border: 1px solid #FCD34D;
                border-radius: 8px;
                padding: 16px 20px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 99;
                max-width: 300px;
                font-family: var(--serif-body);
                font-size: 14px;
                color: #92400E;
            `;
            prompt.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 4px;">需要配置 API Key</div>
                        <div style="font-size: 12px; opacity: 0.8;">请点击右上角设置按钮配置 LLM API Key</div>
                    </div>
                    <button id="config-prompt-close" style="background: none; border: none; color: #92400E; cursor: pointer; font-size: 18px; line-height: 1;">×</button>
                </div>
            `;
            
            document.body.appendChild(prompt);
            
            // 关闭按钮
            const closeBtn = document.getElementById('config-prompt-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    prompt.remove();
                });
            }
            
            // 点击提示打开配置界面
            prompt.style.cursor = 'pointer';
            prompt.addEventListener('click', (e) => {
                if (e.target !== closeBtn && e.target.id !== 'config-prompt-close') {
                    this.showConfigModal();
                }
            });
            
            // 5秒后自动隐藏
            setTimeout(() => {
                if (prompt.parentNode) {
                    prompt.style.opacity = '0';
                    prompt.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => prompt.remove(), 300);
                }
            }, 5000);
        }, 500);
    }
    
    /**
     * 渲染作品分栏（地点模式）
     */
    renderWorksGrid(cardData) {
        const worksGrid = document.getElementById('works-grid');
        if (!worksGrid || !cardData.works || !Array.isArray(cardData.works)) return;
        
        worksGrid.innerHTML = '';
        
        cardData.works.forEach((work, index) => {
            const workItem = document.createElement('div');
            workItem.className = 'work-item';
            workItem.dataset.type = work.type || 'novel';
            workItem.dataset.style = work.quoteStyle || 'literary';
            
            workItem.innerHTML = `
                <div class="work-title">${work.title || '未知作品'}</div>
                <div class="work-author">${work.author || '未知作者'}</div>
                <div class="work-quote">${work.quote || ''}</div>
                <button class="copy-quote-btn" data-quote="${(work.quote || '').replace(/"/g, '&quot;')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    复制
                </button>
            `;
            
            // 添加复制功能
            const copyBtn = workItem.querySelector('.copy-quote-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.copyQuote(work.quote);
                });
            }
            
            worksGrid.appendChild(workItem);
        });
    }
    
    /**
     * 更新地点模式信息（小知识、小贴士）
     */
    updatePlaceModeInfo(cardData) {
        const knowledgeContent = document.getElementById('knowledge-content');
        const tipsContent = document.getElementById('tips-content');
        
        if (knowledgeContent) {
            knowledgeContent.textContent = cardData.knowledge || '';
            knowledgeContent.classList.remove('expanded');
        }
        
        if (tipsContent) {
            tipsContent.textContent = cardData.tips || '';
            tipsContent.classList.remove('expanded');
        }
    }
    
    /**
     * 更新打卡按钮状态
     */
    updateCheckinButton(cardData) {
        if (!this.checkinBtn) return;
        
        const location = cardData.location;
        const checkinStatus = this.checkinStatus[location] || { checked: false, note: '' };
        const checkinText = this.checkinBtn.querySelector('#checkin-text');
        
        if (checkinText) {
            checkinText.textContent = checkinStatus.checked ? '已打卡' : '标记打卡';
        }
        
        // 更新按钮样式
        if (checkinStatus.checked) {
            this.checkinBtn.classList.add('checked');
        } else {
            this.checkinBtn.classList.remove('checked');
        }
    }
    
    /**
     * 处理筛选
     */
    handleFilter(filterType) {
        // 更新按钮状态
        const filterBtns = this.filterButtons.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            if (btn.dataset.filter === filterType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 筛选作品
        const workItems = document.querySelectorAll('.work-item');
        workItems.forEach(item => {
            if (filterType === 'all') {
                item.style.display = '';
            } else {
                const itemType = item.dataset.type;
                if (filterType === 'poetry' && itemType === 'poetry') {
                    item.style.display = '';
                } else if (filterType === 'prose' && itemType === 'prose') {
                    item.style.display = '';
                } else if (filterType === 'novel' && itemType === 'novel') {
                    item.style.display = '';
                } else if (filterType === 'movie' && itemType === 'movie') {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            }
        });
    }
    
    /**
     * 切换可折叠内容
     */
    toggleExpand(type) {
        const content = document.getElementById(`${type}-content`);
        if (content) {
            content.classList.toggle('expanded');
        }
    }
    
    /**
     * 切换打卡状态
     */
    toggleCheckin() {
        const cardData = this.cardsData[this.currentIndex];
        if (!cardData) return;
        
        const location = cardData.location;
        if (!this.checkinStatus[location]) {
            this.checkinStatus[location] = { checked: false, note: '' };
        }
        
        this.checkinStatus[location].checked = !this.checkinStatus[location].checked;
        this.updateCheckinButton(cardData);
        
        // 保存到localStorage
        try {
            localStorage.setItem('bookvibe_checkin', JSON.stringify(this.checkinStatus));
        } catch (e) {
            console.warn('无法保存打卡状态:', e);
        }
    }
    
    /**
     * 显示笔记对话框
     */
    showNoteDialog() {
        const cardData = this.cardsData[this.currentIndex];
        if (!cardData) return;
        
        const location = cardData.location;
        const checkinStatus = this.checkinStatus[location] || { checked: false, note: '' };
        
        const note = prompt('添加旅行笔记（一句话记录你的感受）:', checkinStatus.note || '');
        if (note !== null) {
            if (!this.checkinStatus[location]) {
                this.checkinStatus[location] = { checked: false, note: '' };
            }
            this.checkinStatus[location].note = note;
            
            // 保存到localStorage
            try {
                localStorage.setItem('bookvibe_checkin', JSON.stringify(this.checkinStatus));
            } catch (e) {
                console.warn('无法保存笔记:', e);
            }
        }
    }
    
    /**
     * 复制quote到剪贴板
     */
    async copyQuote(quote) {
        if (!quote) return;
        
        try {
            await navigator.clipboard.writeText(quote);
            // 显示提示（可以添加toast提示）
            console.log('已复制到剪贴板:', quote);
        } catch (e) {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = quote;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                console.log('已复制到剪贴板:', quote);
            } catch (err) {
                console.error('复制失败:', err);
            }
            document.body.removeChild(textArea);
        }
    }
    
    /**
     * 初始化：从localStorage加载打卡状态
     */
    loadCheckinStatus() {
        try {
            const saved = localStorage.getItem('bookvibe_checkin');
            if (saved) {
                this.checkinStatus = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('无法加载打卡状态:', e);
        }
    }
    
    /**
     * 从 localStorage 加载用户配置
     */
    loadUserConfig() {
        try {
            const saved = localStorage.getItem('bookvibe_user_config');
            if (saved) {
                const userConfig = JSON.parse(saved);
                // 合并到 CONFIG
                Object.assign(CONFIG, userConfig);
                console.log('✅ 已从 localStorage 加载用户配置');
            }
        } catch (e) {
            console.warn('无法加载用户配置:', e);
        }
    }
    
    /**
     * 保存用户配置到 localStorage
     */
    saveUserConfig(config) {
        try {
            localStorage.setItem('bookvibe_user_config', JSON.stringify(config));
            // 更新当前 CONFIG
            Object.assign(CONFIG, config);
            console.log('✅ 用户配置已保存');
            return true;
        } catch (e) {
            console.error('无法保存用户配置:', e);
            return false;
        }
    }
    
    /**
     * 获取当前用户配置
     */
    getUserConfig() {
        try {
            const saved = localStorage.getItem('bookvibe_user_config');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('无法读取用户配置:', e);
        }
        return {};
    }
    
    /**
     * 显示配置弹窗
     */
    showConfigModal() {
        if (!this.configModal) {
            // 如果弹窗元素不存在，尝试重新获取
            this.configModal = document.getElementById('config-modal');
            this.configCloseBtn = document.getElementById('config-close-btn');
            this.configSaveBtn = document.getElementById('config-save-btn');
            this.configResetBtn = document.getElementById('config-reset-btn');
            
            if (!this.configModal) {
                console.error('❌ 配置弹窗元素未找到');
                alert('配置界面未加载，请刷新页面重试');
                return;
            }
            
            // 重新绑定事件
            if (this.configCloseBtn) {
                this.configCloseBtn.addEventListener('click', () => this.hideConfigModal());
            }
            if (this.configModal) {
                this.configModal.addEventListener('click', (e) => {
                    if (e.target === this.configModal || e.target.classList.contains('config-modal-overlay')) {
                        this.hideConfigModal();
                    }
                });
            }
            if (this.configSaveBtn) {
                this.configSaveBtn.addEventListener('click', () => this.saveConfig());
            }
            if (this.configResetBtn) {
                this.configResetBtn.addEventListener('click', () => this.resetConfig());
            }
        }
        
        // 加载当前配置到表单
        this.loadConfigToForm();
        
        this.configModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * 隐藏配置弹窗
     */
    hideConfigModal() {
        if (!this.configModal) return;
        this.configModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    /**
     * 加载配置到表单
     */
    loadConfigToForm() {
        const userConfig = this.getUserConfig();
        // 合并配置：用户配置 > config.js > 默认值
        const config = { ...CONFIG };
        if (window.BOOKVIBE_CONFIG) {
            Object.assign(config, window.BOOKVIBE_CONFIG);
        }
        Object.assign(config, userConfig);
        
        // LLM 配置
        const llmApiKeyInput = document.getElementById('config-llm-api-key');
        const llmModelSelect = document.getElementById('config-llm-model');
        const llmApiUrlInput = document.getElementById('config-llm-api-url');
        
        if (llmApiKeyInput) llmApiKeyInput.value = config.LLM_API_KEY || '';
        if (llmModelSelect) llmModelSelect.value = config.LLM_MODEL || 'GLM-4';
        if (llmApiUrlInput) {
            llmApiUrlInput.value = config.LLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            if (!llmApiUrlInput.value) {
                llmApiUrlInput.placeholder = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            }
        }
        
        // AIGC 配置
        const aigcApiKeyInput = document.getElementById('config-aigc-api-key');
        const aigcApiTypeSelect = document.getElementById('config-aigc-api-type');
        const aigcApiUrlInput = document.getElementById('config-aigc-api-url');
        const aigcModelInput = document.getElementById('config-aigc-model');
        
        if (aigcApiKeyInput) aigcApiKeyInput.value = config.AIGC_API_KEY || '';
        if (aigcApiTypeSelect) {
            aigcApiTypeSelect.value = (config.AIGC_API_TYPE || 'modelscope').toLowerCase();
        }
        if (aigcApiUrlInput) {
            aigcApiUrlInput.value = config.AIGC_API_URL || '';
            if (!aigcApiUrlInput.value && config.AIGC_API_TYPE === 'modelscope') {
                aigcApiUrlInput.placeholder = 'https://api-inference.modelscope.cn/v1/images/generations';
            } else if (!aigcApiUrlInput.value && config.AIGC_API_TYPE === 'openai') {
                aigcApiUrlInput.placeholder = 'https://api.openai.com/v1/images/generations';
            }
        }
        if (aigcModelInput) {
            aigcModelInput.value = config.AIGC_MODEL || '';
            if (!aigcModelInput.value && config.AIGC_API_TYPE === 'modelscope') {
                aigcModelInput.placeholder = 'Tongyi-MAI/Z-Image-Turbo';
            } else if (!aigcModelInput.value && config.AIGC_API_TYPE === 'openai') {
                aigcModelInput.placeholder = 'dall-e-3';
            }
        }
        
        // 图片搜索配置
        const imageApiTypeSelect = document.getElementById('config-image-api-type');
        const pexelsApiKeyInput = document.getElementById('config-pexels-api-key');
        const unsplashApiKeyInput = document.getElementById('config-unsplash-api-key');
        
        if (imageApiTypeSelect) imageApiTypeSelect.value = (config.IMAGE_API_TYPE || 'picsum').toLowerCase();
        if (pexelsApiKeyInput) pexelsApiKeyInput.value = config.PEXELS_API_KEY || '';
        if (unsplashApiKeyInput) unsplashApiKeyInput.value = config.UNSPLASH_API_KEY || '';
    }
    
    /**
     * 保存配置
     */
    saveConfig() {
        // 收集表单数据
        const config = {
            LLM_API_KEY: document.getElementById('config-llm-api-key')?.value.trim() || '',
            LLM_MODEL: document.getElementById('config-llm-model')?.value || 'GLM-4',
            LLM_API_URL: document.getElementById('config-llm-api-url')?.value.trim() || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            AIGC_API_KEY: document.getElementById('config-aigc-api-key')?.value.trim() || '',
            AIGC_API_TYPE: document.getElementById('config-aigc-api-type')?.value || 'modelscope',
            AIGC_API_URL: document.getElementById('config-aigc-api-url')?.value.trim() || '',
            AIGC_MODEL: document.getElementById('config-aigc-model')?.value.trim() || '',
            IMAGE_API_TYPE: document.getElementById('config-image-api-type')?.value || 'picsum',
            PEXELS_API_KEY: document.getElementById('config-pexels-api-key')?.value.trim() || '',
            UNSPLASH_API_KEY: document.getElementById('config-unsplash-api-key')?.value.trim() || '',
        };
        
        // 验证必需配置
        if (!config.LLM_API_KEY) {
            alert('请至少配置 LLM API Key（必需项）');
            return;
        }
        
        // 保存配置
        if (this.saveUserConfig(config)) {
            alert('配置已保存！页面将刷新以应用新配置。');
            this.hideConfigModal();
            // 刷新页面以应用新配置
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } else {
            alert('保存配置失败，请检查浏览器控制台');
        }
    }
    
    /**
     * 重置配置
     */
    resetConfig() {
        if (confirm('确定要重置所有配置吗？这将清除所有已保存的 API Keys。')) {
            try {
                localStorage.removeItem('bookvibe_user_config');
                // 清空表单
                this.loadConfigToForm();
                alert('配置已重置');
            } catch (e) {
                console.error('重置配置失败:', e);
                alert('重置配置失败');
            }
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new BookVibe();
});

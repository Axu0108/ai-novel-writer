// ========== API配置 ==========
// ⚠️ 把你的3个Key填在下面的引号里
const API_KEYS = {
    deepseek: '',
    doubao: '',
    qwen: '';

// API端点配置
const API_ENDPOINTS = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
};

// 模型名称
const MODEL_NAMES = {
    deepseek: 'deepseek-chat',
    doubao: 'doubao-pro-32k',
    qwen: 'qwen-plus'
};

// ========== 数据存储 ==========
const STORAGE_KEY = 'ai_novel_writer_data';

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch(e) {}
    }
    return { books: [], settings: { theme: 'white' } };
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let appData = loadData();
let currentBookId = null;
let currentChapterIndex = 0;
let undoStack = [];
let redoStack = [];

// ========== 工具函数 ==========
function showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), duration);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function countWords(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[\s\n\r]+/g, '').replace(/[^\u4e00-\u9fa5\w]/g, '');
    return cleaned.length;
}

function getCurrentBook() {
    return appData.books.find(b => b.id === currentBookId) || null;
}

// ========== 页面导航 ==========
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    
    const backBtn = document.getElementById('backBtn');
    if (pageId === 'bookshelfPage') {
        backBtn.style.visibility = 'hidden';
        document.querySelector('.header-title').textContent = 'AI同人文写作';
    } else {
        backBtn.style.visibility = 'visible';
    }
}

document.getElementById('backBtn').addEventListener('click', () => {
    if (document.getElementById('settingsPage').classList.contains('active')) {
        switchPage('bookshelfPage');
    } else if (document.getElementById('writingPage').classList.contains('active')) {
        switchPage('bookshelfPage');
        currentBookId = null;
        renderBookshelf();
    }
});

document.getElementById('settingsBtn').addEventListener('click', () => {
    switchPage('settingsPage');
    document.querySelector('.header-title').textContent = '设置';
    loadSettingsToForm();
});

// ========== 书架渲染 ==========
function renderBookshelf() {
    const grid = document.getElementById('booksGrid');
    const empty = document.getElementById('emptyBookshelf');
    const countSpan = document.getElementById('bookCount');
    
    countSpan.textContent = appData.books.length;
    
    if (appData.books.length === 0) {
        empty.style.display = 'block';
        grid.querySelectorAll('.book-card').forEach(c => c.remove());
        return;
    }
    
    empty.style.display = 'none';
    grid.querySelectorAll('.book-card').forEach(c => c.remove());
    
    appData.books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.onclick = (e) => {
            if (e.target.classList.contains('book-delete')) return;
            openBook(book.id);
        };
        
        const chapterCount = book.chapters ? book.chapters.length : 0;
        
        card.innerHTML = `
            <div class="book-cover">
                ${book.cover ? `<img src="${book.cover}" alt="封面">` : '📖'}
            </div>
            <div class="book-title">${escapeHtml(book.title || '未命名')}</div>
            <div class="book-meta">${chapterCount} 章 · 更新于 ${formatDate(book.updatedAt)}</div>
            <button class="book-delete" onclick="event.stopPropagation();deleteBook('${book.id}')">×</button>
        `;
        grid.appendChild(card);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(ts) {
    if (!ts) return '未知';
    const d = new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

document.getElementById('createBookBtn').addEventListener('click', () => {
    const title = prompt('请输入书名：', '新同人文');
    if (!title || !title.trim()) return;
    
    const book = {
        id: generateId(),
        title: title.trim(),
        cover: null,
        background: '',
        chapters: [],
        chapterTarget: 2000,
        totalPlanned: 10,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    
    appData.books.unshift(book);
    saveData(appData);
    renderBookshelf();
    showToast('创建成功！');
    openBook(book.id);
});

function deleteBook(id) {
    if (!confirm('确定要删除这本书吗？此操作不可恢复。')) return;
    appData.books = appData.books.filter(b => b.id !== id);
    if (currentBookId === id) {
        currentBookId = null;
        switchPage('bookshelfPage');
    }
    saveData(appData);
    renderBookshelf();
    showToast('已删除');
}

function openBook(id) {
    currentBookId = id;
    const book = getCurrentBook();
    if (!book) return;
    
    if (!book.chapters) book.chapters = [];
    if (book.chapters.length === 0) {
        book.chapters.push({ content: '', wordCount: 0 });
    }
    
    currentChapterIndex = 0;
    switchPage('writingPage');
    document.querySelector('.header-title').textContent = book.title;
    document.getElementById('writingBookTitle').textContent = book.title;
    document.getElementById('wordTarget').value = book.chapterTarget || 2000;
    document.getElementById('plannedChapters').value = book.totalPlanned || 10;
    
    renderChapterList();
    loadChapter(0);
    updateChapterNav();
    saveData(appData);
}

// ========== 章节管理 ==========
function loadChapter(index) {
    const book = getCurrentBook();
    if (!book || !book.chapters) return;
    
    if (index < 0 || index >= book.chapters.length) return;
    
    currentChapterIndex = index;
    const chapter = book.chapters[index];
    
    const editor = document.getElementById('chapterEditor');
    editor.value = chapter.content || '';
    document.getElementById('currentChapterLabel').textContent = `第${index + 1}章`;
    updateWordCount();
    updateChapterNav();
    
    // 重置撤销栈
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    saveEditorState();
}

function saveCurrentChapter() {
    const book = getCurrentBook();
    if (!book) return;
    
    const content = document.getElementById('chapterEditor').value;
    if (book.chapters[currentChapterIndex]) {
        book.chapters[currentChapterIndex].content = content;
        book.chapters[currentChapterIndex].wordCount = countWords(content);
    }
    book.updatedAt = Date.now();
    saveData(appData);
}

function updateWordCount() {
    const content = document.getElementById('chapterEditor').value;
    document.getElementById('wordCount').textContent = countWords(content);
}

function updateChapterNav() {
    const book = getCurrentBook();
    if (!book) return;
    document.getElementById('prevChapterBtn').disabled = currentChapterIndex <= 0;
    document.getElementById('nextChapterBtn').disabled = currentChapterIndex >= (book.chapters?.length || 1) - 1;
}

document.getElementById('chapterEditor').addEventListener('input', () => {
    updateWordCount();
    saveEditorState();
    // 自动保存（防抖）
    clearTimeout(window._saveTimeout);
    window._saveTimeout = setTimeout(saveCurrentChapter, 1000);
});

document.getElementById('prevChapterBtn').addEventListener('click', () => {
    saveCurrentChapter();
    if (currentChapterIndex > 0) {
        loadChapter(currentChapterIndex - 1);
    }
});

document.getElementById('nextChapterBtn').addEventListener('click', () => {
    saveCurrentChapter();
    const book = getCurrentBook();
    if (book && currentChapterIndex < book.chapters.length - 1) {
        loadChapter(currentChapterIndex + 1);
    }
});

// ========== 撤销/重做 ==========
function saveEditorState() {
    const content = document.getElementById('chapterEditor').value;
    if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== content) {
        undoStack.push(content);
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
    }
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = undoStack.length <= 1;
    document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

document.getElementById('undoBtn').addEventListener('click', () => {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    const prevState = undoStack[undoStack.length - 1];
    document.getElementById('chapterEditor').value = prevState;
    updateWordCount();
    updateUndoRedoButtons();
    saveCurrentChapter();
});

document.getElementById('redoBtn').addEventListener('click', () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    document.getElementById('chapterEditor').value = nextState;
    updateWordCount();
    updateUndoRedoButtons();
    saveCurrentChapter();
});

// ========== 章节列表渲染 ==========
function renderChapterList() {
    const book = getCurrentBook();
    if (!book) return;
    
    const list = document.getElementById('chapterList');
    const totalSpan = document.getElementById('totalChapters');
    
    totalSpan.textContent = book.chapters.length;
    list.innerHTML = '';
    
    book.chapters.forEach((ch, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>第${i + 1}章 ${ch.content ? ch.content.substring(0, 20) + '...' : '(空)'}</span>
            <span class="chapter-word-count">${ch.wordCount || 0}字</span>
        `;
        li.onclick = () => {
            saveCurrentChapter();
            loadChapter(i);
            // 切换到写作tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.tab-btn[data-tab="write"]').classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('writeTab').classList.add('active');
        };
        list.appendChild(li);
    });
}

document.getElementById('plannedChapters').addEventListener('change', function() {
    const book = getCurrentBook();
    if (!book) return;
    book.totalPlanned = parseInt(this.value) || 10;
    saveData(appData);
});

document.getElementById('wordTarget').addEventListener('change', function() {
    const book = getCurrentBook();
    if (!book) return;
    book.chapterTarget = parseInt(this.value) || 2000;
    saveData(appData);
});

// ========== Tab切换 ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tab + 'Tab').classList.add('active');
        
        if (tab === 'chapters') {
            saveCurrentChapter();
            renderChapterList();
        }
    });
});

// ========== AI生成 ==========
const aiModal = document.getElementById('aiModal');
document.getElementById('aiGenerateBtn').addEventListener('click', () => {
    saveCurrentChapter();
    aiModal.classList.add('active');
    document.getElementById('aiStatus').textContent = '';
    document.getElementById('aiPrompt').value = '';
    document.getElementById('aiPrompt').focus();
});

document.getElementById('cancelAiBtn').addEventListener('click', () => {
    aiModal.classList.remove('active');
});

document.getElementById('confirmAiBtn').addEventListener('click', async () => {
    const book = getCurrentBook();
    if (!book) return;
    
    const model = document.getElementById('aiModelSelect').value;
    const apiKey = API_KEYS[model];
    
    if (!apiKey || apiKey === 'YOUR_DEEPSEEK_KEY' || apiKey === 'YOUR_DOUBAO_KEY' || apiKey === 'YOUR_QWEN_KEY') {
        showToast('请先在设置中填写API Key');
        return;
    }
    
    const statusDiv = document.getElementById('aiStatus');
    statusDiv.textContent = '⏳ 正在生成...';
    document.getElementById('confirmAiBtn').disabled = true;
    
    try {
        // 构建上下文
        let systemPrompt = `你是一个专业的小说作家。你正在写一本名为《${book.title}》的小说。`;
        
        if (book.background) {
            systemPrompt += `\n\n故事背景与人设：\n${book.background}`;
        }
        
        // 收集前面章节的摘要
        const prevChapters = book.chapters.slice(0, currentChapterIndex);
        if (prevChapters.length > 0) {
            systemPrompt += '\n\n前面章节摘要：';
            prevChapters.forEach((ch, i) => {
                const summary = ch.content ? ch.content.substring(0, 200) : '(空)';
                systemPrompt += `\n第${i+1}章：${summary}...`;
            });
        }
        
        const userPrompt = document.getElementById('aiPrompt').value.trim();
        let finalPrompt = `请写第${currentChapterIndex + 1}章的内容`;
        if (userPrompt) {
            finalPrompt += `，要求：${userPrompt}`;
        }
        finalPrompt += `。目标字数约${book.chapterTarget}字，保持文风一致，情节连贯。直接输出章节正文，不要加章节标题。`;
        
        const response = await fetch(API_ENDPOINTS[model], {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL_NAMES[model],
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: finalPrompt }
                ],
                max_tokens: Math.min(book.chapterTarget * 2, 4000),
                temperature: 0.8
            })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        const generatedText = data.choices[0].message.content;
        
        // 填充到编辑器
        document.getElementById('chapterEditor').value = generatedText;
        updateWordCount();
        saveEditorState();
        saveCurrentChapter();
        renderChapterList();
        
        statusDiv.textContent = '✅ 生成完成！';
        showToast('AI生成完成');
        
        setTimeout(() => {
            aiModal.classList.remove('active');
            document.getElementById('confirmAiBtn').disabled = false;
        }, 1000);
        
    } catch (error) {
        statusDiv.textContent = `❌ 错误：${error.message}`;
        document.getElementById('confirmAiBtn').disabled = false;
        showToast('生成失败：' + error.message, 3000);
    }
});

// 关闭弹窗（点击遮罩）
aiModal.addEventListener('click', function(e) {
    if (e.target === aiModal) {
        aiModal.classList.remove('active');
        document.getElementById('confirmAiBtn').disabled = false;
    }
});

// ========== 设置页 ==========
function loadSettingsToForm() {
    document.getElementById('deepseekKey').value = API_KEYS.deepseek || '';
    document.getElementById('doubaoKey').value = API_KEYS.doubao || '';
    document.getElementById('qwenKey').value = API_KEYS.qwen || '';
    
    // 主题
    const theme = appData.settings.theme || 'white';
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
    });
}

document.getElementById('deepseekKey').addEventListener('change', function() {
    API_KEYS.deepseek = this.value;
});

document.getElementById('doubaoKey').addEventListener('change', function() {
    API_KEYS.doubao = this.value;
});

document.getElementById('qwenKey').addEventListener('change', function() {
    API_KEYS.qwen = this.value;
});

function toggleVisibility(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const theme = this.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        appData.settings.theme = theme;
        saveData(appData);
        
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        showToast('主题已切换');
    });
});

// ========== 数据导入导出 ==========
document.getElementById('exportAllBtn').addEventListener('click', exportAllData);
document.getElementById('exportDataBtn').addEventListener('click', exportAllData);

function exportAllData() {
    const exportData = {
        ...appData,
        _apiKeys: API_KEYS
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-novel-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功');
}

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
});
document.getElementById('importDataBtn').addEventListener('click', () => {
    document.getElementById('importDataInput').click();
});

function handleImport(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.books) {
                appData = data;
                if (data._apiKeys) {
                    Object.assign(API_KEYS, data._apiKeys);
                    delete appData._apiKeys;
                }
                if (!appData.settings) appData.settings = { theme: 'white' };
                saveData(appData);
                renderBookshelf();
                loadSettingsToForm();
                showToast('导入成功！');
            } else {
                showToast('无效的备份文件');
            }
        } catch(err) {
            showToast('文件解析失败');
        }
    };
    reader.readAsText(file);
}

document.getElementById('importFileInput').addEventListener('change', function() {
    if (this.files[0]) handleImport(this.files[0]);
});
document.getElementById('importDataInput').addEventListener('change', function() {
    if (this.files[0]) handleImport(this.files[0]);
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (confirm('确定要清除所有数据吗？此操作不可恢复！\n建议先导出一份备份。')) {
        if (confirm('再次确认：真的要删除所有书籍和设置吗？')) {
            appData = { books: [], settings: { theme: 'white' } };
            saveData(appData);
            currentBookId = null;
            switchPage('bookshelfPage');
            renderBookshelf();
            showToast('已清除所有数据');
        }
    }
});

// ========== 封面修改 ==========
// 在书架页面长按书籍可以换封面
document.getElementById('booksGrid').addEventListener('dblclick', function(e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    // 找到对应的book id
    const deleteBtn = card.querySelector('.book-delete');
    if (!deleteBtn) return;
    const bookId = deleteBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
    changeCover(bookId);
});

function changeCover(bookId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const book = appData.books.find(b => b.id === bookId);
            if (book) {
                book.cover = e.target.result;
                saveData(appData);
                renderBookshelf();
                showToast('封面已更新');
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// 长按事件（移动端）
let longPressTimer;
document.getElementById('booksGrid').addEventListener('touchstart', function(e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    const deleteBtn = card.querySelector('.book-delete');
    if (!deleteBtn) return;
    const bookId = deleteBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
    
    longPressTimer = setTimeout(() => {
        if (confirm('要更换这本书的封面吗？')) {
            changeCover(bookId);
        }
    }, 800);
}, { passive: true });

document.getElementById('booksGrid').addEventListener('touchend', () => clearTimeout(longPressTimer));
document.getElementById('booksGrid').addEventListener('touchmove', () => clearTimeout(longPressTimer));

// ========== 书背景/人设设置 ==========
// 在写作页可以设置书的背景
function setBookBackground() {
    const book = getCurrentBook();
    if (!book) return;
    const bg = prompt('请输入故事背景与人设（这将用于AI生成时的上下文）：', book.background || '');
    if (bg !== null) {
        book.background = bg;
        saveData(appData);
        showToast('背景已保存');
    }
}

// 添加背景设置入口：双击书名
document.getElementById('writingBookTitle').addEventListener('dblclick', setBookBackground);
document.getElementById('writingBookTitle').addEventListener('touchend', function(e) {
    // 长按触发
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        setBookBackground();
    }
});

// ========== 初始化 ==========
function init() {
    // 加载保存的主题
    const theme = appData.settings.theme || 'white';
    document.documentElement.setAttribute('data-theme', theme);
    
    // 尝试从localStorage加载API Keys
    const savedKeys = localStorage.getItem('ai_novel_api_keys');
    if (savedKeys) {
        try {
            const keys = JSON.parse(savedKeys);
            if (keys.deepseek && API_KEYS.deepseek === 'YOUR_DEEPSEEK_KEY') API_KEYS.deepseek = keys.deepseek;
            if (keys.doubao && API_KEYS.doubao === 'YOUR_DOUBAO_KEY') API_KEYS.doubao = keys.doubao;
            if (keys.qwen && API_KEYS.qwen === 'YOUR_QWEN_KEY') API_KEYS.qwen = keys.qwen;
        } catch(e) {}
    }
    
    renderBookshelf();
    switchPage('bookshelfPage');
}

// 保存API Keys（独立存储，不在导出数据中明文保存）
function saveApiKeys() {
    const keys = {
        deepseek: API_KEYS.deepseek,
        doubao: API_KEYS.doubao,
        qwen: API_KEYS.qwen
    };
    localStorage.setItem('ai_novel_api_keys', JSON.stringify(keys));
}

// 监听设置页Key变化时自动保存
['deepseekKey', 'doubaoKey', 'qwenKey'].forEach(id => {
    document.getElementById(id).addEventListener('blur', saveApiKeys);
});

init();

// ========== API配置 ==========
const API_KEYS = {
    deepseek: '',
    doubao: '',
    qwen: ''
};

const API_ENDPOINTS = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
};

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
function showToast(msg, duration) {
    duration = duration || 2000;
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() {
        toast.classList.remove('show');
    }, duration);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function countWords(text) {
    if (!text) return 0;
    var cleaned = text.replace(/[\s\n\r]+/g, '').replace(/[^\u4e00-\u9fa5\w]/g, '');
    return cleaned.length;
}

function getCurrentBook() {
    return appData.books.find(function(b) { return b.id === currentBookId; }) || null;
}

// ========== 页面导航 ==========
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    
    var backBtn = document.getElementById('backBtn');
    if (pageId === 'bookshelfPage') {
        backBtn.style.visibility = 'hidden';
        document.querySelector('.header-title').textContent = 'AI同人文写作';
    } else {
        backBtn.style.visibility = 'visible';
    }
}

document.getElementById('backBtn').addEventListener('click', function() {
    if (document.getElementById('settingsPage').classList.contains('active')) {
        switchPage('bookshelfPage');
    } else if (document.getElementById('writingPage').classList.contains('active')) {
        switchPage('bookshelfPage');
        currentBookId = null;
        renderBookshelf();
    }
});

document.getElementById('settingsBtn').addEventListener('click', function() {
    switchPage('settingsPage');
    document.querySelector('.header-title').textContent = '设置';
    loadSettingsToForm();
});

// ========== 书架渲染 ==========
function renderBookshelf() {
    var grid = document.getElementById('booksGrid');
    var empty = document.getElementById('emptyBookshelf');
    var countSpan = document.getElementById('bookCount');
    
    countSpan.textContent = appData.books.length;
    
    if (appData.books.length === 0) {
        empty.style.display = 'block';
        var cards = grid.querySelectorAll('.book-card');
        cards.forEach(function(c) { c.remove(); });
        return;
    }
    
    empty.style.display = 'none';
    var cards = grid.querySelectorAll('.book-card');
    cards.forEach(function(c) { c.remove(); });
    
    appData.books.forEach(function(book) {
        var card = document.createElement('div');
        card.className = 'book-card';
        card.onclick = function(e) {
            if (e.target.classList.contains('book-delete')) return;
            openBook(book.id);
        };
        
        var chapterCount = book.chapters ? book.chapters.length : 0;
        
        card.innerHTML = '<div class="book-cover">' +
            (book.cover ? '<img src="' + book.cover + '" alt="封面">' : '📖') +
            '</div>' +
            '<div class="book-title">' + escapeHtml(book.title || '未命名') + '</div>' +
            '<div class="book-meta">' + chapterCount + ' 章 · 更新于 ' + formatDate(book.updatedAt) + '</div>' +
            '<button class="book-delete">×</button>';
        
        card.querySelector('.book-delete').onclick = function(e) {
            e.stopPropagation();
            deleteBook(book.id);
        };
        
        grid.appendChild(card);
    });
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(ts) {
    if (!ts) return '未知';
    var d = new Date(ts);
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

document.getElementById('createBookBtn').addEventListener('click', function() {
    var title = prompt('请输入书名：', '新同人文');
    if (!title || !title.trim()) return;
    
    var book = {
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
    appData.books = appData.books.filter(function(b) { return b.id !== id; });
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
    var book = getCurrentBook();
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
    var book = getCurrentBook();
    if (!book || !book.chapters) return;
    
    if (index < 0 || index >= book.chapters.length) return;
    
    currentChapterIndex = index;
    var chapter = book.chapters[index];
    
    var editor = document.getElementById('chapterEditor');
    editor.value = chapter.content || '';
    document.getElementById('currentChapterLabel').textContent = '第' + (index + 1) + '章';
    updateWordCount();
    updateChapterNav();
    
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    saveEditorState();
}

function saveCurrentChapter() {
    var book = getCurrentBook();
    if (!book) return;
    
    var content = document.getElementById('chapterEditor').value;
    if (book.chapters[currentChapterIndex]) {
        book.chapters[currentChapterIndex].content = content;
        book.chapters[currentChapterIndex].wordCount = countWords(content);
    }
    book.updatedAt = Date.now();
    saveData(appData);
}

function updateWordCount() {
    var content = document.getElementById('chapterEditor').value;
    document.getElementById('wordCount').textContent = countWords(content);
}

function updateChapterNav() {
    var book = getCurrentBook();
    if (!book) return;
    document.getElementById('prevChapterBtn').disabled = currentChapterIndex <= 0;
    document.getElementById('nextChapterBtn').disabled = currentChapterIndex >= (book.chapters ? book.chapters.length : 1) - 1;
}

document.getElementById('chapterEditor').addEventListener('input', function() {
    updateWordCount();
    saveEditorState();
    clearTimeout(window._saveTimeout);
    window._saveTimeout = setTimeout(saveCurrentChapter, 1000);
});

document.getElementById('prevChapterBtn').addEventListener('click', function() {
    saveCurrentChapter();
    if (currentChapterIndex > 0) {
        loadChapter(currentChapterIndex - 1);
    }
});

document.getElementById('nextChapterBtn').addEventListener('click', function() {
    saveCurrentChapter();
    var book = getCurrentBook();
    if (book && currentChapterIndex < book.chapters.length - 1) {
        loadChapter(currentChapterIndex + 1);
    }
});

// ========== 撤销/重做 ==========
function saveEditorState() {
    var content = document.getElementById('chapterEditor').value;
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

document.getElementById('undoBtn').addEventListener('click', function() {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    var prevState = undoStack[undoStack.length - 1];
    document.getElementById('chapterEditor').value = prevState;
    updateWordCount();
    updateUndoRedoButtons();
    saveCurrentChapter();
});

document.getElementById('redoBtn').addEventListener('click', function() {
    if (redoStack.length === 0) return;
    var nextState = redoStack.pop();
    undoStack.push(nextState);
    document.getElementById('chapterEditor').value = nextState;
    updateWordCount();
    updateUndoRedoButtons();
    saveCurrentChapter();
});

// ========== 章节列表渲染 ==========
function renderChapterList() {
    var book = getCurrentBook();
    if (!book) return;
    
    var list = document.getElementById('chapterList');
    var totalSpan = document.getElementById('totalChapters');
    
    totalSpan.textContent = book.chapters.length;
    list.innerHTML = '';
    
    book.chapters.forEach(function(ch, i) {
        var li = document.createElement('li');
        var preview = ch.content ? ch.content.substring(0, 20) : '';
        li.innerHTML = '<span>第' + (i + 1) + '章 ' + (preview ? preview + '...' : '(空)') + '</span>' +
            '<span class="chapter-word-count">' + (ch.wordCount || 0) + '字</span>';
        li.onclick = function() {
            saveCurrentChapter();
            loadChapter(i);
            document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelector('.tab-btn[data-tab="write"]').classList.add('active');
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            document.getElementById('writeTab').classList.add('active');
        };
        list.appendChild(li);
    });
}

document.getElementById('plannedChapters').addEventListener('change', function() {
    var book = getCurrentBook();
    if (!book) return;
    book.totalPlanned = parseInt(this.value) || 10;
    saveData(appData);
});

document.getElementById('wordTarget').addEventListener('change', function() {
    var book = getCurrentBook();
    if (!book) return;
    book.chapterTarget = parseInt(this.value) || 2000;
    saveData(appData);
});

// ========== Tab切换 ==========
document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        var tab = this.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        document.getElementById(tab + 'Tab').classList.add('active');
        
        if (tab === 'chapters') {
            saveCurrentChapter();
            renderChapterList();
        }
    });
});

// ========== AI生成 ==========
var aiModal = document.getElementById('aiModal');
document.getElementById('aiGenerateBtn').addEventListener('click', function() {
    saveCurrentChapter();
    aiModal.classList.add('active');
    document.getElementById('aiStatus').textContent = '';
    document.getElementById('aiPrompt').value = '';
    document.getElementById('aiPrompt').focus();
});

document.getElementById('cancelAiBtn').addEventListener('click', function() {
    aiModal.classList.remove('active');
});

document.getElementById('confirmAiBtn').addEventListener('click', function() {
    var book = getCurrentBook();
    if (!book) return;
    
    var model = document.getElementById('aiModelSelect').value;
    var apiKey = API_KEYS[model];
    
    if (!apiKey || apiKey === '') {
        showToast('请先在设置中填写API Key');
        return;
    }
    
    var statusDiv = document.getElementById('aiStatus');
    statusDiv.textContent = '⏳ 正在生成...';
    document.getElementById('confirmAiBtn').disabled = true;
    
    var systemPrompt = '你是一个专业的小说作家。你正在写一本名为《' + book.title + '》的小说。';
    
    if (book.background) {
        systemPrompt += '\n\n故事背景与人设：\n' + book.background;
    }
    
    var prevChapters = book.chapters.slice(0, currentChapterIndex);
    if (prevChapters.length > 0) {
        systemPrompt += '\n\n前面章节摘要：';
        prevChapters.forEach(function(ch, i) {
            var summary = ch.content ? ch.content.substring(0, 200) : '(空)';
            systemPrompt += '\n第' + (i+1) + '章：' + summary + '...';
        });
    }
    
    var userPrompt = document.getElementById('aiPrompt').value.trim();
    var finalPrompt = '请写第' + (currentChapterIndex + 1) + '章的内容';
    if (userPrompt) {
        finalPrompt += '，要求：' + userPrompt;
    }
    finalPrompt += '。目标字数约' + book.chapterTarget + '字，保持文风一致，情节连贯。直接输出章节正文，不要加章节标题。';
    
    fetch(API_ENDPOINTS[model], {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model: MODEL_NAMES[model],
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.8
        })
    }).then(function(response) {
        if (!response.ok) {
            return response.json().then(function(err) {
                throw new Error(err.error ? err.error.message : '请求失败');
            }).catch(function() {
                throw new Error('请求失败: ' + response.status);
            });
        }
        return response.json();
    }).then(function(data) {
        var generatedText = data.choices[0].message.content;
        document.getElementById('chapterEditor').value = generatedText;
        updateWordCount();
        saveEditorState();
        saveCurrentChapter();
        renderChapterList();
        statusDiv.textContent = '✅ 生成完成！';
        showToast('AI生成完成');
        setTimeout(function() {
            aiModal.classList.remove('active');
            document.getElementById('confirmAiBtn').disabled = false;
        }, 1000);
    }).catch(function(error) {
        statusDiv.textContent = '❌ 错误：' + error.message;
        document.getElementById('confirmAiBtn').disabled = false;
        showToast('生成失败：' + error.message, 3000);
    });
});

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
    
    var theme = appData.settings.theme || 'white';
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(function(b) {
        if (b.dataset.theme === theme) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
}

document.getElementById('deepseekKey').addEventListener('change', function() {
    API_KEYS.deepseek = this.value;
    saveApiKeys();
});

document.getElementById('doubaoKey').addEventListener('change', function() {
    API_KEYS.doubao = this.value;
    saveApiKeys();
});

document.getElementById('qwenKey').addEventListener('change', function() {
    API_KEYS.qwen = this.value;
    saveApiKeys();
});

function toggleVisibility(id) {
    var input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}

document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        var theme = this.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        appData.settings.theme = theme;
        saveData(appData);
        
        document.querySelectorAll('.theme-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        showToast('主题已切换');
    });
});

// ========== 数据导入导出 ==========
document.getElementById('exportAllBtn').addEventListener('click', exportAllData);
document.getElementById('exportDataBtn').addEventListener('click', exportAllData);

function exportAllData() {
    var exportObj = {
        books: appData.books,
        settings: appData.settings
    };
    var blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ai-novel-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功');
}

document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('importFileInput').click();
});

document.getElementById('importDataBtn').addEventListener('click', function() {
    document.getElementById('importDataInput').click();
});

function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (data.books) {
                appData.books = data.books;
                appData.settings = data.settings || { theme: 'white' };
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

document.getElementById('clearAllBtn').addEventListener('click', function() {
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
document.getElementById('booksGrid').addEventListener('dblclick', function(e) {
    var card = e.target.closest('.book-card');
    if (!card) return;
    var deleteBtn = card.querySelector('.book-delete');
    if (!deleteBtn) return;
    var bookId = '';
    var books = appData.books;
    var index = Array.from(document.getElementById('booksGrid').querySelectorAll('.book-card')).indexOf(card);
    if (index >= 0 && index < books.length) {
        bookId = books[index].id;
    }
    if (bookId) changeCover(bookId);
});

function changeCover(bookId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            var book = appData.books.find(function(b) { return b.id === bookId; });
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

var longPressTimer;
document.getElementById('booksGrid').addEventListener('touchstart', function(e) {
    var card = e.target.closest('.book-card');
    if (!card) return;
    var books = appData.books;
    var index = Array.from(document.getElementById('booksGrid').querySelectorAll('.book-card')).indexOf(card);
    if (index < 0 || index >= books.length) return;
    var bookId = books[index].id;
    
    longPressTimer = setTimeout(function() {
        if (confirm('要更换这本书的封面吗？')) {
            changeCover(bookId);
        }
    }, 800);
});

document.getElementById('booksGrid').addEventListener('touchend', function() {
    clearTimeout(longPressTimer);
});

document.getElementById('booksGrid').addEventListener('touchmove', function() {
    clearTimeout(longPressTimer);
});

// ========== 书背景设置 ==========
function setBookBackground() {
    var book = getCurrentBook();
    if (!book) return;
    var bg = prompt('请输入故事背景与人设（这将用于AI生成时的上下文）：', book.background || '');
    if (bg !== null) {
        book.background = bg;
        saveData(appData);
        showToast('背景已保存');
    }
}

document.getElementById('writingBookTitle').addEventListener('dblclick', setBookBackground);

// ========== 保存API Keys ==========
function saveApiKeys() {
    var keys = {
        deepseek: API_KEYS.deepseek,
        doubao: API_KEYS.doubao,
        qwen: API_KEYS.qwen
    };
    localStorage.setItem('ai_novel_api_keys', JSON.stringify(keys));
}

// ========== 初始化 ==========
function init() {
    var theme = appData.settings.theme || 'white';
    document.documentElement.setAttribute('data-theme', theme);
    
    var savedKeys = localStorage.getItem('ai_novel_api_keys');
    if (savedKeys) {
        try {
            var keys = JSON.parse(savedKeys);
            if (keys.deepseek) API_KEYS.deepseek = keys.deepseek;
            if (keys.doubao) API_KEYS.doubao = keys.doubao;
            if (keys.qwen) API_KEYS.qwen = keys.qwen;
        } catch(e) {}
    }
    
    renderBookshelf();
    switchPage('bookshelfPage');
}

init();

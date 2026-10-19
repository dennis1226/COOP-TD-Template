/**
 * 魔物模板編輯器 - 核心腳本
 */

// ==================== Storage 常數與工具函式 ====================
const STORAGE_KEY = 'coop_saved_templates';
const FOLDERS_KEY = 'coop_saved_folders';

function isDesktop() {
    return window.innerWidth > 900;
}

function getSavedTemplates() {
    try {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) return JSON.parse(localData);
    } catch (e) {
        console.error('無法讀取模板資料', e);
    }
    return [];
}

function saveSavedTemplates(templates) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {
        console.error('無法儲存模板資料，可能是儲存空間已滿', e);
        showToast('儲存失敗：本機儲存空間異常');
    }
}

function getSavedFolders() {
    try {
        const localData = localStorage.getItem(FOLDERS_KEY);
        if (localData) return JSON.parse(localData);
    } catch (e) {
        console.error('無法讀取資料夾資料', e);
    }
    return [];
}

function saveSavedFolders(folders) {
    try {
        localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
        console.error('無法儲存資料夾資料', e);
    }
}

// ==================== 遊戲數據與地形設定 ====================
const MONSTER_CATEGORIES = [
    { title: "攻擊型", monsterIds: [2, 5, 7, 9, 10, 12, 13, 16, 17] },
    { title: "輔助型", monsterIds: [3, 6, 8] },
    { title: "控制型", monsterIds: [1, 4, 11] },
    { title: "附屬型", monsterIds: [15] },
    { title: "特殊型", monsterIds: [14] },
    { title: "一般魔神", monsterIds: [18, 19, 20, 21, 22] }
];

const TERRAIN_CONFIGS = {
    'background/board-bg-hedge.png': {
        name: '綠籬地形',
        cols: 7,
        rows: 5,
        defaultWidth: 750,
        defaultHeight: 505,
        colFracs: (() => {
            const cols = [110, 100, 105, 103, 104, 105, 115];
            const sum = cols.reduce((acc, cur) => acc + cur, 0);
            return cols.map(v => v / sum);
        })(),
        rowFracs: (() => {
            const rows = [114, 111, 116, 116, 115];
            const sum = rows.reduce((acc, cur) => acc + cur, 0);
            return rows.map(v => v / sum);
        })(),
        paddingTopRatio: 0,
        paddingBottomRatio: 0,
        paddingLeftRatio: 0,
        blockedCells: new Set([
            '0-0', '6-0', '0-1', '1-1', '2-1', '4-1', '5-1', '6-1',
            '2-2', '4-2', '2-3', '4-3', '2-4', '3-4', '4-4'
        ])
    },
    'background/board-bg-guardwall.png': {
        name: '城牆地形',
        cols: 7,
        rows: 3,
        defaultWidth: 900,
        defaultHeight: 450,
        colFracs: Array(7).fill(1 / 7),
        rowFracs: Array(3).fill(1 / 3),
        paddingTopRatio: 0.23,
        paddingBottomRatio: 0.03,
        paddingLeftRatio: 0.05,
        blockedCells: new Set()
    }
};

function isAttachmentMonster(monsterId) {
    const attachCategory = MONSTER_CATEGORIES.find(c => c.title === "附屬型");
    if (!attachCategory) return false;
    const num = parseInt(String(monsterId).replace('monster_', ''), 10);
    return attachCategory.monsterIds.includes(num);
}

function normalizePlacedUnit(placed) {
    if (!placed) return null;
    let baseId = null;
    let formIndex = 0;
    let attachment = null;

    if (typeof placed === 'object' && placed !== null) {
        if (placed.baseId) baseId = String(placed.baseId);
        else if (placed.id) baseId = String(placed.id);
        else if (placed.unitId) baseId = String(placed.unitId);
        if (typeof placed.formIndex === 'number') formIndex = placed.formIndex;
        
        if (placed.attachment && typeof placed.attachment === 'object') {
            let attachBaseId = placed.attachment.baseId || placed.attachment.id || '';
            attachBaseId = String(attachBaseId);
            if (!attachBaseId.startsWith('monster_')) {
                const num = attachBaseId.replace(/\D/g, '');
                if (num) attachBaseId = `monster_${num}`;
            }
            const attachFormIndex = typeof placed.attachment.formIndex === 'number' ? placed.attachment.formIndex : 0;
            attachment = { baseId: attachBaseId, formIndex: attachFormIndex };
        }
    } else if (typeof placed === 'number') {
        baseId = `monster_${placed}`;
    } else if (typeof placed === 'string') {
        const matchMulti = placed.match(/image(\d+)_(\d+)\.png/i);
        if (matchMulti) {
            baseId = `monster_${matchMulti[1]}`;
            formIndex = Math.max(0, parseInt(matchMulti[2], 10) - 1);
        } else {
            const matchSingle = placed.match(/image(\d+)\.png/i);
            if (matchSingle) {
                baseId = `monster_${matchSingle[1]}`;
                formIndex = 0;
            } else if (placed.startsWith('monster_')) {
                baseId = placed;
            } else if (placed.startsWith('monster')) {
                baseId = `monster_${placed.replace('monster', '')}`;
            } else if (!isNaN(parseInt(placed, 10))) {
                baseId = `monster_${parseInt(placed, 10)}`;
            }
        }
    }

    if (!baseId) return null;
    if (!baseId.startsWith('monster_')) {
        const num = baseId.replace(/\D/g, '');
        if (num) baseId = `monster_${num}`;
    }
    return { baseId, formIndex, attachment };
}

// ==================== 全域狀態管理 ====================
const state = {
    cols: 7,
    rows: 5,
    cellW: 105,
    cellH: 112,
    colFracs: null,
    rowFracs: null,
    paddingTopRatio: 0,
    paddingBottomRatio: 0,
    paddingLeftRatio: 0,
    selectedUnitId: null,
    selectedFormIndex: 0,
    deleteMode: false,
    loadedMonsters: [],
    bgImage: null,
    currentBg: 'background/board-bg-hedge.png',
    currentLoadedTemplateId: null,
    terrainData: {
        'background/board-bg-hedge.png': { units: {}, orders: {} },
        'background/board-bg-guardwall.png': { units: {}, orders: {} }
    },
    get units() { return this.terrainData[this.currentBg].units; },
    set units(val) { this.terrainData[this.currentBg].units = val; },
    get orders() { return this.terrainData[this.currentBg].orders; },
    set orders(val) { this.terrainData[this.currentBg].orders = val; },
    get blockedCells() { return TERRAIN_CONFIGS[this.currentBg]?.blockedCells || new Set(); }
};

// ==================== 歷史操作管理 (Undo/Redo) ====================
const historyStack = {
    undoList: [],
    redoList: [],
    maxSize: 30,
    pushState() {
        this.undoList.push({ currentBg: state.currentBg, terrainData: structuredClone(state.terrainData) });
        if (this.undoList.length > this.maxSize) this.undoList.shift();
        this.redoList = [];
        updateUndoRedoButtons();
    },
    undo() {
        if (this.undoList.length === 0) return;
        this.redoList.push({ currentBg: state.currentBg, terrainData: structuredClone(state.terrainData) });
        const prev = this.undoList.pop();
        state.currentBg = prev.currentBg;
        state.terrainData = structuredClone(prev.terrainData);
        if (bgSelect) bgSelect.value = state.currentBg;
        loadFixedBackground(state.currentBg, false, true);
        updateUndoRedoButtons();
    },
    redo() {
        if (this.redoList.length === 0) return;
        this.undoList.push({ currentBg: state.currentBg, terrainData: structuredClone(state.terrainData) });
        const next = this.redoList.pop();
        state.currentBg = next.currentBg;
        state.terrainData = structuredClone(next.terrainData);
        if (bgSelect) bgSelect.value = state.currentBg;
        loadFixedBackground(state.currentBg, false, true);
        updateUndoRedoButtons();
    },
    clear() {
        this.undoList = [];
        this.redoList = [];
        updateUndoRedoButtons();
    }
};

// ==================== DOM 元素獲取 ====================
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const boardEl = document.getElementById('gameBoard');
const boardBgEl = document.getElementById('boardBackground');
const unitsGrid = document.getElementById('unitsGrid');
const deleteModeBtn = document.getElementById('deleteModeBtn');
const clearBtn = document.getElementById('clearBtn');
const copyTemplateBtn = document.getElementById('copyTemplateBtn');
const saveImageBtn = document.getElementById('saveImageBtn');
const downloadImageBtn = document.getElementById('downloadImageBtn');
const themeToggle = document.getElementById('themeToggle');
const toastEl = document.getElementById('toast');
const bgSelect = document.getElementById('bgSelect');

const formModalOverlay = document.getElementById('formModalOverlay');
const formModal = document.querySelector('.form-modal');
const closeFormModalBtn = document.getElementById('closeFormModalBtn');
const formsGrid = document.getElementById('formsGrid');
const formModalTitle = document.getElementById('formModalTitle');

const updateLogBtn = document.getElementById('updateLogBtn');
const updateLogOverlay = document.getElementById('updateLogOverlay');
const closeUpdateLogBtn = document.getElementById('closeUpdateLogBtn');
const logListContainer = document.getElementById('logListContainer');

const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const updateTemplateBtn = document.getElementById('updateTemplateBtn');
const templateNameInput = document.getElementById('templateNameInput');
const templateDescInput = document.getElementById('templateDescInput');
const savedTemplatesList = document.getElementById('savedTemplatesList');
const openDrawerBtn = document.getElementById('openDrawerBtn');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const addFolderBtn = document.getElementById('addFolderBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const templatesDrawer = document.getElementById('templatesDrawer');

const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importFileInput = document.getElementById('importFileInput');

// ==================== 介面交互與提示 ====================
function showToast(msg, duration = 2200) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = historyStack.undoList.length === 0;
    if (redoBtn) redoBtn.disabled = historyStack.redoList.length === 0;
}

if (undoBtn) undoBtn.addEventListener('click', () => { historyStack.undo(); createBoard(); showToast('已復原上一步操作'); });
if (redoBtn) redoBtn.addEventListener('click', () => { historyStack.redo(); createBoard(); showToast('已重做操作'); });

// Tab 切換
document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mobile-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetPane = document.getElementById(btn.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
    });
});

if (formModal) formModal.addEventListener('click', (e) => e.stopPropagation());

// ==================== 更新記錄讀取與解析 ====================
let changelogLoaded = false;

function parseMarkdownToLogs(mdText) {
    const sections = mdText.split(/^##\s+/m).slice(1);
    return sections.map(section => {
        const lines = section.trim().split('\n');
        const titleLine = lines[0].trim();
        const contentLines = lines.slice(1).map(l => l.trim()).filter(Boolean);

        const match = titleLine.match(/(?:\[(.*?)\])?\s*-?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/) || [null, '', titleLine];
        const version = match[1] ? ` (${match[1]})` : '';
        const dateStr = (match[2] || titleLine) + version;

        const bodyHtml = contentLines.map(line => {
            let clean = line.replace(/^[-*]\s+/, '');
            clean = clean
                .replace(/\*\*全新推出\*\*[：:]?/g, '<span class="log-tag tag-new">全新推出</span>')
                .replace(/\*\*功能優化\*\*[：:]?/g, '<span class="log-tag tag-opt">功能優化</span>')
                .replace(/\*\*介面優化\*\*[：:]?/g, '<span class="log-tag tag-ui">介面優化</span>')
                .replace(/\*\*穩定性提升\*\*[：:]?/g, '<span class="log-tag tag-fix">穩定性提升</span>')
                .replace(/\*\*基礎功能\*\*[：:]?/g, '<span class="log-tag tag-base">基本功能</span>');

            return `<div class="log-row">${clean}</div>`;
        }).join('');

        return { date: dateStr, html: bodyHtml };
    });
}

async function loadChangelog() {
    if (!logListContainer || changelogLoaded) return;
    try {
        const response = await fetch('CHANGELOG.md');
        if (!response.ok) throw new Error('無法讀取 CHANGELOG.md');
        const text = await response.text();
        const logs = parseMarkdownToLogs(text);

        if (logs.length === 0) {
            logListContainer.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">暫無更新紀錄</div>';
            return;
        }

        logListContainer.innerHTML = logs.map(item => `
            <div class="log-item">
                <div class="log-date">${item.date}</div>
                <div class="log-text">${item.html}</div>
            </div>
        `).join('');
        changelogLoaded = true;
    } catch (err) {
        console.error(err);
        logListContainer.innerHTML = '<div style="text-align:center; color:#e74c3c; padding:20px;">更新記錄讀取失敗，請確認同目錄下存在 CHANGELOG.md。</div>';
    }
}

function openUpdateLog() {
    if (updateLogOverlay) {
        updateLogOverlay.classList.add('open');
        loadChangelog();
    }
}
function closeUpdateLog() {
    if (updateLogOverlay) updateLogOverlay.classList.remove('open');
}

if (updateLogBtn) updateLogBtn.addEventListener('click', openUpdateLog);
if (closeUpdateLogBtn) closeUpdateLogBtn.addEventListener('click', closeUpdateLog);
if (updateLogOverlay) updateLogOverlay.addEventListener('click', (e) => {
    if (e.target === updateLogOverlay) closeUpdateLog();
});

// 抽屜控制
function openDrawer() { templatesDrawer.classList.add('open'); drawerOverlay.classList.add('open'); }
function closeDrawer() { templatesDrawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }
if (openDrawerBtn) openDrawerBtn.addEventListener('click', openDrawer);
if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

// ==================== 模板儲存按鈕狀態 ====================
function getCellKey(x, y) { return `${x}-${y}`; }

function updateSaveButtonsVisibility() {
    if (!templateNameInput) return;
    const rawName = templateNameInput.value.trim().slice(0, 20);
    const templates = getSavedTemplates();
    const existing = templates.find(t => t.name === rawName);
    if (existing && rawName !== '') {
        if (saveTemplateBtn) saveTemplateBtn.style.display = 'none';
        if (updateTemplateBtn) updateTemplateBtn.style.display = 'block';
        state.currentLoadedTemplateId = existing.id;
    } else {
        if (saveTemplateBtn) saveTemplateBtn.style.display = 'block';
        if (updateTemplateBtn) updateTemplateBtn.style.display = 'none';
        state.currentLoadedTemplateId = null;
    }
}
if (templateNameInput) templateNameInput.addEventListener('input', updateSaveButtonsVisibility);

function setLoadedTemplate(template) {
    if (template) {
        state.currentLoadedTemplateId = template.id;
        if (templateNameInput) templateNameInput.value = template.name;
        if (templateDescInput) templateDescInput.value = template.description || '';
    } else {
        state.currentLoadedTemplateId = null;
        if (templateNameInput) templateNameInput.value = '';
        if (templateDescInput) templateDescInput.value = '';
    }
    updateSaveButtonsVisibility();
}

// ==================== 形態選擇彈窗 ====================
function openFormModalForMenu(monster) {
    if (!monster || monster.forms.length <= 1) { showToast('該魔物只有單一形態'); return; }
    formModalTitle.textContent = '選擇預設放置形態';
    formsGrid.innerHTML = '';
    const currentIdx = monster.selectedFormIndex || 0;
    monster.forms.forEach((form, idx) => {
        const item = document.createElement('div');
        item.className = `form-item ${idx === currentIdx ? 'active' : ''}`;
        item.innerHTML = `<img src="${form.src}" alt="${form.name}"><span>${form.name}</span>`;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            monster.selectedFormIndex = idx;
            state.selectedFormIndex = idx;
            const opt = unitsGrid.querySelector(`[data-id="${monster.id}"]`);
            if (opt) {
                const optImg = opt.querySelector('img');
                if (optImg) optImg.src = form.src;
            }
            closeFormModal();
            showToast(`預設放置形態設為：${form.name}`);
        });
        formsGrid.appendChild(item);
    });
    formModalOverlay.classList.add('open');
}

function openFormModalForCell(cellKey) {
    const placed = normalizePlacedUnit(state.units[cellKey]);
    if (!placed) return;
    const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
    if (!monster || monster.forms.length <= 1) { showToast('該魔物只有單一形態'); return; }
    formModalTitle.textContent = '切換格子形態';
    formsGrid.innerHTML = '';
    monster.forms.forEach((form, idx) => {
        const item = document.createElement('div');
        item.className = `form-item ${idx === placed.formIndex ? 'active' : ''}`;
        item.innerHTML = `<img src="${form.src}" alt="${form.name}"><span>${form.name}</span>`;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            historyStack.pushState();
            placed.formIndex = idx;
            state.units[cellKey] = placed;
            createBoard();
            closeFormModal();
            showToast(`格子形態已切換為：${form.name}`);
        });
        formsGrid.appendChild(item);
    });
    formModalOverlay.classList.add('open');
}

function closeFormModal() { if (formModalOverlay) formModalOverlay.classList.remove('open'); }
if (closeFormModalBtn) closeFormModalBtn.addEventListener('click', closeFormModal);
if (formModalOverlay) formModalOverlay.addEventListener('click', (e) => { if (e.target === formModalOverlay) closeFormModal(); });

// ==================== 棋盤生成與地形管理 ====================
function applyTerrainConfig(config, naturalWidth, naturalHeight) {
    state.cols = config.cols;
    state.rows = config.rows;
    state.colFracs = config.colFracs;
    state.rowFracs = config.rowFracs;
    state.paddingTopRatio = config.paddingTopRatio || 0;
    state.paddingBottomRatio = config.paddingBottomRatio || 0;
    state.paddingLeftRatio = config.paddingLeftRatio || 0;
    
    let maxW;
    if (isDesktop()) {
        maxW = Math.min(650, window.innerWidth * 0.48);
    } else {
        maxW = Math.min(380, window.innerWidth - 20);
    }

    const scale = Math.min(1, maxW / naturalWidth);
    const playableW = naturalWidth * (1 - state.paddingLeftRatio * 2);
    const playableH = naturalHeight * (1 - state.paddingTopRatio - state.paddingBottomRatio);
    state.cellW = Math.round((playableW / state.cols) * scale);
    state.cellH = Math.round((playableH / state.rows) * scale);
    createBoard();
}

function loadFixedBackground(bgPath = state.currentBg, recordHistory = true, keepData = false) {
    if (recordHistory && state.currentBg !== bgPath) historyStack.clear();
    if (!keepData && state.currentBg !== bgPath) {
        state.terrainData[bgPath] = { units: {}, orders: {} };
        setLoadedTemplate(null);
    }
    state.currentBg = bgPath;
    if (bgSelect) bgSelect.value = bgPath;
    if (boardBgEl) boardBgEl.style.backgroundImage = `url('${bgPath}')`;
    const config = TERRAIN_CONFIGS[bgPath] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        state.bgImage = img;
        applyTerrainConfig(config, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
        state.bgImage = null;
        applyTerrainConfig(config, config.defaultWidth || 700, config.defaultHeight || 500);
    };
    img.src = bgPath;
}

if (bgSelect) bgSelect.addEventListener('change', (e) => loadFixedBackground(e.target.value, true, false));

function createBoard() {
    if (!boardEl) return;
    boardEl.innerHTML = '';
    const config = TERRAIN_CONFIGS[state.currentBg] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    
    let maxW;
    if (isDesktop()) {
        maxW = Math.min(650, window.innerWidth * 0.48);
    } else {
        maxW = Math.min(380, window.innerWidth - 20);
    }

    const naturalW = state.bgImage ? state.bgImage.naturalWidth : (config.defaultWidth || 700);
    const naturalH = state.bgImage ? state.bgImage.naturalHeight : (config.defaultHeight || 500);
    const fullImgW = Math.min(maxW, naturalW);
    const fullImgH = fullImgW * (naturalH / naturalW);
    const topPaddingPx = fullImgH * state.paddingTopRatio;
    const bottomPaddingPx = fullImgH * state.paddingBottomRatio;
    const sidePaddingPx = fullImgW * state.paddingLeftRatio;
    const playableW = fullImgW - sidePaddingPx * 2;
    const playableH = fullImgH - topPaddingPx - bottomPaddingPx;

    boardEl.style.paddingTop = `${topPaddingPx}px`;
    boardEl.style.paddingBottom = `${bottomPaddingPx}px`;
    boardEl.style.paddingLeft = `${sidePaddingPx}px`;
    boardEl.style.paddingRight = `${sidePaddingPx}px`;
    boardEl.style.gridTemplateColumns = state.colFracs ? state.colFracs.map(f => `${Math.round(f * playableW)}px`).join(' ') : `repeat(${state.cols}, ${state.cellW}px)`;
    boardEl.style.gridTemplateRows = state.rowFracs ? state.rowFracs.map(f => `${Math.round(f * playableH)}px`).join(' ') : `repeat(${state.rows}, ${state.cellH}px)`;

    for (let y = 0; y < state.rows; y++) {
        for (let x = 0; x < state.cols; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (state.deleteMode) cell.classList.add('delete-mode-active');
            const key = getCellKey(x, y);
            cell.dataset.key = key;
            const isBlocked = state.blockedCells && state.blockedCells.has(key);
            if (isBlocked) cell.classList.add('disabled');

            const placed = normalizePlacedUnit(state.units[key]);
            if (placed) {
                state.units[key] = placed;
                const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
                if (monster) {
                    const targetForm = monster.forms[placed.formIndex] || monster.forms[0];
                    if (targetForm) {
                        const img = document.createElement('img');
                        img.className = 'unit-img';
                        img.src = targetForm.src;
                        cell.appendChild(img);
                    }
                }
                if (placed.attachment) {
                    const attachMonster = state.loadedMonsters.find(m => m.id === placed.attachment.baseId);
                    if (attachMonster) {
                        const attachForm = attachMonster.forms[placed.attachment.formIndex] || attachMonster.forms[0];
                        if (attachForm) {
                            const attachImg = document.createElement('img');
                            attachImg.className = 'attachment-img';
                            attachImg.src = attachForm.src;
                            cell.appendChild(attachImg);
                        }
                    }
                }
            }

            cell.addEventListener('click', () => onCellClick(x, y));
            cell.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (state.units[key] && !state.deleteMode) openFormModalForCell(key);
            });
            cell.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (isBlocked) return;
                boardEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
                cell.classList.add('drag-over');
            });
            cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                boardEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
                if (isBlocked) return showToast('該區域無法放置魔物！');
                const monsterId = e.dataTransfer.getData('text/plain');
                if (monsterId) {
                    historyStack.pushState();
                    placeUnit(x, y, monsterId, state.selectedFormIndex);
                }
            });
            boardEl.appendChild(cell);
        }
    }
}

function placeUnit(x, y, monsterId, formIndex = 0) {
    const key = getCellKey(x, y);
    const isAttach = isAttachmentMonster(monsterId);
    if (isAttach) {
        const existing = normalizePlacedUnit(state.units[key]);
        if (!existing) {
            showToast('請先在此格子放置一般魔物，才能加入附屬型！');
            return;
        }
        existing.attachment = { baseId: monsterId, formIndex };
        state.units[key] = existing;
        showToast('已成功為該魔物加上附屬型！');
    } else {
        const existing = normalizePlacedUnit(state.units[key]);
        state.units[key] = { baseId: monsterId, formIndex, attachment: existing ? existing.attachment : null };
    }
    createBoard();
}

function onCellClick(x, y) {
    const key = getCellKey(x, y);
    if (state.deleteMode) {
        if (state.units[key]) {
            historyStack.pushState();
            const placed = normalizePlacedUnit(state.units[key]);
            if (placed && placed.attachment) {
                placed.attachment = null;
                state.units[key] = placed;
                createBoard();
                showToast('已移除格內的附屬型魔物');
                return;
            }
            delete state.units[key];
            createBoard();
            showToast('已刪除格內魔物');
        }
        return;
    }
    if (state.blockedCells && state.blockedCells.has(key)) {
        showToast('該區域無法放置魔物！');
        return;
    }
    if (state.selectedUnitId) {
        historyStack.pushState();
        placeUnit(x, y, state.selectedUnitId, state.selectedFormIndex);
    }
}

// 監聽螢幕變動以重繪棋盤比例
window.addEventListener('resize', () => {
    const config = TERRAIN_CONFIGS[state.currentBg];
    if (config) {
        const naturalW = state.bgImage ? state.bgImage.naturalWidth : (config.defaultWidth || 700);
        const naturalH = state.bgImage ? state.bgImage.naturalHeight : (config.defaultHeight || 500);
        applyTerrainConfig(config, naturalW, naturalH);
    }
});

// ==================== 魔物圖標讀取 ====================
async function autoLoadIcons() {
    if (!unitsGrid) return;
    unitsGrid.innerHTML = '<div class="empty-units">正在讀取 icon 資料夾…</div>';
    state.loadedMonsters = [];
    
    const tryLoadImage = (src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ src, ok: true });
        img.onerror = () => resolve({ src, ok: false });
        img.src = src;
    });

    const checkMonster = async (m) => {
        const multiSrcs = Array.from({ length: 7 }, (_, i) => `icon/image${m}_${i + 1}.png`);
        const singleSrc = `icon/image${m}.png`;
        const results = await Promise.all([...multiSrcs.map(src => tryLoadImage(src)), tryLoadImage(singleSrc)]);
        const multiResults = results.slice(0, 7);
        const singleResult = results[7];
        const forms = [];
        if (multiResults[0].ok) {
            for (let i = 0; i < 7; i++) {
                if (multiResults[i].ok) forms.push({ formIndex: i, src: multiSrcs[i], name: `形態 ${i + 1}` });
                else break;
            }
        } else if (singleResult && singleResult.ok) {
            forms.push({ formIndex: 0, src: singleSrc, name: `預設形態` });
        }
        if (forms.length > 0) return { id: `monster_${m}`, monsterNum: m, name: `魔物 ${m}`, forms, selectedFormIndex: 0 };
        return null;
    };

    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => checkMonster(i + 1)));
    state.loadedMonsters = results.filter(Boolean);
    unitsGrid.innerHTML = '';

    if (state.loadedMonsters.length === 0) {
        unitsGrid.innerHTML = `<div class="empty-units">未找到魔物圖片<br>請在 icon 資料夾放圖片<br>(如 image1_1.png)</div>`;
        renderSavedTemplatesList();
        createBoard();
        return;
    }

    MONSTER_CATEGORIES.forEach(category => {
        const categoryMonsters = state.loadedMonsters.filter(m => category.monsterIds.includes(m.monsterNum));
        if (categoryMonsters.length > 0) {
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'unit-category-header';
            categoryHeader.textContent = category.title;
            unitsGrid.appendChild(categoryHeader);

            const categoryRow = document.createElement('div');
            categoryRow.className = 'unit-category-row';

            categoryMonsters.forEach(monster => {
                const opt = document.createElement('div');
                opt.className = 'unit-option';
                opt.dataset.id = monster.id;
                opt.draggable = true;
                opt.title = `${monster.name}（包含 ${monster.forms.length} 種形態）`;

                const img = document.createElement('img');
                img.src = monster.forms[monster.selectedFormIndex || 0].src;
                img.draggable = false;
                opt.appendChild(img);

                if (monster.forms.length > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'forms-badge';
                    badge.textContent = `${monster.forms.length}形態`;
                    opt.appendChild(badge);
                }

                opt.addEventListener('click', () => {
                    if (state.selectedUnitId === monster.id) {
                        openFormModalForMenu(monster);
                    } else {
                        document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
                        opt.classList.add('selected');
                        state.selectedUnitId = monster.id;
                        state.selectedFormIndex = monster.selectedFormIndex || 0;
                        if (state.deleteMode && deleteModeBtn) {
                            state.deleteMode = false;
                            deleteModeBtn.className = 'secondary';
                            deleteModeBtn.textContent = '🗑️ 刪除模式(單格)';
                        }
                        createBoard();
                    }
                });
                opt.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', monster.id);
                    document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
                    opt.classList.add('selected');
                    state.selectedUnitId = monster.id;
                    state.selectedFormIndex = monster.selectedFormIndex || 0;
                });
                categoryRow.appendChild(opt);
            });
            unitsGrid.appendChild(categoryRow);
        }
    });
    createBoard();
    renderSavedTemplatesList();
}

// ==================== 工具操作按鈕 ====================
if (deleteModeBtn) {
    deleteModeBtn.addEventListener('click', () => {
        state.deleteMode = !state.deleteMode;
        if (state.deleteMode) {
            deleteModeBtn.className = 'danger';
            deleteModeBtn.textContent = '✕ 退出刪除模式';
            state.selectedUnitId = null;
            document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        } else {
            deleteModeBtn.className = 'secondary';
            deleteModeBtn.textContent = '🗑️ 刪除模式(單格)';
        }
        createBoard();
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (Object.keys(state.units).length === 0) return;
        if (confirm('確定要清空畫布嗎？')) {
            historyStack.pushState();
            state.units = {};
            setLoadedTemplate(null);
            createBoard();
            showToast('當前地形模板已清空');
        }
    });
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        themeToggle.textContent = document.body.classList.contains('light-mode') ? '深色模式' : '淺色模式';
    });
}

// ==================== 圖片產生與匯出 ====================
async function generateBoardCanvas() {
    const board = document.getElementById('gameBoard');
    if (!board) { showToast('找不到棋盤元件'); return null; }

    const boardRect = board.getBoundingClientRect();
    const cells = board.querySelectorAll('.cell');
    if (cells.length === 0) { showToast('棋盤尚無格子'); return null; }

    const canvas = document.createElement('canvas');
    const config = TERRAIN_CONFIGS[state.currentBg] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    const bgImg = state.bgImage;
    const canvasWidth = bgImg ? bgImg.naturalWidth : (config.defaultWidth || 700);
    const canvasHeight = bgImg ? bgImg.naturalHeight : (config.defaultHeight || 500);
    const descText = templateDescInput ? templateDescInput.value.trim() : '';

    let extraHeight = 0;
    const padding = 20;
    const fontSize = 20;
    const lineHeight = 28;
    const lines = [];

    if (descText) {
        const dummyCtx = canvas.getContext('2d');
        dummyCtx.font = `${fontSize}px sans-serif`;
        const maxWidth = canvasWidth - (padding * 2);
        descText.split('\n').forEach(para => {
            let currentLine = '';
            for (let char of para) {
                if (dummyCtx.measureText(currentLine + char).width > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine += char;
                }
            }
            lines.push(currentLine);
        });
        extraHeight = (lines.length * lineHeight) + (padding * 2) + 30;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight + extraHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImg) ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);

    const scaleX = canvasWidth / boardRect.width;
    const scaleY = canvasHeight / boardRect.height;

    // 輔助載入圖片函式
    const loadImage = (src) => new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });

    // 1. 收集並預先載入所有格子的圖片資料
    const prepareTasks = [];

    cells.forEach((cell) => {
        const key = cell.dataset.key;
        if (!key) return;
        const placed = normalizePlacedUnit(state.units[key]);
        if (!placed) return;

        const cellRect = cell.getBoundingClientRect();
        const cellX = (cellRect.left - boardRect.left) * scaleX;
        const cellY = (cellRect.top - boardRect.top) * scaleY;
        const cellW = cellRect.width * scaleX;
        const cellH = cellRect.height * scaleY;

        let mainSrc = null;
        const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
        if (monster) {
            const targetForm = monster.forms[placed.formIndex] || monster.forms[0];
            if (targetForm) mainSrc = targetForm.src;
        }

        let attachSrc = null;
        if (placed.attachment) {
            const attachMonster = state.loadedMonsters.find(m => m.id === placed.attachment.baseId);
            if (attachMonster) {
                const attachForm = attachMonster.forms[placed.attachment.formIndex] || attachMonster.forms[0];
                if (attachForm) attachSrc = attachForm.src;
            }
        }

        prepareTasks.push(
            Promise.all([loadImage(mainSrc), loadImage(attachSrc)]).then(([mainImg, attachImg]) => ({
                mainImg,
                attachImg,
                cellX,
                cellY,
                cellW,
                cellH
            }))
        );
    });

    const renderedUnits = await Promise.all(prepareTasks);

    // 2. 依序繪製至 Canvas（先畫本體魔物，再繪製附屬型魔物）
    renderedUnits.forEach(({ mainImg, attachImg, cellX, cellY, cellW, cellH }) => {
        // 先繪製本體
        if (mainImg) {
            const padX = cellW * 0.05;
            const padY = cellH * 0.05;
            const boxW = cellW - padX * 2;
            const boxH = cellH - padY * 2;
            const imgAspect = mainImg.naturalWidth / mainImg.naturalHeight;
            const boxAspect = boxW / boxH;
            let drawW = boxW;
            let drawH = boxH;
            let drawX = cellX + padX;
            let drawY = cellY + padY;
            if (imgAspect > boxAspect) {
                drawH = boxW / imgAspect;
                drawY += (boxH - drawH) / 2;
            } else {
                drawW = boxH * imgAspect;
                drawX += (boxW - drawW) / 2;
            }
            ctx.drawImage(mainImg, drawX, drawY, drawW, drawH);
        }

        // 後繪製附屬物（保證覆蓋在最上層）
        if (attachImg) {
            const attachW = cellW * 0.35;
            const attachH = cellH * 0.35;
            const attachX = cellX + (cellW * 0.02);
            const attachY = cellY + (cellH * 0.02);
            const imgAspect = attachImg.naturalWidth / attachImg.naturalHeight;
            const boxAspect = attachW / attachH;
            let drawW = attachW;
            let drawH = attachH;
            let drawX = attachX;
            let drawY = attachY;
            if (imgAspect > boxAspect) {
                drawH = attachW / imgAspect;
                drawY += (attachH - drawH) / 2;
            } else {
                drawW = attachH * imgAspect;
                drawX += (attachH - drawW) / 2;
            }
            ctx.drawImage(attachImg, drawX, drawY, drawW, drawH);
        }
    });

    // 3. 繪製底部說明文字區塊
    if (descText && lines.length > 0) {
        const startY = canvasHeight;
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(0, startY, canvas.width, extraHeight);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, startY);
        ctx.lineTo(canvas.width, startY);
        ctx.stroke();
        ctx.fillStyle = '#5b9bd5';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('【陣容說明】', padding, startY + padding);
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px sans-serif`;
        let textY = startY + padding + 35;
        lines.forEach(line => { ctx.fillText(line, padding, textY); textY += lineHeight; });
    }

    return canvas;
}

async function copyBoardTemplate() {
    showToast('正在產生高畫質圖片…');
    const canvas = await generateBoardCanvas();
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
        if (!blob) { showToast('匯出失敗，請重試'); return; }
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast('已複製高畫質模板圖片至剪貼簿！');
                return;
            } catch (e) {
                // 回退至下載
            }
        }
        const imageUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `coop_board_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('已為您下載隊形模板圖片！');
    }, 'image/png');
}

async function saveBoardImage() {
    showToast('正在產生高畫質預覽圖片…');
    const canvas = await generateBoardCanvas();
    if (!canvas) return;

    canvas.toBlob((blob) => {
        if (!blob) { showToast('匯出失敗，請重試'); return; }
        const imageUrl = URL.createObjectURL(blob);

        let modal = document.getElementById('imagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'imagePreviewModal';
            modal.className = 'image-preview-modal-overlay';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="image-preview-card">
                <div class="preview-title">📱 請長按下方圖片儲存至手機相簿</div>
                <img src="${imageUrl}" class="preview-img" alt="隊形預覽">
                <button id="closePreviewBtn" class="secondary" style="width:100%;padding:10px;">關閉視窗</button>
            </div>
        `;
        modal.style.display = 'flex';

        document.getElementById('closePreviewBtn').onclick = () => { modal.style.display = 'none'; };
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }, 'image/png');
}

async function downloadBoardImage() {
    showToast('正在產生高畫質圖片以供下載…');
    const canvas = await generateBoardCanvas();
    if (!canvas) return;

    canvas.toBlob((blob) => {
        if (!blob) { showToast('匯出失敗，請重試'); return; }
        const imageUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `coop_board_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('已直接為您下載隊形模板圖片！');
    }, 'image/png');
}

if (copyTemplateBtn) copyTemplateBtn.addEventListener('click', copyBoardTemplate);
if (saveImageBtn) saveImageBtn.addEventListener('click', saveBoardImage);
if (downloadImageBtn) downloadImageBtn.addEventListener('click', downloadBoardImage);

// ==================== 模板庫與資料夾邏輯 ====================
if (addFolderBtn) addFolderBtn.addEventListener('click', createNewFolder);

function createNewFolder() {
    const folderName = prompt('請輸入新資料夾名稱（最多20字）：', '新資料夾');
    if (folderName !== null && folderName.trim() !== '') {
        const name = folderName.trim().slice(0, 20);
        const folders = getSavedFolders();
        folders.push({ id: Date.now(), name, collapsed: false, order: folders.length + 1 });
        saveSavedFolders(folders);
        renderSavedTemplatesList();
        showToast(`已建立資料夾：「${name}」`);
    }
}

if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', () => {
        const rawName = templateNameInput ? templateNameInput.value.trim().slice(0, 20) : '';
        const now = new Date();
        const defaultName = `隊形 ${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`.slice(0, 20);
        const templateName = rawName || defaultName;
        const templates = getSavedTemplates();
        const maxOrder = templates.reduce((max, t) => Math.max(max, t.order || 0), 0);

        const newTemplate = {
            id: Date.now(),
            name: templateName,
            starred: false,
            folderId: null,
            order: maxOrder + 1,
            description: templateDescInput ? templateDescInput.value.trim() : '',
            date: `${now.getMonth()+1}/${now.getDate()}`,
            bg: state.currentBg,
            terrainData: structuredClone(state.terrainData)
        };
        templates.unshift(newTemplate);
        saveSavedTemplates(templates);
        setLoadedTemplate(newTemplate);
        showToast(`已儲存隊形：「${templateName}」！`);
        renderSavedTemplatesList();
    });
}

if (updateTemplateBtn) {
    updateTemplateBtn.addEventListener('click', () => {
        if (!state.currentLoadedTemplateId) return;
        const templates = getSavedTemplates();
        const index = templates.findIndex(t => t.id === state.currentLoadedTemplateId);
        if (index === -1) {
            showToast('找不到原模板');
            setLoadedTemplate(null);
            return;
        }
        const rawName = templateNameInput ? templateNameInput.value.trim().slice(0, 20) : '';
        templates[index].name = rawName || templates[index].name;
        templates[index].description = templateDescInput ? templateDescInput.value.trim() : '';
        templates[index].date = `${new Date().getMonth()+1}/${new Date().getDate()}`;
        templates[index].bg = state.currentBg;
        templates[index].terrainData = structuredClone(state.terrainData);
        saveSavedTemplates(templates);
        showToast(`已更新隊形：「${templates[index].name}」！`);
        renderSavedTemplatesList();
        updateSaveButtonsVisibility();
    });
}

function renameTemplate(id) {
    const templates = getSavedTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;
    const newName = prompt('請輸入新的模板名稱（最多20字）：', target.name);
    if (newName !== null && newName.trim() !== '') {
        target.name = newName.trim().slice(0, 20);
        saveSavedTemplates(templates);
        renderSavedTemplatesList();
        if (state.currentLoadedTemplateId === id && templateNameInput) {
            templateNameInput.value = target.name;
            updateSaveButtonsVisibility();
        }
        showToast('模板名稱已更新！');
    }
}

function renameFolder(folderId) {
    const folders = getSavedFolders();
    const target = folders.find(f => f.id === folderId);
    if (!target) return;
    const newName = prompt('請輸入新的資料夾名稱（最多20字）：', target.name);
    if (newName !== null && newName.trim() !== '') {
        target.name = newName.trim().slice(0, 20);
        saveSavedFolders(folders);
        renderSavedTemplatesList();
        showToast('資料夾名稱已更新！');
    }
}

function deleteFolder(folderId, folderName) {
    if (confirm(`確定要刪除資料夾「${folderName}」嗎？這會連同其中模板刪除！`)) {
        saveSavedFolders(getSavedFolders().filter(f => f.id !== folderId));
        saveSavedTemplates(getSavedTemplates().filter(t => t.folderId !== folderId));
        setLoadedTemplate(null);
        renderSavedTemplatesList();
        showToast('資料夾已刪除');
    }
}

function toggleStarTemplate(id) {
    const templates = getSavedTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;
    target.starred = !target.starred;
    saveSavedTemplates(templates);
    renderSavedTemplatesList();
    showToast(target.starred ? '已置頂' : '已取消置頂');
}

function deleteTemplate(id, name) {
    if (confirm(`確定要刪除隊形模板「${name}」嗎？`)) {
        saveSavedTemplates(getSavedTemplates().filter(t => t.id !== id));
        if (state.currentLoadedTemplateId === id) setLoadedTemplate(null);
        else updateSaveButtonsVisibility();
        renderSavedTemplatesList();
        showToast('模板已刪除');
    }
}

function handleTemplateFolderAction(id) {
    const templates = getSavedTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;

    if (target.folderId) {
        if (confirm(`確定要將隊形「${target.name}」移離目前資料夾嗎？`)) {
            target.folderId = null;
            saveSavedTemplates(templates);
            renderSavedTemplatesList();
            showToast('已將隊形移出資料夾');
        }
    } else {
        const folders = getSavedFolders();
        if (folders.length === 0) {
            showToast('目前尚無任何資料夾，請先建立資料夾！');
            return;
        }

        let selectModal = document.getElementById('folderSelectModal');
        if (!selectModal) {
            selectModal = document.createElement('div');
            selectModal.id = 'folderSelectModal';
            selectModal.className = 'modal-overlay';
            document.body.appendChild(selectModal);
        }

        const foldersHtml = folders.map(f => `
            <button class="secondary folder-select-option" data-folder-id="${f.id}" style="width:100%;justify-content:flex-start;gap:8px;padding:12px;">
                📁 ${f.name}
            </button>
        `).join('');

        selectModal.innerHTML = `
            <div class="form-modal" style="max-width: 320px;">
                <div class="form-modal-header">
                    <span>選擇要加入的資料夾</span>
                    <button class="drawer-close-btn" id="closeFolderSelectBtn">✕</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow-y:auto;padding-top:4px;">
                    ${foldersHtml}
                </div>
            </div>
        `;
        selectModal.classList.add('open');

        const closeModal = () => selectModal.classList.remove('open');
        document.getElementById('closeFolderSelectBtn').onclick = closeModal;
        selectModal.onclick = (e) => { if (e.target === selectModal) closeModal(); };

        selectModal.querySelectorAll('.folder-select-option').forEach(btn => {
            btn.onclick = () => {
                const folderId = Number(btn.dataset.folderId);
                target.folderId = folderId;
                saveSavedTemplates(templates);
                renderSavedTemplatesList();
                closeModal();
                const matchedFolder = folders.find(f => f.id === folderId);
                showToast(`已成功加入資料夾：「${matchedFolder ? matchedFolder.name : ''}」`);
            };
        });
    }
}

let draggedItem = null;

function renderSavedTemplatesList() {
    if (!savedTemplatesList) return;
    const templates = getSavedTemplates();
    const folders = getSavedFolders();
    savedTemplatesList.innerHTML = '';

    if (templates.length === 0 && folders.length === 0) {
        savedTemplatesList.innerHTML = '<div class="empty-units">尚無儲存的隊形模板</div>';
        return;
    }

    folders.sort((a, b) => (a.order || 0) - (b.order || 0));

    folders.forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = `folder-container ${folder.collapsed ? 'collapsed' : ''}`;
        folderEl.draggable = true;
        const folderTemplates = templates.filter(t => t.folderId === folder.id);

        folderEl.innerHTML = `
            <div class="folder-header">
                <div class="folder-title">
                    <span class="folder-toggle-icon">${folder.collapsed ? '▶' : '▼'}</span>
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${folder.name}</span>
                    <span class="folder-count">(${folderTemplates.length})</span>
                </div>
                <div style="display: flex; align-items: center; gap: 2px;">
                    <button class="edit-folder-btn" title="重命名資料夾">✏️</button>
                    <button class="folder-delete-btn" title="刪除資料夾">✕</button>
                </div>
            </div>
            <div class="folder-content" style="${folder.collapsed ? 'display: none;' : ''}"></div>
        `;

        const header = folderEl.querySelector('.folder-header');
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            folder.collapsed = !folder.collapsed;
            saveSavedFolders(folders);
            renderSavedTemplatesList();
        });
        folderEl.querySelector('.edit-folder-btn').addEventListener('click', (e) => { e.stopPropagation(); renameFolder(folder.id); });
        folderEl.querySelector('.folder-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteFolder(folder.id, folder.name); });

        folderEl.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            draggedItem = { type: 'folder', id: folder.id };
            setTimeout(() => folderEl.classList.add('dragging'), 0);
            e.dataTransfer.effectAllowed = 'move';
        });
        folderEl.addEventListener('dragend', () => { folderEl.classList.remove('dragging'); draggedItem = null; });

        const content = folderEl.querySelector('.folder-content');
        
        const handleDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedItem && draggedItem.type === 'card') {
                e.dataTransfer.dropEffect = 'move';
                folderEl.classList.add('drag-over-folder');
            }
        };

        const handleDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            folderEl.classList.remove('drag-over-folder');
            if (!draggedItem) return;
            if (draggedItem.type === 'card') {
                const currentTemplates = getSavedTemplates();
                const t = currentTemplates.find(x => x.id === draggedItem.id);
                if (t && t.folderId !== folder.id) {
                    t.folderId = folder.id;
                    saveSavedTemplates(currentTemplates);
                    renderSavedTemplatesList();
                    showToast(`已移入資料夾：「${folder.name}」`);
                }
            }
        };

        folderEl.addEventListener('dragover', handleDragOver);
        folderEl.addEventListener('dragleave', () => folderEl.classList.remove('drag-over-folder'));
        folderEl.addEventListener('drop', handleDrop);

        content.addEventListener('dragover', handleDragOver);
        content.addEventListener('dragleave', () => folderEl.classList.remove('drag-over-folder'));
        content.addEventListener('drop', handleDrop);

        folderTemplates.sort((a, b) => (a.starred === b.starred ? (a.order || 0) - (b.order || 0) : (a.starred ? -1 : 1)));
        folderTemplates.forEach(item => content.appendChild(createTemplateCardElement(item)));

        savedTemplatesList.appendChild(folderEl);
    });

    templates.filter(t => !t.folderId).sort((a, b) => (a.starred === b.starred ? (a.order || 0) - (b.order || 0) : (a.starred ? -1 : 1))).forEach(item => {
        savedTemplatesList.appendChild(createTemplateCardElement(item));
    });

    const listDragOverHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedItem && draggedItem.type === 'card') e.dataTransfer.dropEffect = 'move';
    };

    const listDropHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedItem || draggedItem.type !== 'card') return;
        const currentTemplates = getSavedTemplates();
        const t = currentTemplates.find(x => x.id === draggedItem.id);
        if (t && t.folderId !== null) {
            t.folderId = null;
            saveSavedTemplates(currentTemplates);
            renderSavedTemplatesList();
            showToast('已將模板移出資料夾');
        }
    };

    savedTemplatesList.removeEventListener('dragover', listDragOverHandler);
    savedTemplatesList.removeEventListener('drop', listDropHandler);
    savedTemplatesList.addEventListener('dragover', listDragOverHandler);
    savedTemplatesList.addEventListener('drop', listDropHandler);
}

function createTemplateCardElement(item) {
    const card = document.createElement('div');
    card.className = `template-card ${item.starred ? 'starred' : ''}`;
    card.draggable = true;

    let totalMonsters = 0;
    if (item.terrainData) {
        for (const k in item.terrainData) totalMonsters += Object.keys(item.terrainData[k].units || {}).length;
    }

    const folderActionIcon = item.folderId ? '📂' : '📁';
    const folderActionTitle = item.folderId ? '將隊形移離資料夾' : '將隊形加入資料夾';

    card.innerHTML = `
        <div class="template-card-title">
            <button class="star-btn ${item.starred ? 'active' : ''}" title="置頂隊形">★</button>
            <span class="title-text">${item.name}</span>
            <button class="folder-action-btn" title="${folderActionTitle}">${folderActionIcon}</button>
            <button class="edit-name-btn" title="更改名稱">✏️</button>
            <button class="template-card-delete-icon" title="刪除模板">✕</button>
        </div>
        <div class="template-card-meta">時間：${item.date} | 魔物數：${totalMonsters}</div>
        <div class="template-card-actions">
            <button class="success load-btn">載入隊形</button>
        </div>
    `;

    card.querySelector('.star-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleStarTemplate(item.id); });
    card.querySelector('.folder-action-btn').addEventListener('click', (e) => { e.stopPropagation(); handleTemplateFolderAction(item.id); });
    card.querySelector('.template-card-delete-icon').addEventListener('click', (e) => { e.stopPropagation(); deleteTemplate(item.id, item.name); });
    card.querySelector('.edit-name-btn').addEventListener('click', (e) => { e.stopPropagation(); renameTemplate(item.id); });
    card.querySelector('.load-btn').addEventListener('click', () => {
        historyStack.clear();
        if (item.terrainData) state.terrainData = structuredClone(item.terrainData);
        loadFixedBackground(item.bg || 'background/board-bg-hedge.png', false, true);
        setLoadedTemplate(item);
        createBoard();
        closeDrawer();
        showToast(`已載入隊形：「${item.name}」`);
    });

    card.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedItem = { type: 'card', id: item.id };
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    return card;
}

// ==================== JSON 匯出與匯入 ====================
if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
        const templateName = templateNameInput ? templateNameInput.value.trim() || '未命名隊形' : '未命名隊形';
        const exportData = {
            name: templateName,
            description: templateDescInput ? templateDescInput.value.trim() : '',
            bg: state.currentBg,
            terrainData: structuredClone(state.terrainData),
            date: `${new Date().getMonth()+1}/${new Date().getDate()}`
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `${templateName}_export.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('已成功匯出模板檔案！');
    });
}

if (importJsonBtn && importFileInput) {
    importJsonBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const imported = JSON.parse(event.target.result);
                if (!imported.terrainData || !imported.bg) throw new Error('格式錯誤');

                historyStack.clear();
                state.currentBg = imported.bg;
                state.terrainData = structuredClone(imported.terrainData);
                
                if (bgSelect) bgSelect.value = imported.bg;
                loadFixedBackground(imported.bg, false, true);

                const importedTemplate = {
                    id: Date.now(),
                    name: imported.name || '匯入模板',
                    description: imported.description || imported.desc || imported.content || '',
                    bg: imported.bg,
                    terrainData: imported.terrainData
                };

                setLoadedTemplate(importedTemplate);
                createBoard();
                showToast('已成功匯入模板！');
            } catch (err) {
                showToast('匯入失敗：檔案格式不正確');
            } finally {
                importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    });
}

// ==================== 初始化執行 ====================
createBoard();
loadFixedBackground();
autoLoadIcons();
updateSaveButtonsVisibility();
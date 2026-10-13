// ==================== Storage ====================
const STORAGE_KEY = 'coop_saved_templates';
const FOLDERS_KEY = 'coop_saved_folders';

function getSavedTemplates() {
    try {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) return JSON.parse(localData);
    } catch (e) {}
    return [];
}

function saveSavedTemplates(templates) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {}
}

function getSavedFolders() {
    try {
        const localData = localStorage.getItem(FOLDERS_KEY);
        if (localData) return JSON.parse(localData);
    } catch (e) {}
    return [];
}

function saveSavedFolders(folders) {
    try {
        localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {}
}

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
        name: '綠籬地形', cols: 7, rows: 5, defaultWidth: 750, defaultHeight: 505,
        colFracs: [93, 95, 95, 96, 95, 98, 100].map(v => v / 650),
        rowFracs: [110, 115, 116, 116, 115].map(v => v / 572),
        paddingTopRatio: 0, paddingBottomRatio: 0, paddingLeftRatio: 0,
        blockedCells: new Set(['0-0', '6-0', '0-1', '1-1', '2-1', '4-1', '5-1', '6-1', '2-2', '4-2', '2-3', '4-3', '2-4', '3-4', '4-4'])
    },
    'background/board-bg-guardwall.png': {
        name: '城牆地形', cols: 7, rows: 3, defaultWidth: 900, defaultHeight: 450,
        // 將左右邊距從 0.03 縮小到 0.010，讓整體網格向左右擴展
        colFracs: Array(7).fill((1 - 0.001 * 2) / 7),
        rowFracs: Array(3).fill((1 - 0.19 - 0.005) / 3),
        paddingTopRatio: 0.19, 
        paddingBottomRatio: 0.005, 
        paddingLeftRatio: 0.001, // 縮小左右留白
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
    let baseId = null, formIndex = 0, attachment = null;
    if (typeof placed === 'object' && placed !== null) {
        if (placed.baseId) baseId = String(placed.baseId);
        else if (placed.id) baseId = String(placed.id);
        else if (placed.unitId) baseId = String(placed.unitId);
        if (typeof placed.formIndex === 'number') formIndex = placed.formIndex;
        if (placed.attachment) attachment = normalizePlacedUnit(placed.attachment);
    }
    if (typeof placed === 'number') baseId = `monster_${placed}`;
    if (typeof placed === 'string') {
        const matchMulti = placed.match(/image(\d+)_(\d+)\.png/i);
        if (matchMulti) {
            baseId = `monster_${matchMulti[1]}`;
            formIndex = Math.max(0, parseInt(matchMulti[2], 10) - 1);
        } else {
            const matchSingle = placed.match(/image(\d+)\.png/i);
            if (matchSingle) {
                baseId = `monster_${matchSingle[1]}`; formIndex = 0;
            } else if (placed.startsWith('monster_')) baseId = placed;
            else if (placed.startsWith('monster')) baseId = `monster_${placed.replace('monster', '')}`;
            else if (!isNaN(parseInt(placed, 10))) baseId = `monster_${parseInt(placed, 10)}`;
        }
    }
    if (!baseId) return null;
    if (!baseId.startsWith('monster_')) {
        const num = baseId.replace(/\D/g, '');
        if (num) baseId = `monster_${num}`;
    }
    return { baseId, formIndex, attachment };
}

const state = {
    cols: 7, rows: 5, cellW: 105, cellH: 112, colFracs: null, rowFracs: null,
    paddingTopRatio: 0, paddingBottomRatio: 0, paddingLeftRatio: 0,
    selectedUnitId: null, selectedFormIndex: 0, deleteMode: false, markOrderMode: false,
    loadedMonsters: [], bgImage: null, currentBg: 'background/board-bg-hedge.png',
    currentLoadedTemplateId: null, maxBoardWidth: 760,
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

const historyStack = {
    undoList: [], redoList: [], maxSize: 30,
    pushState() {
        this.undoList.push({ currentBg: state.currentBg, terrainData: JSON.parse(JSON.stringify(state.terrainData)) });
        if (this.undoList.length > this.maxSize) this.undoList.shift();
        this.redoList = [];
        updateUndoRedoButtons();
    },
    undo() {
        if (this.undoList.length === 0) return;
        this.redoList.push({ currentBg: state.currentBg, terrainData: JSON.parse(JSON.stringify(state.terrainData)) });
        const prev = this.undoList.pop();
        state.currentBg = prev.currentBg;
        state.terrainData = JSON.parse(JSON.stringify(prev.terrainData));
        if (bgSelect) bgSelect.value = state.currentBg;
        loadFixedBackground(state.currentBg, false, true);
        updateUndoRedoButtons();
    },
    redo() {
        if (this.redoList.length === 0) return;
        this.undoList.push({ currentBg: state.currentBg, terrainData: JSON.parse(JSON.stringify(state.terrainData)) });
        const next = this.redoList.pop();
        state.currentBg = next.currentBg;
        state.terrainData = JSON.parse(JSON.stringify(next.terrainData));
        if (bgSelect) bgSelect.value = state.currentBg;
        loadFixedBackground(state.currentBg, false, true);
        updateUndoRedoButtons();
    },
    clear() { this.undoList = []; this.redoList = []; updateUndoRedoButtons(); }
};

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = historyStack.undoList.length === 0;
    if (redoBtn) redoBtn.disabled = historyStack.redoList.length === 0;
}

if (undoBtn) undoBtn.addEventListener('click', () => { historyStack.undo(); createBoard(); showToast('已復原上一步操作'); });
if (redoBtn) redoBtn.addEventListener('click', () => { historyStack.redo(); createBoard(); showToast('已重做操作'); });

const boardEl = document.getElementById('gameBoard');
const boardBgEl = document.getElementById('boardBackground');
const unitsGrid = document.getElementById('unitsGrid');
const deleteModeBtn = document.getElementById('deleteModeBtn');
const clearBtn = document.getElementById('clearBtn');
const markOrderBtn = document.getElementById('markOrderBtn');
const copyTemplateBtn = document.getElementById('copyTemplateBtn');
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

if (formModal) formModal.addEventListener('click', (e) => e.stopPropagation());

function openUpdateLog() { updateLogOverlay.classList.add('open'); }
function closeUpdateLog() { updateLogOverlay.classList.remove('open'); }
if (updateLogBtn) updateLogBtn.addEventListener('click', openUpdateLog);
if (closeUpdateLogBtn) closeUpdateLogBtn.addEventListener('click', closeUpdateLog);
if (updateLogOverlay) updateLogOverlay.addEventListener('click', (e) => { if (e.target === updateLogOverlay) closeUpdateLog(); });

function showToast(msg, duration = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
}

function getCellKey(x, y) { return `${x}-${y}`; }

function updateSaveButtonsVisibility() {
    const rawName = templateNameInput.value.trim().slice(0, 20);
    const templates = getSavedTemplates();
    const existing = templates.find(t => t.name === rawName);
    if (existing && rawName !== '') {
        saveTemplateBtn.style.display = 'none';
        updateTemplateBtn.style.display = 'block';
        state.currentLoadedTemplateId = existing.id;
    } else {
        saveTemplateBtn.style.display = 'block';
        updateTemplateBtn.style.display = 'none';
        state.currentLoadedTemplateId = null;
    }
}
templateNameInput.addEventListener('input', updateSaveButtonsVisibility);

function setLoadedTemplate(template) {
    if (template) {
        state.currentLoadedTemplateId = template.id;
        templateNameInput.value = template.name;
        templateDescInput.value = template.description || '';
    } else {
        state.currentLoadedTemplateId = null;
        templateNameInput.value = '';
        templateDescInput.value = '';
    }
    updateSaveButtonsVisibility();
}

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
            if (opt) { const optImg = opt.querySelector('img'); if (optImg) optImg.src = form.src; }
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

function closeFormModal() { formModalOverlay.classList.remove('open'); }
closeFormModalBtn.addEventListener('click', closeFormModal);
formModalOverlay.addEventListener('click', (e) => { if (e.target === formModalOverlay) closeFormModal(); });

openDrawerBtn.addEventListener('click', () => { templatesDrawer.classList.add('open'); drawerOverlay.classList.add('open'); });
function closeDrawer() { templatesDrawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }
closeDrawerBtn.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

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

function applyTerrainConfig(config, naturalWidth, naturalHeight) {
    state.cols = config.cols; state.rows = config.rows;
    state.colFracs = config.colFracs; state.rowFracs = config.rowFracs;
    state.paddingTopRatio = config.paddingTopRatio || 0;
    state.paddingBottomRatio = config.paddingBottomRatio || 0;
    state.paddingLeftRatio = config.paddingLeftRatio || 0;
    const maxW = window.innerWidth < 768 ? Math.min(340, window.innerWidth - 40) : state.maxBoardWidth;
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
    boardBgEl.style.backgroundImage = `url('${bgPath}')`;
    const config = TERRAIN_CONFIGS[bgPath] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { state.bgImage = img; applyTerrainConfig(config, img.naturalWidth, img.naturalHeight); createBoard(); };
    img.onerror = () => { state.bgImage = null; applyTerrainConfig(config, config.defaultWidth || 700, config.defaultHeight || 500); createBoard(); };
    img.src = bgPath;
}

if (bgSelect) bgSelect.addEventListener('change', (e) => loadFixedBackground(e.target.value, true, false));

function createBoard() {
    boardEl.innerHTML = '';
    const config = TERRAIN_CONFIGS[state.currentBg] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    const maxW = window.innerWidth < 768 ? Math.min(340, window.innerWidth - 40) : state.maxBoardWidth;
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
    boardEl.style.gridTemplateColumns = state.colFracs ? state.colFracs.map(f => Math.round(f * playableW) + 'px').join(' ') : `repeat(${state.cols}, ${state.cellW}px)`;
    boardEl.style.gridTemplateRows = state.rowFracs ? state.rowFracs.map(f => Math.round(f * playableH) + 'px').join(' ') : `repeat(${state.rows}, ${state.cellH}px)`;

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

            if (state.orders[key]) {
                const badge = document.createElement('div');
                badge.className = 'order-badge';
                badge.textContent = state.orders[key];
                cell.appendChild(badge);
            }

            cell.addEventListener('click', () => onCellClick(x, y));
            cell.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (state.units[key] && !state.markOrderMode && !state.deleteMode) openFormModalForCell(key);
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
                if (monsterId) { historyStack.pushState(); placeUnit(x, y, monsterId, state.selectedFormIndex); }
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
        if (!existing) { showToast('請先在此格子放置一般魔物，才能加入附屬型！'); return; }
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
    if (state.markOrderMode) {
        if (!state.units[key]) { showToast('該位置沒有魔物，無法設定順序！'); return; }
        historyStack.pushState();
        if (state.orders[key]) { delete state.orders[key]; createBoard(); showToast('已移除該格子的順序標示'); return; }
        if (Object.keys(state.orders).length >= 20) { showToast('已達到最大標示數量（20個）！'); return; }
        state.orders[key] = Object.keys(state.orders).length + 1;
        createBoard();
        return;
    }
    if (state.deleteMode) {
        if (state.units[key]) {
            historyStack.pushState();
            const placed = normalizePlacedUnit(state.units[key]);
            if (placed && placed.attachment) {
                placed.attachment = null; state.units[key] = placed; createBoard(); showToast('已移除格內的附屬型魔物'); return;
            }
            delete state.units[key]; delete state.orders[key]; createBoard(); showToast('已刪除格內魔物');
        }
        return;
    }
    if (state.blockedCells && state.blockedCells.has(key)) { showToast('該區域無法放置魔物！'); return; }
    if (state.selectedUnitId) { historyStack.pushState(); placeUnit(x, y, state.selectedUnitId, state.selectedFormIndex); }
}

async function autoLoadIcons() {
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
        const singleResult = results[5];
        const forms = [];
        if (multiResults[0].ok) {
            for (let i = 0; i < 7; i++) {
                if (multiResults[i].ok) forms.push({ formIndex: i, src: multiSrcs[i], name: `形態 ${i + 1}` });
                else break;
            }
        } else if (singleResult.ok) {
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
        renderSavedTemplatesList(); createBoard(); return;
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
                        if (state.deleteMode) { state.deleteMode = false; deleteModeBtn.className = 'secondary'; deleteModeBtn.textContent = '🗑️ 刪除'; }
                        if (state.markOrderMode) { state.markOrderMode = false; markOrderBtn.classList.remove('active'); }
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
    createBoard(); renderSavedTemplatesList();
}

deleteModeBtn.addEventListener('click', () => {
    state.deleteMode = !state.deleteMode;
    if (state.deleteMode) {
        deleteModeBtn.className = 'danger'; deleteModeBtn.textContent = '✕ 退出刪除';
        state.selectedUnitId = null; document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        state.markOrderMode = false; markOrderBtn.classList.remove('active');
    } else {
        deleteModeBtn.className = 'secondary'; deleteModeBtn.textContent = '🗑️ 刪除';
    }
    createBoard();
});

markOrderBtn.addEventListener('click', () => {
    state.markOrderMode = !state.markOrderMode;
    markOrderBtn.classList.toggle('active', state.markOrderMode);
    if (state.markOrderMode) {
        historyStack.pushState(); state.orders = {};
        state.selectedUnitId = null; document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        state.deleteMode = false; deleteModeBtn.className = 'secondary'; deleteModeBtn.textContent = '🗑️ 刪除';
        createBoard(); showToast('已重置順序，請依次點擊魔物格標示 (1-20)');
    } else {
        showToast('已停止標示順序');
    }
});

clearBtn.addEventListener('click', () => {
    if (Object.keys(state.units).length === 0 && Object.keys(state.orders).length === 0) return;
    if (confirm('確定要清空的畫布與順序標示嗎？')) {
        historyStack.pushState(); state.units = {}; state.orders = {}; setLoadedTemplate(null); createBoard(); showToast('當前地形模板與順序已清空');
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    themeToggle.textContent = document.body.classList.contains('light-mode') ? '深色模式' : '淺色模式';
});

async function copyBoardTemplate() {
    const board = document.getElementById('gameBoard');
    if (!board) return showToast('找不到棋盤元件');
    showToast('正在產生高畫質圖片…');

    const boardRect = board.getBoundingClientRect();
    const cells = board.querySelectorAll('.cell');
    if (cells.length === 0) return showToast('棋盤尚無格子');

    const canvas = document.createElement('canvas');
    const config = TERRAIN_CONFIGS[state.currentBg] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];
    const bgImg = state.bgImage;
    const canvasWidth = bgImg ? bgImg.naturalWidth : (config.defaultWidth || 700);
    const canvasHeight = bgImg ? bgImg.naturalHeight : (config.defaultHeight || 500);
    const descText = templateDescInput ? templateDescInput.value.trim() : '';

    let extraHeight = 0, padding = 20, fontSize = 20, lineHeight = 28, lines = [];
    if (descText) {
        const dummyCtx = canvas.getContext('2d');
        dummyCtx.font = `${fontSize}px sans-serif`;
        const maxWidth = canvasWidth - (padding * 2);
        descText.split('\n').forEach(para => {
            let currentLine = '';
            for (let char of para) {
                if (dummyCtx.measureText(currentLine + char).width > maxWidth && currentLine !== '') {
                    lines.push(currentLine); currentLine = char;
                } else { currentLine += char; }
            }
            lines.push(currentLine);
        });
        extraHeight = (lines.length * lineHeight) + (padding * 2) + 30;
    }

    canvas.width = canvasWidth; canvas.height = canvasHeight + extraHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImg) ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);

    const scaleX = canvasWidth / boardRect.width;
    const scaleY = canvasHeight / boardRect.height;
    const drawPromises = [];

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

        const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
        if (monster) {
            const targetForm = monster.forms[placed.formIndex] || monster.forms[0];
            if (targetForm) {
                drawPromises.push(new Promise((resolve) => {
                    const img = new Image(); img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const padX = cellW * 0.05, padY = cellH * 0.05;
                        const boxW = cellW - padX * 2, boxH = cellH - padY * 2;
                        const imgAspect = img.naturalWidth / img.naturalHeight, boxAspect = boxW / boxH;
                        let drawW = boxW, drawH = boxH, drawX = cellX + padX, drawY = cellY + padY;
                        if (imgAspect > boxAspect) { drawH = boxW / imgAspect; drawY += (boxH - drawH) / 2; }
                        else { drawW = boxH * imgAspect; drawX += (boxW - drawW) / 2; }
                        ctx.drawImage(img, drawX, drawY, drawW, drawH);
                        resolve();
                    };
                    img.onerror = resolve; img.src = targetForm.src;
                }));
            }
        }
    });

    await Promise.all(drawPromises);

    cells.forEach((cell) => {
        const key = cell.dataset.key;
        if (!key || !state.orders[key] || !state.units[key]) return;
        const orderNum = state.orders[key];
        const cellRect = cell.getBoundingClientRect();
        const cellX = (cellRect.left - boardRect.left) * scaleX;
        const cellY = (cellRect.top - boardRect.top) * scaleY;
        const cellW = cellRect.width * scaleX, cellH = cellRect.height * scaleY;
        const badgeX = cellX + cellW * 0.2, badgeY = cellY + cellH * 0.22, radius = Math.max(14, cellW * 0.15);

        ctx.save();
        ctx.beginPath(); ctx.arc(badgeX, badgeY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#f1c40f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#111111'; ctx.font = `bold ${Math.round(radius * 1.3)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(orderNum), badgeX, badgeY);
        ctx.restore();
    });

    if (descText && lines.length > 0) {
        const startY = canvasHeight;
        ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, startY, canvas.width, extraHeight);
        ctx.strokeStyle = '#444444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, startY); ctx.lineTo(canvas.width, startY); ctx.stroke();
        ctx.fillStyle = '#5b9bd5'; ctx.font = `bold 22px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('【陣容說明】', padding, startY + padding);
        ctx.fillStyle = '#ffffff'; ctx.font = `${fontSize}px sans-serif`;
        let textY = startY + padding + 35;
        lines.forEach(line => { ctx.fillText(line, padding, textY); textY += lineHeight; });
    }

    canvas.toBlob(async (blob) => {
        if (!blob) { showToast('匯出失敗，請重試'); return; }
        if (navigator.clipboard && window.ClipboardItem) {
            try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('已複製高畫質模板圖片至剪貼簿！'); return; } catch (e) {}
        }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `coop_board_${Date.now()}.png`; a.click();
        showToast('已為您下載隊形模板圖片！');
    });
}

copyTemplateBtn.addEventListener('click', copyBoardTemplate);

saveTemplateBtn.addEventListener('click', () => {
    const rawName = templateNameInput.value.trim().slice(0, 20);
    const now = new Date();
    const defaultName = `隊形 ${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`.slice(0, 20);
    const templateName = rawName || defaultName;
    const templates = getSavedTemplates();
    const maxOrder = templates.reduce((max, t) => Math.max(max, t.order || 0), 0);

    const newTemplate = {
        id: Date.now(), name: templateName, starred: false, folderId: null, order: maxOrder + 1,
        description: templateDescInput.value.trim(), date: `${now.getMonth()+1}/${now.getDate()}`,
        bg: state.currentBg, terrainData: JSON.parse(JSON.stringify(state.terrainData))
    };
    templates.unshift(newTemplate);
    saveSavedTemplates(templates);
    setLoadedTemplate(newTemplate);
    showToast(`已儲存隊形：「${templateName}」！`);
    renderSavedTemplatesList();
});

updateTemplateBtn.addEventListener('click', () => {
    if (!state.currentLoadedTemplateId) return;
    const templates = getSavedTemplates();
    const index = templates.findIndex(t => t.id === state.currentLoadedTemplateId);
    if (index === -1) { showToast('找不到原模板'); setLoadedTemplate(null); return; }
    const rawName = templateNameInput.value.trim().slice(0, 20);
    templates[index].name = rawName || templates[index].name;
    templates[index].description = templateDescInput.value.trim();
    templates[index].date = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    templates[index].bg = state.currentBg;
    templates[index].terrainData = JSON.parse(JSON.stringify(state.terrainData));
    saveSavedTemplates(templates);
    showToast(`已更新隊形：「${templates[index].name}」！`);
    renderSavedTemplatesList();
    updateSaveButtonsVisibility();
});

function renameTemplate(id) {
    const templates = getSavedTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;
    const newName = prompt('請輸入新的模板名稱（最多20字）：', target.name);
    if (newName !== null && newName.trim() !== '') {
        target.name = newName.trim().slice(0, 20);
        saveSavedTemplates(templates);
        renderSavedTemplatesList();
        if (state.currentLoadedTemplateId === id) { templateNameInput.value = target.name; updateSaveButtonsVisibility(); }
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

let draggedItem = null;

function renderSavedTemplatesList() {
    let templates = getSavedTemplates();
    let folders = getSavedFolders();
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
                    <button class="edit-folder-btn" title="重命名資料夾">✏️</button>
                </div>
                <button class="folder-delete-btn" title="刪除資料夾">✕</button>
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
            e.stopPropagation(); draggedItem = { type: 'folder', id: folder.id };
            setTimeout(() => folderEl.classList.add('dragging'), 0);
            e.dataTransfer.effectAllowed = 'move';
        });
        folderEl.addEventListener('dragend', () => { folderEl.classList.remove('dragging'); draggedItem = null; });
        folderEl.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); if (draggedItem) folderEl.classList.add('drag-over-folder'); });
        folderEl.addEventListener('dragleave', () => folderEl.classList.remove('drag-over-folder'));
        folderEl.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation(); folderEl.classList.remove('drag-over-folder');
            if (!draggedItem) return;
            if (draggedItem.type === 'card') {
                const t = getSavedTemplates().find(x => x.id === draggedItem.id);
                if (t && t.folderId !== folder.id) {
                    t.folderId = folder.id;
                    saveSavedTemplates(getSavedTemplates());
                    renderSavedTemplatesList();
                    showToast(`已移入資料夾：「${folder.name}」`);
                }
            }
        });

        const content = folderEl.querySelector('.folder-content');
        folderTemplates.sort((a, b) => (a.starred === b.starred ? (a.order || 0) - (b.order || 0) : (a.starred ? -1 : 1)));
        if (folderTemplates.length === 0) content.innerHTML = '<div class="empty-folder-hint">拖曳模板卡片至此</div>';
        else folderTemplates.forEach(item => content.appendChild(createTemplateCardElement(item)));

        savedTemplatesList.appendChild(folderEl);
    });

    templates.filter(t => !t.folderId).sort((a, b) => (a.starred === b.starred ? (a.order || 0) - (b.order || 0) : (a.starred ? -1 : 1))).forEach(item => {
        savedTemplatesList.appendChild(createTemplateCardElement(item));
    });
}

function createTemplateCardElement(item) {
    const card = document.createElement('div');
    card.className = `template-card ${item.starred ? 'starred' : ''}`;
    card.draggable = true;

    let totalMonsters = 0;
    if (item.terrainData) {
        for (const k in item.terrainData) totalMonsters += Object.keys(item.terrainData[k].units || {}).length;
    }

    card.innerHTML = `
        <button class="template-card-delete-icon" title="刪除模板">✕</button>
        <div class="template-card-title">
            <button class="star-btn ${item.starred ? 'active' : ''}">★</button>
            <span class="title-text">${item.name}</span>
            <button class="edit-name-btn" title="更改名稱">✏️</button>
        </div>
        <div class="template-card-meta">時間：${item.date} | 魔物數：${totalMonsters}</div>
        <div class="template-card-actions">
            <button class="success load-btn">載入隊形</button>
        </div>
    `;

    card.querySelector('.star-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleStarTemplate(item.id); });
    card.querySelector('.template-card-delete-icon').addEventListener('click', (e) => { e.stopPropagation(); deleteTemplate(item.id, item.name); });
    card.querySelector('.edit-name-btn').addEventListener('click', (e) => { e.stopPropagation(); renameTemplate(item.id); });
    card.querySelector('.load-btn').addEventListener('click', () => {
        historyStack.clear();
        if (item.terrainData) state.terrainData = JSON.parse(JSON.stringify(item.terrainData));
        loadFixedBackground(item.bg || 'background/board-bg-hedge.png', false, true);
        setLoadedTemplate(item); createBoard(); closeDrawer(); showToast(`已載入隊形：「${item.name}」`);
    });

    card.addEventListener('dragstart', (e) => { e.stopPropagation(); draggedItem = { type: 'card', id: item.id }; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    return card;
}

// Mobile Tab Switcher Setup
function setupMobileTabSwitcher() {
    const panelLeft = document.querySelector('.panel-left');
    const boardWrapper = document.querySelector('.board-wrapper');
    const descSection = boardWrapper ? boardWrapper.querySelector('.section') : null;
    const panelRight = document.querySelector('.panel-right');

    if (!panelLeft || !descSection || !panelRight) return;

    // Create Mobile Tabs Bar Container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'mobile-tab-nav';
    tabsContainer.innerHTML = `
        <button class="mobile-tab-btn active" data-tab="desc">陣容說明</button>
        <button class="mobile-tab-btn" data-tab="monsters">魔物</button>
        <button class="mobile-tab-btn" data-tab="tools">工具與操作</button>
    `;

    // Create Sub-content Wrapper Container for Mobile Tabs
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-tab-content-wrapper';

    // Wrap elements into content panels
    const tabDesc = document.createElement('div');
    tabDesc.className = 'mobile-tab-pane active';
    tabDesc.id = 'tab-pane-desc';

    const tabMonsters = document.createElement('div');
    tabMonsters.className = 'mobile-tab-pane';
    tabMonsters.id = 'tab-pane-monsters';

    const tabTools = document.createElement('div');
    tabTools.className = 'mobile-tab-pane';
    tabTools.id = 'tab-pane-tools';

    // Move nodes
    descSection.parentNode.insertBefore(tabsContainer, descSection.nextSibling);
    tabsContainer.parentNode.insertBefore(contentWrapper, tabsContainer.nextSibling);

    tabDesc.appendChild(descSection);
    tabMonsters.appendChild(panelLeft);
    tabTools.appendChild(panelRight);

    contentWrapper.appendChild(tabDesc);
    contentWrapper.appendChild(tabMonsters);
    contentWrapper.appendChild(tabTools);

    // Add Tab Click Event Listeners
    const tabBtns = tabsContainer.querySelectorAll('.mobile-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetTab = btn.dataset.tab;
            document.querySelectorAll('.mobile-tab-pane').forEach(pane => pane.classList.remove('active'));
            if (targetTab === 'desc') tabDesc.classList.add('active');
            if (targetTab === 'monsters') tabMonsters.classList.add('active');
            if (targetTab === 'tools') tabTools.classList.add('active');
        });
    });
}

createBoard();
loadFixedBackground();
autoLoadIcons();
updateSaveButtonsVisibility();
setupMobileTabSwitcher();

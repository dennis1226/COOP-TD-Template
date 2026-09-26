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

// ==================== 地形獨立配置檔 ====================
const TERRAIN_CONFIGS = {
    'background/board-bg-hedge.png': {
        name: '綠籬地形',
        cols: 7,
        rows: 5,
        colFracs: [93, 95, 95, 96, 95, 98, 100].map(v => v / 672),
        rowFracs: [110, 115, 116, 116, 115].map(v => v / 572),
        paddingTopRatio: 0,
        paddingBottomRatio: 0,
        paddingLeftRatio: 0,
        blockedCells: new Set([
            '0-0', '6-0',
            '0-1', '1-1', '2-1', '4-1', '5-1', '6-1',
            '2-2', '4-2',
            '2-3', '4-3',
            '2-4', '3-4', '4-4'
        ])
    },
    'background/board-bg-guardwall.png': {
        name: '城牆地形',
        cols: 7,
        rows: 3,
        colFracs: Array(7).fill((1 - 0.03 * 2) / 7),
        rowFracs: Array(3).fill((1 - 0.19 - 0.03) / 3),
        paddingTopRatio: 0.19,
        paddingBottomRatio: 0.03,
        paddingLeftRatio: 0.03,
        blockedCells: new Set()
    }
};

// ==================== 舊格式容錯解析器 ====================
function normalizePlacedUnit(placed) {
    if (!placed) return null;

    let baseId = null;
    let formIndex = 0;

    if (typeof placed === 'object' && placed !== null) {
        if (placed.baseId) baseId = String(placed.baseId);
        else if (placed.id) baseId = String(placed.id);
        else if (placed.unitId) baseId = String(placed.unitId);

        if (typeof placed.formIndex === 'number') {
            formIndex = placed.formIndex;
        }

        if (!baseId && (placed.src || placed.img || placed.image)) {
            placed = placed.src || placed.img || placed.image;
        }
    }

    if (typeof placed === 'number') {
        baseId = `monster_${placed}`;
    }

    if (typeof placed === 'string') {
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

    return { baseId, formIndex };
}

// ==================== State ====================
const state = {
    cols: 7, rows: 5,
    cellW: 105, cellH: 112,
    colFracs: null, rowFracs: null,
    paddingTopRatio: 0,
    paddingBottomRatio: 0,
    paddingLeftRatio: 0,
    selectedUnitId: null,
    selectedFormIndex: 0,
    deleteMode: false,
    markOrderMode: false,
    loadedMonsters: [], 
    bgImage: null,
    currentBg: 'background/board-bg-hedge.png',
    currentLoadedTemplateId: null,
    maxBoardWidth: 700,

    terrainData: {
        'background/board-bg-hedge.png': { units: {}, orders: {} },
        'background/board-bg-guardwall.png': { units: {}, orders: {} }
    },

    get units() {
        if (!this.terrainData[this.currentBg]) {
            this.terrainData[this.currentBg] = { units: {}, orders: {} };
        }
        return this.terrainData[this.currentBg].units;
    },
    set units(val) {
        if (!this.terrainData[this.currentBg]) {
            this.terrainData[this.currentBg] = { units: {}, orders: {} };
        }
        this.terrainData[this.currentBg].units = val;
    },

    get orders() {
        if (!this.terrainData[this.currentBg]) {
            this.terrainData[this.currentBg] = { units: {}, orders: {} };
        }
        return this.terrainData[this.currentBg].orders;
    },
    set orders(val) {
        if (!this.terrainData[this.currentBg]) {
            this.terrainData[this.currentBg] = { units: {}, orders: {} };
        }
        this.terrainData[this.currentBg].orders = val;
    },

    get blockedCells() {
        return TERRAIN_CONFIGS[this.currentBg]?.blockedCells || new Set();
    }
};

// ==================== DOM Elements ====================
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
const boardWidthSelect = document.getElementById('boardWidthSelect');

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

if (formModal) {
    formModal.addEventListener('click', (e) => e.stopPropagation());
}

function openUpdateLog() {
    updateLogOverlay.classList.add('open');
}

function closeUpdateLog() {
    updateLogOverlay.classList.remove('open');
}

if (updateLogBtn) {
    updateLogBtn.addEventListener('click', openUpdateLog);
}

if (closeUpdateLogBtn) {
    closeUpdateLogBtn.addEventListener('click', closeUpdateLog);
}

if (updateLogOverlay) {
    updateLogOverlay.addEventListener('click', (e) => {
        if (e.target === updateLogOverlay) closeUpdateLog();
    });
}

// ==================== Helpers ====================
function showToast(msg, duration = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
}

function getCellKey(x, y) { return `${x}-${y}`; }

function updateSaveButtonsVisibility() {
    const rawName = templateNameInput.value.trim().slice(0, 12);
    const templates = getSavedTemplates();
    
    const existingTemplate = templates.find(t => t.name === rawName);

    if (existingTemplate && rawName !== '') {
        saveTemplateBtn.style.display = 'none';
        updateTemplateBtn.style.display = 'block';
        state.currentLoadedTemplateId = existingTemplate.id;
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

// ==================== Form Switcher Modal ====================
function openFormModalForMenu(monster) {
    if (!monster || monster.forms.length <= 1) {
        showToast('該魔物只有單一形態');
        return;
    }

    formModalTitle.textContent = '選擇預設放置形態';
    formsGrid.innerHTML = '';

    const currentIdx = monster.selectedFormIndex || 0;

    monster.forms.forEach((form, idx) => {
        const item = document.createElement('div');
        item.className = `form-item ${idx === currentIdx ? 'active' : ''}`;
        item.innerHTML = `
            <img src="${form.src}" alt="${form.name}">
            <span>${form.name}</span>
        `;
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
    const rawPlaced = state.units[cellKey];
    const placed = normalizePlacedUnit(rawPlaced);
    if (!placed) return;

    const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
    if (!monster || monster.forms.length <= 1) {
        showToast('該魔物只有單一形態');
        return;
    }

    formModalTitle.textContent = '切換格子形態';
    formsGrid.innerHTML = '';

    monster.forms.forEach((form, idx) => {
        const item = document.createElement('div');
        item.className = `form-item ${idx === placed.formIndex ? 'active' : ''}`;
        item.innerHTML = `
            <img src="${form.src}" alt="${form.name}">
            <span>${form.name}</span>
        `;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            state.units[cellKey] = {
                baseId: placed.baseId,
                formIndex: idx
            };
            createBoard();
            closeFormModal();
            showToast(`格子形態已切換為：${form.name}`);
        });
        formsGrid.appendChild(item);
    });

    formModalOverlay.classList.add('open');
}

function closeFormModal() {
    formModalOverlay.classList.remove('open');
}

closeFormModalBtn.addEventListener('click', closeFormModal);
formModalOverlay.addEventListener('click', (e) => {
    if (e.target === formModalOverlay) closeFormModal();
});

// ==================== Drawer Controls ====================
openDrawerBtn.addEventListener('click', () => { templatesDrawer.classList.add('open'); drawerOverlay.classList.add('open'); });
function closeDrawer() { templatesDrawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }
closeDrawerBtn.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

if (addFolderBtn) {
    addFolderBtn.addEventListener('click', createNewFolder);
}

function createNewFolder() {
    const folderName = prompt('請輸入新資料夾名稱（最多12字）：', '新資料夾');
    if (folderName !== null && folderName.trim() !== '') {
        const name = folderName.trim().slice(0, 12);
        const folders = getSavedFolders();
        const newFolder = {
            id: Date.now(),
            name: name,
            collapsed: false,
            parentId: null,
            order: folders.length + 1
        };
        folders.push(newFolder);
        saveSavedFolders(folders);
        renderSavedTemplatesList();
        showToast(`已建立資料夾：「${name}」`);
    }
}

// ==================== Background & Board ====================
function loadFixedBackground(bgPath = state.currentBg) {
    state.currentBg = bgPath;
    if (bgSelect) bgSelect.value = bgPath;

    boardBgEl.style.backgroundImage = `url('${bgPath}')`;

    const config = TERRAIN_CONFIGS[bgPath] || TERRAIN_CONFIGS['background/board-bg-hedge.png'];

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        state.bgImage = img;
        
        state.cols = config.cols;
        state.rows = config.rows;
        state.colFracs = config.colFracs;
        state.rowFracs = config.rowFracs;
        state.paddingTopRatio = config.paddingTopRatio || 0;
        state.paddingBottomRatio = config.paddingBottomRatio || 0;
        state.paddingLeftRatio = config.paddingLeftRatio || 0;

        const maxW = window.innerWidth < 768 ? Math.min(340, window.innerWidth - 40) : state.maxBoardWidth;
        const scale = Math.min(1, maxW / img.naturalWidth);
        
        const playableW = img.naturalWidth * (1 - state.paddingLeftRatio * 2);
        const playableH = img.naturalHeight * (1 - state.paddingTopRatio - state.paddingBottomRatio);
        
        state.cellW = Math.round((playableW / state.cols) * scale);
        state.cellH = Math.round((playableH / state.rows) * scale);

        createBoard();
    };
    img.onerror = () => {
        if (bgPath !== 'board-bg-hedge.png' && bgPath !== 'background/board-bg-hedge.png') {
            loadFixedBackground('background/board-bg-hedge.png');
        }
    };
    img.src = bgPath;
}

if (bgSelect) {
    bgSelect.addEventListener('change', (e) => {
        loadFixedBackground(e.target.value);
    });
}

if (boardWidthSelect) {
    boardWidthSelect.addEventListener('change', (e) => {
        state.maxBoardWidth = parseInt(e.target.value, 10);
        loadFixedBackground(state.currentBg);
    });
}

function createBoard() {
    boardEl.innerHTML = '';
    
    const maxW = window.innerWidth < 768 ? Math.min(340, window.innerWidth - 40) : state.maxBoardWidth;
    const fullImgW = state.bgImage ? Math.min(maxW, state.bgImage.naturalWidth) : maxW;
    const fullImgH = state.bgImage ? (fullImgW * (state.bgImage.naturalHeight / state.bgImage.naturalWidth)) : (maxW * 0.7);

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

            const rawPlaced = state.units[key];
            const placed = normalizePlacedUnit(rawPlaced);
            
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
                if (monsterId) placeUnit(x, y, monsterId, state.selectedFormIndex);
            });

            boardEl.appendChild(cell);
        }
    }
}

function placeUnit(x, y, monsterId, formIndex = 0) {
    const key = getCellKey(x, y);
    state.units[key] = {
        baseId: monsterId,
        formIndex: formIndex
    };
    createBoard();
}

function onCellClick(x, y) {
    const key = getCellKey(x, y);

    if (state.markOrderMode) {
        if (!state.units[key]) {
            showToast('該位置沒有魔物，無法設定順序！');
            return;
        }

        if (state.orders[key]) {
            delete state.orders[key];
            createBoard();
            showToast('已移除該格子的順序標示');
            return;
        }

        const currentCount = Object.keys(state.orders).length;
        if (currentCount >= 20) {
            showToast('已達到最大標示數量（20個）！');
            return;
        }

        state.orders[key] = currentCount + 1;
        createBoard();
        return;
    }

    if (state.deleteMode) {
        if (state.units[key]) {
            delete state.units[key];
            delete state.orders[key];
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
        placeUnit(x, y, state.selectedUnitId, state.selectedFormIndex);
    }
}

// ==================== Dynamic Icon Scanning ====================
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
        const multiSrcs = Array.from({ length: 5 }, (_, i) => `icon/image${m}_${i + 1}.png`);
        const singleSrc = `icon/image${m}.png`;

        const results = await Promise.all([
            ...multiSrcs.map(src => tryLoadImage(src)),
            tryLoadImage(singleSrc)
        ]);

        const multiResults = results.slice(0, 5);
        const singleResult = results[5];

        const forms = [];
        if (multiResults[0].ok) {
            for (let i = 0; i < 5; i++) {
                if (multiResults[i].ok) {
                    forms.push({ formIndex: i, src: multiSrcs[i], name: `形態 ${i + 1}` });
                } else {
                    break;
                }
            }
        } else if (singleResult.ok) {
            forms.push({ formIndex: 0, src: singleSrc, name: `預設形態` });
        }

        if (forms.length > 0) {
            return {
                id: `monster_${m}`,
                monsterNum: m,
                name: `魔物 ${m}`,
                forms: forms,
                selectedFormIndex: 0
            };
        }
        return null;
    };

    const monsterPromises = Array.from({ length: 30 }, (_, i) => checkMonster(i + 1));
    const results = await Promise.all(monsterPromises);

    state.loadedMonsters = results.filter(Boolean).sort((a, b) => a.monsterNum - b.monsterNum);

    unitsGrid.innerHTML = '';

    if (state.loadedMonsters.length === 0) {
        unitsGrid.innerHTML = `<div class="empty-units">未找到魔物圖片<br>請在 icon 資料夾放圖片<br>(如 image1_1.png)</div>`;
        renderSavedTemplatesList();
        createBoard();
        return;
    }

    state.loadedMonsters.forEach(monster => {
        const opt = document.createElement('div');
        opt.className = 'unit-option';
        opt.dataset.id = monster.id;
        opt.draggable = true;
        opt.title = `${monster.name}（包含 ${monster.forms.length} 種形態，點擊切換形態）`;

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

        const handleOptionSelect = () => {
            const isAlreadySelected = (state.selectedUnitId === monster.id);

            if (isAlreadySelected) {
                openFormModalForMenu(monster);
            } else {
                document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
                opt.classList.add('selected');
                state.selectedUnitId = monster.id;
                state.selectedFormIndex = monster.selectedFormIndex || 0;
                
                if (state.deleteMode) {
                    state.deleteMode = false;
                    deleteModeBtn.classList.remove('danger');
                    deleteModeBtn.classList.add('secondary');
                    deleteModeBtn.textContent = '🗑️ 刪除模式';
                }

                if (state.markOrderMode) {
                    state.markOrderMode = false;
                    markOrderBtn.classList.remove('active');
                }

                createBoard();

                if (monster.forms.length > 1) {
                    showToast(`已選取 ${monster.name}，再次點擊可切換預設形態`);
                }
            }
        };

        opt.addEventListener('click', handleOptionSelect);
        opt.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (monster.forms.length > 1) openFormModalForMenu(monster);
        });

        opt.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', monster.id);
            document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
            opt.classList.add('selected');
            state.selectedUnitId = monster.id;
            state.selectedFormIndex = monster.selectedFormIndex || 0;
        });

        unitsGrid.appendChild(opt);
    });

    createBoard();
    renderSavedTemplatesList();
}

// ==================== Controls ====================
deleteModeBtn.addEventListener('click', () => {
    state.deleteMode = !state.deleteMode;
    
    if (state.deleteMode) {
        deleteModeBtn.classList.remove('secondary');
        deleteModeBtn.classList.add('danger');
        deleteModeBtn.textContent = '✕ 退出刪除';
        
        state.selectedUnitId = null;
        document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        state.markOrderMode = false;
        markOrderBtn.classList.remove('active');
    } else {
        deleteModeBtn.classList.remove('danger');
        deleteModeBtn.classList.add('secondary');
        deleteModeBtn.textContent = '🗑️ 刪除模式';
    }
    
    createBoard();
});

markOrderBtn.addEventListener('click', () => {
    state.markOrderMode = !state.markOrderMode;
    markOrderBtn.classList.toggle('active', state.markOrderMode);

    if (state.markOrderMode) {
        state.orders = {};

        state.selectedUnitId = null;
        document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        state.deleteMode = false;
        deleteModeBtn.classList.remove('danger');
        deleteModeBtn.classList.add('secondary');
        deleteModeBtn.textContent = '🗑️ 刪除模式';

        createBoard();
        showToast('已重置順序，請依次點擊魔物格標示 (1-20)');
    } else {
        showToast('已停止標示順序');
    }
});

clearBtn.addEventListener('click', () => {
    if (Object.keys(state.units).length === 0 && Object.keys(state.orders).length === 0) return;
    if (confirm('確定要清空當前地形的畫布與順序標示嗎？')) {
        state.units = {};
        state.orders = {};
        setLoadedTemplate(null);
        createBoard();
        showToast('當前地形模板與順序已清空');
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    themeToggle.textContent = document.body.classList.contains('light-mode') ? '深色模式' : '淺色模式';
});

// ==================== Copy Canvas Image ====================
async function copyBoardTemplate() {
    const board = document.getElementById('gameBoard');
    if (!board) return showToast('找不到棋盤元件');
    
    showToast('正在產生高畫質圖片…');

    const boardRect = board.getBoundingClientRect();
    const cells = board.querySelectorAll('.cell');
    
    if (cells.length === 0) return showToast('棋盤尚無格子');

    const canvas = document.createElement('canvas');
    const bgImg = state.bgImage;
    
    if (!bgImg) return showToast('背景圖未載入');

    const descText = templateDescInput ? templateDescInput.value.trim() : '';

    let extraHeight = 0;
    const padding = 20;
    const fontSize = 20;
    const lineHeight = 28;
    let lines = [];

    if (descText) {
        const dummyCtx = canvas.getContext('2d');
        dummyCtx.font = `${fontSize}px sans-serif`;
        const maxWidth = bgImg.naturalWidth - (padding * 2);
        
        const paragraphs = descText.split('\n');
        paragraphs.forEach(para => {
            let currentLine = '';
            for (let char of para) {
                const testLine = currentLine + char;
                if (dummyCtx.measureText(testLine).width > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);
        });

        extraHeight = (lines.length * lineHeight) + (padding * 2) + 30;
    }

    canvas.width = bgImg.naturalWidth;
    canvas.height = bgImg.naturalHeight + extraHeight;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(bgImg, 0, 0, bgImg.naturalWidth, bgImg.naturalHeight);

    const scaleX = bgImg.naturalWidth / boardRect.width;
    const scaleY = bgImg.naturalHeight / boardRect.height;

    const drawPromises = [];

    cells.forEach((cell) => {
        const key = cell.dataset.key;
        if (!key) return;

        const rawPlaced = state.units[key];
        const placed = normalizePlacedUnit(rawPlaced);
        if (!placed) return;

        const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
        if (!monster) return;

        const targetForm = monster.forms[placed.formIndex] || monster.forms[0];
        if (!targetForm) return;

        const cellRect = cell.getBoundingClientRect();
        const cellX = (cellRect.left - boardRect.left) * scaleX;
        const cellY = (cellRect.top - boardRect.top) * scaleY;
        const cellW = cellRect.width * scaleX;
        const cellH = cellRect.height * scaleY;

        drawPromises.push(new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const padX = cellW * 0.05;
                const padY = cellH * 0.05;
                const boxW = cellW - padX * 2;
                const boxH = cellH - padY * 2;

                const imgAspect = img.naturalWidth / img.naturalHeight;
                const boxAspect = boxW / boxH;

                let drawW = boxW, drawH = boxH;
                let drawX = cellX + padX;
                let drawY = cellY + padY;

                if (imgAspect > boxAspect) {
                    drawH = boxW / imgAspect;
                    drawY += (boxH - drawH) / 2;
                } else {
                    drawW = boxH * imgAspect;
                    drawX += (boxW - drawW) / 2;
                }

                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                resolve();
            };
            img.onerror = resolve;
            img.src = targetForm.src;
        }));
    });

    await Promise.all(drawPromises);

    cells.forEach((cell) => {
        const key = cell.dataset.key;
        if (!key || !state.orders[key] || !state.units[key]) return;

        const orderNum = state.orders[key];
        const cellRect = cell.getBoundingClientRect();
        
        const cellX = (cellRect.left - boardRect.left) * scaleX;
        const cellY = (cellRect.top - boardRect.top) * scaleY;
        const cellW = cellRect.width * scaleX;
        const cellH = cellRect.height * scaleY;

        const badgeX = cellX + cellW * 0.2;
        const badgeY = cellY + cellH * 0.22;
        const radius = Math.max(14, cellW * 0.15);

        ctx.save();
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#111111';
        ctx.font = `bold ${Math.round(radius * 1.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(orderNum), badgeX, badgeY);
        ctx.restore();
    });

    if (descText && lines.length > 0) {
        const startY = bgImg.naturalHeight;
        
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(0, startY, canvas.width, extraHeight);

        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, startY);
        ctx.lineTo(canvas.width, startY);
        ctx.stroke();

        ctx.fillStyle = '#5b9bd5';
        ctx.font = `bold 22px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('【陣容說明】', padding, startY + padding);

        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px sans-serif`;
        let textY = startY + padding + 35;
        
        lines.forEach(line => {
            ctx.fillText(line, padding, textY);
            textY += lineHeight;
        });
    }

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('匯出失敗，請重試');
            return;
        }
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast('已複製高畫質模板圖片至剪貼簿！');
                return;
            } catch (e) {}
        }
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `coop_board_${Date.now()}.png`;
        a.click();
        showToast('已為您下載隊形模板圖片！');
    });
}

copyTemplateBtn.addEventListener('click', copyBoardTemplate);

// ==================== Save & Load & Update Templates ====================
saveTemplateBtn.addEventListener('click', () => {
    const rawName = templateNameInput.value.trim().slice(0, 12);
    const now = new Date();
    const defaultName = `隊形 ${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`.slice(0, 12);
    const templateName = rawName || defaultName;

    const templates = getSavedTemplates();
    const maxOrder = templates.reduce((max, t) => Math.max(max, t.order !== undefined ? t.order : 0), 0);

    const newTemplate = {
        id: Date.now(),
        name: templateName,
        starred: false,
        folderId: null,
        order: maxOrder + 1,
        description: templateDescInput.value.trim(),
        date: `${now.getMonth()+1}/${now.getDate()}`,
        bg: state.currentBg,
        terrainData: JSON.parse(JSON.stringify(state.terrainData))
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

    if (index === -1) {
        showToast('找不到原模板，可能已被刪除');
        setLoadedTemplate(null);
        return;
    }

    const rawName = templateNameInput.value.trim().slice(0, 12);
    const updatedName = rawName || templates[index].name;

    templates[index].name = updatedName;
    templates[index].description = templateDescInput.value.trim();
    templates[index].date = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    templates[index].bg = state.currentBg;
    templates[index].terrainData = JSON.parse(JSON.stringify(state.terrainData));

    saveSavedTemplates(templates);
    showToast(`已更新隊形：「${updatedName}」！`);
    renderSavedTemplatesList();
    updateSaveButtonsVisibility();
});

function renameTemplate(id) {
    const templates = getSavedTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;

    const newName = prompt('請輸入新的模板名稱（最多12字）：', target.name);
    if (newName !== null && newName.trim() !== '') {
        const trimmedName = newName.trim().slice(0, 12);
        target.name = trimmedName;
        saveSavedTemplates(templates);
        renderSavedTemplatesList();
        
        if (state.currentLoadedTemplateId === id) {
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

    const newName = prompt('請輸入新的資料夾名稱（最多12字）：', target.name);
    if (newName !== null && newName.trim() !== '') {
        target.name = newName.trim().slice(0, 12);
        saveSavedFolders(folders);
        renderSavedTemplatesList();
        showToast('資料夾名稱已更新！');
    }
}

function deleteFolder(folderId, folderName) {
    if (confirm(`確定要刪除資料夾「${folderName}」嗎？\n資料夾內的模板將會移至最外層。`)) {
        let folders = getSavedFolders();
        folders = folders.filter(f => f.id !== folderId);
        folders.forEach(f => {
            if (f.parentId === folderId) f.parentId = null;
        });
        saveSavedFolders(folders);

        let templates = getSavedTemplates();
        templates.forEach(t => {
            if (t.folderId === folderId) {
                t.folderId = null;
            }
        });
        saveSavedTemplates(templates);

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
    showToast(target.starred ? '已將模板標示星號置頂' : '已取消置頂');
}

function deleteTemplate(id, name) {
    if (confirm(`確定要刪除隊形模板「${name}」嗎？`)) {
        saveSavedTemplates(getSavedTemplates().filter(t => t.id !== id));
        if (state.currentLoadedTemplateId === id) {
            setLoadedTemplate(null);
        } else {
            updateSaveButtonsVisibility();
        }
        renderSavedTemplatesList();
        showToast('模板已刪除');
    }
}

// 拖拽排序全域變數 (支援 'card' 與 'folder')
let draggedItem = null;

function renderSavedTemplatesList() {
    let templates = getSavedTemplates();
    let folders = getSavedFolders();

    savedTemplatesList.innerHTML = '';

    if (templates.length === 0 && folders.length === 0) {
        savedTemplatesList.innerHTML = '<div class="empty-units">尚無儲存的隊形模板</div>';
        return;
    }

    renderFolderTree(null, savedTemplatesList, folders, templates);

    // 最外層支援將模板卡片拖出資料夾
    savedTemplatesList.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    savedTemplatesList.addEventListener('drop', (e) => {
        if (e.target === savedTemplatesList && draggedItem && draggedItem.type === 'card') {
            const templateId = draggedItem.id;
            const currentTemplates = getSavedTemplates();
            const target = currentTemplates.find(t => t.id === templateId);
            if (target && target.folderId) {
                target.folderId = null;
                const rootSiblings = currentTemplates.filter(t => !t.folderId);
                target.order = rootSiblings.length + 1;

                saveSavedTemplates(currentTemplates);
                renderSavedTemplatesList();
                showToast('已將模板移至外層');
            }
        }
    });
}

function renderFolderTree(parentId, container, folders, templates) {
    const currentFolders = folders.filter(f => (f.parentId || null) === parentId);
    currentFolders.sort((a, b) => (a.order || 0) - (b.order || 0));

    currentFolders.forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = `folder-container ${folder.collapsed ? 'collapsed' : ''}`;
        folderEl.dataset.folderId = folder.id;
        folderEl.draggable = true; // 允許資料夾拖拽排序

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

        const folderHeader = folderEl.querySelector('.folder-header');

        // 折疊/展開
        folderHeader.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            folder.collapsed = !folder.collapsed;
            saveSavedFolders(folders);
            renderSavedTemplatesList();
        });

        folderEl.querySelector('.edit-folder-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            renameFolder(folder.id);
        });

        folderEl.querySelector('.folder-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFolder(folder.id, folder.name);
        });

        // ==================== 資料夾拖放事件 (Folder Drag & Drop) ====================
        folderEl.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            draggedItem = { type: 'folder', id: folder.id, el: folderEl };
            setTimeout(() => folderEl.classList.add('dragging'), 0);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `folder:${folder.id}`);
        });

        folderEl.addEventListener('dragend', (e) => {
            e.stopPropagation();
            folderEl.classList.remove('dragging');
            draggedItem = null;
            document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
        });

        folderEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!draggedItem) return;

            if (draggedItem.type === 'card') {
                folderEl.classList.add('drag-over-folder');
            } else if (draggedItem.type === 'folder' && draggedItem.id !== folder.id) {
                folderEl.classList.add('drag-over-folder');
            }
        });

        folderEl.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            folderEl.classList.remove('drag-over-folder');
        });

        folderEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            folderEl.classList.remove('drag-over-folder');

            if (!draggedItem) return;

            // 1. 拖曳「模板卡片」放入資料夾
            if (draggedItem.type === 'card') {
                const templateId = draggedItem.id;
                const currentTemplates = getSavedTemplates();
                const target = currentTemplates.find(t => t.id === templateId);
                if (target && target.folderId !== folder.id) {
                    target.folderId = folder.id;
                    const siblings = currentTemplates.filter(t => t.folderId === folder.id);
                    target.order = siblings.length + 1;

                    saveSavedTemplates(currentTemplates);
                    renderSavedTemplatesList();
                    showToast(`已移入資料夾「${folder.name}」`);
                }
            } 
            // 2. 拖曳「資料夾」重調順序（填充自動遞補）
            else if (draggedItem.type === 'folder' && draggedItem.id !== folder.id) {
                const draggedFolderId = draggedItem.id;
                const targetFolderId = folder.id;

                let currentFolders = getSavedFolders();
                const draggedFolder = currentFolders.find(f => f.id === draggedFolderId);
                const targetFolder = currentFolders.find(f => f.id === targetFolderId);

                if (!draggedFolder || !targetFolder) return;

                // 同一父層才可以進行順序交換與重新填充
                if ((draggedFolder.parentId || null) === (targetFolder.parentId || null)) {
                    const siblings = currentFolders.filter(f => (f.parentId || null) === (targetFolder.parentId || null));
                    siblings.sort((a, b) => (a.order || 0) - (b.order || 0));

                    const draggedIdx = siblings.findIndex(f => f.id === draggedFolderId);
                    const targetIdx = siblings.findIndex(f => f.id === targetFolderId);

                    // 重新排列資料夾陣列（自動把中間的資料夾推開填充）
                    siblings.splice(draggedIdx, 1);
                    const rect = folderEl.getBoundingClientRect();
                    const isAfter = (e.clientY - rect.top) > (rect.height / 2);
                    
                    const insertIdx = isAfter ? targetIdx + 1 : targetIdx;
                    siblings.splice(insertIdx, 0, draggedFolder);

                    // 重新設置 order 屬性
                    siblings.forEach((f, idx) => {
                        f.order = idx + 1;
                    });

                    saveSavedFolders(currentFolders);
                    renderSavedTemplatesList();
                    showToast('已調整資料夾順序');
                }
            }
        });

        const folderContent = folderEl.querySelector('.folder-content');

        // 遞迴渲染子資料夾
        renderFolderTree(folder.id, folderContent, folders, templates);

        // 渲染資料夾內的模板卡片
        folderTemplates.sort((a, b) => (a.starred === b.starred ? (a.order || 0) - (b.order || 0) : (a.starred ? -1 : 1)));
        
        if (folderTemplates.length === 0 && folders.filter(f => f.parentId === folder.id).length === 0) {
            folderContent.innerHTML += '<div class="empty-folder-hint">拖曳模板卡片至此</div>';
        } else {
            folderTemplates.forEach(item => {
                const card = createTemplateCardElement(item);
                folderContent.appendChild(card);
            });
        }

        container.appendChild(folderEl);
    });
}

function createTemplateCardElement(item) {
    const card = document.createElement('div');
    card.className = `template-card ${item.starred ? 'starred' : ''}`;
    card.draggable = true;
    card.dataset.id = item.id;
    card.dataset.starred = item.starred;

    let totalMonsters = 0;
    if (item.terrainData) {
        for (const key in item.terrainData) {
            totalMonsters += Object.keys(item.terrainData[key].units || {}).length;
        }
    } else {
        totalMonsters = Object.keys(item.units || {}).length;
    }

    card.innerHTML = `
        <button class="template-card-delete-icon" title="刪除模板">✕</button>
        <div class="template-card-title">
            <button class="star-btn ${item.starred ? 'active' : ''}" title="${item.starred ? '取消置頂' : '標示星號置頂'}">★</button>
            <span class="title-text">${item.name}</span>
            <button class="edit-name-btn" title="更改名稱">✏️</button>
        </div>
        <div class="template-card-meta">時間：${item.date} | 魔物數：${totalMonsters}</div>
        <div class="template-card-actions">
            <button class="success load-btn">載入隊形</button>
        </div>
    `;

    card.querySelector('.star-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStarTemplate(item.id);
    });

    card.querySelector('.template-card-delete-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTemplate(item.id, item.name);
    });

    card.querySelector('.edit-name-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        renameTemplate(item.id);
    });

    card.querySelector('.load-btn').addEventListener('click', () => {
        if (item.terrainData) {
            state.terrainData = JSON.parse(JSON.stringify(item.terrainData));
        } else {
            const savedBg = item.bg || 'background/board-bg-hedge.png';
            state.terrainData = {
                'background/board-bg-hedge.png': { units: {}, orders: {} },
                'background/board-bg-guardwall.png': { units: {}, orders: {} }
            };
            state.terrainData[savedBg] = {
                units: JSON.parse(JSON.stringify(item.units || {})),
                orders: JSON.parse(JSON.stringify(item.orders || {}))
            };
        }

        const savedBg = item.bg || 'background/board-bg-hedge.png';
        loadFixedBackground(savedBg);

        setLoadedTemplate(item);
        createBoard();
        closeDrawer();
        showToast(`已成功載入隊形：「${item.name}」`);
    });

    // 卡片拖拽
    card.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedItem = { type: 'card', id: item.id, el: card };
        setTimeout(() => card.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `card:${item.id}`);
    });

    card.addEventListener('dragend', (e) => {
        e.stopPropagation();
        card.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.drag-over-card').forEach(el => el.classList.remove('drag-over-card'));
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedItem || draggedItem.type !== 'card' || draggedItem.id === item.id) return;

        card.classList.add('drag-over-card');
    });

    card.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        card.classList.remove('drag-over-card');
    });

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over-card');

        if (!draggedItem || draggedItem.type !== 'card' || draggedItem.id === item.id) return;

        const draggedId = draggedItem.id;
        const targetId = item.id;

        let templates = getSavedTemplates();
        const draggedTemplate = templates.find(t => t.id === draggedId);
        const targetTemplate = templates.find(t => t.id === targetId);

        if (!draggedTemplate || !targetTemplate) return;

        const targetFolderId = targetTemplate.folderId;
        draggedTemplate.folderId = targetFolderId;

        const siblingTemplates = templates.filter(t => t.folderId === targetFolderId && !!t.starred === !!targetTemplate.starred);
        
        const filteredSiblings = siblingTemplates.filter(t => t.id !== draggedId);
        const targetIndex = filteredSiblings.findIndex(t => t.id === targetId);

        const rect = card.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > (rect.height / 2);

        if (isAfter) {
            filteredSiblings.splice(targetIndex + 1, 0, draggedTemplate);
        } else {
            filteredSiblings.splice(targetIndex, 0, draggedTemplate);
        }

        filteredSiblings.forEach((t, idx) => {
            t.order = idx + 1;
        });

        saveSavedTemplates(templates);
        renderSavedTemplatesList();
    });

    return card;
}

// ==================== Init ====================
createBoard();
loadFixedBackground();
autoLoadIcons();
updateSaveButtonsVisibility();
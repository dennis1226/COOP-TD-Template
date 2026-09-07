// ==================== Storage ====================
const STORAGE_KEY = 'coop_saved_templates';

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
    selectedUnitId: null,
    selectedFormIndex: 0,
    deleteMode: false,
    markOrderMode: false, // 標示順序模式
    orders: {},           // 記錄格子的順序：{ "x-y": 數字 }
    units: {}, 
    loadedMonsters: [], 
    bgImage: null,
    currentBg: 'background/board-bg-hedge.png', // 預設地形路徑
    currentLoadedTemplateId: null,

    blockedCells: new Set([
        '0-0', '6-0',
        '0-1', '1-1', '2-1', '4-1', '5-1', '6-1',
        '2-2', '4-2',
        '2-3', '4-3',
        '2-4', '3-4', '4-4'
    ])
};

// ==================== DOM ====================
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

const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const updateTemplateBtn = document.getElementById('updateTemplateBtn');
const templateNameInput = document.getElementById('templateNameInput');
const savedTemplatesList = document.getElementById('savedTemplatesList');
const openDrawerBtn = document.getElementById('openDrawerBtn');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const templatesDrawer = document.getElementById('templatesDrawer');

if (formModal) {
    formModal.addEventListener('click', (e) => e.stopPropagation());
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
    } else {
        state.currentLoadedTemplateId = null;
        templateNameInput.value = '';
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

// ==================== Background & Board ====================
function loadFixedBackground(bgPath = state.currentBg) {
    state.currentBg = bgPath;
    if (bgSelect) bgSelect.value = bgPath;

    boardBgEl.style.backgroundImage = `url('${bgPath}')`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        state.bgImage = img;
        state.cols = 7; state.rows = 5;
        const maxW = window.innerWidth < 768 ? 340 : 700;
        const scale = Math.min(1, maxW / img.naturalWidth);
        state.cellW = Math.round((img.naturalWidth / state.cols) * scale);
        state.cellH = Math.round((img.naturalHeight / state.rows) * scale);

        const rawCol = [93, 95, 95, 96, 95, 98, 100];
        const sumCol = rawCol.reduce((a, b) => a + b, 0);
        state.colFracs = rawCol.map(v => v / sumCol);

        const rawRow = [110, 115, 116, 116, 115];
        const sumRow = rawRow.reduce((a, b) => a + b, 0);
        state.rowFracs = rawRow.map(v => v / sumRow);

        createBoard();
    };
    img.onerror = () => {
        // 舊檔名容錯退回
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

function createBoard() {
    boardEl.innerHTML = '';
    const totalW = state.cellW * state.cols;
    const totalH = state.cellH * state.rows;
    boardEl.style.gridTemplateColumns = state.colFracs ? state.colFracs.map(f => Math.round(f * totalW) + 'px').join(' ') : `repeat(${state.cols}, ${state.cellW}px)`;
    boardEl.style.gridTemplateRows = state.rowFracs ? state.rowFracs.map(f => Math.round(f * totalH) + 'px').join(' ') : `repeat(${state.rows}, ${state.cellH}px)`;

    for (let y = 0; y < state.rows; y++) {
        for (let x = 0; x < state.cols; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
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

            // 如果該格子有設定標記順序數字，渲染在左上角
            if (state.orders[key]) {
                const badge = document.createElement('div');
                badge.className = 'order-badge';
                badge.textContent = state.orders[key];
                cell.appendChild(badge);
            }

            cell.addEventListener('click', () => onCellClick(x, y));
            cell.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (state.units[key] && !state.markOrderMode) openFormModalForCell(key);
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
                if (isBlocked) return showToast('非草地區域無法放置魔物！');
                
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

    // 1. 標示順序模式
    if (state.markOrderMode) {
        if (!state.units[key]) {
            showToast('該位置沒有魔物，無法設定順序！');
            return;
        }

        // 如果該位置已經標示過，點擊可取消該位置的標示
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

    // 2. 刪除模式
    if (state.deleteMode) {
        if (state.units[key]) {
            delete state.units[key];
            delete state.orders[key];
            createBoard();
            showToast('已刪除');
        }
        return;
    }

    // 3. 阻擋區判定
    if (state.blockedCells && state.blockedCells.has(key)) {
        showToast('非草地區域無法放置魔物！');
        return;
    }

    // 4. 普通放置模式
    if (state.selectedUnitId) {
        placeUnit(x, y, state.selectedUnitId, state.selectedFormIndex);
    }
}

// ==================== Dynamic Icon Scanning ====================
async function autoLoadIcons() {
    unitsGrid.innerHTML = '<div class="empty-units">正在快速讀取 icon 資料夾…</div>';
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
                
                // 關閉其他模式
                state.deleteMode = false;
                deleteModeBtn.classList.remove('active');
                deleteModeBtn.textContent = '刪除模式';

                state.markOrderMode = false;
                markOrderBtn.classList.remove('active');

                if (monster.forms.length > 1) {
                    showToast(`已選取 ${monster.name}，再次點擊可切換形態`);
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
    deleteModeBtn.classList.toggle('active', state.deleteMode);
    deleteModeBtn.textContent = state.deleteMode ? '取消刪除' : '刪除模式';
    if (state.deleteMode) {
        state.selectedUnitId = null;
        document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        // 關閉標示順序模式
        state.markOrderMode = false;
        markOrderBtn.classList.remove('active');
    }
});

// 標示順序按鈕事件
markOrderBtn.addEventListener('click', () => {
    state.markOrderMode = !state.markOrderMode;
    markOrderBtn.classList.toggle('active', state.markOrderMode);

    if (state.markOrderMode) {
        // 重置目前的號碼
        state.orders = {};
        createBoard();

        // 取消其他選擇狀態
        state.selectedUnitId = null;
        document.querySelectorAll('.unit-option').forEach(el => el.classList.remove('selected'));
        state.deleteMode = false;
        deleteModeBtn.classList.remove('active');
        deleteModeBtn.textContent = '刪除模式';

        showToast('已重置順序，請點擊魔物格開始標示 (1-20)');
    } else {
        showToast('已停止標示順序');
    }
});

clearBtn.addEventListener('click', () => {
    if (Object.keys(state.units).length === 0 && Object.keys(state.orders).length === 0) return;
    if (confirm('確定要清空目前的畫布與順序標示嗎？')) {
        state.units = {};
        state.orders = {};
        setLoadedTemplate(null);
        createBoard();
        showToast('模板與順序已清空');
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    themeToggle.textContent = document.body.classList.contains('light-mode') ? '深色模式' : '淺色模式';
});

// ==================== Copy Canvas Image ====================
async function copyBoardTemplate() {
    if (!state.bgImage) return showToast('背景圖未載入');
    showToast('正在產生圖片…');

    const canvas = document.createElement('canvas');
    canvas.width = state.bgImage.naturalWidth;
    canvas.height = state.bgImage.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(state.bgImage, 0, 0, canvas.width, canvas.height);

    const colW = state.colFracs.map(f => f * canvas.width);
    const rowH = state.rowFracs.map(f => f * canvas.height);
    const colX = [0]; for (let i = 0; i < state.cols; i++) colX.push(colX[i] + colW[i]);
    const rowY = [0]; for (let i = 0; i < state.rows; i++) rowY.push(rowY[i] + rowH[i]);

    const drawPromises = [];
    for (const [key, rawPlaced] of Object.entries(state.units)) {
        const placed = normalizePlacedUnit(rawPlaced);
        if (!placed) continue;

        const [x, y] = key.split('-').map(Number);
        const monster = state.loadedMonsters.find(m => m.id === placed.baseId);
        if (!monster) continue;
        const targetForm = monster.forms[placed.formIndex] || monster.forms[0];
        if (!targetForm) continue;

        drawPromises.push(new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const cellW = colW[x], cellH = rowH[y];
                const padX = cellW * 0.08, padY = cellH * 0.08;
                const boxW = cellW - padX * 2, boxH = cellH - padY * 2;
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const boxAspect = boxW / boxH;

                let drawW = boxW, drawH = boxH, drawX = colX[x] + padX, drawY = rowY[y] + padY;
                if (imgAspect > boxAspect) {
                    drawH = boxW / imgAspect; drawY += (boxH - drawH) / 2;
                } else {
                    drawW = boxH * imgAspect; drawX += (boxW - drawW) / 2;
                }
                ctx.drawImage(img, drawX, drawY, drawW, drawH);

                // 畫出順序號碼 (包含繪製背景圓點與數字)
                if (state.orders[key]) {
                    const numStr = String(state.orders[key]);
                    const badgeX = colX[x] + cellW * 0.15;
                    const badgeY = rowY[y] + cellH * 0.18;
                    const radius = cellW * 0.12;

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(badgeX, badgeY, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(241, 196, 15, 0.95)';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#ffffff';
                    ctx.stroke();

                    ctx.fillStyle = '#111111';
                    ctx.font = `bold ${radius * 1.2}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(numStr, badgeX, badgeY);
                    ctx.restore();
                }

                resolve();
            };
            img.onerror = resolve;
            img.src = targetForm.src;
        }));
    }
    await Promise.all(drawPromises);

    canvas.toBlob(async (blob) => {
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast('已複製模板到剪貼簿！');
                return;
            } catch (e) {}
        }
        showToast('無法複製至剪貼簿，已為您下載圖片');
    });
}

copyTemplateBtn.addEventListener('click', copyBoardTemplate);

// ==================== Save & Load & Update Templates ====================
saveTemplateBtn.addEventListener('click', () => {
    const rawName = templateNameInput.value.trim().slice(0, 12);
    const now = new Date();
    const defaultName = `隊形 ${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`.slice(0, 12);
    const templateName = rawName || defaultName;

    const newTemplate = {
        id: Date.now(),
        name: templateName,
        date: `${now.getMonth()+1}/${now.getDate()}`,
        bg: state.currentBg, // 記錄選擇的地形
        units: JSON.parse(JSON.stringify(state.units)),
        orders: JSON.parse(JSON.stringify(state.orders))
    };

    const templates = getSavedTemplates();
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
    templates[index].date = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    templates[index].bg = state.currentBg; // 更新選擇的地形
    templates[index].units = JSON.parse(JSON.stringify(state.units));
    templates[index].orders = JSON.parse(JSON.stringify(state.orders));

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

function renderSavedTemplatesList() {
    const templates = getSavedTemplates();
    savedTemplatesList.innerHTML = templates.length === 0 ? '<div class="empty-units">尚無儲存的隊形模板</div>' : '';

    templates.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
            <button class="template-card-delete-icon" title="刪除模板">✕</button>
            <div class="template-card-title">
                <span class="title-text">${item.name}</span>
                <button class="edit-name-btn" title="更改名稱">✏️</button>
            </div>
            <div class="template-card-meta">時間：${item.date} | 魔物數：${Object.keys(item.units || {}).length}</div>
            <div class="template-card-actions">
                <button class="success load-btn">載入隊形</button>
            </div>
        `;

        card.querySelector('.template-card-delete-icon').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTemplate(item.id, item.name);
        });

        card.querySelector('.edit-name-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            renameTemplate(item.id);
        });

        card.querySelector('.load-btn').addEventListener('click', () => {
            const rawUnits = item.units || {};
            const normalizedUnits = {};
            for (const [key, val] of Object.entries(rawUnits)) {
                const norm = normalizePlacedUnit(val);
                if (norm) normalizedUnits[key] = norm;
            }

            state.units = JSON.parse(JSON.stringify(normalizedUnits));
            state.orders = item.orders ? JSON.parse(JSON.stringify(item.orders)) : {};

            // 舊 Save 沒有 bg 屬性時預設回退至 hedge 地形
            const savedBg = item.bg || 'background/board-bg-hedge.png';
            loadFixedBackground(savedBg);

            setLoadedTemplate(item);
            createBoard();
            closeDrawer();
            showToast(`已成功載入隊形：「${item.name}」`);
        });

        savedTemplatesList.appendChild(card);
    });
}

// ==================== Init ====================
createBoard();
loadFixedBackground();
autoLoadIcons();
updateSaveButtonsVisibility();

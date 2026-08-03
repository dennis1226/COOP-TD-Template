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
    units: {}, 
    loadedMonsters: [], 
    bgImage: null,
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
const copyTemplateBtn = document.getElementById('copyTemplateBtn');
const themeToggle = document.getElementById('themeToggle');
const toastEl = document.getElementById('toast');

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

// 防止點擊彈窗內部區域觸發背景關閉事件
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

function setLoadedTemplate(template) {
    if (template) {
        state.currentLoadedTemplateId = template.id;
        templateNameInput.value = template.name;
        updateTemplateBtn.style.display = 'block';
    } else {
        state.currentLoadedTemplateId = null;
        templateNameInput.value = '';
        updateTemplateBtn.style.display = 'none';
    }
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
            // 記憶此魔物選取的形態
            monster.selectedFormIndex = idx;
            state.selectedFormIndex = idx;

            // 更新選單上的小圖示
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
function loadFixedBackground() {
    const url = 'board-bg-hedge.png';
    boardBgEl.style.backgroundImage = `url('${url}')`;

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
    img.src = url;
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

            cell.addEventListener('click', () => onCellClick(x, y));
            cell.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (state.units[key]) openFormModalForCell(key);
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

    if (state.deleteMode) {
        if (state.units[key]) {
            delete state.units[key];
            createBoard();
            showToast('已刪除');
        }
        return;
    }

    if (state.blockedCells && state.blockedCells.has(key)) {
        showToast('非草地區域無法放置魔物！');
        return;
    }

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
                selectedFormIndex: 0 // 初始化記憶形態 index
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
                // 讀取該魔物上次記住的形態
                state.selectedFormIndex = monster.selectedFormIndex || 0;
                state.deleteMode = false;
                deleteModeBtn.classList.remove('active');
                deleteModeBtn.textContent = '刪除模式';

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
    }
});

clearBtn.addEventListener('click', () => {
    if (Object.keys(state.units).length === 0) return;
    if (confirm('確定要清空目前的畫布內容嗎？')) {
        state.units = {};
        setLoadedTemplate(null);
        createBoard();
        showToast('模板已清空');
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
    const rawName = templateNameInput.value.trim();
    const now = new Date();
    const defaultName = `隊形 ${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const templateName = rawName || defaultName;

    const newTemplate = {
        id: Date.now(),
        name: templateName,
        date: `${now.getMonth()+1}/${now.getDate()}`,
        units: JSON.parse(JSON.stringify(state.units))
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

    const rawName = templateNameInput.value.trim();
    const updatedName = rawName || templates[index].name;

    templates[index].name = updatedName;
    templates[index].date = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    templates[index].units = JSON.parse(JSON.stringify(state.units));

    saveSavedTemplates(templates);
    showToast(`已更新隊形：「${updatedName}」！`);
    renderSavedTemplatesList();
});

function renderSavedTemplatesList() {
    const templates = getSavedTemplates();
    savedTemplatesList.innerHTML = templates.length === 0 ? '<div class="empty-units">尚無儲存的隊形模板</div>' : '';

    templates.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
            <div class="template-card-title">${item.name}</div>
            <div class="template-card-meta">時間：${item.date} | 魔物數：${Object.keys(item.units || {}).length}</div>
            <div class="template-card-actions">
                <button class="success load-btn">載入隊形</button>
                <button class="danger delete-btn">刪除</button>
            </div>
        `;

        card.querySelector('.load-btn').addEventListener('click', () => {
            const rawUnits = item.units || {};
            const normalizedUnits = {};
            for (const [key, val] of Object.entries(rawUnits)) {
                const norm = normalizePlacedUnit(val);
                if (norm) normalizedUnits[key] = norm;
            }

            state.units = JSON.parse(JSON.stringify(normalizedUnits));
            setLoadedTemplate(item);
            createBoard();
            closeDrawer();
            showToast(`已成功載入隊形：「${item.name}」`);
        });

        card.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm(`確定要刪除隊形模板「${item.name}」嗎？`)) {
                saveSavedTemplates(getSavedTemplates().filter(t => t.id !== item.id));
                if (state.currentLoadedTemplateId === item.id) {
                    setLoadedTemplate(null);
                }
                renderSavedTemplatesList();
                showToast('模板已刪除');
            }
        });

        savedTemplatesList.appendChild(card);
    });
}

// ==================== Init ====================
createBoard();
loadFixedBackground();
autoLoadIcons();
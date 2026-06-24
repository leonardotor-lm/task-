// --- CONFIGURACIÓN GLOBAL (ESTADO BLINDADO) ---
window.DB_URL_KEY = 'leo_db_url_key';
window.API_KEY_STORAGE_KEY = 'leo_api_key_storage_key';

// --- INYECCIÓN SSOT: Estado Visual Base Garantizado ---
window.currentState = window.currentState || { view: 'area', selectedArea: 'Inbox' };
window.currentFilters = window.currentFilters || { search: '', status: 'pending', priority: 'all', context: 'all' };
window.currentSort = window.currentSort || { by: 'date', order: 'asc' };
// ------------------------------------------------------

function readDiskSafely(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch (error) {
        console.warn(`!! Acceso denegado o disco corrupto al leer [${key}]. Operando en modo volátil.`);
        return '';
    }
}

window.dbUrl = readDiskSafely(window.DB_URL_KEY);
window.customApiKey = readDiskSafely(window.API_KEY_STORAGE_KEY);

// Puente de sincronización léxico
function syncGlobals() {
    if (typeof currentState !== 'undefined' && !window.currentState) window.currentState = currentState;
    if (typeof currentFilters !== 'undefined' && !window.currentFilters) window.currentFilters = currentFilters;
}

// INSERCIÓN RÁPIDA DE SUBTAREAS
window.quickAddSubtask = async function(parentId, event) {
    if (event) event.stopPropagation(); 
    
    const title = prompt("Ingresá el título de la nueva subtarea:");
    if (!title || title.trim() === "") return;
    
    findAndMutateTask(parentId, (nodes, i) => {
        if (!nodes[i].subtasks) nodes[i].subtasks = [];
        
        const newTask = { 
            id: Date.now(), 
            name: title.trim(), 
            area: nodes[i].area || 'Inbox', 
            context: '', 
            priority: 'baja', 
            date: '', 
            startDate: '', 
            time: '', 
            notes: '', 
            reminder: false, 
            status: 'pending', 
            attachments: [], 
            subtasks: [], 
            recurrenceRule: null 
        };
        
        nodes[i].subtasks.push(newTask);
        
        if (typeof expandedStates !== 'undefined') {
            expandedStates[parentId] = true;
        }
    });
    
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof showNotice === 'function') showNotice("Subtarea rápida creada.");
    if (typeof saveData === 'function') await saveData();
};

// INICIALIZACIÓN SECUENCIAL
window.onload = async () => { 
    try {
        syncGlobals();
        if (typeof initSpeechRecognition === 'function') initSpeechRecognition(); 
        if (typeof updateDateDisplay === 'function') updateDateDisplay(); 
        
        const dbInput = document.getElementById('settingsDbUrlInput');
        const apiInput = document.getElementById('settingsApiKeyInput');
        if (dbInput) dbInput.value = window.dbUrl;
        if (apiInput) apiInput.value = window.customApiKey;

        setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
        }, 500);

        if (typeof window.navigate === 'function') window.navigate('today', null, false);

        let loadedFromCloud = false;
        if (window.dbUrl && window.dbUrl.trim() !== "") { 
            loadedFromCloud = await loadDataFromCloud(); 
        } else { 
            if (typeof showSyncStatus === 'function') showSyncStatus('none'); 
        }

        if (typeof migrateAndNormalizeTasks === 'function') migrateAndNormalizeTasks(); 
        if (typeof updateUI === 'function') updateUI();

    } catch (criticalError) {
        console.error("!! Falla crítica durante la inicialización:", criticalError);
    }
};

function saveCategories() {
    localStorage.setItem('leo_custom_areas', JSON.stringify(typeof customAreas !== 'undefined' ? customAreas : []));
    localStorage.setItem('leo_custom_contexts', JSON.stringify(typeof customContexts !== 'undefined' ? customContexts : []));
}

// MIGRACIÓN Y NORMALIZACIÓN
function migrateAndNormalizeTasks() { 
    if (typeof tasks === 'undefined' || typeof customAreas === 'undefined') return false;
    let changed = false;
    if (!customAreas.includes("Inbox")) { customAreas.unshift("Inbox"); saveCategories(); changed = true; }
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    function walk(nodes, parentArea) {
        if (!Array.isArray(nodes)) return;
        for (let i = nodes.length - 1; i >= 0; i--) {
            let n = nodes[i];
            if (n.isDeleted && n.deletedAt && (now - n.deletedAt > tenDaysMs)) { nodes.splice(i, 1); changed = true; continue; }
            
            if (n.status === undefined) { n.status = n.completed ? 'completed' : 'pending'; delete n.completed; changed = true; }
            if (!n.priority) { n.priority = 'baja'; changed = true; }
            if (!n.subtasks) { n.subtasks = []; changed = true; }
            if (n.notes === undefined) { n.notes = ''; changed = true; }
            if (n.attachments === undefined) { n.attachments = []; changed = true; }
            if (n.tags === undefined) { n.tags = []; changed = true; }
            if (!n.area || n.area === 'General') { n.area = parentArea || 'Inbox'; changed = true; }
            if (n.context === undefined) { n.context = ''; changed = true; }
            if (n.time === undefined) { n.time = ''; changed = true; }
            
            if (n.recurrence && n.recurrence !== 'none' && !n.recurrenceRule) {
                n.recurrenceRule = {
                    frequency: n.recurrence === 'diario' ? 'daily' : n.recurrence === 'semanal' ? 'weekly' : 'monthly',
                    interval: 1,
                    baseOnCompletion: !!n.completionBased,
                    ...(n.recurrence === 'semanal' && { daysOfWeek: [1] }),
                    ...(n.recurrence === 'mensual' && { dayOfMonth: parseInt(n.date?.split('-')[2]) || 1 }),
                    ...(n.recurrence === 'dia_habil' && { nthBusinessDay: parseInt(n.businessDayNum) || 5 })
                };
                if (n.recurrence === 'dia_habil') { n.recurrenceRule.frequency = 'monthly'; }
                changed = true;
            }
            if (n.recurrence !== undefined) { delete n.recurrence; delete n.businessDayNum; delete n.completionBased; changed = true; }
            
            if (n.subtasks) walk(n.subtasks, n.area);
        }
    }
    if (Array.isArray(tasks)) { walk(tasks, null); } else { window.tasks = []; changed = true; }
    if (changed) { localStorage.setItem('leo_agenda_v11', JSON.stringify(tasks)); }
    return changed;
}

// CORE CRUD ACTIONS
window.addTask = async function() { 
    if (typeof window.getAddTaskFormData !== 'function') return;
    const data = window.getAddTaskFormData();
    if (!data.name) return; 

    const newTask = { 
        id: Date.now(), name: data.name, area: data.area, context: data.context, priority: data.priority,
        date: data.dateInput, startDate: data.dateInput, time: data.timeInput, notes: data.notes,
        reminder: data.reminder, status: 'pending', attachments: typeof currentAttachments !== 'undefined' ? [...currentAttachments] : [], 
        subtasks: [], tags: data.tags, recurrenceRule: data.rule
    };

    if (data.parentId === 'root') {
        window.tasks.unshift(newTask);
    } else {
        let parentFound = false;
        function findAndInject(nodes) {
            for (let node of nodes) {
                if (node.id === data.parentId) {
                    if (!node.subtasks) node.subtasks = [];
                    node.subtasks.unshift(newTask);
                    if (typeof window.expandedStates === 'object') window.expandedStates[node.id] = true;
                    parentFound = true; return true;
                }
                if (node.subtasks && findAndInject(node.subtasks)) return true;
            }
            return false;
        }
        findAndInject(window.tasks);
        if (!parentFound) window.tasks.unshift(newTask);
    }
    if (typeof closeAddTaskModal === 'function') closeAddTaskModal(); 
    if (typeof renderTasks === 'function') renderTasks(); 
    if (typeof saveData === 'function') await saveData(); 
};

window.saveEdit = async function() {
    const nameInput = document.getElementById('editNameInput');
    if (!nameInput || !nameInput.value.trim()) {
        if (typeof showNotice === 'function') showNotice("El nombre es obligatorio");
        return; 
    }

    const id = typeof editState !== 'undefined' ? editState.id : null; 
    if (!id) return;

    const updatedData = {
        name: nameInput.value.trim(),
        status: document.getElementById('editStatusInput')?.value || 'pending',
        area: document.getElementById('editAreaInput')?.value || 'Inbox',
        context: document.getElementById('editContextInput')?.value || '',
        priority: document.getElementById('editPriorityInput')?.value || 'baja',
        dateInput: document.getElementById('editDateInput')?.value || '',
        timeInput: document.getElementById('editTimeInput')?.value || '',
        notes: document.getElementById('editNotesInput')?.value || '',
        reminder: document.getElementById('editReminderToggle')?.checked || false,
        rule: (typeof getRecurrenceRuleData === 'function') ? getRecurrenceRuleData('edit') : null,
        tags: document.getElementById('editTagsInput')?.value.split(',').map(t => t.trim()).filter(t => t !== "") || []
    };

    const newParentId = document.getElementById('editParentInput')?.value || 'root';
    let targetTask = null; 
    
    if (newParentId !== editState.parentId) targetTask = extractTask(id); 
    
    if (targetTask) { 
        Object.assign(targetTask, updatedData);
        targetTask.attachments = typeof currentAttachments !== 'undefined' ? [...currentAttachments] : []; 
        insertTask(targetTask, newParentId); 
    } else { 
        findAndMutateTask(id, (nodes, i) => { 
            Object.assign(nodes[i], updatedData);
            nodes[i].attachments = typeof currentAttachments !== 'undefined' ? [...currentAttachments] : []; 
        }); 
    }
    
    if (typeof closeEditModal === 'function') closeEditModal(); 
    if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns(); 
    if (typeof renderTasks === 'function') renderTasks(); 
    if (typeof showNotice === 'function') showNotice("Guardado exitosamente"); 
    if (typeof saveData === 'function') await saveData(); 
};

window.toggleTaskUniversal = async function(id) {
    findAndMutateTask(id, (nodes, i) => {
        const t = nodes[i];
        if (t.status !== 'completed' && t.recurrenceRule) {
            const todayStr = formatDateLocal(new Date());
            const nextDate = calculateNextOccurrence(t, todayStr);
            const historicalCopy = JSON.parse(JSON.stringify(t));
            historicalCopy.id = Date.now() + Math.random(); historicalCopy.status = 'completed'; historicalCopy.completedAt = todayStr; historicalCopy.recurrenceRule = null;
            t.date = nextDate; t.status = 'pending'; 
            function resetCompletion(task) { task.status = 'pending'; if (task.subtasks) task.subtasks.forEach(resetCompletion); }
            if(t.subtasks) t.subtasks.forEach(resetCompletion);
            nodes.splice(i, 0, historicalCopy);
        } else { 
            if (t.status === 'completed') {
                t.status = 'pending'; delete t.completedAt; 
            } else {
                t.status = 'completed'; t.completedAt = Date.now(); 
            }
        }
    });
    if (typeof renderTasks === 'function') renderTasks(); 
    if (typeof renderCalendar === 'function') renderCalendar(); 
    if (typeof saveData === 'function') await saveData();
};

window.deleteTaskUniversal = async function(id) { 
    const task = typeof getTaskById === 'function' ? getTaskById(id) : null; 
    if (!task) return; 

    const performDelete = async () => { 
        const mutated = typeof findAndMutateTask === 'function' ? findAndMutateTask(id, (nodes, i) => { 
            nodes[i].isDeleted = true; nodes[i].deletedAt = Date.now(); 
        }) : false;

        if (mutated) { 
            if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns(); 
            if (typeof renderTasks === 'function') renderTasks(); 
            if (typeof renderCalendar === 'function') renderCalendar(); 
            if (typeof showNotice === 'function') showNotice("Enviada a papelera"); 
            if (typeof tasks !== 'undefined') window.tasks = tasks;
            if (typeof saveData === 'function') await saveData(); 
        } 
    }; 

    if (task.subtasks && task.subtasks.length > 0) { 
        if (typeof showConfirm === 'function') showConfirm("Eliminar con subtareas", `¿Enviar a papelera con sus ${task.subtasks.length} subtareas?`, performDelete, true); 
        else await performDelete();
    } else { 
        await performDelete(); 
    } 
};

window.saveSettings = async function() {
    try {
        const dbInput = document.getElementById('settingsDbUrlInput');
        const apiInput = document.getElementById('settingsApiKeyInput');
        if (!dbInput) return;
        const newUrl = dbInput.value.trim();
        const newApiKey = apiInput ? apiInput.value.trim() : '';

        if (newUrl) localStorage.setItem(window.DB_URL_KEY, newUrl); else localStorage.removeItem(window.DB_URL_KEY);
        if (newApiKey) localStorage.setItem(window.API_KEY_STORAGE_KEY, newApiKey); else localStorage.removeItem(window.API_KEY_STORAGE_KEY);

        window.dbUrl = newUrl; window.customApiKey = newApiKey;

        if (typeof closeSettingsModal === 'function') closeSettingsModal();
        if (typeof showNotice === 'function') showNotice("Configuración guardada.");
        
        if (window.dbUrl && typeof loadDataFromCloud === 'function') await loadDataFromCloud();
        else { if(typeof showSyncStatus === 'function') showSyncStatus('none'); if (typeof updateUI === 'function') updateUI(); }
    } catch (e) {
        console.error("ERROR EN SAVESETTINGS:", e);
    }
};

// CORE HELPERS
function findAndMutateTask(taskId, mutationFn) { function traverse(nodes) { for (let i = 0; i < nodes.length; i++) { if (nodes[i].id === taskId) { mutationFn(nodes, i); return true; } if (nodes[i].subtasks && traverse(nodes[i].subtasks)) return true; } return false; } return traverse(window.tasks || []); }
function extractTask(taskId) { let extracted = null; function walk(nodes) { for (let i = 0; i < nodes.length; i++) { if (nodes[i].id === taskId) { extracted = nodes.splice(i, 1)[0]; return true; } if (nodes[i].subtasks && walk(nodes[i].subtasks)) return true; } return false; } walk(window.tasks || []); return extracted; }
function insertTask(taskObj, parentId) { if (parentId === 'root') window.tasks.unshift(taskObj); else findAndMutateTask(parentId, (nodes, i) => { if (!nodes[i].subtasks) nodes[i].subtasks = []; nodes[i].subtasks.push(taskObj); if(typeof expandedStates !== 'undefined') expandedStates[parentId] = true; }); }
function getTaskById(id) { let found = null; function walk(nodes) { for (let n of nodes) { if (n.id === id) { found = n; return; } if (n.subtasks && n.subtasks.length > 0) walk(n.subtasks); } } walk(window.tasks || []); return found; }
function getUniqueValues(nodes, key) { let vals = new Set(); function walk(ns) { if(!Array.isArray(ns)) return; ns.forEach(n => { if (n.isDeleted) return; if (n[key]) vals.add(n[key]); if(n.subtasks) walk(n.subtasks); }); } walk(nodes); return Array.from(vals); }
function formatDateLocal(date) { const d = new Date(date); let month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear(); if (month.length < 2) month = '0' + month; if (day.length < 2) day = '0' + day; return [year, month, day].join('-'); }

// RENDERIZADO DE ESTRUCTURAS (DROPDOWNS)
window.refreshAllDropdowns = function() {
    function extractDeepValues(nodes, key) {
        let results = [];
        nodes.forEach(t => {
            if (t[key] && typeof t[key] === 'string' && t[key].trim() !== '') results.push(t[key].trim());
            if (t.subtasks && Array.isArray(t.subtasks) && t.subtasks.length > 0) results = results.concat(extractDeepValues(t.subtasks, key)); 
        });
        return results;
    }

    const dynamicAreas = [...new Set(extractDeepValues(window.tasks || [], 'area'))];
    const dynamicContexts = [...new Set(extractDeepValues(window.tasks || [], 'context'))];
    
    if (typeof customAreas !== 'undefined' && Array.isArray(customAreas)) {
        dynamicAreas.forEach(area => { if (!customAreas.includes(area)) customAreas.push(area); });
    }
    
    if (typeof customContexts !== 'undefined' && Array.isArray(customContexts)) {
        dynamicContexts.forEach(ctx => {
            const exists = customContexts.some(c => (typeof c === 'object' ? c.name : c) === ctx);
            if (!exists) customContexts.push({ name: ctx, color: '#64748b' }); 
        });
    }

    const staticAreas = typeof customAreas !== 'undefined' ? customAreas : [];
    const allAreas = [...new Set([...staticAreas, ...dynamicAreas])].sort();
    
    const staticContexts = (typeof customContexts !== 'undefined' ? customContexts : []).map(c => typeof c === 'object' ? c.name : c);
    const allContexts = [...new Set([...staticContexts, ...dynamicContexts])].sort();
    
    if (typeof populateSelect === 'function') {
        if (document.getElementById('areaInput')) populateSelect('areaInput', allAreas);
        if (document.getElementById('editAreaInput')) populateSelect('editAreaInput', allAreas);
        if (document.getElementById('contextInput')) populateSelect('contextInput', allContexts, true, "Sin contexto", "");
        if (document.getElementById('editContextInput')) populateSelect('editContextInput', allContexts, true, "Sin contexto", "");
        if (document.getElementById('filterContext')) populateSelect('filterContext', allContexts, true, "Contexto (Todos)", "all"); 
    }

    if (typeof renderSidebarAreas === 'function') renderSidebarAreas();
    saveCategories();
};

// --- ORQUESTACIÓN DE FILTROS Y NAVEGACIÓN (FASE 2) ---
window.searchTimeout = null;
window.handleSearchInput = function() {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => { window.updateFilters(); }, 300);
};

window.updateFilters = function() {
    syncGlobals();
    let queryParts = [];
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim() !== '') queryParts.push(searchInput.value.trim());

    const statusVal = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'pending';
    const priorityVal = document.getElementById('filterPriority') ? document.getElementById('filterPriority').value : 'all';
    const contextVal = document.getElementById('filterContext') ? document.getElementById('filterContext').value : 'all';

    if (statusVal === 'completed') queryParts.push('status:completed');
    if (statusVal === 'in_progress') queryParts.push('status:in_progress');
    if (priorityVal !== 'all') queryParts.push(`priority:${priorityVal}`);
    if (contextVal !== 'all') queryParts.push(`context:"${contextVal}"`); 

    const rawQuery = queryParts.join(' AND ');

    window.currentFilters = {
        status: statusVal, priority: priorityVal, context: contextVal, hasActiveQuery: false,
        structured: { status: statusVal, priority: priorityVal, context: contextVal },
        query: { rawText: searchInput ? searchInput.value.trim() : '', ast: null, hasActiveQuery: false }
    };

    if (window.SearchEngine && typeof window.SearchEngine.compile === 'function') {
        const compilationResult = window.SearchEngine.compile(rawQuery);
        window.currentFilters.query.ast = compilationResult.ast;
        window.currentFilters.query.hasActiveQuery = compilationResult.hasActiveQuery;
        window.currentFilters.hasActiveQuery = compilationResult.hasActiveQuery; 
        window.currentFilters.ast = compilationResult.ast;
    }

    if (typeof window.renderTasks === 'function') window.renderTasks();
};

window.resetFilters = function() {
    syncGlobals();
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    const defaultStatus = (window.currentState && window.currentState.view === 'all') ? 'all' : 'pending';
    
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = defaultStatus;
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
    if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
    if (document.getElementById('sortSelect')) {
        document.getElementById('sortSelect').value = 'date-asc';
        if (typeof currentSort !== 'undefined') currentSort = { by: 'date', order: 'asc' };
    }
    window.updateFilters();
    if (typeof showNotice === 'function') showNotice("Filtros restablecidos");
};

window.navigate = function(view, areaName = null, pushHistory = true, focusId = null) {
    syncGlobals();
    if (!window.currentState) return;
    if (pushHistory && typeof navHistory !== 'undefined') navHistory.push(JSON.parse(JSON.stringify(window.currentState)));
    
    window.currentState.view = view; window.currentState.selectedArea = areaName; window.currentState.focusTargetId = focusId;
    if (window.innerWidth < 768 && typeof toggleSidebar === 'function') toggleSidebar(false);

    const defaultStatus = (view === 'all') ? 'all' : 'pending';
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
    if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = defaultStatus;
    
    window.updateFilters();
    if (typeof window.updateUI === 'function') window.updateUI();
};

window.updateSort = function() { 
    const select = document.getElementById('sortSelect');
    const val = select ? select.value.split('-') : ['date', 'asc']; 
    window.currentSort = { by: val[0], order: val[1] }; 
    if (typeof window.renderTasks === 'function') window.renderTasks(); 
};

window.updateUI = function() {
    syncGlobals();
    const state = window.currentState || { view: 'today' };
    const btnBack = document.getElementById('btnBack'); 
    if (btnBack && typeof navHistory !== 'undefined' && navHistory.length > 0) btnBack.classList.remove('hidden'); else if (btnBack) btnBack.classList.add('hidden');

    const titles = { 'today':'Hoy y atrasadas', 'tomorrow':'Mañana', 'week':'Esta semana', 'fortnight':'Próximos 15 días', 'all':'Todas las tareas', 'calendar':'Calendario', 'focus':'Dependencia específica', 'trash':'Papelera (10 días)' };
    const currentTitleText = state.view === 'area' ? `Área: ${state.selectedArea}` : titles[state.view];
    document.querySelectorAll('[id="view-title"], #viewTitle, .main-header h2').forEach(el => el.innerText = currentTitleText);

    const isTrash = state.view === 'trash';
    ['nav-today', 'nav-tomorrow', 'nav-week', 'nav-fortnight', 'nav-all', 'nav-calendar', 'nav-trash'].forEach(id => { 
        document.querySelectorAll(`[id="${id}"]`).forEach(el => { 
            const isActive = id === `nav-${state.view}`;
            el.classList.toggle('bg-navy-900', isActive); el.classList.toggle('text-brand-500', isActive);
            el.classList.toggle('border-r-2', isActive); el.classList.toggle('border-brand-500', isActive);
            el.classList.toggle('text-navy-300', !isActive);
        });
    });
    
    const toggleHidden = (id, cond) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.classList.toggle('hidden', cond));
    toggleHidden('view-list', state.view === 'calendar'); toggleHidden('view-calendar', state.view !== 'calendar'); toggleHidden('filters-container', state.view === 'calendar');
    toggleHidden('btnEmptyTrash', !isTrash); toggleHidden('searchWrap', isTrash); toggleHidden('filterStatus', isTrash); toggleHidden('filterPriority', isTrash);
    toggleHidden('filterContext', isTrash); toggleHidden('sortSelect', isTrash); toggleHidden('btnBulkMode', isTrash); toggleHidden('btnResetFilters', isTrash);
    toggleHidden('btnAIToggle', isTrash); toggleHidden('filtersDivider', isTrash);
    
    if (typeof syncViewUI === 'function') syncViewUI();
    if (typeof renderTasks === 'function') renderTasks();
};

window.syncViewUI = function() {
    const sidebarButtons = document.querySelectorAll('[onclick*="changeView"], [onclick*="setView"], [onclick*="switchView"]');
    sidebarButtons.forEach(btn => {
        btn.classList.remove('bg-navy-700', 'text-brand-500', 'font-semibold');
        if (btn.getAttribute('onclick').includes(currentState.view)) btn.classList.add('bg-navy-700', 'text-brand-500', 'font-semibold');
    });
};

// VARIOUS OTHER UTILS
window.toggleExpand = function(id, event) { 
    if (event) event.stopPropagation(); 
    const filters = window.currentFilters || {};
    const isFiltering = filters.hasActiveQuery || filters.search !== '' || filters.priority !== 'all' || filters.context !== 'all' || filters.status === 'in_progress' || filters.status === 'completed';
    if (isFiltering) return;

    window.expandedStates = window.expandedStates || {};
    window.expandedStates[id] = !window.expandedStates[id]; 
    localStorage.setItem('leo_expanded_states', JSON.stringify(window.expandedStates)); 
    if (typeof renderTasks === 'function') renderTasks();
};

window.emptyTrash = async function() {
    let hasDeletedTasks = false;
    function checkDeleted(nodes) { for (let node of nodes) { if (node.isDeleted) return true; if (node.subtasks && checkDeleted(node.subtasks)) return true; } return false; }
    if (typeof tasks !== 'undefined') hasDeletedTasks = checkDeleted(tasks);
    if (!hasDeletedTasks) { if (typeof showNotice === 'function') showNotice("La papelera ya está vacía"); return; }

    if (typeof showConfirm === 'function') {
        showConfirm("Vaciar Papelera", "¿Estás seguro de eliminar definitivamente todas las tareas de la papelera? Esta acción es irreversible y purgará la base de datos.", async () => {
            function clearDeletedNodes(nodes) {
                for (let i = nodes.length - 1; i >= 0; i--) {
                    if (nodes[i].isDeleted) nodes.splice(i, 1);
                    else if (nodes[i].subtasks) clearDeletedNodes(nodes[i].subtasks);
                }
            }
            if (typeof tasks !== 'undefined') {
                clearDeletedNodes(tasks);
                if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof showNotice === 'function') showNotice("Papelera vaciada por completo");
                if (typeof saveData === 'function') await saveData();
            }
        }, true);
    }
};

window.restaurarTarea = async function(id) {
    if (!id) return;
    findAndMutateTask(id, (nodes, i) => { nodes[i].isDeleted = false; delete nodes[i].deletedAt; });
    if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof saveData === 'function') await saveData();
    if (typeof showNotice === 'function') showNotice("Tarea restaurada a pendientes.");
};

window.destruirTarea = async function(id) {
    if (!id) return;
    if (typeof showConfirm === 'function') {
        showConfirm("Atención: Borrado Definitivo", "Esta acción eliminará la tarea de forma permanente. ¿Continuar?", async () => {
            findAndMutateTask(id, (nodes, i) => { nodes.splice(i, 1); });
            if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
            if (typeof renderTasks === 'function') renderTasks();
            if (typeof saveData === 'function') await saveData();
            if (typeof showNotice === 'function') showNotice("Registro destruido.");
        }, true);
    }
};
// CATEGORY MANAGEMENT
window.deleteCustomArea = async function(index) { if(confirm("¿Seguro que querés eliminar esta área?")) { customAreas.splice(index, 1); await saveData(); if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns(); } };
window.addCustomArea = async function() { const val = document.getElementById('newAreaInput').value.trim(); if(val) { customAreas.push(val); await saveData(); if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns(); } };
window.editCustomArea = async function(index) {
    const oldName = customAreas[index]; const newName = prompt("Editar nombre del área:", oldName);
    if (newName && newName.trim() !== "" && newName.trim() !== oldName) {
        const finalName = newName.trim(); customAreas[index] = finalName;
        function walk(nodes) { if(!nodes)return; for(let t of nodes){ if(t.area===oldName) t.area=finalName; if(t.subtasks) walk(t.subtasks); } } walk(window.tasks);
        await saveData(); if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns();
    }
};

window.deleteCustomContext = async function(index) { if(confirm("¿Seguro que querés eliminar este contexto?")) { customContexts.splice(index, 1); await saveData(); if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns(); } };
window.addCustomContext = async function() {
    const input = document.getElementById('newContextInput'); if (!input) return;
    const val = input.value.trim();
    if(val) {
        const name = val.startsWith('@') ? val : '@' + val;
        const safeColor = (typeof manageSelectedColor !== 'undefined' && manageSelectedColor) ? manageSelectedColor : 'gray';
        customContexts.push({name: name, color: safeColor});
        await saveData(); typeof manageSelectedColor !== 'undefined' && (manageSelectedColor = 'gray');
        if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns();
    }
};

window.dragStartArea = function(event, index) { window.draggedAreaIndex = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', index); };
window.dragOverArea = function(event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
window.dropArea = async function(event, targetIndex) {
    event.preventDefault(); if (typeof window.draggedAreaIndex === 'undefined' || window.draggedAreaIndex === null || window.draggedAreaIndex === targetIndex) return;
    const areaToMove = customAreas.splice(window.draggedAreaIndex, 1)[0]; customAreas.splice(targetIndex, 0, areaToMove);
    window.draggedAreaIndex = null; await saveData(); if(typeof renderManageItems==='function') renderManageItems(); refreshAllDropdowns();
};

window.handleFileUpload = async function(event, mode) {
    const file = event.target.files[0]; if (!file) return;
    if(typeof showNotice === 'function') showNotice(`Subiendo "${file.name}" a Drive...`);
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Content = e.target.result.split(',')[1];
        try {
            const payload = { action: 'uploadFile', fileName: file.name, mimeType: file.type, fileData: base64Content };
            const response = await fetch(typeof getSecureDbUrl === 'function' ? getSecureDbUrl() : window.dbUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
            if (!response.ok) throw new Error('Rechazo del servidor: ' + response.status);
            const serverResponse = await response.text();
            if (serverResponse.trim().startsWith('<')) throw new Error('Servidor devolvió HTML.');
            let finalUrl = serverResponse.trim();
            try { const parsed = JSON.parse(finalUrl); finalUrl = parsed.url || parsed.link || parsed.fileUrl || parsed.fileId || finalUrl; } catch (e) {}
            if (!finalUrl.startsWith('http')) throw new Error('URL inválida.');
            
            if(typeof currentAttachments !== 'undefined') currentAttachments.push({ name: file.name, type: file.type, data: finalUrl });
            if(typeof showNotice === 'function') showNotice("Archivo vinculado.");
            if (typeof renderAttachments === 'function') renderAttachments(mode);
        } catch (err) { if(typeof showNotice==='function') showNotice("Fallo al subir: " + err.message.substring(0, 50)); }
    };
    reader.onerror = () => { if(typeof showNotice==='function') showNotice("Error local de lectura."); };
    reader.readAsDataURL(file); event.target.value = '';
};

window.renderAttachments = function() {
    ['attachmentsList', 'editAttachmentsList'].forEach(containerId => {
        const container = document.getElementById(containerId); if (!container || typeof currentAttachments === 'undefined') return; 
        container.innerHTML = '';
        currentAttachments.forEach((file, index) => {
            const div = document.createElement('div'); div.className = "flex justify-between items-center bg-navy-800 p-2 rounded text-xs text-navy-50 mb-1 border border-navy-700";
            const fileUrl = file.data || file.url || file.link || file.fileUrl;
            const isValidLink = typeof fileUrl === 'string' && (fileUrl.startsWith('http') || fileUrl.startsWith('data:'));
            const fileLink = isValidLink ? `<a href="${fileUrl}" target="_blank" class="text-brand-400 hover:underline cursor-pointer truncate mr-2">${file.name}</a>` : `<span class="truncate mr-2 text-navy-400">${file.name}</span>`;
            div.innerHTML = `${fileLink}<button type="button" onclick="currentAttachments.splice(${index}, 1); renderAttachments();" class="text-danger-500 font-bold hover:bg-navy-700 px-2 py-1 rounded">X</button>`;
            container.appendChild(div);
        });
    });
};

window.toggleProgressSafe = async function(id, event) {
    if (event) event.stopPropagation(); 
    let newStatus = "";
    const found = findAndMutateTask(id, (nodes, i) => {
        nodes[i].status = nodes[i].status === 'in_progress' ? 'pending' : 'in_progress';
        newStatus = nodes[i].status;
    });
    if (found) {
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof showNotice === 'function') showNotice(newStatus === 'in_progress' ? "Tarea en progreso" : "Tarea pausada");
        if (typeof saveData === 'function') await saveData();
    }
};

window.prepareSubtaskSafe = function(id, event) {
    if (event) event.stopPropagation();
    if (typeof openAddTaskModal === 'function') {
        openAddTaskModal();
        setTimeout(() => { const p = document.getElementById('parentInput'); if (p) p.value = id; }, 50);
    }
};

document.addEventListener('click', function(e) {
    const taskItem = e.target.closest('.task-item');
    if (taskItem && e.target.classList.contains('task-name')) {
        const taskId = taskItem.dataset.id;
        if (typeof window.openEditModal === 'function') window.openEditModal(Number(taskId));
    }
});

// STUBS / SIMULATION IA
function initSpeechRecognition() {} 
function toggleVoiceCapture() { if(typeof showNotice==='function') showNotice("Voz no disponible."); } 
function toggleAIFilter() { document.getElementById('omnibar-container')?.classList.toggle('hidden'); }
function processOmnibarCommand() { if(typeof showNotice==='function') showNotice("Simulación local."); const inp=document.getElementById('omnibarInput'); if(inp)inp.value = ''; }
function handleOmnibarKeydown(event) { if (event.key === 'Enter') processOmnibarCommand(); }

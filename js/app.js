// --- CONFIGURACIÓN GLOBAL (ESTADO BLINDADO) ---
window.DB_URL_KEY = 'leo_db_url_key';
window.API_KEY_STORAGE_KEY = 'leo_api_key_storage_key';

// --- INYECCIÓN SSOT: Estado Visual Base Garantizado ---
window.currentState = window.currentState || { view: 'area', selectedArea: 'Inbox' };
window.currentFilters = window.currentFilters || { search: '', status: 'pending', priority: 'all', context: 'all' };
window.currentSort = window.currentSort || { by: 'date', order: 'asc' };

// --- CARGA INICIAL DE CATEGORÍAS DESDE LOCALSTORAGE ---
function loadCategoriesFromStorage() {
    try {
        const savedAreas = localStorage.getItem('leo_custom_areas');
        const savedContexts = localStorage.getItem('leo_custom_contexts');
        
        if (savedAreas) {
            window.customAreas = JSON.parse(savedAreas);
        } else {
            window.customAreas = ['Inbox', 'Personal', 'Trabajo', 'Casa'];
            localStorage.setItem('leo_custom_areas', JSON.stringify(window.customAreas));
        }
        
        if (savedContexts) {
            window.customContexts = JSON.parse(savedContexts);
        } else {
            window.customContexts = [];
            localStorage.setItem('leo_custom_contexts', JSON.stringify(window.customContexts));
        }
        
        if (!window.customAreas.includes('Inbox')) {
            window.customAreas.unshift('Inbox');
            localStorage.setItem('leo_custom_areas', JSON.stringify(window.customAreas));
        }
        
        console.log('✅ Categorías cargadas:', window.customAreas.length, 'áreas,', window.customContexts.length, 'contextos');
        
    } catch (error) {
        console.error('❌ Error al cargar categorías desde localStorage:', error);
        window.customAreas = ['Inbox', 'Personal', 'Trabajo', 'Casa'];
        window.customContexts = [];
    }
}

loadCategoriesFromStorage();
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

// INSERCIÓN RÁPIDA DE SUBTAREAS (BLINDAJE GLOBAL)
async function quickAddSubtask(parentId, event) {
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
        
        if (typeof window.expandedStates !== 'undefined') {
            window.expandedStates[parentId] = true;
        }
    });
    
    renderTasks();
    showNotice("Subtarea rápida creada.");
    await saveData();
}
window.quickAddSubtask = quickAddSubtask;

// INICIALIZACIÓN SECUENCIAL Y ASÍNCRONA
window.onload = async () => { 
    try {
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

        if (typeof window.navigate === 'function') {
            window.navigate('today', null, false);
        }

        let loadedFromCloud = false;
        
        if (window.dbUrl && window.dbUrl.trim() !== "") { 
            loadedFromCloud = await loadDataFromCloud(); 
        } else { 
            if (typeof showSyncStatus === 'function') showSyncStatus('none'); 
        }

        if (typeof migrateAndNormalizeTasks === 'function') migrateAndNormalizeTasks(); 
        
        if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
        
        if (typeof updateUI === 'function') updateUI();

    } catch (criticalError) {
        console.error("!! Falla crítica durante la inicialización:", criticalError);
    }
};

function saveCategories() {
    localStorage.setItem('leo_custom_areas', JSON.stringify(customAreas));
    localStorage.setItem('leo_custom_contexts', JSON.stringify(customContexts));
}

// MIGRACIÓN Y NORMALIZACIÓN
function migrateAndNormalizeTasks() { 
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
    if (Array.isArray(tasks)) { walk(tasks, null); } else { tasks = []; changed = true; }
    if (changed) { localStorage.setItem('leo_agenda_v11', JSON.stringify(tasks)); }
    return changed;
}

async function addTask() { 
    if (typeof window.getAddTaskFormData !== 'function') return;
    const data = window.getAddTaskFormData();
    if (!data.name) return; 

    const newTask = { 
        id: Date.now(), 
        name: data.name, 
        area: data.area,
        context: data.context,
        priority: data.priority,
        date: data.dateInput,
        startDate: data.dateInput,
        time: data.timeInput,
        notes: data.notes,
        reminder: data.reminder,
        status: 'pending', 
        attachments: typeof currentAttachments !== 'undefined' ? [...currentAttachments] : [], 
        subtasks: [], 
        tags: data.tags, 
        recurrenceRule: data.rule
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
                    
                    if (typeof window.expandedStates === 'object') {
                        window.expandedStates[node.id] = true;
                    }
                    parentFound = true;
                    return true;
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
}
window.addTask = addTask;

async function saveEdit() {
    const nameInput = document.getElementById('editNameInput');
    if (!nameInput || !nameInput.value.trim()) {
        if (typeof showNotice === 'function') showNotice("El nombre es obligatorio");
        return; 
    }

    const id = editState.id; 
    
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
    
    if (newParentId !== editState.parentId) { 
        targetTask = extractTask(id); 
    }
    
    if (targetTask) { 
        targetTask.name = updatedData.name;
        targetTask.status = updatedData.status;
        targetTask.area = updatedData.area;
        targetTask.context = updatedData.context;
        targetTask.priority = updatedData.priority;
        targetTask.date = updatedData.dateInput;
        targetTask.time = updatedData.timeInput;
        targetTask.notes = updatedData.notes;
        targetTask.reminder = updatedData.reminder;
        targetTask.recurrenceRule = updatedData.rule;
        targetTask.tags = updatedData.tags;
        targetTask.attachments = [...currentAttachments]; 
        
        insertTask(targetTask, newParentId); 
    } else { 
        findAndMutateTask(id, (nodes, i) => { 
            nodes[i].name = updatedData.name;
            nodes[i].status = updatedData.status;
            nodes[i].area = updatedData.area;
            nodes[i].context = updatedData.context;
            nodes[i].priority = updatedData.priority;
            nodes[i].date = updatedData.dateInput;
            nodes[i].time = updatedData.timeInput;
            nodes[i].notes = updatedData.notes;
            nodes[i].reminder = updatedData.reminder;
            nodes[i].recurrenceRule = updatedData.rule;
            nodes[i].tags = updatedData.tags;
            nodes[i].attachments = [...currentAttachments]; 
        }); 
    }
    
    closeEditModal(); 
    refreshAllDropdowns(); 
    renderTasks(); 
    if (typeof showNotice === 'function') showNotice("Guardado exitosamente"); 
    if (typeof saveData === 'function') await saveData(); 
}
window.saveEdit = saveEdit;

async function toggleTaskUniversal(id) {
    findAndMutateTask(id, (nodes, i) => {
        const t = nodes[i];
        if (t.status !== 'completed' && t.recurrenceRule) {
            const todayStr = formatDateLocal(new Date());
            const nextDate = calculateNextOccurrence(t, todayStr);
            const historicalCopy = JSON.parse(JSON.stringify(t));
            historicalCopy.id = Date.now() + Math.floor(Math.random() * 1000); 
            historicalCopy.status = 'completed'; 
            historicalCopy.completedAt = todayStr; 
            historicalCopy.recurrenceRule = null;
            t.date = nextDate; 
            t.status = 'pending'; 
            
            function resetCompletion(task) { 
                task.status = 'pending'; 
                if (task.subtasks) task.subtasks.forEach(resetCompletion); 
            }
            if(t.subtasks) t.subtasks.forEach(resetCompletion);
            nodes.splice(i, 0, historicalCopy);
        } else { 
            if (t.status === 'completed') {
                t.status = 'pending';
                delete t.completedAt;
            } else {
                t.status = 'completed';
                t.completedAt = Date.now();
            }
        }
    });
    renderTasks(); 
    renderCalendar(); 
    await saveData();
}

async function deleteTaskUniversal(id) { 
    const task = typeof getTaskById === 'function' ? getTaskById(id) : null; 
    if (!task) return; 

    const performDelete = async () => { 
        const mutated = typeof findAndMutateTask === 'function' ? findAndMutateTask(id, (nodes, i) => { 
            nodes[i].isDeleted = true; 
            nodes[i].deletedAt = Date.now();
            
            function markSubtasksDeleted(subtasks) {
                if (!subtasks) return;
                subtasks.forEach(st => {
                    st.isDeleted = true;
                    st.deletedAt = Date.now();
                    if (st.subtasks) markSubtasksDeleted(st.subtasks);
                });
            }
            markSubtasksDeleted(nodes[i].subtasks);
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
        if (typeof showConfirm === 'function') {
            showConfirm("Eliminar con subtareas", `¿Enviar a papelera con sus ${task.subtasks.length} subtareas?`, performDelete, true); 
        } else {
            await performDelete();
        }
    } else { 
        await performDelete(); 
    } 
}
window.deleteTaskUniversal = deleteTaskUniversal;

async function saveSettings() {
    console.log("Iniciando saveSettings...");
    try {
        const dbInput = document.getElementById('settingsDbUrlInput');
        const apiInput = document.getElementById('settingsApiKeyInput');

        if (!dbInput) {
            console.error("ERROR: No se encuentra el input 'settingsDbUrlInput'");
            return;
        }

        const newUrl = dbInput.value.trim();
        const newApiKey = apiInput ? apiInput.value.trim() : '';

        if (newUrl) localStorage.setItem(window.DB_URL_KEY, newUrl);
        else localStorage.removeItem(window.DB_URL_KEY);

        if (newApiKey) localStorage.setItem(window.API_KEY_STORAGE_KEY, newApiKey);
        else localStorage.removeItem(window.API_KEY_STORAGE_KEY);

        window.dbUrl = newUrl;
        window.customApiKey = newApiKey;

        closeSettingsModal();
        showNotice("Configuración guardada.");
        
        console.log("Configuración guardada. Recargando datos...");
        if (window.dbUrl) await loadDataFromCloud();
        else { showSyncStatus('none'); updateUI(); }
        
    } catch (e) {
        console.error("ERROR CRÍTICO EN SAVESETTINGS:", e);
        showNotice("Error al guardar: " + e.message);
    }
}
window.saveSettings = saveSettings;

// CORE ENGINE HELPERS
function findAndMutateTask(taskId, mutationFn) { 
    function traverse(nodes) { 
        for (let i = 0; i < nodes.length; i++) { 
            if (nodes[i].id === taskId) { 
                mutationFn(nodes, i); 
                return true; 
            } 
            if (nodes[i].subtasks && traverse(nodes[i].subtasks)) return true; 
        } 
        return false; 
    } 
    return traverse(window.tasks || []); 
}

function extractTask(taskId) { 
    let extracted = null; 
    function walk(nodes) { 
        for (let i = 0; i < nodes.length; i++) { 
            if (nodes[i].id === taskId) { 
                extracted = nodes.splice(i, 1)[0]; 
                return true; 
            } 
            if (nodes[i].subtasks && walk(nodes[i].subtasks)) return true; 
        } 
        return false; 
    } 
    walk(tasks); 
    return extracted; 
}

function insertTask(taskObj, parentId) { 
    if (parentId === 'root') {
        tasks.unshift(taskObj); 
    } else {
        findAndMutateTask(parentId, (nodes, i) => { 
            if (!nodes[i].subtasks) nodes[i].subtasks = []; 
            nodes[i].subtasks.push(taskObj); 
            if (typeof window.expandedStates !== 'undefined') {
                window.expandedStates[parentId] = true;
            }
        }); 
    }
}

function getParentId(taskId) { 
    let pId = 'root'; 
    function search(nodes, currentParent) { 
        for (let n of nodes) { 
            if (n.id === taskId) { 
                pId = currentParent; 
                return true; 
            } 
            if (n.subtasks && search(n.subtasks, n.id)) return true; 
        } 
        return false; 
    } 
    search(tasks, 'root'); 
    return pId; 
}

function isDescendant(ancestorId, targetId) { 
    if (ancestorId === targetId) return true; 
    let ancestorNode = null; 
    function findAnc(nodes) { 
        for(let n of nodes) { 
            if (n.id === ancestorId) { 
                ancestorNode = n; 
                return; 
            } 
            if (n.subtasks) findAnc(n.subtasks); 
        } 
    } 
    findAnc(tasks); 
    if (!ancestorNode || !ancestorNode.subtasks) return false; 
    let found = false; 
    function checkTarget(nodes) { 
        for(let n of nodes) { 
            if (n.id === targetId) { 
                found = true; 
                return; 
            } 
            if (n.subtasks) checkTarget(n.subtasks); 
        } 
    } 
    checkTarget(ancestorNode.subtasks); 
    return found; 
}

function getTaskById(id) { 
    let found = null; 
    function walk(nodes) { 
        for (let n of nodes) { 
            if (n.id === id) { 
                found = n; 
                return; 
            } 
            if (n.subtasks && n.subtasks.length > 0) walk(n.subtasks); 
        } 
    } 
    walk(tasks); 
    return found; 
}

function getUniqueValues(nodes, key) { 
    let vals = new Set(); 
    function walk(ns) { 
        if(!Array.isArray(ns)) return; 
        ns.forEach(n => { 
            if (n.isDeleted) return; 
            if (n[key]) vals.add(n[key]); 
            if(n.subtasks) walk(n.subtasks); 
        }); 
    } 
    walk(nodes); 
    return Array.from(vals); 
}

function getAllAreasOrdered() { 
    const uniqueTasksAreas = getUniqueValues(tasks, 'area').filter(Boolean); 
    const orphaned = uniqueTasksAreas.filter(a => !customAreas.includes(a)).sort((a, b) => String(a).localeCompare(String(b))); 
    return [...customAreas.filter(Boolean), ...orphaned]; 
}

// NAVEGACIÓN Y FOCO - VERSIÓN CANÓNICA
window.navigate = function(view, areaName = null, pushHistory = true, focusId = null) {
    if (!window.currentState) return;
    
    if (pushHistory && typeof navHistory !== 'undefined') {
        navHistory.push(JSON.parse(JSON.stringify(window.currentState)));
    }
    
    window.currentState.view = view;
    window.currentState.selectedArea = areaName;
    window.currentState.focusTargetId = focusId;
    
    if (window.innerWidth < 768 && typeof toggleSidebar === 'function') toggleSidebar(false);

    const defaultStatus = (view === 'all') ? 'all' : 'pending';
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
    if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = defaultStatus;
    
    if (typeof window.updateFilters === 'function') window.updateFilters();
    if (typeof window.updateUI === 'function') window.updateUI();
};

function focusTaskTree(id) { 
    navigate('focus', null, true, id); 
}

function goBack() { 
    if (typeof navHistory !== 'undefined' && navHistory.length > 0) { 
        window.currentState = navHistory.pop(); 
        updateUI(); 
    } 
}

function exportData() { 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks)); 
    const dlAnchorElem = document.createElement('a'); 
    dlAnchorElem.setAttribute("href", dataStr); 
    dlAnchorElem.setAttribute("download", "agenda_backup.json"); 
    dlAnchorElem.click(); 
}

function importData(event) { 
    const file = event.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = async (e) => { 
        try { 
            const importedTasks = JSON.parse(e.target.result); 
            if (Array.isArray(importedTasks)) { 
                tasks = importedTasks; 
                migrateAndNormalizeTasks(); 
                await saveData(); 
                renderTasks(); 
                renderCalendar(); 
                showNotice("Datos importados correctamente"); 
            } 
        } catch (err) { 
            showNotice("Error al leer el archivo"); 
        } 
    }; 
    reader.readAsText(file); 
}

// RENDERING
function extractDeepValues(nodes, key) {
    let results = [];
    nodes.forEach(t => {
        if (t[key] && typeof t[key] === 'string' && t[key].trim() !== '') {
            results.push(t[key].trim());
        }
        if (t.subtasks && Array.isArray(t.subtasks) && t.subtasks.length > 0) {
            results = results.concat(extractDeepValues(t.subtasks, key)); 
        }
    });
    return results;
}

function refreshAllDropdowns() {
    const dynamicAreas = [...new Set(extractDeepValues(tasks, 'area'))];
    const dynamicContexts = [...new Set(extractDeepValues(tasks, 'context'))];
    
    if (typeof customAreas !== 'undefined' && Array.isArray(customAreas)) {
        dynamicAreas.forEach(area => {
            if (!customAreas.includes(area)) customAreas.push(area);
        });
    }
    
    if (typeof customContexts !== 'undefined' && Array.isArray(customContexts)) {
        dynamicContexts.forEach(ctx => {
            const exists = customContexts.some(c => (typeof c === 'object' ? c.name : c) === ctx);
            if (!exists) {
                customContexts.push({ name: ctx, color: '#64748b' }); 
            }
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

    if (typeof renderSidebarAreas === 'function') {
        renderSidebarAreas();
    }
    
    if (typeof saveCategories === 'function') {
        saveCategories();
    }
}
window.refreshAllDropdowns = refreshAllDropdowns;

// --- MOTOR DE FILTRADO AST (VERSIÓN CANÓNICA) ---
window.updateFilters = function() {
    let queryParts = [];

    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim() !== '') {
        queryParts.push(searchInput.value.trim());
    }

    const statusVal = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'pending';
    if (statusVal === 'completed') queryParts.push('status:completed');
    if (statusVal === 'in_progress') queryParts.push('status:in_progress');

    const priorityVal = document.getElementById('filterPriority') ? document.getElementById('filterPriority').value : 'all';
    if (priorityVal !== 'all') queryParts.push(`priority:${priorityVal}`);

    const contextVal = document.getElementById('filterContext') ? document.getElementById('filterContext').value : 'all';
    if (contextVal !== 'all') {
        queryParts.push(`context:"${contextVal}"`); 
    }

    const rawQuery = queryParts.join(' AND ');
    
    if (window.SearchEngine && typeof window.SearchEngine.compile === 'function') {
        window.currentFilters = window.SearchEngine.compile(rawQuery);
    } else {
        console.warn("Bypass: SearchEngine no está disponible.");
        window.currentFilters = { hasActiveQuery: false };
    }

    if (typeof window.renderTasks === 'function') window.renderTasks();
};

window.searchTimeout = null;
window.handleSearchInput = function() {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        window.updateFilters();
    }, 300);
};

window.resetFilters = function() {
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    
    const defaultStatus = (window.currentState && window.currentState.view === 'all') ? 'all' : 'pending';
    
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = defaultStatus;
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
    if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
    
    window.currentSort = { by: 'date', order: 'asc' };
    if (document.getElementById('sortSelect')) {
        document.getElementById('sortSelect').value = 'date-asc';
    }
    
    window.updateFilters();
    if (typeof showNotice === 'function') showNotice("Filtros restablecidos");
};

window.updateSort = function() { 
    const select = document.getElementById('sortSelect');
    const val = select ? select.value.split('-') : ['date', 'asc']; 
    window.currentSort = { by: val[0], order: val[1] }; 
    if (typeof window.renderTasks === 'function') window.renderTasks(); 
};

function updateUI() {
    const state = window.currentState || { view: 'today' };

    const btnBack = document.getElementById('btnBack'); 
    if (btnBack && typeof navHistory !== 'undefined' && navHistory.length > 0) btnBack.classList.remove('hidden'); 
    else if (btnBack) btnBack.classList.add('hidden');

    const titles = { 'today':'Hoy y atrasadas', 'tomorrow':'Mañana', 'week':'Esta semana', 'fortnight':'Próximos 15 días', 'all':'Todas las tareas', 'calendar':'Calendario', 'focus':'Dependencia específica', 'trash':'Papelera (10 días)' };
    const currentTitleText = state.view === 'area' ? `Área: ${state.selectedArea}` : titles[state.view];
    
    document.querySelectorAll('[id="view-title"]').forEach(el => el.innerText = currentTitleText);

    const isTrash = state.view === 'trash';
    
    ['nav-today', 'nav-tomorrow', 'nav-week', 'nav-fortnight', 'nav-all', 'nav-calendar', 'nav-trash'].forEach(id => { 
        document.querySelectorAll(`[id="${id}"]`).forEach(el => { 
            const isActive = id === `nav-${state.view}`;
            el.classList.toggle('bg-navy-900', isActive);
            el.classList.toggle('text-brand-500', isActive);
            el.classList.toggle('border-r-2', isActive);
            el.classList.toggle('border-brand-500', isActive);
            el.classList.toggle('text-navy-300', !isActive);
        });
    });
    
    const toggleHidden = (id, cond) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.classList.toggle('hidden', cond));
    toggleHidden('view-list', state.view === 'calendar');
    toggleHidden('view-calendar', state.view !== 'calendar');
    toggleHidden('filters-container', state.view === 'calendar');
    toggleHidden('btnEmptyTrash', !isTrash);
    toggleHidden('searchWrap', isTrash);
    toggleHidden('filterStatus', isTrash);
    toggleHidden('filterPriority', isTrash);
    toggleHidden('filterContext', isTrash);
    toggleHidden('sortSelect', isTrash);
    toggleHidden('btnBulkMode', isTrash);
    toggleHidden('btnResetFilters', isTrash);
    toggleHidden('btnAIToggle', isTrash);
    toggleHidden('filtersDivider', isTrash);
    
    if (typeof renderTasks === 'function') renderTasks();
}

window.toggleExpand = function(id, event) { 
    if (event) event.stopPropagation(); 
    
    const filters = window.currentFilters || {};
    const isFiltering = filters.hasActiveQuery || filters.search !== '' || filters.priority !== 'all' || filters.context !== 'all' || filters.status === 'in_progress' || filters.status === 'completed';
    if (isFiltering) return;

    window.expandedStates = window.expandedStates || {};
    window.expandedStates[id] = !window.expandedStates[id]; 
    
    localStorage.setItem('leo_expanded_states', JSON.stringify(window.expandedStates)); 
    
    if (typeof window.renderTasks === 'function') {
        window.renderTasks(); 
    }
};

// --- VERSIÓN CANÓNICA: RESTAURAR TAREA ---
window.restoreTask = async function(id) {
    if (typeof findAndMutateTask === 'function') {
        findAndMutateTask(id, (nodes, i) => {
            nodes[i].isDeleted = false;
            delete nodes[i].deletedAt;
            nodes[i].status = 'pending';
        });
        if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof showNotice === 'function') showNotice("Tarea restaurada con éxito");
        if (typeof saveData === 'function') await saveData();
    }
};

// --- VERSIÓN CANÓNICA: BORRADO PERMANENTE ---
window.hardDeleteTask = function(id) {
    if (typeof showConfirm === 'function') {
        showConfirm("Atención: Borrado Definitivo", "Esta acción eliminará la tarea de la base de datos de manera permanente y no se puede deshacer. ¿Continuar?", async () => {
            function removeNode(nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === id) {
                        nodes.splice(i, 1);
                        return true;
                    }
                    if (nodes[i].subtasks && removeNode(nodes[i].subtasks)) return true;
                }
                return false;
            }
            
            if (typeof tasks !== 'undefined') {
                removeNode(tasks);
                if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderCalendar === 'function') renderCalendar();
                if (typeof showNotice === 'function') showNotice("Registro eliminado de la base de datos");
                if (typeof saveData === 'function') await saveData();
            }
        }, true);
    }
};

// --- VERSIÓN CANÓNICA: VACIAR PAPELERA ---
window.emptyTrash = function() {
    let hasDeletedTasks = false;
    function checkDeleted(nodes) {
        for (let node of nodes) {
            if (node.isDeleted) return true;
            if (node.subtasks && checkDeleted(node.subtasks)) return true;
        }
        return false;
    }
    
    if (typeof tasks !== 'undefined') {
        hasDeletedTasks = checkDeleted(tasks);
    }

    if (!hasDeletedTasks) {
        if (typeof showNotice === 'function') showNotice("La papelera ya está vacía");
        return;
    }

    if (typeof showConfirm === 'function') {
        showConfirm(
            "Vaciar Papelera", 
            "¿Estás seguro de eliminar definitivamente todas las tareas de la papelera? Esta acción es irreversible y purgará la base de datos.", 
            async () => {
                function clearDeletedNodes(nodes) {
                    for (let i = nodes.length - 1; i >= 0; i--) {
                        if (nodes[i].isDeleted) {
                            nodes.splice(i, 1);
                        } else if (nodes[i].subtasks) {
                            clearDeletedNodes(nodes[i].subtasks);
                        }
                    }
                }
                
                if (typeof tasks !== 'undefined') {
                    clearDeletedNodes(tasks);
                    if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
                    if (typeof renderTasks === 'function') renderTasks();
                    if (typeof renderCalendar === 'function') renderCalendar();
                    if (typeof showNotice === 'function') showNotice("Papelera vaciada por completo");
                    if (typeof saveData === 'function') await saveData();
                }
            }, 
            true
        );
    }
};

function renderCalendar() { 
    const grid = document.getElementById('calendar-grid'); 
    if (!grid) return; 

    grid.innerHTML = ''; 
    document.getElementById('calendar-month').innerText = calendarDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); 
    const year = calendarDate.getFullYear(); 
    const month = calendarDate.getMonth(); 
    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    
    for (let i = 0; i < firstDay; i++) grid.innerHTML += '<div></div>'; 
    
    for (let day = 1; day <= daysInMonth; day++) { 
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; 
        let hasTask = false; 
        
        function check(ns) { 
            if(!Array.isArray(ns)) return; 
            for(let n of ns) { 
                if(n.isDeleted) continue; 
                if(n.status !== 'completed' && n.date === dateStr) { hasTask = true; return; } 
                if(n.subtasks) check(n.subtasks); 
            } 
        } 
        
        check(tasks); 
        const isToday = formatDateLocal(new Date()) === dateStr; 
        const dayEl = document.createElement('div'); 
        dayEl.className = `calendar-day ${isToday ? 'today' : ''}`; 
        dayEl.innerHTML = `<span>${day}</span>${hasTask ? '<div class="absolute bottom-2 w-1.5 h-1.5 bg-brand-500 rounded-full"></div>' : ''}`; 
        dayEl.onclick = () => openDayDetail(dateStr); 
        grid.appendChild(dayEl); 
    } 
}

function changeMonth(delta) { calendarDate.setMonth(calendarDate.getMonth() + delta); renderCalendar(); }

function openDayDetail(dateStr) { 
    const dayTasks = []; 
    function collect(ns, pName) { 
        if (!Array.isArray(ns)) return; 
        ns.forEach(n => { 
            if (n.isDeleted) return; 
            if (n.status !== 'completed' && n.date === dateStr) dayTasks.push({ ...n, type: pName ? `Depende de: ${pName}` : 'Principal' }); 
            if (n.subtasks) collect(n.subtasks, n.name); 
        }); 
    } 
    collect(tasks, null); 
    document.getElementById('modalDateTitle').innerText = new Date(dateStr + "T00:00:00").toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }); 
    const content = document.getElementById('modalContent'); 
    if (dayTasks.length === 0) {
        content.innerHTML = '<p class="text-navy-400 text-sm text-center italic py-10">Libre de tareas.</p>'; 
    } else {
        content.innerHTML = dayTasks.map(t => `<div class="p-4 bg-navy-900 border border-navy-700 rounded-md flex items-center justify-between cursor-pointer hover:bg-navy-800 transition-colors" onclick="openEditModal(${t.id}); closeModal();"><div><p class="font-semibold text-sm ${t.status === 'in_progress' ? 'text-info-500' : 'text-navy-50'}">${t.name}</p><p class="text-[9px] text-navy-400 uppercase tracking-wider font-bold">${t.area}${t.context ? ` &bull; ${t.context}` : ''} &bull; <span class="text-brand-500">${t.type}</span></p></div><div class="flex flex-col items-end gap-1"><svg class="w-3.5 h-3.5 ${priorityColors[t.priority]}" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg></div></div>`).join(''); 
    }
    document.getElementById('dayDetailModal').classList.remove('hidden'); 
}

function closeModal() { document.getElementById('dayDetailModal').classList.add('hidden'); }

function openManageModal() { document.getElementById('manageModalTitle').innerText = 'Gestionar Categorías'; renderManageItems(); document.getElementById('manageModal').classList.remove('hidden'); }
function closeManageModal() { document.getElementById('manageModal').classList.add('hidden'); }

function cascadeUpdateCategory(type, oldVal, newVal) {
    function walk(nodes) {
        if (!nodes) return;
        for (let t of nodes) {
            if (type === 'area' && t.area === oldVal) t.area = newVal;
            if (type === 'context' && t.context === oldVal) t.context = newVal;
            if (t.subtasks) walk(t.subtasks);
        }
    }
    walk(tasks);
}

window.deleteCustomArea = async function(index) {
    if(confirm("¿Seguro que querés eliminar esta área?")) {
        customAreas.splice(index, 1);
        await saveData();
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.editCustomArea = async function(index) {
    const oldName = customAreas[index];
    const newName = prompt("Editar nombre del área:", oldName);
    if (newName && newName.trim() !== "" && newName.trim() !== oldName) {
        const finalName = newName.trim();
        customAreas[index] = finalName;
        cascadeUpdateCategory('area', oldName, finalName);
        await saveData();
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.addCustomArea = async function() {
    const val = document.getElementById('newAreaInput').value.trim();
    if(val) {
        customAreas.push(val);
        await saveData();
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.deleteCustomContext = async function(index) {
    if(confirm("¿Seguro que querés eliminar este contexto?")) {
        customContexts.splice(index, 1);
        await saveData();
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.editCustomContext = function(index) {
    const oldCtx = customContexts[index];
    let tempColor = oldCtx.color || 'gray';
    
    const colorHexMap = { 'blue': '#3b82f6', 'purple': '#a855f7', 'green': '#22c55e', 'red': '#ef4444', 'orange': '#f97316', 'gray': '#6b7280', 'pink': '#ec4899', 'teal': '#14b8a6', 'yellow': '#eab308', 'cyan': '#06b6d4', 'indigo': '#6366f1', 'rose': '#f43f5e', 'emerald': '#10b981', 'fuchsia': '#d946ef' };
    
    const modalId = 'dynamic-edit-context-modal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 flex items-center justify-center';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    modal.style.zIndex = '9999';
    
    const renderColors = () => {
        return Object.keys(colorHexMap).map(c => `
            <button type="button" 
            onclick="
                document.getElementById('${modalId}').dataset.selectedColor = '${c}'; 
                Array.from(document.querySelectorAll('.color-edit-btn')).forEach(btn => btn.style.boxShadow = ''); 
                this.style.boxShadow = '0 0 0 2px #0f172a, 0 0 0 4px ${colorHexMap[c]}';
            "
            class="color-edit-btn w-6 h-6 rounded-full outline-none focus:outline-none flex-shrink-0 cursor-pointer transition-transform hover:scale-110" 
            style="background-color: ${colorHexMap[c]}; ${tempColor === c ? 'box-shadow: 0 0 0 2px #0f172a, 0 0 0 4px ' + colorHexMap[c] + ';' : ''}"
            title="${c}"></button>
        `).join('');
    };

    modal.innerHTML = `
        <div class="bg-navy-800 border border-navy-700 rounded p-5 w-[90%] max-w-sm shadow-2xl">
            <h3 class="text-navy-50 font-bold mb-4 text-lg">Editar Contexto</h3>
            
            <div class="mb-4">
                <label class="block text-xs font-semibold text-navy-400 mb-1 uppercase tracking-wide">Nombre</label>
                <input type="text" id="editContextNameInput" value="${oldCtx.name}" class="w-full bg-navy-900 border border-navy-700 text-navy-50 text-sm rounded px-3 py-2 focus:outline-none focus:border-brand-500 transition-colors">
            </div>
            
            <div class="mb-6">
                <label class="block text-xs font-semibold text-navy-400 mb-2 uppercase tracking-wide">Color visual</label>
                <div class="flex flex-wrap gap-2.5">
                    ${renderColors()}
                </div>
            </div>
            
            <div class="flex justify-end gap-3 border-t border-navy-700 pt-4">
                <button type="button" id="cancelEditCtxBtn" class="px-4 py-1.5 text-sm font-semibold text-navy-400 hover:text-navy-50 hover:bg-navy-700 rounded transition-colors focus:outline-none">Cancelar</button>
                <button type="button" id="saveEditCtxBtn" class="px-4 py-1.5 text-sm font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors focus:outline-none">Guardar Cambios</button>
            </div>
        </div>
    `;
    
    modal.dataset.selectedColor = tempColor;
    document.body.appendChild(modal);
    
    const nameInput = document.getElementById('editContextNameInput');
    nameInput.focus();
    nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
    
    document.getElementById('cancelEditCtxBtn').onclick = () => modal.remove();
    
    document.getElementById('saveEditCtxBtn').onclick = async () => {
        const newNameRaw = nameInput.value.trim();
        if (!newNameRaw) return;
        
        let finalName = newNameRaw;
        if (!finalName.startsWith('@')) finalName = '@' + finalName;
        
        const selectedColor = modal.dataset.selectedColor || 'gray';
        
        if (finalName !== oldCtx.name) {
            if (typeof cascadeUpdateCategory === 'function') {
                cascadeUpdateCategory('context', oldCtx.name, finalName);
            }
        }
        
        customContexts[index].name = finalName;
        customContexts[index].color = selectedColor;
        
        if (typeof saveData === 'function') await saveData();
        if (typeof renderManageItems === 'function') renderManageItems();
        if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
        
        modal.remove();
    };
};

window.addCustomContext = async function() {
    const input = document.getElementById('newContextInput');
    if (!input) return;
    
    const val = input.value.trim();
    if(val) {
        const name = val.startsWith('@') ? val : '@' + val;
        const safeColor = (typeof manageSelectedColor !== 'undefined' && manageSelectedColor) ? manageSelectedColor : 'gray';
        
        customContexts.push({name: name, color: safeColor});
        await saveData();
        
        manageSelectedColor = 'gray'; 
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.selectManageColor = function(color) {
    manageSelectedColor = color;
    
    const inputDOM = document.getElementById('newContextInput');
    const currentText = inputDOM ? inputDOM.value : '';
    
    renderManageItems();
    
    const restoredInput = document.getElementById('newContextInput');
    if (restoredInput) {
        restoredInput.value = currentText;
        restoredInput.focus();
    }
};

window.dragStartArea = function(event, index) {
    window.draggedAreaIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index);
};

window.dragOverArea = function(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
};

window.dropArea = async function(event, targetIndex) {
    event.preventDefault();
    if (typeof window.draggedAreaIndex === 'undefined' || window.draggedAreaIndex === null || window.draggedAreaIndex === targetIndex) return;

    const areaToMove = customAreas.splice(window.draggedAreaIndex, 1)[0];
    customAreas.splice(targetIndex, 0, areaToMove);
    
    window.draggedAreaIndex = null;

    if (typeof saveData === 'function') await saveData();
    renderManageItems();
    if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
};

function renderManageItems() {
    const container = document.getElementById('manageModalContent');
    if (!container) return;
    
    const colorHexMap = { 'blue': '#3b82f6', 'purple': '#a855f7', 'green': '#22c55e', 'red': '#ef4444', 'orange': '#f97316', 'gray': '#6b7280', 'pink': '#ec4899', 'teal': '#14b8a6', 'yellow': '#eab308', 'cyan': '#06b6d4', 'indigo': '#6366f1', 'rose': '#f43f5e', 'emerald': '#10b981', 'fuchsia': '#d946ef' };
    
    const currentSelectedColor = typeof manageSelectedColor !== 'undefined' ? manageSelectedColor : null;

    let colorSwatches = Object.keys(colorHexMap).map(c => `
        <button onclick="selectManageColor('${c}')" 
                class="w-5 h-5 rounded-full outline-none focus:outline-none flex-shrink-0" 
                style="background-color: ${colorHexMap[c]}; ${currentSelectedColor === c ? 'box-shadow: 0 0 0 2px #0f172a, 0 0 0 4px ' + colorHexMap[c] + ';' : ''}"
                title="${c}" type="button"></button>
    `).join('');

    let html = `
    <div class="mb-6">
        <h3 class="font-medium text-base mb-2 text-navy-50">Áreas</h3>
        <div class="flex gap-2 mb-3">
            <input type="text" id="newAreaInput" placeholder="Nueva área..." class="border border-navy-600 bg-navy-900 text-navy-50 rounded p-1.5 flex-1 text-sm placeholder-navy-400">
            <button onclick="addCustomArea()" class="bg-brand-500 text-navy-900 px-3 py-1.5 rounded text-sm font-medium hover:bg-brand-400">Agregar</button>
        </div>
        <ul class="space-y-1.5 max-h-40 overflow-y-auto pr-2">`;
        
    customAreas.forEach((area, i) => {
        html += `
        <li draggable="true" 
            ondragstart="window.dragStartArea(event, ${i})" 
            ondragover="window.dragOverArea(event)" 
            ondrop="window.dropArea(event, ${i})"
            class="flex justify-between items-center p-1.5 bg-navy-800 rounded border border-navy-700 cursor-move hover:bg-navy-700 transition-colors"
            title="Arrastrar para reorganizar">
            <div class="flex items-center gap-2">
                <span class="text-navy-400 font-bold opacity-50 cursor-grab" aria-hidden="true">&#8942;&#8942;</span>
                <span class="text-navy-50 text-sm">${area}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="editCustomArea(${i})" class="text-brand-400 text-xs font-medium px-1.5 py-0.5 hover:bg-navy-900 rounded transition-colors">Editar</button>
                <button onclick="deleteCustomArea(${i})" class="text-danger-500 text-xs font-medium px-1.5 py-0.5 hover:bg-navy-900 rounded transition-colors">Borrar</button>
            </div>
        </li>`;
    });

    html += `
        </ul>
    </div>
    <div>
        <h3 class="font-medium text-base mb-2 text-navy-50">Contextos</h3>
        <div class="flex flex-col gap-2 mb-3">
            <div class="flex flex-wrap gap-1.5 p-2 bg-navy-900 border border-navy-600 rounded">
                ${colorSwatches}
            </div>
            <div class="flex gap-2">
                <input type="text" id="newContextInput" placeholder="Ej: @reunión" class="border border-navy-600 bg-navy-900 text-navy-50 rounded p-1.5 flex-1 text-sm placeholder-navy-400">
                <button onclick="addCustomContext()" class="bg-brand-500 text-navy-900 px-3 py-1.5 rounded text-sm font-medium hover:bg-brand-400">Agregar</button>
            </div>
        </div>
        <ul class="space-y-1.5 max-h-40 overflow-y-auto pr-2">`;

    customContexts.forEach((ctx, i) => {
        const hexColor = colorHexMap[ctx.color] || '#3b82f6';
        html += `
        <li class="flex justify-between items-center p-1.5 bg-navy-800 rounded border border-navy-700">
            <span style="color: ${hexColor};" class="font-medium text-sm">${ctx.name}</span>
            <div class="flex gap-2">
                <button onclick="editCustomContext(${i})" class="text-brand-400 text-xs font-medium px-1.5 py-0.5 hover:bg-navy-700 rounded transition-colors">Editar</button>
                <button onclick="deleteCustomContext(${i})" class="text-danger-500 text-xs font-medium px-1.5 py-0.5 hover:bg-navy-700 rounded transition-colors">Borrar</button>
            </div>
        </li>`;
    });

    html += `</ul></div>`;
    
    container.innerHTML = html;
}

async function setTaskStatus(id, newStatus) { 
    findAndMutateTask(id, (nodes, i) => { 
        nodes[i].status = newStatus; 
    }); 
    renderTasks(); 
    renderCalendar(); 
    await saveData(); 
}

// BULK ACTIONS
window.toggleBulkMode = function() { 
    isBulkMode = !isBulkMode; 
    selectedTaskIds.clear(); 
    document.getElementById('btnBulkMode').classList.toggle('text-brand-500', isBulkMode); 
    
    const bar = document.getElementById('bulkActionBar');
    if (bar) {
        bar.classList.toggle('translate-y-32', !isBulkMode); 
        bar.classList.toggle('opacity-0', !isBulkMode); 
        bar.style.zIndex = isBulkMode ? "9999" : "-1";
    }
    
    document.getElementById('bulkCount').innerText = '0'; 
    window.updateBulkButtonsState();
    renderTasks(); 
};

window.toggleBulkSelect = function(id, e) { 
    if (e) e.stopPropagation(); 
    if (selectedTaskIds.has(id)) selectedTaskIds.delete(id); 
    else selectedTaskIds.add(id); 
    
    document.getElementById('bulkCount').innerText = selectedTaskIds.size; 
    window.updateBulkButtonsState();
    renderTasks(); 
};

window.updateBulkButtonsState = function() {
    const bar = document.getElementById('bulkActionBar');
    if (!bar) return;
    const hasSelection = selectedTaskIds.size > 0;
    
    const buttons = bar.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.disabled = !hasSelection;
        if (!hasSelection) {
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.style.pointerEvents = 'none';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.style.pointerEvents = 'auto';
        }
    });
};

window.bulkDelete = function() { 
    if (selectedTaskIds.size === 0) return; 

    const executeBulkDeletion = async () => {
        selectedTaskIds.forEach(id => {
            findAndMutateTask(id, (nodes, i) => { 
                nodes[i].isDeleted = true; 
                nodes[i].deletedAt = Date.now(); 
            });
        }); 
        toggleBulkMode(); 
        renderTasks(); 
        showNotice("Tareas eliminadas"); 
        await saveData(); 
    };

    if (typeof showConfirm === 'function') {
        showConfirm(
            "Eliminar tareas", 
            `¿Seguro que querés enviar ${selectedTaskIds.size} tareas a la papelera?`, 
            executeBulkDeletion
        );
    }
};

window.bulkComplete = async function() { 
    if (selectedTaskIds.size === 0) return; 
    
    for (const id of selectedTaskIds) {
        findAndMutateTask(id, (nodes, i) => {
            const t = nodes[i];
            if (t.status !== 'completed') {
                t.status = 'completed';
                t.completedAt = Date.now();
            }
        });
    }
    
    toggleBulkMode(); 
    renderTasks(); 
    renderCalendar();
    showNotice("Tareas actualizadas"); 
    await saveData(); 
};

window.bulkPostpone = function() {
    if (selectedTaskIds.size === 0) return;
    if (typeof openPostponeModal === 'function') {
        openPostponeModal('bulk');
    } else {
        postponeState = { id: 'bulk' };
        document.getElementById('postponeModal').classList.remove('hidden');
    }
};

async function applyBulkMove() {
    const formData = getBulkMoveFormData();
    
    selectedTaskIds.forEach(id => {
        findAndMutateTask(id, (nodes, i) => {
            nodes[i].area = formData.newArea;
            if (formData.newContext !== "") {
                nodes[i].context = formData.newContext;
            }
        });
    });
    
    if (typeof toggleBulkMode === 'function') toggleBulkMode();
    if (typeof closeBulkMoveModal === 'function') closeBulkMoveModal();
    refreshAllDropdowns();
    renderTasks();
    showNotice("Tareas reubicadas");
    
    await saveData();
}
window.applyBulkMove = applyBulkMove;

// POSTPONE ACTIONS
async function postponeAction(type) { 
    let fd = ''; 
    
    if (type === 'tomorrow') { 
        const tom = new Date(); 
        tom.setDate(tom.getDate() + 1); 
        fd = formatDateLocal(tom);
    } else if (type === 'nextWeek') { 
        const nw = new Date(); 
        nw.setDate(nw.getDate() + 7); 
        fd = formatDateLocal(nw);
    } else if (type === 'custom') { 
        fd = getPostponeCustomDateValue(); 
        if (!fd) return; 
    } 
    
    if (postponeState.id === 'bulk') { 
        selectedTaskIds.forEach(taskId => {
            findAndMutateTask(taskId, (nodes, i) => { nodes[i].date = fd; });
        }); 
        if (typeof toggleBulkMode === 'function') toggleBulkMode(); 
    } else { 
        findAndMutateTask(postponeState.id, (nodes, i) => { nodes[i].date = fd; }); 
    } 
    
    if (typeof closePostponeModal === 'function') closePostponeModal(); 
    if (typeof renderTasks === 'function') renderTasks(); 
    if (typeof renderCalendar === 'function') renderCalendar();
    
    await saveData(); 
}
window.postponeAction = postponeAction;

// FILE UPLOAD AND ATTACHMENTS
window.handleFileUpload = async function(event, mode) {
    const file = event.target.files[0];
    if (!file) return;

    showNotice(`Subiendo "${file.name}" a Google Drive...`);

    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const base64Content = e.target.result.split(',')[1];
        
        try {
            const payload = {
                action: 'uploadFile', 
                fileName: file.name,
                mimeType: file.type,
                fileData: base64Content
            };

            const response = await fetch(getSecureDbUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                redirect: 'follow'
            });

            if (!response.ok) throw new Error('Rechazo del servidor HTTP: ' + response.status);
            
            const serverResponse = await response.text();
            
            if (serverResponse.trim().startsWith('<')) {
                throw new Error('El servidor devolvió un documento HTML. Verificar permisos.');
            }

            let finalUrl = serverResponse.trim();
            
            try {
                const parsed = JSON.parse(finalUrl);
                finalUrl = parsed.url || parsed.link || parsed.fileUrl || parsed.fileId || finalUrl;
            } catch (jsonError) {}

            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                console.error("Respuesta anómala del servidor:", serverResponse);
                throw new Error('El servidor no devolvió una URL válida: ' + finalUrl.substring(0, 30));
            }

            const fileData = {
                name: file.name,
                type: file.type,
                data: finalUrl
            };
            
            currentAttachments.push(fileData);
            showNotice("Archivo alojado y vinculado correctamente.");
            
            if (typeof renderAttachments === 'function') {
                renderAttachments(mode);
            }
            
        } catch (err) {
            console.error("Error en la transmisión a Drive:", err);
            showNotice("Fallo al subir: " + err.message.substring(0, 50));
        }
    };
    
    reader.onerror = function() {
        showNotice("Error local de lectura de disco.");
    };

    reader.readAsDataURL(file);
    event.target.value = '';
};

function renderAttachments() {
    ['attachmentsList', 'editAttachmentsList'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return; 
        
        container.innerHTML = '';
        
        currentAttachments.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-navy-800 p-2 rounded text-xs text-navy-50 mb-1 border border-navy-700";
            
            const fileUrl = file.data || file.url || file.link || file.fileUrl;
            const isValidLink = typeof fileUrl === 'string' && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://') || fileUrl.startsWith('data:'));
            
            const fileLink = isValidLink 
                ? `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-400 hover:underline cursor-pointer truncate mr-2" title="Abrir documento">${file.name}</a>` 
                : `<span class="truncate mr-2 text-navy-400" title="Registro sin enlace recuperable">${file.name}</span>`;

            div.innerHTML = `
                ${fileLink}
                <button type="button" onclick="currentAttachments.splice(${index}, 1); renderAttachments();" class="text-danger-500 font-bold hover:bg-navy-700 px-2 py-1 rounded transition-colors">X</button>
            `;
            container.appendChild(div);
        });
    });
}
window.renderAttachments = renderAttachments;

// STUBS / SIMULATION IA
function initSpeechRecognition() {} 
function toggleVoiceCapture() { showNotice("Voz no disponible."); } 
function toggleAIFilter() { document.getElementById('omnibar-container').classList.toggle('hidden'); }
function processOmnibarCommand() { showNotice("Comando procesado localmente (Simulación)."); document.getElementById('omnibarInput').value = ''; }
function handleOmnibarKeydown(event) { if (event.key === 'Enter') processOmnibarCommand(); }
function breakdownTaskWithAI() { showNotice("Funcionalidad de IA en desarrollo."); }

// CONTROLADOR DE CONFIRMACIÓN VISUAL
window.resolveConfirmacion = null;

window.pedirConfirmacionVisual = function(titulo, mensaje) {
    return new Promise((resolve) => {
        document.getElementById('confirmModalTitle').innerText = titulo;
        document.getElementById('confirmModalMessage').innerText = mensaje;
        
        const btnConfirmar = document.getElementById('confirmModalBtnAction');
        btnConfirmar.className = "w-1/2 bg-danger-600 text-navy-50 py-3 rounded-md text-sm font-semibold hover:bg-danger-500 transition-colors focus:outline-none";
        btnConfirmar.innerText = "Destruir definitivamente";

        document.getElementById('confirmModal').classList.remove('hidden');
        
        window.resolveConfirmacion = resolve;
    });
};

window.closeConfirmModal = function(resultado) {
    document.getElementById('confirmModal').classList.add('hidden');
    
    if (resultado && typeof confirmCallback === 'function') {
        confirmCallback();
    }
    if (typeof confirmCallback !== 'undefined') {
        confirmCallback = null;
    }
    
    if (window.resolveConfirmacion) {
        window.resolveConfirmacion(resultado); 
        window.resolveConfirmacion = null;
    }
};

// Delegación de eventos
document.addEventListener('click', function(e) {
    const taskItem = e.target.closest('.task-item');
    
    if (taskItem) {
        const taskId = taskItem.dataset.id;
        console.log("¡Clic interceptado en tarea:", taskId);
        
        if (e.target.classList.contains('task-name')) {
            if (typeof window.openEditModal === 'function') {
                window.openEditModal(Number(taskId));
            }
        }
    }
});

window.toggleProgressSafe = async function(id, event) {
    if (event) event.stopPropagation();
    
    let found = false;
    let newStatus = "";
    
    function traverse(nodes) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) {
                nodes[i].status = nodes[i].status === 'in_progress' ? 'pending' : 'in_progress';
                newStatus = nodes[i].status;
                found = true;
                return true;
            }
            if (nodes[i].subtasks && traverse(nodes[i].subtasks)) return true;
        }
        return false;
    }
    
    if (typeof tasks !== 'undefined') {
        traverse(tasks);
        if (found) {
            if (typeof renderTasks === 'function') renderTasks();
            if (typeof showNotice === 'function') showNotice(newStatus === 'in_progress' ? "Tarea en progreso" : "Tarea pausada");
            if (typeof saveData === 'function') await saveData();
        }
    }
};

window.prepareSubtaskSafe = function(id, event) {
    if (event) event.stopPropagation();
    
    if (typeof openAddTaskModal === 'function') {
        openAddTaskModal();
        setTimeout(() => {
            const parentDropdown = document.getElementById('parentInput');
            if (parentDropdown) {
                parentDropdown.value = id;
            }
        }, 50);
    }
};

// RENDERIZADO DE ÁREAS EN SIDEBAR
function renderSidebarAreas() {
    const sidebarContainer = document.getElementById('sidebarAreasList');
    if (!sidebarContainer) {
        console.warn('No se encontró el contenedor sidebarAreasList');
        return;
    }
    
    sidebarContainer.innerHTML = '';
    
    const allAreas = typeof getAllAreasOrdered === 'function' ? getAllAreasOrdered() : window.customAreas;
    
    allAreas.forEach(area => {
        const areaItem = document.createElement('div');
        areaItem.className = 'sidebar-area-item flex items-center justify-between p-2 hover:bg-navy-700 cursor-pointer rounded transition-colors';
        areaItem.innerHTML = `
            <span class="text-navy-50 text-sm">${area}</span>
            <span class="text-navy-400 text-xs">›</span>
        `;
        
        areaItem.onclick = () => {
            if (typeof navigate === 'function') {
                navigate('area', area);
            }
        };
        
        sidebarContainer.appendChild(areaItem);
    });
}
window.renderSidebarAreas = renderSidebarAreas;

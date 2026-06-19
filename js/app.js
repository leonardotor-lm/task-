// --- CONFIGURACIÓN GLOBAL (ESTADO BLINDADO) ---
window.DB_URL_KEY = 'leo_db_url_key';
window.API_KEY_STORAGE_KEY = 'leo_api_key_storage_key';

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
            date: '', // Corrección: la fecha no se hereda
            startDate: '', // Corrección: la fecha de inicio tampoco se hereda
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
    
    renderTasks();
    showNotice("Subtarea rápida creada.");
    await saveData();
}
// Forzamos la exposición al objeto global para garantizar que el HTML la encuentre
window.quickAddSubtask = quickAddSubtask;
// INICIALIZACIÓN SECUENCIAL Y ASÍNCRONA
window.onload = async () => { 
    try {
        // --- 1. SINCRONIZACIÓN DE VARIABLES LOCALES ---
        dbUrl = window.dbUrl;
        customApiKey = window.customApiKey;

        // --- 2. ENLACE DE MEMORIA PRIMARIO ---
        if (typeof syncGlobals === 'function') syncGlobals();

        if (typeof initSpeechRecognition === 'function') initSpeechRecognition(); 
        if (typeof updateDateDisplay === 'function') updateDateDisplay(); 
        
        const dbInput = document.getElementById('settingsDbUrlInput');
        const apiInput = document.getElementById('settingsApiKeyInput');
        
        if (dbInput) dbInput.value = window.dbUrl;
        if (apiInput) apiInput.value = window.customApiKey;

        // --- 3. PURGA DE AUTOCOMPLETADO DE CHROME ---
        setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
        }, 500);

        // --- 4. NAVEGACIÓN GARANTIZADA ---
        if (typeof window.navigate === 'function') {
            window.navigate('today', null, false);
        }

        let loadedFromCloud = false;
        
        // --- 5. CONEXIÓN A LA NUBE ---
        if (window.dbUrl && window.dbUrl.trim() !== "") { 
            loadedFromCloud = await loadDataFromCloud(); 
        } else { 
            if (typeof showSyncStatus === 'function') showSyncStatus('none'); 
        }

        // --- 6. NORMALIZACIÓN ---
        if (typeof migrateAndNormalizeTasks === 'function') migrateAndNormalizeTasks(); 

        // --- 7. REFRESCO VISUAL ---
        if (typeof updateUI === 'function') updateUI();

    } catch (criticalError) {
        // CIERRE ESTRICTO DEL BLOQUE TRY
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
            
            // --- INYECCIÓN QUIRÚRGICA DE TAGS ---
            if (n.tags === undefined) { n.tags = []; changed = true; }
            // ------------------------------------
            
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

    // Construcción limpia
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
        // IMPORTANTE: Nos aseguramos de que no arrastre propiedades de ruta viejas
    };
    
    // Inserción forzada
    if (data.parentId === 'root') {
        tasks.unshift(newTask);
    } else {
        let parentFound = false;
        
        // Función de inyección limpia
        function findAndInject(nodes) {
            for (let node of nodes) {
                if (node.id === data.parentId) {
                    if (!node.subtasks) node.subtasks = [];
                    node.subtasks.unshift(newTask);
                    
                    // FORZAMOS LA APERTURA VISUAL
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
        
        findAndInject(tasks);
        
        // Si por algún motivo falló la inyección, metela en la raíz para no perderla
        if (!parentFound) tasks.unshift(newTask);
    }
    
    // LIMPIEZA FINAL
    if (typeof closeAddTaskModal === 'function') closeAddTaskModal(); 
    if (typeof renderTasks === 'function') renderTasks(); 
    if (typeof saveData === 'function') await saveData(); 
}
window.addTask = addTask;
async function saveEdit() {
    // 1. Validación inicial (aseguramos que el campo exista y tenga texto)
    const nameInput = document.getElementById('editNameInput');
    if (!nameInput || !nameInput.value.trim()) {
        if (typeof showNotice === 'function') showNotice("El nombre es obligatorio");
        return; 
    }

    const id = editState.id; 
    
    // 2. Recolección de datos directa y segura (evitamos el helper viejo)
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
        // Extracción y limpieza de los tags
        tags: document.getElementById('editTagsInput')?.value.split(',').map(t => t.trim()).filter(t => t !== "") || []
    };

    const newParentId = document.getElementById('editParentInput')?.value || 'root';
    let targetTask = null; 
    
    // 3. Lógica de reubicación si cambió de dependencia
    if (newParentId !== editState.parentId) { 
        targetTask = extractTask(id); 
    }
    
    // 4. Inserción o mutación
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
    
    // 5. Cierre y persistencia
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
            historicalCopy.id = Date.now() + Math.random(); historicalCopy.status = 'completed'; historicalCopy.completedAt = todayStr; historicalCopy.recurrenceRule = null;
            t.date = nextDate; t.status = 'pending'; 
            function resetCompletion(task) { task.status = 'pending'; if (task.subtasks) task.subtasks.forEach(resetCompletion); }
            if(t.subtasks) t.subtasks.forEach(resetCompletion);
            nodes.splice(i, 0, historicalCopy);
            } else { 
                if (t.status === 'completed') {
                    t.status = 'pending';
                    delete t.completedAt; // Purgamos la fecha si se destilda por error
                } else {
                    t.status = 'completed';
                    t.completedAt = Date.now(); // Sellado con precisión de milisegundos
                }
            }
            });
    renderTasks(); renderCalendar(); await saveData();
}
async function deleteTaskUniversal(id) { const task = getTaskById(id); if (!task) return; const performDelete = async () => { if (findAndMutateTask(id, (nodes, i) => { nodes[i].isDeleted = true; nodes[i].deletedAt = Date.now(); })) { refreshAllDropdowns(); renderTasks(); renderCalendar(); showNotice("Enviada a papelera"); await saveData(); } }; if (task.subtasks && task.subtasks.length > 0) { showConfirm("Eliminar con subtareas", `¿Enviar a papelera con sus ${task.subtasks.length} subtareas?`, performDelete, true); } else { await performDelete(); } }

// UTILIDADES Y RENDERIZADO VISUAL
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

        // Guardado persistente usando las llaves globales window.DB_URL_KEY
        if (newUrl) localStorage.setItem(window.DB_URL_KEY, newUrl);
        else localStorage.removeItem(window.DB_URL_KEY);

       if (newApiKey) localStorage.setItem(window.API_KEY_STORAGE_KEY, newApiKey);
        else localStorage.removeItem(window.API_KEY_STORAGE_KEY);

        window.dbUrl = newUrl;
        window.customApiKey = newApiKey;

        // INYECCIÓN QUIRÚRGICA: Sincronización de referencias locales tras el guardado
        dbUrl = window.dbUrl;
        customApiKey = window.customApiKey;

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
function findAndMutateTask(taskId, mutationFn) { function traverse(nodes) { for (let i = 0; i < nodes.length; i++) { if (nodes[i].id === taskId) { mutationFn(nodes, i); return true; } if (nodes[i].subtasks && traverse(nodes[i].subtasks)) return true; } return false; } return traverse(tasks); }
function extractTask(taskId) { let extracted = null; function walk(nodes) { for (let i = 0; i < nodes.length; i++) { if (nodes[i].id === taskId) { extracted = nodes.splice(i, 1)[0]; return true; } if (nodes[i].subtasks && walk(nodes[i].subtasks)) return true; } return false; } walk(tasks); return extracted; }
function insertTask(taskObj, parentId) { if (parentId === 'root') tasks.unshift(taskObj); else findAndMutateTask(parentId, (nodes, i) => { if (!nodes[i].subtasks) nodes[i].subtasks = []; nodes[i].subtasks.push(taskObj); expandedStates[parentId] = true; }); }
function getParentId(taskId) { let pId = 'root'; function search(nodes, currentParent) { for (let n of nodes) { if (n.id === taskId) { pId = currentParent; return true; } if (n.subtasks && search(n.subtasks, n.id)) return true; } return false; } search(tasks, 'root'); return pId; }
function isDescendant(ancestorId, targetId) { if (ancestorId === targetId) return true; let ancestorNode = null; function findAnc(nodes) { for(let n of nodes) { if (n.id === ancestorId) { ancestorNode = n; return; } if (n.subtasks) findAnc(n.subtasks); } } findAnc(tasks); if (!ancestorNode || !ancestorNode.subtasks) return false; let found = false; function checkTarget(nodes) { for(let n of nodes) { if (n.id === targetId) { found = true; return; } if (n.subtasks) checkTarget(n.subtasks); } } checkTarget(ancestorNode.subtasks); return found; }
function getTaskById(id) { let found = null; function walk(nodes) { for (let n of nodes) { if (n.id === id) { found = n; return; } if (n.subtasks && n.subtasks.length > 0) walk(n.subtasks); } } walk(tasks); return found; }
function getUniqueValues(nodes, key) { let vals = new Set(); function walk(ns) { if(!Array.isArray(ns)) return; ns.forEach(n => { if (n.isDeleted) return; if (n[key]) vals.add(n[key]); if(n.subtasks) walk(n.subtasks); }); } walk(nodes); return Array.from(vals); }
function getAllAreasOrdered() { const uniqueTasksAreas = getUniqueValues(tasks, 'area').filter(Boolean); const orphaned = uniqueTasksAreas.filter(a => !customAreas.includes(a)).sort((a, b) => String(a).localeCompare(String(b))); return [...customAreas.filter(Boolean), ...orphaned]; }

// NAVEGACIÓN Y FOCO (Sonda de Telemetría)
function navigate(view, areaName = null, pushHistory = true, focusId = null) { 
    console.log(">> 1. Botón presionado. Navegando a:", view);
    
    if (typeof window.navHistory === 'undefined') window.navHistory = [];
    if (pushHistory) window.navHistory.push(JSON.parse(JSON.stringify(currentState))); 
    
    currentState.view = view; 
    currentState.selectedArea = areaName; 
    currentState.focusTargetId = focusId; 
    console.log(">> 2. Estado de memoria actualizado a:", currentState.view);
    
    if (window.innerWidth < 768 && typeof toggleSidebar === 'function') toggleSidebar(false); 
    
    if (typeof updateUI === 'function') {
        console.log(">> 3. Invocando orquestador visual (updateUI)...");
        updateUI(); 
    } else {
        console.log(">> ERROR SILENCIOSO: El motor no encuentra la función updateUI()");
    }
}

function focusTaskTree(id) { 
    navigate('focus', null, true, id); 
}
function goBack() { 
    if (navHistory.length > 0) { 
        currentState = navHistory.pop(); 
        updateUI(); 
    } 
}

function exportData() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks)); const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", "agenda_backup.json"); dlAnchorElem.click(); }
function importData(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (e) => { try { const importedTasks = JSON.parse(e.target.result); if (Array.isArray(importedTasks)) { tasks = importedTasks; migrateAndNormalizeTasks(); await saveData(); renderTasks(); renderCalendar(); showNotice("Datos importados correctamente"); } } catch (err) { showNotice("Error al leer el archivo"); } }; reader.readAsText(file); }

// RENDERING
    // 1. Rastreo profundo (Algoritmo Recursivo): extrae datos de tareas y de todas sus subtareas
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

    const dynamicAreas = [...new Set(extractDeepValues(tasks, 'area'))];
    const dynamicContexts = [...new Set(extractDeepValues(tasks, 'context'))];
    
    // 2. Restauración estructural: se reinyectan los valores nuevos como objetos legibles
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

    // 3. Fusión estricta y ordenamiento alfabético
    const staticAreas = typeof customAreas !== 'undefined' ? customAreas : [];
    const allAreas = [...new Set([...staticAreas, ...dynamicAreas])].sort();
    
    const staticContexts = (typeof customContexts !== 'undefined' ? customContexts : []).map(c => typeof c === 'object' ? c.name : c);
    const allContexts = [...new Set([...staticContexts, ...dynamicContexts])].sort();
    
    // 4. Inyección segura en el DOM
    if (typeof populateSelect === 'function') {
        if (document.getElementById('areaInput')) populateSelect('areaInput', allAreas);
        if (document.getElementById('editAreaInput')) populateSelect('editAreaInput', allAreas);
        if (document.getElementById('contextInput')) populateSelect('contextInput', allContexts, true, "Sin contexto", "");
        if (document.getElementById('editContextInput')) populateSelect('editContextInput', allContexts, true, "Sin contexto", "");
        if (document.getElementById('filterContext')) populateSelect('filterContext', allContexts, true, "Contexto (Todos)", "all"); 
    }

    // 5. Renderizado de interfaz periférica
    if (typeof renderSidebarAreas === 'function') {
        renderSidebarAreas();
    }
    
    // 6. Consolidación y persistencia de los datos ya saneados
    if (typeof saveCategories === 'function') {
        saveCategories();
    }
window.refreshAllDropdowns = refreshAllDropdowns;
// NAVIGATION & FILTERS CONTINUATION
function updateFilters() {
    if (!window.currentFilters) {
        window.currentFilters = { search: '', status: 'pending', priority: 'all', context: 'all' };
    }
    
    const searchEl = document.getElementById('searchInput');
    const statusEl = document.getElementById('filterStatus');
    const priorityEl = document.getElementById('filterPriority');
    const contextEl = document.getElementById('filterContext');

    currentFilters = {
        search: searchEl ? searchEl.value.trim() : currentFilters.search,
        status: statusEl ? statusEl.value : currentFilters.status,
        priority: priorityEl ? priorityEl.value : currentFilters.priority,
        context: contextEl ? contextEl.value : currentFilters.context
    };

    if (typeof renderTasks === 'function') renderTasks();
}

window.updateFilters = function() {
    window.currentFilters = {
        search: document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '',
        status: document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'pending',
        priority: document.getElementById('filterPriority') ? document.getElementById('filterPriority').value : 'all',
        context: document.getElementById('filterContext') ? document.getElementById('filterContext').value : 'all'
    };
    if (typeof window.renderTasks === 'function') window.renderTasks();
};

window.resetFilters = function() {
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    
    // Validación estricta: Si la vista es "Todas", el reseteo no debe ocultar las completadas
    const defaultStatus = (window.currentState && window.currentState.view === 'all') ? 'all' : 'pending';
    
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = defaultStatus;
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
    if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
    
    // Asignación directa y forzada para evitar variables no definidas
    window.currentSort = { by: 'date', order: 'asc' };
    if (document.getElementById('sortSelect')) {
        document.getElementById('sortSelect').value = 'date-asc';
    }
    
    window.updateFilters();
    if (typeof showNotice === 'function') showNotice("Filtros restablecidos");
};

window.navigate = function(view, areaName = null, pushHistory = true, focusId = null) {
    if (!window.currentState) return;
    
    if (pushHistory && typeof navHistory !== 'undefined') {
        navHistory.push(JSON.parse(JSON.stringify(window.currentState)));
    }
    
    window.currentState.view = view;
    window.currentState.selectedArea = areaName;
    window.currentState.focusTargetId = focusId;
    
    if (window.innerWidth < 768 && typeof toggleSidebar === 'function') toggleSidebar(false);

    // Saneamiento de filtros con directiva estricta de visibilidad
    if (window.currentFilters) {
        window.currentFilters.search = '';
        window.currentFilters.priority = 'all';
        window.currentFilters.context = 'all';
        window.currentFilters.status = (view === 'all') ? 'all' : 'pending';
        
        if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
        if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
        if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
        if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = window.currentFilters.status;
    }
    
    if (typeof window.updateUI === 'function') window.updateUI();
};

window.updateSort = function() { 
    const select = document.getElementById('sortSelect');
    const val = select ? select.value.split('-') : ['date', 'asc']; 
    window.currentSort = { by: val[0], order: val[1] }; 
    if (typeof window.renderTasks === 'function') window.renderTasks(); 
};

// Aliasing de compatibilidad por si el HTML intenta invocar la versión antigua
if (typeof updateSort === 'undefined') {
    var updateSort = window.updateSort;
}

// Orquestador de interfaz actualizado (Sincronización estricta de Estado Global)
function updateUI() {
    // 1. Puente de Estado: Forzamos la lectura de la variable mutada por la navegación
    const state = window.currentState || (typeof currentState !== 'undefined' ? currentState : { view: 'today' });

    const btnBack = document.getElementById('btnBack'); 
    if (btnBack && typeof navHistory !== 'undefined' && navHistory.length > 0) btnBack.classList.remove('hidden'); 
    else if (btnBack) btnBack.classList.add('hidden');

    // 2. Control de Título Central
    const titles = { 'today':'Hoy y atrasadas', 'tomorrow':'Mañana', 'week':'Esta semana', 'fortnight':'Próximos 15 días', 'all':'Todas las tareas', 'calendar':'Calendario', 'focus':'Dependencia específica', 'trash':'Papelera (10 días)' };
    const currentTitleText = state.view === 'area' ? `Área: ${state.selectedArea}` : titles[state.view];
    
    document.querySelectorAll('[id="view-title"]').forEach(titleEl => {
        titleEl.innerText = currentTitleText;
    });

    const isTrash = state.view === 'trash';
    
    // 3. Resaltado Dinámico en Menú Lateral
    ['nav-today', 'nav-tomorrow', 'nav-week', 'nav-fortnight', 'nav-all', 'nav-calendar', 'nav-trash'].forEach(id => { 
        document.querySelectorAll(`[id="${id}"]`).forEach(el => { 
            if (id === `nav-${state.view}`) { 
                el.classList.add('bg-navy-900', 'text-brand-500', 'border-r-2', 'border-brand-500'); 
                el.classList.remove('text-navy-300', 'border-transparent'); 
                if(id === 'nav-trash') {
                    const svg = el.querySelector('svg');
                    if (svg) svg.classList.remove('text-danger-500'); 
                }
            } else { 
                el.classList.remove('bg-navy-900', 'text-brand-500', 'border-r-2', 'border-brand-500'); 
                el.classList.add('text-navy-300', 'border-transparent'); 
                if(id === 'nav-trash') {
                    const svg = el.querySelector('svg');
                    if (svg) svg.classList.add('text-danger-500'); 
                }
            } 
        });
    });
    
    document.querySelectorAll('.sidebar-area-item').forEach(el => { 
        if (state.view === 'area' && el.dataset.area === state.selectedArea) { 
            el.classList.add('border-brand-500', 'bg-navy-900', 'text-brand-500'); 
            el.classList.remove('border-transparent', 'text-navy-300'); 
        } else { 
            el.classList.remove('border-brand-500', 'bg-navy-900', 'text-brand-500'); 
            el.classList.add('border-transparent', 'text-navy-300'); 
        } 
    });
    
    const toggleHiddenAll = (id, condition) => { 
        document.querySelectorAll(`[id="${id}"]`).forEach(el => el.classList.toggle('hidden', condition)); 
    };

    toggleHiddenAll('view-list', state.view === 'calendar'); 
    
    if (state.view === 'calendar') { 
        toggleHiddenAll('omnibar-container', true); 
        document.querySelectorAll('[id="btnAIToggle"]').forEach(aiBtn => {
            aiBtn.classList.remove('text-brand-500', 'bg-navy-700'); 
            aiBtn.classList.add('text-navy-400');
        });
    }
    
    toggleHiddenAll('view-calendar', state.view !== 'calendar'); 
    toggleHiddenAll('filters-container', state.view === 'calendar');
    toggleHiddenAll('btnEmptyTrash', !isTrash);
    toggleHiddenAll('searchWrap', isTrash);
    toggleHiddenAll('filterStatus', isTrash);
    toggleHiddenAll('filterPriority', isTrash);
    toggleHiddenAll('filterContext', isTrash);
    toggleHiddenAll('sortSelect', isTrash);
    toggleHiddenAll('btnBulkMode', isTrash);
    toggleHiddenAll('btnResetFilters', isTrash);
    toggleHiddenAll('btnAIToggle', isTrash);
    toggleHiddenAll('filtersDivider', isTrash);
    
    document.querySelectorAll('[id="mainFab"]').forEach(fab => {
        if (isTrash) fab.classList.add('hidden'); 
        else { 
            fab.classList.remove('hidden'); 
            if (typeof isBulkMode !== 'undefined' && isBulkMode) fab.classList.add('translate-y-24', 'opacity-0'); 
            else fab.classList.remove('translate-y-24', 'opacity-0'); 
        }
    });
    
    if (state.view === 'calendar' && typeof isBulkMode !== 'undefined' && isBulkMode && typeof toggleBulkMode === 'function') toggleBulkMode();
    
    if (typeof calculateSidebarCounters === 'function' && typeof renderSidebarCounters === 'function') {
        renderSidebarCounters(calculateSidebarCounters(tasks));
    }
    if (state.view === 'calendar' && typeof renderCalendar === 'function') renderCalendar(); 
    else if (typeof renderTasks === 'function') renderTasks();
}

// VARIOUS OTHER UTILS
function toggleExpand(id, event) { if (event) event.stopPropagation(); expandedStates[id] = !expandedStates[id]; localStorage.setItem('leo_expanded_states', JSON.stringify(expandedStates)); renderTasks(); }

// 1. Restaurar tarea
window.restoreTask = function(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.isDeleted = false;
        delete task.deletedAt;
        task.status = 'pending'; // Devuelve el estado a pendiente
        
        // NOTA: Reemplazá 'saveTasks()' por el nombre exacto de la función 
        // que uses para guardar en localStorage si se llama distinto.
        if (typeof saveTasks === 'function') saveTasks(); 
        renderTasks();
    }
};

// 2. Borrado definitivo individual
window.deleteTaskPermanently = function(id) {
    if (confirm("¿Estás seguro de eliminar esta tarea definitivamente? Esta acción es irreversible.")) {
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            tasks.splice(index, 1); // Extirpa la tarea del array global
            if (typeof saveTasks === 'function') saveTasks();
            renderTasks();
        }
    }
};

// 3. Vaciar toda la papelera
window.emptyTrash = function() {
    const trashCount = tasks.filter(t => t.isDeleted).length;
    if (trashCount === 0) return; // Evita acciones si ya está vacía

    if (confirm(`¿Estás seguro de eliminar definitivamente las ${trashCount} tareas de la papelera?`)) {
        // Mantenemos solo las tareas que NO están en la papelera.
        // Usamos splice para no perder la referencia de memoria del array original 'tasks'.
        const remainingTasks = tasks.filter(t => !t.isDeleted);
        tasks.length = 0; 
        tasks.push(...remainingTasks);
        
        if (typeof saveTasks === 'function') saveTasks();
        renderTasks();
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
function openDayDetail(dateStr) { const dayTasks = []; function collect(ns, pName) { if (!Array.isArray(ns)) return; ns.forEach(n => { if (n.isDeleted) return; if (n.status !== 'completed' && n.date === dateStr) dayTasks.push({ ...n, type: pName ? `Depende de: ${pName}` : 'Principal' }); if (n.subtasks) collect(n.subtasks, n.name); }); } collect(tasks, null); document.getElementById('modalDateTitle').innerText = new Date(dateStr + "T00:00:00").toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }); const content = document.getElementById('modalContent'); if (dayTasks.length === 0) content.innerHTML = '<p class="text-navy-400 text-sm text-center italic py-10">Libre de tareas.</p>'; else content.innerHTML = dayTasks.map(t => `<div class="p-4 bg-navy-900 border border-navy-700 rounded-md flex items-center justify-between cursor-pointer hover:bg-navy-800 transition-colors" onclick="openEditModal(${t.id}); closeModal();"><div><p class="font-semibold text-sm ${t.status === 'in_progress' ? 'text-info-500' : 'text-navy-50'}">${t.name}</p><p class="text-[9px] text-navy-400 uppercase tracking-wider font-bold">${t.area}${t.context ? ` &bull; ${t.context}` : ''} &bull; <span class="text-brand-500">${t.type}</span></p></div><div class="flex flex-col items-end gap-1"><svg class="w-3.5 h-3.5 ${priorityColors[t.priority]}" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg></div></div>`).join(''); document.getElementById('dayDetailModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('dayDetailModal').classList.add('hidden'); }

function openManageModal() { document.getElementById('manageModalTitle').innerText = 'Gestionar Categorías'; renderManageItems(); document.getElementById('manageModal').classList.remove('hidden'); }
function closeManageModal() { document.getElementById('manageModal').classList.add('hidden'); }

// FUNCIONES DE GESTIÓN DE ÁREAS Y CONTEXTOS

// Función para mantener la integridad de los datos al editar categorías
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
    
    // Diccionario de colores seguro para la interfaz
    const colorHexMap = { 'blue': '#3b82f6', 'purple': '#a855f7', 'green': '#22c55e', 'red': '#ef4444', 'orange': '#f97316', 'gray': '#6b7280', 'pink': '#ec4899', 'teal': '#14b8a6', 'yellow': '#eab308', 'cyan': '#06b6d4', 'indigo': '#6366f1', 'rose': '#f43f5e', 'emerald': '#10b981', 'fuchsia': '#d946ef' };
    
    // 1. Purga de modales huérfanos previos (prevención de superposición)
    const modalId = 'dynamic-edit-context-modal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    // 2. Construcción del contenedor principal
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 flex items-center justify-center';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // Fondo oscuro translúcido
    modal.style.zIndex = '9999'; // Garantiza prioridad visual absoluta
    
    // 3. Renderizado dinámico de la paleta de colores
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

    // 4. Inyección del código HTML interno
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
    
    // 5. Gestión del foco para optimizar el tipeo inmediato
    const nameInput = document.getElementById('editContextNameInput');
    nameInput.focus();
    nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
    
    // 6. Lógica de cancelación
    document.getElementById('cancelEditCtxBtn').onclick = () => modal.remove();
    
    // 7. Lógica de guardado asincrónico y actualización en cascada
    document.getElementById('saveEditCtxBtn').onclick = async () => {
        const newNameRaw = nameInput.value.trim();
        if (!newNameRaw) return; // Validación silenciosa si está vacío
        
        let finalName = newNameRaw;
        if (!finalName.startsWith('@')) finalName = '@' + finalName;
        
        const selectedColor = modal.dataset.selectedColor || 'gray';
        
        // Actualiza las tareas previas si se modificó el nombre
        if (finalName !== oldCtx.name) {
            if (typeof cascadeUpdateCategory === 'function') {
                cascadeUpdateCategory('context', oldCtx.name, finalName);
            }
        }
        
        // Mutación de la base de datos local
        customContexts[index].name = finalName;
        customContexts[index].color = selectedColor;
        
        // Persistencia y actualización de vistas
        if (typeof saveData === 'function') await saveData();
        if (typeof renderManageItems === 'function') renderManageItems();
        if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
        
        // Destrucción del modal efímero
        modal.remove();
    };
};

window.addCustomContext = async function() {
    const input = document.getElementById('newContextInput');
    if (!input) return;
    
    const val = input.value.trim();
    if(val) {
        const name = val.startsWith('@') ? val : '@' + val;
        
        // Prevención estricta: asignación de color por defecto si no se seleccionó ninguno
        const safeColor = (typeof manageSelectedColor !== 'undefined' && manageSelectedColor) ? manageSelectedColor : 'gray';
        
        customContexts.push({name: name, color: safeColor});
        await saveData();
        
        // Purga de la variable temporal
        manageSelectedColor = 'gray'; 
        renderManageItems();
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

window.selectManageColor = function(color) {
    manageSelectedColor = color;
    
    // Rescate del estado previo a la destrucción del DOM
    const inputDOM = document.getElementById('newContextInput');
    const currentText = inputDOM ? inputDOM.value : '';
    
    renderManageItems();
    
    // Re-inyección del texto para no interrumpir el flujo de escritura
    const restoredInput = document.getElementById('newContextInput');
    if (restoredInput) {
        restoredInput.value = currentText;
        restoredInput.focus();
    }
};

window.addCustomContext = async function() {
    const input = document.getElementById('newContextInput');
    if (!input) return;
    
    const val = input.value.trim();
    if(val) {
        const name = val.startsWith('@') ? val : '@' + val;
        
        // Prevención estricta: si el usuario no tocó ningún color, se asigna uno por defecto
        const safeColor = (typeof manageSelectedColor !== 'undefined' && manageSelectedColor) ? manageSelectedColor : 'gray';
        
        customContexts.push({name: name, color: safeColor});
        await saveData();
        
        // Purga de la variable en memoria para que no contamine la creación del siguiente contexto
        manageSelectedColor = 'gray';
        renderManageItems();
        
        if(typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
    }
};

// Controladores globales para la jerarquización manual anexados directamente al objeto window
// Se omiten las declaraciones "let" a nivel de raíz para erradicar el riesgo de SyntaxError
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

    // Mutación quirúrgica de la matriz posicional
    const areaToMove = customAreas.splice(window.draggedAreaIndex, 1)[0];
    customAreas.splice(targetIndex, 0, areaToMove);
    
    // Purga de la variable temporal en memoria
    window.draggedAreaIndex = null;

    // Consolidación y renderizado
    if (typeof saveData === 'function') await saveData();
    renderManageItems();
    if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
};

function renderManageItems() {
    const container = document.getElementById('manageModalContent');
    if (!container) return; // Blindaje contra nodos de interfaz inexistentes
    
    const colorHexMap = { 'blue': '#3b82f6', 'purple': '#a855f7', 'green': '#22c55e', 'red': '#ef4444', 'orange': '#f97316', 'gray': '#6b7280', 'pink': '#ec4899', 'teal': '#14b8a6', 'yellow': '#eab308', 'cyan': '#06b6d4', 'indigo': '#6366f1', 'rose': '#f43f5e', 'emerald': '#10b981', 'fuchsia': '#d946ef' };
    
    // Evaluación segura de la variable de color para evitar ReferenceError si no fue instanciada
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

async function setTaskStatus(id, newStatus) { findAndMutateTask(id, (nodes, i) => { nodes[i].status = newStatus; }); renderTasks(); renderCalendar(); await saveData(); }
async function restoreTask(id) { if (findAndMutateTask(id, (nodes, i) => { nodes[i].isDeleted = false; delete nodes[i].deletedAt; })) { refreshAllDropdowns(); renderTasks(); renderCalendar(); showNotice("Tarea restaurada"); await saveData(); } }
async function hardDeleteTask(id) { showConfirm("Eliminar", "¿Eliminar definitivamente?", async () => { if (findAndMutateTask(id, (nodes, i) => nodes.splice(i, 1))) { refreshAllDropdowns(); renderTasks(); showNotice("Eliminada"); await saveData(); } }, true); }
// Vaciar toda la papelera (Refactorizado)
window.emptyTrash = async function() {
    let hasDeletedTasks = false;
    
    // 1. Verificación previa de seguridad
    function checkDeleted(nodes) {
        for (let node of nodes) {
            if (node.isDeleted) return true;
            if (node.subtasks && checkDeleted(node.subtasks)) return true;
        }
        return false;
    }
    
    if (typeof tasks !== 'undefined') hasDeletedTasks = checkDeleted(tasks);

    if (!hasDeletedTasks) {
        if (typeof showNotice === 'function') showNotice("La papelera ya está vacía");
        return;
    }

    // 2. Ejecución con persistencia estricta
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
                    if (typeof showNotice === 'function') showNotice("Papelera vaciada por completo");
                    if (typeof saveData === 'function') await saveData(); // Persistencia forzada
                }
            }, 
            true
        );
    }
};

// BULK ACTIONS
// BULK ACTIONS
window.toggleBulkMode = function() { 
    isBulkMode = !isBulkMode; 
    selectedTaskIds.clear(); 
    document.getElementById('btnBulkMode').classList.toggle('text-brand-500', isBulkMode); 
    
    const bar = document.getElementById('bulkActionBar');
    if (bar) {
        bar.classList.toggle('translate-y-32', !isBulkMode); 
        bar.classList.toggle('opacity-0', !isBulkMode); 
        // Elevación forzada para evitar solapamiento de capas invisibles
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

    // 1. Aislamos la lógica de mutación
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

    // 2. Delegamos el control usando el nombre correcto de tu UI
    if (typeof showConfirm === 'function') {
        showConfirm(
            "Eliminar tareas", 
            `¿Seguro que querés enviar ${selectedTaskIds.size} tareas a la papelera?`, 
            executeBulkDeletion
        );
    } else {
        console.error("Fallo de acoplamiento: showConfirm no está definida en el entorno global.");
    }
};
window.bulkComplete = async function() { 
    if (selectedTaskIds.size === 0) return; 
    selectedTaskIds.forEach(id => toggleTaskUniversal(id)); 
    toggleBulkMode(); 
    renderTasks(); 
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
    // 1. UI: Recolectar datos
    const formData = getBulkMoveFormData();
    
    // 2. Modelo: Mutar las tareas seleccionadas
    selectedTaskIds.forEach(id => {
        findAndMutateTask(id, (nodes, i) => {
            nodes[i].area = formData.newArea;
            if (formData.newContext !== "") {
                nodes[i].context = formData.newContext;
            }
        });
    });
    
    // 3. UI: Refrescar interfaz y cerrar modales
    if (typeof toggleBulkMode === 'function') toggleBulkMode();
    if (typeof closeBulkMoveModal === 'function') closeBulkMoveModal();
    refreshAllDropdowns();
    renderTasks();
    showNotice("Tareas reubicadas");
    
    // 4. Cloud: Persistencia
    await saveData();
}
window.applyBulkMove = applyBulkMove;
// POSTPONE ACTIONS
async function postponeAction(type) { 
    let fd = ''; 
    
    // Cálculos de fecha
    if (type === 'tomorrow') { 
        const tom = new Date(); 
        tom.setDate(tom.getDate() + 1); 
        fd = tom.toISOString().split('T')[0]; 
    } else if (type === 'nextWeek') { 
        const nw = new Date(); 
        nw.setDate(nw.getDate() + 7); 
        fd = nw.toISOString().split('T')[0]; 
    } else if (type === 'custom') { 
        // 1. UI: Recolectar fecha personalizada
        fd = getPostponeCustomDateValue(); 
        if (!fd) return; 
    } 
    
    // 2. Modelo: Aplicar mutación
    if (postponeState.id === 'bulk') { 
        selectedTaskIds.forEach(taskId => {
            findAndMutateTask(taskId, (nodes, i) => { nodes[i].date = fd; });
        }); 
        if (typeof toggleBulkMode === 'function') toggleBulkMode(); 
    } else { 
        findAndMutateTask(postponeState.id, (nodes, i) => { nodes[i].date = fd; }); 
    } 
    
    // 3. UI: Refrescar interfaz
    if (typeof closePostponeModal === 'function') closePostponeModal(); 
    if (typeof renderTasks === 'function') renderTasks(); 
    
    // 4. Cloud: Persistencia
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
            // Corrección estructural: se alinea el identificador con el parámetro esperado por el servidor
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
                // El servidor devuelve un objeto con la propiedad 'url', la cual es interceptada aquí
                finalUrl = parsed.url || parsed.link || parsed.fileUrl || parsed.fileId || finalUrl;
            } catch (jsonError) {
                // Silenciamiento del error de parseo si el servidor devuelve texto plano
            }

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
    // Iteración simultánea sobre los contenedores de "Crear" y "Editar" sin depender del parámetro 'mode'
    ['attachmentsList', 'editAttachmentsList'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return; 
        
        container.innerHTML = '';
        
        currentAttachments.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-navy-800 p-2 rounded text-xs text-navy-50 mb-1 border border-navy-700";
            
            // Extracción robusta del enlace histórico o actual
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

// --- ORQUESTACIÓN Y ESTADO GLOBAL UNIFICADO ---
// Puente de sincronización: ata las variables léxicas al objeto global por referencia
function syncGlobals() {
    if (typeof currentState !== 'undefined' && !window.currentState) window.currentState = currentState;
    if (typeof currentFilters !== 'undefined' && !window.currentFilters) window.currentFilters = currentFilters;
}

window.updateFilters = function() {
    syncGlobals();
    if (window.currentFilters) {
        window.currentFilters.search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';
        window.currentFilters.status = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'pending';
        window.currentFilters.priority = document.getElementById('filterPriority') ? document.getElementById('filterPriority').value : 'all';
        window.currentFilters.context = document.getElementById('filterContext') ? document.getElementById('filterContext').value : 'all';
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
    
    if (pushHistory && typeof navHistory !== 'undefined') {
        navHistory.push(JSON.parse(JSON.stringify(window.currentState)));
    }
    
    window.currentState.view = view;
    window.currentState.selectedArea = areaName;
    window.currentState.focusTargetId = focusId;
    
    if (window.innerWidth < 768 && typeof toggleSidebar === 'function') toggleSidebar(false);

    if (window.currentFilters) {
        window.currentFilters.search = '';
        window.currentFilters.priority = 'all';
        window.currentFilters.context = 'all';
        window.currentFilters.status = (view === 'all') ? 'all' : 'pending';
        
        if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
        if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = 'all';
        if (document.getElementById('filterContext')) document.getElementById('filterContext').value = 'all';
        if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = window.currentFilters.status;
    }
    
    // Invocamos updateUI (que está más arriba en app.js) para pintar la estructura
    if (typeof updateUI === 'function') updateUI(); 
};
// --- MOTOR DE PAPELERA: RESTAURACIÓN Y DESTRUCCIÓN ---

window.restaurarTarea = async function(id) {
    if (!id) return;
    
    // Busca la tarea en la memoria y le quita la marca de eliminada
    findAndMutateTask(id, (nodes, i) => {
        nodes[i].isDeleted = false;
    });
    
    // Refresca la pantalla y guarda en la base de datos
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof saveData === 'function') await saveData();
    if (typeof showNotice === 'function') showNotice("Tarea restaurada a pendientes.");
};

window.destruirTarea = async function(id) {
    if (!id) return;
    
    // Invocamos a tu modal estético y esperamos el clic (await)
    const confirmacion = await window.pedirConfirmacionVisual(
        "Destruir registro",
        "¿Estás seguro? La o las tareas serán eliminadas de forma permanente de la base de datos."
    );
    
    if (!confirmacion) return; // Si hace clic en Cancelar, el código muere aquí.
    
    // Si hace clic en Confirmar, ejecutamos la purga
    findAndMutateTask(id, (nodes, i) => {
        nodes.splice(i, 1); 
    });

    if (typeof renderTasks === 'function') renderTasks();
    if (typeof saveData === 'function') await saveData();
    if (typeof showNotice === 'function') showNotice("Registro destruido definitivamente.");
};

// --- CONTROLADOR DE CONFIRMACIÓN VISUAL ---
window.resolveConfirmacion = null;

window.pedirConfirmacionVisual = function(titulo, mensaje) {
    return new Promise((resolve) => {
        // 1. Inyectamos los textos en tu diseño
        document.getElementById('confirmModalTitle').innerText = titulo;
        document.getElementById('confirmModalMessage').innerText = mensaje;
        
        // 2. Modificamos el botón de acción para que luzca destructivo (rojo)
        const btnConfirmar = document.getElementById('confirmModalBtnAction');
        btnConfirmar.className = "w-1/2 bg-danger-600 text-navy-50 py-3 rounded-md text-sm font-semibold hover:bg-danger-500 transition-colors focus:outline-none";
        btnConfirmar.innerText = "Destruir definitivamente";

        // 3. Hacemos visible el modal
        document.getElementById('confirmModal').classList.remove('hidden');
        
        // 4. Guardamos la llave de la promesa en memoria
        window.resolveConfirmacion = resolve;
    });
};

// Esta es la función que tus botones de HTML ya están llamando en el onclick
window.closeConfirmModal = function(resultado) {
    document.getElementById('confirmModal').classList.add('hidden');
    
    // 1. VÍA ORIGINAL: Ejecuta el envío a la papelera (Bulk Edition y Tareas complejas)
    if (resultado && typeof confirmCallback === 'function') {
        confirmCallback();
    }
    // Limpieza de memoria de la vía original
    if (typeof confirmCallback !== 'undefined') {
        confirmCallback = null;
    }
    
    // 2. VÍA NUEVA: Ejecuta la destrucción definitiva de la papelera
    if (window.resolveConfirmacion) {
        window.resolveConfirmacion(resultado); 
        window.resolveConfirmacion = null;
    }
};
// Delegación de eventos ultra-robusta
document.addEventListener('click', function(e) {
    // Buscamos el elemento .task-item más cercano al clic
    const taskItem = e.target.closest('.task-item');
    
    if (taskItem) {
        const taskId = taskItem.dataset.id;
        console.log("¡Clic interceptado en tarea:", taskId);
        
        // Verificamos si el clic fue en el nombre de la tarea para editar
        if (e.target.classList.contains('task-name')) {
            if (typeof window.openEditModal === 'function') {
                window.openEditModal(Number(taskId));
            }
        }
    }
});
// Restaurar tarea desde la papelera
window.restoreTaskNative = async function(id) {
    if (typeof findAndMutateTask === 'function') {
        findAndMutateTask(id, (nodes, i) => {
            nodes[i].isDeleted = false;
            nodes[i].deletedAt = null;
        });
        if (typeof refreshAllDropdowns === 'function') refreshAllDropdowns();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof showNotice === 'function') showNotice("Tarea restaurada con éxito");
        if (typeof saveData === 'function') await saveData();
    }
};

// Eliminación destructiva (Hard Delete)
window.hardDeleteTaskNative = function(id) {
    if (typeof showConfirm === 'function') {
        showConfirm("Atención: Borrado Definitivo", "Esta acción eliminará la tarea de la base de datos de manera permanente y no se puede deshacer. ¿Continuar?", async () => {
            
            // Función recursiva para erradicar el nodo del array en memoria
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
                if (typeof showNotice === 'function') showNotice("Registro eliminado de la base de datos");
                if (typeof saveData === 'function') await saveData();
            }
        }, true);
    }
};
// Vaciar toda la papelera
window.emptyTrashNative = function() {
    // Verificamos si hay algo que borrar antes de abrir el modal
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
                // Función recursiva inversa para evitar saltos de índice al hacer splice
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
                    if (typeof showNotice === 'function') showNotice("Papelera vaciada por completo");
                    if (typeof saveData === 'function') await saveData();
                }
            }, 
            true
        );
    }
};
window.syncViewUI = function() {
    // 1. Sincronización del Título Principal
    const viewTitles = {
        'today': 'Hoy y atrasadas',
        'all': 'Todas las tareas',
        'focus': 'Modo Enfoque',
        'trash': 'Papelera'
    };

    // Ajustá 'viewTitle' por el ID real que tenga tu etiqueta <h2> o <h1> en el HTML
    const titleElement = document.getElementById('viewTitle') || document.querySelector('.main-header h2');
    if (titleElement && viewTitles[currentState.view]) {
        titleElement.textContent = viewTitles[currentState.view];
    }

    // 2. Sincronización de la Barra Lateral
    // Interceptamos los botones basándonos en su atributo onclick
    const sidebarButtons = document.querySelectorAll('[onclick*="changeView"], [onclick*="setView"], [onclick*="switchView"]');
    
    sidebarButtons.forEach(btn => {
        // Removemos las clases de estado "activo" de todos los botones
        btn.classList.remove('bg-navy-700', 'text-brand-500', 'font-semibold');
        
        // Comprobamos si este botón invoca a la vista que está actualmente en el estado
        if (btn.getAttribute('onclick').includes(currentState.view)) {
            // Aplicamos las clases de iluminación al botón correspondiente
            btn.classList.add('bg-navy-700', 'text-brand-500', 'font-semibold');
        }
    });
};
// Función autónoma y segura para cambiar el estado de la tarea
window.toggleProgressSafe = async function(id, event) {
    if (event) event.stopPropagation(); // Frenamos el clic para que no abra el modal
    
    let found = false;
    let newStatus = "";
    
    // Recorrido directo sobre el árbol en memoria
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
            // Invocamos actualización de UI y persistencia
            if (typeof renderTasks === 'function') renderTasks();
            if (typeof showNotice === 'function') showNotice(newStatus === 'in_progress' ? "Tarea en progreso" : "Tarea pausada");
            if (typeof saveData === 'function') await saveData();
        }
    }
};

// Función segura para inyectar el ID del padre al crear subtarea
window.prepareSubtaskSafe = function(id, event) {
    if (event) event.stopPropagation();
    
    if (typeof openAddTaskModal === 'function') {
        openAddTaskModal();
        // Retardo estratégico para que el DOM termine de dibujar el <select>
        setTimeout(() => {
            const parentDropdown = document.getElementById('parentInput');
            if (parentDropdown) {
                parentDropdown.value = id;
            }
        }, 50);
    }
};

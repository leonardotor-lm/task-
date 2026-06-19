/** MÓDULO DE INTERFAZ (ui.js) */
function getAddTaskFormData() {
    // Función auxiliar para leer inputs sin riesgo de crash (si no existe, devuelve '')
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const isChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

    const parentIdRaw = getVal('parentInput');
    const rawDate = getVal('dateInput');
    const rawTags = getVal('tagsInput'); // Lectura segura

    return {
        name: getVal('taskInput').trim(),
        area: getVal('areaInput'),
        context: getVal('contextInput'),
        priority: getVal('priorityInput') || 'baja',
        dateInput: rawDate ? rawDate : "",
        timeInput: getVal('timeInput'),
        notes: getVal('notesInput').trim(),
        reminder: isChecked('reminderToggle'),
        rule: typeof buildRuleFromUI === 'function' ? buildRuleFromUI('add') : null,
        parentId: parentIdRaw === 'root' ? 'root' : (parentIdRaw ? Number(parentIdRaw) : 'root'),
        tags: rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : []
    };
}
window.getAddTaskFormData = getAddTaskFormData;
function getEditTaskFormData() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const isChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

    const newParentIdRaw = getVal('editParentInput');
    const rawTags = getVal('editTagsInput');

    return {
        name: getVal('editNameInput').trim(),
        status: getVal('editStatusInput') || 'pending',
        area: getVal('editAreaInput'),
        context: getVal('editContextInput'),
        priority: getVal('editPriorityInput') || 'baja',
        dateInput: getVal('editDateInput'),
        timeInput: getVal('editTimeInput'),
        notes: getVal('editNotesInput').trim(),
        reminder: isChecked('editReminderToggle'),
        rule: typeof buildRuleFromUI === 'function' ? buildRuleFromUI('edit') : null,
        newParentId: newParentIdRaw === 'root' ? 'root' : (newParentIdRaw ? Number(newParentIdRaw) : 'root'),
        tags: rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : []
    };
}
window.getEditTaskFormData = getEditTaskFormData;

function getBulkMoveFormData() {
    return {
        newArea: document.getElementById('bulkAreaInput').value,
        newContext: document.getElementById('bulkContextInput').value
    };
}
window.getBulkMoveFormData = getBulkMoveFormData;
function getPostponeCustomDateValue() {
    const input = document.getElementById('postponeCustomDate');
    return input ? input.value : '';
}
window.getPostponeCustomDateValue = getPostponeCustomDateValue;

function renderSidebarAreas() { 
    const allAreas = typeof getAllAreasOrdered === 'function' ? getAllAreasOrdered() : []; 
    const container = document.getElementById('sidebar-areas-list');
    if (!container) return;

    container.innerHTML = allAreas.map(area => {
        // Delegamos el cálculo estrictamente al motor
        const count = typeof getAreaTaskCount === 'function' ? getAreaTaskCount(area) : 0;

        return `<button onclick="navigate('area', '${area}')" data-area="${area}" class="sidebar-area-item w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-navy-300 transition-all border-r-2 border-transparent hover:bg-navy-700 hover:text-navy-50 focus:outline-none">
            <div class="flex items-center space-x-3 overflow-hidden">
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${area === 'Inbox' ? 'bg-brand-500' : 'bg-navy-500'}"></span>
                <span class="truncate">${area}</span>
            </div>
            <span class="text-[10px] font-bold text-navy-400 bg-navy-800 px-1.5 py-0.5 rounded-md ml-2">${count}</span>
        </button>`;
    }).join(''); 
}
window.renderSidebarAreas = renderSidebarAreas;
function populateSelect(selectId, options, addEmpty = false, emptyText = 'Ninguno', emptyValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    let html = '';
    if (addEmpty) html += `<option value="${emptyValue}">${emptyText}</option>`;
    options.forEach(opt => {
        const val = typeof opt === 'object' ? opt.name : opt;
        const text = typeof opt === 'object' ? opt.name : opt;
        html += `<option value="${val}">${text}</option>`;
    });
    select.innerHTML = html;
}
window.populateSelect = populateSelect;

function refreshAllDropdowns() {
    populateSelect('areaInput', customAreas);
    populateSelect('editAreaInput', customAreas);
    populateSelect('bulkAreaInput', customAreas, true, 'Mantener original');
    populateSelect('contextInput', customContexts, true, 'Sin contexto');
    populateSelect('editContextInput', customContexts, true, 'Sin contexto');
    populateSelect('bulkContextInput', customContexts, true, 'Mantener original');
    updateAddParentDropdown();
}
window.refreshAllDropdowns = refreshAllDropdowns;

function refreshEditDropdowns(taskId) {
    populateSelect('editAreaInput', customAreas);
    populateSelect('editContextInput', customContexts, true, 'Sin contexto');
    updateEditParentDropdown(taskId);
}
window.refreshEditDropdowns = refreshEditDropdowns;

function updateAddParentDropdown() {
    const parentInput = document.getElementById('parentInput');
    if (!parentInput) return;
    
    // Se invoca a las funciones del motor
    
const flat = typeof flattenMatches === 'function' ? flattenMatches(pruneTree(tasks, window.currentState, window.currentFilters)) : [];    
   
    let html = '<option value="root">Ninguna (Tarea principal)</option>';
    flat.forEach(t => {
        if (!t.isDeleted) {
            const prefix = t._parentPath ? t._parentPath.map(() => '-').join('') : '';
            html += `<option value="${t.id}">${prefix} ${t.name}</option>`;
        }
    });
    parentInput.innerHTML = html;
}
window.updateAddParentDropdown = updateAddParentDropdown;

function updateEditParentDropdown(taskId) {
    const parentInput = document.getElementById('editParentInput');
    if (!parentInput) return;
    
const flat = typeof flattenMatches === 'function' ? flattenMatches(pruneTree(tasks, window.currentState, window.currentFilters)) : [];
    
    let html = '<option value="root">Ninguna (Tarea principal)</option>';
    flat.forEach(t => {
        // Regla visual: una tarea no puede ser padre de sí misma ni de sus descendientes
        const valid = !t.isDeleted && t.id !== taskId && (typeof isDescendant === 'function' ? !isDescendant(taskId, t.id) : true);
        if (valid) {
            const prefix = t._parentPath ? t._parentPath.map(() => '-').join('') : '';
            html += `<option value="${t.id}">${prefix} ${t.name}</option>`;
        }
    });
    parentInput.innerHTML = html;
}
window.updateEditParentDropdown = updateEditParentDropdown;

function showNotice(msg) { const box = document.getElementById('notification-box'); const notice = document.createElement('div'); notice.className = "bg-brand-500 text-navy-900 px-6 py-4 rounded-md text-xs font-bold animate-in select-none pointer-events-auto border border-brand-600"; notice.innerText = msg; box.appendChild(notice); setTimeout(() => { notice.style.opacity = '0'; notice.style.transition = 'opacity 0.3s'; setTimeout(() => notice.remove(), 300); }, 2500); }

function showSyncStatus(status) { const dot = document.getElementById('sync-status-dot'); const text = document.getElementById('sync-status-text'); if (!dot || !text) return; dot.className = "w-1.5 h-1.5 rounded-full transition-all"; switch(status) { case 'saving': dot.classList.add('bg-blue-500', 'animate-pulse'); text.innerText = "Guardando..."; text.className = "text-blue-400"; break; case 'synced': dot.classList.add('bg-emerald-500'); text.innerText = "Sincronizado"; text.className = "text-emerald-400"; break; case 'loading': dot.classList.add('bg-brand-500', 'animate-pulse'); text.innerText = "Cargando..."; text.className = "text-brand-400"; break; case 'offline': dot.classList.add('bg-yellow-500'); text.innerText = "Modo Offline"; text.className = "text-yellow-400"; break; case 'error': dot.classList.add('bg-red-500'); text.innerText = "Fallo de Red"; text.className = "text-red-400"; break; default: dot.classList.add('bg-navy-500'); text.innerText = "Nube Desconectada"; text.className = "text-navy-400"; break; } }

function showConfirm(title, message, onConfirm, isDanger = false) { 
    document.getElementById('confirmModalTitle').innerText = title; 
    document.getElementById('confirmModalMessage').innerText = message; 
    confirmCallback = onConfirm; 
    const btnConfirm = document.getElementById('confirmModalBtnAction'); 
    
    // AGREGAMOS ESTA LÍNEA PARA RESETEAR EL TEXTO VISUAL:
    btnConfirm.innerText = "Confirmar"; 
    
    if (isDanger) btnConfirm.className = "w-1/2 bg-danger-500 text-navy-50 py-3 rounded-md text-sm font-semibold hover:bg-danger-600 focus:outline-none"; 
    else btnConfirm.className = "w-1/2 bg-brand-500 text-navy-900 py-3 rounded-md text-sm font-semibold hover:bg-brand-400 transition-colors focus:outline-none"; 
    document.getElementById('confirmModal').classList.remove('hidden'); 
}

function closeConfirmModal(accepted) { document.getElementById('confirmModal').classList.add('hidden'); if (accepted && confirmCallback) confirmCallback(); confirmCallback = null; }

window.showNotice = showNotice;
window.showSyncStatus = showSyncStatus;
window.showConfirm = showConfirm;
window.closeConfirmModal = closeConfirmModal;

function openAddTaskModal() { 
    // 1. ASIGNACIÓN DINÁMICA DE FECHA (Corregida para zona horaria local)
    const dateInput = document.getElementById('dateInput');
    if (window.currentState && window.currentState.view === 'today') {
        const today = new Date();
        dateInput.value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    } else if (window.currentState && window.currentState.view === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    } else {
        dateInput.value = ''; 
    }

    // ==========================================
    // LIMPIEZA ESTRICTA DE DATOS RESIDUALES
    // ==========================================
    document.getElementById('taskInput').value = ''; // Corrección vital: Vaciado del título
    document.getElementById('timeInput').value = ''; 
    document.getElementById('notesInput').value = ''; 
    document.getElementById('priorityInput').value = 'baja';
    document.getElementById('contextInput').value = ''; 
    
    // 2. ASIGNACIÓN DINÁMICA DE ÁREA (Unificada)
    const fallbackArea = customAreas.includes('Inbox') ? 'Inbox' : (customAreas[0] || '');
    document.getElementById('areaInput').value = (window.currentState && window.currentState.selectedArea) ? window.currentState.selectedArea : fallbackArea; 
    
    // 3. LIMPIEZA DE ADJUNTOS, JERARQUÍAS Y RECURRENCIAS
    currentAttachments = []; 
    renderAttachments('add'); 
    updateAddParentDropdown();
    const parentInput = document.getElementById('parentInput');
    if (parentInput) parentInput.value = 'root'; // Evita que una subtarea anterior deje su ID residual
    
    document.getElementById('addHasRecurrence').checked = false; 
    addSelectedDays = [1]; 
    toggleDay('add', 1); 
    toggleRecurrenceUI('add');
    
    // 4. APERTURA VISUAL
    document.getElementById('addTaskModal').classList.remove('hidden'); 
    
    // 5. RESETEO DE ESTADO CON EL DOM VISIBLE
    const reminderToggle = document.getElementById('reminderToggle');
    if (reminderToggle) {
        reminderToggle.checked = false;
    }

    setTimeout(() => document.getElementById('taskInput').focus(), 100); 
}

function closeAddTaskModal() { 
    document.getElementById('addTaskModal').classList.add('hidden'); 
    
    // Limpieza de seguridad post-cierre (previene fugas de estado si el renderizado falla)
    const reminderToggle = document.getElementById('reminderToggle');
    if (reminderToggle) {
        reminderToggle.checked = false;
    }
}

window.openEditModal = function(id) {
    console.log(">> Intentando abrir modal para ID:", id);
    
    editState = { id, parentId: getParentId(id) }; 
    let target = null;
    
    function traverse(nodes) {
        for(let n of nodes) {
            if(n.id === id) { target = n; return true; }
            if(n.subtasks && traverse(n.subtasks)) return true;
        }
    }
    traverse(tasks);

    if (!target) {
        console.error("!! Error: No se encontró la tarea con ID:", id);
        return;
    }

    // --- FUNCIÓN PROTECTORA ---
    // Esta función intenta poner el valor, pero si el input no existe, no explota
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
        } else {
            console.warn("!! Input no encontrado:", id);
        }
    };

    // --- ASIGNACIÓN SEGURA ---
    setVal('editNameInput', target.name || '');
    setVal('editStatusInput', target.status || 'pending');
    setVal('editAreaInput', target.area || 'Inbox');
    setVal('editContextInput', target.context || '');
    setVal('editPriorityInput', target.priority || 'baja');
    setVal('editDateInput', target.date || '');
    setVal('editTimeInput', target.time || '');
    setVal('editNotesInput', target.notes || '');
    setVal('editTagsInput', Array.isArray(target.tags) ? target.tags.join(', ') : '');
    
    // Checkbox de recordatorio
    const rem = document.getElementById('editReminderToggle');
    if (rem) rem.checked = target.reminder || false;

    // Actualización de dropdowns
    if (typeof refreshEditDropdowns === 'function') refreshEditDropdowns(id);
    
    // Adjuntos
    currentAttachments = target.attachments ? [...target.attachments] : [];
    if (typeof renderAttachments === 'function') renderAttachments('edit');
    
    // Recurrencia
    const recToggle = document.getElementById('editHasRecurrence');
    if (target.recurrenceRule) {
        if (recToggle) recToggle.checked = true;
        // (La lógica de recurrencia larga acá, asegurate que los IDs coincidan)
    } else {
        if (recToggle) recToggle.checked = false;
    }
    if (typeof toggleRecurrenceUI === 'function') toggleRecurrenceUI('edit');

    // --- APERTURA FINAL ---
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log(">> Modal abierto con éxito.");
    } else {
        console.error("!! ERROR CRÍTICO: No existe el elemento 'editModal' en el HTML.");
    }
};

function closeEditModal() { 
    document.getElementById('editModal').classList.add('hidden'); 
}

function openBulkMoveModal() { 
    if (selectedTaskIds.size === 0) return;
    populateSelect('bulkAreaInput', getAllAreasOrdered());
    const allContexts = [...new Set([...customContexts.map(c => c.name), ...getUniqueValues(tasks, 'context')])].filter(c => c && c.trim() !== '').sort();
    populateSelect('bulkContextInput', allContexts, "Mantener contexto actual", "");
    document.getElementById('bulkMoveModal').classList.remove('hidden'); 
}

function closeBulkMoveModal() { 
    document.getElementById('bulkMoveModal').classList.add('hidden'); 
}

function openPostponeModal(id, e) { if (e) e.stopPropagation(); postponeState = { id }; document.getElementById('postponeModal').classList.remove('hidden'); }
function closePostponeModal() { document.getElementById('postponeModal').classList.add('hidden'); }
function toggleSidebar(force) { const sidebar = document.getElementById('sidebar'); const overlay = document.getElementById('mobile-overlay'); const isOpen = !sidebar.classList.contains('-translate-x-full'); if (force === false || isOpen) { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); } else { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); } }

window.openAddTaskModal = openAddTaskModal;
window.closeAddTaskModal = closeAddTaskModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.openBulkMoveModal = openBulkMoveModal;
window.closeBulkMoveModal = closeBulkMoveModal;
window.openPostponeModal = openPostponeModal;
window.closePostponeModal = closePostponeModal;
window.toggleSidebar = toggleSidebar;

function updateDateDisplay() { document.getElementById('current-date-display').innerText = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function toggleConfigMenu() { const content = document.getElementById('configMenuContent'); const chevron = document.getElementById('configMenuChevron'); if (content.classList.contains('hidden')) { content.classList.remove('hidden'); chevron.classList.add('rotate-180'); } else { content.classList.add('hidden'); chevron.classList.remove('rotate-180'); } }
function getContextStyles(contextName) { const found = customContexts.find(c => c.name === contextName); const color = found ? found.color : 'gray'; return contextColorMap[color] || contextColorMap['gray']; }
function formatDateAR(dateStr, timeStr) { if (!dateStr) return ''; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; const formattedDate = `${parts[2]}/${parts[1]}`; return timeStr ? `${formattedDate}` : formattedDate; }
function formatDateLocal(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
}

function openSettingsModal() { document.getElementById('settingsDbUrlInput').value = dbUrl; document.getElementById('settingsApiKeyInput').value = customApiKey; document.getElementById('settingsModal').classList.remove('hidden'); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

// FUNCIONES DE INTERFAZ RECURRENCIA (MODALS)
function toggleRecurrenceUI(mode) {
    const checked = document.getElementById(`${mode}HasRecurrence`).checked;
    document.getElementById(`${mode}RecurrenceContainer`).classList.toggle('hidden', !checked);
    refreshRecurrenceUI(mode);
}
function toggleDay(mode, dayVal) {
    const arr = mode === 'add' ? addSelectedDays : editSelectedDays;
    if (arr.includes(dayVal)) { const idx = arr.indexOf(dayVal); arr.splice(idx, 1); } else { arr.push(dayVal); arr.sort((a, b) => a - b); }
    for (let i=0; i<7; i++) {
        const btn = document.getElementById(`${mode}-day-${i}`);
        if (arr.includes(i)) { btn.classList.add('bg-brand-500', 'text-navy-900', 'border-brand-500', 'scale-110'); btn.classList.remove('bg-navy-800'); }
        else { btn.classList.remove('bg-brand-500', 'text-navy-900', 'border-brand-500', 'scale-110'); btn.classList.add('bg-navy-800'); }
    }
    validateAndProjectRecurrence(mode);
}
function refreshRecurrenceUI(mode) {
    const freq = document.getElementById(`${mode}Frequency`).value;
    document.getElementById(`${mode}IntervalLabel`).innerText = freq === 'daily' ? 'días' : freq === 'weekly' ? 'semanas' : freq === 'monthly' ? 'meses' : freq === 'yearly' ? 'años' : freq === 'after_completion' ? 'días post-resolución' : 'meses';
    document.getElementById(`${mode}WeeklyBlock`).classList.toggle('hidden', freq !== 'weekly');
    document.getElementById(`${mode}MonthlyBlock`).classList.toggle('hidden', freq !== 'monthly');
    document.getElementById(`${mode}YearlyBlock`).classList.toggle('hidden', freq !== 'yearly');
    document.getElementById(`${mode}CustomBlock`).classList.toggle('hidden', freq !== 'custom');
    document.getElementById(`${mode}CompletionBaseBlock`).classList.toggle('hidden', freq === 'after_completion');
    if (freq === 'monthly') {
        const isFixed = document.querySelector(`input[name="${mode}MonthlyMode"]:checked`).value === 'fixed';
        document.getElementById(`${mode}MonthlyFixedBlock`).classList.toggle('hidden', !isFixed);
        document.getElementById(`${mode}MonthlyBusinessBlock`).classList.toggle('hidden', isFixed);
    }
    validateAndProjectRecurrence(mode);
}
function buildRuleFromUI(mode) {
    if (!document.getElementById(`${mode}HasRecurrence`).checked) return null;
    const freq = document.getElementById(`${mode}Frequency`).value;
    const interval = parseInt(document.getElementById(`${mode}Interval`).value) || 1;
    const baseOnComp = freq === 'after_completion' ? true : document.getElementById(`${mode}BaseOnCompletion`).checked;
    let rule = { frequency: freq, interval, baseOnCompletion: baseOnComp };
    if (freq === 'weekly') rule.daysOfWeek = mode === 'add' ? [...addSelectedDays] : [...editSelectedDays];
    else if (freq === 'monthly') {
        const isFixed = document.querySelector(`input[name="${mode}MonthlyMode"]:checked`).value === 'fixed';
        if (isFixed) rule.dayOfMonth = parseInt(document.getElementById(`${mode}DayOfMonth`).value) || 1;
        else rule.nthBusinessDay = parseInt(document.getElementById(`${mode}NthBusinessDay`).value) || 5;
    }
    else if (freq === 'yearly') { rule.dayOfMonth = parseInt(document.getElementById(`${mode}YearDay`).value) || 1; rule.monthOfYear = parseInt(document.getElementById(`${mode}YearMonth`).value) || 1; }
    else if (freq === 'custom') { rule.dayOfMonth = parseInt(document.getElementById(`${mode}CustomDay`).value) || 1; }
    return rule;
}
function validateAndProjectRecurrence(mode) {
    const rule = buildRuleFromUI(mode); const projEl = document.getElementById(`${mode}RecurrenceProjection`);
    if (!rule) { projEl.innerText = ''; return; }
    const tDate = document.getElementById(mode === 'add' ? 'dateInput' : 'editDateInput').value;
    if (!tDate) { projEl.innerText = 'Seleccioná una fecha base para simular.'; return; }
    if (rule.frequency === 'weekly' && (!rule.daysOfWeek || rule.daysOfWeek.length === 0)) { projEl.innerText = 'Seleccioná al menos un día.'; return; }
    try { const simTask = { date: tDate, startDate: tDate, recurrenceRule: rule }; const nextDate = calculateNextOccurrence(simTask); projEl.innerText = nextDate ? `Próxima ejecución: ${nextDate}` : 'Configuración inválida.'; } 
    catch (e) { projEl.innerText = 'Error algorítmico.'; }
}
// Exposición Global - Manipulación Visual Pura
window.updateDateDisplay = updateDateDisplay;
window.toggleConfigMenu = toggleConfigMenu;
window.getContextStyles = getContextStyles;
window.formatDateAR = formatDateAR;
window.formatDateLocal = formatDateLocal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

// Exposición Global - Ecosistema de Recurrencia
window.toggleRecurrenceUI = toggleRecurrenceUI;
window.toggleDay = toggleDay;
window.refreshRecurrenceUI = refreshRecurrenceUI;
window.buildRuleFromUI = buildRuleFromUI;
window.validateAndProjectRecurrence = validateAndProjectRecurrence;

function renderSidebarCounters(counts) {
    if (!counts) return;
    
    const updateBadge = (id, count) => {
        const btn = document.getElementById(id);
        if (!btn) return; 
        
        if (btn.classList.contains('justify-between')) {
            btn.classList.remove('justify-between');
        }

        let badge = btn.querySelector('.nav-badge-counter');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'nav-badge-counter text-[10px] font-bold text-navy-400 bg-navy-800 px-1.5 py-0.5 rounded-md ml-auto';
            btn.appendChild(badge);
        }
        badge.innerText = count;
    };

    updateBadge('nav-today', counts.today);
    updateBadge('nav-tomorrow', counts.tomorrow);
    updateBadge('nav-week', counts.week);
    updateBadge('nav-fortnight', counts.fortnight);
    updateBadge('nav-all', counts.all);
    updateBadge('nav-trash', counts.trash);
}
window.renderSidebarCounters = renderSidebarCounters;

// BUILD TASK ROWS
function buildTaskRows(nodes, path = []) {
    if (!nodes || nodes.length === 0) return '';
    const isTrash = currentState.view === 'trash';
    const indentMap = { 1: 'pl-3 md:pl-5', 2: 'pl-8 md:pl-10', 3: 'pl-12 md:pl-14', 4: 'pl-16 md:pl-18', 5: 'pl-20 md:pl-22' };
    const isFiltering = currentFilters.search !== '' || currentFilters.priority !== 'all' || currentFilters.context !== 'all' || currentFilters.status === 'in_progress' || currentFilters.status === 'completed';
    const todayStr = formatDateLocal(new Date());

    return nodes.map(task => {
        // ... (todo tu código inicial de lógica sigue igual) ...
        const visualSubCount = task._subCount !== undefined ? task._subCount : (task.subtasks ? task.subtasks.length : 0);
        const hasChildren = visualSubCount > 0;
        const isExpanded = isTrash || (currentState.view === 'focus' || isFiltering) ? true : (expandedStates[task.id] || false);
        const logicalDepth = path.length + 1;
        const indentClass = isTrash ? 'pl-3 md:pl-5' : (indentMap[logicalDepth] || 'pl-20 md:pl-22');
        const isCompleted = task.status === 'completed';
        const isOverdue = task.date && task.date < todayStr && !isCompleted;

        // --- CÁLCULO DE TAGS (Calculado fuera del template string para evitar errores) ---
        let tagsHtml = '';
        if (task.tags && Array.isArray(task.tags) && task.tags.length > 0) {
            tagsHtml = task.tags.map(tag => 
                `<span class="ml-1.5 bg-navy-700 text-brand-400 border border-brand-500/20 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">#${tag}</span>`
            ).join('');
        }
        // --------------------------------------------------------------------------------

        // ... (aquí mantén toda tu lógica original de dateDisplayHTML, recurrenceBadge, etc.) ...
        let dateDisplayHTML = `<span class="text-navy-400 text-[11px] font-semibold flex items-center gap-1.5 tracking-wide"><span class="w-2.5 h-[1.5px] bg-navy-400 inline-block"></span> Sin fecha</span>`;
        if (task.date) { 
            const dateColorClass = isOverdue ? 'text-danger-500 font-bold' : 'text-brand-500'; 
            let relativeDateLabel = formatDateAR(task.date, false);
            try {
                const [year, month, day] = task.date.split('-').map(Number);
                const taskD = new Date(year, month - 1, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffTime = taskD.getTime() - today.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 0) relativeDateLabel = 'hoy';
                else if (diffDays === 1) relativeDateLabel = 'mañana';
                else if (diffDays > 1 && diffDays <= 7) {
                    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                    relativeDateLabel = dayNames[taskD.getDay()];
                }
            } catch (e) { console.warn("Fallo en fecha relativa", e); }
            dateDisplayHTML = `<span class="${dateColorClass} text-[11px] font-semibold flex items-center gap-1.5 tracking-wide"><svg class="w-3.5 h-3.5 mb-[1px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>${relativeDateLabel} ${isOverdue ? '(Vencida)' : ''}</span>`; 
        }
        const recurrenceBadge = task.recurrenceRule ? `<span class="ml-2 flex items-center gap-1 text-brand-500 bg-brand-500/10 border border-brand-500/30 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide font-bold"><svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Repite</span>` : '';
        let subtasksHtml = (isExpanded && !isTrash) ? buildTaskRows(task.subtasks, [...path, {id: task.id, name: task.name}]) : '';
        const subtaskListHTML = isTrash ? '' : `<div class="subtasks-list" data-parent-id="${task.id}" style="${(hasChildren && !isExpanded) ? 'display: none;' : ''}">${subtasksHtml}</div>`;
        const bulkCheckboxHTML = (isBulkMode && !isTrash) ? `<div class="shrink-0 mr-2 flex items-center justify-center cursor-pointer py-1 pr-1" onclick="toggleBulkSelect(${task.id}, event)"><input type="checkbox" class="w-[18px] h-[18px] rounded-sm border border-navy-500 text-brand-500 bg-navy-800 focus:ring-0 cursor-pointer pointer-events-none transition-colors" ${selectedTaskIds.has(task.id) ? 'checked' : ''}></div>` : '';
        const isInProgress = task.status === 'in_progress'; const isMuted = !task._explicitMatch && isFiltering && !isTrash;
        let contextHtml = ''; if (task.context && task.context.trim() !== '') { const ctxStyles = getContextStyles(task.context); contextHtml = `<span class="mx-1 shrink-0 text-navy-600">&bull;</span><span class="truncate font-semibold tracking-wide ${ctxStyles.text} max-w-[80px] sm:max-w-[120px]">${task.context}</span>`; }
        let dependencyHtml = ''; if (task._parentPath && task._parentPath.length > 0) { const immediateParent = task._parentPath[task._parentPath.length - 1]; dependencyHtml = `<span class="mx-1 shrink-0 text-navy-600">&bull;</span><span class="text-navy-400 truncate max-w-[150px] sm:max-w-[250px]" title="Subtarea de: ${immediateParent.name}">Subtarea de: <span class="text-brand-400 font-semibold cursor-pointer hover:underline" onclick="event.stopPropagation(); focusTaskTree(${immediateParent.id})">${immediateParent.name}</span></span>`; }
        const nameStyle = isCompleted ? 'line-through text-navy-500' : (isOverdue ? 'text-danger-500 font-semibold' : (isInProgress ? 'text-info-500' : (isMuted ? 'text-navy-400 italic opacity-80' : 'text-navy-50')));
        
        // ... (tu lógica de actionButtonsHtml se mantiene igual) ...
        // Definimos los botones como un string limpio y simple, sin backticks complejos
let actionButtonsHtml = '';
        
        if (isTrash) {
            actionButtonsHtml = `
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onclick="event.stopPropagation(); restoreTaskNative(${task.id})" class="text-navy-400 hover:text-emerald-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Restaurar Tarea">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); hardDeleteTaskNative(${task.id})" class="text-navy-400 hover:text-danger-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Eliminar Definitivamente">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;
        } else {
            actionButtonsHtml = `
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onclick="window.toggleProgressSafe(${task.id}, event)" class="text-navy-400 hover:text-brand-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Pausar/Reanudar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </button>
                    <button onclick="window.prepareSubtaskSafe(${task.id}, event)" class="text-navy-400 hover:text-brand-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Agregar Subtarea">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    </button>
                    <button onclick="window.openPostponeModal(${task.id}, event)" class="text-navy-400 hover:text-brand-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Posponer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); window.openEditModal(${task.id})" class="text-navy-400 hover:text-brand-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Editar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); window.deleteTaskUniversal(${task.id})" class="text-navy-400 hover:text-danger-500 p-1.5 rounded hover:bg-navy-700 transition-colors focus:outline-none" title="Eliminar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;
        }
                                                
        return `
            <div class="task-item" data-id="${task.id}">
                <div class="group flex flex-col py-1.5 pr-4 border-b border-navy-700 hover:bg-navy-700/50 transition-colors ${indentClass}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3 flex-1 min-w-0">
                            ${bulkCheckboxHTML}
                            ${(hasChildren && !isTrash) ? `<button onclick="toggleExpand(${task.id}, event)" class="p-0.5 text-navy-400 hover:text-navy-50 transition-transform ${isExpanded ? 'rotate-90' : ''} focus:outline-none shrink-0"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></button>` : `<div class="w-4 shrink-0"></div>`}
                            <input type="checkbox" ${isCompleted ? 'checked' : ''} ${isTrash ? 'disabled' : `onchange="toggleTaskUniversal(${task.id})"`} class="task-cb shrink-0 ${(isBulkMode || isTrash) ? 'opacity-40 pointer-events-none' : ''} ${isInProgress ? 'is-in-progress' : ''}">
                            <div class="flex flex-col min-w-0 flex-1">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="text-[14px] font-medium task-name ${nameStyle} truncate ${isTrash ? 'pointer-events-none' : 'cursor-pointer'} select-none leading-none transition-colors" onclick="${isTrash ? '' : (isBulkMode ? `toggleBulkSelect(${task.id}, event)` : `openEditModal(${task.id})`)}">${task.name}</span>
                                    ${tagsHtml} ${(hasChildren && !isTrash) ? `<span class="bg-navy-700 text-navy-400 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 shadow-inner">+${visualSubCount} sub.</span>` : ''}
                                    ${recurrenceBadge}
                                    ${(task.attachments && task.attachments.length > 0) ? `<svg class="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>` : ''}
                                </div>
                                <div class="flex items-center text-[11px] mt-1 leading-none min-w-0 select-none">
                                    <div class="flex items-center text-navy-400 ${isTrash ? '' : 'cursor-pointer hover:text-navy-300'} transition-colors shrink-0 min-w-0">
                                        <span class="truncate">${task.area}</span>${contextHtml}${dependencyHtml}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 shrink-0 relative">
                            ${actionButtonsHtml}
                            <div class="w-28 flex flex-col items-start justify-center gap-1.5 shrink-0 pl-2">
                                <svg title="Prioridad: ${task.priority}" class="w-3.5 h-3.5 ${priorityColors[task.priority]}" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg>
                                ${dateDisplayHTML}
                            </div>
                        </div>
                    </div>
                </div>
                ${subtaskListHTML}
            </div>
        `;
    }).join('');
}

window.renderTasks = function() {
    if (typeof window.expandedStates === 'undefined') window.expandedStates = JSON.parse(localStorage.getItem('leo_expanded_states')) || {};
    const list = document.getElementById('taskList'); 
    const empty = document.getElementById('emptyState');
    
    // Sincronización estricta de estado global
    const state = window.currentState || { view: 'area', selectedArea: 'Inbox' };
    const filters = window.currentFilters || { search: '', status: 'pending', priority: 'all', context: 'all' };
    const sortState = window.currentSort || { by: 'date', order: 'asc' }; // Inyección de parámetros de orden

    let nodesToRender = [];
    
    if (state.view === 'trash') {
        function collectDeleted(nodes) { nodes.forEach(n => { if (n.isDeleted) nodesToRender.push(n); else if (n.subtasks) collectDeleted(n.subtasks); }); }
        if (typeof tasks !== 'undefined') collectDeleted(tasks); 
        nodesToRender.sort((a,b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    } else {
const pruned = (typeof window.pruneTree === 'function' && typeof tasks !== 'undefined') ? window.pruneTree(tasks, window.currentState, window.currentFilters) : (typeof pruneTree === 'function' ? pruneTree(tasks, window.currentState, window.currentFilters) : []);        
        
        const isTemporalView = ['today', 'tomorrow', 'week', 'fortnight'].includes(state.view);
        const hasActiveSearch = typeof filters.search === 'string' && filters.search.trim() !== '';
        const hasActivePriority = filters.priority && filters.priority !== 'all';
        const hasActiveContext = filters.context && filters.context !== 'all';
        const hasActiveStatus = filters.status && filters.status !== 'pending' && filters.status !== 'all';
        
        // El aplanamiento se activa obligatoriamente con cualquier filtro o en la vista global
        const isFlatView = isTemporalView || hasActiveSearch || hasActivePriority || hasActiveContext || hasActiveStatus;
        nodesToRender = isFlatView ? (typeof window.flattenMatches === 'function' ? window.flattenMatches(pruned) : (typeof flattenMatches === 'function' ? flattenMatches(pruned) : [])) : pruned;

        // MOTOR DE ORDENAMIENTO JERÁRQUICO
        nodesToRender.sort((a, b) => {
            // 1. Gravedad Estructural: Las tareas completadas se hunden, salvo si el usuario filtra explícitamente por ellas
            if (filters.status !== 'completed' && state.view === 'all') {
                const aComp = a.status === 'completed' ? 1 : 0;
                const bComp = b.status === 'completed' ? 1 : 0;
                if (aComp !== bComp) return aComp - bComp;
            }

            // 2. Ejecución Paramétrica: Evaluación sobre la variable seleccionada por el usuario
            let result = 0;
            if (sortState.by === 'date') {
                const getTs = (t) => {
                    if (filters.status === 'completed') {
                        return t.completedAt ? new Date(t.completedAt).getTime() : (t.date ? new Date(t.date).getTime() : (t.id || 0));
                    }
                    return t.date ? new Date(t.date).getTime() : 9999999999999;
                };
                result = getTs(a) - getTs(b);
            } else if (sortState.by === 'priority') {
                const pVal = { 'alta': 3, 'media': 2, 'baja': 1, 'none': 0 };
                const pA = pVal[a.priority] || 0;
                const pB = pVal[b.priority] || 0;
                result = pA - pB;
            } else if (sortState.by === 'context') {
                result = (a.context || '').localeCompare(b.context || '');
            } else {
                result = (a.name || '').localeCompare(b.name || '');
            }
            
            // Inversión matemática si el usuario solicitó orden descendente
            return sortState.order === 'desc' ? -result : result;
        });
    }
    
    if (nodesToRender.length === 0) { 
        if (list) list.innerHTML = ''; 
        if (empty) {
            empty.innerText = state.view === 'trash' ? "La papelera está vacía." : "No se encontraron tareas bajo los criterios actuales."; 
            empty.classList.remove('hidden'); 
        }
        return; 
    }
    
    if (empty) empty.classList.add('hidden');
    if (list) {
        const renderFn = typeof window.buildTaskRows === 'function' ? window.buildTaskRows : (typeof buildTaskRows === 'function' ? buildTaskRows : () => '');
        list.innerHTML = `<div id="taskList-root" class="flex flex-col min-h-[50px] pb-4">${renderFn(nodesToRender)}</div>`;
    }
};

window.buildTaskRows = buildTaskRows;
window.renderTasks = renderTasks;


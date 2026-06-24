// ==========================================
// CONTROL MÓVIL (V28 - SINTAXIS BLINDADA)
// ==========================================

window.initSpeechRecognition = function() {};
window.updateDateDisplay = function() {};
window.showSyncStatus = function(status) {};
window.showNotice = function(mensaje) {};
window.refreshAllDropdowns = function() {};
window.renderCalendar = function() {};

function obtenerTareasGlobales() {
    if (typeof tasks !== 'undefined') return tasks;
    if (typeof allTasks !== 'undefined') return allTasks;
    return [];
}

let ultimoLargoTareas = -1;

window.updateUI = function() {
    // 1. Consolidación de estado
    const state = window.currentState || { view: 'today' };

    // 2. Manejo del botón volver
    const btnBack = document.getElementById('btnBack'); 
    if (btnBack && typeof navHistory !== 'undefined' && navHistory.length > 0) btnBack.classList.remove('hidden'); 
    else if (btnBack) btnBack.classList.add('hidden');

    // 3. Sincronización del Título Principal
    const titles = { 'today':'Hoy y atrasadas', 'tomorrow':'Mañana', 'week':'Esta semana', 'fortnight':'Próximos 15 días', 'all':'Todas las tareas', 'calendar':'Calendario', 'focus':'Dependencia específica', 'trash':'Papelera' };
    const currentTitleText = state.view === 'area' ? `Área: ${state.selectedArea}` : titles[state.view];
    
    document.querySelectorAll('[id="view-title"], #viewTitle, .main-header h2').forEach(el => el.innerText = currentTitleText);

    const isTrash = state.view === 'trash';
    
    // 4. Resaltado Dinámico del Menú Lateral
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
    
    // 5. Ocultamiento de la matriz de filtrado en vistas incompatibles
    const toggleHidden = (id, cond) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.classList.toggle('hidden', cond));
    toggleHidden('view-list', state.view === 'calendar');
    toggleHidden('view-calendar', state.view !== 'calendar');
    toggleHidden('filters-container', state.view === 'calendar');
    
    // 6. Configuración estructural de la Papelera
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
    
    // 7. Sincronización complementaria (si existiese)
    if (typeof window.syncViewUI === 'function') window.syncViewUI();

    // 8. Delegación final al renderizador del DOM
    if (typeof window.renderTasks === 'function') window.renderTasks();
};

window.renderTasks = function() {
    const container = document.getElementById('mobileTaskList');
    const headerContainer = document.getElementById('mobile-header-dynamic');
    if (!container) return;

    // 1. Filtrado de Datos
    let todasLasTareas = obtenerTareasGlobales();
    let todasLasTareasActivas = todasLasTareas.filter(t => !t.isDeleted && !t.completed && t.status !== 'completed');
    let tareasAProcesar = todasLasTareasActivas;
    ultimoLargoTareas = todasLasTareasActivas.length;

    // Lógica de filtrado (Área vs Vista Temporal)
    if (window.currentState && window.currentState.area) {
        tareasAProcesar = todasLasTareasActivas.filter(t => t.area === window.currentState.area);
    } else {
        const vista = window.currentState?.view || 'today';
        if (vista !== 'all') {
            const hoy = new Date();
            hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
            const hoyStr = hoy.toISOString().split('T')[0];

            let manana = new Date(hoy);
            manana.setDate(manana.getDate() + 1);
            const mananaStr = manana.toISOString().split('T')[0];

            let semana = new Date(hoy);
            semana.setDate(semana.getDate() + 7);
            const semanaStr = semana.toISOString().split('T')[0];

            tareasAProcesar = todasLasTareasActivas.filter(t => {
                const fecha = t.date || t.dueDate || t.fecha || t.fechaVencimiento;
                if (!fecha || typeof fecha !== 'string' || fecha.trim() === '') return false;
                if (vista === 'today') return fecha <= hoyStr;
                if (vista === 'tomorrow') return fecha === mananaStr;
                if (vista === 'week') return fecha >= hoyStr && fecha <= semanaStr;
                return true;
            });
        }
    }

    // 2. Renderizado de Cabecera (Si existe el contenedor)
    if (headerContainer) {
        const titulosVistas = { 'today': 'Hoy y atrasadas', 'tomorrow': 'Mañana', 'week': 'Esta semana', 'all': 'Todas las tareas' };
        const vistaActual = window.currentState?.view || 'today';
        const tituloMostrado = titulosVistas[vistaActual] || vistaActual;
        const fechaTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
        
        headerContainer.innerHTML = `
            <div style="padding: 24px 16px 16px 16px; background: var(--bg-main);">
                <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 4px 0; color: var(--text-main);">${tituloMostrado}</h1>
                <p style="font-size: 10px; font-weight: 700; color: #4ade80; margin: 0; letter-spacing: 1px;">${fechaTexto}</p>
            </div>
        `;
    }

    // 3. Renderizado de la lista
    if (!tareasAProcesar || tareasAProcesar.length === 0) {
        container.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-sec);">No hay tareas para esta vista.</div>';
    } else {
        container.innerHTML = `<div class="mobile-task-list-container">` + tareasAProcesar.map(task => {
            const esCompletada = task.completed ? 'completed' : '';
            const titulo = task.name || task.text || 'Tarea sin título';
            const areaTexto = task.area ? task.area : 'Inbox';
            const subtext = `<span class="meta-area">${areaTexto}</span>`;
            const fechaVal = task.date || task.dueDate || task.fecha;
            const fechaHtml = fechaVal ? `<span class="meta-date">🗓 ${fechaVal}</span>` : '';
            const checked = task.completed ? '✓' : '';

            return `
            <div class="task-row ${esCompletada}">
                <button class="btn-check-square" onclick="window.toggleMobileTask('${task.id}')">
                    ${checked}
                </button>
                <div class="task-content">
<div class="task-title" onclick="try { tasks = obtenerTareasGlobales(); } catch(e) {} console.log('Ejecutando openEditModal para:', '${task.id}'); openEditModal('${task.id}');" style="cursor: pointer;">${titulo}</div>                                        <div class="task-subtext">${subtext}</div>
                </div>
                <div class="task-meta-right">
                    ${fechaHtml}
                </div>
            </div>
            `;
        }).join('') + `</div>`;
    }
};

window.addMobileTask = function() {
    const input = document.getElementById('mobileTaskInput');
    if (!input || !input.value.trim()) return;

    const hoyLocal = new Date();
    hoyLocal.setMinutes(hoyLocal.getMinutes() - hoyLocal.getTimezoneOffset());
    
    const newTask = {
        id: Date.now(),
        name: input.value.trim(),
        completed: false,
        date: hoyLocal.toISOString().split('T')[0],
        area: window.currentState?.area || 'Inbox'
    };

    const listaGlobal = obtenerTareasGlobales();
    if (listaGlobal && Array.isArray(listaGlobal)) {
        listaGlobal.unshift(newTask);
        input.value = '';
        if (window.saveTasks) window.saveTasks();
        window.renderTasks();
    }
};

window.toggleMobileTask = function(id) {
    const listaGlobal = obtenerTareasGlobales();
    if (listaGlobal && Array.isArray(listaGlobal)) {
        const task = listaGlobal.find(t => t.id.toString() === id.toString());
        if (task) {
            task.completed = !task.completed;
            if (window.saveTasks) window.saveTasks();
            window.renderTasks();
        }
    }
};

window.toggleViewMenu = function() {
    const modal = document.getElementById('viewMenuModal');
    if (!modal) {
        console.error("Diagnóstico: El contenedor 'viewMenuModal' no existe en el HTML.");
        return;
    }
    
    if (modal.classList.contains('hidden')) {
        window.buildViewMenu();
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
};

window.buildViewMenu = function() {
    const container = document.getElementById('modalDynamicContent');
    if (!container) {
        console.error("Diagnóstico: El contenedor 'modalDynamicContent' no existe en el HTML.");
        return;
    }

    let html = '<h3 class="menu-section-title">Tiempo</h3>';
    const timeViews = [
        { id: 'today', label: 'Hoy y atrasadas' },
        { id: 'tomorrow', label: 'Mañana' },
        { id: 'week', label: 'Esta semana' },
        { id: 'all', label: 'Todas las tareas' }
    ];
    
    timeViews.forEach(v => {
        html += `<button class="btn-menu-option" onclick="window.selectMobileView('${v.id}')">${v.label}</button>`;
    });

    const tareasParaEscanear = obtenerTareasGlobales();
    // Filtra áreas, evitando nulos y vacíos
    const areasUnicas = [...new Set(tareasParaEscanear.map(t => t.area).filter(a => a && a.trim() !== ''))];
    
    if (areasUnicas.length > 0) {
        html += '<h3 class="menu-section-title" style="margin-top:20px;">Áreas y Contextos</h3>';
        areasUnicas.forEach(area => {
            html += `<button class="btn-menu-option" onclick="window.filterByTaxonomy('area', '${area}')">${area}</button>`;
        });
    }
    
    container.innerHTML = html;
};

window.selectMobileView = function(viewType) {
    window.currentState = window.currentState || {};
    window.currentState.view = viewType;
    delete window.currentState.area;
    window.renderTasks();
    window.toggleViewMenu();
};

window.filterByTaxonomy = function(type, value) {
    window.currentState = window.currentState || {};
    window.currentState.view = 'all'; 
    window.currentState[type] = value; 
    window.renderTasks();
    window.toggleViewMenu();
};

window.toggleSettingsMenu = function() {
    window.toggleTheme();
};

window.toggleTheme = function() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('mobileTheme', isLight ? 'light' : 'dark');
    const metaTheme = document.getElementById('themeColorMeta');
    if (metaTheme) metaTheme.setAttribute('content', isLight ? '#f8fafc' : '#0f172a');
};

setInterval(() => {
    const tareasActuales = obtenerTareasGlobales();
    if (tareasActuales.length !== ultimoLargoTareas) {
        window.renderTasks();
    }
}, 1000);

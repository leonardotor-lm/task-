/ MÓDULO DE MOTOR (engine.js) */

// LÓGICA DE RECURRENCIA
function parseDateLocal(dateStr) { if (!dateStr) return new Date(); const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0); }
function formatDateLocal(dateObj) { const y = dateObj.getFullYear(); const m = String(dateObj.getMonth() + 1).padStart(2, '0'); const d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function isBusinessDay(date) { const day = date.getDay(); return day !== 0 && day !== 6; }
function calculateNthBusinessDay(year, month, n) { let count = 0; let date = new Date(year, month, 1, 0, 0, 0, 0); let lastBd = null; while (date.getMonth() === month) { if (isBusinessDay(date)) { count++; lastBd = new Date(date); if (count === n) return date; } date.setDate(date.getDate() + 1); } return lastBd; }
function addMonthsSafely(baseDate, monthsToAdd, targetDay) { const result = new Date(baseDate); const expectedMonth = (baseDate.getMonth() + monthsToAdd) % 12; const expectedYear = baseDate.getFullYear() + Math.floor((baseDate.getMonth() + monthsToAdd) / 12); result.setDate(1); result.setFullYear(expectedYear); result.setMonth(expectedMonth); const daysInTargetMonth = new Date(expectedYear, expectedMonth + 1, 0, 0, 0, 0, 0).getDate(); const dayToSet = targetDay !== undefined ? targetDay : baseDate.getDate(); result.setDate(Math.min(dayToSet, daysInTargetMonth)); return result; }
function getStartOfWeek(date) { const result = new Date(date); const day = result.getDay(); const diff = result.getDate() - day + (day === 0 ? -6 : 1); result.setDate(diff); return result; }
function getDaysDifference(d1, d2) { const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()); const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()); return Math.round((t2 - t1) / 86400000); }

function calculateNextOccurrence(task, completionDateStr = null) {
    const rule = task.recurrenceRule; if (!rule || rule.frequency === 'none') return '';
    const scheduledDate = parseDateLocal(task.date); const completionDate = completionDateStr ? parseDateLocal(completionDateStr) : new Date();
    const baseDate = rule.baseOnCompletion ? completionDate : scheduledDate; const interval = Math.max(1, rule.interval || 1);
    if (rule.frequency === 'after_completion') { const next = new Date(completionDate); next.setDate(next.getDate() + interval); return formatDateLocal(next); }
    switch (rule.frequency) {
        case 'daily': { const next = new Date(baseDate); next.setDate(next.getDate() + interval); return formatDateLocal(next); }
        case 'weekly': {
            const daysOfWeek = rule.daysOfWeek; if (!daysOfWeek || daysOfWeek.length === 0) { const next = new Date(baseDate); next.setDate(next.getDate() + (interval * 7)); return formatDateLocal(next); }
            const anchorDate = task.startDate ? parseDateLocal(task.startDate) : scheduledDate; const anchorWeekStart = getStartOfWeek(anchorDate);
            const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
            let candidate = new Date(baseDate); let found = false; let safetyCounter = 0;
            while (!found && safetyCounter < 1000) {
                safetyCounter++; candidate.setDate(candidate.getDate() + 1); const candidateDay = candidate.getDay();
                if (sortedDays.includes(candidateDay)) { const candidateWeekStart = getStartOfWeek(candidate); const weekDiff = Math.floor(getDaysDifference(anchorWeekStart, candidateWeekStart) / 7); if (weekDiff % interval === 0) found = true; }
            } return formatDateLocal(candidate);
        }
        case 'monthly': {
            if (rule.nthBusinessDay !== undefined) { const targetMonthDate = addMonthsSafely(baseDate, interval, 1); return formatDateLocal(calculateNthBusinessDay(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), rule.nthBusinessDay)); }
            const targetDay = rule.dayOfMonth !== undefined ? rule.dayOfMonth : baseDate.getDate(); return formatDateLocal(addMonthsSafely(baseDate, interval, targetDay));
        }
        case 'yearly': {
            const next = new Date(baseDate); const targetMonth = rule.monthOfYear !== undefined ? (rule.monthOfYear - 1) : baseDate.getMonth(); const targetDay = rule.dayOfMonth !== undefined ? rule.dayOfMonth : baseDate.getDate();
            next.setFullYear(next.getFullYear() + interval); next.setDate(1); next.setMonth(targetMonth); const maxDays = new Date(next.getFullYear(), targetMonth + 1, 0, 0, 0, 0, 0).getDate(); next.setDate(Math.min(targetDay, maxDays)); return formatDateLocal(next);
        }
        case 'custom': { const targetDay = rule.dayOfMonth !== undefined ? rule.dayOfMonth : baseDate.getDate(); return formatDateLocal(addMonthsSafely(baseDate, interval, targetDay)); }
        default: return '';
    }
}

// TREE AND LIST RENDER LOGIC
function containsFocusNode(node, targetId) { if (node.id === targetId) return true; if (!node.subtasks) return false; return node.subtasks.some(s => containsFocusNode(s, targetId)); }
window.pruneTree = function(nodeList, state, filters, inFocusedSubtree = false) {
if (!Array.isArray(nodeList)) return [];
      
    // Horizontes temporales
    const todayStr = typeof window.formatDateLocal === 'function' ? window.formatDateLocal(new Date()) : new Date().toISOString().split('T')[0];
    const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 1); 
    const tomorrowStr = typeof window.formatDateLocal === 'function' ? window.formatDateLocal(tomorrowObj) : tomorrowObj.toISOString().split('T')[0];
    const nextWeekObj = new Date(); nextWeekObj.setDate(nextWeekObj.getDate() + 7); 
    const nextWeekStr = typeof window.formatDateLocal === 'function' ? window.formatDateLocal(nextWeekObj) : nextWeekObj.toISOString().split('T')[0];
    const fortnightObj = new Date(); fortnightObj.setDate(fortnightObj.getDate() + 15); 
    const fortnightStr = typeof window.formatDateLocal === 'function' ? window.formatDateLocal(fortnightObj) : fortnightObj.toISOString().split('T')[0];
    
    let filtered = nodeList.map(node => {
        if (node.isDeleted) return null; 
        
        let matches = true;
        
        // Filtro de búsqueda
        if (filters.search !== '') { 
            const sTerm = filters.search.toLowerCase(); 
            // Extracción segura de los tags a una cadena de texto
const tagsText = Array.isArray(node.tags) ? node.tags.join(' ') : '';

// Evaluación integral de búsqueda
const textMatch = (node.name || '').toLowerCase().includes(sTerm) || 
                  (node.area || '').toLowerCase().includes(sTerm) || 
                  (node.context || '').toLowerCase().includes(sTerm) ||
                  tagsText.toLowerCase().includes(sTerm); 

if (!textMatch) matches = false;
        }
        
        // Filtros cruzados estandarizados
        if (filters.status === 'pending' && node.status === 'completed') matches = false; 
        if (filters.status === 'in_progress' && node.status !== 'in_progress') matches = false; 
        if (filters.status === 'completed' && node.status !== 'completed') matches = false; 
        if (filters.priority !== 'all' && node.priority !== filters.priority) matches = false; 
        if (filters.context !== 'all' && node.context !== filters.context) matches = false;
        
        // Excepción histórica: Bypass temporal y espacial para tareas completadas
        const isHistoricalCompleted = filters.status === 'completed';

        if (!isHistoricalCompleted) {
            if (state.view === 'today') { if (!node.date || node.date > todayStr) matches = false; }
            else if (state.view === 'tomorrow') { if (!node.date || node.date !== tomorrowStr) matches = false; }
            else if (state.view === 'week') { if (!node.date || node.date > nextWeekStr) matches = false; }
            else if (state.view === 'fortnight') { if (!node.date || node.date > fortnightStr) matches = false; }
            else if (state.view === 'area') { if (node.area !== state.selectedArea) matches = false; }
        }
        
        if (state.view === 'focus') { 
            if (!inFocusedSubtree && !(typeof containsFocusNode === 'function' && containsFocusNode(node, state.focusTargetId))) matches = false; 
        }
        
        const isNowFocused = inFocusedSubtree || (state.view === 'focus' && node.id === state.focusTargetId);
        
        // Invocación recursiva consolidada en el ámbito global
const prunedSubtasks = window.pruneTree(node.subtasks || [], state, filters, isNowFocused);
        
        if (matches || prunedSubtasks.length > 0) {
return { ...node, subtasks: prunedSubtasks, _explicitMatch: matches, _subCount: node.subtasks ? node.subtasks.length : 0 };
                    }
        return null;
    }).filter(Boolean);
    
    // Eliminada la llamada a sortTasks. El ordenamiento ahora es jurisdicción de ui.js
    return filtered;
};

// FLATTEN MATCHES UNIFICADO
window.flattenMatches = function(prunedNodes, path = []) {
    let flat = []; 
    if (!Array.isArray(prunedNodes)) return flat;
    prunedNodes.forEach(node => {
        const currentPath = [...path, { id: node.id, name: node.name }];
if (node._explicitMatch) flat.push({ ...node, _parentPath: path, subtasks: [] });
                if (node.subtasks && node.subtasks.length > 0) flat = flat.concat(window.flattenMatches(node.subtasks, currentPath));
    }); 
    return flat;
};
function getAreaTaskCount(areaName) {
    let count = 0;
    if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return count;
    
    function walk(nodes) {
        nodes.forEach(t => {
            if (!t.isDeleted && t.status !== 'completed' && t.area === areaName) {
                count++;
            }
            if (t.subtasks && Array.isArray(t.subtasks)) {
                walk(t.subtasks);
            }
        });
    }
    
    walk(tasks);
    return count;
}
window.getAreaTaskCount = getAreaTaskCount;

function calculateSidebarCounters(tasksArray) {
    if (!tasksArray || !Array.isArray(tasksArray)) return { today: 0, tomorrow: 0, week: 0, fortnight: 0, all: 0, trash: 0 };

    let counts = { today: 0, tomorrow: 0, week: 0, fortnight: 0, all: 0, trash: 0 };
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);

    function countNodes(nodes) {
        if (!nodes || !Array.isArray(nodes)) return;
        nodes.forEach(t => {
            if (t.isDeleted) {
                counts.trash++;
            } else if (t.status !== 'completed') {
                counts.all++;
                if (t.date) {
                    try {
                        const [year, month, day] = t.date.split('-').map(Number);
                        const tDate = new Date(year, month - 1, day);
                        const diffDays = Math.round((tDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                        if (diffDays <= 0) counts.today++; 
                        if (diffDays === 1) counts.tomorrow++;
                        if (diffDays <= 7) counts.week++;
                        if (diffDays <= 15) counts.fortnight++;
                    } catch (e) {
                        console.warn("Fallo de formato en fecha:", e);
                    }
                }
            }
            if (t.subtasks) countNodes(t.subtasks);
        });
    }
    
    countNodes(tasksArray);
    return counts;
}
window.calculateSidebarCounters = calculateSidebarCounters;

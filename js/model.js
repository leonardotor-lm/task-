// ESTADOS Y VARIABLES GLOBALES

function safeParse(key, fallback) {
    try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; } 
    catch (e) { return fallback; }
}

// Inicialización de la base local
let tasks = safeParse('leo_agenda_v11', []);
let calendarDate = new Date();
let customAreas = safeParse('leo_custom_areas', ["Inbox", "Trabajo", "Personal", "Estudios"]);
let customContexts = safeParse('leo_custom_contexts', [{ name: "@casa", color: "purple" }, { name: "@oficina", color: "blue" }, { name: "@online", color: "teal" }]);
let expandedStates = safeParse('leo_expanded_states', {});

let currentState = { view: 'today', selectedArea: null, focusTargetId: null };
let currentFilters = { search: '', status: 'pending', priority: 'all', context: 'all' };
let currentSort = { by: 'date', order: 'asc' }; // Orden predeterminado por fecha de vencimiento
let navHistory = [];

let isBulkMode = false;
let selectedTaskIds = new Set();
let currentAttachments = []; 
let manageSelectedColor = 'blue';

// RECURRENCIA - ESTADOS GLOBALES PARA MODALS
let addSelectedDays = [1];
let editSelectedDays = [1];
let editState = { id: null, parentId: 'root' }; let postponeState = { id: null };
let draggedAreaIndex = null;
let speechRecognition = null; let isListening = false;
let confirmCallback = null;



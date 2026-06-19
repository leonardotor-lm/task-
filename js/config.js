// /js/config.js

// CLAVES DE ALMACENAMIENTO Y TOKENS
const DB_URL_KEY = 'leo_agenda_db_url';
const API_KEY_STORAGE_KEY = 'leo_gemini_api_key';
const SECURITY_TOKEN = "e7b8c9d0-f1a2-4b3c-9d8e-7f6a5b4c3d2e";
const apiKey = ""; 

// VARIABLES DE CONFIGURACIÓN GLOBAL (Mutables por usuario)
let dbUrl = localStorage.getItem(DB_URL_KEY) || "";
let customApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";

// MAPEOS ESTÁTICOS DE INTERFAZ
const priorityColors = { 
    urgente: 'text-danger-500', 
    alta: 'text-brand-500', 
    media: 'text-yellow-500', 
    baja: 'text-navy-500' 
};

const contextColorMap = { 
    blue: { dot: 'bg-blue-500', text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }, 
    purple: { dot: 'bg-purple-500', text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' }, 
    green: { dot: 'bg-green-500', text: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' }, 
    red: { dot: 'bg-red-500', text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' }, 
    orange: { dot: 'bg-orange-500', text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }, 
    gray: { dot: 'bg-gray-500', text: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20' }, 
    pink: { dot: 'bg-pink-500', text: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' }, 
    teal: { dot: 'bg-teal-500', text: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    yellow: { dot: 'bg-yellow-500', text: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    cyan: { dot: 'bg-cyan-500', text: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    indigo: { dot: 'bg-indigo-500', text: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    rose: { dot: 'bg-rose-500', text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    fuchsia: { dot: 'bg-fuchsia-500', text: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' }
};

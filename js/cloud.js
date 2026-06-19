/**
 * MÓDULO DE RED Y PERSISTENCIA (cloud.js)
 * Dependencias implícitas globales: dbUrl, SECURITY_TOKEN, tasks, customAreas, customContexts
 * Responsabilidad: Gestión de peticiones HTTP hacia Google Apps Script y persistencia local (localStorage).
 */

function getSecureDbUrl() {
    if (!dbUrl) return "";
    
    const separator = dbUrl.includes('?') ? '&' : '?';
    
    return dbUrl + separator + 'token=' + SECURITY_TOKEN;
}

async function saveData() {
    localStorage.setItem('leo_agenda_v11', JSON.stringify(tasks));
    localStorage.setItem('leo_custom_areas', JSON.stringify(customAreas));
    localStorage.setItem('leo_custom_contexts', JSON.stringify(customContexts));
    
    if (!dbUrl) return;
    showSyncStatus('saving');
    try {
        const response = await fetch(getSecureDbUrl(), { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(tasks),
            redirect: 'follow'
        });
        if (!response.ok) throw new Error('Respuesta HTTP no exitosa: ' + response.status);
        const textData = await response.text();
        if (textData.trim().startsWith('<')) throw new Error('El servidor devolvió HTML (Posible error de permisos)');
        showSyncStatus('synced');
    } catch (e) { 
        console.error("Error al guardar:", e); 
        showSyncStatus('offline'); 
        showNotice("Fallo al guardar: " + e.message.substring(0, 40));
    }
}

async function loadDataFromCloud() {
    if (!dbUrl) return false;
    showSyncStatus('loading');
    try {
        const res = await fetch(getSecureDbUrl(), { method: 'GET', redirect: 'follow' });
        if (!res.ok) throw new Error("Fallo HTTP: " + res.status);
        const textData = await res.text();
        
        if (textData.trim().startsWith('<')) {
            throw new Error("La URL devolvió código HTML. Revisá los permisos de tu Apps Script.");
        }

        const data = JSON.parse(textData);
        if (Array.isArray(data)) { 
            tasks = data; 
            localStorage.setItem('leo_agenda_v11', JSON.stringify(tasks)); 
            showSyncStatus('synced'); 
            showNotice("Sincronizado");
            return true;
        }
        return false;
    } catch (e) { 
        console.error("Error al cargar:", e); 
        showSyncStatus('offline'); 
        showNotice("Modo Offline: " + e.message.substring(0, 50)); 
        return false;
    }
}

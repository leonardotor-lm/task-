function getSecureDbUrl() {
    // SSOT: Leemos siempre de window
    const currentUrl = window.dbUrl || "";
    if (!currentUrl) return "";
    
    const separator = currentUrl.includes('?') ? '&' : '?';
    // Se asume que SECURITY_TOKEN está declarado en otro lugar de cloud.js
    return currentUrl + separator + 'token=' + SECURITY_TOKEN;
}

async function saveData() {
    localStorage.setItem('leo_agenda_v11', JSON.stringify(window.tasks));
    localStorage.setItem('leo_custom_areas', JSON.stringify(customAreas));
    localStorage.setItem('leo_custom_contexts', JSON.stringify(customContexts));
    
    // SSOT: Verificamos la variable global
    if (!window.dbUrl) return; 
    
    showSyncStatus('saving');
    try {
        const response = await fetch(getSecureDbUrl(), { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(window.tasks),
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
    // SSOT: Acceso exclusivo al estado global
    const currentUrl = window.dbUrl || '';

    if (!currentUrl || currentUrl.trim() === "" || currentUrl.includes("nocache")) {
        console.error(">> ABORTADO: La URL en window.dbUrl está vacía o es inválida.");
        return false;
    }

    // RESTAURACIÓN DEL BLOQUE AMPUTADO
    try {
        const targetUrl = getSecureDbUrl() || currentUrl;
        const noCacheUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
        
        console.log(">> Interrogando al servidor...");
        const response = await fetch(noCacheUrl, { redirect: 'follow' });
        
        if (!response.ok) throw new Error('Status HTTP: ' + response.status);
        
        const textData = await response.text();
        if (textData.trim().startsWith('<')) throw new Error('El servidor devolvió HTML');

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

// =====================================================
// LISTA DE COMPRAS - FRONTEND
// =====================================================

let currentUser = null;
let currentToken = null;
let itemsCache = [];
let historialAcciones = []; // Para deshacer
let timeoutIds = {};

// =====================================================
// COMUNICACIÓN CON BACKEND
// =====================================================
let requestSeq = 0;
let requestChain = Promise.resolve();

function callGAS(accion, datos = {}) {
    const token = currentToken;
    if (!token && accion !== 'login') {
        return Promise.reject(new Error('No autenticado'));
    }

    const task = () => callGASOnce(accion, datos, token);
    const result = requestChain.then(task, task);
    requestChain = result.catch(() => {});
    return result;
}

/*function callGASOnce(accion, datos, token) {
    return new Promise((resolve, reject) => {
        const callbackName = 'cb_' + (++requestSeq) + '_' + Date.now();
        let settled = false;

        const origin = window.location.origin === 'null' ? '' : window.location.origin;
        const referer = window.location.href;

        const url = new URL(CONFIG.GAS_URL);
        url.searchParams.set('accion', accion);
        url.searchParams.set('token', token || '');
        url.searchParams.set('datos', JSON.stringify(datos));
        url.searchParams.set('callback', callbackName);
        url.searchParams.set('origin', origin);
        url.searchParams.set('referer', referer);
        url.searchParams.set('_nocache', Date.now());

        const script = document.createElement('script');

        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutIds[callbackName]);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            fn(value);
        };

        window[callbackName] = (resultado) => settle(resolve, resultado);

        timeoutIds[callbackName] = setTimeout(() => {
            settle(reject, new Error('Timeout: el backend no respondió'));
        }, 30000);

        script.onerror = () => settle(reject, new Error('Error de conexión'));
        script.src = url.toString();
        document.head.appendChild(script);
    });
}*/

function callGASOnce(accion, datos, token) {
    return new Promise((resolve, reject) => {
        const callbackName = 'cb_' + (++requestSeq) + '_' + Date.now();
        let settled = false;

        const origin = window.location.origin === 'null' ? '' : window.location.origin;
        const referer = window.location.href;

        const url = new URL(CONFIG.GAS_URL);
        url.searchParams.set('accion', accion);
        url.searchParams.set('token', token || '');
        url.searchParams.set('datos', JSON.stringify(datos));
        url.searchParams.set('callback', callbackName);
        url.searchParams.set('origin', origin);
        url.searchParams.set('referer', referer);
        url.searchParams.set('_nocache', Date.now());

        // 🔍 DEPURACIÓN VISUAL - Mostrar en pantalla
        const debugDiv = document.getElementById('login-debug') || (() => {
            const div = document.createElement('div');
            div.id = 'login-debug';
            div.style.cssText = 'position:fixed; bottom:0; left:0; right:0; background:#333; color:#0f0; font-size:10px; padding:5px; z-index:9999; word-break:break-all; max-height:150px; overflow:auto;';
            document.body.appendChild(div);
            return div;
        })();
        //debugDiv.innerHTML = `📡 Conectando a: ${url.toString()}<br>` + debugDiv.innerHTML;

        const script = document.createElement('script');

        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutIds[callbackName]);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            fn(value);
        };

        window[callbackName] = (resultado) => {
            // debugDiv.innerHTML = `✅ Respuesta recibida: ${JSON.stringify(resultado).substring(0, 200)}<br>` + debugDiv.innerHTML;
            settle(resolve, resultado);
        };

        timeoutIds[callbackName] = setTimeout(() => {
            //debugDiv.innerHTML = `❌ TIMEOUT - El backend no respondió en 30 segundos<br>` + debugDiv.innerHTML;
            settle(reject, new Error('Timeout: el backend no respondió'));
        }, 30000);

        script.onerror = () => {
            //debugDiv.innerHTML = `❌ ERROR DE CARGA - No se pudo cargar el script. URL: ${url.toString()}<br>` + debugDiv.innerHTML;
            settle(reject, new Error('Error de conexión'));
        };

        script.src = url.toString();
        document.head.appendChild(script);
    });
}

// =====================================================
// AUTENTICACIÓN
// =====================================================
async function login(email) {
    const debugDiv = document.getElementById('login-debug') || (() => {
        const div = document.createElement('div');
        div.id = 'login-debug';
        div.style.cssText = 'position:fixed; bottom:0; left:0; right:0; background:#333; color:#0f0; font-size:10px; padding:5px; z-index:9999; word-break:break-all; max-height:200px; overflow:auto;';
        document.body.appendChild(div);
        return div;
    })();
    
    //debugDiv.innerHTML = `🔐 Intentando login con: ${email}<br>` + debugDiv.innerHTML;
    
    try {
        const resultado = await callGAS('login', { email: email });
        //debugDiv.innerHTML = `📦 Respuesta login: ${JSON.stringify(resultado)}<br>` + debugDiv.innerHTML;
        
        if (resultado.success && resultado.data?.token) {
            currentToken = resultado.data.token;
            currentUser = email;
            localStorage.setItem('listToken', currentToken);
            localStorage.setItem('listUser', currentUser);
            //debugDiv.innerHTML = `✅ Login exitoso! Token guardado.<br>` + debugDiv.innerHTML;
            return true;
        } else {
            throw new Error(resultado.error || 'Email no autorizado');
        }
    } catch (error) {
        //debugDiv.innerHTML = `❌ Login falló: ${error.message}<br>` + debugDiv.innerHTML;
        throw error;
    }
}

async function checkAuth() {
    const token = localStorage.getItem('listToken');
    const user = localStorage.getItem('listUser');

    if (!token || !user) return false;

    try {
        const result = await callGAS('verificarSesion', {});
        if (result.success && result.data.email === user) {
            currentToken = token;
            currentUser = user;
            return true;
        }
    } catch (e) {
        console.error('Auth error:', e);
    }
    return false;
}

function logout() {
    localStorage.removeItem('listToken');
    localStorage.removeItem('listUser');
    currentToken = null;
    currentUser = null;
    showLoginScreen();
}

// =====================================================
// GESTIÓN DE ÍTEMS
// =====================================================
async function cargarItems() {
    try {
        const result = await callGAS('obtenerItems', {});
        if (result.success) {
            itemsCache = result.data;
            renderizarItems();
            return true;
        }
    } catch (error) {
        console.error('Error cargando items:', error);
        mostrarNotificacion('Error al cargar la lista', 'error');
    }
    return false;
}

function renderizarItems() {
    const lista = document.getElementById('lista-compras');
    if (!lista) return;

    if (itemsCache.length === 0) {
        lista.innerHTML = '<li class="text-muted" style="text-align:center; padding:2rem;">No hay ítems en la lista. ¡Agregá uno!</li>';
        actualizarStats();
        return;
    }

    lista.innerHTML = itemsCache.map(item => `
        <li class="${item.comprado ? 'comprado' : ''}" data-id="${item.id}">
            <div class="item-info">
                <span class="item-nombre">${escapeHtml(item.nombre)}</span>
                <span class="item-precio">$${Number(item.precio || 0).toFixed(2)}</span>
                <span class="item-usuario">👤 ${escapeHtml(item.agregadoPor || '?')}</span>
            </div>
            <div class="item-actions">
                <button class="btn-sm btn-comprar" onclick="toggleComprado('${item.id}')" ${item.comprado ? 'disabled' : ''}>
                    ${item.comprado ? '✓ Comprado' : '🛒 Marcar'}
                </button>
                <button class="btn-sm btn-precio" onclick="editarPrecio('${item.id}', ${item.precio || 0})">
                    💰 Precio
                </button>
                <button class="btn-sm btn-eliminar" onclick="eliminarItem('${item.id}')">
                    🗑️
                </button>
            </div>
        </li>
    `).join('');

    actualizarStats();
}

function actualizarStats() {
    const totalItems = itemsCache.length;
    const comprados = itemsCache.filter(i => i.comprado).length;
    const pendientes = totalItems - comprados;
    const totalPrecio = itemsCache.reduce((sum, i) => sum + (i.comprado ? (i.precio || 0) : 0), 0);

    const totalItemsEl = document.getElementById('totalItems');
    const pendientesEl = document.getElementById('pendientes');
    const compradosEl = document.getElementById('comprados');
    const totalPrecioEl = document.getElementById('totalPrecio');

    if (totalItemsEl) totalItemsEl.innerText = totalItems;
    if (pendientesEl) pendientesEl.innerText = pendientes;
    if (compradosEl) compradosEl.innerText = comprados;
    if (totalPrecioEl) totalPrecioEl.innerText = `$${totalPrecio.toFixed(2)}`;
}

async function agregarItem() {
    const nombreInput = document.getElementById('item-input');
    const precioInput = document.getElementById('price-input');
    const nombre = nombreInput.value.trim();
    const precio = parseFloat(precioInput.value) || 0;

    if (!nombre) {
        mostrarNotificacion('Ingrese un nombre para el ítem', 'error');
        nombreInput.focus();
        return;
    }

    if (precio < 0) {
        mostrarNotificacion('El precio no puede ser negativo', 'error');
        return;
    }

    // Guardar estado actual para deshacer
    guardarEnHistorial('agregar', null, { nombre, precio });

    const loadingNotif = mostrarNotificacion('Agregando...', 'info', true);

    try {
        const result = await callGAS('agregarItem', { nombre, precio });
        if (loadingNotif) loadingNotif.remove();

        if (result.success) {
            mostrarNotificacion(`"${nombre}" agregado correctamente`, 'success');
            nombreInput.value = '';
            precioInput.value = '';
            nombreInput.focus();
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error || 'No se pudo agregar'}`, 'error');
        }
    } catch (error) {
        if (loadingNotif) loadingNotif.remove();
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function toggleComprado(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;

    // Guardar estado actual para deshacer
    guardarEnHistorial('toggle', id, { comprado: item.comprado, precio: item.precio });

    try {
        const result = await callGAS('toggleComprado', { id });
        if (result.success) {
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function eliminarItem(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;

    if (!confirm(`¿Eliminar "${item.nombre}" permanentemente?`)) return;

    // Guardar para deshacer
    guardarEnHistorial('eliminar', id, item);

    const loadingNotif = mostrarNotificacion('Eliminando...', 'info', true);

    try {
        const result = await callGAS('eliminarItem', { id });
        if (loadingNotif) loadingNotif.remove();

        if (result.success && result.data) {
            mostrarNotificacion(`"${item.nombre}" eliminado`, 'success');
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error || 'No se pudo eliminar'}`, 'error');
        }
    } catch (error) {
        if (loadingNotif) loadingNotif.remove();
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function editarPrecio(id, precioActual) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (!modal || !modalTitle || !modalBody) return;

    const item = itemsCache.find(i => i.id === id);
    if (!item) return;

    modalTitle.innerText = `💰 Editar precio - ${item.nombre}`;
    modalBody.innerHTML = `
        <form id="formEditarPrecio" class="form-grid">
            <div class="form-group">
                <label>Precio ($)</label>
                <input type="number" id="editPrecio" value="${precioActual}" step="0.01" min="0" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn-success">💾 Guardar</button>
                <button type="button" class="btn-secondary modal-close-btn">Cancelar</button>
            </div>
        </form>
    `;

    modal.classList.add('active');

    const form = document.getElementById('formEditarPrecio');
    const closeBtn = modalBody.querySelector('.modal-close-btn');
    const modalClose = modal.querySelector('.modal-close');

    const cerrarModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.onclick = cerrarModal;
    if (modalClose) modalClose.onclick = cerrarModal;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const nuevoPrecio = parseFloat(document.getElementById('editPrecio').value) || 0;

        if (nuevoPrecio < 0) {
            mostrarNotificacion('El precio no puede ser negativo', 'error');
            return;
        }

        // Guardar para deshacer
        guardarEnHistorial('precio', id, { precio: item.precio });

        const loadingNotif = mostrarNotificacion('Actualizando precio...', 'info', true);

        try {
            const result = await callGAS('actualizarPrecio', { id, precio: nuevoPrecio });
            if (loadingNotif) loadingNotif.remove();

            if (result.success) {
                mostrarNotificacion(`Precio actualizado a $${nuevoPrecio.toFixed(2)}`, 'success');
                cerrarModal();
                await cargarItems();
            } else {
                mostrarNotificacion(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            if (loadingNotif) loadingNotif.remove();
            mostrarNotificacion(`Error: ${error.message}`, 'error');
        }
    };
}

// =====================================================
// DESHACER ACCIÓN
// =====================================================
function guardarEnHistorial(tipo, id, datos) {
    historialAcciones.push({ tipo, id, datos, timestamp: Date.now() });
    actualizarBotonDeshacer();
}

async function deshacer() {
    if (historialAcciones.length === 0) return;

    const ultima = historialAcciones.pop();
    actualizarBotonDeshacer();

    switch (ultima.tipo) {
        case 'agregar':
            // Buscar el item recién agregado por nombre y precio
            const itemAgregado = itemsCache.find(i => i.nombre === ultima.datos.nombre && i.precio === ultima.datos.precio);
            if (itemAgregado) {
                await callGAS('eliminarItem', { id: itemAgregado.id });
                await cargarItems();
                mostrarNotificacion('Se deshizo la adición', 'info');
            }
            break;
        case 'eliminar':
            // Reagregar el item eliminado
            await callGAS('agregarItem', { nombre: ultima.datos.nombre, precio: ultima.datos.precio });
            await cargarItems();
            mostrarNotificacion('Se deshizo la eliminación', 'info');
            break;
        case 'toggle':
            // Revertir el estado de comprado
            await callGAS('toggleComprado', { id: ultima.id });
            await cargarItems();
            mostrarNotificacion('Se deshizo el cambio de estado', 'info');
            break;
        case 'precio':
            // Restaurar precio anterior
            await callGAS('actualizarPrecio', { id: ultima.id, precio: ultima.datos.precio });
            await cargarItems();
            mostrarNotificacion('Se deshizo el cambio de precio', 'info');
            break;
    }
}

function actualizarBotonDeshacer() {
    const btn = document.getElementById('btnDeshacer');
    if (btn) btn.disabled = historialAcciones.length === 0;
}

// =====================================================
// UTILIDADES
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info', persistente = false) {
    const notif = document.createElement('div');
    const colores = { success: '#10b981', error: '#ef4444', info: '#4f46e5' };
    notif.className = `notification notification-${tipo}`;
    notif.innerText = mensaje;
    notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colores[tipo] || '#4f46e5'};
        color: white;
        border-radius: 8px;
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notif);
    if (!persistente) setTimeout(() => notif.remove(), 3000);
    return notif;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function limpiarComprados() {
    const comprados = itemsCache.filter(i => i.comprado);
    if (comprados.length === 0) {
        mostrarNotificacion('No hay ítems comprados para limpiar', 'info');
        return;
    }

    if (!confirm(`¿Eliminar los ${comprados.length} ítems marcados como comprados?`)) return;

    let eliminados = 0;
    for (const item of comprados) {
        await callGAS('eliminarItem', { id: item.id });
        eliminados++;
    }
    await cargarItems();
    mostrarNotificacion(`${eliminados} ítems comprados eliminados`, 'success');
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Configurar login
    const loginForm = document.getElementById('loginForm');
    const statusDiv = document.getElementById('login-status');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim().toLowerCase();

        if (!email) {
            statusDiv.innerHTML = '<div class="error">❌ Ingresá un email válido</div>';
            return;
        }

        statusDiv.innerHTML = '<div>⏳ Verificando acceso...</div>';

        try {
            const exito = await login(email);
            if (exito) {
                document.getElementById('userEmail').innerText = email;
                await cargarItems();
                showAppScreen();
                statusDiv.innerHTML = '';
                historialAcciones = [];
                actualizarBotonDeshacer();
            } else {
                statusDiv.innerHTML = '<div class="error">❌ Acceso denegado. Email no autorizado</div>';
            }
        } catch (error) {
            statusDiv.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    });

    // Verificar sesión guardada
    const autenticado = await checkAuth();
    if (autenticado) {
        document.getElementById('userEmail').innerText = currentUser;
        await cargarItems();
        showAppScreen();
    } else {
        showLoginScreen();
    }

    // Configurar botones
    document.getElementById('btnAgregar')?.addEventListener('click', agregarItem);
    document.getElementById('item-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') agregarItem();
    });
    document.getElementById('price-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') agregarItem();
    });
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        logout();
        showLoginScreen();
    });
    document.getElementById('btnDeshacer')?.addEventListener('click', deshacer);
    document.getElementById('btnLimpiarComprados')?.addEventListener('click', limpiarComprados);

    // Modal close
    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }
});

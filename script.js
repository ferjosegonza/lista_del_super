let currentUser = null;
let currentToken = null;
let itemsCache = [];
let historialAcciones = [];
let timeoutIds = {};
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
        timeoutIds[callbackName] = setTimeout(() => settle(reject, new Error('Timeout')), 30000);
        script.onerror = () => settle(reject, new Error('Error de conexión'));
        script.src = url.toString();
        document.head.appendChild(script);
    });
}

async function login(email) {
    try {
        const resultado = await callGAS('login', { email: email });
        if (resultado.success && resultado.data?.token) {
            currentToken = resultado.data.token;
            currentUser = email;
            localStorage.setItem('listToken', currentToken);
            localStorage.setItem('listUser', currentUser);
            return true;
        } else {
            throw new Error(resultado.error || 'Email no autorizado');
        }
    } catch (error) {
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
    } catch (e) {}
    return false;
}

function logout() {
    localStorage.removeItem('listToken');
    localStorage.removeItem('listUser');
    currentToken = null;
    currentUser = null;
    showLoginScreen();
}

async function cargarItems() {
    try {
        const result = await callGAS('obtenerItems', {});
        if (result.success) {
            itemsCache = result.data;
            renderizarListas();
            return true;
        }
    } catch (error) {
        mostrarNotificacion('Error al cargar la lista', 'error');
    }
    return false;
}

function getTotalConPrecio(item) {
    if (!item.precioUnitario || item.precioUnitario === 0) return 0;
    return (item.cantidad || 1) * item.precioUnitario;
}

function renderizarListas() {
    const sinPrecio = itemsCache.filter(i => !i.precioUnitario || i.precioUnitario === 0 || i.precioUnitario === "");
    const conPrecioFuera = itemsCache.filter(i => i.precioUnitario && i.precioUnitario > 0 && !i.enChango);
    const enChango = itemsCache.filter(i => i.enChango);

    sinPrecio.sort((a, b) => a.nombre.localeCompare(b.nombre));
    conPrecioFuera.sort((a, b) => a.nombre.localeCompare(b.nombre));
    enChango.sort((a, b) => a.nombre.localeCompare(b.nombre));

    renderizarLista('lista-sin-precio', sinPrecio, 'sinPrecio');
    renderizarLista('lista-con-precio', conPrecioFuera, 'conPrecio');
    renderizarLista('lista-en-chango', enChango, 'enChango');

    actualizarStats();
}

function renderizarLista(elementId, items, tipo) {
    const container = document.getElementById(elementId);
    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = '<li class="empty-message">— Vacío —</li>';
        return;
    }
    container.innerHTML = items.map(item => {
        const totalPrecio = getTotalConPrecio(item);
        return `
        <li data-id="${item.id}">
            <div class="item-info">
                <span class="item-nombre">${escapeHtml(item.nombre)}</span>
                ${item.cantidad > 1 ? `<span class="item-cantidad">${item.cantidad} x</span>` : ''}
                ${item.precioUnitario ? `<span class="item-precio">$${Number(item.precioUnitario).toFixed(2)}</span>` : '<span class="item-sin-precio">Sin precio</span>'}
                ${totalPrecio > 0 ? `<span class="item-total">= $${totalPrecio.toFixed(2)}</span>` : ''}
                <span class="item-usuario">👤 ${escapeHtml(item.agregadoPor || '?')}</span>
            </div>
            <div class="item-actions">
                ${tipo === 'sinPrecio' ? `
                    <button class="btn-sm btn-precio" onclick="editarItem('${item.id}')">💰 Editar</button>
                    <button class="btn-sm btn-eliminar" onclick="eliminarItem('${item.id}')">🗑️</button>
                ` : tipo === 'conPrecio' ? `
                    <button class="btn-sm btn-chango" onclick="toggleEnChango('${item.id}')">🛒 Al chango</button>
                    <button class="btn-sm btn-precio" onclick="editarItem('${item.id}')">✏️ Editar</button>
                    <button class="btn-sm btn-eliminar" onclick="eliminarItem('${item.id}')">🗑️</button>
                ` : `
                    <button class="btn-sm btn-chango-active" onclick="toggleEnChango('${item.id}')">✅ En chango</button>
                    <button class="btn-sm btn-precio" onclick="editarItem('${item.id}')">✏️ Editar</button>
                    <button class="btn-sm btn-eliminar" onclick="eliminarItem('${item.id}')">🗑️</button>
                `}
            </div>
        </li>`;
    }).join('');
}

function actualizarStats() {
    const totalItems = itemsCache.length;
    const enChango = itemsCache.filter(i => i.enChango).length;
    const totalPrecio = itemsCache.reduce((sum, i) => sum + (i.enChango ? getTotalConPrecio(i) : 0), 0);
    const sinPrecio = itemsCache.filter(i => !i.precioUnitario || i.precioUnitario === 0 || i.precioUnitario === "").length;
    const conPrecio = itemsCache.filter(i => i.precioUnitario && i.precioUnitario > 0 && !i.enChango).length;

    document.getElementById('totalItems') && (document.getElementById('totalItems').innerText = totalItems);
    document.getElementById('enChangoCount') && (document.getElementById('enChangoCount').innerText = enChango);
    document.getElementById('totalPrecio') && (document.getElementById('totalPrecio').innerText = `$${totalPrecio.toFixed(2)}`);
    document.getElementById('sinPrecioCount') && (document.getElementById('sinPrecioCount').innerText = sinPrecio);
    document.getElementById('conPrecioCount') && (document.getElementById('conPrecioCount').innerText = conPrecio);
    document.getElementById('enChangoItemsCount') && (document.getElementById('enChangoItemsCount').innerText = enChango);
}

async function agregarItem() {
    const nombre = document.getElementById('item-input').value.trim();
    const cantidad = parseInt(document.getElementById('cantidad-input').value) || 1;
    const precioUnitario = parseFloat(document.getElementById('price-input').value) || null;

    if (!nombre) {
        mostrarNotificacion('Ingrese un nombre para el ítem', 'error');
        return;
    }
    if (cantidad < 1) {
        mostrarNotificacion('La cantidad debe ser al menos 1', 'error');
        return;
    }
    if (precioUnitario !== null && precioUnitario < 0) {
        mostrarNotificacion('El precio no puede ser negativo', 'error');
        return;
    }

    guardarEnHistorial('agregar', null, { nombre, cantidad, precioUnitario });

    try {
        const result = await callGAS('agregarItem', { nombre, cantidad, precioUnitario });
        if (result.success) {
            mostrarNotificacion(`"${nombre}" agregado`, 'success');
            document.getElementById('item-input').value = '';
            document.getElementById('cantidad-input').value = '1';
            document.getElementById('price-input').value = '';
            document.getElementById('item-input').focus();
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function toggleEnChango(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;
    guardarEnHistorial('toggleEnChango', id, { enChango: item.enChango });
    try {
        const result = await callGAS('toggleEnChango', { id });
        if (result.success) await cargarItems();
        else mostrarNotificacion(`Error: ${result.error}`, 'error');
    } catch (error) {
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function eliminarItem(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`¿Eliminar "${item.nombre}" permanentemente?`)) return;
    guardarEnHistorial('eliminar', id, item);
    try {
        const result = await callGAS('eliminarItem', { id });
        if (result.success) {
            mostrarNotificacion(`"${item.nombre}" eliminado`, 'success');
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error || 'No se pudo eliminar'}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

async function editarItem(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.innerText = `✏️ Editar: ${item.nombre}`;
    modalBody.innerHTML = `
        <form id="formEditarItem">
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="editCantidad" value="${item.cantidad || 1}" min="1" step="1" required>
            </div>
            <div class="form-group">
                <label>Precio unitario ($)</label>
                <input type="number" id="editPrecio" value="${item.precioUnitario || ''}" step="0.01" min="0">
                <small>Dejar vacío o 0 para "sin precio"</small>
            </div>
            <div class="form-actions" style="margin-top:1rem;">
                <button type="submit" class="btn-success">💾 Guardar</button>
                <button type="button" class="btn-secondary modal-close-btn">Cancelar</button>
            </div>
        </form>
    `;

    modal.classList.add('active');

    const form = document.getElementById('formEditarItem');
    const closeBtn = modalBody.querySelector('.modal-close-btn');
    const modalClose = modal.querySelector('.modal-close');

    const cerrarModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.onclick = cerrarModal;
    if (modalClose) modalClose.onclick = cerrarModal;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const nuevaCantidad = parseInt(document.getElementById('editCantidad').value) || 1;
        const nuevoPrecio = parseFloat(document.getElementById('editPrecio').value) || null;

        if (nuevaCantidad < 1) {
            mostrarNotificacion('La cantidad debe ser al menos 1', 'error');
            return;
        }

        guardarEnHistorial('editar', id, { cantidad: item.cantidad, precioUnitario: item.precioUnitario });

        try {
            const result = await callGAS('actualizarPrecioYCantidad', { id, cantidad: nuevaCantidad, precioUnitario: nuevoPrecio });
            if (result.success) {
                mostrarNotificacion('Item actualizado', 'success');
                cerrarModal();
                await cargarItems();
            } else {
                mostrarNotificacion(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            mostrarNotificacion(`Error: ${error.message}`, 'error');
        }
    };
}

async function limpiarChango() {
    const enChango = itemsCache.filter(i => i.enChango);
    if (enChango.length === 0) {
        mostrarNotificacion('No hay ítems en el chango', 'info');
        return;
    }
    if (!confirm(`¿Eliminar los ${enChango.length} ítems del chango?`)) return;
    try {
        const result = await callGAS('limpiarChango', {});
        if (result.success) {
            mostrarNotificacion(`${result.data?.eliminados || enChango.length} ítems eliminados del chango`, 'success');
            await cargarItems();
        } else {
            mostrarNotificacion(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

function guardarEnHistorial(tipo, id, datos) {
    historialAcciones.push({ tipo, id, datos, timestamp: Date.now() });
    if (historialAcciones.length > 50) historialAcciones.shift();
    actualizarBotonDeshacer();
}

async function deshacer() {
    if (historialAcciones.length === 0) return;
    const ultima = historialAcciones.pop();
    actualizarBotonDeshacer();
    switch (ultima.tipo) {
        case 'agregar':
            const itemAgregado = itemsCache.find(i => i.nombre === ultima.datos.nombre);
            if (itemAgregado) {
                await callGAS('eliminarItem', { id: itemAgregado.id });
                await cargarItems();
                mostrarNotificacion('Se deshizo la adición', 'info');
            }
            break;
        case 'eliminar':
            await callGAS('agregarItem', { nombre: ultima.datos.nombre, cantidad: ultima.datos.cantidad, precioUnitario: ultima.datos.precioUnitario });
            await cargarItems();
            mostrarNotificacion('Se deshizo la eliminación', 'info');
            break;
        case 'toggleEnChango':
            await callGAS('toggleEnChango', { id: ultima.id });
            await cargarItems();
            mostrarNotificacion('Se deshizo el cambio', 'info');
            break;
        case 'editar':
            await callGAS('actualizarPrecioYCantidad', { id: ultima.id, cantidad: ultima.datos.cantidad, precioUnitario: ultima.datos.precioUnitario });
            await cargarItems();
            mostrarNotificacion('Se deshizo la edición', 'info');
            break;
    }
}

function actualizarBotonDeshacer() {
    const btn = document.getElementById('btnDeshacer');
    if (btn) btn.disabled = historialAcciones.length === 0;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notif = document.createElement('div');
    const colores = { success: '#10b981', error: '#ef4444', info: '#4f46e5' };
    notif.className = `notification notification-${tipo}`;
    notif.innerText = mensaje;
    notif.style.cssText = `position:fixed; bottom:20px; right:20px; padding:12px 20px; background:${colores[tipo] || '#4f46e5'}; color:white; border-radius:8px; z-index:2000; animation:slideIn 0.3s ease;`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
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

    const autenticado = await checkAuth();
    if (autenticado) {
        document.getElementById('userEmail').innerText = currentUser;
        await cargarItems();
        showAppScreen();
    } else {
        showLoginScreen();
    }

    document.getElementById('btnAgregar')?.addEventListener('click', agregarItem);
    document.getElementById('item-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') agregarItem(); });
    document.getElementById('btnLogout')?.addEventListener('click', () => { logout(); showLoginScreen(); });
    document.getElementById('btnDeshacer')?.addEventListener('click', deshacer);
    document.getElementById('btnLimpiarChango')?.addEventListener('click', limpiarChango);

    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }
});

// Estilos adicionales
const style = document.createElement('style');
style.textContent = `
    .input-container { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .input-container input { flex: 1; min-width: 80px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin: 1rem 0 0.5rem 0; padding-bottom: 0.25rem; border-bottom: 2px solid var(--light); }
    .section-header h3 { font-size: 1rem; font-weight: 600; color: var(--dark); margin: 0; }
    .badge { background: var(--gray); color: white; border-radius: 20px; padding: 0.125rem 0.5rem; font-size: 0.7rem; margin-left: 0.5rem; }
    .badge-warning { background: var(--warning); color: white; }
    .chango-header { border-bottom-color: var(--warning); }
    .chango-list li { background: #fff8e7; border-left: 3px solid var(--warning); }
    .item-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.375rem; }
    .item-cantidad { font-size: 0.8rem; color: var(--gray); }
    .item-total { font-size: 0.75rem; color: var(--success); font-weight: bold; }
    .item-sin-precio { font-size: 0.7rem; color: var(--gray); font-style: italic; }
    .empty-message { text-align: center; color: var(--gray); padding: 0.75rem !important; font-size: 0.8rem; }
    .btn-chango { background: var(--warning); color: white; }
    .btn-chango-active { background: var(--success); color: white; }
    .btn-chango-active:hover { background: #0e9f6e; }
    .btn-warning { background: var(--warning); color: white; }
    .btn-warning:hover { background: #e67e22; }
    .form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);
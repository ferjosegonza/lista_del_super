// =====================================================
// LISTA DE COMPRAS - VERSIÓN 100% FRONTEND
// SIN PERSISTENCIA - SOLO MEMORIA LOCAL
// =====================================================

let itemsCache = [];
let historialAcciones = [];
let nextId = 1;
let isWhatsAppVisible = false;

// =====================================================
// FUNCIONES PRINCIPALES DE LA LISTA
// =====================================================

function generarId() {
    return 'ITEM-' + (nextId++);
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
    const sinPrecio = itemsCache.filter(i => !i.precioUnitario || i.precioUnitario === 0 || i.precioUnitario === "");
    const conPrecioFuera = itemsCache.filter(i => i.precioUnitario && i.precioUnitario > 0 && !i.enChango);
    const enChango = itemsCache.filter(i => i.enChango);

    const totalSinPrecio = sinPrecio.length;
    const totalConPrecio = conPrecioFuera.length;
    const totalEnChango = enChango.length;

    const sumaConPrecio = conPrecioFuera.reduce((sum, i) => sum + getTotalConPrecio(i), 0);
    const sumaEnChango = enChango.reduce((sum, i) => sum + getTotalConPrecio(i), 0);

    document.getElementById('totalSinPrecio') && (document.getElementById('totalSinPrecio').innerText = totalSinPrecio);
    document.getElementById('totalConPrecio') && (document.getElementById('totalConPrecio').innerText = totalConPrecio);
    document.getElementById('totalEnChango') && (document.getElementById('totalEnChango').innerText = totalEnChango);
    document.getElementById('sumaConPrecio') && (document.getElementById('sumaConPrecio').innerHTML = `$${sumaConPrecio.toFixed(2)}`);
    document.getElementById('sumaEnChango') && (document.getElementById('sumaEnChango').innerHTML = `$${sumaEnChango.toFixed(2)}`);
    document.getElementById('sinPrecioCount') && (document.getElementById('sinPrecioCount').innerText = totalSinPrecio);
    document.getElementById('conPrecioCount') && (document.getElementById('conPrecioCount').innerText = totalConPrecio);
    document.getElementById('enChangoItemsCount') && (document.getElementById('enChangoItemsCount').innerText = totalEnChango);
}

// =====================================================
// PROCESAMIENTO DE WHATSAPP
// =====================================================

function procesarWhatsApp() {
    const textarea = document.getElementById('whatsappText');
    const texto = textarea.value;
    
    if (!texto || texto.trim() === '') {
        mostrarNotificacion('No hay texto para procesar', 'error');
        return;
    }

    // Dividir por líneas
    const lineas = texto.split('\n').filter(line => line.trim() !== '');
    
    // Extraer los mensajes de WhatsApp
    // Formato típico: "[fecha] Nombre: Mensaje"
    // O también puede ser solo el mensaje sin prefijo
    const itemsExtraidos = [];
    
    for (const linea of lineas) {
        let textoLimpio = linea.trim();
        
        // Intentar extraer el mensaje después del ":" si existe patrón de WhatsApp
        const patronWhatsApp = /^\[.*?\]\s*[^:]+:\s*(.+)$/;
        const match = patronWhatsApp.exec(textoLimpio);
        
        if (match) {
            // Es un mensaje de WhatsApp con el formato típico
            textoLimpio = match[1].trim();
        }
        // Si no coincide con el patrón, usar la línea completa
        
        // Limpiar espacios extra y caracteres no deseados
        textoLimpio = textoLimpio.replace(/\s+/g, ' ').trim();
        
        // Saltar líneas vacías después de la limpieza
        if (textoLimpio === '') continue;
        
        itemsExtraidos.push(textoLimpio);
    }
    
    if (itemsExtraidos.length === 0) {
        mostrarNotificacion('No se detectaron mensajes válidos', 'error');
        return;
    }
    
    // Mostrar conteo
    document.getElementById('whatsappCount').innerText = `${itemsExtraidos.length} items detectados`;
    
    // Preguntar si quiere agregar todos
    if (confirm(`Se detectaron ${itemsExtraidos.length} items. ¿Desea agregarlos todos a la lista?`)) {
        let agregados = 0;
        let duplicados = 0;
        
        for (const nombre of itemsExtraidos) {
            // Verificar si ya existe (case insensitive)
            const existe = itemsCache.some(item => 
                item.nombre.toLowerCase() === nombre.toLowerCase()
            );
            
            if (!existe) {
                const nuevoItem = {
                    id: generarId(),
                    nombre: nombre,
                    cantidad: 1,
                    precioUnitario: null,
                    enChango: false
                };
                itemsCache.push(nuevoItem);
                guardarEnHistorial('agregar', nuevoItem.id, { nombre: nombre, cantidad: 1, precioUnitario: null });
                agregados++;
            } else {
                duplicados++;
            }
        }
        
        if (agregados > 0) {
            mostrarNotificacion(`✅ ${agregados} items agregados${duplicados > 0 ? ` (${duplicados} duplicados ignorados)` : ''}`, 'success');
            renderizarListas();
            textarea.value = '';
            document.getElementById('whatsappCount').innerText = '0 items detectados';
            // Ocultar el área de WhatsApp después de procesar
            toggleWhatsAppArea(false);
        } else {
            mostrarNotificacion(`⚠️ No se agregaron items nuevos. ${duplicados} duplicados encontrados.`, 'warning');
        }
    }
}

function toggleWhatsAppArea(show) {
    const area = document.getElementById('whatsappArea');
    const btn = document.getElementById('btnToggleWhatsApp');
    if (show !== undefined) {
        isWhatsAppVisible = show;
    } else {
        isWhatsAppVisible = !isWhatsAppVisible;
    }
    area.style.display = isWhatsAppVisible ? 'block' : 'none';
    btn.innerHTML = isWhatsAppVisible ? '▲ Ocultar' : '▼ Mostrar';
}

// =====================================================
// ACCIONES DE ÍTEMS
// =====================================================

function agregarItem() {
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

    // Verificar duplicados
    const existe = itemsCache.some(item => 
        item.nombre.toLowerCase() === nombre.toLowerCase()
    );
    
    if (existe) {
        mostrarNotificacion(`"${nombre}" ya existe en la lista`, 'warning');
        return;
    }

    const nuevoItem = {
        id: generarId(),
        nombre: nombre,
        cantidad: cantidad,
        precioUnitario: precioUnitario,
        enChango: false
    };

    itemsCache.push(nuevoItem);
    guardarEnHistorial('agregar', nuevoItem.id, { nombre, cantidad, precioUnitario });

    mostrarNotificacion(`"${nombre}" agregado`, 'success');
    document.getElementById('item-input').value = '';
    document.getElementById('cantidad-input').value = '1';
    document.getElementById('price-input').value = '';
    document.getElementById('item-input').focus();
    renderizarListas();
}

function toggleEnChango(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;
    guardarEnHistorial('toggleEnChango', id, { enChango: item.enChango });
    item.enChango = !item.enChango;
    renderizarListas();
}

function eliminarItem(id) {
    const item = itemsCache.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`¿Eliminar "${item.nombre}" permanentemente?`)) return;
    guardarEnHistorial('eliminar', id, item);
    itemsCache = itemsCache.filter(i => i.id !== id);
    mostrarNotificacion(`"${item.nombre}" eliminado`, 'success');
    renderizarListas();
}

function editarItem(id) {
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

    form.onsubmit = (e) => {
        e.preventDefault();
        const nuevaCantidad = parseInt(document.getElementById('editCantidad').value) || 1;
        const nuevoPrecio = parseFloat(document.getElementById('editPrecio').value) || null;

        if (nuevaCantidad < 1) {
            mostrarNotificacion('La cantidad debe ser al menos 1', 'error');
            return;
        }

        guardarEnHistorial('editar', id, { cantidad: item.cantidad, precioUnitario: item.precioUnitario });
        
        item.cantidad = nuevaCantidad;
        item.precioUnitario = nuevoPrecio;
        
        mostrarNotificacion('Item actualizado', 'success');
        cerrarModal();
        renderizarListas();
    };
}

// =====================================================
// FUNCIONES DE LIMPIEZA
// =====================================================

function limpiarChango() {
    const enChango = itemsCache.filter(i => i.enChango);
    if (enChango.length === 0) {
        mostrarNotificacion('No hay ítems en el chango para limpiar', 'info');
        return;
    }
    if (!confirm(`¿Eliminar los ${enChango.length} ítems del chango permanentemente?`)) return;

    // Guardar en historial antes de eliminar
    for (const item of enChango) {
        guardarEnHistorial('eliminar', item.id, item);
    }
    
    itemsCache = itemsCache.filter(i => !i.enChango);
    mostrarNotificacion(`${enChango.length} ítems eliminados del chango`, 'success');
    renderizarListas();
}

function limpiarSinPrecio() {
    const sinPrecio = itemsCache.filter(i => !i.precioUnitario || i.precioUnitario === 0 || i.precioUnitario === "");
    if (sinPrecio.length === 0) {
        mostrarNotificacion('No hay ítems sin precio para limpiar', 'info');
        return;
    }
    if (!confirm(`¿Eliminar los ${sinPrecio.length} ítems sin precio permanentemente?`)) return;

    for (const item of sinPrecio) {
        guardarEnHistorial('eliminar', item.id, item);
    }
    
    itemsCache = itemsCache.filter(i => i.precioUnitario && i.precioUnitario > 0);
    mostrarNotificacion(`${sinPrecio.length} ítems sin precio eliminados`, 'success');
    renderizarListas();
}

function limpiarConPrecio() {
    const conPrecio = itemsCache.filter(i => i.precioUnitario && i.precioUnitario > 0 && !i.enChango);
    if (conPrecio.length === 0) {
        mostrarNotificacion('No hay ítems con precio fuera del chango para limpiar', 'info');
        return;
    }
    if (!confirm(`¿Eliminar los ${conPrecio.length} ítems con precio permanentemente?`)) return;

    for (const item of conPrecio) {
        guardarEnHistorial('eliminar', item.id, item);
    }
    
    itemsCache = itemsCache.filter(i => !i.precioUnitario || i.precioUnitario === 0 || i.enChango);
    mostrarNotificacion(`${conPrecio.length} ítems con precio eliminados`, 'success');
    renderizarListas();
}

function limpiarTodo() {
    if (itemsCache.length === 0) {
        mostrarNotificacion('La lista ya está vacía', 'info');
        return;
    }
    if (!confirm(`¿Eliminar TODOS los ${itemsCache.length} ítems permanentemente?`)) return;

    // Guardar todo en historial
    for (const item of itemsCache) {
        guardarEnHistorial('eliminar', item.id, item);
    }
    
    itemsCache = [];
    mostrarNotificacion('Lista completamente vaciada', 'success');
    renderizarListas();
}

// =====================================================
// HISTORIAL Y DESHACER
// =====================================================

function guardarEnHistorial(tipo, id, datos) {
    historialAcciones.push({ tipo, id, datos, timestamp: Date.now() });
    if (historialAcciones.length > 50) historialAcciones.shift();
    actualizarBotonDeshacer();
}

function deshacer() {
    if (historialAcciones.length === 0) return;
    const ultima = historialAcciones.pop();
    actualizarBotonDeshacer();
    
    switch (ultima.tipo) {
        case 'agregar':
            itemsCache = itemsCache.filter(i => i.id !== ultima.id);
            mostrarNotificacion('Se deshizo la adición', 'info');
            renderizarListas();
            break;
        case 'eliminar':
            // Recuperar el item eliminado
            const itemRecuperado = {
                id: ultima.id || generarId(),
                nombre: ultima.datos.nombre,
                cantidad: ultima.datos.cantidad || 1,
                precioUnitario: ultima.datos.precioUnitario || null,
                enChango: ultima.datos.enChango || false
            };
            itemsCache.push(itemRecuperado);
            mostrarNotificacion('Se deshizo la eliminación', 'info');
            renderizarListas();
            break;
        case 'toggleEnChango':
            const itemToggle = itemsCache.find(i => i.id === ultima.id);
            if (itemToggle) {
                itemToggle.enChango = ultima.datos.enChango;
                renderizarListas();
                mostrarNotificacion('Se deshizo el cambio', 'info');
            }
            break;
        case 'editar':
            const itemEdit = itemsCache.find(i => i.id === ultima.id);
            if (itemEdit) {
                itemEdit.cantidad = ultima.datos.cantidad;
                itemEdit.precioUnitario = ultima.datos.precioUnitario;
                renderizarListas();
                mostrarNotificacion('Se deshizo la edición', 'info');
            }
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

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notif = document.createElement('div');
    const colores = { success: '#10b981', error: '#ef4444', info: '#4f46e5', warning: '#f59e0b' };
    notif.className = `notification notification-${tipo}`;
    notif.innerText = mensaje;
    notif.style.cssText = `
        position:fixed; 
        bottom:20px; 
        right:20px; 
        padding:12px 20px; 
        background:${colores[tipo] || '#4f46e5'}; 
        color:white; 
        border-radius:8px; 
        z-index:2000; 
        animation:slideIn 0.3s ease; 
        max-width:90%;
        font-size:0.9rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar con algunos items de ejemplo
    itemsCache = [
        { id: generarId(), nombre: 'Leche', cantidad: 2, precioUnitario: null, enChango: false },
        { id: generarId(), nombre: 'Pan', cantidad: 1, precioUnitario: 1200, enChango: false },
        { id: generarId(), nombre: 'Huevos', cantidad: 12, precioUnitario: null, enChango: false }
    ];
    renderizarListas();

    // Event listeners
    document.getElementById('btnAgregar')?.addEventListener('click', agregarItem);
    document.getElementById('item-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') agregarItem(); });
    document.getElementById('btnDeshacer')?.addEventListener('click', deshacer);
    document.getElementById('btnLimpiarSinPrecio')?.addEventListener('click', limpiarSinPrecio);
    document.getElementById('btnLimpiarConPrecio')?.addEventListener('click', limpiarConPrecio);
    document.getElementById('btnLimpiarChango')?.addEventListener('click', limpiarChango);
    document.getElementById('btnLimpiarTodo')?.addEventListener('click', limpiarTodo);

    // WhatsApp import
    document.getElementById('btnToggleWhatsApp')?.addEventListener('click', () => toggleWhatsAppArea());
    document.getElementById('btnProcesarWhatsApp')?.addEventListener('click', procesarWhatsApp);
    document.getElementById('btnLimpiarWhatsApp')?.addEventListener('click', () => {
        document.getElementById('whatsappText').value = '';
        document.getElementById('whatsappCount').innerText = '0 items detectados';
        mostrarNotificacion('Área de WhatsApp limpiada', 'info');
    });

    // Detección automática de cambios en el textarea
    document.getElementById('whatsappText')?.addEventListener('input', function() {
        const lineas = this.value.split('\n').filter(line => line.trim() !== '');
        const itemsDetectados = lineas.length;
        document.getElementById('whatsappCount').innerText = `${itemsDetectados} items detectados`;
    });

    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }
});

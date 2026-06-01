// =====================================================
// LISTA DE COMPRAS - BACKEND (Google Apps Script)
// =====================================================
// CONFIGURACIÓN INICIAL:
// 1. Ve a https://script.google.com/create
// 2. Pega este código
// 3. Haz clic en "Desplegar" → "Nuevo despliegue"
// 4. Tipo: "Aplicación web"
// 5. Ejecutar como: "Yo" (tu cuenta)
// 6. Quién tiene acceso: "Cualquiera" (incluso anónimo)
// 7. Copia la URL que te da (ej: https://script.google.com/macros/s/.../exec)
// =====================================================

// Configuración de seguridad - SOLO PERMITIR ESTOS DOMINIOS
const DOMINIOS_PERMITIDOS = [
  "https://TU-USUARIO.github.io",
  "http://localhost:5500/",
  "http://localhost:80/",
  "http://localhost/",
  "http://127.0.0.1:5500/"
];

// ID del Google Sheet (CREA UNO NUEVO Y PON SU ID AQUÍ)
const SPREADSHEET_ID = "TU_SPREADSHEET_ID_AQUI";

// Nombres de las hojas
const HOJAS = {
  ITEMS: "Items",
  USUARIOS_PERMITIDOS: "UsuariosPermitidos",
  REGISTRO_SESIONES: "RegistroSesiones"
};

// =====================================================
// FUNCIÓN PRINCIPAL (JSONP para evitar CORS)
// =====================================================
function doGet(e) {
  return manejarPeticionJSONP(e);
}

function manejarPeticionJSONP(e) {
  const origen = e?.parameter?.origin || "";
  const referer = e?.parameter?.referer || "";
  const callback = e?.parameter?.callback || "callback";

  if (!esDominioPermitido(origen, referer)) {
    return jsonpResponse(callback, { success: false, error: "Dominio no autorizado" });
  }

  const accion = e?.parameter?.accion || "";
  const token = e?.parameter?.token || "";
  let datos = {};
  try {
    datos = e?.parameter?.datos ? JSON.parse(e.parameter.datos) : {};
  } catch (parseError) {
    return jsonpResponse(callback, { success: false, error: "Datos inválidos" });
  }

  const resultado = ejecutarAccion(accion, token, datos);
  return jsonpResponse(callback, resultado);
}

function jsonpResponse(callback, resultado) {
  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(resultado)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function esDominioPermitido(origen, referer) {
  const normalizar = (url) => (url || "").replace(/\/+$/, "");
  const o = normalizar(origen);
  const r = normalizar(referer);

  if (o.includes("localhost") || r.includes("localhost") ||
      o.includes("127.0.0.1") || r.includes("127.0.0.1")) {
    return true;
  }

  return DOMINIOS_PERMITIDOS.some(dominio =>
    o.startsWith(normalizar(dominio)) || r.startsWith(normalizar(dominio))
  );
}

// =====================================================
// AUTENTICACIÓN (LISTA BLANCA)
// =====================================================
function verificarLogin(email) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.USUARIOS_PERMITIDOS);

  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.USUARIOS_PERMITIDOS);
    hoja.appendRow(["Email", "Nombre", "Rol", "FechaAlta"]);
    hoja.appendRow(["TU_EMAIL_AQUI@gmail.com", "Administrador", "admin", new Date().toISOString()]);
  }

  const datos = hoja.getDataRange().getValues();
  let usuarioEncontrado = null;

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === email) {
      usuarioEncontrado = { email: datos[i][0], nombre: datos[i][1], rol: datos[i][2] };
      break;
    }
  }

  if (usuarioEncontrado) {
    const token = generarToken(email);
    registrarSesion(email, "login");
    return { success: true, data: { token: token, usuario: usuarioEncontrado } };
  }
  return { success: false, error: "Email no autorizado" };
}

function generarToken(email) {
  const payload = { email: email, expira: Date.now() + (24 * 60 * 60 * 1000) };
  return Utilities.base64Encode(JSON.stringify(payload));
}

function validarToken(token) {
  if (!token) return null;
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const datos = JSON.parse(decoded);
    if (datos.expira > Date.now()) return datos.email;
  } catch (e) {}
  return null;
}

function registrarSesion(email, accion) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.REGISTRO_SESIONES);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.REGISTRO_SESIONES);
    hoja.appendRow(["Fecha", "Email", "Acción"]);
  }
  hoja.appendRow([new Date().toISOString(), email, accion]);
}

// =====================================================
// CRUD DE ÍTEMS DE COMPRA
// =====================================================
function obtenerItems() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.ITEMS);
  if (!hoja) return [];

  const datos = hoja.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0]) {
      items.push({
        id: datos[i][0],
        nombre: datos[i][1],
        precio: datos[i][2],
        comprado: datos[i][3] === true,
        agregadoPor: datos[i][4],
        fecha: datos[i][5]
      });
    }
  }
  // Ordenar alfabéticamente por nombre
  items.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return items;
}

function agregarItem(item, emailUsuario) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.ITEMS);

  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.ITEMS);
    hoja.appendRow(["ID", "Nombre", "Precio", "Comprado", "AgregadoPor", "Fecha"]);
  }

  // Verificar si ya existe (case insensitive)
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][1] && datos[i][1].toLowerCase() === item.nombre.toLowerCase()) {
      return { success: false, error: `El item "${item.nombre}" ya existe en la lista` };
    }
  }

  const id = "ITEM-" + Date.now();
  hoja.appendRow([
    id,
    item.nombre,
    item.precio || 0,
    false,
    emailUsuario,
    new Date().toISOString()
  ]);

  registrarSesion(emailUsuario, `agregar_item_${item.nombre}`);
  return { success: true, id: id };
}

function toggleComprado(id, emailUsuario) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.ITEMS);
  if (!hoja) return { success: false, error: "Hoja no encontrada" };

  const datos = hoja.getDataRange().getValues();
  let fila = -1;
  let estadoActual = false;
  let nombreItem = "";

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      fila = i + 1;
      estadoActual = datos[i][3] === true;
      nombreItem = datos[i][1];
      break;
    }
  }

  if (fila === -1) return { success: false, error: "Item no encontrado" };

  hoja.getRange(fila, 4).setValue(!estadoActual);
  registrarSesion(emailUsuario, `${!estadoActual ? "comprar" : "desmarcar"}_${nombreItem}`);
  return { success: true, nuevoEstado: !estadoActual };
}

function eliminarItem(id, emailUsuario) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.ITEMS);
  if (!hoja) return false;

  const datos = hoja.getDataRange().getValues();
  let nombreItem = "";
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      nombreItem = datos[i][1];
      hoja.deleteRow(i + 1);
      registrarSesion(emailUsuario, `eliminar_item_${nombreItem}`);
      return true;
    }
  }
  return false;
}

function actualizarPrecio(id, nuevoPrecio, emailUsuario) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName(HOJAS.ITEMS);
  if (!hoja) return { success: false, error: "Hoja no encontrada" };

  const datos = hoja.getDataRange().getValues();
  let fila = -1;
  let nombreItem = "";

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      fila = i + 1;
      nombreItem = datos[i][1];
      break;
    }
  }

  if (fila === -1) return { success: false, error: "Item no encontrado" };

  hoja.getRange(fila, 3).setValue(nuevoPrecio);
  registrarSesion(emailUsuario, `actualizar_precio_${nombreItem}_a_${nuevoPrecio}`);
  return { success: true };
}

// =====================================================
// INICIALIZACIÓN DE HOJAS
// =====================================================
function inicializarTodasLasHojas() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojas = {
    Items: ["ID", "Nombre", "Precio", "Comprado", "AgregadoPor", "Fecha"],
    UsuariosPermitidos: ["Email", "Nombre", "Rol", "FechaAlta"],
    RegistroSesiones: ["Fecha", "Email", "Acción"]
  };

  for (const [nombreHoja, cabeceras] of Object.entries(hojas)) {
    let hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) {
      hoja = ss.insertSheet(nombreHoja);
      hoja.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    } else if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    }
  }
  Logger.log("Todas las hojas inicializadas");
}

// =====================================================
// ROUTER
// =====================================================
function ejecutarAccion(accion, token, datos) {
  if (accion === "login") {
    return verificarLogin(datos.email);
  }

  const emailUsuario = validarToken(token);
  if (!emailUsuario) {
    return { success: false, error: "No autenticado" };
  }

  switch (accion) {
    case "verificarSesion":
      return { success: true, data: { email: emailUsuario } };
    case "obtenerItems":
      return { success: true, data: obtenerItems() };
    case "agregarItem":
      return agregarItem(datos, emailUsuario);
    case "toggleComprado":
      return toggleComprado(datos.id, emailUsuario);
    case "eliminarItem":
      return { success: true, data: eliminarItem(datos.id, emailUsuario) };
    case "actualizarPrecio":
      return actualizarPrecio(datos.id, datos.precio, emailUsuario);
    default:
      return { success: false, error: "Acción no válida" };
  }
}
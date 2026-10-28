/* ============================================================
   Control de Asistencia — JavaScript puro (sin librerías)
   Datos: localStorage · Sesión por rol · Informes por fecha
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Utilidades ---------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const fechaISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaHM = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const horaHMS = (d = new Date()) => `${horaHM(d)}:${pad(d.getSeconds())}`;

  const aMin = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const deMin = (min) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  };

  const fechaLarga = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    const s = d.toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const fechaCorta = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const sumarDias = (fecha, dias) => {
    const d = new Date(fecha + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return fechaISO(d);
  };

  /* ---------------- Almacenamiento ---------------- */
  const PREFIJO = 'asistencia_';
  const LS = {
    get(clave, porDefecto) {
      try {
        const raw = localStorage.getItem(PREFIJO + clave);
        return raw === null ? porDefecto : JSON.parse(raw);
      } catch (e) {
        return porDefecto;
      }
    },
    set(clave, valor) {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    },
    del(clave) {
      localStorage.removeItem(PREFIJO + clave);
    },
  };

  const ESTADOS = [
    { id: 'puntual', nombre: 'Puntual', tono: 'ok' },
    { id: 'tarde', nombre: 'Tarde', tono: 'warn' },
    { id: 'ausente', nombre: 'Ausente', tono: 'peligro' },
    { id: 'permiso', nombre: 'Permiso', tono: 'info' },
    { id: 'vacaciones', nombre: 'Vacaciones', tono: 'neutro' },
  ];
  const ESTADO_NOMBRE = ESTADOS.reduce((acc, e) => { acc[e.id] = e.nombre; return acc; }, {});

  const ROLES = ['cajero', 'asistente', 'gerente'];

  const VISTAS = [
    { id: 'panel', nombre: 'Panel', roles: ROLES },
    { id: 'marcaje', nombre: 'Marcaje', roles: ROLES },
    { id: 'empleados', nombre: 'Empleados', roles: ['asistente', 'gerente'] },
    { id: 'reportes', nombre: 'Informes', roles: ['asistente', 'gerente'] },
    { id: 'config', nombre: 'Configuración', roles: ['gerente'] },
  ];

  /* ---------------- Estado ---------------- */
  let db = { empleados: [], usuarios: [], marcajes: [], config: null, sesion: null };
  let vistaActual = 'panel';
  let ultimoReporte = { regs: [], desde: '', hasta: '' };
  let modalResolve = null;
  let temporizadorInactividad = null;

  /* ---------------- Datos demo ---------------- */
  function prng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function demoInicial() {
    const empleados = [
      { id: 'e1', nombre: 'Ana Torres', cargo: 'Cajera', area: 'Caja', entrada: '08:00', salida: '16:00', activo: true, foto: '' },
      { id: 'e2', nombre: 'Luis Ramírez', cargo: 'Asistente administrativo', area: 'Administración', entrada: '08:00', salida: '16:00', activo: true, foto: '' },
      { id: 'e3', nombre: 'Marta Gómez', cargo: 'Gerente general', area: 'Gerencia', entrada: '08:30', salida: '17:00', activo: true, foto: '' },
      { id: 'e4', nombre: 'Carlos Ruiz', cargo: 'Cajero', area: 'Caja', entrada: '14:00', salida: '22:00', activo: true, foto: '' },
      { id: 'e5', nombre: 'Sofía Díaz', cargo: 'Asistente de RRHH', area: 'Administración', entrada: '09:00', salida: '17:00', activo: true, foto: '' },
      { id: 'e6', nombre: 'Pedro Salas', cargo: 'Contador', area: 'Finanzas', entrada: '08:00', salida: '16:00', activo: true, foto: '' },
      { id: 'e7', nombre: 'Elena Vidal', cargo: 'Cajera', area: 'Caja', entrada: '07:00', salida: '15:00', activo: true, foto: '' },
      { id: 'e8', nombre: 'Jorge Medina', cargo: 'Supervisor', area: 'Operaciones', entrada: '08:00', salida: '16:00', activo: true, foto: '' },
    ];

    const usuarios = [
      { id: 'u1', usuario: 'gerente', clave: '1234', rol: 'gerente', empleadoId: 'e3' },
      { id: 'u2', usuario: 'asistente', clave: '1234', rol: 'asistente', empleadoId: 'e5' },
      { id: 'u3', usuario: 'cajero', clave: '1234', rol: 'cajero', empleadoId: 'e1' },
    ];

    const config = {
      empresa: 'Comercial Andina S.A.',
      tolerancia: 10,
      descanso: 60,
      logo: 'assets/img/logo.svg',
      fondo: 'assets/img/fondo.svg',
    };

    const random = prng(20261028);
    const marcajes = [];
    let id = 1;
    const hoy = new Date();

    for (let atras = 20; atras >= 0; atras--) {
      const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
      if (dia.getDay() === 0) continue; // domingo libre

      empleados.forEach((emp, indice) => {
        if (atras === 0 && indice >= 5) return; // hoy quedan pendientes

        const r = random();
        let estado = 'puntual';
        if (r > 0.955) estado = 'ausente';
        else if (r > 0.92) estado = 'vacaciones';
        else if (r > 0.885) estado = 'permiso';
        else if (r > 0.76) estado = 'tarde';

        let entrada = '';
        let salida = '';
        let tardanza = 0;

        if (estado === 'puntual' || estado === 'tarde') {
          const base = aMin(emp.entrada);
          const variacion = estado === 'puntual'
            ? Math.floor(random() * 9)
            : 12 + Math.floor(random() * 30);
          entrada = deMin(base + variacion);
          salida = deMin(aMin(emp.salida) + Math.floor(random() * 16) - 3);
          tardanza = Math.max(0, variacion - config.tolerancia);
        }

        marcajes.push({
          id: 'm' + id,
          empleadoId: emp.id,
          fecha: fechaISO(dia),
          entrada,
          salida,
          estado,
          tardanza,
          nota: estado === 'tarde' && random() > 0.6 ? 'Tráfico en la ruta' : '',
          actualizado: fechaISO(dia) + 'T' + (entrada || '08:00') + ':00',
        });
        id++;
      });
    }

    return { empleados, usuarios, marcajes, config };
  }

  function sembrarDemo() {
    const datos = demoInicial();
    db.empleados = datos.empleados;
    db.usuarios = datos.usuarios;
    db.marcajes = datos.marcajes;
    db.config = datos.config;
    guardarTodo();
  }

  function cargarTodo() {
    const empleados = LS.get('empleados', null);
    if (!Array.isArray(empleados)) {
      sembrarDemo();
    } else {
      db.empleados = empleados;
      db.usuarios = LS.get('usuarios', []);
      db.marcajes = LS.get('marcajes', []);
      db.config = LS.get('config', null) || demoInicial().config;
    }
    db.sesion = LS.get('sesion', null);
  }

  function guardarTodo() {
    try {
      LS.set('empleados', db.empleados);
      LS.set('usuarios', db.usuarios);
      LS.set('marcajes', db.marcajes);
      LS.set('config', db.config);
      return true;
    } catch (e) {
      console.error(e);
      toast('No hay espacio en el navegador. Prueba con imágenes más pequeñas.', 'error');
      return false;
    }
  }

  /* ---------------- Consultas ---------------- */
  const getEmpleado = (id) => db.empleados.find((e) => e.id === id) || null;
  const getRegistro = (empleadoId, fecha) =>
    db.marcajes.find((m) => m.empleadoId === empleadoId && m.fecha === fecha) || null;

  function usuarioActual() {
    if (!db.sesion) return null;
    if (db.sesion.expira && db.sesion.expira < Date.now()) return null;
    return db.usuarios.find((u) => u.id === db.sesion.usuarioId) || null;
  }
  function miEmpleado() {
    const u = usuarioActual();
    return u ? getEmpleado(u.empleadoId) : null;
  }

  function tardanzaDe(emp, entrada) {
    const a = aMin(entrada);
    const esperada = aMin(emp.entrada);
    if (a == null || esperada == null) return 0;
    return Math.max(0, a - esperada - (Number(db.config.tolerancia) || 0));
  }

  function horasDe(reg) {
    if (!reg || !reg.entrada || !reg.salida) return 0;
    let minutos = aMin(reg.salida) - aMin(reg.entrada);
    if (minutos < 0) minutos += 1440; // turno nocturno
    const descanso = Number(db.config.descanso) || 0;
    if (minutos > descanso) minutos -= descanso;
    return minutos / 60;
  }

  const formatoHoras = (h) => (h > 0 ? h.toFixed(2).replace('.', ',') + ' h' : '—');

  function iniciales(nombre) {
    return String(nombre || '?')
      .trim().split(/\s+/).slice(0, 2)
      .map((p) => p.charAt(0)).join('').toUpperCase();
  }
  function colorDe(texto) {
    let hash = 0;
    for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) % 360;
    return `hsl(${hash} 52% 42%)`;
  }

  function avatarHTML(emp, extra) {
    const clase = 'avatar' + (extra ? ' ' + extra : '');
    if (emp && emp.foto) {
      return `<span class="${clase}"><img src="${emp.foto}" alt="Foto de ${esc(emp.nombre)}"></span>`;
    }
    return `<span class="${clase}" style="background:${colorDe((emp && emp.nombre) || '?')}">${esc(iniciales(emp && emp.nombre))}</span>`;
  }

  function miniAvatarHTML(emp) {
    if (emp && emp.foto) {
      return `<span class="mini-avatar"><img src="${emp.foto}" alt=""></span>`;
    }
    return `<span class="mini-avatar" style="background:${colorDe((emp && emp.nombre) || '?')}">${esc(iniciales(emp && emp.nombre))}</span>`;
  }

  /* ---------------- Tema y configuración visual ---------------- */
  function aplicarTema(tema) {
    const t = tema === 'oscuro' ? 'oscuro' : 'claro';
    document.documentElement.dataset.tema = t;
    LS.set('tema', t);
    const boton = $('#btn-tema');
    if (boton) boton.textContent = t === 'oscuro' ? '☀' : '◐';
  }
  function alternarTema() {
    aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro');
    if (vistaActual === 'reportes' && !$('#vista-reportes').hidden) {
      dibujarGrafico(ultimoReporte.regs);
    }
  }

  function aplicarConfig() {
    const c = db.config;
    if (!c) return;
    const logo = c.logo || 'assets/img/logo.svg';
    const fondo = c.fondo || 'assets/img/fondo.svg';

    $('#empresa-nombre').textContent = c.empresa;
    $('#login-empresa').textContent = c.empresa;
    $('#rep-empresa').textContent = c.empresa;

    ['#logo-app', '#login-logo', '#rep-logo'].forEach((sel) => {
      const img = $(sel);
      if (img) img.src = logo;
    });
    $('#cfg-logo-preview').src = logo;
    $('#cfg-fondo-preview').src = fondo;
    $('#fondo').style.backgroundImage = `url("${fondo}")`;
    document.title = `Control de Asistencia · ${c.empresa}`;
  }

  /* ---------------- Toasts y modal ---------------- */
  function toast(mensaje, tipo = 'ok') {
    const caja = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.textContent = mensaje;
    caja.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function abrirModal(titulo, html, alEnviar) {
    $('#modal-titulo').textContent = titulo;
    const cuerpo = $('#modal-cuerpo');
    cuerpo.innerHTML = html;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';

    const form = $('form', cuerpo);
    if (form && alEnviar) {
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (alEnviar(form) !== false) cerrarModal();
      });
    }

    setTimeout(() => {
      const foco = $('#modal-cuerpo input:not([type="hidden"]), #modal-cuerpo select, #modal-cuerpo button');
      if (foco) foco.focus();
    }, 40);

    return cuerpo;
  }

  function cerrarModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    if (modalResolve) {
      const resolver = modalResolve;
      modalResolve = null;
      resolver(false);
    }
  }

  function confirmar(mensaje, etiqueta = 'Sí, continuar') {
    return new Promise((resolve) => {
      const cuerpo = abrirModal(
        'Confirmar',
        `<p>${esc(mensaje)}</p>
         <div class="modal-acciones">
           <button type="button" class="btn btn-suave" data-cerrar>Cancelar</button>
           <button type="button" class="btn btn-peligro" id="modal-confirmar-ok">${esc(etiqueta)}</button>
         </div>`
      );
      modalResolve = resolve;
      $('#modal-confirmar-ok', cuerpo).addEventListener('click', () => {
        modalResolve = null;
        resolve(true);
        cerrarModal();
      });
    });
  }

  /* ---------------- Sesión ---------------- */
  function iniciarSesion(usuario, clave) {
    const u = db.usuarios.find(
      (x) => x.usuario.toLowerCase() === String(usuario).trim().toLowerCase() && x.clave === clave
    );
    if (!u) return null;
    db.sesion = { usuarioId: u.id, expira: Date.now() + 8 * 60 * 60 * 1000 };
    LS.set('sesion', db.sesion);
    return u;
  }

  function entrarApp() {
    $('#vista-login').hidden = true;
    $('#app').hidden = false;
    construirNav();
    pintarUsuario();
    aplicarConfig();
    ir('panel');
    reiniciarInactividad();
  }

  function cerrarSesion(motivo) {
    db.sesion = null;
    LS.del('sesion');
    clearTimeout(temporizadorInactividad);
    $('#app').hidden = true;
    $('#vista-login').hidden = false;
    const form = $('#form-login');
    if (form) form.reset();
    const error = $('#login-error');
    if (error) error.hidden = true;
    if (motivo) toast(motivo, 'info');
    setTimeout(() => { const u = $('#login-usuario'); if (u) u.focus(); }, 80);
  }

  function reiniciarInactividad() {
    if (!usuarioActual()) return;
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(() => {
      if (usuarioActual()) cerrarSesion('Sesión cerrada por 30 minutos de inactividad.');
    }, 30 * 60 * 1000);
  }

  function pintarUsuario() {
    const u = usuarioActual();
    if (!u) return;
    const emp = getEmpleado(u.empleadoId);
    $('#usuario-chip').innerHTML = `
      ${miniAvatarHTML(emp)}
      <span class="nombre-usuario">${esc(emp ? emp.nombre : u.usuario)}</span>
      <span class="rol-tag">${esc(u.rol)}</span>`;
  }

  /* ---------------- Navegación ---------------- */
  function construirNav() {
    const u = usuarioActual();
    if (!u) return;
    $('#nav').innerHTML = VISTAS
      .filter((v) => v.roles.includes(u.rol))
      .map((v) => `<button type="button" data-vista="${v.id}">${v.nombre}</button>`)
      .join('');
  }

  function puedeVer(vista) {
    const u = usuarioActual();
    const def = VISTAS.find((v) => v.id === vista);
    return !!(u && def && def.roles.includes(u.rol));
  }

  function ir(vista) {
    if (!puedeVer(vista)) vista = 'panel';
    vistaActual = vista;
    $$('.vista').forEach((sec) => { sec.hidden = sec.id !== 'vista-' + vista; });
    $$('#nav button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));

    if (vista === 'panel') renderPanel();
    if (vista === 'marcaje') renderMarcaje();
    if (vista === 'empleados') renderEmpleados();
    if (vista === 'reportes') renderReportes();
    if (vista === 'config') renderConfig();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Panel ---------------- */
  function renderPanel() {
    const u = usuarioActual();
    const emp = miEmpleado();
    if (!u) return;

    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    $('#panel-saludo').textContent = `${saludo}, ${(emp ? emp.nombre : u.usuario).split(' ')[0]}`;
    $('#panel-fecha').textContent = fechaLarga(fechaISO());

    const hoy = fechaISO();
    const activos = db.empleados.filter((e) => e.activo);
    const regsHoy = db.marcajes.filter((m) => m.fecha === hoy);
    const presentes = regsHoy.filter((m) => m.estado === 'puntual' || m.estado === 'tarde').length;
    const tardes = regsHoy.filter((m) => m.estado === 'tarde').length;
    const ausentes = regsHoy.filter((m) => m.estado === 'ausente').length;
    const permisos = regsHoy.filter((m) => m.estado === 'permiso' || m.estado === 'vacaciones').length;
    const minutos = regsHoy.reduce((acc, m) => acc + (Number(m.tardanza) || 0), 0);

    const misRegs = emp ? db.marcajes.filter((m) => m.empleadoId === emp.id) : [];
    const mioHoy = emp ? regsHoy.find((m) => m.empleadoId === emp.id) : null;

    const kpis = u.rol === 'cajero' && emp
      ? [
        { valor: mioHoy ? ESTADO_NOMBRE[mioHoy.estado] : 'Pendiente', etiqueta: 'Mi estado de hoy', tono: mioHoy && mioHoy.estado === 'tarde' ? 'warn' : mioHoy ? 'ok' : 'info' },
        { valor: mioHoy && mioHoy.entrada ? mioHoy.entrada : '—', etiqueta: 'Mi entrada', tono: 'info' },
        { valor: mioHoy && mioHoy.salida ? mioHoy.salida : '—', etiqueta: 'Mi salida', tono: 'info' },
        { valor: misRegs.filter((m) => m.estado === 'tarde').length, etiqueta: 'Mis tardanzas', tono: 'warn' },
      ]
      : [
        { valor: activos.length, etiqueta: 'Empleados activos', tono: 'info' },
        { valor: presentes, etiqueta: 'Presentes hoy', tono: 'ok' },
        { valor: tardes, etiqueta: 'Llegadas tarde', tono: 'warn' },
        { valor: ausentes, etiqueta: 'Ausentes', tono: 'peligro' },
        { valor: minutos, etiqueta: 'Minutos de tardanza', tono: 'warn' },
        { valor: permisos, etiqueta: 'Permisos / vacaciones', tono: 'info' },
      ];

    $('#panel-kpis').innerHTML = kpis.map((k) => `
      <div class="kpi tono-${k.tono}">
        <strong>${esc(k.valor)}</strong>
        <span>${esc(k.etiqueta)}</span>
      </div>`).join('');

    $('#panel-actualizado').textContent = 'Actualizado ' + horaHM();

    const listaEmp = u.rol === 'cajero' && emp ? [emp] : activos;
    const filas = listaEmp.map((e) => {
      const reg = regsHoy.find((m) => m.empleadoId === e.id);
      const estado = reg ? reg.estado : null;
      const pill = estado
        ? `<span class="pill ${reg.estado}">${ESTADO_NOMBRE[reg.estado]}</span>`
        : `<span class="pill sin">Sin registro</span>`;
      const horas = reg && reg.entrada ? `${reg.entrada}${reg.salida ? ' – ' + reg.salida : ' · en curso'}` : '—';
      return `
        <div class="fila-panel">
          ${avatarHTML(e)}
          <div class="crece">
            <strong>${esc(e.nombre)}</strong>
            <span>${esc(e.cargo)} · ${esc(e.cargo === e.area ? 'General' : e.area)}</span>
          </div>
          <span class="hora">${horas}</span>
          ${pill}
        </div>`;
    }).join('');

    $('#panel-hoy').innerHTML = filas ||
      '<div class="vacio">No hay empleados activos. Crea uno en la sección Empleados.</div>';

    if (u.rol === 'cajero' && emp) {
      $('#panel-secundario-titulo').textContent = 'Mi historial reciente';
      const ultimos = misRegs
        .slice()
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 8);

      $('#panel-secundario').innerHTML = ultimos.length
        ? ultimos.map((m) => `
            <div class="fila-panel">
              <div class="crece">
                <strong>${fechaCorta(m.fecha)}</strong>
                <span>${m.entrada || '—'}${m.salida ? ' – ' + m.salida : ''} · ${formatoHoras(horasDe(m))}</span>
              </div>
              <span class="pill ${m.estado}">${ESTADO_NOMBRE[m.estado]}</span>
            </div>`).join('')
        : '<div class="vacio">Todavía no tienes registros.</div>';
    } else {
      $('#panel-secundario-titulo').textContent = 'Pendientes de marcaje hoy';
      const pendientes = activos.filter((e) => !regsHoy.some((m) => m.empleadoId === e.id));
      const resto = pendientes.map((e) => `
        <div class="fila-panel">
          ${avatarHTML(e)}
          <div class="crece">
            <strong>${esc(e.nombre)}</strong>
            <span>${esc(e.cargo)}</span>
          </div>
          <span class="pill sin">Pendiente</span>
        </div>`).join('');

      $('#panel-secundario').innerHTML = (resto || '<div class="vacio">Todos los empleados tienen registro hoy.</div>') +
        `<button type="button" class="btn btn-suave btn-chico" data-ir="marcaje" style="align-self:flex-start">Ir a marcaje</button>`;
    }
  }

  /* ---------------- Marcaje ---------------- */
  function estadoPill(estado) {
    if (!estado) return '<span class="pill sin">Sin registro</span>';
    return `<span class="pill ${estado}">${ESTADO_NOMBRE[estado] || estado}</span>`;
  }

  function previewTardanza(emp, entrada, estado) {
    if (!estado) return { texto: 'Elige un estado', tipo: 'sin' };
    if (estado === 'ausente' || estado === 'permiso' || estado === 'vacaciones') {
      return { texto: ESTADO_NOMBRE[estado], tipo: estado };
    }
    if (!entrada) return { texto: 'Falta la entrada', tipo: 'sin' };
    const tard = tardanzaDe(emp, entrada);
    if (tard > 0) return { texto: `${tard} min tarde`, tipo: 'tarde' };
    if (estado === 'tarde') return { texto: 'Tarde (manual)', tipo: 'tarde' };
    return { texto: 'A tiempo', tipo: 'puntual' };
  }

  function marcajeCard(emp, fecha, reg) {
    const esHoy = fecha === fechaISO();
    const estado = reg ? reg.estado : '';
    const chips = ESTADOS.map((e) => `
      <label class="etiqueta" data-tono="${e.tono}">
        <input type="radio" name="estado-${emp.id}" value="${e.id}" ${estado === e.id ? 'checked' : ''}>
        <span>${e.nombre}</span>
      </label>`).join('');

    const inicial = previewTardanza(emp, reg ? reg.entrada : '', estado);

    return `
      <article class="emp-card" data-emp="${emp.id}">
        <div class="emp-card-cab">
          ${avatarHTML(emp)}
          <div class="emp-datos">
            <strong>${esc(emp.nombre)}</strong>
            <span class="muted">${esc(emp.cargo)} · ${esc(emp.area || 'General')}</span>
          </div>
          <span class="horario">${emp.entrada}–${emp.salida}</span>
        </div>

        <div class="horas">
          <div class="campo-mini">
            <span>Entrada</span>
            <input type="time" data-campo="entrada" value="${reg ? reg.entrada : ''}">
            ${esHoy ? '<button type="button" class="mini-ahora" data-ahora="entrada">Ahora</button>' : ''}
          </div>
          <div class="campo-mini">
            <span>Salida</span>
            <input type="time" data-campo="salida" value="${reg ? reg.salida : ''}">
            ${esHoy ? '<button type="button" class="mini-ahora" data-ahora="salida">Ahora</button>' : ''}
          </div>
        </div>

        <div class="chips">${chips}</div>
        <input type="text" data-campo="nota" maxlength="120" placeholder="Nota (opcional): motivo, justificación…" value="${esc(reg ? reg.nota : '')}">

        <div class="emp-pie">
          <span class="pill ${inicial.tipo}" data-preview>${inicial.texto}</span>
          <div class="acciones">
            ${reg && usuarioActual().rol !== 'cajero' ? '<button type="button" class="btn btn-suave btn-chico" data-borrar>Borrar</button>' : ''}
            <button type="button" class="btn btn-primario btn-chico" data-guardar>Guardar</button>
          </div>
        </div>
      </article>`;
  }

  function renderMarcaje() {
    const u = usuarioActual();
    const empPropio = miEmpleado();
    if (!u) return;

    const inputFecha = $('#marcaje-fecha');
    if (!inputFecha.value) inputFecha.value = fechaISO();
    const fecha = inputFecha.value;

    if (u.rol === 'cajero') {
      $('#marcaje-ayuda').textContent = 'Registra tu propia entrada y salida.';
      $('#btn-todos').hidden = true;
    } else {
      $('#marcaje-ayuda').textContent = 'Marca la entrada, la salida y el estado de cada empleado.';
      $('#btn-todos').hidden = false;
    }

    const q = $('#marcaje-buscar').value.trim().toLowerCase();
    let lista = u.rol === 'cajero'
      ? [empPropio].filter(Boolean)
      : db.empleados.filter((e) => e.activo);

    if (q) {
      lista = lista.filter((e) =>
        `${e.nombre} ${e.cargo} ${e.area}`.toLowerCase().includes(q));
    }
    lista = lista.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

    const contenedor = $('#marcaje-lista');
    if (!lista.length) {
      contenedor.innerHTML = '<div class="vacio">No hay empleados que coincidan con la búsqueda.</div>';
    } else {
      contenedor.innerHTML = lista.map((e) => marcajeCard(e, fecha, getRegistro(e.id, fecha))).join('');
    }

    const conRegistro = lista.filter((e) => getRegistro(e.id, fecha)).length;
    $('#marcaje-info').textContent = `${lista.length} empleado(s) · ${conRegistro} con registro · ${fechaCorta(fecha)}`;

    $$('.emp-card', contenedor).forEach((card) => enlazarCard(card, fecha));
  }

  function enlazarCard(card, fecha) {
    const empId = card.dataset.emp;
    const emp = getEmpleado(empId);
    if (!emp) return;

    const entrada = $('[data-campo="entrada"]', card);
    const salida = $('[data-campo="salida"]', card);
    const nota = $('[data-campo="nota"]', card);
    const preview = $('[data-preview]', card);

    const estadoSel = () => {
      const marcado = $('input[type="radio"]:checked', card);
      return marcado ? marcado.value : '';
    };

    const actualizarPreview = () => {
      const p = previewTardanza(emp, entrada.value, estadoSel());
      preview.className = `pill ${p.tipo}`;
      preview.textContent = p.texto;
    };

    entrada.addEventListener('input', actualizarPreview);
    $$('input[type="radio"]', card).forEach((r) => r.addEventListener('change', actualizarPreview));

    $$('[data-ahora]', card).forEach((boton) => {
      boton.addEventListener('click', () => {
        const campo = boton.dataset.ahora === 'entrada' ? entrada : salida;
        campo.value = horaHM();
        actualizarPreview();
      });
    });

    $('[data-guardar]', card).addEventListener('click', () => {
      let estado = estadoSel();
      if (!estado) {
        toast('Selecciona un estado: Puntual, Tarde, Ausente, Permiso o Vacaciones.', 'error');
        return;
      }

      const horaEntrada = entrada.value;
      const horaSalida = salida.value;

      if ((estado === 'puntual' || estado === 'tarde') && !horaEntrada) {
        toast('Falta la hora de entrada.', 'error');
        entrada.focus();
        return;
      }

      if (horaSalida && !horaEntrada) {
        toast('No puedes guardar una salida sin entrada.', 'error');
        entrada.focus();
        return;
      }

      let tardanza = 0;
      if (horaEntrada && (estado === 'puntual' || estado === 'tarde')) {
        tardanza = tardanzaDe(emp, horaEntrada);
        if (tardanza > 0) {
          estado = 'tarde';
          const radio = $(`input[value="tarde"]`, card);
          if (radio) radio.checked = true;
        }
      }

      const existente = getRegistro(empId, fecha);
      const datos = {
        empleadoId: empId,
        fecha,
        entrada: estado === 'ausente' || estado === 'vacaciones' ? '' : horaEntrada,
        salida: estado === 'ausente' || estado === 'vacaciones' ? '' : horaSalida,
        estado,
        tardanza,
        nota: nota.value.trim(),
        actualizado: new Date().toISOString(),
      };

      if (existente) {
        Object.assign(existente, datos);
      } else {
        db.marcajes.push(Object.assign({ id: 'm' + Date.now().toString(36) }, datos));
      }

      if (!guardarTodo()) return;
      toast(`Registro guardado: ${emp.nombre} · ${ESTADO_NOMBRE[estado]}${tardanza ? ` (${tardanza} min tarde)` : ''}.`);
      renderMarcaje();
    });

    const borrar = $('[data-borrar]', card);
    if (borrar) {
      borrar.addEventListener('click', async () => {
        const reg = getRegistro(empId, fecha);
        if (!reg) return;
        const seguro = await confirmar(`¿Borrar el registro de ${emp.nombre} del ${fechaCorta(fecha)}?`, 'Sí, borrar');
        if (!seguro) return;
        db.marcajes = db.marcajes.filter((m) => m.id !== reg.id);
        guardarTodo();
        toast('Registro eliminado.', 'info');
        renderMarcaje();
      });
    }
  }

  async function marcarTodosPresentes() {
    const fecha = $('#marcaje-fecha').value || fechaISO();
    if (fecha !== fechaISO()) {
      toast('Solo puedes marcar en bloque el día de hoy.', 'error');
      return;
    }
    const activos = db.empleados.filter((e) => e.activo);
    const pendientes = activos.filter((e) => !getRegistro(e.id, fecha));
    if (!pendientes.length) {
      toast('Todos los empleados ya tienen registro hoy.', 'info');
      return;
    }
    const seguro = await confirmar(
      `Se marcará la entrada de ${pendientes.length} empleado(s) con la hora actual. ¿Continuar?`,
      'Sí, marcar presentes'
    );
    if (!seguro) return;

    const ahora = horaHM();
    pendientes.forEach((emp) => {
      const tardanza = tardanzaDe(emp, ahora);
      db.marcajes.push({
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        empleadoId: emp.id,
        fecha,
        entrada: ahora,
        salida: '',
        estado: tardanza > 0 ? 'tarde' : 'puntual',
        tardanza,
        nota: '',
        actualizado: new Date().toISOString(),
      });
    });

    guardarTodo();
    toast(`${pendientes.length} entrada(s) registradas a las ${ahora}.`);
    renderMarcaje();
  }

  /* ---------------- Empleados ---------------- */
  function renderEmpleados() {
    const q = $('#emp-buscar').value.trim().toLowerCase();
    let lista = db.empleados.slice();
    if (q) lista = lista.filter((e) => `${e.nombre} ${e.cargo} ${e.area}`.toLowerCase().includes(q));
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

    $('#emp-info').textContent = `${lista.length} de ${db.empleados.length} empleados`;

    const contenedor = $('#emp-lista');
    if (!lista.length) {
      contenedor.innerHTML = '<div class="vacio">No hay empleados. Usa “Nuevo empleado” para agregar el primero.</div>';
      return;
    }

    contenedor.innerHTML = lista.map((emp) => `
      <article class="emp-card">
        <div class="emp-card-cab">
          ${avatarHTML(emp, 'grande')}
          <div class="emp-datos">
            <strong>${esc(emp.nombre)}</strong>
            <span class="muted">${esc(emp.cargo)}</span>
            <span class="muted">${esc(emp.area || 'General')} · ${emp.entrada}–${emp.salida}</span>
          </div>
          ${emp.activo ? '<span class="pill puntual">Activo</span>' : '<span class="pill vacaciones">Inactivo</span>'}
        </div>
        <div class="emp-pie">
          <span class="nota">${db.marcajes.filter((m) => m.empleadoId === emp.id).length} registro(s)</span>
          <div class="acciones">
            <button type="button" class="btn btn-suave btn-chico" data-editar="${emp.id}">Editar</button>
            <button type="button" class="btn btn-peligro btn-chico" data-eliminar="${emp.id}">Eliminar</button>
          </div>
        </div>
      </article>`).join('');

    $$('[data-editar]', contenedor).forEach((b) => {
      b.addEventListener('click', () => abrirEmpleado(b.dataset.editar));
    });
    $$('[data-eliminar]', contenedor).forEach((b) => {
      b.addEventListener('click', () => eliminarEmpleado(b.dataset.eliminar));
    });
  }

  function abrirEmpleado(id) {
    const existente = id ? getEmpleado(id) : null;
    const emp = existente || {
      nombre: '', cargo: 'Cajero', area: 'Caja', entrada: '08:00', salida: '16:00', activo: true, foto: '',
    };
    let fotoTemporal = emp.foto || '';

    const cargos = ['Cajero', 'Cajera', 'Asistente administrativo', 'Asistente de RRHH', 'Gerente general', 'Supervisor', 'Contador', 'Seguridad', 'Otro'];
    const opcionesCargo = cargos.map((c) =>
      `<option value="${esc(c)}" ${emp.cargo === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

    const cuerpo = abrirModal(
      existente ? 'Editar empleado' : 'Nuevo empleado',
      `<form class="form-grid" novalidate>
        <div class="foto-campo">
          <span id="emp-avatar">${avatarHTML(emp, 'grande')}</span>
          <div>
            <label class="btn btn-suave btn-chico">
              Subir foto
              <input type="file" id="emp-foto" accept="image/*" hidden>
            </label>
            <p class="nota">JPG o PNG. Se reduce a 200 px y se guarda en el navegador.</p>
          </div>
        </div>

        <label class="campo">
          <span>Nombre completo</span>
          <input name="nombre" type="text" required maxlength="60" value="${esc(emp.nombre)}" placeholder="Ej. Ana Torres">
        </label>

        <div class="horas">
          <label class="campo">
            <span>Cargo</span>
            <select name="cargo">${opcionesCargo}</select>
          </label>
          <label class="campo">
            <span>Área</span>
            <input name="area" type="text" maxlength="40" value="${esc(emp.area || '')}" placeholder="Caja, Gerencia…">
          </label>
        </div>

        <div class="horas">
          <label class="campo">
            <span>Entrada esperada</span>
            <input name="entrada" type="time" required value="${emp.entrada}">
          </label>
          <label class="campo">
            <span>Salida esperada</span>
            <input name="salida" type="time" required value="${emp.salida}">
          </label>
        </div>

        <label class="check-linea">
          <input type="checkbox" name="activo" ${emp.activo ? 'checked' : ''}>
          Empleado activo (aparece en marcaje e informes)
        </label>

        <div class="modal-acciones">
          <button type="button" class="btn btn-suave" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-primario">Guardar empleado</button>
        </div>
      </form>`,
      (form) => {
        const fd = new FormData(form);
        const nombre = String(fd.get('nombre') || '').trim();
        if (!nombre) {
          toast('El nombre es obligatorio.', 'error');
          return false;
        }
        const nueva = {
          nombre,
          cargo: String(fd.get('cargo') || 'Otro'),
          area: String(fd.get('area') || '').trim(),
          entrada: String(fd.get('entrada') || '08:00'),
          salida: String(fd.get('salida') || '16:00'),
          activo: fd.get('activo') === 'on',
          foto: fotoTemporal,
        };

        if (existente) {
          Object.assign(existente, nueva);
        } else {
          db.empleados.push(Object.assign({ id: 'e' + Date.now().toString(36) }, nueva));
        }
        if (!guardarTodo()) return false;
        toast(existente ? 'Empleado actualizado.' : 'Empleado agregado.');
        renderEmpleados();
        pintarSelectEmpleados();
        renderPanel();
        return true;
      }
    );

    const inputFoto = $('#emp-foto', cuerpo);
    inputFoto.addEventListener('change', async () => {
      const archivo = inputFoto.files && inputFoto.files[0];
      if (!archivo) return;
      if (archivo.size > 8 * 1024 * 1024) {
        toast('La imagen supera 8 MB. Usa una más liviana.', 'error');
        inputFoto.value = '';
        return;
      }
      try {
        fotoTemporal = await redimensionarImagen(archivo, 200, archivo.type === 'image/png' ? 'image/png' : 'image/jpeg');
        const nuevoEmp = Object.assign({}, emp, { foto: fotoTemporal });
        const contenedorAvatar = $('#emp-avatar', cuerpo);
        contenedorAvatar.innerHTML = avatarHTML(nuevoEmp, 'grande');
        toast('Foto lista. Guarda el empleado para aplicarla.', 'info');
      } catch (e) {
        toast('No se pudo leer la imagen.', 'error');
      }
    });
  }

  async function eliminarEmpleado(id) {
    const emp = getEmpleado(id);
    if (!emp) return;
    if (db.usuarios.some((u) => u.empleadoId === id)) {
      toast('No puedes eliminar al empleado vinculado a un usuario del sistema.', 'error');
      return;
    }
    const seguro = await confirmar(
      `¿Eliminar a ${emp.nombre} y todos sus registros de asistencia? Esta acción no se puede deshacer.`,
      'Sí, eliminar'
    );
    if (!seguro) return;
    db.empleados = db.empleados.filter((e) => e.id !== id);
    db.marcajes = db.marcajes.filter((m) => m.empleadoId !== id);
    guardarTodo();
    renderEmpleados();
    pintarSelectEmpleados();
    toast('Empleado eliminado.', 'info');
  }

  function pintarSelectEmpleados() {
    const sel = $('#rep-empleado');
    if (!sel) return;
    const valor = sel.value;
    const opciones = db.empleados.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    sel.innerHTML = '<option value="">Todos</option>' + opciones
      .map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
    sel.value = valor && db.empleados.some((e) => e.id === valor) ? valor : '';
  }

  /* ---------------- Informes ---------------- */
  function filtrosReporte() {
    return {
      desde: $('#rep-desde').value || '0000-01-01',
      hasta: $('#rep-hasta').value || '9999-12-31',
      empleado: $('#rep-empleado').value,
      estado: $('#rep-estado').value,
      q: $('#rep-buscar').value.trim().toLowerCase(),
    };
  }

  function registrosFiltrados() {
    let f = filtrosReporte();
    let desde = f.desde;
    let hasta = f.hasta;
    if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }

    let regs = db.marcajes.filter((m) => m.fecha >= desde && m.fecha <= hasta);

    if (f.empleado) regs = regs.filter((m) => m.empleadoId === f.empleado);
    if (f.estado) regs = regs.filter((m) => m.estado === f.estado);

    if (f.q) {
      regs = regs.filter((m) => {
        const e = getEmpleado(m.empleadoId);
        return e && `${e.nombre} ${e.cargo} ${e.area}`.toLowerCase().includes(f.q);
      });
    }

    return regs.slice().sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      const na = getEmpleado(a.empleadoId);
      const nb = getEmpleado(b.empleadoId);
      return (na ? na.nombre : '').localeCompare(nb ? nb.nombre : '');
    });
  }

  function renderReportes() {
    const regs = registrosFiltrados();
    const desde = $('#rep-desde').value;
    const hasta = $('#rep-hasta').value;
    const presentes = regs.filter((m) => m.estado === 'puntual' || m.estado === 'tarde').length;
    const tardes = regs.filter((m) => m.estado === 'tarde').length;
    const ausentes = regs.filter((m) => m.estado === 'ausente').length;
    const minutos = regs.reduce((acc, m) => acc + (Number(m.tardanza) || 0), 0);
    const horas = regs.reduce((acc, m) => acc + horasDe(m), 0);

    $('#rep-kpis').innerHTML = [
      { valor: regs.length, etiqueta: 'Registros', tono: 'info' },
      { valor: presentes, etiqueta: 'Presentes', tono: 'ok' },
      { valor: tardes, etiqueta: 'Tardanzas', tono: 'warn' },
      { valor: ausentes, etiqueta: 'Ausencias', tono: 'peligro' },
      { valor: minutos, etiqueta: 'Minutos tarde', tono: 'warn' },
      { valor: horas > 0 ? formatoHoras(horas) : '0,00 h', etiqueta: 'Horas trabajadas', tono: 'info' },
    ].map((k) => `
      <div class="kpi tono-${k.tono}">
        <strong>${esc(k.valor)}</strong>
        <span>${esc(k.etiqueta)}</span>
      </div>`).join('');

    $('#rep-leyenda').innerHTML = [
      ['Puntual', '--ok'], ['Tarde', '--warn'], ['Ausente', '--peligro'], ['Permiso / vacaciones', '--muted'],
    ].map(([texto, variable]) =>
      `<span><i style="background:var(${variable})"></i>${texto}</span>`).join('');

    ultimoReporte = { regs, desde, hasta };
    dibujarGrafico(regs);
    pintarDias(regs);
    pintarResumenEmpleados(regs);
  }

  function pintarDias(regs) {
    const contenedor = $('#rep-dias');
    if (!regs.length) {
      contenedor.innerHTML = '<div class="vacio">No hay registros en el rango seleccionado. Prueba con otras fechas.</div>';
      return;
    }

    const porFecha = new Map();
    regs.forEach((m) => {
      if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, []);
      porFecha.get(m.fecha).push(m);
    });

    const fechas = Array.from(porFecha.keys()).sort().reverse();

    contenedor.innerHTML = fechas.map((fecha) => {
      const lista = porFecha.get(fecha);
      const pres = lista.filter((m) => m.estado === 'puntual' || m.estado === 'tarde').length;
      const tar = lista.filter((m) => m.estado === 'tarde').length;
      const aus = lista.filter((m) => m.estado === 'ausente').length;
      const min = lista.reduce((a, m) => a + (Number(m.tardanza) || 0), 0);

      const filas = lista.map((m) => {
        const emp = getEmpleado(m.empleadoId);
        const nombre = emp ? emp.nombre : 'Empleado eliminado';
        const cargo = emp ? emp.cargo : '—';
        return `<tr>
          <td><span class="persona">${emp ? avatarHTML(emp) : ''}<span>${esc(nombre)}</span></span></td>
          <td>${esc(cargo)}</td>
          <td>${m.entrada || '—'}</td>
          <td>${m.salida || '—'}</td>
          <td>${estadoPill(m.estado)}</td>
          <td class="num">${m.tardanza > 0 ? m.tardanza + ' min' : '—'}</td>
          <td class="num">${formatoHoras(horasDe(m))}</td>
          <td class="nota-celda">${esc(m.nota || '')}</td>
        </tr>`;
      }).join('');

      return `<article class="dia">
        <div class="dia-cab">
          <strong>${fechaLarga(fecha)}</strong>
          <div class="resumen">
            <span>Presentes <b>${pres}</b></span>
            <span>Tardes <b>${tar}</b></span>
            <span>Ausentes <b>${aus}</b></span>
            <span>Tardanza <b>${min} min</b></span>
          </div>
        </div>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead>
              <tr>
                <th>Empleado</th><th>Cargo</th><th>Entrada</th><th>Salida</th>
                <th>Estado</th><th>Tardanza</th><th>Horas</th><th>Nota</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </article>`;
    }).join('');
  }

  function pintarResumenEmpleados(regs) {
    const contenedor = $('#rep-resumen');
    if (!regs.length) {
      contenedor.innerHTML = '<div class="vacio">Sin datos para resumir.</div>';
      return;
    }

    const mapa = new Map();
    regs.forEach((m) => {
      if (!mapa.has(m.empleadoId)) {
        mapa.set(m.empleadoId, { dias: 0, puntual: 0, tarde: 0, ausente: 0, otros: 0, minutos: 0, horas: 0 });
      }
      const acc = mapa.get(m.empleadoId);
      acc.dias++;
      if (m.estado === 'puntual') acc.puntual++;
      else if (m.estado === 'tarde') acc.tarde++;
      else if (m.estado === 'ausente') acc.ausente++;
      else acc.otros++;
      acc.minutos += Number(m.tardanza) || 0;
      acc.horas += horasDe(m);
    });

    const filas = Array.from(mapa.entries())
      .map(([empId, a]) => ({ emp: getEmpleado(empId), a }))
      .sort((x, y) => (x.emp ? x.emp.nombre : '').localeCompare(y.emp ? y.emp.nombre : ''))
      .map(({ emp, a }) => {
        const asistencia = a.dias ? Math.round(((a.puntual + a.tarde) / a.dias) * 100) : 0;
        return `<tr>
          <td><span class="persona">${emp ? avatarHTML(emp) : ''}<span>${esc(emp ? emp.nombre : 'Empleado eliminado')}</span></span></td>
          <td class="num">${a.dias}</td>
          <td class="num">${a.puntual}</td>
          <td class="num">${a.tarde}</td>
          <td class="num">${a.ausente}</td>
          <td class="num">${a.otros}</td>
          <td class="num">${a.minutos}</td>
          <td class="num">${formatoHoras(a.horas)}</td>
          <td class="num"><strong>${asistencia}%</strong></td>
        </tr>`;
      }).join('');

    contenedor.innerHTML = `<table class="tabla">
      <thead>
        <tr>
          <th>Empleado</th><th>Días</th><th>Puntual</th><th>Tarde</th><th>Ausente</th>
          <th>Permiso/Vac.</th><th>Min. tarde</th><th>Horas</th><th>Asistencia</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
  }

  /* ---------------- Gráfico (canvas puro) ---------------- */
  function colorCss(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#2563eb';
  }

  function dibujarGrafico(regs) {
    const canvas = $('#rep-chart');
    if (!canvas || !canvas.getContext) return;

    const ancho = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const alto = 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(alto * dpr);
    canvas.style.height = alto + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const colores = {
      puntual: colorCss('--ok'),
      tarde: colorCss('--warn'),
      ausente: colorCss('--peligro'),
      otros: colorCss('--muted'),
      texto: colorCss('--muted'),
      linea: colorCss('--linea'),
    };

    const fechas = Array.from(new Set(regs.map((m) => m.fecha))).sort();
    const limite = ancho < 560 ? 7 : 14;
    const dias = fechas.slice(-limite);

    if (!dias.length) {
      ctx.fillStyle = colores.texto;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos para graficar', ancho / 2, alto / 2);
      return;
    }

    const datos = dias.map((fecha) => {
      const delDia = regs.filter((m) => m.fecha === fecha);
      return {
        fecha,
        puntual: delDia.filter((m) => m.estado === 'puntual').length,
        tarde: delDia.filter((m) => m.estado === 'tarde').length,
        ausente: delDia.filter((m) => m.estado === 'ausente').length,
        otros: delDia.filter((m) => m.estado === 'permiso' || m.estado === 'vacaciones').length,
      };
    });

    const margen = { arriba: 14, derecha: 10, abajo: 34, izquierda: 34 };
    const anchoGrafico = ancho - margen.izquierda - margen.derecha;
    const altoGrafico = alto - margen.arriba - margen.abajo;

    const totales = datos.map((d) => d.puntual + d.tarde + d.ausente + d.otros);
    const maximo = Math.max(1, ...totales);
    const paso = Math.max(1, Math.ceil(maximo / 4));
    const tope = paso * 4;

    ctx.strokeStyle = colores.linea;
    ctx.fillStyle = colores.texto;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const valor = paso * i;
      const y = margen.arriba + altoGrafico - (valor / tope) * altoGrafico;
      ctx.beginPath();
      ctx.moveTo(margen.izquierda, y + 0.5);
      ctx.lineTo(ancho - margen.derecha, y + 0.5);
      ctx.stroke();
      ctx.fillText(String(valor), margen.izquierda - 6, y + 4);
    }

    const anchoGrupo = anchoGrafico / datos.length;
    const anchoBarra = Math.max(3, Math.min(11, (anchoGrupo * 0.7) / 4));
    const espacio = 2;
    const coloresBarras = [colores.puntual, colores.tarde, colores.ausente, colores.otros];
    const claves = ['puntual', 'tarde', 'ausente', 'otros'];

    datos.forEach((d, indice) => {
      const centro = margen.izquierda + anchoGrupo * indice + anchoGrupo / 2;
      const inicio = centro - ((anchoBarra * 4) + (espacio * 3)) / 2;

      claves.forEach((clave, i) => {
        const valor = d[clave];
        if (!valor) return;
        const h = (valor / tope) * altoGrafico;
        const x = inicio + i * (anchoBarra + espacio);
        const y = margen.arriba + altoGrafico - h;
        ctx.fillStyle = coloresBarras[i];
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, anchoBarra, h, 3);
        } else {
          ctx.rect(x, y, anchoBarra, h);
        }
        ctx.fill();
      });

      const mostrarEtiqueta = datos.length <= 8 || indice % 2 === 0;
      if (mostrarEtiqueta) {
        ctx.fillStyle = colores.texto;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const [, mes, dia] = d.fecha.split('-');
        ctx.fillText(`${dia}/${mes}`, centro, alto - 12);
      }
    });
  }

  /* ---------------- CSV / impresión / respaldo ---------------- */
  function descargarArchivo(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportarCSV() {
    const regs = registrosFiltrados();
    if (!regs.length) {
      toast('No hay registros para exportar.', 'error');
      return;
    }

    const cabecera = ['Fecha', 'Empleado', 'Cargo', 'Entrada', 'Salida', 'Estado', 'Minutos tarde', 'Horas', 'Nota'];
    const filas = regs.map((m) => {
      const emp = getEmpleado(m.empleadoId);
      return [
        m.fecha,
        emp ? emp.nombre : 'Empleado eliminado',
        emp ? emp.cargo : '',
        m.entrada || '',
        m.salida || '',
        ESTADO_NOMBRE[m.estado] || m.estado,
        m.tardanza || 0,
        horasDe(m) ? horasDe(m).toFixed(2) : '',
        m.nota || '',
      ];
    });

    const contenido = '\ufeff' + [cabecera].concat(filas)
      .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const desde = $('#rep-desde').value || 'inicio';
    const hasta = $('#rep-hasta').value || 'hoy';
    descargarArchivo(`asistencia_${desde}_a_${hasta}.csv`, contenido, 'text/csv;charset=utf-8;');
    toast('Informe CSV descargado.', 'ok');
  }

  function imprimirReporte() {
    const desde = $('#rep-desde').value;
    const hasta = $('#rep-hasta').value;
    const rango = `Informe del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
    $('#rep-rango').textContent = rango;
    $('#rep-generado').textContent = 'Generado el ' + fechaLarga(fechaISO()) + ' a las ' + horaHM();
    window.print();
  }

  function descargarRespaldo() {
    const datos = {
      version: 1,
      generado: new Date().toISOString(),
      empleados: db.empleados,
      usuarios: db.usuarios,
      marcajes: db.marcajes,
      config: db.config,
    };
    descargarArchivo(
      `respaldo_asistencia_${fechaISO()}.json`,
      JSON.stringify(datos, null, 2),
      'application/json'
    );
    toast('Respaldo JSON descargado.', 'ok');
  }

  /* ---------------- Configuración ---------------- */
  let logoTemporal = null;
  let fondoTemporal = null;

  function renderConfig() {
    const c = db.config;
    logoTemporal = c.logo;
    fondoTemporal = c.fondo;

    $('#cfg-empresa').value = c.empresa;
    $('#cfg-tolerancia').value = c.tolerancia;
    $('#cfg-descanso').value = c.descanso;
    $('#cfg-logo-preview').src = c.logo;
    $('#cfg-fondo-preview').src = c.fondo;

    let bytes = 0;
    ['empleados', 'usuarios', 'marcajes', 'config'].forEach((clave) => {
      bytes += (localStorage.getItem(PREFIJO + clave) || '').length;
    });
    $('#cfg-peso').textContent = `Uso aproximado del navegador: ${(bytes / 1024).toFixed(0)} KB de ~5000 KB.`;
  }

  function redimensionarImagen(archivo, maximo, tipoSalida) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error('Lectura fallida'));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagen inválida'));
        img.onload = () => {
          const escala = Math.min(1, maximo / Math.max(img.width, img.height));
          const ancho = Math.max(1, Math.round(img.width * escala));
          const alto = Math.max(1, Math.round(img.height * escala));
          const lienzo = document.createElement('canvas');
          lienzo.width = ancho;
          lienzo.height = alto;
          const ctx = lienzo.getContext('2d');
          ctx.fillStyle = tipoSalida === 'image/jpeg' ? '#ffffff' : 'transparent';
          if (tipoSalida === 'image/jpeg') ctx.fillRect(0, 0, ancho, alto);
          ctx.drawImage(img, 0, 0, ancho, alto);
          resolve(lienzo.toDataURL(tipoSalida, 0.82));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  async function leerImagenConfig(archivo, maximo, destino) {
    if (!archivo) return;
    if (archivo.size > 8 * 1024 * 1024) {
      toast('La imagen supera 8 MB. Usa una más liviana.', 'error');
      return;
    }
    try {
      const datos = await redimensionarImagen(
        archivo,
        maximo,
        archivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
      );
      if (destino === 'logo') {
        logoTemporal = datos;
        $('#cfg-logo-preview').src = datos;
      } else {
        fondoTemporal = datos;
        $('#cfg-fondo-preview').src = datos;
      }
      toast('Imagen cargada. Pulsa “Guardar configuración” para aplicarla.', 'info');
    } catch (e) {
      toast('No se pudo procesar la imagen.', 'error');
    }
  }

  /* ---------------- Eventos ---------------- */
  function enlazarEventos() {
    /* --- Login --- */
    $('#form-login').addEventListener('submit', (evento) => {
      evento.preventDefault();
      const usuario = $('#login-usuario').value;
      const clave = $('#login-clave').value;
      const error = $('#login-error');

      if (!usuario.trim() || !clave) {
        error.textContent = 'Escribe tu usuario y contraseña.';
        error.hidden = false;
        return;
      }

      const u = iniciarSesion(usuario, clave);
      if (!u) {
        error.textContent = 'Usuario o contraseña incorrectos. Prueba con la clave demo 1234.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      entrarApp();
    });

    $('#btn-ver-clave').addEventListener('click', () => {
      const input = $('#login-clave');
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      $('#btn-ver-clave').textContent = visible ? 'Ver' : 'Ocultar';
    });

    $$('[data-demo]').forEach((boton) => {
      boton.addEventListener('click', () => {
        $('#login-usuario').value = boton.dataset.demo;
        $('#login-clave').value = '1234';
        $('#form-login').requestSubmit();
      });
    });

    $('#btn-tema').addEventListener('click', alternarTema);
    $('#btn-tema-login').addEventListener('click', alternarTema);
    $('#btn-salir').addEventListener('click', () => cerrarSesion('Sesión cerrada.'));

    /* --- Navegación --- */
    $('#nav').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-vista]');
      if (boton) ir(boton.dataset.vista);
    });

    document.addEventListener('click', (evento) => {
      const irA = evento.target.closest('[data-ir]');
      if (irA) ir(irA.dataset.ir);
      const cerrar = evento.target.closest('[data-cerrar]');
      if (cerrar) cerrarModal();
    });

    $('#modal-cerrar').addEventListener('click', cerrarModal);
    $('#modal').addEventListener('click', (evento) => {
      if (evento.target.id === 'modal') cerrarModal();
    });

    /* --- Marcaje --- */
    $('#marcaje-fecha').addEventListener('change', renderMarcaje);
    $('#marcaje-buscar').addEventListener('input', renderMarcaje);
    $('#btn-todos').addEventListener('click', marcarTodosPresentes);

    /* --- Empleados --- */
    $('#emp-buscar').addEventListener('input', renderEmpleados);
    $('#btn-nuevo-emp').addEventListener('click', () => abrirEmpleado(null));

    /* --- Informes --- */
    $('#rep-desde').addEventListener('change', () => {
      $$('#chips-rango input').forEach((i) => { i.checked = false; });
      renderReportes();
    });
    $('#rep-hasta').addEventListener('change', () => {
      $$('#chips-rango input').forEach((i) => { i.checked = false; });
      renderReportes();
    });
    ['#rep-empleado', '#rep-estado'].forEach((sel) => {
      $(sel).addEventListener('change', renderReportes);
    });
    $('#rep-buscar').addEventListener('input', renderReportes);

    $$('#chips-rango input').forEach((input) => {
      input.addEventListener('change', () => {
        const hoy = fechaISO();
        let desde = hoy;
        let hasta = hoy;

        if (input.value === 'ayer') {
          desde = hasta = sumarDias(hoy, -1);
        } else if (input.value === 'semana') {
          desde = sumarDias(hoy, -6);
        } else if (input.value === 'mes') {
          const d = new Date();
          desde = fechaISO(new Date(d.getFullYear(), d.getMonth(), 1));
        }

        $('#rep-desde').value = desde;
        $('#rep-hasta').value = hasta;
        renderReportes();
      });
    });

    $('#btn-csv').addEventListener('click', exportarCSV);
    $('#btn-imprimir').addEventListener('click', imprimirReporte);

    /* --- Configuración --- */
    $('#form-config').addEventListener('submit', (evento) => {
      evento.preventDefault();
      const tolerancia = Math.max(0, Math.min(120, Number($('#cfg-tolerancia').value) || 0));
      const descanso = Math.max(0, Math.min(120, Number($('#cfg-descanso').value) || 0));

      db.config.empresa = $('#cfg-empresa').value.trim() || 'Mi empresa';
      db.config.tolerancia = tolerancia;
      db.config.descanso = descanso;
      db.config.logo = logoTemporal;
      db.config.fondo = fondoTemporal;

      if (!guardarTodo()) return;
      aplicarConfig();
      toast('Configuración guardada.');
      renderConfig();
    });

    $('#cfg-logo-input').addEventListener('change', (evento) => {
      leerImagenConfig(evento.target.files[0], 240, 'logo');
      evento.target.value = '';
    });
    $('#cfg-fondo-input').addEventListener('change', (evento) => {
      leerImagenConfig(evento.target.files[0], 1600, 'fondo');
      evento.target.value = '';
    });
    $('#btn-restaurar-imagenes').addEventListener('click', () => {
      logoTemporal = 'assets/img/logo.svg';
      fondoTemporal = 'assets/img/fondo.svg';
      $('#cfg-logo-preview').src = logoTemporal;
      $('#cfg-fondo-preview').src = fondoTemporal;
      toast('Imágenes restauradas. Guarda la configuración para aplicarlas.', 'info');
    });

    $('#btn-backup').addEventListener('click', descargarRespaldo);

    $('#btn-reset').addEventListener('click', async () => {
      const seguro = await confirmar(
        'Se borrarán todos los cambios y se restaurarán los datos de demostración. ¿Continuar?',
        'Sí, restablecer'
      );
      if (!seguro) return;
      ['empleados', 'usuarios', 'marcajes', 'config', 'sesion'].forEach((clave) => LS.del(clave));
      db = { empleados: [], usuarios: [], marcajes: [], config: null, sesion: null };
      sembrarDemo();
      aplicarConfig();
      pintarSelectEmpleados();
      cerrarSesion('Datos demo restablecidos. Vuelve a iniciar sesión.');
    });

    /* --- Atajos de teclado --- */
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !$('#modal').hidden) {
        cerrarModal();
        return;
      }
      if (evento.key === '/' && !evento.target.matches('input, select, textarea')) {
        const buscador = vistaActual === 'empleados'
          ? $('#emp-buscar')
          : vistaActual === 'reportes'
            ? $('#rep-buscar')
            : vistaActual === 'marcaje' ? $('#marcaje-buscar') : null;
        if (buscador) {
          evento.preventDefault();
          buscador.focus();
        }
      }
    });

    /* --- Inactividad y reloj --- */
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => {
      document.addEventListener(ev, reiniciarInactividad, { passive: true });
    });

    setInterval(() => {
      const reloj = $('#reloj');
      if (reloj) reloj.textContent = horaHMS();
    }, 1000);

    let esperaResize;
    window.addEventListener('resize', () => {
      clearTimeout(esperaResize);
      esperaResize = setTimeout(() => {
        if (vistaActual === 'reportes' && !$('#vista-reportes').hidden) {
          dibujarGrafico(ultimoReporte.regs);
        }
      }, 150);
    });
  }

  /* ---------------- Inicio ---------------- */
  function iniciarFechas() {
    const hoy = fechaISO();
    const d = new Date();
    $('#marcaje-fecha').value = hoy;
    $('#rep-hasta').value = hoy;
    $('#rep-desde').value = fechaISO(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  function iniciar() {
    cargarTodo();
    aplicarTema(LS.get('tema', 'claro'));
    aplicarConfig();
    iniciarFechas();
    pintarSelectEmpleados();
    enlazarEventos();

    const reloj = $('#reloj');
    if (reloj) reloj.textContent = horaHMS();

    const sesionValida = db.sesion && db.sesion.expira > Date.now() && usuarioActual();
    if (sesionValida) {
      entrarApp();
    } else {
      db.sesion = null;
      LS.del('sesion');
      $('#app').hidden = true;
      $('#vista-login').hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();

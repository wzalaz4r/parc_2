# Control de Asistencia

Aplicación web para registrar la asistencia de una empresa y generar **informes clasificados por fecha**, con cálculo automático de llegadas tardías y control de acceso por roles.

Hecha con **HTML, CSS y JavaScript puro**: sin frameworks, sin librerías, sin build y sin backend. Funciona abriendo `index.html` y se puede publicar directamente en GitHub Pages.

---

## Demo

| Usuario | Contraseña | Rol | Alcance |
|---|---|---|---|
| `gerente` | `1234` | Gerente | Acceso total: empleados, configuración, informes, respaldo |
| `asistente` | `1234` | Asistente | Registra asistencia de todos y consulta/exporta informes |
| `cajero` | `1234` | Cajero | Solo registra y consulta su propia asistencia |

> ⚠️ Las credenciales son de demostración y la contraseña se guarda sin cifrar en el navegador. No uses esta versión con datos reales de producción.

Al primer inicio se cargan **8 empleados** y unos **20 días de registros de ejemplo** para poder probar los informes de inmediato.

---

## Cómo ejecutarlo

1. Descarga o clona el repositorio.
2. Abre `index.html` con doble clic (Chrome, Edge o Firefox).
3. Entra con cualquier usuario demo.

No necesita servidor, instalación ni conexión a internet. Si prefieres servirlo localmente:

```bash
# opción con Python
python -m http.server 8080
# luego abre http://localhost:8080
```

---

## Funcionalidades

### Requisitos de la consigna

- ✅ **Login de inicio** con usuario y contraseña, sesión de 8 horas y cierre por inactividad (30 min).
- ✅ **Fondo de pantalla** configurable con imagen propia.
- ✅ **Botones etiqueta**: los estados y filtros se implementan con `<label>` + `<input type="radio">` estilizados como chips, accesibles con teclado.
- ✅ **Cálculo de llegadas tardías** automático por empleado, con tolerancia configurable.
- ✅ **Control de rol**: cajero, asistente y gerente (menú y acciones restringidas en JS).
- ✅ **Informes** por día, rango de fechas o mes, agrupados por fecha.
- ✅ **Imágenes**: fondo, logo de la empresa y foto por empleado (se reducen automáticamente antes de guardarse).
- ✅ **Características particulares**:
  - Reloj en vivo y saludo según la hora.
  - Tema claro / oscuro persistente.
  - Gráfico de barras dibujado con `<canvas>` nativo.
  - Exportación a **CSV** (compatible con Excel) y **PDF** vía impresión.
  - Resumen por empleado con porcentaje de asistencia y horas trabajadas.
  - "Marcar todos presentes" en bloque.
  - Validaciones: no guardar salida sin entrada, no duplicar el registro del día, detección automática de tardanza.
  - Búsqueda en vivo, toasts, diálogos propios, atajos de teclado y diseño responsive.
  - Respaldo de datos en JSON y restablecimiento de la demo.

### Roles

| Acción | Cajero | Asistente | Gerente |
|---|:---:|:---:|:---:|
| Ver panel | ✅ | ✅ | ✅ |
| Marcar su propia asistencia | ✅ | ✅ | ✅ |
| Marcar la asistencia de otros | — | ✅ | ✅ |
| Ver informes y exportar CSV | — | ✅ | ✅ |
| Gestionar empleados | — | ✅ | ✅ |
| Configuración, imágenes y respaldo | — | — | ✅ |

> Las cuentas de acceso son las tres de demostración. Los empleados que agregues desde la sección **Empleados** son datos de asistencia y no crean usuarios nuevos; para añadir cuentas habría que editar `js/app.js` o ampliar la app con un backend.

### Cálculo de tardanza

```
límite    = hora de entrada del empleado + tolerancia (10 min por defecto)
tardanza  = máx(0, hora de entrada real − límite)
estado    = "Tarde" si tardanza > 0, si no "Puntual"
horas     = salida − entrada − descanso (60 min por defecto)
```

Si el empleado marca una entrada que supera la tolerancia, la app cambia el estado a **Tarde** automáticamente. Los turnos nocturnos se contemplan si la salida es anterior a la entrada.

---

## Estructura del proyecto

```
par_2/
├── index.html          # Login + vistas de la aplicación
├── css/
│   └── styles.css      # Tema claro/oscuro, etiquetas, informes, impresión
├── js/
│   └── app.js          # Datos, sesión, roles, marcaje, cálculos e informes
├── assets/
│   └── img/
│       ├── logo.svg
│       └── fondo.svg
└── README.md
```

### Dónde se guardan los datos

Todo se almacena en el `localStorage` del navegador:

| Clave | Contenido |
|---|---|
| `asistencia_empleados` | Empleados y horarios |
| `asistencia_usuarios` | Usuarios y roles |
| `asistencia_marcajes` | Registros de asistencia |
| `asistencia_config` | Empresa, tolerancia, logo y fondo |
| `asistencia_sesion` | Sesión activa |
| `asistencia_tema` | Preferencia de tema |

Esto significa que **los datos son locales a cada navegador** y no se comparten entre dispositivos. Es ideal para una demo o un trabajo académico; para uso real haría falta un backend con base de datos y autenticación segura.

El espacio disponible ronda los 5 MB. Las imágenes se reducen antes de guardarse (logo a 240 px, fondo a 1600 px y fotos a 200 px), pero conviene no subir archivos muy pesados.

---

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Control de asistencia en HTML, CSS y JS"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

Después, en GitHub:

1. **Settings → Pages**
2. En *Source* elige **Deploy from a branch**.
3. Selecciona la rama `main` y la carpeta **/ (root)**.
4. Guarda y espera un minuto. La app queda en:

```
https://TU-USUARIO.github.io/TU-REPO/
```

No hay que cambiar ninguna ruta: el proyecto usa rutas relativas.

---

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `/` | Enfocar el buscador de la vista actual |
| `Esc` | Cerrar el modal abierto |

---

## Personalización rápida

- **Nombre de la empresa, tolerancia y descanso:** Configuración (solo gerente).
- **Logo y fondo:** Configuración → Imágenes.
- **Horarios por empleado:** Empleados → Editar.
- **Datos de ejemplo:** Configuración → *Restablecer datos demo*.
- **Colores y tipografía:** variables CSS al inicio de `css/styles.css`.

---

## Pruebas realizadas

La app se verificó en Microsoft Edge (Chromium) con pruebas automatizadas:

- Inicio de sesión correcto e incorrecto.
- Navegación y menú según cada rol.
- Registro de asistencia con cálculo de tardanza (09:30 vs. 08:00 + 10 min = 80 min).
- Alta de empleado desde el modal.
- Informe agrupado por fecha, KPIs, gráfico y resumen por empleado.
- Sin errores de JavaScript en consola.

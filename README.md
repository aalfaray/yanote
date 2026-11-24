# yanote - Editor Markdown Portable

Un editor de notas Markdown de escritorio **portable**, con pestañas múltiples (estilo **Orca**), editor enriquecido con **@mdxeditor/editor**, diseño basado en **shadcn/ui**, lectura en voz alta y terminal integrada.

---

## ⬇️ Descargar

**[Página de yanote](https://aalfaray.github.io/yanote/)** · **[Última versión (.exe)](https://github.com/aalfaray/yanote/releases/latest)**

- **Instalador** (`yanote-Setup-x.y.z.exe`): recomendado. Se actualiza solo: cuando hay una versión nueva, la app te pregunta y, si aceptas, la descarga, la instala y se reinicia.
- **Abrir con yanote**: el instalador añade esta opción al clic derecho del Explorador en carpetas, en el fondo de una carpeta y en archivos `.md`. Una carpeta pasa a ser la carpeta de trabajo y abre un chat de Claude en ella; un `.md` se abre en una pestaña. Si yanote ya está abierto, se usa esa misma ventana.
- **Portable** (`yanote-Portable-x.y.z.exe`): sin instalar. Te avisa de las versiones nuevas y abre la página de descarga.

> Windows puede mostrar "Windows protegió su PC" porque la app no está firmada digitalmente: pulsa *Más información → Ejecutar de todas formas*.
> yanote incluye [Claude Code](https://claude.com/claude-code) (el binario oficial, sin modificar, que trae el Claude Agent SDK). Si ya tienes `claude` instalado, se usa el tuyo. La primera vez que uses el chat, pulsa **Iniciar sesión**: se abre `claude auth login`, el inicio de sesión oficial de Claude Code, con tu cuenta de Claude o tu API key. yanote no ve tus credenciales y el uso se factura a tu propia cuenta.

## ✨ Características Principales

**Chat con Codex:** abre el menú de `+ NUEVA` y elige **Chat con Codex**. yanote incluye el [SDK oficial de Codex](https://developers.openai.com/codex/sdk/) y su ejecutable. Usa **Iniciar sesión en Codex** para autenticarte mediante el acceso oficial; si ya usas Codex, se conserva su sesión local. Puedes adjuntar imágenes, elegir modelos disponibles en la caché de Codex, cambiar el esfuerzo de razonamiento, detener una respuesta y retomar conversaciones después de reiniciar. Empieza en **Solo lectura**; **Editar carpeta** permite cambios dentro de la carpeta de trabajo y **Acceso total** permite cambios fuera de ella. Las operaciones que excedan el modo elegido fallan sin ampliar permisos automáticamente.

1. **Interfaz basada en shadcn/ui**
   - Paleta neutra en modo claro y colores del tema **One Dark** (VS Code) en modo oscuro, bordes finos, sombras suaves y esquinas redondeadas.
   - Controles con estados de foco y selección consistentes para usar el ratón o el teclado.
   - Barra de título personalizada sin marcos (Frameless window) perfectamente integrada.

2. **Resolución Compacta y Redimensionable**
   - Resolución inicial pequeña tipo bloc de notas flotante (`520 x 680 px`).
   - El usuario puede redimensionar libremente la ventana arrastrando sus bordes o maximizarla con el control superior.

3. **Pestañas de Markdown Múltiples (Inspirado en Orca)**
   - Permite abrir múltiples notas markdown en pestañas simultáneas.
   - Cada pestaña mantiene su propio documento independiente.
   - Botón `+ NUEVA` para crear notas rápidas tipo scratchpad (`scratch-1.md`, etc.).
   - Doble clic en cualquier pestaña para renombrar la nota (agrega `.md` automáticamente).
   - Indicador de cambios sin guardar (círculo rojo de dirty state).
   - Cierre de pestañas con alerta protectora ante cambios sin guardar.
   - Explorador de notas integrado para abrir notas existentes de la carpeta de notas.

4. **Editor Enriquecido con `@mdxeditor/editor`**
   - Encabezados (H1 - H6), negrita, cursiva, subrayado, código en línea.
   - Listas ordenadas y desordenadas.
   - Tablas interactivas y bloques de código con syntax highlighting (JS, TS, HTML, CSS, Python, Bash, SQL, etc.).
   - Alternancia instantánea entre modo visual enriquecido (WYSIWYG) y modo código fuente Markdown (Source mode) con el botón de alternancia.

5. **Lectura en Voz Alta**
   - Botón 🔊 en la barra de herramientas: leer todo, la selección, el párrafo actual o desde el cursor hasta el final.
   - Barra de reproducción con pausa, párrafo anterior/siguiente, velocidad y resaltado del párrafo que se lee.
   - Usa las voces del sistema (preferencia por español) con respaldo nativo de Windows (System.Speech).

6. **Portabilidad Total**
   - La aplicación detecta carpetas portables (`portable-data` o carpeta ejecutable) para almacenar todas las notas y configuración localmente.
   - Permite cambiar la carpeta de notas en cualquier momento desde los Ajustes.
   - Empaquetable como ejecutable único Windows (`.exe` portable) que no requiere instalación.

---

## 🚀 Inicio Rápido

### Requisitos
- Node.js 24

### Instalación de dependencias
```bash
npm install
```

### Ejecutar en Desarrollo (React + Electron)
```bash
npm run dev:electron
```

*(O para probar sólo la interfaz web en navegador: `npm run dev`)*

---

## 🧪 Suite de Pruebas (20% Happy Path / 80% Pruebas Destructivas y Caos)

El proyecto cuenta con pruebas automatizadas que cubren **Backend**, **Frontend** y **E2E**:

| Capa | Archivos de Prueba | Pruebas | Cobertura |
|---|---|---|---|
| **Backend** | `tests/backend/configService.test.ts`<br>`tests/backend/fileService.test.ts`<br>`tests/backend/speechService.test.ts`<br>`tests/backend/terminalService.test.ts` | — | Configuración portable, lectura/escritura atómica, borrado, renombrado, prevención de corrupción JSON, voz nativa, terminales, fallos forzados de I/O. |
| **Frontend** | `tests/frontend/TabBar.test.tsx`<br>`tests/frontend/TitleBar.test.tsx`<br>`tests/frontend/UIComponents.test.tsx`<br>`tests/frontend/Modals.test.tsx` | — | Pestañas estilo Orca, renombrado con enter/escape, spam de clics, controles de ventana, componentes con estilo shadcn/ui, modales y alertas de error. |
| **E2E** | `tests/e2e/workflow.test.tsx` | — | Ciclo completo de creación de pestañas, edición markdown, guardado con `Ctrl+S`, creación rápida de 20 notas simultáneas (stress test), y recuperación ante fallos de disco. |

### Ejecutar todas las pruebas:
```bash
npm test
```

---

## 📦 Compilación y publicación

### Compilar instalador + portable en local
```bash
npm run dist
```
Genera en `dist-electron/` el instalador `yanote-Setup-x.y.z.exe`, el portable `yanote-Portable-x.y.z.exe` y `latest.yml` (lo que lee el actualizador).

### Publicar una versión nueva (actualización automática)
La publicación la hace GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) al subir una etiqueta `v*`:

```bash
npm version 1.6.0 --no-git-tag-version          # actualiza package.json y package-lock.json
# Preparar y verificar los cambios; obtener aprobación explícita para commit y push a beta.
git add .
git commit -m "chore: release v1.6.0"
git tag -a v1.6.0 -m "Novedades de la versión:
- Lo que cambió
- Otra mejora"                                   # este texto aparece en el aviso de actualización
git push --atomic origin beta refs/tags/v1.6.0
```

El workflow comprueba que la etiqueta coincide con `package.json`, ejecuta los tests, compila y crea la release con los `.exe`. Las copias instaladas lo detectan al iniciar (y cada 6 horas) y preguntan al usuario si quiere actualizar. Publicar desde `beta` no modifica `main`; cualquier merge y push a `main` requiere una autorización explícita independiente, según [AGENTS.md](AGENTS.md). Las novedades están en [CHANGELOG.md](CHANGELOG.md).

### Landing page
La web está en [site/](site/) y se publica en GitHub Pages con [.github/workflows/pages.yml](.github/workflows/pages.yml) cada vez que cambia. Los botones de descarga apuntan siempre al `.exe` de la última release.

## 📄 Licencia

El código de yanote se publica bajo la licencia [MIT](LICENSE): puedes usarlo, modificarlo y redistribuirlo, también con fines comerciales, manteniendo el aviso de copyright.

Los instaladores incluyen Claude Code, que es software de Anthropic y sigue bajo [sus propios términos](https://www.anthropic.com/legal/commercial-terms); la licencia MIT no se aplica a ese binario. Las demás dependencias mantienen sus licencias.

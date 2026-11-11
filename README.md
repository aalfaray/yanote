# ⚡ BoldNotes - Editor Markdown Neubrutalista Portable

Un editor de notas Markdown de escritorio **portable**, con **superposición (Always on Top)**, pestañas múltiples (estilo **Orca**), editor enriquecido con **@mdxeditor/editor**, diseño **Neubrutalista (Boldkit)** y control de versiones con sincronización a **GitHub**.

---

## ✨ Características Principales

1. **Estilo Neubrutalista (Boldkit Style)**
   - Bordes negros sólidos (2px / 3px), sombras proyectadas rígidas (`shadow-[2px_2px_0px_#000]`), contrastes altos y paleta vibrante (Amarillo neón, menta, coral, cian, lavanda).
   - Componentes interactivos con microinteracciones de pulsación brutalista.
   - Barra de título personalizada sin marcos (Frameless window) perfectamente integrada.

2. **Superposición sobre otros programas (Always on Top)**
   - Botón de **Pin 📌 / Superposición** en la barra superior.
   - Permite mantener la ventana flotante siempre por encima de cualquier otro software (navegadores, IDEs, videollamadas, etc.).
   - Indicador visual dinámico (`ENCIMA` / `FLOTANTE` / `PINNED`).

3. **Resolución Compacta y Redimensionable**
   - Resolución inicial pequeña tipo bloc de notas flotante (`520 x 680 px`).
   - El usuario puede redimensionar libremente la ventana arrastrando sus bordes o maximizarla con el control superior.

4. **Pestañas de Markdown Múltiples (Inspirado en Orca)**
   - Permite abrir múltiples notas markdown en pestañas simultáneas.
   - Cada pestaña mantiene su propio documento independiente.
   - Botón `+ NUEVA` para crear notas rápidas tipo scratchpad (`scratch-1.md`, etc.).
   - Doble clic en cualquier pestaña para renombrar la nota (agrega `.md` automáticamente).
   - Indicador de cambios sin guardar (círculo rojo de dirty state).
   - Cierre de pestañas con alerta protectora ante cambios sin guardar.
   - Explorador de notas integrado para abrir notas existentes del repositorio.

5. **Editor Enriquecido con `@mdxeditor/editor`**
   - Encabezados (H1 - H6), negrita, cursiva, subrayado, código en línea.
   - Listas ordenadas y desordenadas.
   - Tablas interactivas y bloques de código con syntax highlighting (JS, TS, HTML, CSS, Python, Bash, SQL, etc.).
   - Alternancia instantánea entre modo visual enriquecido (WYSIWYG) y modo código fuente Markdown (Source mode) con el botón de alternancia.

6. **Control de Versiones & GitHub**
   - Inicializa automáticamente un repositorio Git local en la carpeta de notas.
   - **Guardado y confirmación automática (Ctrl + S):** Guarda el archivo en disco y crea un commit en Git (`Update <filename> - <timestamp>`).
   - **Sincronización con 1 solo clic:** Botón rápido de sincronización en la barra superior y barra de estado (Commit + Pull + Push).
   - **Panel de control Git:** Visualiza rama actual, archivos modificados, estado de sincronización y visor de las últimas 20 revisiones/commits.
   - **Configuración de GitHub:** Configuración de URL remota (`https://github.com/usuario/repo.git`), rama principal (`main`) y Token de Acceso Personal (PAT) para push directo sin requerir SSH global.

7. **Portabilidad Total**
   - La aplicación detecta carpetas portables (`portable-data` o carpeta ejecutable) para almacenar todas las notas y configuración localmente.
   - Permite cambiar la carpeta de notas en cualquier momento desde los Ajustes.
   - Empaquetable como ejecutable único Windows (`.exe` portable) que no requiere instalación.

---

## 🚀 Inicio Rápido

### Requisitos
- Node.js >= 18
- Git instalado en el sistema

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

El proyecto cuenta con **92 pruebas automatizadas** que cubren **Backend**, **Frontend** y **E2E**:

| Capa | Archivos de Prueba | Pruebas | Cobertura |
|---|---|---|---|
| **Backend** | `tests/backend/configService.test.ts`<br>`tests/backend/fileService.test.ts`<br>`tests/backend/gitService.test.ts` | 41 | Configuración portable, lectura/escritura atómica, borrado, renombrado, prevención de corrupción JSON, timeouts de red Git, credenciales seguras, fallos forzados de I/O. |
| **Frontend** | `tests/frontend/TabBar.test.tsx`<br>`tests/frontend/TitleBar.test.tsx`<br>`tests/frontend/UIComponents.test.tsx`<br>`tests/frontend/Modals.test.tsx` | 41 | Pestañas estilo Orca, renombrado con enter/escape, spam de clics, superposición siempre visible, controles de ventana, componentes Neubrutalistas, modales y alertas de error. |
| **E2E** | `tests/e2e/workflow.test.tsx` | 10 | Ciclo completo de creación de pestañas, edición markdown, guardado con `Ctrl+S`, confirmación en Git, creación rápida de 20 notas simultáneas (stress test), y recuperación ante fallos de disco. |

### Ejecutar todas las pruebas:
```bash
npm test
```

---

## 📦 Compilación y Generación Portable

### Compilar TypeScript y Vite:
```bash
npm run build
```

### Generar ejecutable portable de Windows (`.exe`):
```bash
npm run package:portable
```
El archivo ejecutable se generará en la carpeta `dist-electron/BoldNotes-Portable-1.0.0.exe`. Puede copiarse a una memoria USB o a cualquier computadora y funcionar de manera autónoma.

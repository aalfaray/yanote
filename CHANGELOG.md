# Cambios de yanote

## v1.8.0

- Chat con Codex desde «+ NUEVA»: inicio de sesión, imágenes, elección de modelo y esfuerzo de razonamiento, y conversaciones que se retoman tras reiniciar. Permisos: Solo lectura, Editar carpeta o Acceso total.
- Acceso desde el teléfono con Orca Mobile a los chats de Claude, Codex y Antigravity: emparejado con código QR, en la misma Wi‑Fi o por Tailscale.
- Manteniendo Alt, el editor y las pestañas se desplazan más rápido.

## v1.7.0

- Modo oscuro con los colores del tema One Dark Pro de VS Code: interfaz, resaltado de código y terminal.
- Con el explorador abierto, el botón + abre los chats y terminales nuevos en la carpeta elegida ahí; el explorador ya no salta a otra carpeta al abrir una pestaña.
- La lectura en voz alta va a la misma velocidad con cualquier motor de voz: x2 lee al doble de rápido (antes podía ir a 1.4x o a 3x).
- Se quita la opción de ventana flotante (siempre encima).

## v1.6.0

- Nueva interfaz basada en shadcn/ui: paleta neutra, bordes finos, sombras suaves y controles consistentes en modo claro y oscuro.
- Diseño actualizado en pestañas, editor Markdown, terminal, chat, explorador, menús y ajustes.
- Mejoras de accesibilidad en los campos de texto y estados de foco para navegar con el teclado.
- Cambio automático de cuenta de Claude al alcanzar el límite de uso, configurable desde el menú de cuentas.
- El fondo de la ventana respeta el tema guardado durante la recarga.
- Se mantiene la recuperación de notas pendientes entre reinicios y una nota vacía en el primer inicio.
- Verificación del primer inicio y la recuperación de borradores mediante pruebas sobre Electron.

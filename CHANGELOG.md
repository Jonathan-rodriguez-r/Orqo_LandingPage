# Changelog â€” ORQO

Todos los cambios notables de este proyecto estÃ¡n documentados aquÃ­.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---
## [0.3.1] - 2026-03-31

### Landing + Widget runtime

**Cambiado**
- `Landing_Page/index.html`: el widget ahora aplica tema por configuracion (`themeMode`) de forma local al widget (sin forzar tema global de la landing).
- Variables visuales del widget quedan scopeadas a `#orqo-widget` para mantener aislamiento visual.

**Ayuda / FAQ**
- El contenido de ayuda del widget se consume dinamicamente desde configuracion publica del dashboard (`/api/public/widget`).
- La seccion de inicio y ayuda queda preparada para mostrar articulos de categoria `Ayuda` editables desde configuracion de widget.

---

## [0.3.0] â€” 2026-03-29

### Landing Page â€” Modo claro/oscuro completo

**Agregado**
- Toggle dark/light mode en la barra de navegaciÃ³n (Ã­cono sol/luna)
- FunciÃ³n `applyTheme()` y `toggleTheme()` que persisten preferencia en `localStorage`
- CSS `[data-theme="light"]` con paleta de variables CSS claras (--g00 a --g08)
- Footer siempre oscuro con wrapper `.footer-outer` (#070C08) en ambos modos
- TamaÃ±o de fuente aumenta cuando el widget de chat se maximiza

**Corregido**
- Todos los SVG del logo ORQO ahora usan `stroke="currentColor"` (antes hardcoded `#E9EDE9`, invisible en claro)
- Widget: tabs desactivadas en negro, tab activa en verde acento en modo claro
- Botones de maximizar/cerrar del widget visibles en modo claro
- Ãcono ORQO del widget visible en modo claro (antes transparente)
- Contenido del ticker visible en modo claro
- Textos de "Casos de uso" y descripciones de pasos visibles en modo claro
- Fondo de la barra de navegaciÃ³n lee variables CSS dinÃ¡micamente (antes hardcoded)

**Dashboard**
- Variables CSS para modo claro en `globals.css`
- BotÃ³n de toggle tema en el sidebar (junto al avatar de usuario)
- `--blue` reemplazado por `#2CB978` (verde ORQO) en modo claro

---

## [0.2.0] â€” 2026-03-29

### Landing Page â€” Chat widget + MenÃº hamburguesa + Deploy Vercel

**Agregado**
- MenÃº hamburguesa para mÃ³viles (`max-width: 900px`) con toggle abierto/cerrado
- Chat widget completo embebido directamente en `index.html`
  - DiseÃ±o con burbuja flotante, animaciÃ³n de apertura
  - PestaÃ±as: Chat, Ayuda, Novedades
  - MaximizaciÃ³n de ventana
  - Respuestas demo hardcodeadas en `getBotReply()`
  - LÃ­mite de 20 conversaciones por usuario (localStorage)
  - Funciones renombradas para evitar conflictos: `escHtml()`, `wRelTime()`, `chatTa`
- Archivo `vercel.json` en raÃ­z con `outputDirectory: "Landing_Page"` para deploy estÃ¡tico
- Link "Ingresar â†’" apunta a `https://dashboard.orqo.io`

---

## [0.1.0] â€” 2026-03-29

### Dashboard â€” Auth + Nav + Chat widget standalone

**Agregado**
- Magic link de autenticaciÃ³n (Resend + JWT)
  - Dev bypass: magic link se imprime en consola cuando `NODE_ENV !== 'production'`
- Link "Ingresar al dashboard" en la barra de navegaciÃ³n de la landing
- Chat widget standalone en `Landing_Page/chat-widget.html` (referencia de diseÃ±o)
- Sidebar con navegaciÃ³n: Resumen, Widget, Agentes, Conversaciones, Integraciones, Cuenta, Accesos
- Hero visual mejorado, ticker de marcas, footer Bacata, nÃºmero de WhatsApp corregido

**Infraestructura**
- Dos proyectos Vercel separados:
  - `orqo.io` â†’ Landing Page (outputDirectory: `Landing_Page`)
  - `dashboard.orqo.io` â†’ Dashboard Next.js
- Variables de entorno del dashboard: `MONGODB_URI`, `RESEND_API_KEY`, `JWT_SECRET`, `APP_URL`, `EMAIL_FROM`

---

## [0.0.1] â€” 2026-03-29

### Commit inicial

- Estructura base del repositorio
- `Landing_Page/` â€” HTML estÃ¡tico
- `orqo-dashboard/` â€” Next.js 16 con React 19, TypeScript, MongoDB Atlas



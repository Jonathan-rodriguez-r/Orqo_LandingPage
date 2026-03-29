# Changelog — ORQO

Todos los cambios notables de este proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [0.3.0] — 2026-03-29

### Landing Page — Modo claro/oscuro completo

**Agregado**
- Toggle dark/light mode en la barra de navegación (ícono sol/luna)
- Función `applyTheme()` y `toggleTheme()` que persisten preferencia en `localStorage`
- CSS `[data-theme="light"]` con paleta de variables CSS claras (--g00 a --g08)
- Footer siempre oscuro con wrapper `.footer-outer` (#070C08) en ambos modos
- Tamaño de fuente aumenta cuando el widget de chat se maximiza

**Corregido**
- Todos los SVG del logo ORQO ahora usan `stroke="currentColor"` (antes hardcoded `#E9EDE9`, invisible en claro)
- Widget: tabs desactivadas en negro, tab activa en verde acento en modo claro
- Botones de maximizar/cerrar del widget visibles en modo claro
- Ícono ORQO del widget visible en modo claro (antes transparente)
- Contenido del ticker visible en modo claro
- Textos de "Casos de uso" y descripciones de pasos visibles en modo claro
- Fondo de la barra de navegación lee variables CSS dinámicamente (antes hardcoded)

**Dashboard**
- Variables CSS para modo claro en `globals.css`
- Botón de toggle tema en el sidebar (junto al avatar de usuario)
- `--blue` reemplazado por `#2CB978` (verde ORQO) en modo claro

---

## [0.2.0] — 2026-03-29

### Landing Page — Chat widget + Menú hamburguesa + Deploy Vercel

**Agregado**
- Menú hamburguesa para móviles (`max-width: 900px`) con toggle abierto/cerrado
- Chat widget completo embebido directamente en `index.html`
  - Diseño con burbuja flotante, animación de apertura
  - Pestañas: Chat, Ayuda, Novedades
  - Maximización de ventana
  - Respuestas demo hardcodeadas en `getBotReply()`
  - Límite de 20 conversaciones por usuario (localStorage)
  - Funciones renombradas para evitar conflictos: `escHtml()`, `wRelTime()`, `chatTa`
- Archivo `vercel.json` en raíz con `outputDirectory: "Landing_Page"` para deploy estático
- Link "Ingresar →" apunta a `https://dashboard.orqo.io`

---

## [0.1.0] — 2026-03-29

### Dashboard — Auth + Nav + Chat widget standalone

**Agregado**
- Magic link de autenticación (Resend + JWT)
  - Dev bypass: magic link se imprime en consola cuando `NODE_ENV !== 'production'`
- Link "Ingresar al dashboard" en la barra de navegación de la landing
- Chat widget standalone en `Landing_Page/chat-widget.html` (referencia de diseño)
- Sidebar con navegación: Resumen, Widget, Agentes, Conversaciones, Integraciones, Cuenta, Accesos
- Hero visual mejorado, ticker de marcas, footer Bacata, número de WhatsApp corregido

**Infraestructura**
- Dos proyectos Vercel separados:
  - `orqo.io` → Landing Page (outputDirectory: `Landing_Page`)
  - `dashboard.orqo.io` → Dashboard Next.js
- Variables de entorno del dashboard: `MONGODB_URI`, `RESEND_API_KEY`, `JWT_SECRET`, `APP_URL`, `EMAIL_FROM`

---

## [0.0.1] — 2026-03-29

### Commit inicial

- Estructura base del repositorio
- `Landing_Page/` — HTML estático
- `orqo-dashboard/` — Next.js 16 con React 19, TypeScript, MongoDB Atlas

# ORQO

Asistente de IA para negocios — integración con WordPress y WhatsApp.
Desarrollado por **Bacata Digital Media**.

## Repositorios

Este repo contiene dos proyectos desplegados de forma independiente en Vercel:

| Proyecto | Directorio | Dominio |
|----------|-----------|---------|
| Landing Page | `Landing_Page/` | [orqo.io](https://orqo.io) |
| Dashboard | `orqo-dashboard/` | [dashboard.orqo.io](https://dashboard.orqo.io) |

## Landing Page (`Landing_Page/`)

HTML estático puro. Sin build step, sin dependencias.

**Secciones:** Nav → Hero → Ticker → Cómo funciona → WordPress → Casos de uso → CTA → Footer

**Características:**
- Dark/light mode con toggle en la barra de navegación (persiste en `localStorage`)
- Chat widget ORQO embebido (demo con respuestas hardcodeadas)
- Menú hamburguesa para móviles
- Footer siempre oscuro

**Deploy:** `vercel.json` en la raíz apunta a `Landing_Page/` como directorio de salida.

## Dashboard (`orqo-dashboard/`)

Ver [orqo-dashboard/README.md](./orqo-dashboard/README.md) para detalle completo.

**Stack:** Next.js 16 · React 19 · TypeScript · MongoDB Atlas · Resend

## Contacto

- Email: hola@orqo.io
- WhatsApp: +57 301 321 1669

---

Ver [CHANGELOG.md](./CHANGELOG.md) para historial de cambios.

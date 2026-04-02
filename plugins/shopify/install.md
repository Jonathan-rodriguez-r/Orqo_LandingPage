# ORQO Chat — Instalación en Shopify

## Opción A: Snippet en el tema (recomendado, 5 minutos)

1. Ve a **Admin de Shopify → Online Store → Themes → Edit code**
2. En la carpeta **Snippets**, haz clic en **Add a new snippet** → nómbralo `orqo-widget`
3. Pega el contenido de `orqo-widget.liquid`
4. Reemplaza `TU_API_KEY_AQUI` con tu API Key de ORQO
5. Abre `layout/theme.liquid`
6. Antes del cierre `</body>` agrega:
   ```liquid
   {% render 'orqo-widget' %}
   ```
7. Guarda — el widget aparece en tu tienda

---

## Opción B: ScriptTag API (sin editar el tema)

Si prefieres no tocar el código del tema, puedes usar la API de Shopify para inyectar el script automáticamente en todas las páginas:

```bash
curl -X POST "https://TU-TIENDA.myshopify.com/admin/api/2024-01/script_tags.json" \
  -H "X-Shopify-Access-Token: TU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{
    "script_tag": {
      "event": "onload",
      "src": "https://dashboard.orqo.io/widget.js?key=TU_API_KEY_AQUI"
    }
  }'
```

---

## ¿Dónde obtengo mi API Key?

1. Ve a [dashboard.orqo.io](https://dashboard.orqo.io)
2. Configuración → Motor de Agentes
3. Aprovisiona tu workspace (si no lo has hecho)
4. La API Key se muestra una sola vez — cópiala y guárdala

---

## Soporte

- Documentación: [orqo.io](https://orqo.io)
- WhatsApp: +57 301 321 1669
- Email: hello@orqo.io

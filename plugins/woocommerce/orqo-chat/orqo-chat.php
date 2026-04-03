<?php
/**
 * Plugin Name: ORQO Chat
 * Plugin URI:  https://orqo.io
 * Description: Agente de IA para WhatsApp, Instagram y web — conecta tus clientes de WooCommerce con ORQO en minutos.
 * Version:     1.0.0
 * Author:      Bacata Digital Media
 * Author URI:  https://orqo.io
 * License:     GPL-2.0+
 * Text Domain: orqo-chat
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'ORQO_CHAT_VERSION', '1.0.0' );
define( 'ORQO_CHAT_WIDGET_URL', 'https://dashboard.orqo.io/widget.js' );

// ── Admin: menú de configuración ──────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page(
        'ORQO Chat',
        'ORQO Chat',
        'manage_options',
        'orqo-chat',
        'orqo_chat_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'orqo_chat_group', 'orqo_chat_api_key', [
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ] );
    register_setting( 'orqo_chat_group', 'orqo_chat_enabled', [
        'sanitize_callback' => 'rest_sanitize_boolean',
        'default'           => true,
    ] );
} );

function orqo_chat_settings_page() {
    $api_key = get_option( 'orqo_chat_api_key', '' );
    $enabled = get_option( 'orqo_chat_enabled', true );
    ?>
    <div class="wrap">
        <h1>
            <span style="color:#2CB978;font-weight:800;letter-spacing:-0.03em;">ORQO</span> Chat
        </h1>
        <p>Conecta tu tienda WooCommerce con el agente de IA de ORQO.</p>

        <?php if ( empty( $api_key ) ) : ?>
        <div class="notice notice-warning"><p>
            Ingresa tu <strong>API Key</strong> para activar el widget. Encuéntrala en
            <a href="https://dashboard.orqo.io/dashboard/settings/integrations" target="_blank">
                dashboard.orqo.io → Configuración → Motor de Agentes
            </a>.
        </p></div>
        <?php elseif ( $enabled ) : ?>
        <div class="notice notice-success"><p>Widget ORQO <strong>activo</strong> en tu tienda.</p></div>
        <?php else : ?>
        <div class="notice notice-info"><p>Widget ORQO <strong>desactivado</strong>.</p></div>
        <?php endif; ?>

        <form method="post" action="options.php">
            <?php settings_fields( 'orqo_chat_group' ); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="orqo_api_key">API Key</label></th>
                    <td>
                        <input
                            type="text"
                            id="orqo_api_key"
                            name="orqo_chat_api_key"
                            value="<?php echo esc_attr( $api_key ); ?>"
                            class="regular-text"
                            placeholder="orqo_live_..."
                        />
                        <p class="description">
                            Tu API Key de workspace. Se muestra una sola vez al provisionar en el dashboard.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Estado</th>
                    <td>
                        <label>
                            <input
                                type="checkbox"
                                name="orqo_chat_enabled"
                                value="1"
                                <?php checked( $enabled, true ); ?>
                            />
                            Mostrar widget en la tienda
                        </label>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Guardar configuración' ); ?>
        </form>

        <?php if ( ! empty( $api_key ) ) : ?>
        <hr/>
        <h2>Vista previa del snippet</h2>
        <p>Este es el código que el plugin inyecta automáticamente en el footer de tu sitio:</p>
        <code style="display:block;background:#f0f0f0;padding:12px;border-radius:6px;">
            &lt;script src="<?php echo esc_url( ORQO_CHAT_WIDGET_URL ); ?>"
            data-key="<?php echo esc_attr( $api_key ); ?>" async&gt;&lt;/script&gt;
        </code>
        <?php endif; ?>
    </div>
    <?php
}

// ── Frontend: inyectar widget ──────────────────────────────────────────────────

add_action( 'wp_footer', function () {
    $api_key = get_option( 'orqo_chat_api_key', '' );
    $enabled = get_option( 'orqo_chat_enabled', true );

    if ( empty( $api_key ) || ! $enabled ) {
        return;
    }

    printf(
        '<script src="%s" data-key="%s" async></script>' . "\n",
        esc_url( ORQO_CHAT_WIDGET_URL ),
        esc_attr( $api_key )
    );
} );

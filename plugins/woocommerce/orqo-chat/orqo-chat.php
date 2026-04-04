<?php
/**
 * Plugin Name: ORQO Chat
 * Plugin URI:  https://orqo.io
 * Description: Agente de IA para tu sitio WordPress — conecta el chat de ORQO y, opcionalmente, WooCommerce como fuente de datos.
 * Version:     2.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author:      Bacata Digital Media
 * Author URI:  https://orqo.io
 * License:     GPL-2.0+
 * Text Domain: orqo-chat
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'ORQO_VERSION',       '2.0.0' );
define( 'ORQO_WIDGET_SCRIPT', 'https://dashboard.orqo.io/widget.js' );
define( 'ORQO_DASHBOARD_URL', 'https://dashboard.orqo.io' );
define( 'ORQO_CONNECT_URL',   ORQO_DASHBOARD_URL . '/api/plugin/connect' );
define( 'ORQO_MCP_WC_URL',    ORQO_DASHBOARD_URL . '/api/plugin/mcp/woocommerce' );

// ── Activation / Deactivation ──────────────────────────────────────────────────

register_activation_hook( __FILE__, 'orqo_activate' );
function orqo_activate() {
    add_option( 'orqo_site_key',       '' );
    add_option( 'orqo_enabled',        true );
    add_option( 'orqo_wc_enabled',     false );
    add_option( 'orqo_wc_url',         '' );
    add_option( 'orqo_wc_key',         '' );
    add_option( 'orqo_wc_secret',      '' );
    add_option( 'orqo_cached_api_key', '' );
    add_option( 'orqo_cached_config',  '' );
}

register_deactivation_hook( __FILE__, 'orqo_deactivate' );
function orqo_deactivate() {
    delete_transient( 'orqo_connect_cache' );
    delete_transient( 'orqo_api_key_cache' );
}

// ── Admin menu ─────────────────────────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page(
        'ORQO Chat',
        'ORQO Chat',
        'manage_options',
        'orqo-chat',
        'orqo_settings_page'
    );
} );

add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( $hook !== 'settings_page_orqo-chat' ) return;
    wp_add_inline_style( 'wp-admin', orqo_admin_css() );
} );

// ── Settings registration ──────────────────────────────────────────────────────

add_action( 'admin_init', function () {
    foreach ( [ 'orqo_site_key', 'orqo_enabled', 'orqo_wc_enabled', 'orqo_wc_url', 'orqo_wc_key', 'orqo_wc_secret' ] as $opt ) {
        register_setting( 'orqo_group', $opt, [ 'sanitize_callback' => 'sanitize_text_field' ] );
    }
    register_setting( 'orqo_group', 'orqo_enabled',    [ 'sanitize_callback' => 'rest_sanitize_boolean' ] );
    register_setting( 'orqo_group', 'orqo_wc_enabled', [ 'sanitize_callback' => 'rest_sanitize_boolean' ] );
} );

// When site_key changes, refresh connection cache
add_action( 'update_option_orqo_site_key', function ( $old, $new ) {
    delete_transient( 'orqo_connect_cache' );
    delete_transient( 'orqo_api_key_cache' );
    if ( ! empty( $new ) ) {
        orqo_refresh_connection( $new );
    } else {
        update_option( 'orqo_cached_api_key', '' );
        update_option( 'orqo_cached_config',  '' );
    }
}, 10, 2 );

// ── AJAX handlers ──────────────────────────────────────────────────────────────

add_action( 'wp_ajax_orqo_test_connection', function () {
    check_ajax_referer( 'orqo_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Forbidden', 403 );

    $site_key = sanitize_text_field( $_POST['site_key'] ?? '' );
    $result   = orqo_call_connect( $site_key );

    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }

    update_option( 'orqo_cached_api_key', $result['apiKey'] ?? '' );
    update_option( 'orqo_cached_config',  wp_json_encode( $result['widget'] ?? [] ) );

    wp_send_json_success( [
        'workspaceId' => $result['workspaceId'] ?? '',
        'widget'      => $result['widget'] ?? [],
    ] );
} );

add_action( 'wp_ajax_orqo_sync_woocommerce', function () {
    check_ajax_referer( 'orqo_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Forbidden', 403 );

    $site_key  = get_option( 'orqo_site_key', '' );
    $wc_url    = sanitize_text_field( $_POST['wc_url']    ?? get_option( 'orqo_wc_url',    '' ) );
    $wc_key    = sanitize_text_field( $_POST['wc_key']    ?? get_option( 'orqo_wc_key',    '' ) );
    $wc_secret = sanitize_text_field( $_POST['wc_secret'] ?? get_option( 'orqo_wc_secret', '' ) );

    $response = wp_remote_post( ORQO_MCP_WC_URL, [
        'timeout'     => 15,
        'headers'     => [ 'Content-Type' => 'application/json' ],
        'body'        => wp_json_encode( [
            'site_key'  => $site_key,
            'wc_url'    => $wc_url,
            'wc_key'    => $wc_key,
            'wc_secret' => $wc_secret,
        ] ),
    ] );

    if ( is_wp_error( $response ) ) {
        wp_send_json_error( $response->get_error_message() );
    }

    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    $code = wp_remote_retrieve_response_code( $response );

    if ( $code >= 300 || ! ( $body['ok'] ?? false ) ) {
        wp_send_json_error( $body['error'] ?? "HTTP {$code}" );
    }

    wp_send_json_success( [ 'mcpId' => $body['mcpId'] ?? '' ] );
} );

add_action( 'wp_ajax_orqo_remove_woocommerce', function () {
    check_ajax_referer( 'orqo_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Forbidden', 403 );

    $site_key = get_option( 'orqo_site_key', '' );

    $response = wp_remote_request( ORQO_MCP_WC_URL, [
        'method'  => 'DELETE',
        'timeout' => 15,
        'headers' => [ 'Content-Type' => 'application/json' ],
        'body'    => wp_json_encode( [ 'site_key' => $site_key ] ),
    ] );

    if ( is_wp_error( $response ) ) {
        wp_send_json_error( $response->get_error_message() );
    }

    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    $code = wp_remote_retrieve_response_code( $response );

    if ( $code >= 300 ) {
        wp_send_json_error( $body['error'] ?? "HTTP {$code}" );
    }

    wp_send_json_success();
} );

// ── Helper: call connect endpoint ─────────────────────────────────────────────

function orqo_call_connect( string $site_key ) {
    if ( empty( $site_key ) ) return new WP_Error( 'missing_key', 'Site Key vacía' );

    $url      = add_query_arg( 'site_key', rawurlencode( $site_key ), ORQO_CONNECT_URL );
    $response = wp_remote_get( $url, [ 'timeout' => 10 ] );

    if ( is_wp_error( $response ) ) return $response;

    $code = wp_remote_retrieve_response_code( $response );
    $body = json_decode( wp_remote_retrieve_body( $response ), true );

    if ( $code !== 200 ) {
        return new WP_Error( 'connect_failed', $body['error'] ?? "HTTP {$code}" );
    }

    return $body;
}

function orqo_refresh_connection( string $site_key ) {
    $result = orqo_call_connect( $site_key );
    if ( ! is_wp_error( $result ) ) {
        update_option( 'orqo_cached_api_key', $result['apiKey'] ?? '' );
        update_option( 'orqo_cached_config',  wp_json_encode( $result['widget'] ?? [] ) );
    }
}

// ── Frontend: inject widget ────────────────────────────────────────────────────

add_action( 'wp_head', 'orqo_inject_widget', 100 );
add_action( 'wp_footer', 'orqo_inject_widget', 100 );

$orqo_widget_injected = false;

function orqo_inject_widget() {
    global $orqo_widget_injected;
    if ( $orqo_widget_injected ) return;

    if ( ! get_option( 'orqo_enabled', true ) ) return;

    $api_key  = get_option( 'orqo_cached_api_key', '' );
    $site_key = get_option( 'orqo_site_key', '' );

    if ( empty( $api_key ) ) {
        if ( empty( $site_key ) ) return;

        // Use a short transient so we don't hit the API on every pageview
        $cached = get_transient( 'orqo_api_key_cache' );
        if ( $cached !== false ) {
            $api_key = $cached;
        } else {
            $result = orqo_call_connect( $site_key );
            if ( is_wp_error( $result ) ) return;
            $api_key = $result['apiKey'] ?? '';
            if ( empty( $api_key ) ) return;
            update_option( 'orqo_cached_api_key', $api_key );
            update_option( 'orqo_cached_config',  wp_json_encode( $result['widget'] ?? [] ) );
            set_transient( 'orqo_api_key_cache', $api_key, HOUR_IN_SECONDS );
        }
    }

    if ( empty( $api_key ) ) return;

    // WooCommerce context passing
    $context_script = '';
    if ( function_exists( 'is_product' ) && is_product() ) {
        global $post;
        $product = wc_get_product( $post->ID );
        if ( $product ) {
            $ctx = wp_json_encode( [
                'page'        => 'product',
                'productId'   => (string) $product->get_id(),
                'productName' => $product->get_name(),
                'price'       => $product->get_price(),
                'sku'         => $product->get_sku(),
                'inStock'     => $product->is_in_stock(),
                'url'         => get_permalink( $post->ID ),
            ] );
            $context_script = "<script>window.__orqoContext=" . $ctx . ";</script>\n";
        }
    } elseif ( function_exists( 'is_cart' ) && is_cart() ) {
        $context_script = "<script>window.__orqoContext={\"page\":\"cart\"};</script>\n";
    } elseif ( function_exists( 'is_checkout' ) && is_checkout() ) {
        $context_script = "<script>window.__orqoContext={\"page\":\"checkout\"};</script>\n";
    }

    echo $context_script;
    printf(
        '<script src="%s" data-key="%s" async></script>' . "\n",
        esc_url( ORQO_WIDGET_SCRIPT ),
        esc_attr( $api_key )
    );
    $orqo_widget_injected = true;
}

// ── Shortcode [orqo_chat] ──────────────────────────────────────────────────────

add_shortcode( 'orqo_chat', function ( $atts ) {
    $atts = shortcode_atts( [ 'inline' => 'false' ], $atts, 'orqo_chat' );
    $api_key = get_option( 'orqo_cached_api_key', '' );
    if ( empty( $api_key ) || ! get_option( 'orqo_enabled', true ) ) return '';

    if ( filter_var( $atts['inline'], FILTER_VALIDATE_BOOLEAN ) ) {
        return sprintf(
            '<div class="orqo-inline-widget"><script src="%s" data-key="%s" data-mode="inline" async></script></div>',
            esc_url( ORQO_WIDGET_SCRIPT ),
            esc_attr( $api_key )
        );
    }

    // Default: trigger bubble open on click
    return sprintf(
        '<button onclick="window.orqo&&orqo(\'open\')" style="background:#2CB978;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;">
            💬 Hablar con el agente
        </button>
        <script src="%s" data-key="%s" async></script>',
        esc_url( ORQO_WIDGET_SCRIPT ),
        esc_attr( $api_key )
    );
} );

// ── Gutenberg block (PHP render) ───────────────────────────────────────────────

add_action( 'init', function () {
    if ( ! function_exists( 'register_block_type' ) ) return;

    register_block_type( 'orqo-chat/widget', [
        'editor_script'   => 'orqo-chat-block-editor',
        'render_callback' => function ( $attrs ) {
            $api_key = get_option( 'orqo_cached_api_key', '' );
            if ( empty( $api_key ) || ! get_option( 'orqo_enabled', true ) ) return '';

            $mode = sanitize_text_field( $attrs['mode'] ?? 'bubble' );

            if ( $mode === 'inline' ) {
                return sprintf(
                    '<div class="orqo-block-inline"><script src="%s" data-key="%s" data-mode="inline" async></script></div>',
                    esc_url( ORQO_WIDGET_SCRIPT ),
                    esc_attr( $api_key )
                );
            }

            return sprintf(
                '<button onclick="window.orqo&&orqo(\'open\')" class="orqo-block-btn">💬 Hablar con el agente</button>
                 <script src="%s" data-key="%s" async></script>',
                esc_url( ORQO_WIDGET_SCRIPT ),
                esc_attr( $api_key )
            );
        },
        'attributes' => [
            'mode' => [ 'type' => 'string', 'default' => 'bubble' ],
        ],
    ] );

    wp_register_script(
        'orqo-chat-block-editor',
        plugins_url( 'blocks/orqo-chat/index.js', __FILE__ ),
        [ 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components' ],
        ORQO_VERSION,
        true
    );
} );

// ── Admin settings page ────────────────────────────────────────────────────────

function orqo_settings_page() {
    $site_key   = get_option( 'orqo_site_key',       '' );
    $enabled    = get_option( 'orqo_enabled',         true );
    $wc_enabled = get_option( 'orqo_wc_enabled',      false );
    $wc_url     = get_option( 'orqo_wc_url',          '' );
    $wc_key     = get_option( 'orqo_wc_key',          '' );
    $wc_secret  = get_option( 'orqo_wc_secret',       '' );
    $cached_key = get_option( 'orqo_cached_api_key',  '' );
    $has_wc     = class_exists( 'WooCommerce' );
    $nonce      = wp_create_nonce( 'orqo_nonce' );
    ?>
    <div class="wrap orqo-wrap">
        <h1 class="orqo-logo">
            <span class="orqo-green">ORQO</span> Chat
            <span class="orqo-version">v<?php echo ORQO_VERSION; ?></span>
        </h1>

        <?php if ( empty( $site_key ) ) : ?>
        <div class="notice notice-warning inline"><p>
            Ingresa tu <strong>Site Key</strong> para activar el widget. Genérala en
            <a href="<?php echo esc_url( ORQO_DASHBOARD_URL . '/dashboard/settings/integrations' ); ?>" target="_blank">
                dashboard.orqo.io → Configuración → Integraciones → WordPress
            </a>.
        </p></div>
        <?php elseif ( $cached_key ) : ?>
        <div class="notice notice-success inline"><p>
            ✓ Conectado. Widget <strong><?php echo $enabled ? 'activo' : 'desactivado'; ?></strong> en tu sitio.
        </p></div>
        <?php else : ?>
        <div class="notice notice-warning inline"><p>
            Site Key configurada pero sin conexión verificada. Haz clic en <strong>Verificar conexión</strong>.
        </p></div>
        <?php endif; ?>

        <form method="post" action="options.php" id="orqo-form">
            <?php settings_fields( 'orqo_group' ); ?>

            <!-- ── Conexión ── -->
            <div class="orqo-card">
                <h2>Conexión ORQO</h2>
                <table class="form-table">
                    <tr>
                        <th><label for="orqo_site_key_input">Site Key</label></th>
                        <td>
                            <input
                                type="password"
                                id="orqo_site_key_input"
                                name="orqo_site_key"
                                value="<?php echo esc_attr( $site_key ); ?>"
                                class="regular-text"
                                autocomplete="new-password"
                                placeholder="orqo_sk_…"
                            />
                            <button type="button" id="orqo-test-btn" class="button button-secondary orqo-test-btn" style="margin-left:8px;">
                                Verificar conexión
                            </button>
                            <div id="orqo-test-result" class="orqo-test-result"></div>
                            <p class="description">
                                Genera tu Site Key en
                                <a href="<?php echo esc_url( ORQO_DASHBOARD_URL . '/dashboard/settings/integrations' ); ?>" target="_blank">
                                    dashboard.orqo.io → Integraciones → WordPress
                                </a>.
                                Es diferente a la API Key del workspace.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th>Widget</th>
                        <td>
                            <label>
                                <input type="checkbox" name="orqo_enabled" value="1" <?php checked( $enabled ); ?> />
                                Mostrar widget flotante en todas las páginas
                            </label>
                            <p class="description">Desactívalo si solo quieres usar el shortcode <code>[orqo_chat]</code> o el bloque de Gutenberg.</p>
                        </td>
                    </tr>
                </table>
            </div>

            <?php if ( $has_wc ) : ?>
            <!-- ── WooCommerce ── -->
            <div class="orqo-card">
                <h2>
                    WooCommerce
                    <span class="orqo-badge-wc">WooCommerce detectado</span>
                </h2>
                <p class="description" style="margin-bottom:12px;">
                    Conecta tu tienda como fuente de datos para que el agente pueda consultar productos, pedidos y clientes en tiempo real.
                </p>
                <table class="form-table">
                    <tr>
                        <th>Habilitar integración</th>
                        <td>
                            <label>
                                <input type="checkbox" name="orqo_wc_enabled" value="1" id="orqo-wc-toggle" <?php checked( $wc_enabled ); ?> />
                                Conectar datos de WooCommerce al agente ORQO
                            </label>
                        </td>
                    </tr>
                    <tr id="orqo-wc-fields" <?php echo $wc_enabled ? '' : 'style="display:none"'; ?>>
                        <th><label>URL de tu tienda</label></th>
                        <td>
                            <input type="text" name="orqo_wc_url" value="<?php echo esc_attr( $wc_url ?: get_site_url() ); ?>" class="regular-text" placeholder="https://mitienda.com" />
                            <p class="description">La URL base de WordPress (sin /wp-json/).</p>
                        </td>
                    </tr>
                    <tr id="orqo-wc-fields-2" <?php echo $wc_enabled ? '' : 'style="display:none"'; ?>>
                        <th><label>Consumer Key</label></th>
                        <td>
                            <input type="password" name="orqo_wc_key" value="<?php echo esc_attr( $wc_key ); ?>" class="regular-text" autocomplete="new-password" placeholder="ck_..." />
                            <p class="description">
                                Genera en WooCommerce → Ajustes → Avanzado → REST API → Agregar clave.
                                Permiso: <strong>Solo lectura</strong>.
                            </p>
                        </td>
                    </tr>
                    <tr id="orqo-wc-fields-3" <?php echo $wc_enabled ? '' : 'style="display:none"'; ?>>
                        <th><label>Consumer Secret</label></th>
                        <td>
                            <input type="password" name="orqo_wc_secret" value="<?php echo esc_attr( $wc_secret ); ?>" class="regular-text" autocomplete="new-password" placeholder="cs_..." />
                        </td>
                    </tr>
                    <tr id="orqo-wc-actions" <?php echo $wc_enabled ? '' : 'style="display:none"'; ?>>
                        <th></th>
                        <td>
                            <button type="button" id="orqo-wc-sync-btn" class="button button-primary">
                                Sincronizar con ORQO
                            </button>
                            <button type="button" id="orqo-wc-remove-btn" class="button button-secondary" style="margin-left:6px;color:#b32d2e;">
                                Desconectar
                            </button>
                            <div id="orqo-wc-result" class="orqo-test-result"></div>
                        </td>
                    </tr>
                </table>
            </div>
            <?php else : ?>
            <div class="orqo-card orqo-card-muted">
                <h2>WooCommerce</h2>
                <p>Instala y activa WooCommerce para conectar tu tienda como fuente de datos del agente.</p>
            </div>
            <?php endif; ?>

            <?php submit_button( 'Guardar configuración' ); ?>
        </form>

        <!-- ── Snippet preview ── -->
        <?php if ( $cached_key ) : ?>
        <div class="orqo-card">
            <h2>Código generado</h2>
            <p class="description">Este snippet se inyecta automáticamente. También puedes usarlo manualmente:</p>
            <code class="orqo-snippet">
                &lt;script src="<?php echo esc_url( ORQO_WIDGET_SCRIPT ); ?>"
                data-key="<?php echo esc_attr( $cached_key ); ?>" async&gt;&lt;/script&gt;
            </code>
            <p class="description">Shortcode: <code>[orqo_chat]</code> — inserta el botón de chat en cualquier página.</p>
        </div>
        <?php endif; ?>
    </div>

    <script>
    (function($){
        const nonce = <?php echo wp_json_encode( $nonce ); ?>;

        // Toggle WooCommerce fields
        $('#orqo-wc-toggle').on('change', function(){
            const show = this.checked;
            $('#orqo-wc-fields, #orqo-wc-fields-2, #orqo-wc-fields-3, #orqo-wc-actions').toggle(show);
        });

        // Test connection
        $('#orqo-test-btn').on('click', function(){
            const btn = $(this);
            const key = $('#orqo_site_key_input').val();
            const res = $('#orqo-test-result');

            btn.prop('disabled', true).text('Verificando…');
            res.removeClass('orqo-ok orqo-err').text('');

            $.post(ajaxurl, { action: 'orqo_test_connection', nonce, site_key: key }, function(data){
                if(data.success){
                    res.addClass('orqo-ok').text('✓ Conectado — workspace: ' + (data.data.workspaceId || 'OK'));
                } else {
                    res.addClass('orqo-err').text('✗ ' + (data.data || 'Error desconocido'));
                }
            }).always(function(){ btn.prop('disabled', false).text('Verificar conexión'); });
        });

        // Sync WooCommerce
        $('#orqo-wc-sync-btn').on('click', function(){
            const btn = $(this);
            const res = $('#orqo-wc-result');
            btn.prop('disabled', true).text('Sincronizando…');
            res.removeClass('orqo-ok orqo-err').text('');

            $.post(ajaxurl, {
                action:    'orqo_sync_woocommerce',
                nonce,
                wc_url:    $('[name="orqo_wc_url"]').val(),
                wc_key:    $('[name="orqo_wc_key"]').val(),
                wc_secret: $('[name="orqo_wc_secret"]').val(),
            }, function(data){
                if(data.success){
                    res.addClass('orqo-ok').text('✓ WooCommerce conectado al agente');
                } else {
                    res.addClass('orqo-err').text('✗ ' + (data.data || 'Error'));
                }
            }).always(function(){ btn.prop('disabled', false).text('Sincronizar con ORQO'); });
        });

        // Remove WooCommerce
        $('#orqo-wc-remove-btn').on('click', function(){
            if(!confirm('¿Desconectar WooCommerce de ORQO?')) return;
            const btn = $(this);
            const res = $('#orqo-wc-result');
            btn.prop('disabled', true).text('Desconectando…');

            $.post(ajaxurl, { action: 'orqo_remove_woocommerce', nonce }, function(data){
                if(data.success){
                    res.addClass('orqo-ok').text('✓ WooCommerce desconectado');
                } else {
                    res.addClass('orqo-err').text('✗ ' + (data.data || 'Error'));
                }
            }).always(function(){ btn.prop('disabled', false).text('Desconectar'); });
        });
    })(jQuery);
    </script>
    <?php
}

// ── Admin CSS ──────────────────────────────────────────────────────────────────

function orqo_admin_css() {
    return '
    .orqo-wrap { max-width: 780px; }
    .orqo-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .orqo-green { color: #2CB978; }
    .orqo-version { font-size: 11px; font-weight: 400; color: #888; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; }
    .orqo-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; }
    .orqo-card h2 { margin-top: 0; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .orqo-card-muted { background: #fafafa; color: #888; }
    .orqo-badge-wc { font-size: 11px; font-weight: 500; background: #7f54b3; color: #fff; border-radius: 4px; padding: 2px 8px; }
    .orqo-test-btn { vertical-align: middle; }
    .orqo-test-result { margin-top: 6px; font-size: 13px; }
    .orqo-ok { color: #2CB978; font-weight: 600; }
    .orqo-err { color: #b32d2e; font-weight: 600; }
    .orqo-snippet { display: block; background: #f6f6f6; padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin: 8px 0; }
    ';
}

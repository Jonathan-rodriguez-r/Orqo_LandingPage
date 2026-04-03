<?php
/**
 * ORQO Chat — Módulo PrestaShop
 * Compatible con PrestaShop 1.7.x y 8.x
 */

if ( ! defined( '_PS_VERSION_' ) ) {
    exit;
}

class Orqo extends Module {

    const WIDGET_URL = 'https://dashboard.orqo.io/widget.js';

    public function __construct() {
        $this->name         = 'orqo';
        $this->tab          = 'front_office_features';
        $this->version      = '1.0.0';
        $this->author       = 'Bacata Digital Media';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = [
            'min' => '1.7.0.0',
            'max' => _PS_VERSION_,
        ];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l( 'ORQO Chat' );
        $this->description = $this->l( 'Agente de IA para WhatsApp, Instagram y chat web — conecta tus clientes en minutos.' );
    }

    // ── Instalación / desinstalación ──────────────────────────────────────────

    public function install() {
        return parent::install()
            && $this->registerHook( 'displayFooter' )
            && Configuration::updateValue( 'ORQO_API_KEY', '' )
            && Configuration::updateValue( 'ORQO_ENABLED', 1 );
    }

    public function uninstall() {
        Configuration::deleteByName( 'ORQO_API_KEY' );
        Configuration::deleteByName( 'ORQO_ENABLED' );
        return parent::uninstall();
    }

    // ── Página de configuración ───────────────────────────────────────────────

    public function getContent() {
        $output = '';

        if ( Tools::isSubmit( 'submitOrqoConfig' ) ) {
            $api_key = trim( Tools::getValue( 'ORQO_API_KEY' ) );
            $enabled = (int) Tools::getValue( 'ORQO_ENABLED' );

            Configuration::updateValue( 'ORQO_API_KEY', $api_key );
            Configuration::updateValue( 'ORQO_ENABLED', $enabled );

            $output .= $this->displayConfirmation( $this->l( 'Configuración guardada.' ) );
        }

        $api_key = Configuration::get( 'ORQO_API_KEY' );
        $enabled = (int) Configuration::get( 'ORQO_ENABLED' );

        if ( empty( $api_key ) ) {
            $output .= $this->displayWarning(
                $this->l( 'Ingresa tu API Key para activar el widget. Encuéntrala en dashboard.orqo.io → Configuración → Motor de Agentes.' )
            );
        }

        $output .= '
        <div class="panel">
            <div class="panel-heading">
                <i class="icon-cogs"></i> ' . $this->l( 'Configuración de ORQO Chat' ) . '
            </div>
            <form action="' . esc_html( AdminController::$currentIndex ) . '&configure=' . $this->name . '&token=' . Tools::getAdminTokenLite( 'AdminModules' ) . '" method="post">
                <div class="form-group">
                    <label for="ORQO_API_KEY">' . $this->l( 'API Key' ) . '</label>
                    <input type="text" name="ORQO_API_KEY" id="ORQO_API_KEY"
                        class="form-control" value="' . htmlspecialchars( $api_key, ENT_QUOTES ) . '"
                        placeholder="orqo_live_..." />
                    <p class="help-block">' . $this->l( 'Tu API Key de workspace de ORQO.' ) . '</p>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="ORQO_ENABLED" value="1" ' . ( $enabled ? 'checked' : '' ) . ' />
                        ' . $this->l( 'Activar widget en la tienda' ) . '
                    </label>
                </div>
                <button type="submit" name="submitOrqoConfig" class="btn btn-default pull-right">
                    <i class="process-icon-save"></i> ' . $this->l( 'Guardar' ) . '
                </button>
            </form>
        </div>';

        if ( ! empty( $api_key ) ) {
            $output .= '
            <div class="panel">
                <div class="panel-heading">' . $this->l( 'Snippet generado' ) . '</div>
                <code>&lt;script src="' . self::WIDGET_URL . '" data-key="' . htmlspecialchars( $api_key, ENT_QUOTES ) . '" async&gt;&lt;/script&gt;</code>
            </div>';
        }

        return $output;
    }

    // ── Hook frontend ─────────────────────────────────────────────────────────

    public function hookDisplayFooter( $params ) {
        $api_key = Configuration::get( 'ORQO_API_KEY' );
        $enabled = (int) Configuration::get( 'ORQO_ENABLED' );

        if ( empty( $api_key ) || ! $enabled ) {
            return '';
        }

        return '<script src="' . self::WIDGET_URL . '" data-key="'
            . htmlspecialchars( $api_key, ENT_QUOTES ) . '" async></script>';
    }
}

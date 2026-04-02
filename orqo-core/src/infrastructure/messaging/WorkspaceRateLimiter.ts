/**
 * Rate limiter por workspace con ventana deslizante de 60 segundos.
 * En memoria — se reinicia al reiniciar el proceso (suficiente para protección básica).
 *
 * Si se necesita distribución entre instancias, reemplazar por una implementación
 * Redis o MongoDB con TTL.
 */
export class WorkspaceRateLimiter {
  /** Map<workspaceId, timestamps de mensajes en el último minuto> */
  private readonly windows = new Map<string, number[]>();
  private readonly windowMs: number;

  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }

  /**
   * Registra un intento de procesamiento.
   * @returns true si está dentro del límite, false si lo supera.
   */
  allow(workspaceId: string, limitPerWindow: number): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Obtener o crear ventana
    let timestamps = this.windows.get(workspaceId);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(workspaceId, timestamps);
    }

    // Eliminar timestamps fuera de la ventana
    while (timestamps.length > 0 && (timestamps[0] ?? 0) < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= limitPerWindow) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /** Limpia entradas inactivas — llamar periódicamente para evitar memory leaks. */
  evict(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [id, timestamps] of this.windows.entries()) {
      if (timestamps.every(t => t < cutoff)) {
        this.windows.delete(id);
      }
    }
  }
}

/**
 * Railway-Oriented Programming — Result monad.
 * Evita try/catch en la capa de aplicación y fuerza el manejo explícito de errores.
 *
 * Uso:
 *   const r = someOperation();
 *   if (!r.ok) return Err(r.error);
 *   console.log(r.value);
 */

export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Convierte una promesa en Result (nunca lanza). */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  mapError?: (e: unknown) => Error,
): Promise<Result<T>> {
  try {
    return Ok(await fn());
  } catch (e) {
    const err = mapError
      ? mapError(e)
      : e instanceof Error
        ? e
        : new Error(String(e));
    return Err(err);
  }
}

/**
 * El registro vive aparte del corredor a propósito.
 *
 * Si `check` se exportara desde run-all.js, cada archivo de test importaría el
 * módulo que a su vez los importa a ellos. Con top-level await eso no es un
 * warning: es un bloqueo permanente. Un módulo pequeño y sin efectos rompe el
 * ciclo.
 */
const queue = [];

export function check(name, fn) {
  queue.push({ name, fn });
}

export function pending() {
  return queue;
}

/** node:assert.throws no devuelve el error; a veces necesitamos inspeccionarlo. */
export function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba una excepción y no se lanzó ninguna');
}
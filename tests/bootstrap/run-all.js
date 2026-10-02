/**
 * Corredor mínimo para los tests de arranque.
 *
 * No usa el framework a propósito: un array, un bucle y un `try/catch`. Si esto
 * te parece poco, fíjate en que es exactamente el núcleo de lo que hace
 * src/runner.js — el resto son hooks, timeouts, reporters y cobertura.
 */
import { pending } from './harness.js';

const FILES = ['./assert.test.js', './runner.test.js', './spy.test.js'];

// Secuencial a propósito: cada archivo registra sus checks vía `pending()` y
// queremos que queden en el mismo orden que FILES, no en el orden en que el
// disco termine de leer cada uno.
for (const file of FILES) {
  await import(file); // NOSONAR
}

const queue = pending();
let failed = 0;
const started = performance.now();

// Secuencial a propósito: correr los checks en paralelo mezclaría su salida
// por consola y, si comparten estado, uno podría contaminar a otro.
for (const { name, fn } of queue) {
  try {
    await fn(); // NOSONAR
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failed++;
    process.stdout.write(`  ✗ ${name}\n`);
    process.stdout.write(`      ${error.message}\n`);
    if (error.diff) process.stdout.write(`${error.diff}\n`);
  }
}

const duration = (performance.now() - started).toFixed(0);
process.stdout.write(
  `\nBootstrap: ${queue.length - failed}/${queue.length} en ${duration} ms\n\n`
);
process.exit(failed > 0 ? 1 : 0);
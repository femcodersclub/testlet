import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  describe,
  it,
  beforeEach,
  afterEach,
  assert,
  Runner,
  RunSummary,
  CoverageReport,
  FileCoverage,
  ConsoleReporter,
  HtmlReporter,
  JsonReporter,
} from '../../src/index.js';

/**
 * Estos tests montan un Runner aparte, con sus propios tests de mentira, y
 * comprueban qué escriben los reporters. El runner que ejecuta ESTE archivo no
 * se entera de nada: son instancias independientes.
 */
function buildRunner() {
  const runner = new Runner();
  runner.describe('QuotaTracker', () => {
    runner.it('permite la petición cuando queda margen', () => {});
    runner.it('bloquea al superar el límite por minuto', () => {
      assert.deepEqual({ rpm: 12 }, { rpm: 10 });
    });
    runner.it('pendiente de decidir', () => {}, { skip: true });
  });
  return runner;
}

describe('ConsoleReporter', () => {
  let output;
  let runner;

  beforeEach(() => {
    output = [];
    runner = buildRunner();
    runner.addReporter(new ConsoleReporter({ color: false, write: (text) => output.push(text) }));
  });

  it('marca cada test con su símbolo', async () => {
    await runner.run();
    const text = output.join('');

    assert.match(text, /✓ permite la petición cuando queda margen/);
    assert.match(text, /✗ bloquea al superar el límite por minuto/);
    assert.match(text, /○ pendiente de decidir/);
  });

  it('imprime el diff del fallo, no solo el mensaje', async () => {
    await runner.run();
    const text = output.join('');

    assert.match(text, /en rpm/);
    assert.match(text, /esperado: 10/);
    assert.match(text, /recibido: 12/);
  });

  it('cierra con el recuento y sin códigos de color si se desactivan', async () => {
    await runner.run();
    const text = output.join('');

    assert.match(text, /1 pasados/);
    assert.match(text, /1 fallidos/);
    assert.match(text, /1 omitidos/);
    assert.equal(text.includes('\u001b['), false);
  });
});

describe('reporters que escriben a disco', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mini-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('JsonReporter deja un informe parseable con los totales', async () => {
    const outputPath = join(dir, 'results.json');
    const runner = buildRunner().addReporter(new JsonReporter({ outputPath }));
    await runner.run();

    const report = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.deepEqual(report.totals, { total: 3, passed: 1, failed: 1, skipped: 1 });
    assert.equal(report.results[1].status, 'failed');
    assert.equal(report.results[1].error.operator, 'deepEqual');
    assert.deepEqual(report.results[0].suite, ['QuotaTracker']);
  });

  it('HtmlReporter genera un documento autónomo con la paleta de la comunidad', async () => {
    const outputPath = join(dir, 'report.html');
    const runner = buildRunner().addReporter(new HtmlReporter({ outputPath }));
    await runner.run();

    const html = readFileSync(outputPath, 'utf8');
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /--color-primary: #ea4f33/);
    assert.match(html, /QuotaTracker/);
    assert.equal(html.includes('<script src'), false);
  });

  it('escapa el HTML de los nombres de test', async () => {
    const outputPath = join(dir, 'escape.html');
    const runner = new Runner().addReporter(new HtmlReporter({ outputPath }));
    runner.describe('Sanitizado', () => {
      runner.it('elimina <script> del input', () => {});
    });
    await runner.run();

    const html = readFileSync(outputPath, 'utf8');
    assert.match(html, /&lt;script&gt;/);
  });
});

describe('códigos de salida', () => {
  it('devuelve 1 si algo falla y 0 si todo pasa', async () => {
    const conFallo = await buildRunner().run();
    assert.equal(conFallo.exitCode(), 1);

    const limpio = new Runner();
    limpio.describe('todo bien', () => limpio.it('pasa', () => {}));
    assert.equal((await limpio.run()).exitCode(), 0);
  });

  // El caso real (provocar un rechazo sin capturar) vive en tests/bootstrap/:
  // 'unhandledRejection' es un evento del proceso y lo reciben TODOS los
  // listeners, así que aquí ensuciaría también al runner que ejecuta este
  // archivo. Aquí comprobamos solo la regla del código de salida.
  it('un rechazo sin capturar cuenta como fallo aunque los tests pasen', () => {
    const summary = new RunSummary([], 12, [new Error('nadie me captura')]);

    assert.equal(summary.failed, 0);
    assert.equal(summary.exitCode(), 1);
  });
});

describe('informe de cobertura en los reporters', () => {
  const fakeCoverage = () =>
    new CoverageReport([
      new FileCoverage('src/runner.js', 98, 100, [42, 43, 44, 90]),
      new FileCoverage('src/spy.js', 40, 100, []),
    ]);

  it('la consola muestra el total y el detalle por archivo', async () => {
    const output = [];
    const runner = new Runner().addReporter(
      new ConsoleReporter({ color: false, write: (text) => output.push(text) })
    );
    runner.describe('suite', () => runner.it('pasa', () => {}));

    await runner.run({ finalize: (summary) => { summary.coverage = fakeCoverage(); } });
    const text = output.join('');

    assert.match(text, /Cobertura: 69\.0 %/);
    assert.match(text, /src\/runner\.js/);
    assert.match(text, /42-44, 90/, 'las líneas consecutivas se agrupan en rangos');
  });

  it('el JSON incluye la cobertura con las líneas sin cubrir', async () => {
    const outputPath = join(dirFor('json-coverage'), 'results.json');
    const runner = new Runner().addReporter(new JsonReporter({ outputPath }));
    runner.describe('suite', () => runner.it('pasa', () => {}));

    await runner.run({ finalize: (summary) => { summary.coverage = fakeCoverage(); } });
    const report = JSON.parse(readFileSync(outputPath, 'utf8'));

    assert.equal(report.coverage.percentCovered, 69);
    assert.deepEqual(report.coverage.files[0].uncovered, [42, 43, 44, 90]);
  });

  it('el HTML pinta la barra de progreso con el porcentaje real', async () => {
    const outputPath = join(dirFor('html-coverage'), 'report.html');
    const runner = new Runner().addReporter(new HtmlReporter({ outputPath }));
    runner.describe('suite', () => runner.it('pasa', () => {}));

    await runner.run({ finalize: (summary) => { summary.coverage = fakeCoverage(); } });
    const html = readFileSync(outputPath, 'utf8');

    assert.match(html, /Cobertura: 69\.0 %/);
    assert.match(html, /width:69\.0%/);
  });
});

/** Carpeta temporal propia por test, limpiada al terminar el proceso. */
function dirFor(label) {
  const dir = mkdtempSync(join(tmpdir(), `mini-test-${label}-`));
  temporales.push(dir);
  return dir;
}

const temporales = [];
process.on('exit', () => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
});
#!/usr/bin/env node
import { readdirSync, statSync, existsSync, watch } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HELP = `
testlet — runner de tests sin dependencias

  node bin/cli.js [rutas...] [opciones]

Opciones
  --coverage            Mide cobertura real con el perfilador de V8
  --watch               Relanza los tests cuando cambia un archivo
  --reporter=a,b        console (por defecto), html, json
  --html-out=RUTA       Destino del informe HTML   (coverage/report.html)
  --json-out=RUTA       Destino del informe JSON   (coverage/results.json)
  --no-color            Desactiva los colores ANSI
  --help                Muestra esta ayuda
`;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

if (args.watch) {
  startWatchMode(args);
} else {
  process.exit(await runOnce(args));
}

async function runOnce(options) {
  // La cobertura tiene que arrancar ANTES de importar src: V8 solo perfila los
  // scripts que se compilan después de startPreciseCoverage.
  let coverage = null;
  if (options.coverage) {
    const { Coverage } = await import('../src/coverage.js');
    coverage = await new Coverage().start();
  }

  const framework = await import('../src/index.js');
  const runner = framework.resetRunner();

  const files = discover(options.paths);
  if (files.length === 0) {
    process.stderr.write(`No se han encontrado archivos *.test.js en: ${options.paths.join(', ')}\n`);
    return 1;
  }

  if (options.reporters.includes('console')) {
    runner.addReporter(new framework.ConsoleReporter({ color: options.color }));
  }
  if (options.reporters.includes('html')) {
    runner.addReporter(new framework.HtmlReporter({ outputPath: options.htmlOut }));
  }
  if (options.reporters.includes('json')) {
    runner.addReporter(new framework.JsonReporter({ outputPath: options.jsonOut }));
  }

  // Secuencial a propósito: el orden de registro de cada suite debe coincidir
  // con el orden (ya ordenado) de `files`. Con Promise.all el orden dependería
  // de qué import() termine de leer su archivo primero.
  for (const file of files) {
    await import(pathToFileURL(file).href); // NOSONAR
  }

  // La cobertura se adjunta dentro de `finalize`, justo antes de que los
  // reporters reciban onRunEnd: así el informe se emite una sola vez y ya
  // incluye los porcentajes.
  const summary = await runner.run({
    finalize: async (result) => {
      if (coverage) result.coverage = await coverage.stop();
    },
  });

  return summary.exitCode();
}

function startWatchMode(options) {
  const cliPath = fileURLToPath(import.meta.url);
  const childArgs = process.argv.slice(2).filter((arg) => arg !== '--watch');
  let running = false;
  let queued = false;
  let debounce = null;

  const execute = () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    process.stdout.write('\u001bc'); // limpia la pantalla

    // Cada pasada es un proceso nuevo. El caché de módulos ESM no se puede
    // invalidar, así que reimportar no bastaría: los cambios en src/ se
    // ignorarían silenciosamente.
    const child = spawn(process.execPath, [cliPath, ...childArgs], { stdio: 'inherit' });
    child.on('exit', () => {
      running = false;
      process.stdout.write('\nEsperando cambios... (Ctrl+C para salir)\n');
      if (queued) {
        queued = false;
        execute();
      }
    });
  };

  for (const target of ['src', ...options.paths]) {
    if (!existsSync(target)) continue;
    watch(target, { recursive: true }, (_event, filename) => {
      if (filename && extname(filename) !== '.js') return;
      clearTimeout(debounce);
      debounce = setTimeout(execute, 80);
    });
  }

  execute();
}

/** Recorre las rutas dadas y devuelve todos los *.test.js que encuentre. */
function discover(paths) {
  const found = [];

  const visit = (target) => {
    if (!existsSync(target)) return;
    const stats = statSync(target);

    if (stats.isFile()) {
      if (target.endsWith('.test.js')) found.push(resolve(target));
      return;
    }

    for (const entry of readdirSync(target)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      visit(join(target, entry));
    }
  };

  paths.forEach(visit);
  return found.sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv) {
  const options = {
    paths: [],
    coverage: false,
    watch: false,
    help: false,
    color: !process.env.NO_COLOR,
    reporters: ['console'],
    htmlOut: 'coverage/report.html',
    jsonOut: 'coverage/results.json',
  };

  for (const arg of argv) {
    if (arg === '--coverage') options.coverage = true;
    else if (arg === '--watch') options.watch = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--no-color') options.color = false;
    else if (arg.startsWith('--reporter=')) options.reporters = arg.split('=')[1].split(',');
    else if (arg.startsWith('--html-out=')) options.htmlOut = arg.split('=')[1];
    else if (arg.startsWith('--json-out=')) options.jsonOut = arg.split('=')[1];
    else if (!arg.startsWith('-')) options.paths.push(arg);
  }

  if (options.paths.length === 0) options.paths = ['tests'];
  return options;
}
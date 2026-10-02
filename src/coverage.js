import { Session } from 'node:inspector';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

/**
 * Cobertura real, no simulada.
 *
 * V8 ya sabe qué partes de tu código se han ejecutado: es lo que usa para
 * optimizar. El protocolo del inspector nos deja preguntárselo con
 * Profiler.takePreciseCoverage(). No contamos líneas a ojo: leemos rangos de
 * bytes con su contador de ejecuciones y los traducimos a líneas.
 */

export class FileCoverage {
  constructor(path, coveredLines, totalLines, uncovered) {
    this.path = path;
    this.coveredLines = coveredLines;
    this.totalLines = totalLines;
    this.uncovered = uncovered;
  }

  get percent() {
    return this.totalLines === 0 ? 100 : (this.coveredLines / this.totalLines) * 100;
  }
}

export class CoverageReport {
  constructor(files) {
    this.files = files;
  }

  get percentCovered() {
    const total = this.files.reduce((sum, file) => sum + file.totalLines, 0);
    const covered = this.files.reduce((sum, file) => sum + file.coveredLines, 0);
    return total === 0 ? 100 : (covered / total) * 100;
  }

  uncoveredLines(path) {
    return this.files.find((file) => file.path === path)?.uncovered ?? [];
  }
}

export class Coverage {
  constructor({ include = ['/src/'], exclude = ['/node_modules/', '/coverage.js'] } = {}) {
    this.include = include;
    this.exclude = exclude;
    this.session = null;
  }

  async start() {
    this.session = new Session();
    this.session.connect();
    await this.post('Profiler.enable');
    await this.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    return this;
  }

  async stop() {
    if (!this.session) return new CoverageReport([]);
    const { result } = await this.post('Profiler.takePreciseCoverage');
    await this.post('Profiler.stopPreciseCoverage');
    this.session.disconnect();
    this.session = null;

    const files = result
      .filter((script) => this.isUserFile(script.url))
      .map((script) => this.toFileCoverage(script))
      .filter(Boolean)
      .sort((a, b) => a.path.localeCompare(b.path));

    return new CoverageReport(files);
  }

  isUserFile(url) {
    if (!url.startsWith('file://')) return false;
    if (this.exclude.some((pattern) => url.includes(pattern))) return false;
    return this.include.some((pattern) => url.includes(pattern));
  }

  toFileCoverage(script) {
    let source;
    const path = fileURLToPath(script.url);
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      return null;
    }

    // Contador de ejecuciones por carácter. Los rangos vienen anidados:
    // aplicamos primero los externos y dejamos que los internos los pisen.
    const counts = new Int32Array(source.length);
    const ranges = script.functions
      .flatMap((fn) => fn.ranges)
      .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);

    for (const range of ranges) {
      const end = Math.min(range.endOffset, source.length);
      counts.fill(range.count, range.startOffset, end);
    }

    const lines = source.split('\n');
    const uncovered = [];
    let covered = 0;
    let countable = 0;
    let offset = 0;

    lines.forEach((line, index) => {
      const start = offset;
      offset += line.length + 1;

      if (!isCountable(line)) return;
      countable++;

      let lineCovered = false;
      for (let i = start; i < start + line.length; i++) {
        if (source[i].trim() && counts[i] > 0) {
          lineCovered = true;
          break;
        }
      }

      if (lineCovered) covered++;
      else uncovered.push(index + 1);
    });

    return new FileCoverage(relative(process.cwd(), path), covered, countable, uncovered);
  }

  post(method, params = {}) {
    return new Promise((resolve, reject) => {
      this.session.post(method, params, (error, result) =>
        error ? reject(error) : resolve(result ?? {})
      );
    });
  }
}

/** Líneas en blanco, cierres de bloque y comentarios no cuentan como código. */
function isCountable(line) {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (/^[)\]},;]+$/.test(trimmed)) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  return true;
}
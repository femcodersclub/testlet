const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
};

/**
 * Reporter de consola. Solo depende de la interfaz que llama el runner
 * (onRunStart, onSuiteStart, onTestEnd, onRunEnd): el runner no sabe que existe.
 */
export class ConsoleReporter {
  constructor({ color = process.stdout.isTTY, write = (text) => process.stdout.write(text) } = {}) {
    this.color = color;
    this.write = write;
    this.failures = [];
  }

  paint(text, ...styles) {
    if (!this.color) return text;
    return styles.map((style) => CODES[style]).join('') + text + CODES.reset;
  }

  line(text = '') {
    this.write(`${text}\n`);
  }

  onRunStart({ total }) {
    this.failures = [];
    this.line();
    this.line(this.paint(`Ejecutando ${total} test(s)`, 'bold'));
    this.line();
  }

  onSuiteStart(suite) {
    const indent = '  '.repeat(suite.depth);
    this.line(`${indent}${this.paint(suite.name, 'bold', 'cyan')}`);
  }

  onTestEnd(result) {
    const indent = '  '.repeat((result.test.suite?.depth ?? 0) + 1);
    const duration = result.durationMs >= 1
      ? this.paint(` (${result.durationMs.toFixed(0)} ms)`, 'dim')
      : '';

    if (result.status === 'passed') {
      this.line(`${indent}${this.paint('✓', 'green')} ${result.test.name}${duration}`);
      return;
    }
    if (result.status === 'skipped') {
      this.line(`${indent}${this.paint('○', 'yellow')} ${this.paint(result.test.name, 'dim')}`);
      return;
    }

    this.failures.push(result);
    const index = this.failures.length;
    const marker = this.paint(`(${index})`, 'dim');
    this.line(`${indent}${this.paint('✗', 'red')} ${result.test.name} ${marker}`);
  }

  onRunEnd(summary) {
    if (this.failures.length > 0) {
      this.line();
      this.line(this.paint('Fallos', 'bold', 'red'));
      this.failures.forEach((result, index) => {
        const error = result.error;
        this.line();
        const marker = this.paint(`(${index + 1})`, 'dim');
        this.line(`  ${marker} ${this.paint(result.name, 'bold')}`);
        this.line(`      ${this.paint(error?.message ?? String(error), 'red')}`);
        if (error?.diff) this.line(indentBlock(error.diff, 4));
        const location = firstUserFrame(error);
        if (location) this.line(`      ${this.paint(location, 'dim')}`);
      });
    }

    for (const reason of summary.unhandledRejections) {
      this.line();
      this.line(this.paint(`Promesa rechazada sin capturar: ${reason?.message ?? reason}`, 'magenta'));
    }

    const parts = [
      this.paint(`${summary.passed} pasados`, 'green'),
      summary.failed ? this.paint(`${summary.failed} fallidos`, 'red') : null,
      summary.skipped ? this.paint(`${summary.skipped} omitidos`, 'yellow') : null,
    ].filter(Boolean);

    const durationLabel = this.paint(`en ${summary.durationMs.toFixed(0)} ms`, 'dim');
    this.line();
    this.line(`${parts.join('  ·  ')}  ${durationLabel}`);

    if (summary.coverage) {
      const percent = summary.coverage.percentCovered;
      const style = coverageStyle(percent);
      this.line();
      this.line(this.paint(`Cobertura: ${percent.toFixed(1)} %`, 'bold', style));
      for (const file of summary.coverage.files) {
        const detail = file.uncovered.length
          ? this.paint(` sin cubrir: ${summarizeLines(file.uncovered)}`, 'dim')
          : '';
        this.line(`  ${file.path.padEnd(28)} ${file.percent.toFixed(1).padStart(5)} %${detail}`);
      }
    }

    this.line();
  }
}

function coverageStyle(percent) {
  if (percent >= 80) return 'green';
  if (percent >= 60) return 'yellow';
  return 'red';
}

function indentBlock(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

/**
 * La primera línea del stack que le sirve a quien escribió el test.
 * Sin esto, todos los fallos apuntan a src/assert.js y no al archivo real.
 */
const FRAMEWORK_DIR = new URL('../', import.meta.url).href;

function firstUserFrame(error) {
  if (!error?.stack) return null;

  const frames = error.stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));

  const fromTestFile = frames.find((line) => line.includes('.test.js'));
  const outsideFramework = frames.find((line) => !line.includes(FRAMEWORK_DIR));

  return (fromTestFile ?? outsideFramework)?.replace(/^at\s+/, 'en ');
}

/** [1,2,3,7,8] → '1-3, 7-8' */
function summarizeLines(lines) {
  const ranges = [];
  let start = lines[0];
  let previous = lines[0];

  for (const line of lines.slice(1)) {
    if (line === previous + 1) {
      previous = line;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = line;
    previous = line;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);

  const shown = ranges.slice(0, 5).join(', ');
  return ranges.length > 5 ? `${shown}...` : shown;
}
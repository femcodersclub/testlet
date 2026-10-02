import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reporter HTML. Genera un archivo autónomo, sin CSS ni JS externos:
 * se puede abrir desde el disco o publicar como artefacto de CI.
 */
export class HtmlReporter {
  constructor({ outputPath = 'coverage/report.html', title = 'testlet' } = {}) {
    this.outputPath = outputPath;
    this.title = title;
  }

  onRunEnd(summary) {
    mkdirSync(dirname(this.outputPath), { recursive: true });
    writeFileSync(this.outputPath, this.render(summary), 'utf8');
  }

  render(summary) {
    const status = summary.failed > 0 ? 'con fallos' : 'en verde';
    const grouped = groupBySuite(summary.results);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(this.title)} — informe de tests</title>
<style>
  :root {
    --color-primary: #ea4f33;
    --color-secondary: #4737bb;
    --color-accent: #6c63ff;
    --color-text-dark: #2a2170;
    --color-white: #fdfdfd;
    --color-pass: #1f9d55;
    --color-skip: #b7791f;
    --color-surface: #f4f3fb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1.5rem;
    background: var(--color-white);
    color: var(--color-text-dark);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }
  main { max-width: 60rem; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  .subtitle { color: var(--color-secondary); margin: 0 0 2rem; font-size: .95rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
  .card { background: var(--color-surface); border-radius: .75rem; padding: 1rem 1.25rem; border-left: 4px solid var(--color-accent); }
  .card strong { display: block; font-size: 1.75rem; line-height: 1.1; }
  .card span { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
  .card.pass { border-left-color: var(--color-pass); }
  .card.fail { border-left-color: var(--color-primary); }
  .card.skip { border-left-color: var(--color-skip); }
  h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; color: var(--color-secondary); }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: baseline; gap: .6rem; padding: .4rem .75rem; border-radius: .4rem; }
  li:nth-child(odd) { background: var(--color-surface); }
  .mark { font-weight: 700; width: 1rem; }
  .passed .mark { color: var(--color-pass); }
  .failed .mark { color: var(--color-primary); }
  .skipped .mark, .skipped .name { color: var(--color-skip); }
  .time { margin-left: auto; font-size: .8rem; opacity: .6; }
  pre { background: #201a45; color: #f6f5ff; padding: 1rem; border-radius: .6rem; overflow-x: auto; font-size: .85rem; }
  .bar { height: .6rem; border-radius: 999px; background: var(--color-surface); overflow: hidden; margin: .35rem 0 1rem; }
  .bar > div { height: 100%; background: linear-gradient(90deg, var(--color-accent), var(--color-primary)); }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid var(--color-surface); }
  th { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
  footer { margin-top: 3rem; font-size: .8rem; opacity: .6; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(this.title)}</h1>
  <p class="subtitle">Informe generado el ${new Date().toLocaleString('es-ES')} — ejecución ${status}</p>

  <div class="cards">
    <div class="card pass"><strong>${summary.passed}</strong><span>pasados</span></div>
    <div class="card fail"><strong>${summary.failed}</strong><span>fallidos</span></div>
    <div class="card skip"><strong>${summary.skipped}</strong><span>omitidos</span></div>
    <div class="card"><strong>${summary.durationMs.toFixed(0)}</strong><span>ms</span></div>
  </div>

  ${grouped.map((group) => this.renderGroup(group)).join('\n')}
  ${this.renderFailures(summary)}
  ${this.renderCoverage(summary.coverage)}

  <footer>Generado por testlet · FemCoders Club</footer>
</main>
</body>
</html>`;
  }

  renderGroup({ suite, results }) {
    const items = results
      .map(
        (result) => `      <li class="${result.status}">
        <span class="mark">${MARKS[result.status]}</span>
        <span class="name">${escapeHtml(result.test.name)}</span>
        <span class="time">${result.durationMs.toFixed(1)} ms</span>
      </li>`
      )
      .join('\n');

    return `  <h2>${escapeHtml(suite || 'Sin suite')}</h2>
    <ul>
${items}
    </ul>`;
  }

  renderFailures(summary) {
    const failures = summary.results.filter((result) => result.status === 'failed');
    if (failures.length === 0) return '';

    const blocks = failures
      .map((result) => {
        const error = result.error;
        const body = [error?.message ?? String(error), error?.diff].filter(Boolean).join('\n');
        return `  <h2>${escapeHtml(result.name)}</h2>
  <pre>${escapeHtml(body)}</pre>`;
      })
      .join('\n');

    return `  <h2>Detalle de los fallos</h2>\n${blocks}`;
  }

  renderCoverage(coverage) {
    if (!coverage) return '';

    const rows = coverage.files
      .map(
        (file) => `      <tr>
        <td>${escapeHtml(file.path)}</td>
        <td>${file.percent.toFixed(1)} %</td>
        <td>${file.coveredLines} / ${file.totalLines}</td>
      </tr>`
      )
      .join('\n');

    return `  <h2>Cobertura: ${coverage.percentCovered.toFixed(1)} %</h2>
  <div class="bar"><div style="width:${coverage.percentCovered.toFixed(1)}%"></div></div>
  <table>
    <thead><tr><th>Archivo</th><th>Cobertura</th><th>Líneas</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
  }
}

const MARKS = { passed: '✓', failed: '✗', skipped: '○' };

function groupBySuite(results) {
  const groups = new Map();
  for (const result of results) {
    const suite = result.test.suite?.path().join(' › ') || '';
    if (!groups.has(suite)) groups.set(suite, []);
    groups.get(suite).push(result);
  }
  return [...groups].map(([suite, items]) => ({ suite, results: items }));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
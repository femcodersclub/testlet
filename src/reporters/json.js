import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reporter JSON. Son treinta líneas y cero cambios en el runner: esa es la
 * ventaja de que el runner solo conozca la interfaz, no las implementaciones.
 */
export class JsonReporter {
  constructor({ outputPath = 'coverage/results.json' } = {}) {
    this.outputPath = outputPath;
  }

  onRunEnd(summary) {
    const payload = {
      generatedAt: new Date().toISOString(),
      durationMs: Number(summary.durationMs.toFixed(2)),
      totals: {
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
      },
      results: summary.results.map((result) => ({
        name: result.name,
        suite: result.test.suite?.path() ?? [],
        status: result.status,
        durationMs: Number(result.durationMs.toFixed(2)),
        error: result.error
          ? {
              name: result.error.name,
              message: result.error.message,
              operator: result.error.operator ?? null,
              diff: result.error.diff ?? null,
            }
          : null,
      })),
      unhandledRejections: summary.unhandledRejections.map((reason) =>
        reason instanceof Error ? reason.message : String(reason)
      ),
      coverage: summary.coverage
        ? {
            percentCovered: Number(summary.coverage.percentCovered.toFixed(2)),
            files: summary.coverage.files.map((file) => ({
              path: file.path,
              percent: Number(file.percent.toFixed(2)),
              coveredLines: file.coveredLines,
              totalLines: file.totalLines,
              uncovered: file.uncovered,
            })),
          }
        : null,
    };

    mkdirSync(dirname(this.outputPath), { recursive: true });
    writeFileSync(this.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}
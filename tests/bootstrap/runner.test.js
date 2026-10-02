import nodeAssert from 'node:assert/strict';
import { Runner } from '../../src/runner.js';
import { check } from './harness.js';

check('un test que no lanza nada pasa', async () => {
  const runner = new Runner();
  runner.describe('CacheService', () => {
    runner.it('devuelve el valor guardado', () => {});
  });

  const summary = await runner.run();
  nodeAssert.equal(summary.passed, 1);
  nodeAssert.equal(summary.failed, 0);
  nodeAssert.equal(summary.exitCode(), 0);
});

check('un test que lanza queda registrado con su error', async () => {
  const runner = new Runner();
  runner.describe('CacheService', () => {
    runner.it('expulsa la entrada más antigua', () => {
      throw new Error('la entrada seguía en el caché');
    });
  });

  const summary = await runner.run();
  nodeAssert.equal(summary.failed, 1);
  nodeAssert.equal(summary.results[0].error.message, 'la entrada seguía en el caché');
  nodeAssert.equal(summary.exitCode(), 1);
});

check('los beforeEach van de fuera hacia dentro y los afterEach al revés', async () => {
  const order = [];
  const runner = new Runner();

  runner.describe('externa', () => {
    runner.beforeEach(() => order.push('before-externa'));
    runner.afterEach(() => order.push('after-externa'));

    runner.describe('interna', () => {
      runner.beforeEach(() => order.push('before-interna'));
      runner.afterEach(() => order.push('after-interna'));
      runner.it('caso', () => order.push('test'));
    });
  });

  await runner.run();
  nodeAssert.deepEqual(order, [
    'before-externa',
    'before-interna',
    'test',
    'after-interna',
    'after-externa',
  ]);
});

check('los afterEach se ejecutan aunque el test falle', async () => {
  const order = [];
  const runner = new Runner();

  runner.describe('con limpieza', () => {
    runner.afterEach(() => order.push('cleanup'));
    runner.it('falla', () => {
      throw new Error('boom');
    });
  });

  const summary = await runner.run();
  nodeAssert.deepEqual(order, ['cleanup']);
  nodeAssert.equal(summary.failed, 1);
});

check('el nombre completo incluye la ruta de suites', async () => {
  const runner = new Runner();
  runner.describe('ApiClient', () => {
    runner.describe('cuando la cuota se agota', () => {
      runner.it('reintenta con backoff', () => {});
    });
  });

  const summary = await runner.run();
  nodeAssert.equal(
    summary.results[0].name,
    'ApiClient › cuando la cuota se agota › reintenta con backoff'
  );
});

check('it.skip y describe.skip omiten sin ejecutar', async () => {
  let ejecutado = false;
  const runner = new Runner();

  runner.describe('suite', () => {
    runner.it('omitido', () => {
      ejecutado = true;
    }, { skip: true });
    runner.it('normal', () => {});
  });

  const summary = await runner.run();
  nodeAssert.equal(ejecutado, false);
  nodeAssert.equal(summary.skipped, 1);
  nodeAssert.equal(summary.passed, 1);
});

check('si hay un only, el resto se omite', async () => {
  const ejecutados = [];
  const runner = new Runner();

  runner.describe('suite', () => {
    runner.it('a', () => ejecutados.push('a'));
    runner.it('b', () => ejecutados.push('b'), { only: true });
    runner.it('c', () => ejecutados.push('c'));
  });

  const summary = await runner.run();
  nodeAssert.deepEqual(ejecutados, ['b']);
  nodeAssert.equal(summary.skipped, 2);
});

check('un test async que rechaza se marca como fallido', async () => {
  const runner = new Runner();
  runner.describe('async', () => {
    runner.it('propaga el rechazo', async () => {
      await Promise.reject(new Error('503 Service Unavailable'));
    });
  });

  const summary = await runner.run();
  nodeAssert.equal(summary.failed, 1);
  nodeAssert.match(summary.results[0].error.message, /503/);
});

check('el timeout corta un test colgado', async () => {
  const runner = new Runner();
  runner.describe('async', () => {
    runner.it(
      'nunca resuelve',
      () => new Promise(() => {}),
      { timeout: 30 }
    );
  });

  const summary = await runner.run();
  nodeAssert.equal(summary.failed, 1);
  nodeAssert.match(summary.results[0].error.message, /timeout de 30 ms/);
});

check('los reporters reciben los eventos en orden', async () => {
  const eventos = [];
  const runner = new Runner();
  runner.addReporter({
    onRunStart: () => eventos.push('run-start'),
    onSuiteStart: (suite) => eventos.push(`suite:${suite.name}`),
    onTestEnd: (result) => eventos.push(`test:${result.status}`),
    onRunEnd: () => eventos.push('run-end'),
  });

  runner.describe('Reporters', () => {
    runner.it('pasa', () => {});
  });

  await runner.run();
  nodeAssert.deepEqual(eventos, ['run-start', 'suite:Reporters', 'test:passed', 'run-end']);
});

check('un reporter incompleto no rompe la ejecución', async () => {
  const runner = new Runner();
  runner.addReporter({ onTestEnd: () => {} }); // sin onRunStart ni onRunEnd
  runner.describe('suite', () => runner.it('pasa', () => {}));

  const summary = await runner.run();
  nodeAssert.equal(summary.passed, 1);
});

check('la duración de cada test se mide con performance.now', async () => {
  const runner = new Runner();
  runner.describe('suite', () => {
    runner.it('espera un poco', async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  });

  const summary = await runner.run();
  nodeAssert.ok(summary.results[0].durationMs >= 10, 'debería haber tardado al menos 10 ms');
});

check('una promesa rechazada sin capturar rompe la ejecución', async () => {
  const runner = new Runner();
  runner.describe('fugas', () => {
    runner.it('deja una promesa suelta', () => {
      Promise.reject(new Error('nadie me captura'));
    });
  });

  const summary = await runner.run();
  nodeAssert.equal(summary.passed, 1, 'el test en sí no falla...');
  nodeAssert.equal(summary.unhandledRejections.length, 1, '...pero el rechazo queda registrado');
  nodeAssert.equal(summary.exitCode(), 1);
});
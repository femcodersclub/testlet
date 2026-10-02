/**
 * El runner: registro de suites y tests, y ejecución con hooks y timeouts.
 *
 * Guardamos los timers nativos al importar el módulo, antes de que nadie pueda
 * instalar fake timers. Si no, un test que congela el tiempo congelaría también
 * el timeout que debería rescatarlo.
 */
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;

const DEFAULT_TIMEOUT = 5000;

export class Test {
  constructor(name, fn, { only = false, skip = false, timeout = DEFAULT_TIMEOUT } = {}) {
    this.name = name;
    this.fn = fn;
    this.only = only;
    this.skip = skip;
    this.timeout = timeout;
    this.suite = null;
  }

  /** 'UserService › cachea la respuesta' — lo que se ve en el reporte. */
  get fullName() {
    const path = this.suite ? this.suite.path() : [];
    return [...path, this.name].join(' › ');
  }
}

export class Suite {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = [];
    this.tests = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.skip = false;
  }

  path() {
    const names = [];
    let current = this;
    while (current && current.parent) {
      names.unshift(current.name);
      current = current.parent;
    }
    return names;
  }

  get depth() {
    return this.path().length;
  }

  /**
   * Los beforeEach van de fuera hacia dentro y los afterEach al revés.
   * Es la parte del orden de ejecución que más gente falla en una entrevista.
   */
  collectHooks() {
    const chain = [];
    let current = this;
    while (current) {
      chain.unshift(current);
      current = current.parent;
    }
    const before = chain.flatMap((suite) => suite.beforeEachHooks);
    const after = [...chain].reverse().flatMap((suite) => suite.afterEachHooks);
    return { before, after };
  }
}

export class TestResult {
  constructor(test, status, durationMs, error = null) {
    this.test = test;
    this.name = test.fullName;
    this.status = status; // 'passed' | 'failed' | 'skipped'
    this.durationMs = durationMs;
    this.error = error;
  }
}

export class RunSummary {
  constructor(results, durationMs, unhandledRejections = []) {
    this.results = results;
    this.durationMs = durationMs;
    this.unhandledRejections = unhandledRejections;
    this.coverage = null;
  }

  get passed() {
    return this.results.filter((r) => r.status === 'passed').length;
  }

  get failed() {
    return this.results.filter((r) => r.status === 'failed').length;
  }

  get skipped() {
    return this.results.filter((r) => r.status === 'skipped').length;
  }

  get total() {
    return this.results.length;
  }

  exitCode() {
    return this.failed > 0 || this.unhandledRejections.length > 0 ? 1 : 0;
  }
}

export class Runner {
  constructor() {
    this.rootSuite = new Suite('', null);
    this.suiteStack = [this.rootSuite];
    this.reporters = [];
    this.hasOnly = false;
  }

  get currentSuite() {
    return this.suiteStack[this.suiteStack.length - 1];
  }

  addReporter(reporter) {
    this.reporters.push(reporter);
    return this;
  }

  describe(name, fn, { skip = false } = {}) {
    const suite = new Suite(name, this.currentSuite);
    suite.skip = skip || this.currentSuite.skip;
    this.currentSuite.children.push(suite);
    this.suiteStack.push(suite);
    try {
      fn();
    } finally {
      this.suiteStack.pop();
    }
    return suite;
  }

  it(name, fn, options = {}) {
    const test = new Test(name, fn, options);
    test.suite = this.currentSuite;
    this.currentSuite.tests.push(test);
    return test;
  }

  beforeEach(fn) {
    this.currentSuite.beforeEachHooks.push(fn);
  }

  afterEach(fn) {
    this.currentSuite.afterEachHooks.push(fn);
  }

  /** Recorre el árbol en el mismo orden en que se registró. */
  allTests(suite = this.rootSuite) {
    return [...suite.tests, ...suite.children.flatMap((child) => this.allTests(child))];
  }

  notify(event, payload) {
    for (const reporter of this.reporters) {
      if (typeof reporter[event] === 'function') reporter[event](payload);
    }
  }

  /**
   * `finalize` permite añadir datos al resumen (la cobertura, por ejemplo)
   * antes de que los reporters lo reciban. Sin esto habría que notificar dos
   * veces y el informe saldría duplicado.
   */
  async run({ finalize } = {}) {
    const tests = this.allTests();
    this.hasOnly = tests.some((test) => test.only);

    const unhandledRejections = [];
    const onUnhandled = (reason) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    this.notify('onRunStart', { total: tests.length });
    const started = performance.now();
    const results = [];

    try {
      await this.runSuite(this.rootSuite, results);
      // Damos un tick para que afloren los rechazos no capturados antes del resumen.
      await new Promise((resolve) => nativeSetTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    const summary = new RunSummary(results, performance.now() - started, unhandledRejections);
    if (finalize) await finalize(summary);
    this.notify('onRunEnd', summary);
    return summary;
  }

  async runSuite(suite, results) {
    if (suite.parent) this.notify('onSuiteStart', suite);
    const hooks = suite.collectHooks();

    for (const test of suite.tests) {
      const result = await this.runTest(test, hooks, suite.skip);
      results.push(result);
      this.notify('onTestEnd', result);
    }

    for (const child of suite.children) {
      await this.runSuite(child, results);
    }
  }

  async runTest(test, hooks, inheritedSkip = false) {
    const shouldSkip = test.skip || inheritedSkip || (this.hasOnly && !test.only);
    if (shouldSkip) return new TestResult(test, 'skipped', 0);

    const started = performance.now();
    let error = null;

    try {
      for (const hook of hooks.before) await hook();
      // Promise.resolve().then envuelve también los tests síncronos que lanzan,
      // así el timeout aplica igual sean async o no.
      await this.withTimeout(Promise.resolve().then(() => test.fn()), test.timeout);
    } catch (caught) {
      error = caught;
    }

    for (const hook of hooks.after) {
      try {
        await hook();
      } catch (caught) {
        error = error ?? caught;
      }
    }

    const durationMs = performance.now() - started;
    return new TestResult(test, error ? 'failed' : 'passed', durationMs, error);
  }

  withTimeout(promise, ms) {
    if (!ms || ms === Infinity) return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = nativeSetTimeout(
        () => reject(new Error(`El test superó el timeout de ${ms} ms`)),
        ms
      );
    });
    return Promise.race([promise, timeout]).finally(() => nativeClearTimeout(timer));
  }
}
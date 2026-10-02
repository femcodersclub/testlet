import { Runner } from './runner.js';

export { Coverage, CoverageReport, FileCoverage } from './coverage.js';
export { assert, AssertionError, deepDiff, format, renderDiff } from './assert.js';
export { createFakeTimers } from './fake-timers.js';
export { ConsoleReporter } from './reporters/console.js';
export { HtmlReporter } from './reporters/html.js';
export { JsonReporter } from './reporters/json.js';
export { Runner, RunSummary, Suite, Test, TestResult } from './runner.js';
export { spy, stub } from './spy.js';

/**
 * Un runner "actual" a nivel de módulo es lo que permite que un archivo de test
 * escriba `describe(...)` sin instanciar nada. Es el mismo truco que usan Jest,
 * Vitest y node:test por debajo.
 */
let current = new Runner();

export function getRunner() {
  return current;
}

export function setRunner(runner) {
  current = runner;
  return current;
}

export function resetRunner() {
  return setRunner(new Runner());
}

export function describe(name, fn) {
  return current.describe(name, fn);
}

describe.skip = (name, fn) => current.describe(name, fn, { skip: true });

export function it(name, fn, options = {}) {
  return current.it(name, fn, options);
}

it.only = (name, fn, options = {}) => current.it(name, fn, { ...options, only: true });
it.skip = (name, fn, options = {}) => current.it(name, fn, { ...options, skip: true });

export const test = it;

export function beforeEach(fn) {
  return current.beforeEach(fn);
}

export function afterEach(fn) {
  return current.afterEach(fn);
}

export function run() {
  return current.run();
}
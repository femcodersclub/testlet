/**
 * Tests de arranque (bootstrap).
 *
 * Aquí todavía no podemos usar nuestro propio framework: sería como pesar una
 * báscula consigo misma. Usamos el `assert` nativo de Node.js, el mismo que
 * llevamos usando en toda la serie, y solo cuando este módulo está verificado
 * pasamos a testear el framework con el framework (ver tests/self/).
 */
import nodeAssert from 'node:assert/strict';
import { assert, AssertionError, deepDiff, format } from '../../src/assert.js';
import { check, capture } from './harness.js';

check('equal usa Object.is: NaN es igual a NaN', () => {
  assert.equal(NaN, NaN);
  nodeAssert.throws(() => assert.equal(0, -0), AssertionError);
});

check('equal falla con un mensaje que incluye ambos valores', () => {
  const error = capture(() => assert.equal('grace', 'ada'));
  nodeAssert.ok(error instanceof AssertionError);
  nodeAssert.match(error.message, /"ada"/);
  nodeAssert.match(error.message, /"grace"/);
  nodeAssert.equal(error.operator, 'equal');
});

check('deepEqual señala la ruta exacta de la diferencia', () => {
  const actual = { user: { name: 'Ada', roles: ['admin', 'dev'] } };
  const expected = { user: { name: 'Grace', roles: ['admin', 'dev'] } };

  const error = capture(() => assert.deepEqual(actual, expected));
  nodeAssert.ok(error instanceof AssertionError);
  nodeAssert.match(error.diff, /en user\.name/);
  nodeAssert.match(error.diff, /esperado: "Grace"/);
  nodeAssert.match(error.diff, /recibido: "Ada"/);
});

check('deepEqual detecta longitudes distintas en arrays', () => {
  const diffs = deepDiff([1, 2, 3], [1, 2]);
  nodeAssert.ok(diffs.some((diff) => diff.path.endsWith('.length')));
});

check('deepEqual compara Map y Set por contenido', () => {
  nodeAssert.equal(deepDiff(new Set([1, 2]), new Set([2, 1])).length, 0);
  nodeAssert.equal(deepDiff(new Map([['a', 1]]), new Map([['a', 1]])).length, 0);
  nodeAssert.ok(deepDiff(new Map([['a', 1]]), new Map([['a', 2]])).length > 0);
});

check('deepEqual sobrevive a referencias circulares', () => {
  const left = { name: 'nodo' };
  const right = { name: 'nodo' };
  left.self = left;
  right.self = right;
  nodeAssert.equal(deepDiff(left, right).length, 0);
});

check('deepEqual distingue tipos con la misma forma', () => {
  const diffs = deepDiff({ 0: 'a', length: 1 }, ['a']);
  nodeAssert.ok(diffs.some((diff) => diff.reason?.includes('tipos distintos')));
});

check('throws acepta clase, RegExp, string y predicado', () => {
  const boom = () => {
    throw new TypeError('petición inválida: falta el id');
  };

  assert.throws(boom, TypeError);
  assert.throws(boom, /falta el id/);
  assert.throws(boom, 'petición inválida');
  assert.throws(boom, (error) => error.message.length > 10);

  nodeAssert.throws(() => assert.throws(() => 'no lanza nada'), AssertionError);
  nodeAssert.throws(() => assert.throws(boom, RangeError), AssertionError);
});

check('throws devuelve el error para seguir comprobándolo', () => {
  const error = assert.throws(() => {
    throw new Error('cuota agotada');
  });
  nodeAssert.equal(error.message, 'cuota agotada');
});

check('rejects funciona con promesas y con funciones async', async () => {
  await assert.rejects(Promise.reject(new Error('429 Too Many Requests')), /429/);
  await assert.rejects(async () => {
    throw new Error('timeout');
  }, 'timeout');

  await nodeAssert.rejects(
    () => assert.rejects(Promise.resolve('todo bien')),
    AssertionError
  );
});

check('match y ok tienen mensajes útiles', () => {
  assert.match('femcodersclub.com', /femcoders/);
  nodeAssert.throws(() => assert.match('otra cosa', /femcoders/), AssertionError);
  nodeAssert.throws(() => assert.ok(0), AssertionError);
});

check('format resume valores sin reventar la consola', () => {
  nodeAssert.equal(format('hola'), '"hola"');
  nodeAssert.equal(format(undefined), 'undefined');
  nodeAssert.equal(format([1, 'dos']), '[1, "dos"]');
  nodeAssert.equal(format(new Set([1])), 'Set(1) {1}');
  nodeAssert.match(format(() => {}), /\[Function/);
  nodeAssert.match(format({ a: { b: { c: { d: 1 } } } }), /\{\.\.\.\}/);
});
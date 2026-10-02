/**
 * A partir de aquí el framework se testea a sí mismo.
 *
 * Los tests de tests/bootstrap/ ya verificaron `assert` con node:assert nativo,
 * así que podemos confiar en él para lo demás. Este archivo usa describe, it,
 * hooks y assertions propias: si algo se rompe en el núcleo, estos tests se
 * caen en cadena, que es justo lo que queremos.
 */
import { describe, it, beforeEach, afterEach, assert, AssertionError } from '../../src/index.js';

describe('assert', () => {
  describe('equal', () => {
    it('trata NaN como igual a sí mismo, al contrario que ===', () => {
      assert.equal(NaN, NaN);
      assert.equal(NaN === NaN, false);
    });

    it('distingue 0 de -0', () => {
      assert.throws(() => assert.equal(0, -0), AssertionError);
    });

    it('acepta un mensaje personalizado', () => {
      const error = assert.throws(
        () => assert.equal(2, 3, 'el contador de reintentos no cuadra'),
        AssertionError
      );
      assert.equal(error.message, 'el contador de reintentos no cuadra');
    });
  });

  describe('deepEqual', () => {
    it('compara objetos anidados por valor', () => {
      const response = { status: 200, body: { items: [{ id: 1 }] } };
      assert.deepEqual(response, { status: 200, body: { items: [{ id: 1 }] } });
    });

    it('incluye la ruta de cada diferencia en el diff', () => {
      const error = assert.throws(
        () => assert.deepEqual({ quota: { rpm: 10 } }, { quota: { rpm: 15 } }),
        AssertionError
      );
      assert.match(error.diff, /en quota\.rpm/);
      assert.match(error.diff, /esperado: 15/);
      assert.match(error.diff, /recibido: 10/);
    });

    it('acumula varias diferencias en un mismo diff', () => {
      const error = assert.throws(
        () => assert.deepEqual({ a: 1, b: 2 }, { a: 9, b: 8 }),
        AssertionError
      );
      assert.match(error.message, /2 diferencia/);
    });

    it('funciona con Date y RegExp', () => {
      assert.deepEqual(new Date('2026-03-01'), new Date('2026-03-01'));
      assert.deepEqual({ pattern: /femcoders/i }, { pattern: /femcoders/i });
      assert.throws(() => assert.deepEqual(new Date('2026-03-01'), new Date('2026-03-02')));
    });
  });

  describe('throws y rejects', () => {
    it('rejects acepta una función async', async () => {
      const error = await assert.rejects(async () => {
        throw new RangeError('cuota diaria agotada');
      }, RangeError);
      assert.match(error.message, /cuota diaria/);
    });

    it('rejects falla si la promesa se resuelve', async () => {
      await assert.rejects(() => assert.rejects(Promise.resolve('ok')), AssertionError);
    });
  });
});

describe('hooks', () => {
  const order = [];

  beforeEach(() => order.push('before'));
  afterEach(() => order.push('after'));

  it('primera pasada', () => {
    assert.deepEqual(order, ['before']);
  });

  it('segunda pasada, con la primera ya cerrada', () => {
    assert.deepEqual(order, ['before', 'after', 'before']);
  });
});

describe('estado aislado entre tests', () => {
  let cache;

  beforeEach(() => {
    cache = new Map();
  });

  it('empieza vacío', () => {
    cache.set('a', 1);
    assert.equal(cache.size, 1);
  });

  it('y sigue vacío en el siguiente test', () => {
    assert.equal(cache.size, 0);
  });
});
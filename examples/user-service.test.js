/**
 * Ejemplo de uso del framework en un caso realista.
 *
 * Nada de `expect(2 + 2).toBe(4)`: aquí se testea red, tiempo y caché, que es
 * lo que de verdad cuesta en un proyecto. Ejecútalo con:
 *
 *   npm run example
 */
import { describe, it, beforeEach, afterEach, assert, spy, createFakeTimers } from '../src/index.js';
import { UserService } from './user-service.js';

const ok = (body) => ({ ok: true, status: 200, body });
const error = (status) => ({ ok: false, status });

describe('UserService', () => {
  let timers;
  let fetch;
  let service;

  beforeEach(() => {
    timers = createFakeTimers({ now: 1_770_000_000_000 }).install();
    fetch = spy().resolves(ok({ id: 7, name: 'Ada' }));
    service = new UserService({ fetch, cacheTtlMs: 60_000 });
  });

  afterEach(() => {
    timers.restore();
  });

  describe('cuando la API responde a la primera', () => {
    it('devuelve el cuerpo de la respuesta', async () => {
      const user = await service.getUser(7);

      assert.deepEqual(user, { id: 7, name: 'Ada' });
      assert.ok(fetch.calledWith('/api/users/7'));
    });

    it('no vuelve a llamar a la API dentro del TTL', async () => {
      await service.getUser(7);
      timers.tick(59_000);
      await service.getUser(7);

      assert.equal(fetch.callCount, 1);
    });

    it('vuelve a pedir el dato cuando el TTL expira', async () => {
      await service.getUser(7);
      timers.tick(61_000);
      await service.getUser(7);

      assert.equal(fetch.callCount, 2);
    });
  });

  describe('cuando la API devuelve 429', () => {
    it('reintenta con backoff exponencial hasta que responde', async () => {
      fetch.callsFake(() => Promise.resolve(fetch.callCount < 3 ? error(429) : ok({ id: 7 })));

      const promise = service.getUser(7);
      // Los backoffs son de 100 ms y 200 ms: sin fake timers este test tardaría
      // 300 ms reales y sería el primero en volverse intermitente en CI.
      await flush(timers, 400);

      assert.deepEqual(await promise, { id: 7 });
      assert.equal(fetch.callCount, 3);
    });

    it('se rinde después del último reintento', async () => {
      fetch.resolves(error(429));

      const promise = service.getUser(7);
      await flush(timers, 400);

      await assert.rejects(promise, /falló con 429/);
      assert.equal(fetch.callCount, 3, 'la original más dos reintentos');
    });
  });

  describe('cuando el error no merece reintento', () => {
    it('falla de inmediato con un 404', async () => {
      fetch.resolves(error(404));

      await assert.rejects(service.getUser(7), /falló con 404/);
      assert.equal(fetch.callCount, 1);
    });

    it('no guarda en caché una respuesta fallida', async () => {
      fetch.resolves(error(404));
      await assert.rejects(service.getUser(7));

      fetch.resolves(ok({ id: 7, name: 'Grace' }));
      assert.deepEqual(await service.getUser(7), { id: 7, name: 'Grace' });
    });
  });
});

/**
 * Los fake timers controlan los temporizadores, pero no las promesas: hay que
 * dejar respirar a la cola de microtareas entre avance y avance del reloj.
 */
async function flush(timers, ms, steps = 12) {
  for (let i = 0; i < steps; i++) {
    await Promise.resolve();
    timers.tick(ms / steps);
  }
}
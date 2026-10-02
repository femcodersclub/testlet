/**
 * Fake timers: controlar el tiempo en lugar de esperarlo.
 *
 * Un test que hace `await sleep(3000)` para comprobar un debounce es un test
 * que tarda 3 segundos. Con esto tarda cero y además es determinista.
 */
const MAX_ITERATIONS = 10000;

export function createFakeTimers({ now = Date.now() } = {}) {
  const originals = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    dateNow: Date.now,
  };

  let currentTime = now;
  let nextId = 1;
  let installed = false;
  const pending = new Map();

  function schedule(fn, delay, args, interval) {
    const id = nextId++;
    pending.set(id, {
      id,
      time: currentTime + Math.max(0, delay || 0),
      fn,
      args,
      interval: interval ? Math.max(1, delay || 1) : null,
    });
    return id;
  }

  const api = {
    get now() {
      return currentTime;
    },

    get pendingCount() {
      return pending.size;
    },

    install() {
      if (installed) return api;
      globalThis.setTimeout = (fn, delay, ...args) => schedule(fn, delay, args, false);
      globalThis.setInterval = (fn, delay, ...args) => schedule(fn, delay, args, true);
      globalThis.clearTimeout = (id) => pending.delete(id);
      globalThis.clearInterval = (id) => pending.delete(id);
      Date.now = () => currentTime;
      installed = true;
      return api;
    },

    /** Avanza el reloj y ejecuta lo que venciera por el camino, en orden. */
    tick(ms) {
      const target = currentTime + ms;
      let iterations = 0;

      while (iterations++ < MAX_ITERATIONS) {
        const due = [...pending.values()]
          .filter((timer) => timer.time <= target)
          .sort((a, b) => a.time - b.time || a.id - b.id);

        if (due.length === 0) break;

        const timer = due[0];
        currentTime = timer.time;

        if (timer.interval) {
          timer.time = currentTime + timer.interval;
        } else {
          pending.delete(timer.id);
        }

        timer.fn(...timer.args);
      }

      currentTime = target;
      return api;
    },

    /** Ejecuta todo lo pendiente sin importar cuánto falte. Útil para vaciar colas. */
    runAll() {
      let iterations = 0;
      while (pending.size > 0 && iterations++ < MAX_ITERATIONS) {
        const next = [...pending.values()].sort((a, b) => a.time - b.time || a.id - b.id)[0];
        api.tick(Math.max(0, next.time - currentTime));
        if (next.interval && pending.has(next.id)) pending.delete(next.id);
      }
      return api;
    },

    restore() {
      if (!installed) return api;
      globalThis.setTimeout = originals.setTimeout;
      globalThis.clearTimeout = originals.clearTimeout;
      globalThis.setInterval = originals.setInterval;
      globalThis.clearInterval = originals.clearInterval;
      Date.now = originals.dateNow;
      pending.clear();
      installed = false;
      return api;
    },
  };

  return api;
}
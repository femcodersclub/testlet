import { deepDiff } from './assert.js';

/**
 * Un spy no es magia: es una función que se apunta cómo la han llamado.
 * Todo lo que hace `vi.fn()` o `jest.fn()` cabe en este archivo.
 */
export function spy(implementation = () => undefined) {
  const calls = [];
  let behavior = { type: 'impl', implementation };

  const fn = function spied(...args) {
    const call = { args, context: this, returned: undefined, threw: undefined };
    calls.push(call);

    try {
      let returned;
      if (behavior.type === 'returns') returned = behavior.value;
      else if (behavior.type === 'resolves') returned = Promise.resolve(behavior.value);
      else if (behavior.type === 'rejects') returned = Promise.reject(behavior.error);
      else if (behavior.type === 'throws') throw behavior.error;
      else returned = behavior.implementation.apply(this, args);

      call.returned = returned;
      return returned;
    } catch (error) {
      call.threw = error;
      throw error;
    }
  };

  Object.defineProperties(fn, {
    calls: { get: () => calls },
    callCount: { get: () => calls.length },
    called: { get: () => calls.length > 0 },
    firstCall: { get: () => calls[0] },
    lastCall: { get: () => calls[calls.length - 1] },
    isSpy: { value: true },
  });

  fn.returns = (value) => {
    behavior = { type: 'returns', value };
    return fn;
  };

  fn.resolves = (value) => {
    behavior = { type: 'resolves', value };
    return fn;
  };

  fn.rejects = (error) => {
    behavior = { type: 'rejects', error: toError(error) };
    return fn;
  };

  fn.throws = (error) => {
    behavior = { type: 'throws', error: toError(error) };
    return fn;
  };

  fn.callsFake = (nextImplementation) => {
    behavior = { type: 'impl', implementation: nextImplementation };
    return fn;
  };

  fn.reset = () => {
    calls.length = 0;
    return fn;
  };

  /** Comparación profunda de argumentos: 'me llamaron con este objeto' sin JSON.stringify. */
  fn.calledWith = (...expected) =>
    calls.some((call) => deepDiff(call.args, expected).length === 0);

  fn.argsForCall = (index) => calls[index]?.args;

  return fn;
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Sustituye un método de un objeto por un spy y devuelve la forma de restaurarlo.
 * Restaurar siempre en un afterEach: un stub olvidado contamina los tests siguientes.
 */
export function stub(target, method, implementation) {
  const original = target[method];
  if (typeof original !== 'function') {
    throw new TypeError(`${String(method)} no es un método de este objeto`);
  }

  const spied = spy(implementation ?? original.bind(target));
  spied.restore = () => {
    target[method] = original;
    return original;
  };
  spied.original = original;

  target[method] = spied;
  return spied;
}
/**
 * Assertions con diffs legibles.
 *
 * La diferencia entre un framework usable y uno que no lo es no está en el
 * runner: está aquí. Un `deepEqual` que solo dice "no son iguales" te obliga a
 * poner console.log; uno que dice qué propiedad falló te ahorra el viaje.
 */

const MAX_DIFF_ENTRIES = 6;

export class AssertionError extends Error {
  constructor({ message, actual, expected, operator, diff = '' }) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
    this.diff = diff;
    if (Error.captureStackTrace) Error.captureStackTrace(this, AssertionError);
  }
}

/** Etiqueta interna del valor: 'Array', 'Map', 'Date', 'Object'... */
function kindOf(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
}

/** Representación corta y legible de cualquier valor, sin reventar la consola. */
export function format(value, depth = 0, seen = new Set()) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (type === 'bigint') return `${value}n`;
  if (type === 'boolean') return String(value);
  if (type === 'symbol') return value.toString();
  if (type === 'function') return `[Function: ${value.name || 'anónima'}]`;

  if (seen.has(value)) return '[Circular]';
  if (depth > 2) return kindOf(value) === 'Array' ? '[...]' : '{...}';

  const kind = kindOf(value);
  if (kind === 'Date') return value.toISOString();
  if (kind === 'RegExp') return String(value);
  if (kind === 'Error') return `${value.name}: ${value.message}`;

  const next = new Set(seen).add(value);

  if (kind === 'Array') {
    const items = value.map((item) => format(item, depth + 1, next));
    return `[${items.join(', ')}]`;
  }

  if (kind === 'Set') {
    const items = [...value].map((item) => format(item, depth + 1, next));
    return `Set(${value.size}) {${items.join(', ')}}`;
  }

  if (kind === 'Map') {
    const items = [...value].map(
      ([k, v]) => `${format(k, depth + 1, next)} => ${format(v, depth + 1, next)}`
    );
    return `Map(${value.size}) {${items.join(', ')}}`;
  }

  const entries = Object.keys(value).map(
    (key) => `${key}: ${format(value[key], depth + 1, next)}`
  );
  const prefix = value.constructor && value.constructor.name !== 'Object'
    ? `${value.constructor.name} `
    : '';
  return `${prefix}{ ${entries.join(', ')} }`;
}

/**
 * Compara en profundidad y devuelve la lista de diferencias con su ruta.
 * Devolver rutas en vez de un booleano es lo que permite el diff del reporter.
 */
export function deepDiff(actual, expected, path = '', seen = new Map()) {
  if (Object.is(actual, expected)) return [];

  const actualKind = kindOf(actual);
  const expectedKind = kindOf(expected);

  const isObject = (v) => v !== null && (typeof v === 'object' || typeof v === 'function');

  if (!isObject(actual) || !isObject(expected)) {
    return [{ path, actual, expected }];
  }

  if (actualKind !== expectedKind) {
    return [{ path, actual, expected, reason: `tipos distintos (${actualKind} vs ${expectedKind})` }];
  }

  // Referencias circulares: si ya estamos comparando este par, asumimos iguales.
  if (seen.get(actual) === expected) return [];
  seen.set(actual, expected);

  if (actualKind === 'Date') {
    return actual.getTime() === expected.getTime() ? [] : [{ path, actual, expected }];
  }

  if (actualKind === 'RegExp') {
    return String(actual) === String(expected) ? [] : [{ path, actual, expected }];
  }

  if (actualKind === 'Array') {
    const diffs = [];
    if (actual.length !== expected.length) {
      diffs.push({
        path: `${path}.length`,
        actual: actual.length,
        expected: expected.length,
      });
    }
    const max = Math.max(actual.length, expected.length);
    for (let i = 0; i < max; i++) {
      diffs.push(...deepDiff(actual[i], expected[i], `${path}[${i}]`, seen));
    }
    return diffs;
  }

  if (actualKind === 'Set') {
    const missing = [...expected].filter((v) => !actual.has(v));
    const extra = [...actual].filter((v) => !expected.has(v));
    if (!missing.length && !extra.length) return [];
    return [{ path, actual, expected, reason: 'contenido del Set distinto' }];
  }

  if (actualKind === 'Map') {
    const diffs = [];
    for (const [key, value] of expected) {
      if (!actual.has(key)) {
        diffs.push({ path: `${path}(${format(key)})`, actual: undefined, expected: value });
        continue;
      }
      diffs.push(...deepDiff(actual.get(key), value, `${path}(${format(key)})`, seen));
    }
    for (const key of actual.keys()) {
      if (!expected.has(key)) {
        diffs.push({ path: `${path}(${format(key)})`, actual: actual.get(key), expected: undefined });
      }
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  const diffs = [];
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    diffs.push(...deepDiff(actual[key], expected[key], childPath, seen));
  }
  return diffs;
}

/** Convierte la lista de diferencias en el bloque de texto que ve la lectora. */
export function renderDiff(diffs) {
  const shown = diffs.slice(0, MAX_DIFF_ENTRIES);
  const lines = shown.map(({ path, actual, expected, reason }) => {
    const where = path ? `en ${path}` : 'en el valor';
    const detail = reason ? ` (${reason})` : '';
    return [
      `  ${where}${detail}`,
      `    esperado: ${format(expected)}`,
      `    recibido: ${format(actual)}`,
    ].join('\n');
  });
  if (diffs.length > shown.length) {
    lines.push(`  ...y ${diffs.length - shown.length} diferencia(s) más`);
  }
  return lines.join('\n');
}

function matchesError(error, matcher) {
  if (matcher === undefined) return true;
  if (matcher instanceof RegExp) return matcher.test(error?.message ?? String(error));
  if (typeof matcher === 'string') return String(error?.message ?? error).includes(matcher);
  if (typeof matcher === 'function') {
    // Puede ser una clase de error o un predicado.
    if (matcher.prototype instanceof Error || matcher === Error) return error instanceof matcher;
    return Boolean(matcher(error));
  }
  return false;
}

function describeMatcher(matcher) {
  if (matcher === undefined) return 'cualquier error';
  if (matcher instanceof RegExp) return `un error que case con ${matcher}`;
  if (typeof matcher === 'string') return `un error cuyo mensaje contenga ${JSON.stringify(matcher)}`;
  if (typeof matcher === 'function') return `un error que cumpla ${matcher.name || 'el predicado'}`;
  return String(matcher);
}

export const assert = {
  ok(value, message = 'Se esperaba un valor verdadero') {
    if (value) return;
    throw new AssertionError({ message, actual: value, expected: true, operator: 'ok' });
  },

  equal(actual, expected, message) {
    if (Object.is(actual, expected)) return;
    throw new AssertionError({
      message: message ?? `Se esperaba ${format(expected)} y se recibió ${format(actual)}`,
      actual,
      expected,
      operator: 'equal',
    });
  },

  notEqual(actual, expected, message) {
    if (!Object.is(actual, expected)) return;
    throw new AssertionError({
      message: message ?? `No se esperaba ${format(expected)}`,
      actual,
      expected,
      operator: 'notEqual',
    });
  },

  deepEqual(actual, expected, message) {
    const diffs = deepDiff(actual, expected);
    if (diffs.length === 0) return;
    throw new AssertionError({
      message: message ?? `Los valores no coinciden (${diffs.length} diferencia(s))`,
      actual,
      expected,
      operator: 'deepEqual',
      diff: renderDiff(diffs),
    });
  },

  notDeepEqual(actual, expected, message) {
    if (deepDiff(actual, expected).length > 0) return;
    throw new AssertionError({
      message: message ?? 'Se esperaban valores distintos y son iguales',
      actual,
      expected,
      operator: 'notDeepEqual',
    });
  },

  match(value, regexp, message) {
    if (typeof value === 'string' && regexp.test(value)) return;
    throw new AssertionError({
      message: message ?? `${format(value)} no casa con ${regexp}`,
      actual: value,
      expected: regexp,
      operator: 'match',
    });
  },

  /** Devuelve el error capturado para poder seguir haciendo assertions sobre él. */
  throws(fn, matcher, message) {
    let thrown;
    let didThrow = false;
    try {
      fn();
    } catch (error) {
      didThrow = true;
      thrown = error;
    }
    if (!didThrow) {
      throw new AssertionError({
        message: message ?? `Se esperaba ${describeMatcher(matcher)} y la función no lanzó nada`,
        actual: undefined,
        expected: matcher,
        operator: 'throws',
      });
    }
    if (!matchesError(thrown, matcher)) {
      throw new AssertionError({
        message: message ?? `Se lanzó un error que no encaja: ${format(thrown)}`,
        actual: thrown,
        expected: matcher,
        operator: 'throws',
      });
    }
    return thrown;
  },

  /** Igual que throws pero para promesas. Acepta una promesa o una función async. */
  async rejects(target, matcher, message) {
    const promise = typeof target === 'function' ? target() : target;
    let thrown;
    let didReject = false;
    try {
      await promise;
    } catch (error) {
      didReject = true;
      thrown = error;
    }
    if (!didReject) {
      throw new AssertionError({
        message: message ?? `Se esperaba ${describeMatcher(matcher)} y la promesa se resolvió`,
        actual: undefined,
        expected: matcher,
        operator: 'rejects',
      });
    }
    if (!matchesError(thrown, matcher)) {
      throw new AssertionError({
        message: message ?? `La promesa rechazó con un error que no encaja: ${format(thrown)}`,
        actual: thrown,
        expected: matcher,
        operator: 'rejects',
      });
    }
    return thrown;
  },

  fail(message = 'Fallo forzado') {
    throw new AssertionError({ message, actual: undefined, expected: undefined, operator: 'fail' });
  },
};
import { describe, it, assert, format, deepDiff, renderDiff } from '../../src/index.js';

describe('format', () => {
  it('distingue la cadena "10" del número 10', () => {
    assert.equal(format('10'), '"10"');
    assert.equal(format(10), '10');
  });

  it('hace visible el -0, que es donde se esconden los bugs de === ', () => {
    assert.equal(format(-0), '-0');
    assert.equal(format(0), '0');
  });

  it('resume tipos que JSON.stringify no sabe imprimir', () => {
    assert.equal(format(10n), '10n');
    assert.equal(format(Symbol('quota')), 'Symbol(quota)');
    assert.equal(format(undefined), 'undefined');
    assert.equal(format(null), 'null');
    assert.match(format(function retry() {}), /\[Function: retry\]/);
    assert.match(format(() => {}), /\[Function/);
  });

  it('imprime Date, RegExp y Error de forma legible', () => {
    assert.equal(format(new Date('2026-03-01T00:00:00Z')), '2026-03-01T00:00:00.000Z');
    assert.equal(format(/femcoders/gi), '/femcoders/gi');
    assert.equal(format(new TypeError('id inválido')), 'TypeError: id inválido');
  });

  it('muestra el tamaño de Map y Set', () => {
    assert.equal(format(new Map([['rpm', 10]])), 'Map(1) {"rpm" => 10}');
    assert.equal(format(new Set(['a', 'b'])), 'Set(2) {"a", "b"}');
  });

  it('corta a partir del tercer nivel en vez de escupir el objeto entero', () => {
    assert.match(format({ a: { b: { c: { d: 1 } } } }), /\{\.\.\.\}/);
    assert.match(format([[[[1]]]]), /\[\.\.\.\]/);
  });

  it('marca las referencias circulares en lugar de colgarse', () => {
    const node = { name: 'raíz' };
    node.parent = node;
    assert.match(format(node), /\[Circular\]/);
  });

  it('conserva el nombre de la clase de las instancias', () => {
    class QuotaError {
      constructor() {
        this.code = 429;
      }
    }
    assert.match(format(new QuotaError()), /^QuotaError \{/);
  });
});

describe('deepDiff', () => {
  it('devuelve una lista vacía cuando los valores coinciden', () => {
    assert.deepEqual(deepDiff({ a: [1, 2] }, { a: [1, 2] }), []);
  });

  it('detecta claves sobrantes y claves que faltan', () => {
    const diffs = deepDiff({ id: 1, extra: true }, { id: 1 });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, 'extra');
    assert.equal(diffs[0].expected, undefined);
  });

  it('anota la clave del Map en la ruta', () => {
    const diffs = deepDiff(new Map([['rpm', 10]]), new Map([['rpm', 15]]));
    assert.match(diffs[0].path, /"rpm"/);
  });

  it('trata los Set como conjuntos, sin importar el orden', () => {
    assert.deepEqual(deepDiff(new Set([2, 1]), new Set([1, 2])), []);
    assert.equal(deepDiff(new Set([1]), new Set([1, 2])).length, 1);
  });
});

describe('renderDiff', () => {
  it('recorta la lista y avisa de cuántas diferencias quedan fuera', () => {
    const actual = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i]));
    const expected = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i + 1]));

    const rendered = renderDiff(deepDiff(actual, expected));
    assert.match(rendered, /y 4 diferencia\(s\) más/);
  });

  it('usa "en el valor" cuando la diferencia está en la raíz', () => {
    assert.match(renderDiff(deepDiff(1, 2)), /en el valor/);
  });
});
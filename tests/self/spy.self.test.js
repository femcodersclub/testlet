import {
  describe,
  it,
  beforeEach,
  afterEach,
  assert,
  spy,
  stub,
  createFakeTimers,
} from '../../src/index.js';

describe('spy', () => {
  it('cuenta llamadas y guarda los argumentos', () => {
    const track = spy();

    track('page-view', { path: '/recursos/js' });
    track('click', { target: 'cta-newsletter' });

    assert.equal(track.callCount, 2);
    assert.deepEqual(track.firstCall.args[1], { path: '/recursos/js' });
    assert.ok(track.calledWith('click', { target: 'cta-newsletter' }));
  });

  it('propaga el error configurado con throws y lo registra', () => {
    const send = spy().throws(new Error('429 Too Many Requests'));

    assert.throws(() => send('payload'), /429/);
    assert.equal(send.lastCall.threw.message, '429 Too Many Requests');
  });

  it('callsFake permite cambiar la implementación a mitad', () => {
    const parse = spy((value) => Number(value));
    assert.equal(parse('42'), 42);

    parse.callsFake(() => 0);
    assert.equal(parse('42'), 0);
    assert.equal(parse.callCount, 2);
  });
});

describe('stub', () => {
  const storage = {
    saved: [],
    save(note) {
      this.saved.push(note);
      return note.id;
    },
  };

  let saveStub;

  beforeEach(() => {
    saveStub = stub(storage, 'save').returns('id-simulado');
  });

  afterEach(() => {
    saveStub.restore(); // idempotente: restaurar dos veces deja el mismo original
    storage.saved.length = 0;
  });

  it('intercepta la llamada sin tocar el método real', () => {
    const result = storage.save({ id: 'real' });

    assert.equal(result, 'id-simulado');
    assert.equal(storage.saved.length, 0);
    assert.ok(saveStub.calledWith({ id: 'real' }));
  });

  it('restore devuelve el método original, no una copia', () => {
    saveStub.restore();

    assert.equal(storage.save({ id: 'real' }), 'real');
    assert.equal(storage.saved.length, 1);
    assert.equal(storage.save, saveStub.original);
  });
});

describe('fake timers', () => {
  let timers;

  beforeEach(() => {
    timers = createFakeTimers({ now: 1_770_000_000_000 }).install();
  });

  afterEach(() => {
    timers.restore();
  });

  it('un debounce de 300 ms se prueba en cero milisegundos', () => {
    const search = spy();
    const debounced = debounce(search, 300);

    debounced('fem');
    debounced('femco');
    debounced('femcoders');

    timers.tick(299);
    assert.equal(search.callCount, 0);

    timers.tick(1);
    assert.equal(search.callCount, 1);
    assert.ok(search.calledWith('femcoders'));
  });

  it('congela Date.now para que las marcas de tiempo sean deterministas', () => {
    const stamps = [];
    stamps.push(Date.now());
    timers.tick(5000);
    stamps.push(Date.now());

    assert.deepEqual(stamps, [1_770_000_000_000, 1_770_000_005_000]);
  });

  it('runAll vacía la cola pendiente de golpe', () => {
    const done = spy();
    setTimeout(done, 100);
    setTimeout(done, 60_000);

    timers.runAll();
    assert.equal(done.callCount, 2);
  });
});

/** El mismo debounce del Post 09, ahora con tests que no tardan 300 ms. */
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
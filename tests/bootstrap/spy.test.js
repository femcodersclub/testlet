import nodeAssert from 'node:assert/strict';
import { spy, stub } from '../../src/spy.js';
import { createFakeTimers } from '../../src/fake-timers.js';
import { check } from './harness.js';

check('un spy registra argumentos, contexto y valor devuelto', () => {
  const track = spy((event) => `ok:${event}`);

  track('rage-click');
  track('scroll-depth');

  nodeAssert.equal(track.callCount, 2);
  nodeAssert.deepEqual(track.firstCall.args, ['rage-click']);
  nodeAssert.equal(track.lastCall.returned, 'ok:scroll-depth');
  nodeAssert.ok(track.calledWith('rage-click'));
  nodeAssert.equal(track.calledWith('otro-evento'), false);
});

check('calledWith compara en profundidad, no por referencia', () => {
  const send = spy();
  send({ userId: 42, tags: ['beta', 'es'] });

  nodeAssert.ok(send.calledWith({ userId: 42, tags: ['beta', 'es'] }));
  nodeAssert.equal(send.calledWith({ userId: 42, tags: ['beta'] }), false);
});

check('returns, throws y resolves cambian el comportamiento', async () => {
  const fetchUser = spy().returns({ id: 1 });
  nodeAssert.deepEqual(fetchUser(), { id: 1 });

  fetchUser.resolves({ id: 2 });
  nodeAssert.deepEqual(await fetchUser(), { id: 2 });

  fetchUser.throws(new RangeError('cuota agotada'));
  nodeAssert.throws(() => fetchUser(), RangeError);
  nodeAssert.equal(fetchUser.lastCall.threw.message, 'cuota agotada');
});

check('reset borra las llamadas pero no el comportamiento', () => {
  const log = spy().returns('constante');
  log('a');
  log.reset();

  nodeAssert.equal(log.callCount, 0);
  nodeAssert.equal(log('b'), 'constante');
});

check('stub sustituye un método y restore lo devuelve intacto', () => {
  const analytics = {
    sent: [],
    send(event) {
      this.sent.push(event);
      return 'enviado';
    },
  };
  const original = analytics.send;

  const stubbed = stub(analytics, 'send').returns('interceptado');
  nodeAssert.equal(analytics.send('click'), 'interceptado');
  nodeAssert.equal(analytics.sent.length, 0, 'el método real no debería ejecutarse');
  nodeAssert.ok(stubbed.calledWith('click'));

  stubbed.restore();
  nodeAssert.equal(analytics.send, original);
  nodeAssert.equal(analytics.send('click'), 'enviado');
  nodeAssert.equal(analytics.sent.length, 1);
});

check('stub protesta si el método no existe', () => {
  nodeAssert.throws(() => stub({}, 'inexistente'), TypeError);
});

check('los fake timers ejecutan callbacks sin esperar de verdad', () => {
  const timers = createFakeTimers().install();
  try {
    const onIdle = spy();
    setTimeout(onIdle, 5000);

    timers.tick(4999);
    nodeAssert.equal(onIdle.callCount, 0);

    timers.tick(1);
    nodeAssert.equal(onIdle.callCount, 1);
  } finally {
    timers.restore();
  }
});

check('tick respeta el orden y permite reprogramar dentro del callback', () => {
  const timers = createFakeTimers().install();
  try {
    const order = [];
    setTimeout(() => {
      order.push('primero');
      setTimeout(() => order.push('encadenado'), 10);
    }, 10);
    setTimeout(() => order.push('segundo'), 20);

    timers.tick(30);
    nodeAssert.deepEqual(order, ['primero', 'segundo', 'encadenado']);
  } finally {
    timers.restore();
  }
});

check('los intervalos se repiten hasta que se limpian', () => {
  const timers = createFakeTimers().install();
  try {
    const poll = spy();
    const id = setInterval(poll, 100);

    timers.tick(350);
    nodeAssert.equal(poll.callCount, 3);

    clearInterval(id);
    timers.tick(1000);
    nodeAssert.equal(poll.callCount, 3);
  } finally {
    timers.restore();
  }
});

check('Date.now se congela mientras los fake timers están instalados', () => {
  const timers = createFakeTimers({ now: 1_700_000_000_000 }).install();
  try {
    nodeAssert.equal(Date.now(), 1_700_000_000_000);
    timers.tick(2500);
    nodeAssert.equal(Date.now(), 1_700_000_002_500);
  } finally {
    timers.restore();
  }
  nodeAssert.ok(Date.now() > 1_700_000_000_000);
});

check('restore devuelve los timers globales al estado original', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const timers = createFakeTimers().install();
  nodeAssert.notEqual(globalThis.setTimeout, originalSetTimeout);

  timers.restore();
  nodeAssert.equal(globalThis.setTimeout, originalSetTimeout);
});
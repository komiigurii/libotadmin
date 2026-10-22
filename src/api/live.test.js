import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for Socket.IO: the test plays the server's messages.
const fake = vi.hoisted(() => ({ socket: null }));
vi.mock('socket.io-client', () => ({
  io: (url, options) => {
    const handlers = {};
    fake.socket = {
      url, options, active: true,
      on: (event, fn) => { handlers[event] = fn; },
      emit: (event, arg) => handlers[event]?.(arg),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    return fake.socket;
  },
}));
vi.mock('./api', () => ({ default: { defaults: { baseURL: 'https://api.test' } } }));
vi.mock('../auth/session', () => ({ getToken: () => 'panel-token', SESSION_CHECK_EVENT: 'libot:session-check' }));

// The panel's tests run without a browser; these are the bits live.js uses.
const doc = { visibilityState: 'visible', listeners: {} };
doc.addEventListener = (e, fn) => { doc.listeners[e] = fn; };
doc.removeEventListener = (e) => { delete doc.listeners[e]; };
globalThis.document = doc;
globalThis.window = { dispatchEvent: vi.fn() };
globalThis.Event = class { constructor(type) { this.type = type; } };

const live = await import('./live');

beforeEach(async () => {
  doc.visibilityState = 'visible';
  await live.connectLive();
  vi.useFakeTimers();
});
afterEach(() => {
  live.disconnectLive();
  vi.useRealTimers();
});

describe('live updates in the panel', () => {
  it('signs the connection in as the panel, with the stored token', () => {
    const sent = vi.fn();
    fake.socket.options.auth(sent);
    expect(sent).toHaveBeenCalledWith({ client: 'panel', token: 'panel-token' });
    expect(fake.socket.options.transports).toEqual(['websocket']);
  });

  it('loads again once for a burst, and only for its own topics', () => {
    const spots = vi.fn();
    const tickets = vi.fn();
    const stop = [live.subscribeLive(['spots'], spots), live.subscribeLive(['tickets'], tickets)];
    fake.socket.emit('changed', { topics: ['spots'] });
    fake.socket.emit('changed', { topics: ['spots'] });
    vi.advanceTimersByTime(400);
    expect(spots).toHaveBeenCalledTimes(1);
    expect(tickets).not.toHaveBeenCalled();
    stop.forEach((s) => s());
  });

  it('waits while the window is in the background', () => {
    const run = vi.fn();
    const stop = live.subscribeLive(['reviews'], run);
    doc.visibilityState = 'hidden';
    fake.socket.emit('changed', { topics: ['reviews'] });
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.listeners.visibilitychange();
    vi.advanceTimersByTime(400);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('after a dropped connection comes back, every page loads once', () => {
    const run = vi.fn();
    const stop = live.subscribeLive(['tickets'], run);
    fake.socket.emit('connect');
    vi.advanceTimersByTime(400);
    expect(run).not.toHaveBeenCalled(); // the first connect: the page has just loaded
    fake.socket.emit('connect');
    vi.advanceTimersByTime(400);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps a gap between loads for a page that asks for one', () => {
    const run = vi.fn();
    const stop = live.subscribeLive(['progress'], run, { gap: 5000 });
    fake.socket.emit('changed', { topics: ['progress'] });
    vi.advanceTimersByTime(400);
    fake.socket.emit('changed', { topics: ['progress'] });
    vi.advanceTimersByTime(4000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a refused session asks the session check, which says why', () => {
    fake.socket.active = false;
    fake.socket.emit('connect_error', new Error('signedInElsewhere'));
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'libot:session-check' }));
    vi.advanceTimersByTime(15_000);
    expect(fake.socket.connect).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { registerPwaServiceWorker, resolvePwaPaths } from './register-service-worker';

describe('PWA service worker registration', () => {
  it('resolves root and subpath deployments safely', () => {
    expect(resolvePwaPaths('/')).toEqual({ scriptUrl: '/sw.js', scope: '/' });
    expect(resolvePwaPaths('/ilka/')).toEqual({ scriptUrl: '/ilka/sw.js', scope: '/ilka/' });
    expect(resolvePwaPaths('ilka')).toEqual({ scriptUrl: '/ilka/sw.js', scope: '/ilka/' });
  });

  it('does not register outside an enabled build', async () => {
    const registrar = vi.fn(async () => undefined);

    const registered = await registerPwaServiceWorker({ enabled: false, registrar, baseUrl: '/' });

    expect(registered).toBe(false);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('registers the service worker at the Vite base path', async () => {
    const registrar = vi.fn(async () => undefined);

    const registered = await registerPwaServiceWorker({ enabled: true, registrar, baseUrl: '/expedition/' });

    expect(registered).toBe(true);
    expect(registrar).toHaveBeenCalledWith('/expedition/sw.js', '/expedition/');
  });

  it('reports registration failure without crashing application startup', async () => {
    const error = new Error('registration failed');
    const onError = vi.fn();

    const registered = await registerPwaServiceWorker({
      enabled: true,
      registrar: async () => { throw error; },
      onError,
    });

    expect(registered).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

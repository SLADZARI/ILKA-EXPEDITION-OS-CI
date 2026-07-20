type ServiceWorkerRegistrar = (scriptUrl: string, scope: string) => Promise<unknown>;

type RegisterPwaOptions = {
  enabled?: boolean;
  baseUrl?: string;
  registrar?: ServiceWorkerRegistrar | null;
  onError?: (error: unknown) => void;
};

export function resolvePwaPaths(baseUrl: string): { scriptUrl: string; scope: string } {
  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  const scope = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  return { scriptUrl: `${scope}sw.js`, scope };
}

function browserRegistrar(): ServiceWorkerRegistrar | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return (scriptUrl, scope) => navigator.serviceWorker.register(scriptUrl, { scope });
}

export async function registerPwaServiceWorker(options: RegisterPwaOptions = {}): Promise<boolean> {
  const enabled = options.enabled ?? import.meta.env.PROD;
  if (!enabled) return false;

  const registrar = options.registrar === undefined ? browserRegistrar() : options.registrar;
  if (!registrar) return false;

  const { scriptUrl, scope } = resolvePwaPaths(options.baseUrl ?? import.meta.env.BASE_URL);
  try {
    await registrar(scriptUrl, scope);
    return true;
  } catch (error) {
    options.onError?.(error);
    return false;
  }
}

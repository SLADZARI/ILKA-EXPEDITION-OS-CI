export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AccessTokenProvider = () => string | null | Promise<string | null>;

export type SupabaseHttpConfig = {
  supabase_url: string;
  public_api_key: string;
  get_access_token: AccessTokenProvider;
  fetch_impl?: FetchLike;
};

export function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  return globalThis.fetch.bind(globalThis);
}

export async function authenticatedHeaders(
  config: SupabaseHttpConfig,
): Promise<Record<string, string> | null> {
  const token = await config.get_access_token();
  if (!token) return null;
  return {
    apikey: config.public_api_key,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

export async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

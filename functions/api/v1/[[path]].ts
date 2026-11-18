type PagesContext = {
  request: Request;
  env: { API_ORIGIN: string };
};

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  let origin: URL;
  try {
    origin = new URL(env.API_ORIGIN);
  } catch {
    return Response.json(
      { error: { code: 'API_PROXY_NOT_CONFIGURED', message: 'API proxy is not configured.' } },
      { status: 503 },
    );
  }

  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    return Response.json(
      {
        error: { code: 'API_PROXY_NOT_CONFIGURED', message: 'API proxy configuration is invalid.' },
      },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const method = request.method.toUpperCase();
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init: RequestInit = { method, headers, redirect: 'manual' };
  if (method !== 'GET' && method !== 'HEAD') init.body = request.body;

  return fetch(new Request(target, init));
}

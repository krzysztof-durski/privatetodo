// Proxy /todo/api/* to /api/* for path-based deployment at codepapa.xyz/todo
export const onRequest: PagesFunction = async (context) => {
  const { request } = context
  const url = new URL(request.url)
  url.pathname = '/api' + url.pathname.replace(/^\/todo\/api/, '') || '/'
  return fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: 'half',
  } as RequestInit)
}

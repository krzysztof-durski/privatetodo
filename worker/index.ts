import type { D1Database } from '@cloudflare/workers-types'
import { handleApi } from './api-handler'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // API routes
    if (path.startsWith('/api')) {
      return handleApi(request, env)
    }

    // Todo app at /todo
    if (path.startsWith('/todo')) {
      // Map /todo and /todo/ to index.html (SPA entry)
      // Map /todo/xxx to /xxx (assets like vite.svg, assets/*)
      // SPA fallback: if asset 404s, serve index.html
      let assetPath: string
      if (path === '/todo' || path === '/todo/') {
        assetPath = '/index.html'
      } else {
        assetPath = path.slice(5) || '/' // /todo/vite.svg -> /vite.svg, /todo/assets/x -> /assets/x
      }

      const assetUrl = new URL(assetPath, url.origin)
      const assetRequest = new Request(assetUrl.toString(), {
        method: request.method,
        headers: request.headers,
      })
      const assetResponse = await env.ASSETS.fetch(assetRequest)
      // SPA fallback: 404 -> serve index.html for client-side routing
      if (assetResponse.status === 404 && !assetPath.startsWith('/assets/')) {
        const indexRequest = new Request(new URL('/index.html', url.origin).toString(), request)
        return env.ASSETS.fetch(indexRequest)
      }
      return assetResponse
    }

    return new Response('Not Found', { status: 404 })
  },
}

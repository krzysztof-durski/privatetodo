import type { D1Database } from '@cloudflare/workers-types'
import { handleApi } from '../../worker/api-handler'

export interface Env {
  DB: D1Database
}

export const onRequest: PagesFunction<Env> = async (context) => {
  return handleApi(context.request, context.env)
}

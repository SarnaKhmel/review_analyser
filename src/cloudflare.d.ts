// Minimal typings for the Workers runtime modules used by src/worker.ts.
declare module "cloudflare:node" {
  export function httpServerHandler(options: { port: number }): unknown;
}

declare module "cloudflare:workers" {
  export const env: { CACHE: import("./storage/TextStore").KvNamespace };
}

/**
 * RPC Utilities
 *
 * Single place to resolve the Polygon RPC URL so it is configurable via
 * environment instead of hardcoded across services.
 *
 * Priority: explicit argument > POLYGON_RPC_URL env > public fallback.
 */

export const DEFAULT_POLYGON_RPC_URL = 'https://polygon-rpc.com';

/**
 * Resolve the Polygon RPC URL.
 *
 * @param explicit - Explicitly configured URL (takes precedence)
 * @returns The RPC URL to use
 */
export function resolvePolygonRpcUrl(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit;
  const fromEnv =
    typeof globalThis.process !== 'undefined'
      ? globalThis.process.env?.POLYGON_RPC_URL
      : undefined;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return DEFAULT_POLYGON_RPC_URL;
}

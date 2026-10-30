/**
 * Each running copy of Tutellia keeps its connections open: on the free Prisma
 * plan (5 usable) one PC could fill the database (2026-10-21 incident). Each
 * copy now keeps 2 (not 1: a query made outside a running transaction would
 * wait for the transaction's own connection). pool_timeout: wait for a free
 * connection instead of failing at once. Values already in the address are kept.
 */
export function withPoolLimits(url: string | undefined): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return url;
  const params: Array<[string, string]> = [
    ["connection_limit", "2"],
    ["pool_timeout", "15"],
  ];
  const missing = params.filter(([key]) => !new RegExp(`[?&]${key}=`).test(url));
  if (missing.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return url + separator + missing.map(([key, value]) => `${key}=${value}`).join("&");
}

export function siteUrl(slug: string) {
  const domain = process.env.SITES_DOMAIN ?? "localhost";
  const scheme = process.env.SITES_SCHEME ?? "http";
  const port = process.env.SITES_PORT ? `:${process.env.SITES_PORT}` : "";
  return `${scheme}://${slug}.${domain}${port}`;
}

export function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "app";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

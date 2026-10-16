// Domain lookups over RDAP (the successor of WHOIS), straight from the browser.
// The IANA bootstrap file says which RDAP server answers for each TLD.

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL = 7 * 24 * 3600e3;
const DOMAIN_TTL = 12 * 3600e3;

// Nameserver suffix → who runs the DNS
const DNS_PROVIDERS = [
  ["ns.cloudflare.com", "Cloudflare"],
  ["googledomains.com", "Google Cloud DNS"],
  ["vercel-dns.com", "Vercel"],
  ["awsdns", "Amazon Route 53"],
  ["azure-dns", "Azure DNS"],
  ["digitalocean.com", "DigitalOcean"],
  ["hetzner.com", "Hetzner"],
  ["registrar-servers.com", "Namecheap"],
  ["domaincontrol.com", "GoDaddy"],
  ["nsone.net", "NS1"],
  ["netlify", "Netlify"],
  ["dns.br", "Registro.br"],
  ["squarespacedns.com", "Squarespace"],
  ["porkbun.com", "Porkbun"],
  ["gandi.net", "Gandi"],
];

// Registries that are also the only registrar for their TLD
const REGISTRY_REGISTRARS = { br: "Registro.br" };

function cached(key, ttl) {
  try {
    const hit = JSON.parse(localStorage.getItem(key));
    if (hit && Date.now() - hit.at < ttl) return hit.value;
  } catch { /* storage unavailable */ }
  return undefined;
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage unavailable */ }
}

let bootstrap;
async function rdapBase(domain) {
  bootstrap ??= cached("stackatlas:rdap-bootstrap", BOOTSTRAP_TTL) ?? fetch(BOOTSTRAP_URL)
    .then((r) => r.json())
    .then((json) => { store("stackatlas:rdap-bootstrap", json); return json; });
  const { services } = await bootstrap;
  const labels = domain.split(".");
  // Longest matching suffix wins (e.g. "com.br" before "br")
  for (let i = 1; i < labels.length; i++) {
    const suffix = labels.slice(i).join(".");
    const match = services.find(([tlds]) => tlds.includes(suffix));
    if (match) return match[1][0].replace(/\/?$/, "/");
  }
  return null;
}

function parse(domain, json) {
  const event = (action) => json.events?.find((e) => e.eventAction === action)?.eventDate ?? null;
  const registrarEntity = json.entities?.find((e) => e.roles?.includes("registrar"));
  const registrarName = registrarEntity?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3];
  const tld = domain.split(".").at(-1);
  const nameservers = (json.nameservers ?? []).map((ns) => ns.ldhName?.toLowerCase()).filter(Boolean);
  const dns = DNS_PROVIDERS.find(([suffix]) => nameservers.some((ns) => ns.includes(suffix)))?.[1] ?? null;
  return {
    registrar: registrarName ?? REGISTRY_REGISTRARS[tld] ?? null,
    registered: event("registration"),
    expires: event("expiration"),
    nameservers,
    dns,
  };
}

/** Looks a domain up, caching answers for 12 hours. Never throws. */
export async function lookupDomain(domain) {
  const key = `stackatlas:rdap:${domain}`;
  const hit = cached(key, DOMAIN_TTL);
  if (hit) return hit;
  try {
    const base = await rdapBase(domain);
    if (!base) return { error: "no RDAP server for this TLD" };
    const res = await fetch(`${base}domain/${encodeURIComponent(domain)}`, { headers: { Accept: "application/rdap+json" } });
    if (res.status === 404) return { error: "not registered" };
    if (!res.ok) return { error: `RDAP answered ${res.status}` };
    const info = parse(domain, await res.json());
    store(key, info);
    return info;
  } catch (e) {
    return { error: `RDAP lookup failed: ${e.message}` };
  }
}

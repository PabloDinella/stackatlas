// Built-in catalog of common services and the resources (products) they offer.
// Atlas files reference resources as "service/resource", e.g. "supabase/auth",
// and can add or override entries under `services:`.

export const CATEGORIES = {
  "dns-cdn": "DNS / CDN",
  hosting: "Hosting",
  backend: "Backend",
  storage: "Storage",
  infrastructure: "Infrastructure",
  distribution: "Distribution",
  other: "Other",
};

export const BUILTIN_SERVICES = {
  cloudflare: {
    name: "Cloudflare", category: "dns-cdn", url: "https://dash.cloudflare.com",
    resources: {
      dns: { name: "DNS / Proxy" }, pages: { name: "Pages" }, workers: { name: "Workers" },
      r2: { name: "R2" }, d1: { name: "D1" }, kv: { name: "KV" }, email: { name: "Email Routing" },
    },
  },
  supabase: {
    name: "Supabase", category: "backend", url: "https://supabase.com/dashboard",
    resources: {
      auth: { name: "Auth" }, database: { name: "Database" }, storage: { name: "Storage" },
      functions: { name: "Edge Functions" }, realtime: { name: "Realtime" },
    },
  },
  firebase: {
    name: "Firebase", category: "backend", url: "https://console.firebase.google.com",
    resources: {
      auth: { name: "Authentication" }, firestore: { name: "Firestore" }, database: { name: "Realtime Database" },
      storage: { name: "Storage" }, hosting: { name: "Hosting" }, functions: { name: "Functions" },
      messaging: { name: "Cloud Messaging" }, analytics: { name: "Analytics" }, crashlytics: { name: "Crashlytics" },
    },
  },
  vercel: {
    name: "Vercel", category: "hosting", url: "https://vercel.com/dashboard",
    resources: { hosting: { name: "Hosting" }, functions: { name: "Functions" }, blob: { name: "Blob" }, analytics: { name: "Analytics" } },
  },
  netlify: {
    name: "Netlify", category: "hosting", url: "https://app.netlify.com",
    resources: { hosting: { name: "Hosting" }, functions: { name: "Functions" }, forms: { name: "Forms" } },
  },
  github: {
    name: "GitHub", category: "hosting", url: "https://github.com",
    resources: { pages: { name: "Pages" }, actions: { name: "Actions" }, packages: { name: "Packages" } },
  },
  gitlab: {
    name: "GitLab", category: "hosting", url: "https://gitlab.com",
    resources: { pages: { name: "Pages" }, ci: { name: "CI/CD" }, registry: { name: "Container Registry" } },
  },
  aws: {
    name: "AWS", category: "infrastructure", url: "https://console.aws.amazon.com",
    resources: {
      s3: { name: "S3" }, cloudfront: { name: "CloudFront" }, lambda: { name: "Lambda" },
      ses: { name: "SES" }, route53: { name: "Route 53" }, ec2: { name: "EC2" },
    },
  },
  hetzner: {
    name: "Hetzner", category: "infrastructure", url: "https://console.hetzner.cloud",
    resources: { vps: { name: "Cloud server" }, dedicated: { name: "Dedicated server" }, storage: { name: "Storage Box" } },
  },
  digitalocean: {
    name: "DigitalOcean", category: "infrastructure", url: "https://cloud.digitalocean.com",
    resources: { droplet: { name: "Droplet" }, apps: { name: "App Platform" }, spaces: { name: "Spaces" } },
  },
  coolify: {
    name: "Coolify", category: "hosting",
    resources: { deploy: { name: "Deploy" } },
  },
  "fly-io": {
    name: "Fly.io", category: "hosting", url: "https://fly.io/dashboard",
    resources: { apps: { name: "Apps" } },
  },
  render: {
    name: "Render", category: "hosting", url: "https://dashboard.render.com",
    resources: { web: { name: "Web service" }, database: { name: "Postgres" } },
  },
  "google-play": {
    name: "Google Play", category: "distribution", url: "https://play.google.com/console",
    resources: { store: { name: "Store listing" } },
  },
  "app-store": {
    name: "App Store", category: "distribution", url: "https://appstoreconnect.apple.com",
    resources: { store: { name: "Store listing" } },
  },
};

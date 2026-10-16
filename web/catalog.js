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
  payments: "Payments",
  email: "Email",
  monitoring: "Monitoring",
  analytics: "Analytics",
  ai: "AI",
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
  railway: {
    name: "Railway", category: "hosting", url: "https://railway.com/dashboard",
    resources: { service: { name: "Service" }, database: { name: "Database" } },
  },
  neon: {
    name: "Neon", category: "backend", url: "https://console.neon.tech",
    resources: { postgres: { name: "Postgres" } },
  },
  upstash: {
    name: "Upstash", category: "backend", url: "https://console.upstash.com",
    resources: { redis: { name: "Redis" }, qstash: { name: "QStash" }, vector: { name: "Vector" } },
  },
  clerk: {
    name: "Clerk", category: "backend", url: "https://dashboard.clerk.com",
    resources: { auth: { name: "Auth" } },
  },
  stripe: {
    name: "Stripe", category: "payments", url: "https://dashboard.stripe.com",
    resources: { billing: { name: "Billing" }, checkout: { name: "Checkout" }, connect: { name: "Connect" } },
  },
  "lemon-squeezy": {
    name: "Lemon Squeezy", category: "payments", url: "https://app.lemonsqueezy.com",
    resources: { checkout: { name: "Checkout" }, subscriptions: { name: "Subscriptions" } },
  },
  paddle: {
    name: "Paddle", category: "payments", url: "https://vendors.paddle.com",
    resources: { billing: { name: "Billing" } },
  },
  resend: {
    name: "Resend", category: "email", url: "https://resend.com/overview",
    resources: { transactional: { name: "Transactional" }, broadcasts: { name: "Broadcasts" } },
  },
  postmark: {
    name: "Postmark", category: "email", url: "https://account.postmarkapp.com",
    resources: { transactional: { name: "Transactional" }, inbound: { name: "Inbound" } },
  },
  sentry: {
    name: "Sentry", category: "monitoring", url: "https://sentry.io",
    resources: { errors: { name: "Errors" }, performance: { name: "Performance" } },
  },
  betterstack: {
    name: "Better Stack", category: "monitoring", url: "https://betterstack.com",
    resources: { uptime: { name: "Uptime" }, logs: { name: "Logs" }, status: { name: "Status page" } },
  },
  plausible: {
    name: "Plausible", category: "analytics", url: "https://plausible.io/sites",
    resources: { analytics: { name: "Analytics" } },
  },
  posthog: {
    name: "PostHog", category: "analytics", url: "https://app.posthog.com",
    resources: { analytics: { name: "Product analytics" }, flags: { name: "Feature flags" }, replay: { name: "Session replay" } },
  },
  openai: {
    name: "OpenAI", category: "ai", url: "https://platform.openai.com",
    resources: { api: { name: "API" } },
  },
  anthropic: {
    name: "Anthropic", category: "ai", url: "https://console.anthropic.com",
    resources: { api: { name: "Claude API" } },
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

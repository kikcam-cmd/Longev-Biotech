import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const modules: any[] = [
  // ---- Compliance modules ----
  { resolve: "./src/modules/ruo-attestation" },
  { resolve: "./src/modules/lot-coa" },
  // ---- File storage for Certificates of Analysis (configure S3 for production) ----
  // {
  //   resolve: "@medusajs/medusa/file",
  //   options: {
  //     providers: [
  //       {
  //         resolve: "@medusajs/medusa/file-s3",
  //         id: "s3",
  //         options: {
  //           file_url: process.env.S3_FILE_URL,
  //           access_key_id: process.env.S3_ACCESS_KEY_ID,
  //           secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
  //           region: process.env.S3_REGION,
  //           bucket: process.env.S3_BUCKET,
  //           endpoint: process.env.S3_ENDPOINT,
  //         },
  //       },
  //     ],
  //   },
  // },
]

// Register the custom NMI high-risk payment provider ONLY when a security key is
// configured. NMI is a placeholder until a real high-risk processor is chosen, and
// its validateOptions() throws without a key — which crashes boot. Until a key is
// set, Medusa's built-in `pp_system_default` provider is still available for testing.
// Set NMI_SECURITY_KEY (real or any non-empty value) to activate this provider.
if (process.env.NMI_SECURITY_KEY) {
  modules.unshift({
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: [
        {
          resolve: "./src/modules/nmi",
          id: "nmi",
          options: {
            // NMI gateway "Security Key" (Settings → Security Keys in the NMI portal).
            // This is your OWN high-risk merchant account's key — Medusa never sees a card number.
            securityKey: process.env.NMI_SECURITY_KEY,
            // Optional: HMAC secret for verifying NMI webhooks.
            webhookSecret: process.env.NMI_WEBHOOK_SECRET,
            // NMI Payment API endpoint. Override for a sandbox/gateway emulator.
            apiUrl: process.env.NMI_API_URL || "https://secure.nmi.com/api/transact.php",
          },
        },
      ],
    },
  })
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  // Medusa Cloud usually sets this for you; harmless to declare for self-host/preview.
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules,
})

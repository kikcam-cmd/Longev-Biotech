import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const modules: any[] = [
  // ---- Compliance modules ----
  { resolve: "./src/modules/ruo-attestation" },
  { resolve: "./src/modules/lot-coa" },
]

// ---- File storage (product media + Certificates of Analysis) ----
// Register the S3 File module ONLY when a bucket is configured. Without S3, Medusa
// keeps its built-in local file provider (fine for dev; ephemeral on Cloud, so not
// for prod). This ONE provider serves BOTH uses, since Medusa's File module binds a
// single provider (no per-file bucket routing):
//   • Product images — uploaded access:"public", served via the stored public URL
//     (${file_url}/${key}). Requires the bucket to be publicly reachable (on R2: an
//     r2.dev public URL or a custom domain bound to the bucket).
//   • CoA PDFs — uploaded access:"private", served via short-lived signed URLs from
//     retrieveFile() in /store/lots/:lot/coa. NOTE: R2 access is bucket-level, so on a
//     public bucket a CoA is only protected by its unguessable random key, not a true
//     private ACL. If real CoA privacy is needed, move CoA to a separate private bucket
//     later (deferred — we don't have the real CoA file yet).
if (process.env.S3_BUCKET) {
  // aws-sdk v3 (>=3.729) sends CRC32 request checksums by default, which Cloudflare R2
  // (and several other S3-compatible stores) reject with "x-amz-checksum-algorithm ...
  // not implemented". Restore the legacy "only when the API requires it" behavior so
  // PutObject succeeds. Harmless on real AWS S3.
  const additionalClientConfig: Record<string, any> = {
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }
  // R2/MinIO sometimes need path-style addressing; toggle via env when required.
  if (process.env.S3_FORCE_PATH_STYLE === "true") {
    additionalClientConfig.forcePathStyle = true
  }

  modules.push({
    resolve: "@medusajs/medusa/file",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/file-s3",
          id: "s3",
          options: {
            // Public base URL of the bucket (used to build the stored public URL for
            // product images). R2: the r2.dev URL or your custom domain. No trailing slash.
            file_url: process.env.S3_FILE_URL,
            access_key_id: process.env.S3_ACCESS_KEY_ID,
            secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
            // R2 uses "auto"; AWS uses a real region (e.g. us-east-1).
            region: process.env.S3_REGION,
            bucket: process.env.S3_BUCKET,
            // S3-compatible endpoint. R2: https://<accountid>.r2.cloudflarestorage.com
            endpoint: process.env.S3_ENDPOINT,
            // Optional key prefix; default empty so product images land at the bucket root.
            prefix: process.env.S3_PREFIX ?? "",
            // Signed-URL lifetime in seconds (default 5 min) — keeps CoA links short-lived.
            download_file_duration: Number(process.env.S3_DOWNLOAD_DURATION ?? 300),
            additional_client_config: additionalClientConfig,
          },
        },
      ],
    },
  })
}

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
    // Max admin media-upload size in BYTES (default Medusa cap is 1MB, too small for
    // product photos). Baked into the admin bundle at `medusa build` — changing it
    // requires a rebuild + redeploy. Override via env; defaults to 25MB.
    maxUploadFileSize: Number(
      process.env.ADMIN_MAX_UPLOAD_FILE_SIZE ?? 25 * 1024 * 1024
    ),
  },
  modules,
})

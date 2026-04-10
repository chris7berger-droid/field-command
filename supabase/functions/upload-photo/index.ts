/**
 * upload-photo — Supabase Edge Function
 *
 * Generates a presigned R2 upload URL for the mobile app.
 * The app uploads directly to R2 using the presigned URL.
 *
 * Request:  POST { job_id, filename, content_type }
 * Response: { upload_url, public_url }
 */
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "fieldcommandphotos";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_SIZE_MB = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const { job_id, filename, content_type } = await req.json();
    if (!job_id || !filename || !content_type) {
      return new Response(JSON.stringify({ error: "Missing job_id, filename, or content_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_TYPES.includes(content_type)) {
      return new Response(JSON.stringify({ error: `Invalid content type: ${content_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build object key: jobs/{job_id}/{date}/{uuid}_{filename}
    const today = new Date().toISOString().slice(0, 10);
    const uuid = crypto.randomUUID();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `jobs/${job_id}/${today}/${uuid}_${safeFilename}`;

    // Generate presigned PUT URL using aws4fetch
    const r2 = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });

    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;

    const signedRequest = await r2.sign(
      new Request(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": content_type,
        },
      }),
      { aws: { signQuery: true, allHeaders: true }, expiresIn: 600 } // 10 min expiry
    );

    // The public URL for reading (will need R2 public access or a worker to serve)
    const public_url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;

    return new Response(
      JSON.stringify({
        upload_url: signedRequest.url,
        public_url,
        key,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("upload-photo error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

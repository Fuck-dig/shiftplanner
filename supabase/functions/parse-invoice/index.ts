// supabase/functions/parse-invoice/index.ts
// ─────────────────────────────────────────────────────────────
// Accepts a multipart/form-data POST with:
//   - file        : the invoice file (PDF or image)
//   - org_id      : the organisation UUID
//   - invoice_id  : (optional) UUID of an existing invoice row to attach to
//
// Returns JSON:
// {
//   vendor_name, vendor_ref, invoice_date, due_date,
//   subtotal, tax, total, category, notes,
//   items: [{ description, quantity, unit_price }]
// }
// ─────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fixed spending categories (keep in sync with the React component)
const CATEGORIES = [
  "Mad & Råvarer",
  "Drikkevarer",
  "Rengøring & Forbrugsstoffer",
  "Forsyninger",
  "Husleje & Leje",
  "Andet",
];

serve(async (req: Request) => {
  // ── CORS pre-flight ──────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth ─────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Parse form data ───────────────────────────────────
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    const orgId    = formData.get("org_id")    as string | null;

    if (!file || !orgId) {
      return json({ error: "file and org_id are required" }, 400);
    }

    // ── Verify user is a manager in this org ─────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (!membership) {
      return json({ error: "Forbidden" }, 403);
    }

    // ── Convert file to base64 for Claude's vision API ───
    const bytes      = await file.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const mimeType   = file.type || "application/pdf";

    // Claude vision only accepts images directly; for PDFs we send as a
    // document block using the "document" source type (claude-3-5 supports it).
    // For images we use the "image" source type.
    const isPdf = mimeType === "application/pdf";

    const contentBlock = isPdf
      ? {
          type: "document",
          source: {
            type:       "base64",
            media_type: "application/pdf",
            data:        base64Data,
          },
        }
      : {
          type: "image",
          source: {
            type:       "base64",
            media_type: mimeType,
            data:        base64Data,
          },
        };

    // ── Call Claude API ───────────────────────────────────
    const claudeApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!claudeApiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const prompt = `You are an invoice-parsing assistant for a restaurant.
Extract all relevant information from this invoice and return it as JSON.

The JSON must follow this exact structure (use null for missing fields, 0 for missing amounts):
{
  "vendor_name":   "string — supplier/vendor name",
  "vendor_ref":    "string | null — vendor's own invoice number or reference",
  "invoice_date":  "YYYY-MM-DD | null — date on the invoice",
  "due_date":      "YYYY-MM-DD | null — payment due date",
  "subtotal":      number,
  "tax":           number,
  "total":         number,
  "category":      "one of: ${CATEGORIES.join(" | ")}",
  "notes":         "string | null — any important notes or terms",
  "items": [
    {
      "description": "string",
      "quantity":    number,
      "unit_price":  number
    }
  ]
}

Rules:
- Choose the most fitting category from the list above based on the products/services.
- All amounts should be in the invoice's native currency (do not convert).
- Extract ALL line items visible on the invoice.
- Return ONLY the raw JSON object — no markdown, no explanation.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         claudeApiKey,
        "anthropic-version": "2023-06-01",
        // Enable PDF reading if available
        "anthropic-beta":    "pdfs-2024-09-25,prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-5",
        max_tokens: 2048,
        messages: [
          {
            role:    "user",
            content: [
              contentBlock,
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", errText);
      return json({ error: "Claude API error", detail: errText }, 502);
    }

    const claudeBody = await claudeRes.json();
    const rawText    = claudeBody?.content?.[0]?.text ?? "";

    // ── Parse Claude's JSON response ──────────────────────
    let parsed: Record<string, unknown>;
    try {
      // Claude sometimes wraps in ```json ... ```
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Claude response:", rawText);
      return json({
        error:    "Could not parse Claude response as JSON",
        raw_text: rawText,
      }, 422);
    }

    // ── Return structured result ──────────────────────────
    return json({
      ...parsed,
      raw_ai_json: claudeBody,   // full response stored for debugging
    });

  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

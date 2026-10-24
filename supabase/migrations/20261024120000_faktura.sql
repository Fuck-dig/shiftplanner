-- ============================================================
-- Faktura (Invoice) feature
-- Tables: invoices, invoice_items, invoice_emails
-- ============================================================

-- ─── 1. INVOICES ────────────────────────────────────────────
-- One row per invoice received (uploaded or email-forwarded).
CREATE TABLE IF NOT EXISTS invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Vendor info
  vendor_name  text NOT NULL DEFAULT '',
  vendor_ref   text,                    -- vendor's invoice number

  -- Dates
  invoice_date date,
  due_date     date,

  -- Totals (stored in the org's currency)
  subtotal     numeric(12,2) NOT NULL DEFAULT 0,
  tax          numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL DEFAULT 0,

  -- Category (fixed list; enforced in the app, not at DB level)
  -- Mad & Råvarer | Drikkevarer | Rengøring & Forbrugsstoffer |
  -- Forsyninger   | Husleje & Leje | Andet
  category     text NOT NULL DEFAULT 'Andet',

  -- Original file (if uploaded)
  file_url     text,
  file_name    text,

  -- AI parsing metadata
  parsed_by_ai boolean NOT NULL DEFAULT false,
  raw_ai_json  jsonb,                   -- full Claude response for debugging

  -- Notes / comments
  notes        text,

  -- Status
  status       text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','confirmed','paid')),

  -- Audit
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. INVOICE ITEMS ───────────────────────────────────────
-- Line items extracted from an invoice (by AI or manual entry).
CREATE TABLE IF NOT EXISTS invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL,           -- denormalised for RLS simplicity

  description  text NOT NULL DEFAULT '',
  quantity     numeric(10,3) NOT NULL DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  line_total   numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

  -- Optional: item-level category override
  category     text,

  sort_order   int NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. INVOICE EMAILS ──────────────────────────────────────
-- Email addresses per org where invoices are forwarded/received.
CREATE TABLE IF NOT EXISTS invoice_emails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email      text NOT NULL,
  label      text,                      -- e.g. "Regnskab", "Lager"
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

-- ─── INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS invoices_org_id_idx       ON invoices(org_id);
CREATE INDEX IF NOT EXISTS invoices_vendor_idx        ON invoices(org_id, vendor_name);
CREATE INDEX IF NOT EXISTS invoices_category_idx      ON invoices(org_id, category);
CREATE INDEX IF NOT EXISTS invoices_date_idx          ON invoices(org_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx  ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_org_idx      ON invoice_items(org_id);
CREATE INDEX IF NOT EXISTS invoice_emails_org_idx     ON invoice_emails(org_id);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'invoices_updated_at'
      AND tgrelid = 'invoices'::regclass
  ) THEN
    CREATE TRIGGER invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_emails ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a manager or owner of the org?
CREATE OR REPLACE FUNCTION is_manager_of(p_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner','manager')
  );
$$;

-- ── invoices ──
-- Managers/owners can do everything; staff read-only on their own org.
CREATE POLICY "invoices: managers full access"
  ON invoices FOR ALL
  USING  (is_manager_of(org_id))
  WITH CHECK (is_manager_of(org_id));

CREATE POLICY "invoices: staff read"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invoices.org_id
        AND user_id = auth.uid()
    )
  );

-- ── invoice_items ──
CREATE POLICY "invoice_items: managers full access"
  ON invoice_items FOR ALL
  USING  (is_manager_of(org_id))
  WITH CHECK (is_manager_of(org_id));

CREATE POLICY "invoice_items: staff read"
  ON invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invoice_items.org_id
        AND user_id = auth.uid()
    )
  );

-- ── invoice_emails ──
-- Only managers/owners can see and manage email addresses.
CREATE POLICY "invoice_emails: managers only"
  ON invoice_emails FOR ALL
  USING  (is_manager_of(org_id))
  WITH CHECK (is_manager_of(org_id));

-- ─── GRANTS ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_emails TO authenticated;
GRANT EXECUTE ON FUNCTION is_manager_of(uuid) TO authenticated;

-- ─── STORAGE BUCKET ─────────────────────────────────────────
-- Create a private bucket for invoice files (run once; safe to re-run).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  20971520,   -- 20 MB per file
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: managers upload/download their org's files.
-- Files are stored under {org_id}/{invoice_id}/{filename}
CREATE POLICY "invoice storage: managers upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices'
    AND is_manager_of((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "invoice storage: managers download"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND is_manager_of((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "invoice storage: managers delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'invoices'
    AND is_manager_of((storage.foldername(name))[1]::uuid)
  );

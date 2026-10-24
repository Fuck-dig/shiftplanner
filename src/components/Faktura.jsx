// src/components/Faktura.jsx
// Faktura (Invoice) tab — Phase 1: manual entry + AI PDF/image parsing
import { useState, useEffect, useRef, useCallback } from 'react';
import { T, isDark } from '../lib/constants';
import {
  fetchInvoices, saveInvoice, deleteInvoice,
  fetchInvoiceEmails, saveInvoiceEmail, deleteInvoiceEmail,
  uploadInvoiceFile, parseInvoiceWithAI,
  INVOICE_CATEGORIES, INVOICE_STATUSES,
} from '../lib/data';



const getStatusStyle = () => ({
  draft:     { bg: T.warningLight, color: T.warning,   label: 'Kladde'    },
  confirmed: { bg: T.accentLight,  color: T.accentText, label: 'Bekræftet' },
  paid:      { bg: T.successLight, color: T.success,   label: 'Betalt'   },
});

const CAT_COLORS = {
  'Mad & Råvarer':              { bg:'#EAF3FB', color:'#165C8C', dot:'#1A6FA8' },
  'Drikkevarer':                { bg:'#E8F5EE', color:'#236040', dot:'#2D7A4F' },
  'Rengøring & Forbrugsstoffer':{ bg:'#FBF3E5', color:'#6E4809', dot:'#8A5A10' },
  'Forsyninger':                { bg:'#F0EFFE', color:'#4039A0', dot:'#534AB7' },
  'Husleje & Leje':             { bg:'#FBE8F0', color:'#7A2848', dot:'#B03868' },
  'Andet':                      { bg:'#F2F1EF', color:'#4A4844', dot:'#5C5A58' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

// ─── Empty invoice form ───────────────────────────────────────────────────────
const emptyInvoice = () => ({
  id: null,
  vendorName: '', vendorRef: '',
  date: today(), dueDate: '',
  subtotal: '', tax: '', total: '',
  category: 'Andet',
  notes: '',
  status: 'draft',
  parsedByAI: false,
  raw_ai_json: null,
  fileUrl: null, fileName: null,
  items: [{ description: '', quantity: '1', unit_price: '', category: null }],
});

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function Faktura({ orgId, userId, currency = 'DKK', isManager = true }) {
  const [invoices, setInvoices]         = useState([]);
  const [emails,   setEmails]           = useState([]);
  const [loading,  setLoading]          = useState(true);
  const [error,    setError]            = useState(null);

  // UI state
  const [tab,       setTab]      = useState('list');   // 'list' | 'stats' | 'emails'
  const [sortBy,    setSortBy]   = useState('date');   // 'date' | 'vendor' | 'category' | 'total'
  const [sortDir,   setSortDir]  = useState('desc');
  const [filterCat, setFilterCat]= useState('');
  const [search,    setSearch]   = useState('');

  // Invoice form / modal
  const [formOpen,  setFormOpen]  = useState(false);
  const [formData,  setFormData]  = useState(emptyInvoice());
  const [saving,    setSaving]    = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [parseErr,  setParseErr]  = useState(null);
  const [selectedId,setSelectedId]= useState(null);

  // Email form
  const [emailForm,  setEmailForm]  = useState({ email: '', label: '' });
  const [emailSaving,setEmailSaving]= useState(false);

  const fileInputRef = useRef();

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const [inv, em] = await Promise.all([fetchInvoices(orgId), fetchInvoiceEmails(orgId)]);
      setInvoices(inv);
      setEmails(em);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // ── Sort + filter ──────────────────────────────────────────────────────────
  const visible = invoices
    .filter(inv => {
      if (filterCat && inv.category !== filterCat) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inv.vendorName.toLowerCase().includes(q) ||
          (inv.notes || '').toLowerCase().includes(q) ||
          inv.items.some(i => i.description.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      let va, vb;
      if (sortBy === 'vendor')   { va = a.vendorName; vb = b.vendorName; }
      else if (sortBy === 'category') { va = a.category; vb = b.category; }
      else if (sortBy === 'total')    { va = a.total;    vb = b.total; }
      else { va = a.date || ''; vb = b.date || ''; }

      const cmp = typeof va === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'da');
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = INVOICE_CATEGORIES.map(cat => ({
    category: cat,
    total: invoices.filter(i => i.category === cat).reduce((s, i) => s + i.total, 0),
    count: invoices.filter(i => i.category === cat).length,
  })).filter(s => s.count > 0)
    .sort((a, b) => b.total - a.total);

  const grandTotal = invoices.reduce((s, i) => s + i.total, 0);

  // ── Open form to edit / create ─────────────────────────────────────────────
  const openNew  = () => { setFormData(emptyInvoice()); setSelectedId(null); setParseErr(null); setFormOpen(true); };
  const openEdit = (inv) => {
    setFormData({
      ...inv,
      date:      inv.date      || today(),
      dueDate:   inv.dueDate   || '',
      subtotal:  inv.subtotal  ?? '',
      tax:       inv.tax       ?? '',
      total:     inv.total     ?? '',
      items: inv.items.length
        ? inv.items.map(i => ({ ...i, quantity: String(i.quantity), unit_price: String(i.unitPrice) }))
        : [{ description: '', quantity: '1', unit_price: '', category: null }],
    });
    setSelectedId(inv.id);
    setParseErr(null);
    setFormOpen(true);
  };

  // ── AI parse ──────────────────────────────────────────────────────────────
  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setParseErr(null);
    try {
      const parsed = await parseInvoiceWithAI(orgId, file);
      // Merge parsed data into form
      setFormData(prev => ({
        ...prev,
        vendorName:  parsed.vendor_name  || prev.vendorName,
        vendorRef:   parsed.vendor_ref   || prev.vendorRef,
        date:        parsed.invoice_date || prev.date,
        dueDate:     parsed.due_date     || prev.dueDate,
        subtotal:    parsed.subtotal != null ? String(parsed.subtotal) : prev.subtotal,
        tax:         parsed.tax      != null ? String(parsed.tax)      : prev.tax,
        total:       parsed.total    != null ? String(parsed.total)    : prev.total,
        category:    parsed.category    || prev.category,
        notes:       parsed.notes       || prev.notes,
        parsedByAI:  true,
        raw_ai_json: parsed.raw_ai_json || null,
        fileName:    file.name,
        // Store file for upload after save
        _pendingFile: file,
        items: (parsed.items || []).length
          ? parsed.items.map(i => ({
              description: i.description || '',
              quantity:    String(i.quantity ?? 1),
              unit_price:  String(i.unit_price ?? 0),
              category:    null,
            }))
          : prev.items,
      }));
    } catch (err) {
      setParseErr(err.message);
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.vendorName.trim()) return;
    setSaving(true);
    try {
      // Ensure a stable invoice_id exists before upload
      const tempId = formData.id || crypto.randomUUID();

      // Upload file if pending
      let fileUrl = formData.fileUrl;
      let fileName = formData.fileName;
      if (formData._pendingFile) {
        const res = await uploadInvoiceFile(orgId, tempId, formData._pendingFile);
        fileUrl  = res.url;
      }

      const payload = {
        id:          formData.id,
        vendor_name: formData.vendorName.trim(),
        vendor_ref:  formData.vendorRef  || null,
        invoice_date:formData.date       || null,
        due_date:    formData.dueDate    || null,
        subtotal:    parseFloat(formData.subtotal) || 0,
        tax:         parseFloat(formData.tax)      || 0,
        total:       parseFloat(formData.total)    || 0,
        category:    formData.category,
        file_url:    fileUrl,
        file_name:   fileName,
        parsed_by_ai:formData.parsedByAI,
        raw_ai_json: formData.raw_ai_json,
        notes:       formData.notes || null,
        status:      formData.status,
        items:       formData.items
          .filter(i => i.description.trim())
          .map(i => ({
            description: i.description.trim(),
            quantity:    parseFloat(i.quantity)   || 1,
            unit_price:  parseFloat(i.unit_price) || 0,
            category:    i.category || null,
          })),
      };

      await saveInvoice(orgId, payload, userId);
      await load();
      setFormOpen(false);
    } catch (err) {
      alert('Gemning fejlede: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (inv) => {
    if (!confirm(`Slet faktura fra ${inv.vendorName}?`)) return;
    try {
      await deleteInvoice(orgId, inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
    } catch (err) {
      alert('Sletning fejlede: ' + err.message);
    }
  };

  // ── Item helpers ───────────────────────────────────────────────────────────
  const setItem = (idx, field, val) =>
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: val } : it),
    }));
  const addItem   = () => setFormData(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: '1', unit_price: '', category: null }] }));
  const removeItem= (idx) => setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  // Auto-compute total from items
  const computedTotal = formData.items.reduce((s, i) => {
    const q = parseFloat(i.quantity) || 0;
    const p = parseFloat(i.unit_price) || 0;
    return s + q * p;
  }, 0);

  // ── Sort toggle ─────────────────────────────────────────────────────────────
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }) => sortBy === col
    ? <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
      Indlæser fakturaer…
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.danger }}>
      Fejl: {error}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: T.text, minHeight: '100vh', background: T.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Faktura</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: T.text3 }}>
            {invoices.length} faktura{invoices.length !== 1 ? 'er' : ''} · I alt {fmt(grandTotal)} {currency}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Tab buttons */}
          {[['list','Liste'], ['stats','Oversigt'], ['emails','E-mail']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === key ? T.accent : T.surfaceWarm,
              color:      tab === key ? '#fff'   : T.text2,
            }}>{label}</button>
          ))}
          {isManager && tab === 'list' && (
            <button onClick={openNew} style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600,
            }}>+ Ny faktura</button>
          )}
        </div>
      </div>

      {/* ── LIST TAB ───────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div style={{ padding: '20px 24px' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Søg leverandør, vare…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.text, outline: 'none', WebkitAppearance: 'none', appearance: 'none', colorScheme: 'normal' }}
            />
            <span style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                style={{ padding: '8px 28px 8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.text, cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none', outline: 'none', colorScheme: 'normal' }}
              >
                <option value="">Alle kategorier</option>
                {INVOICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{position:'absolute',right:9,pointerEvents:'none',fontSize:10,color:T.text2}}>▾</span>
            </span>
          </div>

          {/* Table */}
          <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.surfaceWarm }}>
                  {[['date','Dato'],['vendor','Leverandør'],['category','Kategori'],['total','Beløb']].map(([col, label]) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: T.text2, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', color: T.text2, fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 14px', color: T.text2, fontWeight: 600 }}>AI</th>
                  {isManager && <th />}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: T.text3 }}>
                    Ingen fakturaer endnu
                  </td></tr>
                )}
                {visible.map((inv, idx) => {
                  const cat = CAT_COLORS[inv.category] || CAT_COLORS['Andet'];
                  const st  = getStatusStyle()[inv.status] || getStatusStyle().draft;
                  return (
                    <tr key={inv.id} onClick={() => openEdit(inv)} style={{
                      borderTop: idx > 0 ? `1px solid ${T.border}` : 'none',
                      cursor: 'pointer',
                      background: selectedId === inv.id ? T.accentLight : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (selectedId !== inv.id) e.currentTarget.style.background = T.surfaceWarm; }}
                    onMouseLeave={e => { if (selectedId !== inv.id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '10px 14px', color: T.text2, whiteSpace: 'nowrap' }}>{fmtDate(inv.date)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        {inv.vendorName}
                        {inv.vendorRef && <span style={{ fontWeight: 400, color: T.text3, marginLeft: 6 }}>#{inv.vendorRef}</span>}
                        {inv.fileName  && <span style={{ color: T.text3, marginLeft: 6, fontSize: 11 }}>📎</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: cat.bg, color: cat.color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                          {inv.category}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmt(inv.total)} {currency}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 16 }} title={inv.parsedByAI ? 'Læst af AI' : 'Manuel indtastning'}>
                        {inv.parsedByAI ? '🤖' : ''}
                      </td>
                      {isManager && (
                        <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleDelete(inv)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: T.danger, fontSize: 13, padding: '2px 6px', borderRadius: 6,
                          }} title="Slet">✕</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STATS TAB ──────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <div style={{ padding: '20px 24px', maxWidth: 700 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Forbrug per kategori</h3>
          {stats.length === 0 && (
            <div style={{ color: T.text3, padding: 32, textAlign: 'center' }}>Ingen data endnu</div>
          )}
          {stats.map(s => {
            const pct = grandTotal > 0 ? (s.total / grandTotal) * 100 : 0;
            const cat = CAT_COLORS[s.category] || CAT_COLORS['Andet'];
            return (
              <div key={s.category} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.dot, display: 'inline-block' }} />
                    {s.category}
                    <span style={{ fontWeight: 400, fontSize: 12, color: T.text3 }}>({s.count} faktura{s.count !== 1 ? 'er' : ''})</span>
                  </span>
                  <span style={{ fontWeight: 700 }}>{fmt(s.total)} {currency} <span style={{ fontWeight: 400, color: T.text3, fontSize: 12 }}>({pct.toFixed(1)}%)</span></span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: T.border, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: cat.dot, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 24, padding: '14px 18px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
            <span>I alt</span>
            <span>{fmt(grandTotal)} {currency}</span>
          </div>
        </div>
      )}

      {/* ── EMAILS TAB ─────────────────────────────────────────────────── */}
      {tab === 'emails' && (
        <div style={{ padding: '20px 24px', maxWidth: 560 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Faktura e-mailadresser</h3>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: T.text3 }}>
            Tilføj de e-mailadresser, som fakturaer videresendes til. Phase 2 vil automatisk importere fakturaer fra disse adresser.
          </p>
          {/* Add email form */}
          {isManager && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <input
                placeholder="E-mailadresse"
                value={emailForm.email}
                onChange={e => setEmailForm(p => ({ ...p, email: e.target.value }))}
                style={{ flex: 2, minWidth: 180, padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.text, outline: 'none' }}
              />
              <input
                placeholder="Mærkat (f.eks. Regnskab)"
                value={emailForm.label}
                onChange={e => setEmailForm(p => ({ ...p, label: e.target.value }))}
                style={{ flex: 1, minWidth: 140, padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.text, outline: 'none' }}
              />
              <button
                disabled={!emailForm.email.includes('@') || emailSaving}
                onClick={async () => {
                  setEmailSaving(true);
                  try {
                    await saveInvoiceEmail(orgId, emailForm);
                    setEmailForm({ email: '', label: '' });
                    const updated = await fetchInvoiceEmails(orgId);
                    setEmails(updated);
                  } catch (err) { alert(err.message); }
                  finally { setEmailSaving(false); }
                }}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, opacity: emailSaving ? 0.6 : 1 }}
              >
                {emailSaving ? '…' : 'Tilføj'}
              </button>
            </div>
          )}
          {/* Email list */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {emails.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: T.text3, fontSize: 13 }}>Ingen adresser tilføjet endnu</div>
            )}
            {emails.map((em, idx) => (
              <div key={em.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: idx > 0 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{em.email}</div>
                  {em.label && <div style={{ fontSize: 12, color: T.text3 }}>{em.label}</div>}
                </div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: em.is_active ? T.successLight : T.dangerLight, color: em.is_active ? T.success : T.danger, fontWeight: 600 }}>
                  {em.is_active ? 'Aktiv' : 'Inaktiv'}
                </span>
                {isManager && (
                  <button onClick={async () => {
                    if (!confirm(`Fjern ${em.email}?`)) return;
                    await deleteInvoiceEmail(orgId, em.id);
                    setEmails(prev => prev.filter(e => e.id !== em.id));
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.danger, fontSize: 13, padding: '2px 6px', borderRadius: 6 }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INVOICE FORM MODAL ─────────────────────────────────────────── */}
      {formOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(33,27,21,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          zIndex: 1000, padding: '40px 16px', overflowY: 'auto',
        }} onClick={e => { if (e.target === e.currentTarget) setFormOpen(false); }}>
          <div style={{ background: T.surface, borderRadius: 16, width: '100%', maxWidth: 680, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 28 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {formData.id ? 'Rediger faktura' : 'Ny faktura'}
              </h3>
              <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.text3, lineHeight: 1 }}>✕</button>
            </div>

            {/* AI parse button */}
            <div style={{ marginBottom: 20, padding: '14px 16px', background: T.accentLight, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: T.accentText }}>
                🤖 Lad AI læse fakturaen
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: T.text2 }}>
                Upload en PDF eller et billede — Claude læser leverandør, beløb og varelinjer automatisk.
              </p>
              <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={handleFilePick} />
              <button
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.accent}`, background: '#fff', color: T.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: parsing ? 0.6 : 1 }}
              >
                {parsing ? '⏳ Analyserer…' : '📎 Vælg fil'}
              </button>
              {formData.fileName && !parsing && (
                <span style={{ marginLeft: 10, fontSize: 12, color: T.text2 }}>
                  {formData.parsedByAI ? '✅ ' : ''}{formData.fileName}
                </span>
              )}
              {parseErr && <div style={{ marginTop: 8, color: T.danger, fontSize: 12 }}>⚠ {parseErr}</div>}
            </div>

            {/* ── Main fields ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Leverandør *" style={{ gridColumn: '1 / -1' }}>
                <input value={formData.vendorName} onChange={e => setFormData(p => ({ ...p, vendorName: e.target.value }))}
                  placeholder="Navn på leverandør" style={inputStyle} />
              </Field>
              <Field label="Fakturanr.">
                <input value={formData.vendorRef} onChange={e => setFormData(p => ({ ...p, vendorRef: e.target.value }))}
                  placeholder="F.eks. INV-1234" style={inputStyle} />
              </Field>
              <Field label="Kategori">
                <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                  {INVOICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Fakturadato">
                <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Betalingsfrist">
                <input type="date" value={formData.dueDate} onChange={e => setFormData(p => ({ ...p, dueDate: e.target.value }))} style={inputStyle} />
              </Field>
            </div>

            {/* ── Line items ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text2, marginBottom: 8 }}>Varelinjer</div>
              {formData.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    placeholder="Beskrivelse"
                    value={item.description}
                    onChange={e => setItem(idx, 'description', e.target.value)}
                    style={{ ...inputStyle, flex: 3 }}
                  />
                  <input
                    placeholder="Antal"
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={e => setItem(idx, 'quantity', e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 60 }}
                  />
                  <input
                    placeholder="Stk.pris"
                    type="number"
                    min="0"
                    value={item.unit_price}
                    onChange={e => setItem(idx, 'unit_price', e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 80 }}
                  />
                  <span style={{ minWidth: 70, textAlign: 'right', fontSize: 13, color: T.text2 }}>
                    {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                  </span>
                  <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, fontSize: 16 }}>✕</button>
                </div>
              ))}
              <button onClick={addItem} style={{ background: 'none', border: `1px dashed ${T.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: T.text3, fontSize: 12, width: '100%', marginTop: 4 }}>
                + Tilføj linje
              </button>
            </div>

            {/* ── Totals ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <Field label="Subtotal">
                <input type="number" value={formData.subtotal} onChange={e => setFormData(p => ({ ...p, subtotal: e.target.value }))}
                  placeholder="0.00" style={inputStyle} />
              </Field>
              <Field label="Moms">
                <input type="number" value={formData.tax} onChange={e => setFormData(p => ({ ...p, tax: e.target.value }))}
                  placeholder="0.00" style={inputStyle} />
              </Field>
              <Field label="Total">
                <input type="number" value={formData.total || (computedTotal > 0 ? computedTotal.toFixed(2) : '')}
                  onChange={e => setFormData(p => ({ ...p, total: e.target.value }))}
                  placeholder={computedTotal > 0 ? computedTotal.toFixed(2) : '0.00'} style={{ ...inputStyle, fontWeight: 700 }} />
              </Field>
            </div>

            {/* Status + notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 20 }}>
              <Field label="Status">
                <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                  {INVOICE_STATUSES.map(s => <option key={s} value={s}>{getStatusStyle()[s]?.label || s}</option>)}
                </select>
              </Field>
              <Field label="Noter">
                <input value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Frivillige noter" style={inputStyle} />
              </Field>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setFormOpen(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'none', cursor: 'pointer', fontSize: 13, color: T.text2, fontWeight: 600 }}>
                Annuller
              </button>
              <button
                disabled={saving || !formData.vendorName.trim()}
                onClick={handleSave}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Gemmer…' : formData.id ? 'Gem ændringer' : 'Opret faktura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small field wrapper ─────────────────────────────────────────────────────
function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9C9088', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #E6DDCD',
  background: '#FFFEFB',
  fontSize: 13,
  color: '#211B15',
  outline: 'none',
  boxSizing: 'border-box',
};

// Small helpers for building standalone HTML documents (schedule print view,
// costs report) that get opened in a new tab rather than rendered as React.
// Kept separate from the app's own components since nothing here touches
// React at all.

// Names/roles/org names are user-entered free text — anything going into a
// hand-built HTML string needs escaping first.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

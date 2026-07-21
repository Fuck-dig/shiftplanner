// Shared role-ordering helpers. Role display/group order is personal — each
// person (manager or employee) drags their own Team view into whatever order
// they like, persisted to localStorage per-browser (see lib/storage.js's
// load/save, keyed sa2_roleOrder_<orgId>) — NOT synced to Supabase, unlike
// role colours (lib/data.js's fetchRoleStyles/saveRoleStyles). These two
// functions used to be reimplemented identically in both App.jsx and
// EmployeeView.jsx.

// Merges a person's saved role order with whatever roles actually exist
// right now (from roleStyles keys on the manager side, or discovered from
// blocks/employees on the employee side). Self-healing: any role that isn't
// in the saved order yet (newly added, or the order predates it) gets
// appended at the end rather than being dropped.
export function mergeRoleOrder(roleOrder, availableRoles){
  return [
    ...roleOrder.filter(r=>availableRoles.includes(r)),
    ...availableRoles.filter(r=>!roleOrder.includes(r)),
  ];
}

// Moves draggedRole to just before targetRole within allRoles, returning a
// new array — or the exact same `allRoles` reference (safe to compare with
// ===) if the drag was a no-op (missing role, dropped on itself, or an
// unknown target).
export function reorderRoleList(allRoles, draggedRole, targetRole){
  if(!draggedRole || draggedRole===targetRole) return allRoles;
  const cur=allRoles.filter(r=>r!==draggedRole);
  const idx=cur.indexOf(targetRole);
  if(idx<0) return allRoles;
  return [...cur.slice(0,idx), draggedRole, ...cur.slice(idx)];
}

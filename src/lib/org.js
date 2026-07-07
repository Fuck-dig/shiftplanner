import { supabase } from './supabase';

// All organizations (restaurants) the current user belongs to, oldest first.
// Two plain queries (no relational embed) so it's robust to schema-cache state.
export async function listOrgs(){
  const { data: ms, error } = await supabase
    .from('memberships')
    .select('org_id, role, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!ms || ms.length === 0) return [];

  const ids = ms.map(m => m.org_id);
  const { data: orgRows, error: e2 } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', ids);
  if (e2) throw e2;

  const byId = Object.fromEntries((orgRows || []).map(o => [o.id, o]));
  return ms
    .filter(m => byId[m.org_id])
    .map(m => ({ id: m.org_id, name: byId[m.org_id].name, role: m.role }));
}

// Create a restaurant + owner membership atomically (server-side RPC). Returns new org id.
export async function createOrg(name){
  const { data, error } = await supabase.rpc('create_organization', { org_name: name });
  if (error) throw error;
  return data;
}
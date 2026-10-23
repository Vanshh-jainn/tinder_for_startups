import 'server-only';
import { redactSecrets } from '@/lib/security';
import { db } from './supabase';

type Row = Record<string, unknown> | null;

// ponytail: written after the change, not in the same transaction. Move rule-critical
// mutations (marketplace, qualification) into SQL functions that audit atomically.
export async function audit(actor: string, action: string, entity: string, entityId: string, before: Row, after: Row) {
  const { error } = await db()
    .from('audit_log')
    .insert({
      actor,
      action,
      entity,
      entity_id: entityId,
      before: redactSecrets(before),
      after: redactSecrets(after),
    });
  if (error) throw error;
}

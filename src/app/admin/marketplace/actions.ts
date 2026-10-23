'use server';

import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { requireAdmin } from '@/server/auth';
import { adminResult, rpc } from '@/server/queries';

const schema = z.object({ teamId: z.uuid() });

export async function voidInvestments(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid team.' };
  return adminResult(
    await rpc('void_investments', { p_admin: adminId, p_team: parsed.data.teamId }),
    'Voided. The team can redo its allocation while the marketplace is open.',
  );
}

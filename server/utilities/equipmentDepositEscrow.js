const supabase = require('../db/supabase');

const ESCROW_TABLE = 'equipment_security_deposit_escrow';

function isEquipmentDeposit(transaction) {
  return transaction?.type === 'deposit' && transaction.related_type === 'equipment_rental' && transaction.related_id;
}

async function findEquipmentDepositEscrow(transaction) {
  if (!isEquipmentDeposit(transaction)) return { applicable: false, escrow: null, error: null };

  const { data: escrow, error } = await supabase
    .from(ESCROW_TABLE)
    .select('escrow_id, request_id, renter_id, amount, status')
    .eq('request_id', transaction.related_id)
    .maybeSingle();

  if (error) return { applicable: true, escrow: null, error: error.message };
  if (!escrow) return { applicable: true, escrow: null, error: 'Equipment security deposit escrow record was not found.' };
  if (escrow.renter_id !== transaction.user_id ||
      Math.round(Number(escrow.amount) * 100) !== Math.round(Math.abs(Number(transaction.amount)) * 100)) {
    return { applicable: true, escrow: null, error: 'Equipment security deposit escrow does not match the transaction.' };
  }

  return { applicable: true, escrow, error: null };
}

async function transitionEquipmentDepositEscrow(escrow, status) {
  const now = new Date().toISOString();
  const updates = { status, updated_at: now };
  if (status === 'released') updates.released_at = now;

  const { data, error } = await supabase
    .from(ESCROW_TABLE)
    .update(updates)
    .eq('escrow_id', escrow.escrow_id)
    .eq('status', 'held')
    .select('escrow_id, status')
    .maybeSingle();

  if (error) return { error: error.message };
  if (data?.status === status) return { data };

  const { data: current, error: lookupError } = await supabase
    .from(ESCROW_TABLE)
    .select('escrow_id, status')
    .eq('escrow_id', escrow.escrow_id)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (current?.status === status) return { data: current };
  return { error: 'Equipment security deposit escrow status changed before the update completed.' };
}

module.exports = { findEquipmentDepositEscrow, transitionEquipmentDepositEscrow };

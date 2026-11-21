const supabase = require('../db/supabase');
const { entityIdToken } = require('./entityIds');

// Human-readable description of what a report is about, so the reported user
// can tell which of their listings/jobs the warning refers to when appealing.
const TARGET_LABELS = {
  equipment_listing: {
    kind: 'Listing', prefix: 'LST-', table: 'equipment_listings',
    idColumn: 'listing_id', nameColumn: 'equipment_name',
  },
  job_post: {
    kind: 'Job post', prefix: 'JOB-', table: 'job_posts',
    idColumn: 'job_post_id', nameColumn: 'job_title',
  },
  job_proposal: {
    kind: 'Proposal', prefix: 'PRP-', table: 'job_proposals',
    idColumn: 'proposal_id', nameColumn: 'proposal_title',
  },
  job_match: {
    kind: 'Job match', prefix: 'MCH-', table: 'job_matches', idColumn: 'job_match_id',
    foreignColumn: 'job_post_id', foreignTable: 'job_posts', foreignNameColumn: 'job_title',
  },
  equipment_rental: {
    kind: 'Rental', prefix: 'RNT-', table: 'equipment_rentals', idColumn: 'rental_id',
    foreignColumn: 'listing_id', foreignTable: 'equipment_listings', foreignNameColumn: 'equipment_name',
  },
  equipment_request: {
    kind: 'Rental request', prefix: 'REQ-', table: 'equipment_requests', idColumn: 'request_id',
    foreignColumn: 'listing_id', foreignTable: 'equipment_listings', foreignNameColumn: 'equipment_name',
  },
};

/**
 * Returns a Map of target_id -> "Listing: Excavator for rent (LST-123456)".
 * Batches one query per table so a full report list stays cheap.
 */
async function loadTargetLabels(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const definition = TARGET_LABELS[entry.target_type];
    if (!definition || !entry.target_id) continue;
    if (!groups.has(definition.table)) groups.set(definition.table, { definition, ids: new Set() });
    groups.get(definition.table).ids.add(entry.target_id);
  }
  if (!groups.size) return new Map();

  const rows = new Map();
  await Promise.all([...groups.values()].map(async ({ definition, ids }) => {
    const columns = [definition.idColumn, definition.nameColumn, definition.foreignColumn]
      .filter(Boolean).join(', ');
    const { data, error } = await supabase
      .from(definition.table)
      .select(columns)
      .in(definition.idColumn, [...ids]);
    if (error || !data) return;
    data.forEach((row) => rows.set(`${definition.table}:${row[definition.idColumn]}`, row));
  }));

  const foreignGroups = new Map();
  for (const { definition } of groups.values()) {
    if (!definition.foreignColumn) continue;
    if (!foreignGroups.has(definition.foreignTable)) {
      foreignGroups.set(definition.foreignTable, { definition, ids: new Set() });
    }
    const group = foreignGroups.get(definition.foreignTable);
    for (const row of rows.values()) {
      if (row[definition.foreignColumn]) group.ids.add(row[definition.foreignColumn]);
    }
  }
  const foreignNames = new Map();
  await Promise.all([...foreignGroups.values()].map(async ({ definition, ids }) => {
    const { data, error } = await supabase
      .from(definition.foreignTable)
      .select(`${definition.foreignColumn === 'job_post_id' ? 'job_post_id' : 'listing_id'}, ${definition.foreignNameColumn}`)
      .in(definition.foreignColumn === 'job_post_id' ? 'job_post_id' : 'listing_id', [...ids]);
    if (error || !data) return;
    data.forEach((row) => foreignNames.set(
      `${definition.foreignTable}:${row[definition.foreignColumn === 'job_post_id' ? 'job_post_id' : 'listing_id']}`,
      row[definition.foreignNameColumn],
    ));
  }));

  const labels = new Map();
  for (const entry of entries) {
    const definition = TARGET_LABELS[entry.target_type];
    if (!definition || !entry.target_id) continue;
    const row = rows.get(`${definition.table}:${entry.target_id}`);
    const token = entityIdToken(entry.target_id, definition.prefix);
    let name = row?.[definition.nameColumn] || null;
    if (!name && row?.[definition.foreignColumn]) {
      name = foreignNames.get(`${definition.foreignTable}:${row[definition.foreignColumn]}`) || null;
    }
    labels.set(entry.target_id, name
      ? `${definition.kind}: ${name} (${token})`
      : `${definition.kind} (${token})`);
  }
  return labels;
}

module.exports = { loadTargetLabels };

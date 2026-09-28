import { list as listEscalated, resolve as resolveEscalated } from './escalatedJobs';
import { listDisputed, resolveDispute } from './completions';

export async function listJobReviewQueue(params = {}) {
  const [escalated, disputed] = await Promise.all([
    listEscalated(params),
    listDisputed(params),
  ]);

  const escalatedItems = (escalated?.data ?? escalated ?? []).map((item) => ({
    ...item,
    _source: 'escalated',
  }));

  const disputedItems = (disputed?.data ?? disputed ?? []).map((item) => ({
    ...item,
    _source: 'disputed',
  }));

  return [...escalatedItems, ...disputedItems].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

export async function resolveJobReviewItem(id, payload, source) {
  if (source === 'disputed') {
    return resolveDispute(id, payload);
  }
  return resolveEscalated(id, payload);
}

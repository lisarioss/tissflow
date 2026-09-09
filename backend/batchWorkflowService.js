const transitions = {
  draft: new Set(['draft', 'ready', 'error']),
  ready: new Set(['draft', 'ready', 'sent', 'error']),
  sent: new Set(['sent', 'processing', 'approved', 'error']),
  processing: new Set(['processing', 'approved', 'error']),
  approved: new Set(['approved', 'error']),
  error: new Set(['error', 'draft'])
};

function canTransitionBatch(currentStatus, nextStatus) {
  return Boolean(transitions[currentStatus]?.has(nextStatus));
}

module.exports = { canTransitionBatch };

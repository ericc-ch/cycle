export const title = 'Cycle Sync Protocol'

const deviceLabel = (pc, retries) => {
  if (pc === 'error') return 'Conflict error'
  if (pc === 'retry_wait') return 'Waiting to retry'
  if (pc === 'fetched') return `Syncing (retry ${retries})`
  return 'Idle'
}

export const state = v => ({
  'Device 1': deviceLabel(v.pc.d1, v.retries.d1),
  'Device 2': deviceLabel(v.pc.d2, v.retries.d2),
})

export const step = (action, _from, to) => {
  switch (action) {
    case 'LocalEdit':
      return 'device saves an edit'
    case 'StartSyncGet':
      return 'device pulls from server'
    case 'SyncPutSuccess':
      return 'device uploads merged vault'
    case 'SyncPutConflict':
      if (to.pc.d1 === 'error' || to.pc.d2 === 'error') {
        return 'upload hits 409 and gives up'
      }
      return 'upload hits 409 and merges'
    case 'Done':
      return 'all devices synced'
    default:
      return action
  }
}

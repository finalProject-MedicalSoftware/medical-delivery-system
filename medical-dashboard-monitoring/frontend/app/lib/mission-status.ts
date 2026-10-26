import { Dictionary } from './dictionaries';

export function statusPillClass(status: string) {
  switch (status) {
    case 'SUCCEEDED': return 'status-success';
    case 'EXECUTING': return 'status-info';
    case 'CREATED': case 'PENDING': return 'status-warning';
    case 'CANCELLED': case 'FAILED': return 'status-danger';
    default: return 'status-warning';
  }
}

export function missionStatusLabel(status: string, dict: Dictionary) {
  const t = dict.missions;
  switch (status) {
    case 'CREATED': return t.statusCreated;
    case 'PENDING': return t.statusPending;
    case 'EXECUTING': return t.statusExecuting;
    case 'SUCCEEDED': return t.statusSucceeded;
    case 'CANCELLED': return t.statusCancelled;
    case 'FAILED': return t.statusFailed;
    default: return status;
  }
}

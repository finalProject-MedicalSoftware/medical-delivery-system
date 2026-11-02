import { Dictionary } from './dictionaries';

export function statusPillClass(status: string) {
  switch (status) {
    case 'SUCCEEDED': return 'status-success';
    case 'EXECUTING': return 'status-info';
    case 'QUEUED': return 'status-warning';
    case 'CREATED': case 'PENDING': case 'SUBMITTED': case 'BACKEND_ACCEPTED': case 'ROBOT_ACKNOWLEDGED':
      return 'status-warning';
    case 'CANCELLED': case 'FAILED': return 'status-danger';
    default: return 'status-warning';
  }
}

export function missionStatusLabel(status: string, dict: Dictionary) {
  const t = dict.missions;
  switch (status) {
    case 'SUBMITTED': return t.statusSubmitted;
    case 'BACKEND_ACCEPTED': return t.statusBackendAccepted;
    case 'ROBOT_ACKNOWLEDGED': return t.statusRobotAcknowledged;
    case 'QUEUED': return t.statusQueued;
    case 'CREATED': return t.statusCreated;
    case 'PENDING': return t.statusPending;
    case 'EXECUTING': return t.statusExecuting;
    case 'SUCCEEDED': return t.statusSucceeded;
    case 'CANCELLED': return t.statusCancelled;
    case 'FAILED': return t.statusFailed;
    default: return status;
  }
}

// Color constants for ink components
// Using ANSI color codes that ink supports
export const colors = {
  // Pod status colors (ANSI color codes)
  running: '#22c55e', // green
  pending: '#eab308', // yellow
  failed: '#ef4444', // red
  succeeded: '#6b7280', // gray
  unknown: '#6b7280', // gray
  terminating: '#f97316', // orange
  completed: '#10b981', // emerald (for job completed)

  // Workload colors
  deployment: '#3b82f6', // blue
  statefulSet: '#8b5cf6', // purple
  daemonSet: '#ef4444', // red
  job: '#f59e0b', // amber
  cronJob: '#10b981', // emerald

  // Service colors
  service: '#3b82f6', // blue
  clusterIP: '#3b82f6', // blue
  nodePort: '#22c55e', // green
  loadBalancer: '#8b5cf6', // purple
  externalName: '#f59e0b', // amber

  // Resource colors
  namespace: '#06b6d4', // cyan
  workload: '#d946ef', // magenta
  ingress: '#ec4899', // pink
  configMap: '#f97316', // orange
  volume: '#14b8a6', // teal

  // Volume type colors
  volumePVC: '#06b6d4', // cyan
  volumeHP: '#eab308', // yellow
  volumeED: '#ffffff', // white
  volumeCM: '#3b82f6', // blue
  volumeSEC: '#ef4444', // red
  volumePROJ: '#d946ef', // magenta
  volumeDAPI: '#ffffff', // white

  // UI colors
  header: '#06b6d4', // cyan
  tree: '#6b7280', // gray
  error: '#ef4444', // red
  warning: '#eab308', // yellow
  ip: '#eab308', // yellow
  general: '#22c55e', // green
};

let useColors = true;

export function setUseColors(enabled: boolean): void {
  useColors = enabled;
}

export function getPodStatusColor(phase: string, ready?: string): string {
  if (!useColors) return '';

  switch (phase) {
    case 'Running':
      // Check if pod is running but not ready (e.g., 0/1, 1/2)
      if (ready) {
        const [readyContainers, totalContainers] = ready.split('/').map(Number);
        if (readyContainers < totalContainers) {
          return colors.pending;
        }
      }
      return colors.running;
    case 'Pending':
      return colors.pending;
    case 'Failed':
      return colors.failed;
    case 'Succeeded':
      return colors.succeeded;
    case 'Terminating':
      return colors.terminating;
    default:
      return colors.unknown;
  }
}

export function getColor(colorName: keyof typeof colors): string {
  if (!useColors) return '';
  return colors[colorName];
}

export function getVolumeTypeColor(volumeType: string): string {
  if (!useColors) return '';
  switch (volumeType) {
    case 'PersistentVolumeClaim':
      return colors.volumePVC;
    case 'hostPath':
      return colors.volumeHP;
    case 'emptyDir':
      return colors.volumeED;
    case 'ConfigMap':
      return colors.volumeCM;
    case 'Secret':
      return colors.volumeSEC;
    case 'projected':
      return colors.volumePROJ;
    case 'downwardAPI':
      return colors.volumeDAPI;
    default:
      return colors.volume;
  }
}

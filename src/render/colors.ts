// Color constants for ink components
// Using ANSI color codes that ink supports
export const colors = {
  // Pod status colors (ANSI color codes)
  running: '#22c55e', // green
  pending: '#eab308', // yellow
  failed: '#ef4444', // red
  succeeded: '#6b7280', // gray
  unknown: '#6b7280', // gray
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

export function getPodStatusColor(phase: string): string {
  if (!useColors) return '';

  switch (phase) {
    case 'Running':
      return colors.running;
    case 'Pending':
      return colors.pending;
    case 'Failed':
      return colors.failed;
    case 'Succeeded':
      return colors.succeeded;
    default:
      return colors.unknown;
  }
}

export function getColor(colorName: keyof typeof colors): string {
  if (!useColors) return '';
  return colors[colorName];
}

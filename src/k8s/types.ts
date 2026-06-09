// Raw K8s resource types - re-exported from @kubernetes/client-node for convenience
export * from '@kubernetes/client-node';

// System and plugin namespaces that should be grouped together
export const SYSTEM_NAMESPACES = [
  'kube-system',
  'kube-public',
  'kube-node-lease',
  'gatekeeper-system',
  'cert-manager',
  'ingress-nginx',
  'istio-system',
  'linkerd',
  'calico-system',
  'tigera-operator',
  'kube-dns',
  'gke-*',
  'gmp-public',
];

// Check if a namespace is a system namespace (supports wildcard patterns)
export function isSystemNamespace(ns: string): boolean {
  return SYSTEM_NAMESPACES.some((pattern) => {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return ns.startsWith(prefix);
    }
    return ns === pattern;
  });
}

export interface FetchOptions {
  namespace?: string | string[];
  allNamespaces?: boolean;
  selector?: string;
}

export interface RawClusterData {
  namespaces: import('@kubernetes/client-node').V1Namespace[];
  deployments: import('@kubernetes/client-node').V1Deployment[];
  replicaSets: import('@kubernetes/client-node').V1ReplicaSet[];
  statefulSets: import('@kubernetes/client-node').V1StatefulSet[];
  daemonSets: import('@kubernetes/client-node').V1DaemonSet[];
  jobs: import('@kubernetes/client-node').V1Job[];
  cronJobs: import('@kubernetes/client-node').V1CronJob[];
  pods: import('@kubernetes/client-node').V1Pod[];
  services: import('@kubernetes/client-node').V1Service[];
  ingresses: import('@kubernetes/client-node').V1Ingress[];
  configMaps: import('@kubernetes/client-node').V1ConfigMap[];
  secrets: import('@kubernetes/client-node').V1Secret[];
  serverVersion?: string;
  nodeCount?: number;
}

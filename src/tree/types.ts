import type {
  PodMetrics,
  AggregatedMetrics,
  ClusterMetrics,
  ServiceTraffic,
} from '../metrics/types.js';

export type PodPhase = 'Running' | 'Pending' | 'Failed' | 'Succeeded' | 'Unknown' | 'Terminating';

export type ResourceKind =
  | 'Deployment'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'Job'
  | 'CronJob'
  | 'ReplicaSet';

export interface PodNode {
  name: string;
  phase: PodPhase;
  nodeName: string;
  ip: string;
  restarts: number;
  reason?: string;
  ready: string;
  age: string;
  metrics?: PodMetrics; // NEW: optional, absent khi metrics-server không khả dụng
  labels?: string; // NEW: pod labels
  ports?: string[]; // NEW: container ports
}

export interface ServiceNode {
  name: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP: string;
  ports: string[];
  nodePort?: number;
  targetPort?: string; // NEW: target port
  externalIp?: string;
  externalIpPending?: boolean;
  traffic?: ServiceTraffic; // NEW: CONN + RPS
  selector?: string; // NEW: label selector
}

export interface IngressNode {
  name: string;
  host: string;
  paths: string[];
  tls: boolean;
  backend?: string;
  tlsSecretMissing?: boolean;
}

export interface ConfigMapNode {
  name: string;
  keys: number;
}

export interface ReplicaSetNode {
  name: string;
  ready: string;
  pods: PodNode[];
  selector?: string; // NEW: label selector
}

export interface WorkloadNode {
  name: string;
  kind: ResourceKind;
  ready: string;
  image: string;
  replicaSets?: ReplicaSetNode[];
  pods?: PodNode[];
  lastScheduleTime?: string;
  nextScheduleTime?: string;
  duration?: string;
  aggregatedMetrics?: AggregatedMetrics; // NEW: sum từ tất cả pods con
  selector?: string; // NEW: label selector
}

export interface NamespaceNode {
  name: string;
  status: 'Active' | 'Terminating';
  workloads: WorkloadNode[];
  services: ServiceNode[];
  ingresses: IngressNode[];
  configMaps: ConfigMapNode[];
  orphanPods?: PodNode[]; // Pods not owned by any workload
}

export interface ClusterTree {
  contextName: string;
  serverVersion: string;
  nodeCount: number;
  namespaces: NamespaceNode[];
  fetchedAt: Date;
  clusterMetrics?: ClusterMetrics; // NEW: node-level aggregation
}

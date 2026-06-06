import type {
  PodMetrics,
  AggregatedMetrics,
  ClusterMetrics,
  ServiceTraffic,
} from '../metrics/types.js';

export type PodPhase = 'Running' | 'Pending' | 'Failed' | 'Succeeded' | 'Unknown';

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
}

export interface ServiceNode {
  name: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP: string;
  ports: string[];
  nodePort?: number;
  externalIp?: string;
  externalIpPending?: boolean;
  traffic?: ServiceTraffic; // NEW: CONN + RPS
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
}

export interface NamespaceNode {
  name: string;
  status: 'Active' | 'Terminating';
  workloads: WorkloadNode[];
  services: ServiceNode[];
  ingresses: IngressNode[];
  configMaps: ConfigMapNode[];
}

export interface ClusterTree {
  contextName: string;
  serverVersion: string;
  nodeCount: number;
  namespaces: NamespaceNode[];
  fetchedAt: Date;
  clusterMetrics?: ClusterMetrics; // NEW: node-level aggregation
}

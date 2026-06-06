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
}

export interface ServiceNode {
  name: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP: string;
  ports: string[];
}

export interface IngressNode {
  name: string;
  host: string;
  paths: string[];
  tls: boolean;
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
}

export interface NamespaceNode {
  name: string;
  status: 'Active' | 'Terminating';
  workloads: WorkloadNode[];
  services: ServiceNode[];
  ingresses: IngressNode[];
}

export interface ClusterTree {
  contextName: string;
  serverVersion: string;
  nodeCount: number;
  namespaces: NamespaceNode[];
  fetchedAt: Date;
}

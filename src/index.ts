// Main export for kubechart
export { createClient } from './k8s/client.js';
export { fetchClusterData } from './k8s/fetcher.js';
export type { K8sClient } from './k8s/client.js';
export type { FetchOptions, RawClusterData } from './k8s/types.js';
export { buildTree } from './tree/builder.js';
export type {
  ClusterTree,
  NamespaceNode,
  WorkloadNode,
  PodNode,
  PodPhase,
  ResourceKind,
} from './tree/types.js';
export { TreeView } from './render/TreeView.js';
export { colors, getPodStatusColor } from './render/colors.js';

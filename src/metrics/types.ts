// Metrics types for kubechart v2
// millicores and bytes (raw, formatting tách riêng)

export interface ResourceUsage {
  cpuUsage: number; // millicores thực tế (từ metrics-server)
  cpuRequest?: number; // millicores (từ pod spec)
  cpuLimit?: number; // millicores (từ pod spec)
  memUsage: number; // bytes thực tế
  memRequest?: number; // bytes
  memLimit?: number; // bytes
}

export interface NetworkUsage {
  rxBytes: number; // bytes/s received (tính delta giữa 2 lần fetch)
  txBytes: number; // bytes/s transmitted
}

// Gắn vào PodNode
export interface PodMetrics {
  resources: ResourceUsage;
  network?: NetworkUsage; // null nếu không có quyền đọc pod stats
}

// Gắn vào WorkloadNode — aggregated từ tất cả pods con
export interface AggregatedMetrics {
  cpuUsage: number;
  cpuRequest?: number;
  cpuLimit?: number;
  memUsage: number;
  memRequest?: number;
  memLimit?: number;
  podCount: number; // số pods đang Running (để biết aggregate từ mấy pod)
}

// Gắn vào ClusterTree — aggregated từ tất cả nodes
export interface ClusterMetrics {
  cpuUsage: number;
  cpuCapacity: number; // total capacity của tất cả nodes
  memUsage: number;
  memCapacity: number;
}

// Gắn vào ServiceNode
export interface ServiceTraffic {
  activeConnections: number; // số TCP connections hiện tại (từ /metrics nếu có)
  requestsPerSec?: number; // RPS (null nếu không expose metrics)
}

export type MetricsMode = 'use' | 'use/lim' | 'use/req/lim';

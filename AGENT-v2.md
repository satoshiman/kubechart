# AGENT.md — kubechart v2

> CLI tool để visualize Kubernetes cluster dưới dạng ASCII tree ngay trong terminal.
> Open source, MIT license. Mục tiêu: debug nhanh khi SSH vào server.

---

## 1. Project Overview

| Field               | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| **Name**            | kubechart                                                               |
| **Language**        | TypeScript (Node.js)                                                    |
| **Purpose**         | ASCII tree visualization của K8s cluster trên CLI với real-time metrics |
| **Target users**    | DevOps engineers, SREs, open source community                           |
| **Install**         | `npm install -g kubechart` hoặc `npx kubechart`                         |
| **License**         | MIT                                                                     |
| **Current version** | v2.0 — Metrics Layer                                                    |

---

## 2. Tech Stack

| Layer         | Choice                          | Lý do                                   |
| ------------- | ------------------------------- | --------------------------------------- |
| Language      | TypeScript strict               | Type-safe, IDE support tốt              |
| K8s client    | `@kubernetes/client-node`       | Official CNCF client                    |
| CLI framework | `commander.js`                  | Phổ biến, stable, docs tốt              |
| Render        | `ink` v4                        | React-like, dễ mở rộng sang --watch sau |
| Build         | `tsc` thuần                     | Không bundle, đơn giản                  |
| Test          | `jest` + `ts-jest`              | Mature, ecosystem rộng                  |
| Lint          | `eslint` + `@typescript-eslint` |                                         |
| Format        | `prettier`                      |                                         |

---

## 3. Project Structure

```
kubechart/
├── src/
│   ├── cli.ts                  # Commander entrypoint, parse flags
│   ├── index.ts                # Main export
│   ├── k8s/
│   │   ├── client.ts           # Khởi tạo KubeConfig, CoreV1Api, AppsV1Api, MetricsApi
│   │   ├── fetcher.ts          # Fetch namespaces, deployments, replicaSets, pods, services...
│   │   ├── metrics.ts          # NEW: Fetch CPU/MEM từ metrics-server, NET từ pod stats
│   │   └── types.ts            # Raw K8s resource interfaces
│   ├── render/
│   │   ├── TreeView.tsx        # Ink component: render ASCII tree với metrics columns
│   │   ├── WatchView.tsx       # Ink component: watch mode with auto-refresh
│   │   ├── StatusBar.tsx       # Ink component: status bar with countdown
│   │   ├── MetricsCell.tsx     # NEW: Render CPU/MEM dạng text hoặc bar chart
│   │   └── colors.ts           # Color theme constants
│   ├── tree/
│   │   ├── builder.ts          # Transform raw K8s data → TreeNode[]
│   │   └── types.ts            # TreeNode, ClusterTree interfaces (updated với metrics)
│   ├── metrics/
│   │   ├── aggregator.ts       # NEW: Sum CPU+MEM từ pods lên workload level
│   │   ├── formatter.ts        # NEW: Format millicores, bytes, RPS, CONN
│   │   └── types.ts            # NEW: MetricsSnapshot, ResourceUsage interfaces
│   ├── watch/
│   │   ├── differ.ts           # Diff two ClusterTrees for changes
│   │   └── flash.ts            # Flash effect hook for changed items
│   └── output/
│       └── serializer.ts       # Serialize ClusterTree to JSON/YAML
├── tests/
│   ├── tree/
│   │   └── builder.test.ts
│   ├── render/
│   │   ├── TreeView.test.tsx
│   │   ├── MetricsCell.test.tsx  # NEW
│   │   └── colors.test.ts
│   ├── k8s/
│   │   ├── client.test.ts
│   │   ├── fetcher.test.ts
│   │   └── metrics.test.ts       # NEW
│   ├── metrics/
│   │   ├── aggregator.test.ts    # NEW
│   │   └── formatter.test.ts     # NEW
│   ├── watch/
│   │   └── differ.test.ts
│   └── output/
│       └── serializer.test.ts
├── dist/
├── .eslintrc.json
├── .prettierrc
├── jest.config.ts
├── tsconfig.json
├── package.json
├── README.md
└── AGENT.md
```

---

## 4. Data Model

### 4.1 Core Types (`src/tree/types.ts`)

```typescript
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
  metrics?: PodMetrics; // NEW: optional, absent khi metrics-server không khả dụng
}

export interface ReplicaSetNode {
  name: string;
  ready: string;
  pods: PodNode[];
}

export interface ServiceNode {
  name: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP: string;
  ports: string[];
  traffic?: ServiceTraffic; // NEW: CONN + RPS
}

export interface IngressNode {
  name: string;
  host: string;
  paths: string[];
  tls: boolean;
}

export interface WorkloadNode {
  name: string;
  kind: ResourceKind;
  ready: string;
  image: string;
  replicaSets?: ReplicaSetNode[];
  pods?: PodNode[];
  aggregatedMetrics?: AggregatedMetrics; // NEW: sum từ tất cả pods con
}

export interface NamespaceNode {
  name: string;
  status: 'Active' | 'Terminating';
  workloads: WorkloadNode[];
  services: ServiceNode[];
  ingresses: IngressNode[];
  orphanPods?: PodNode[]; // Pods không có owner hoặc không match với workload nào
}

export interface ClusterTree {
  contextName: string;
  serverVersion: string;
  nodeCount: number;
  namespaces: NamespaceNode[];
  fetchedAt: Date;
  clusterMetrics?: ClusterMetrics; // NEW: node-level aggregation
}
```

### 4.2 Metrics Types (`src/metrics/types.ts`)

```typescript
// millicores và bytes (raw, formatting tách riêng)
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
```

---

## 5. CLI Interface

### 5.1 Commands & Flags

```bash
# Cơ bản — hiển thị namespace hiện tại
kubechart

# Lọc namespace
kubechart -n production
kubechart --namespace production

# Tất cả namespaces
kubechart -A
kubechart --all-namespaces

# Chọn context
kubechart --context my-eks-cluster

# Label selector
kubechart -l app=api
kubechart --selector app=api,env=prod

# Chỉ hiện resource có lỗi
kubechart --show-errors

# Metrics toggle mode (v2 mới)
kubechart --metrics use          # chỉ usage (default)
kubechart --metrics use/lim      # usage + limit
kubechart --metrics use/req/lim  # full

# Bar chart mode (v2 mới)
kubechart --bar

# Tắt metrics hoàn toàn (giống v1 output)
kubechart --no-metrics

# Kết hợp flags
kubechart -n production --context prod-cluster --show-errors
```

### 5.2 Flag Definitions (`src/cli.ts`)

```typescript
program
  .name('kubechart')
  .description('Visualize Kubernetes cluster as ASCII tree with real-time metrics')
  .version(pkg.version)
  .option('-n, --namespace <ns>', 'Filter by namespace')
  .option('-A, --all-namespaces', 'Show all namespaces')
  .option('--context <ctx>', 'Kubeconfig context to use')
  .option('-l, --selector <sel>', 'Label selector (e.g. app=api,env=prod)')
  .option('--show-errors', 'Only show workloads with errors')
  .option('--no-color', 'Disable colored output')
  .option('--once', 'Print chart once and exit (default: watch mode)')
  .option('--interval <seconds>', 'Watch refresh interval (default: 5)', '5')
  .option('--output <format>', 'Output format: json | yaml (requires --out-file)')
  .option('--out-file <path>', 'File path to write output (requires --output)')
  // v2 new flags
  .option(
    '--display-mode <mode>',
    'Display mode: general | bar | use | use/lim | use/req/lim',
    'general'
  )
  .option('--no-metrics', 'Disable metrics display entirely')
  .parse(process.argv);
```

### 5.3 Keyboard Controls (Watch Mode)

| Key          | Action                                                                            |
| ------------ | --------------------------------------------------------------------------------- |
| `r`          | Refresh immediately                                                               |
| `q` / Ctrl+C | Quit                                                                              |
| `h`          | Toggle pod status legend                                                          |
| `+` / `-`    | Increase/decrease refresh interval (1–60s)                                        |
| `p`          | Pause/resume countdown timer                                                      |
| `s`          | Toggle selector display (show/hide label selectors and pod labels)                |
| `v`          | Toggle volume display (show/hide Kubernetes volumes)                              |
| `m`          | Cycle metrics display mode: `general` → `bar` → `use` → `use/lim` → `use/req/lim` |
| `g`          | Set metrics display mode to `general`                                             |
| `?`          | Show full help overlay                                                            |

### 5.4 Watch Mode Behavior

```
┌─ Watch mode lifecycle ──────────────────────────────────┐
│                                                          │
│  Start                                                   │
│    │                                                     │
│    ▼                                                     │
│  Check TTY (interactive terminal)                        │
│    │                                                     │
│    ├─ Not TTY → Error: "Watch mode requires TTY"         │
│    │            → Suggest: "Use --once flag"             │
│    └─ TTY → continue                                     │
│    │                                                     │
│    ▼                                                     │
│  Show spinner "Fetching cluster data..."                 │
│    │                                                     │
│    ▼                                                     │
│  Fetch cluster + metrics (parallel Promise.all)          │
│    │                                                     │
│    ├─ metrics-server absent → show tree without metrics  │
│    │   → status bar note: "(metrics-server not found)"   │
│    └─ Success → aggregate metrics lên workload level     │
│    │                                                     │
│    ▼                                                     │
│  Show status bar với countdown timer                     │
│    │                                                     │
│    ▼                                                     │
│  Wait interval (5s default)                             │
│    │                                                     │
│    ├─ t pressed → cycle metricsMode                      │
│    ├─ b pressed → toggle barMode                         │
│    ├─ r pressed → fetch immediately                      │
│    ├─ q / Ctrl+C → cleanup → exit                       │
│    │                                                     │
│    ▼                                                     │
│  Re-fetch → diff với snapshot trước                     │
│    │                                                     │
│    ├─ Có thay đổi → flash dòng đó 300ms rồi stable      │
│    └─ Không đổi  → re-render im lặng                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Output Format (v2)

### 6.1 Header — Cluster-level metrics

```
◆ CLUSTER minikube | k8s v1.35.1 | 1 nodes          CPU: 450m/2C 22%  MEM: 1.2/3.8G 31%
```

- `CPU: <usage>/<capacity> <pct>%` — aggregate toàn bộ nodes
- `MEM: <usage>/<capacity> <pct>%`
- Nếu không có metrics-server: `CPU: —   MEM: —`

### 6.2 Namespace bar

```
ns: [0] system ns [1] default [●] kubechart-test [3] kubernetes-dashboard
```

- `[●]` = namespace đang được hiển thị (selected)

### 6.3 Workload row — aggregated metrics

```
├── ▲ Deployment test-deployment [2/2]        CPU: 24m/500m  5%   MEM: 90Mi/512Mi  18%
```

- CPU và MEM là **sum** của tất cả pods con đang Running
- Format theo `metricsMode`:
  - `use`: `CPU: 24m        MEM: 90Mi`
  - `use/lim`: `CPU: 24m/500m   MEM: 90Mi/512Mi`
  - `use/req/lim`: `CPU: 24m/100m/500m  MEM: 90Mi/128Mi/512Mi`
- Nếu Job/CronJob completed: `CPU: —   MEM: —`

### 6.4 Pod row — individual metrics + network

```
│       ├── POD ● test-deployment-xxx-c9hmc   CPU: 12m/250m  5%   MEM: 45Mi/256Mi  18%  NET↑1KB↓3KB
```

- `NET↑<tx>↓<rx>` — throughput KB/s (delta giữa 2 lần fetch, hidden nếu không có quyền)
- Pod đã Completed: hiển thị `Completed` ở cuối, không show metrics numbers

### 6.5 Service row — traffic thay vì IP

```
├── SVC ● test-clusterip-svc                   ClusterIP   CONN: 0    RPS: —
├── SVC ▲ test-loadbalancer-svc                LoadBalancer CONN: 0   RPS: —
└── SVC ◆ test-nodeport-svc                    NodePort    CONN: 2    RPS: 0.3/s
```

- `CONN`: số active TCP connections (từ node-level metrics nếu khả dụng, else `—`)
- `RPS`: requests/second (chỉ khi service expose `/metrics` endpoint, else `—`)
- **Không** hiển thị ClusterIP và port list nữa — đây là metrics view, traffic quan trọng hơn

### 6.6 Bar chart mode `[b]`

Khi `barMode = true`, thay số bằng bars 10 ký tự:

```
POD ● test-deployment-xxx-c9hmc   CPU [██░░░░░░░░]  5%   MEM [██░░░░░░░░] 18%
```

- `█` = filled (usage/limit ratio)
- `░` = empty
- Luôn 10 ký tự wide để alignment nhất quán
- Phần trăm vẫn hiển thị sau bar để đọc chính xác
- Workload row aggregate cũng dùng bar khi barMode = true

### 6.7 Full example output

```
◆ CLUSTER minikube | k8s v1.35.1 | 1 nodes          CPU: 450m/2C 22%  MEM: 1.2/3.8G 31%

ns: [0] system ns [1] default [●] kubechart-test [3] kubernetes-dashboard

└── NAMESPACE kubechart-test [Active]
    ├── ▲ Deployment test-deployment [2/2]        CPU: 24m/500m  5%   MEM: 90Mi/512Mi  18%
    │   └── ◆ ReplicaSet test-deployment-85f97ccf4c [2/2]
    │       ├── POD ● test-deployment-xxx-c9hmc   CPU: 12m/250m  5%   MEM: 45Mi/256Mi  18%  NET↑1KB↓3KB
    │       └── POD ● test-deployment-xxx-trxjh   CPU: 12m/250m  5%   MEM: 45Mi/256Mi  18%  NET↑1KB↓2KB
    ├── ◆ StatefulSet test-statefulset [2/2]       CPU: 18m/500m  4%   MEM: 110Mi/512Mi 21%
    │   ├── POD ● test-statefulset-0               CPU:  9m/250m  4%   MEM: 55Mi/256Mi  21%  NET↑2KB↓1KB
    │   └── POD ● test-statefulset-1               CPU:  9m/250m  4%   MEM: 55Mi/256Mi  21%  NET↑1KB↓1KB
    ├── ■ DaemonSet test-daemonset [1/1]           CPU:  5m/100m  5%   MEM: 20Mi/128Mi  16%
    │   └── POD ● test-daemonset-b9sbs             CPU:  5m/100m  5%   MEM: 20Mi/128Mi  16%  NET↑0KB↓1KB
    ├── ● Job test-job [1/1]                       CPU:  —                MEM: —
    │   └── POD ○ test-job-r7ltl                   CPU:  —                MEM: —               Completed
    ├── ○ CronJob test-cronjob [0 jobs]            CPU:  —                MEM: —
    │   ├── POD ○ test-cronjob-xxx-lh68p           CPU:  —                MEM: —               Completed
    │   ├── POD ○ test-cronjob-xxx-vtjnv           CPU:  —                MEM: —               Completed
    │   └── POD ○ test-cronjob-xxx-8m7lk           CPU:  —                MEM: —               Completed
    ├── SVC ● test-clusterip-svc                   ClusterIP   CONN: 0    RPS: —
    ├── SVC ▲ test-loadbalancer-svc                LoadBalancer CONN: 0   RPS: —
    └── SVC ◆ test-nodeport-svc                    NodePort    CONN: 2    RPS: 0.3/s
────────────────────────────────────────────────────────────────────────────────
namespaces: 1 | workloads: 5 | pods: 9 | services: 3 | ingresses: 2 | configmaps: 2
[t]oggle: use/lim  [b]bar-chart  | ↺ 2/5s [-/+] [r]efresh [p]ause [q]uit [?]help
```

---

## 7. Metrics Layer (`src/metrics/`)

### 7.1 Fetch Strategy (`src/k8s/metrics.ts`)

```typescript
import * as k8s from '@kubernetes/client-node';

// metrics-server expose API tại /apis/metrics.k8s.io/v1beta1
export async function fetchPodMetrics(
  kc: k8s.KubeConfig,
  namespace: string
): Promise<Map<string, RawPodMetrics>>;
// Returns map: podName → { containers: [{ name, usage: { cpu, memory } }] }

export async function fetchNodeMetrics(kc: k8s.KubeConfig): Promise<RawNodeMetrics[]>;
// Returns: [{ name, usage: { cpu, memory } }]

// Network: đọc từ kubelet /stats/summary endpoint
// Cần quyền proxy access hoặc dùng metrics-server extended
export async function fetchPodNetworkStats(
  kc: k8s.KubeConfig,
  nodeName: string
): Promise<Map<string, RawNetworkStats>>;

// Service traffic: chỉ cần khi service expose /metrics (Prometheus)
// Fallback: đọc connection count từ /proc/net/tcp trên node (cần privileged)
// Simple approach: chỉ show CONN=0 nếu không access được
export async function fetchServiceTraffic(
  kc: k8s.KubeConfig,
  namespace: string,
  serviceName: string
): Promise<ServiceTraffic | null>;

// Graceful degradation:
// - metrics-server không có → return null, TreeView hiển thị "—"
// - network stats không có quyền → NetworkUsage = undefined
// - service traffic không expose → ServiceTraffic.requestsPerSec = undefined
```

### 7.2 Aggregator (`src/metrics/aggregator.ts`)

```typescript
// Sum CPU và MEM từ tất cả pods con của một workload
export function aggregateWorkloadMetrics(pods: PodNode[]): AggregatedMetrics | undefined;

// Rules:
// - Chỉ aggregate pods đang Running (phase === 'Running')
// - Completed/Failed pods không tính vào sum
// - Nếu không có pod nào Running → return undefined (hiển thị "—")
// - cpuRequest/cpuLimit = sum của tất cả containers trong tất cả pods
// - Đây là tổng giới hạn, không phải per-pod

export function aggregateClusterMetrics(
  nodeMetrics: RawNodeMetrics[],
  nodeCapacity: NodeCapacity[]
): ClusterMetrics;
// Sum usage và capacity của tất cả nodes
```

### 7.3 Formatter (`src/metrics/formatter.ts`)

```typescript
// CPU: millicores → human readable
export function formatCpu(millicores: number): string;
// < 1000m → "12m"
// >= 1000m → "1.2" (cores)

// Memory: bytes → human readable
export function formatMem(bytes: number): string;
// < 1024 → "512B"
// < 1024*1024 → "512KB"
// < 1024^3 → "512Mi"
// else → "1.2Gi"

// Network throughput
export function formatNet(bytesPerSec: number): string;
// < 1024 → "512B/s" → display as "0KB"
// < 1024*1024 → "12KB"
// else → "1.2MB"

// Percentage (để color code)
export function calcPercent(usage: number, limit: number): number;
// return 0-100, NaN nếu limit === 0

// Format full metrics cell string theo mode
export type MetricsMode = 'use' | 'use/lim' | 'use/req/lim';

export function formatCpuCell(metrics: ResourceUsage | undefined, mode: MetricsMode): string;
// mode=use:          "12m"               hoặc "—"
// mode=use/lim:      "12m/250m"          hoặc "12m/—"
// mode=use/req/lim:  "12m/100m/250m"     hoặc "12m/—/—"

export function formatMemCell(metrics: ResourceUsage | undefined, mode: MetricsMode): string;
// tương tự CPU

// Bar chart rendering
export function renderBar(percent: number, width = 10): string;
// 0% → "░░░░░░░░░░"
// 50% → "█████░░░░░"
// 100% → "██████████"
// NaN (no limit) → "░░░░░░░░░░" (empty, không mislead)
```

---

## 8. Render Layer (`src/render/`)

### 8.1 MetricsCell Component (`src/render/MetricsCell.tsx`)

```typescript
interface MetricsCellProps {
  metrics: ResourceUsage | AggregatedMetrics | undefined;
  mode: MetricsMode;
  barMode: boolean;
  compact?: boolean;  // true = chỉ CPU+MEM không có label, dùng trong pod rows
}

export function MetricsCell({ metrics, mode, barMode, compact }: MetricsCellProps) {
  if (!metrics) return <Text dimColor>CPU: —    MEM: —</Text>;

  const cpuStr = formatCpuCell(metrics, mode);
  const memStr = formatMemCell(metrics, mode);
  const cpuPct = calcPercent(metrics.cpuUsage, metrics.cpuLimit ?? 0);
  const memPct = calcPercent(metrics.memUsage, metrics.memLimit ?? 0);

  if (barMode) {
    return (
      <Box gap={2}>
        <Text>CPU [<Text color={cpuColor(cpuPct)}>{renderBar(cpuPct)}</Text>] {cpuPct.toFixed(0)}%</Text>
        <Text>MEM [<Text color={memColor(memPct)}>{renderBar(memPct)}</Text>] {memPct.toFixed(0)}%</Text>
      </Box>
    );
  }

  return (
    <Box gap={3}>
      <Text>CPU: <Text color={cpuColor(cpuPct)}>{cpuStr}</Text></Text>
      <Text>MEM: <Text color={memColor(memPct)}>{memStr}</Text></Text>
    </Box>
  );
}

// Color thresholds:
// CPU: < 70% → green, 70-90% → yellow, > 90% → red
// MEM: < 70% → green, 70-85% → yellow, > 85% → red
function cpuColor(pct: number): string { ... }
function memColor(pct: number): string { ... }
```

### 8.2 Selector Styling

Selectors và labels được hiển thị với styling đặc biệt:

- **Color**: Màu vàng dịu `#E6B800` (không phải dimColor)
- **Symbol**: Prefix `▶` trước mỗi selector/label
- **Indentation**:
  - RS selector khi không có pods (inactive): trụt vào thêm 2 ký tự
  - Service selector: trụt vào thêm 2 ký tự
  - Workload selector: không có extra indentation
  - Pod labels: không có extra indentation

Ví dụ:

```
│   └── ◆ ReplicaSet api-77668c7d6b [0/1] (inactive)
│        ▶ app=api,pod-template-hash=77668c7d6b
```

### 8.3 TreeView Updates (`src/render/TreeView.tsx`)

Mỗi row component nhận thêm props `metricsMode`, `barMode`, và `showSelectors`:

```typescript
// WorkloadRow — hiển thị aggregatedMetrics ở cuối dòng
function WorkloadRow({ workload, metricsMode, barMode, ... }) {
  return (
    <Box>
      <Text>├── {workloadSymbol} {workload.kind} {workload.name} [{workload.ready}]</Text>
      <Spacer />
      <MetricsCell metrics={workload.aggregatedMetrics} mode={metricsMode} barMode={barMode} />
    </Box>
  );
}

// PodRow — hiển thị pod metrics + network
function PodRow({ pod, metricsMode, barMode, ... }) {
  const netStr = pod.metrics?.network
    ? `NET↑${formatNet(pod.metrics.network.txBytes)}↓${formatNet(pod.metrics.network.rxBytes)}`
    : '';

  return (
    <Box>
      <Text>│   └── POD {podSymbol(pod)} {pod.name}</Text>
      <Spacer />
      <MetricsCell metrics={pod.metrics?.resources} mode={metricsMode} barMode={barMode} compact />
      {netStr && <Text dimColor>  {netStr}</Text>}
      {pod.phase === 'Succeeded' && <Text dimColor>  Completed</Text>}
    </Box>
  );
}

// ServiceRow — hiển thị CONN + RPS thay vì IP+ports
function ServiceRow({ svc, ... }) {
  const conn = svc.traffic?.activeConnections ?? '—';
  const rps = svc.traffic?.requestsPerSec !== undefined
    ? `${svc.traffic.requestsPerSec.toFixed(1)}/s`
    : '—';

  return (
    <Box>
      <Text>└── SVC {svcSymbol(svc)} {svc.name}</Text>
      <Spacer />
      <Text>{svc.type.padEnd(12)} CONN: {conn}    RPS: {rps}</Text>
    </Box>
  );
}

// ClusterHeader — hiển thị cluster-level metrics
function ClusterHeader({ tree, ... }) {
  const cpuStr = tree.clusterMetrics
    ? `CPU: ${formatCpu(tree.clusterMetrics.cpuUsage)}/${formatCpu(tree.clusterMetrics.cpuCapacity)} ${calcPercent(tree.clusterMetrics.cpuUsage, tree.clusterMetrics.cpuCapacity).toFixed(0)}%`
    : 'CPU: —';
  // tương tự MEM

  return (
    <Box justifyContent="space-between">
      <Text>◆ CLUSTER {tree.contextName} | k8s {tree.serverVersion} | {tree.nodeCount} nodes</Text>
      <Text dimColor>{cpuStr}  {memStr}</Text>
    </Box>
  );
}
```

### 8.3 WatchView State (`src/render/WatchView.tsx`)

```typescript
export type DisplayMode = 'general' | 'bar' | 'use' | 'use/lim' | 'use/req/lim';
const DISPLAY_MODE_CYCLE: DisplayMode[] = ['general', 'bar', 'use', 'use/lim', 'use/req/lim'];

export function WatchView({ opts }: { opts: WatchOptions }) {
  const [tree, setTree] = useState<ClusterTree | null>(null);
  const [diff, setDiff] = useState<DiffResult>({ added: [], removed: [], changed: [] });
  const [status, setStatus] = useState<'fetching' | 'idle'>('fetching');
  const [displayMode, setDisplayMode] = useState<DisplayMode>(opts.displayMode ?? 'general');
  const [currentInterval, setCurrentInterval] = useState<number>(opts.interval);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(false);
  const [showSelectors, setShowSelectors] = useState<boolean>(false);
  const [showVolumes, setShowVolumes] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const flashing = useFlash(diff.changed);

  // Keyboard
  useInput((input, key) => {
    if (!process.stdin.isTTY) return;

    if (input === 'r') triggerRefresh();
    if (input === 'p') setIsPaused(v => !v);
    if (input === 'h') setShowLegend(v => !v);
    if (input === '+' || input === '=') setCurrentInterval(v => Math.min(v + 1, 60));
    if (input === '-' || input === '_') setCurrentInterval(v => Math.max(v - 1, 1));
    if (input === 'q' || (key.ctrl && input === 'c')) process.exit(0);
    // Display mode controls:
    if (input === 'm') setDisplayMode(m => {
      const idx = DISPLAY_MODE_CYCLE.indexOf(m);
      return DISPLAY_MODE_CYCLE[(idx + 1) % DISPLAY_MODE_CYCLE.length];
    });
    if (input === 'g') setDisplayMode('general');
    // Toggle controls:
    if (input === '?') setShowHelp(v => !v);
    if (input === 's') setShowSelectors(v => !v);
    if (input === 'v') setShowVolumes(v => !v);
  });

  // fetch loop: cluster data + metrics in parallel
  const fetchAll = async () => {
    setStatus('fetching');
    try {
      const [next, podMetrics, nodeMetrics] = await Promise.all([
        fetchClusterData(client, opts),
        opts.noMetrics ? null : fetchPodMetrics(kc, opts.namespace),
        opts.noMetrics ? null : fetchNodeMetrics(kc),
      ]);
      // attach metrics vào tree nodes
      const treeWithMetrics = attachMetrics(next, podMetrics, nodeMetrics);
      if (tree) setDiff(diffTrees(tree, treeWithMetrics));
      setTree(treeWithMetrics);
    } catch (err) { ... }
    setStatus('idle');
  };

  return (
    <Box flexDirection="column">
      <TreeView
        tree={tree}
        flashing={flashing}
        displayMode={displayMode}
        showSelectors={showSelectors}
        showVolumes={showVolumes}
      />
      <StatusBar
        status={status}
        diff={diff}
        interval={currentInterval}
        displayMode={displayMode}
        isPaused={isPaused}
        showLegend={showLegend}
      />
    </Box>
  );
}
```

### 8.4 StatusBar Updates (`src/render/StatusBar.tsx`)

```typescript
// Status bar format:
// [m]etric: general [s]elector: OFF [v]olume: ON | ↺ 3/5s [-/+] [r]efresh [p]ause [q]uit [?]help

interface StatusBarProps {
  status: 'fetching' | 'idle' | 'error';
  diff: DiffResult;
  interval: number;
  lastUpdated?: Date;
  tree?: ClusterTree;
  showLegend?: boolean;
  isPaused?: boolean;
  showHelp?: boolean;
  setShowHelp?: (show: boolean) => void;
}
```

The StatusBar shows:

- Stats line: namespaces, workloads, pods, services, ingresses, configmaps counts
- Pod status legend (when toggled with `h`)
- Help overlay (when toggled with `?`)

### 8.5 Pod Status Symbols

| Symbol | Color  | Meaning                               |
| ------ | ------ | ------------------------------------- |
| `●`    | green  | Running + Ready                       |
| `◌`    | yellow | Pending                               |
| `✖`    | red    | Failed / CrashLoopBackOff / OOMKilled |
| `◑`    | yellow | Running nhưng chưa Ready              |
| `○`    | gray   | Succeeded (Job completed)             |

---

## 9. K8s Client (`src/k8s/`)

### 9.1 client.ts — Khởi tạo (updated)

```typescript
import * as k8s from '@kubernetes/client-node';

export function createClient(context?: string) {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  if (context) kc.setCurrentContext(context);

  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    batch: kc.makeApiClient(k8s.BatchV1Api),
    networking: kc.makeApiClient(k8s.NetworkingV1Api),
    version: kc.makeApiClient(k8s.VersionApi),
    // v2: expose raw KubeConfig để metrics.ts dùng custom HTTP requests
    kc,
    contextName: kc.getCurrentContext(),
  };
}
```

### 9.2 fetcher.ts — Unchanged từ v1

Fetch namespaces, deployments, replicaSets, pods, services, ingresses không thay đổi. Metrics được fetch riêng trong `metrics.ts` và merge trong `WatchView`.

### 9.3 metrics.ts — NEW

```typescript
// Dùng @kubernetes/client-node custom object API để hit metrics.k8s.io
import * as k8s from '@kubernetes/client-node';

interface RawPodMetrics {
  metadata: { name: string; namespace: string };
  containers: Array<{
    name: string;
    usage: { cpu: string; memory: string };  // "12m", "45Mi"
  }>;
}

export async function fetchPodMetrics(
  kc: k8s.KubeConfig,
  namespace?: string
): Promise<Map<string, PodMetrics> | null> {
  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const ns = namespace ?? '';
    const result = ns
      ? await customApi.listNamespacedCustomObject('metrics.k8s.io', 'v1beta1', ns, 'pods')
      : await customApi.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'pods');

    const items = (result.body as any).items as RawPodMetrics[];
    return buildPodMetricsMap(items);
  } catch {
    // metrics-server không khả dụng → graceful degradation
    return null;
  }
}

export async function fetchNodeMetrics(
  kc: k8s.KubeConfig
): Promise<RawNodeMetrics[] | null> {
  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const result = await customApi.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'nodes');
    return (result.body as any).items;
  } catch {
    return null;
  }
}

// Parse K8s quantity strings → numbers
// "12m" → 12 (millicores)
// "45Mi" → 47185920 (bytes)
function parseCpuQuantity(str: string): number { ... }
function parseMemQuantity(str: string): number { ... }
```

### 9.4 attachMetrics — Merge metrics vào tree

```typescript
// src/k8s/metrics.ts
export function attachMetrics(
  tree: ClusterTree,
  podMetrics: Map<string, PodMetrics> | null,
  nodeMetrics: RawNodeMetrics[] | null
): ClusterTree {
  // 1. Attach pod-level metrics từ map
  // 2. Aggregate lên workload level (aggregator.ts)
  // 3. Aggregate cluster metrics từ nodeMetrics
  // 4. Return new tree object (không mutate)
}
```

---

## 10. Volume Feature

### 10.1 Goal

Render Kubernetes volumes in the tree based on where they are actually defined.

Volumes belong to:

- Pod.spec.volumes
- ReplicaSet.spec.template.spec.volumes
- Deployment.spec.template.spec.volumes
- StatefulSet.spec.template.spec.volumes
- DaemonSet.spec.template.spec.volumes
- Job.spec.template.spec.volumes
- CronJob.spec.jobTemplate.spec.template.spec.volumes

**Do NOT duplicate the same volume under every Pod generated from the same PodTemplate.**

### 10.2 Tree Structure

```
Deployment
├── ReplicaSet
│   ├── Volumes [N]
│   │   ├── PVC uploads → uploads-pvc (Bound, 10Gi, standard) @ /uploads
│   │   ├── HP host-data → /data/host (Directory) @ /host-data
│   │   ├── ED cache → Memory @ /cache
│   │   ├── CM app-config → app-config (3 keys) @ /config
│   │   └── SEC app-secret → app-secret (3 keys) @ /secrets
│   ├── POD ● pod-1
│   └── POD ● pod-2

StatefulSet
├── Volumes [N]
├── POD ● pod-0
└── POD ● pod-1

DaemonSet
├── Volumes [N]
├── POD ● pod-1
└── POD ● pod-2

Job
├── Volumes [N]
└── POD ○ pod-1

CronJob
├── Job
│   ├── Volumes [N]
│   └── POD ○ pod-1

Standalone Pod
├── Volumes [N]
└── Containers
```

### 10.3 Volume Node Format

Unified format for all volume types:

```
TYPE  name  →  source  (metadata)  @  mountPath
```

Examples:

```
PVC  uploads  →  uploads-pvc  (Bound, 10Gi, standard)  @  /uploads
HP   host-data  →  /data/host  (Directory)  @  /host-data
ED   cache  →  Memory  @  /cache
ED   temp  →  tmpfs  (2Gi)  @  /tmp
CM   app-config  →  app-config  (3 keys)  @  /config
SEC  app-secret  →  app-secret  (3 keys)  @  /secrets
PROJ  projected-config  →  4 sources  @  /projected
DAPI  pod-info  →  labels, annotations  @  /pod-info
```

### 10.4 Type Codes & Color Coding

| Type                  | Code | Color   | Description                 |
| --------------------- | ---- | ------- | --------------------------- |
| PersistentVolumeClaim | PVC  | cyan    | PVC volume                  |
| hostPath              | HP   | yellow  | Node-dependent, risky       |
| emptyDir              | ED   | white   | Temporary storage           |
| ConfigMap             | CM   | blue    | Configuration data          |
| Secret                | SEC  | red     | Sensitive data              |
| NFS                   | NFS  | white   | Network file system         |
| CSI                   | CSI  | white   | CSI driver                  |
| local                 | LOC  | white   | Local persistent volume     |
| projected             | PROJ | magenta | Multiple sources            |
| downwardAPI           | DAPI | white   | Pod metadata                |
| serviceAccountToken   | SAT  | white   | Service account token       |
| ephemeral             | EPH  | white   | Ephemeral volume            |
| image                 | IMG  | white   | Image volume                |
| gitRepo               | GIT  | white   | Git repository (deprecated) |

### 10.5 Volume Type Details

#### PVC (PersistentVolumeClaim)

- Show: claim name, status, capacity, storageClass
- Format: `PVC name → claimName (status, capacity, storageClass) @ mountPath`
- Example: `PVC uploads → uploads-pvc (Bound, 10Gi, standard) @ /uploads`

#### ConfigMap

- Show: ConfigMap name, number of keys
- Format: `CM name → configMapName (N keys) @ mountPath`
- Example: `CM app-config → app-config (3 keys) @ /config`

#### Secret

- Show: Secret name, number of keys
- Format: `SEC name → secretName (N keys) @ mountPath`
- Example: `SEC app-secret → app-secret (3 keys) @ /secrets`

#### hostPath

- Show: path, type (Directory, File, etc.)
- Format: `HP name → path (type) @ mountPath`
- Example: `HP var-log → /var/log (Directory) @ /host/var/log`

#### emptyDir

- Show: medium (Memory) or sizeLimit
- Format: `ED name → Memory @ mountPath` or `ED name → tmpfs (size) @ mountPath`
- Example: `ED cache → Memory @ /cache` or `ED temp → tmpfs (2Gi) @ /tmp`

#### projected

- Show: number of sources
- Format: `PROJ name → N sources @ mountPath`
- Example: `PROJ projected-config → 4 sources @ /projected`

#### downwardAPI

- Show: field names
- Format: `DAPI name → field1, field2 @ mountPath`
- Example: `DAPI pod-info → labels, annotations @ /pod-info`

#### NFS

- Show: server:path
- Format: `NFS name → server:path @ mountPath`
- Example: `NFS shared-storage → 10.0.0.5:/export @ /data`

#### CSI

- Show: driver name
- Format: `CSI name → driver @ mountPath`
- Example: `CSI gke-disk → pd.csi.storage.gke.io @ /data`

#### local

- Show: path
- Format: `LOC name → path @ mountPath`
- Example: `LOC local-data → /mnt/disks/data @ /data`

#### serviceAccountToken

- Show: expiration seconds
- Format: `SAT name → expiration @ mountPath`
- Example: `SAT default-token → 3600s @ /var/run/secrets`

#### ephemeral

- Show: storage size
- Format: `EPH name → size @ mountPath`
- Example: `EPH scratch → 1Gi @ /scratch`

### 10.6 Data Model Updates

```typescript
// src/tree/types.ts
export type VolumeType =
  | 'PersistentVolumeClaim'
  | 'hostPath'
  | 'emptyDir'
  | 'ConfigMap'
  | 'Secret'
  | 'NFS'
  | 'CSI'
  | 'local'
  | 'projected'
  | 'downwardAPI'
  | 'serviceAccountToken'
  | 'ephemeral'
  | 'image'
  | 'gitRepo';

export interface VolumeNode {
  name: string;
  type: VolumeType;
  info: string;
  mountPath?: string;
  pvcInfo?: {
    status?: string;
    capacity?: string;
    accessModes?: string;
    storageClass?: string;
  };
}

export interface ReplicaSetNode {
  name: string;
  ready: string;
  pods: PodNode[];
  selector?: string;
  volumes?: VolumeNode[]; // NEW: volumes defined in this ReplicaSet
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
  aggregatedMetrics?: AggregatedMetrics;
  selector?: string;
  volumes?: VolumeNode[]; // NEW: volumes defined in this workload (for non-Deployment workloads)
}
```

### 10.7 Volume Extraction Logic

```typescript
// src/tree/builder.ts

// Volume type codes for display
export const VOLUME_TYPE_CODES: Record<VolumeType, string> = {
  PersistentVolumeClaim: 'PVC',
  hostPath: 'HP',
  emptyDir: 'ED',
  ConfigMap: 'CM',
  Secret: 'SEC',
  NFS: 'NFS',
  CSI: 'CSI',
  local: 'LOC',
  projected: 'PROJ',
  downwardAPI: 'DAPI',
  serviceAccountToken: 'SAT',
  ephemeral: 'EPH',
  image: 'IMG',
  gitRepo: 'GIT',
};

// Volume ordering per vol.md spec
export const VOLUME_ORDER: VolumeType[] = [
  'PersistentVolumeClaim',
  'hostPath',
  'emptyDir',
  'ConfigMap',
  'Secret',
  'projected',
  'NFS',
  'CSI',
  'local',
  'downwardAPI',
  'serviceAccountToken',
  'ephemeral',
  'image',
  'gitRepo',
];

function buildVolumeNode(
  volume: V1Volume,
  configMaps: V1ConfigMap[],
  secrets: V1Secret[],
  pvcs: V1PersistentVolumeClaim[]
): VolumeNode | null {
  // Extract volume type and info based on volume spec
  // For PVC: extract metadata from PVC object (status, capacity, storageClass)
  // For ConfigMap/Secret: count keys
  // For hostPath: extract path and type
  // For emptyDir: extract medium and sizeLimit
  // For projected: count sources
  // For downwardAPI: extract field names
}

function buildVolumesFromPodSpec(
  podSpec: V1PodSpec | undefined,
  configMaps: V1ConfigMap[],
  secrets: V1Secret[],
  pvcs: V1PersistentVolumeClaim[]
): VolumeNode[] {
  // Extract volumes from pod spec
  // Extract mount paths from containers
  // Sort volumes according to VOLUME_ORDER
}
```

### 10.8 PVC Fetching

```typescript
// src/k8s/fetcher.ts
// Add PVC fetching to RawClusterData
export interface RawClusterData {
  namespaces: V1Namespace[];
  deployments: V1Deployment[];
  replicaSets: V1ReplicaSet[];
  statefulSets: V1StatefulSet[];
  daemonSets: V1DaemonSet[];
  jobs: V1Job[];
  cronJobs: V1CronJob[];
  pods: V1Pod[];
  services: V1Service[];
  ingresses: V1Ingress[];
  configMaps: V1ConfigMap[];
  secrets: V1Secret[];
  persistentVolumeClaims: V1PersistentVolumeClaim[]; // NEW
  serverVersion?: string;
  nodeCount?: number;
}

async function fetchPersistentVolumeClaims(
  core: CoreV1Api,
  ns: string
): Promise<V1PersistentVolumeClaim[]> {
  try {
    const res = await core.listNamespacedPersistentVolumeClaim(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}
```

### 10.9 Volume Rendering

```typescript
// src/render/TreeView.tsx

function VolumeRow({ volumes, prefix, isLast }: VolumeRowProps) {
  const vPrefix = isLast ? '└──' : '├──';
  const vChildPrefix = isLast ? '    ' : '│  ';

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getColor('tree')}>{prefix}</Text>
        <Text color={getColor('tree')}>{vPrefix} </Text>
        <Text color={getColor('volume')}>Volumes</Text>
        <Text color={getColor('workload')}> [{volumes.length}]</Text>
      </Box>
      {volumes.map((volume, volIndex) => {
        const volPrefix = volIndex === volumes.length - 1 ? '└──' : '├──';
        const typeCode = VOLUME_TYPE_CODES[volume.type] || 'UNK';
        const typeColor = getVolumeTypeColor(volume.type);

        // Build PVC metadata string
        let pvcMeta = '';
        if (volume.pvcInfo) {
          const parts: string[] = [];
          if (volume.pvcInfo.status) parts.push(volume.pvcInfo.status);
          if (volume.pvcInfo.capacity) parts.push(volume.pvcInfo.capacity);
          if (volume.pvcInfo.storageClass) parts.push(volume.pvcInfo.storageClass);
          if (parts.length > 0) pvcMeta = ` (${parts.join(', ')})`;
        }

        return (
          <Box key={volume.name}>
            <Text color={getColor('tree')}>{prefix}</Text>
            <Text color={getColor('tree')}>{vChildPrefix}</Text>
            <Text color={getColor('tree')}>{volPrefix} </Text>
            <Text color={typeColor}>{typeCode}</Text>
            <Text color={getColor('workload')}> {volume.name}</Text>
            {volume.info && <Text dimColor> {volume.info}</Text>}
            {pvcMeta && <Text dimColor>{pvcMeta}</Text>}
            {volume.mountPath && <Text dimColor> @ {volume.mountPath}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

// src/render/colors.ts
export function getVolumeTypeColor(volumeType: string): string {
  switch (volumeType) {
    case 'PersistentVolumeClaim': return colors.volumePVC; // cyan
    case 'hostPath': return colors.volumeHP; // yellow
    case 'emptyDir': return colors.volumeED; // white
    case 'ConfigMap': return colors.volumeCM; // blue
    case 'Secret': return colors.volumeSEC; // red
    case 'projected': return colors.volumePROJ; // magenta
    case 'downwardAPI': return colors.volumeDAPI; // white
    default: return colors.volume;
  }
}
```

### 10.10 Volume Toggle Control

```typescript
// src/render/WatchView.tsx

export function WatchView({ opts }: { opts: WatchOptions }) {
  const [showVolumes, setShowVolumes] = useState<boolean>(true);

  useInput((input) => {
    // ... other handlers
    if (input === 'v') setShowVolumes(v => !v);
  });

  return (
    <TreeView tree={tree} showVolumes={showVolumes} />
  );
}

// Menu display: [v]olume: ON/OFF
```

### 10.11 Important UX Rules

1. **Render ONLY volumes actually present** - Do not create placeholder nodes for unsupported or missing volume types.

2. **Never duplicate identical Volumes under every Pod** - Render once at the PodTemplate owner level (ReplicaSet for Deployments, Workload for others).

3. **Standalone Pods** (ownerReferences empty) should render their own "Volumes" node.

4. **Volume ordering** - Follow VOLUME_ORDER: PVC → HP → ED → CM → SEC → PROJ → NFS → CSI → LOC → DAPI → SAT → EPH → IMG → GIT.

5. **If no volumes exist** - Omit the "Volumes" node entirely.

6. **Mount path extraction** - Extract mount paths from all containers in the pod spec.

7. **PVC metadata** - Fetch PVCs from cluster and extract status, capacity, storageClass for display.

### 10.12 Test YAML

Test cases are in `yml-test/vol-test.yaml`:

- Namespace: vol-test
- ConfigMap: app-config (3 keys)
- Secret: app-secret (3 keys)
- PVC: uploads-pvc (10Gi)
- Deployment: 8 volumes (PVC, HP, ED, CM, SEC, PROJ, DAPI)
- StatefulSet: 3 volumes (ED, CM, SEC)
- DaemonSet: 3 volumes (HP, ED, CM)
- Job: 3 volumes (ED, CM, SEC)
- CronJob: 3 volumes (ED, CM, SEC)
- Pod: ephemeral volume, ConfigMap

Apply test:

```bash
kubectl apply -f yml-test/vol-test.yaml
kubechart -n vol-test
# Press 'v' to toggle volume display
```

---

## 11. Coding Rules

### TypeScript

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"],
}
```

### Coding conventions

- **Không dùng `any`** — dùng `unknown` rồi narrow type
- **Async/await** — không dùng raw Promise chain
- **Error handling** — wrap K8s API calls trong try/catch, hiển thị lỗi rõ ràng
- **Pure functions** — `builder.ts`, `aggregator.ts`, `formatter.ts` phải pure (dễ test)
- **Ink components** — functional components + hooks only, không class components
- **Tên file** — camelCase cho `.ts`, PascalCase cho `.tsx`
- **Metrics graceful degradation** — mọi metrics field là optional. Render layer phải handle `undefined` bằng `"—"`, không crash

### Alignment rule cho metrics columns

Metrics columns cần right-align để tree dễ đọc. Dùng fixed-width padding:

```typescript
// Ví dụ: pad CPU cell đến 12 chars
const cpuCell = formatCpuCell(metrics, mode).padEnd(12);
```

---

## 11. Testing Rules

### Cấu trúc test

```typescript
// tests/metrics/aggregator.test.ts
describe('aggregateWorkloadMetrics', () => {
  it('sums CPU usage across all running pods');
  it('sums memory usage across all running pods');
  it('excludes completed/failed pods from aggregation');
  it('returns undefined when no running pods');
  it('handles missing cpuLimit gracefully');
});

// tests/metrics/formatter.test.ts
describe('formatCpu', () => {
  it('formats millicores under 1000 as "Xm"');
  it('formats millicores over 1000 as "X.Xc"');
});

describe('formatMem', () => {
  it('formats bytes to Mi correctly');
  it('formats bytes to Gi correctly');
});

describe('renderBar', () => {
  it('renders empty bar at 0%');
  it('renders half bar at 50%');
  it('renders full bar at 100%');
  it('renders empty bar for NaN (no limit)');
  it('clamps to 100% when usage exceeds limit');
});

describe('formatCpuCell', () => {
  it('use mode: shows only usage');
  it('use/lim mode: shows usage/limit');
  it('use/req/lim mode: shows all three');
  it('returns "—" when metrics undefined');
});

// tests/k8s/metrics.test.ts
describe('fetchPodMetrics', () => {
  it('returns null when metrics-server not available');
  it('parses millicores correctly');
  it('parses memory quantities correctly');
  it('maps by pod name correctly');
});
```

### Coverage target

- `src/metrics/` — 90%+
- `src/tree/` — 80%+
- `src/render/` — snapshot tests

---

## 12. package.json (v2)

```json
{
  "name": "kubechart",
  "version": "2.0.0",
  "description": "Visualize Kubernetes cluster as ASCII tree with real-time metrics",
  "bin": { "kubechart": "./dist/cli.js" },
  "main": "./dist/index.js",
  "type": "module",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/cli.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": ["kubernetes", "k8s", "cli", "ascii", "devops", "kubectl", "metrics"],
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "dependencies": {
    "@kubernetes/client-node": "^0.21.0",
    "commander": "^12.0.0",
    "ink": "^4.4.1",
    "js-yaml": "^4.1.0",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "ink-testing-library": "^3.0.0",
    "jest": "^29.7.0",
    "prettier": "^3.2.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.4.0"
  }
}
```

---

## 13. Error Handling

```typescript
// Các lỗi cần handle rõ ràng:

// 1. metrics-server không cài → graceful degradation, không crash
// Tree vẫn hiển thị bình thường, metrics columns show "—"
// Status bar note: "(no metrics-server)"

// 2. Không có RBAC để đọc metrics
// "Error: Forbidden — missing RBAC for 'get pods.metrics.k8s.io'"
// Degradation: hiển thị tree không có metrics

// 3. Không tìm thấy kubeconfig
'Error: Cannot find kubeconfig at ~/.kube/config';

// 4. Context không tồn tại
"Error: Context 'my-cluster' not found in kubeconfig";

// 5. Không kết nối được cluster
'Error: Cannot connect to cluster (timeout). Is the cluster running?';

// 6. Không có permissions K8s core
"Error: Forbidden — missing RBAC permissions for 'list pods'";

// 7. Non-interactive terminal
'Error: Watch mode requires an interactive terminal (TTY)';
'Use --once flag for static output in non-interactive environments';
```

---

## 14. Local Development

```bash
# Clone & setup
git clone https://github.com/<you>/kubechart
cd kubechart
npm install

# Build
npm run build

# Test với cluster local (cần minikube/kind đang chạy)
node dist/cli.js
node dist/cli.js -n kube-system
node dist/cli.js --show-errors
node dist/cli.js --metrics use/req/lim   # v2: full metrics
node dist/cli.js --bar                   # v2: bar chart mode

# Link global để test như production
npm link
kubechart

# Tests
npm test
npm run test:coverage
```

---

## 15. Publishing

```bash
npm login
npm publish --access public

# Update version (v2.x.x)
npm version minor   # 2.0.0 → 2.1.0
npm publish
```

---

## 16. Watch Mode Implementation Details

### 16.1 Diff Engine (`src/watch/differ.ts`) — Unchanged

```typescript
export interface DiffResult {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffTrees(prev: ClusterTree, next: ClusterTree): DiffResult;
// Rules unchanged từ v1
// v2: diff không check metrics values — chỉ check structural changes
// Lý do: metrics thay đổi liên tục, flash ở mọi tick sẽ làm UI rất nhiễu
```

### 16.2 Flash Effect — Unchanged từ v1

### 16.3 Status Bar v2

```
[t]oggle: use/lim  [b]bar-chart  | ↺ 2/5s [-/+] [r]efresh [p]ause [q]uit [?]help
```

- `[t]toggle: <currentMode>` — hiển thị mode hiện tại
- `[b]bar-chart` — highlight khi barMode = true
- Các controls còn lại giữ nguyên

---

## 17. MVP v2 Roadmap

### Phase 1 — Metrics Infrastructure (tuần 1)

- [ ] `src/metrics/types.ts` — ResourceUsage, AggregatedMetrics, ClusterMetrics interfaces
- [ ] `src/k8s/metrics.ts` — fetchPodMetrics, fetchNodeMetrics với graceful degradation
- [ ] `src/metrics/aggregator.ts` — aggregateWorkloadMetrics, aggregateClusterMetrics
- [ ] `src/metrics/formatter.ts` — formatCpu, formatMem, formatNet, renderBar, formatCpuCell

### Phase 2 — Render Integration (tuần 2)

- [ ] `src/render/MetricsCell.tsx` — component với barMode support
- [ ] `src/render/TreeView.tsx` — update WorkloadRow, PodRow, ServiceRow, ClusterHeader
- [ ] `src/render/WatchView.tsx` — thêm metricsMode + barMode state + keyboard handlers t, b, ?
- [ ] `src/render/StatusBar.tsx` — hiển thị current metricsMode và barMode indicator

### Phase 3 — Polish & Tests (tuần 3)

- [ ] Tests cho `src/metrics/` (aggregator, formatter, fetch)
- [ ] Tests update cho TreeView với metrics props
- [ ] README update với v2 features và new keyboard shortcuts
- [ ] Verify với minikube (metrics-server enabled và disabled)
- [ ] Check alignment khi terminal width < 120 chars

---

## 18. Alignment & Terminal Width

Một vấn đề quan trọng của v2: metrics columns làm row dài hơn đáng kể.

### Strategy

```
Minimum terminal width để hiển thị đầy đủ: ~120 chars

Nếu terminal width < 120:
  - barMode: vẫn hiển thị nhưng bar width giảm xuống 6 chars
  - metricsMode fallback: use/lim → use khi < 100 chars
  - < 80 chars: ẩn metrics hoàn toàn + warning "Terminal too narrow for metrics. Use --no-metrics or widen terminal."

Detect terminal width: process.stdout.columns
```

### Column layout (use/lim mode, ~120 chars target)

```
├── POD ● pod-name-xxx-yyyyy              CPU: 12m/250m  5%   MEM: 45Mi/256Mi  18%  NET↑1KB↓3KB
│         ← ~35 chars →                  ← ~13 chars →       ← ~15 chars →         ← ~14 chars →
```

---

_Generated by project-scaffolding-agent — cập nhật file này khi có quyết định architecture mới._
_v2 — Metrics Layer | June 2026_

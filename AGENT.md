# AGENT.md — kubechart

> CLI tool để visualize Kubernetes cluster dưới dạng ASCII tree ngay trong terminal.
> Open source, MIT license. Mục tiêu: debug nhanh khi SSH vào server.

---

## 1. Project Overview

| Field            | Value                                             |
| ---------------- | ------------------------------------------------- |
| **Name**         | kubechart                                         |
| **Language**     | TypeScript (Node.js)                              |
| **Purpose**      | ASCII tree visualization của K8s cluster trên CLI |
| **Target users** | DevOps engineers, SREs, open source community     |
| **Install**      | `npm install -g kubechart` hoặc `npx kubechart`   |
| **License**      | MIT                                               |

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
│   │   ├── client.ts           # Khởi tạo KubeConfig, CoreV1Api, AppsV1Api
│   │   ├── fetcher.ts          # Fetch namespaces, deployments, replicaSets, pods, services...
│   │   └── types.ts            # Raw K8s resource interfaces
│   ├── render/
│   │   ├── TreeView.tsx        # Ink component: render ASCII tree
│   │   ├── WatchView.tsx       # Ink component: watch mode with auto-refresh
│   │   ├── StatusBar.tsx      # Ink component: status bar with countdown
│   │   └── colors.ts           # Color theme constants
│   ├── tree/
│   │   ├── builder.ts          # Transform raw K8s data → TreeNode[]
│   │   └── types.ts            # TreeNode, ClusterTree interfaces
│   ├── watch/
│   │   ├── differ.ts           # Diff two ClusterTrees for changes
│   │   └── types.ts            # DiffResult interface
│   ├── output/
│   │   └── serializer.ts       # Serialize ClusterTree to JSON/YAML
│   └── graph/
│       ├── builder.ts          # Build traffic flow graph
│       └── types.ts            # Graph node types
├── tests/
│   ├── tree/
│   │   └── builder.test.ts
│   ├── render/
│   │   ├── TreeView.test.tsx
│   │   ├── colors.test.ts
│   │   └── box.test.ts
│   ├── k8s/
│   │   ├── client.test.ts
│   │   └── fetcher.test.ts
│   ├── watch/
│   │   └── differ.test.ts
│   ├── output/
│   │   └── serializer.test.ts
│   └── graph/
│       └── builder.test.ts
├── dist/                       # tsc output (gitignored)
├── .eslintrc.json
├── .prettierrc
├── jest.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── AGENT.md
└── AGENT-v1.1.md
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
  nodeName: string; // physical K8s node
  ip: string;
  restarts: number;
  reason?: string; // CrashLoopBackOff, OOMKilled, etc.
  ready: string; // "2/3"
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
  ports: string[]; // ["80/TCP", "443/TCP"]
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
  ready: string; // "3/3"
  image: string; // first container image
  replicaSets?: ReplicaSetNode[]; // For Deployments
  pods?: PodNode[]; // For other workloads
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
```

---

## 5. CLI Interface

### 5.1 Commands & Flags

```bash
# Cơ bản — hiển thị namespace hiện tại của context (giống kubectl)
kubechart

# Lọc namespace cụ thể
kubechart -n production
kubechart --namespace production

# Tất cả namespaces
kubechart -A
kubechart --all-namespaces

# Chọn context
kubechart --context my-eks-cluster

# Label selector (giống kubectl)
kubechart -l app=api
kubechart --selector app=api,env=prod

# Chỉ hiện resource có lỗi
kubechart --show-errors

# Kết hợp flags
kubechart -n production --context prod-cluster --show-errors
```

### 5.2 Flag Definitions (`src/cli.ts`)

```typescript
program
  .name('kubechart')
  .description('Visualize Kubernetes cluster as ASCII tree')
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
  .parse(process.argv);
```

**Default behavior**: Watch mode (auto-refresh every 5s). Use `--once` for static output.

---

## 6. K8s Client (`src/k8s/`)

### 6.1 client.ts — Khởi tạo

```typescript
import * as k8s from '@kubernetes/client-node';

export function createClient(context?: string) {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault(); // đọc ~/.kube/config

  if (context) {
    kc.setCurrentContext(context);
  }

  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    batch: kc.makeApiClient(k8s.BatchV1Api),
    networking: kc.makeApiClient(k8s.NetworkingV1Api),
    version: kc.makeApiClient(k8s.VersionApi),
    contextName: kc.getCurrentContext(),
  };
}
```

### 6.2 fetcher.ts — Fetch resources

```typescript
// Fetch theo thứ tự, chạy song song với Promise.all
export async function fetchClusterData(
  client: ReturnType<typeof createClient>,
  opts: FetchOptions
): Promise<ClusterTree>;

// Các hàm fetch riêng lẻ
async function fetchNamespaces(core: k8s.CoreV1Api, ns?: string): Promise<k8s.V1Namespace[]>;
async function fetchDeployments(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1Deployment[]>;
async function fetchReplicaSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1ReplicaSet[]>;
async function fetchStatefulSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1StatefulSet[]>;
async function fetchDaemonSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1DaemonSet[]>;
async function fetchJobs(batch: k8s.BatchV1Api, ns: string): Promise<k8s.V1Job[]>;
async function fetchCronJobs(batch: k8s.BatchV1Api, ns: string): Promise<k8s.V1CronJob[]>;
async function fetchPods(core: k8s.CoreV1Api, ns: string, selector?: string): Promise<k8s.V1Pod[]>;
async function fetchServices(core: k8s.CoreV1Api, ns: string): Promise<k8s.V1Service[]>;
async function fetchIngresses(net: k8s.NetworkingV1Api, ns: string): Promise<k8s.V1Ingress[]>;
```

---

## 7. Tree Builder (`src/tree/builder.ts`)

Transform raw K8s objects → `ClusterTree`:

```typescript
export function buildTree(raw: RawClusterData, opts: FilterOptions): ClusterTree;

// Rules:
// - For Deployments: Group ReplicaSets via ownerReferences, then group pods into ReplicaSets
// - For other workloads: Group pods directly via ownerReferences
// - DaemonSet pods: 1 pod per node là bình thường
// - Job pods: show completed/failed
// - Workload.ready = "readyReplicas/desiredReplicas"
// - Filter --show-errors: chỉ giữ namespace có ít nhất 1 pod không Running (including pods in ReplicaSets)
// - Filter --selector: apply lên pod labels
```

---

## 8. Render Layer (`src/render/`)

### 8.1 ASCII Tree Format

```
◆ CLUSTER  prod-cluster  |  k8s v1.29.2  |  3 nodes

├── NAMESPACE  production  [Active]
│   ├── ▲ Deployment  api-server  [3/3]
│   │   └── ◆ ReplicaSet  api-server-7d9f  [3/3]
│   │       ├── POD  ● api-server-7d9f-xk2p  node-01  192.168.1.10  0 restarts
│   │       ├── POD  ● api-server-7d9f-mn4q  node-02  192.168.1.11  0 restarts
│   │       └── POD  ✖ api-server-7d9f-rs7w  node-03  CrashLoopBackOff  5 restarts
│   ├── ◆ StatefulSet  postgres  [1/1]
│   │   └── POD  ● postgres-0  node-03  PVC: pg-data-0
│   ├── ● SVC  api-svc  ClusterIP  10.96.0.50  80/TCP
│   └── ◆ ING  api.example.com  🔒  → /, /api
│
└── NAMESPACE  staging  [Active]
    └── ▲ Deployment  worker  [0/2]  ⚠ degraded
        └── ◆ ReplicaSet  worker-abc  [0/2]
            ├── POD  ◌ worker-abc-hk4p  Pending
            └── POD  ✖ worker-abc-xx9q  OOMKilled  3 restarts

────────────────────────────────────────
namespaces: 2  |  workloads: 3  |  pods: 5  |  errors: 2
```

### 8.2 Pod Status Symbols

| Symbol | Color  | Meaning                               |
| ------ | ------ | ------------------------------------- |
| `●`    | green  | Running + Ready                       |
| `◌`    | yellow | Pending                               |
| `✖`    | red    | Failed / CrashLoopBackOff / OOMKilled |
| `◑`    | yellow | Running nhưng chưa Ready              |
| `○`    | gray   | Succeeded (Job completed)             |

### 8.3 Ink Components

```typescript
// TreeView.tsx — root component
<TreeView tree={clusterTree} />

// Render theo thứ tự:
// 1. ClusterHeader (context, version, node count)
// 2. NamespaceRow[] (mỗi namespace 1 section)
//    └── WorkloadRow[] (Deployment/STS/DS/Job/CronJob)
//        └── PodRow[] (mỗi pod 1 dòng)
//    └── ServiceRow[]
//    └── IngressRow[]
// 3. Summary footer
```

---

## 9. Coding Rules

### TypeScript

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
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
- **Error handling** — wrap K8s API calls trong try/catch, hiển thị lỗi rõ ràng (không crash im lặng)
- **Pure functions** — `builder.ts` và `filter.ts` phải pure (dễ test)
- **Ink components** — functional components + hooks only, không class components
- **Tên file** — camelCase cho `.ts`, PascalCase cho `.tsx` (Ink components)

---

## 10. Testing Rules

### Cấu trúc test

```typescript
// tests/tree/builder.test.ts
describe('buildTree', () => {
  it('groups pods by ownerReference correctly');
  it('marks workload as degraded when ready < desired');
  it('filters namespaces by --show-errors flag');
  it('applies label selector to pods');
  it('handles empty namespace (no workloads)');
});

// tests/utils/filter.test.ts
describe('applyFilters', () => {
  it('filters by namespace name');
  it('filters by label selector');
  it('--show-errors removes healthy namespaces');
});
```

### Mocking K8s client

```typescript
// Dùng jest.mock — không hit real cluster trong unit tests
jest.mock('../../src/k8s/fetcher');
const mockFetch = fetcher.fetchClusterData as jest.MockedFunction<...>;
mockFetch.mockResolvedValue(fixtures.sampleClusterTree);
```

### Coverage target

- `src/tree/` — 80%+
- `src/utils/` — 90%+
- `src/render/` — snapshot tests

---

## 11. package.json

```json
{
  "name": "kubechart",
  "version": "0.1.0",
  "description": "Visualize Kubernetes cluster as ASCII tree in your terminal",
  "bin": {
    "kubechart": "./dist/cli.js"
  },
  "main": "./dist/index.js",
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
  "keywords": ["kubernetes", "k8s", "cli", "ascii", "devops", "kubectl"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@kubernetes/client-node": "^0.21.0",
    "commander": "^12.0.0",
    "ink": "^4.4.1",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
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

## 12. MVP Roadmap

### Phase 1 — Core (tuần 1) ✅ COMPLETED

- [x] Setup project, tsconfig, eslint, prettier
- [x] `src/k8s/client.ts` — KubeConfig loader
- [x] `src/k8s/fetcher.ts` — fetch namespaces, deployments, pods
- [x] `src/tree/builder.ts` — transform raw → ClusterTree
- [x] `src/render/TreeView.tsx` — basic ASCII tree (Namespace → Pod)

**Implementation Notes:**

- Used ESM modules with `type: module` in package.json
- TypeScript config: `module: NodeNext`, `moduleResolution: NodeNext` for ink compatibility
- All imports require `.js` extensions for ESM
- Successfully connects to minikube cluster
- **Default behavior**: shows current context namespace (kubectl-compatible)
- Use `-A` for all namespaces, `-n <namespace>` for specific namespace
- Namespace filter: use `npm start -- -n <namespace>` (double dash separates npm args)
- Pod matching: fixed ownerReference - pods owned by ReplicaSet, matched by ReplicaSet name prefix
- Hot reload: `npm run dev -- -n <namespace>` with nodemon

### Phase 2 — Full resource support (tuần 2) ✅ COMPLETED

- [x] Thêm StatefulSet, DaemonSet, Job, CronJob vào fetcher
- [x] Service và Ingress nodes
- [x] Pod status symbols (● ✖ ◌ ◑ ○)
- [x] Filter flags: `-n`, `-A`, `--context`, `-l`, `--show-errors`
- [x] Summary footer
- [x] Resource type symbols with colors (▲ ◆ ■ ● ○)
- [x] Pod status legend in footer

**Implementation Notes:**

- Added fetch functions for all workload types (StatefulSet, DaemonSet, Job, CronJob)
- Added Service and Ingress fetch and build functions
- Added colored symbols for resource types:
  - Workloads: ▲ Deployment (blue), ◆ StatefulSet (purple), ■ DaemonSet (red), ● Job (amber), ○ CronJob (emerald)
  - Services: ● ClusterIP (blue), ◆ NodePort (green), ▲ LoadBalancer (purple), ○ ExternalName (amber)
  - Ingress: ◆ (pink) with 🔒 for TLS
- Pod status legend added to footer for quick reference
- All resources properly grouped by namespace with correct tree structure

### Phase 3 — Polish & Publish (tuần 3) ✅ COMPLETED

- [x] Error handling (cluster không reachable, context không tồn tại)
- [x] `--no-color` flag
- [x] Jest tests đạt coverage target
- [x] README với install instructions + screenshots
- [x] Publish lên npm (ready to publish)

**Implementation Notes:**

- Enhanced error handling in `client.ts` and `fetcher.ts` for:
  - Kubeconfig loading errors
  - Context not found errors
  - Connection errors (ECONNREFUSED, timeout)
  - Permission errors (403 Forbidden, 401 Unauthorized)
  - Not found errors (404)
- Implemented `--no-color` flag with `setUseColors()` function in `colors.ts`
- Added comprehensive test suite:
  - `tests/tree/builder.test.ts` - 14 tests for tree building logic
  - `tests/render/colors.test.ts` - 7 tests for color functions
  - `tests/k8s/client.test.ts` - 2 tests for client creation
  - `tests/k8s/fetcher.test.ts` - 4 tests for error handling
- Coverage: 69.11% statements, 60.71% branches, 81.81% functions, 69.45% lines
- Updated README with:
  - Feature list
  - Installation instructions
  - Usage examples with all flags
  - ASCII tree example output
  - Pod status and resource type legends
  - Error handling documentation
  - Development instructions
- Created MIT LICENSE file
- Built project successfully with `npm run build`

### V1.1 — Sau MVP

- [x] `--watch` mode (dùng ink's re-render)
- [x] ReplicaSet support for Deployments (Deployment → ReplicaSet → Pod hierarchy)
- [x] Output to file (`--output json/yaml`)
- [ ] Block view (removed - only TreeView supported)
- [ ] Graph view (removed - only TreeView supported)

---

## 13. Error Handling

```typescript
// Các lỗi cần handle rõ ràng:

// 1. Không tìm thấy kubeconfig
'Error: Cannot find kubeconfig at ~/.kube/config';

// 2. Context không tồn tại
"Error: Context 'my-cluster' not found in kubeconfig";

// 3. Không kết nối được cluster
'Error: Cannot connect to cluster (timeout). Is the cluster running?';

// 4. Không có permissions
"Error: Forbidden — missing RBAC permissions for 'list pods'";

// 5. Namespace không tồn tại (Watch mode)
// Watch mode sẽ auto-retry khi namespace được tạo
// Hiển thị error message: "✖ Error: Failed to fetch cluster data: HTTP request failed"
// User có thể nhấn 'r' để retry thủ công

// 6. Non-interactive terminal
// Watch mode yêu cầu TTY. Nếu không phải TTY:
// "Error: Watch mode requires an interactive terminal (TTY)"
// "Use --once flag for static output in non-interactive environments"
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
# Lần đầu publish
npm login
npm publish --access public

# Update version
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm publish
```

---

_Generated by project-scaffolding-agent — cập nhật file này khi có quyết định architecture mới._

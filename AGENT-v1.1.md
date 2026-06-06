# AGENT-v1.1.md — kubechart

> Đây là spec bổ sung cho **v1.1**, build trên nền MVP đã định nghĩa trong `AGENT.md`.
> Đọc `AGENT.md` trước để hiểu data model, project structure, và coding rules.

---

## 1. Tổng quan V1.1

| Feature                    | Priority | Flag                                        |
| -------------------------- | -------- | ------------------------------------------- |
| Watch mode (auto refresh)  | 1        | Default behavior, `--once` for single print |
| Block view                 | 2        | `--view block`                              |
| Graph view (trace traffic) | 3        | `--view graph`                              |
| Output to file             | 4        | `--output <format>` + `--out-file <path>`   |

---

## 2. Feature 1 — Watch Mode

### 2.1 CLI Flags

```bash
# Watch mode (default) - auto-refresh mỗi 5s
kubechart

# Print một lần và exit
kubechart --once

# Tuỳ chỉnh interval
kubechart --interval 10

# Kết hợp với filter flags
kubechart -n production --show-errors
```

### 2.2 Behavior

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
│  Fetch & render full tree                               │
│    │                                                     │
│    ├─ Error → Show error message                        │
│    │         → Auto-retry on next interval              │
│    │         → Press 'r' to retry immediately             │
│    └─ Success → continue                                 │
│    │                                                     │
│    ▼                                                     │
│  Show status bar with countdown timer                    │
│  "Last updated: 14:32:05 (no changes) | interval: 3/5s | [r]efresh [q]uit"
│    │                                                     │
│    ▼                                                     │
│  Wait interval (5s default)                             │
│    │                                                     │
│    ├─ r pressed → fetch immediately (skip wait)         │
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

### 2.2.1 Error Handling in Watch Mode

- **Namespace not found**: Auto-retry on next interval (useful when creating new namespace)
- **Connection errors**: Auto-retry, display error message with retry hint
- **Non-interactive terminal**: Check `process.stdin.isTTY`, show error suggesting `--once` flag
- **Manual retry**: Press 'r' to retry immediately regardless of interval

### 2.3 Diff Engine (`src/watch/differ.ts`)

```typescript
import type { ClusterTree } from '../tree/types.js';

export interface DiffResult {
  added: string[]; // pod/workload names mới xuất hiện
  removed: string[]; // pod/workload names biến mất
  changed: string[]; // pod/workload names thay đổi status
}

export function diffTrees(prev: ClusterTree, next: ClusterTree): DiffResult;

// Rules:
// - So sánh theo namespace/workload/pod name làm key
// - Pod phase thay đổi (Pending→Running, Running→Failed) → "changed"
// - Pod mới → "added"
// - Pod biến mất → "removed"
// - Workload ready count thay đổi (3/3 → 2/3) → "changed"
```

### 2.4 Flash Effect

```typescript
// src/watch/flash.ts
// Ink không có animation built-in → dùng useEffect + setTimeout
import { useState, useEffect } from 'react';

export function useFlash(changedKeys: string[], duration = 300) {
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (changedKeys.length === 0) return;
    setFlashing(new Set(changedKeys));
    const timer = setTimeout(() => setFlashing(new Set()), duration);
    return () => clearTimeout(timer);
  }, [changedKeys]);

  return flashing;
}

// Trong PodRow.tsx:
// Nếu pod.name ∈ flashing → render với background highlight (inverse color)
// Sau 300ms → render bình thường
```

### 2.5 Status Bar

```
Last updated: 14:32:05 (no changes) | interval: 3/5s ⠋ | [r]efresh [q]uit
```

- Hiển thị ở bottom, fixed, không scroll cùng tree
- Countdown timer: `3/5s` - đếm ngược từ 5s xuống 0s
- Khi đang fetch: hiển thị spinner animation (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) thay vì flash line
- Khi idle: space placeholder để tránh line nhảy
- Dùng `ink`'s `<Static>` cho tree content, `<Box>` fixed bottom cho status bar

### 2.6 Ink Component Structure

```typescript
// src/render/WatchView.tsx
import { useState, useEffect } from 'react';
import { Box, useInput } from 'ink';
import { fetchClusterData } from '../k8s/fetcher.js';
import { diffTrees } from '../watch/differ.js';
import { useFlash } from '../watch/flash.js';
import { TreeView } from './TreeView.js';
import { StatusBar } from './StatusBar.js';
import type { ClusterTree } from '../tree/types.js';
import type { DiffResult } from '../watch/differ.js';

export function WatchView({ opts }: { opts: WatchOptions }) {
  const [tree, setTree] = useState<ClusterTree | null>(null);
  const [diff, setDiff] = useState<DiffResult>({ added: [], removed: [], changed: [] });
  const [status, setStatus] = useState<'fetching' | 'idle'>('fetching');
  const flashing = useFlash(diff.changed);

  // fetch loop
  useEffect(() => {
    const run = async () => {
      setStatus('fetching');
      const next = await fetchClusterData(client, opts);
      if (tree) setDiff(diffTrees(tree, next));
      setTree(next);
      setStatus('idle');
    };

    run();
    const id = setInterval(run, opts.interval * 1000);
    return () => clearInterval(id);
  }, []);

  // keyboard
  useInput((input) => {
    if (input === 'r') triggerRefresh();
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column">
      <TreeView tree={tree} flashing={flashing} />
      <StatusBar status={status} diff={diff} interval={opts.interval} />
    </Box>
  );
}
```

### 2.7 New Files

```
src/
├── watch/
│   ├── differ.ts       # diffTrees()
│   └── flash.ts        # useFlash() hook
├── render/
│   ├── WatchView.tsx   # root watch component
│   └── StatusBar.tsx   # bottom status bar
```

### 2.8 Tests

```typescript
// tests/watch/differ.test.ts
describe('diffTrees', () => {
  it('detects new pod as added');
  it('detects removed pod as removed');
  it('detects phase change as changed');
  it('detects workload ready count change');
  it('returns empty diff when trees are identical');
  it('handles namespace added/removed');
});
```

---

## 3. Feature 2 — Block View

### 3.1 CLI Flag

```bash
kubechart --view block
kubechart --view block -n production
kubechart -w --view block        # kết hợp với watch
```

### 3.2 ASCII Format

```
CLUSTER: prod-cluster  |  k8s v1.29.2  |  3 nodes

┌─ namespace: production ──────────────────────────────────────────────┐
│                                                                       │
│  ┌─ Deployment: api-server ──────┐  ┌─ StatefulSet: postgres ──────┐ │
│  │  ready: 3/3                   │  │  ready: 1/1                  │ │
│  │  image: api:v2.1.0            │  │  image: postgres:15          │ │
│  │  ● pod-xk2p  node-01  0↺     │  │  ● postgres-0  node-03  0↺  │ │
│  │  ● pod-mn4q  node-02  0↺     │  │  PVC: pg-data-0 (20Gi)      │ │
│  │  ✖ pod-rs7w  node-03  5↺     │  └──────────────────────────────┘ │
│  │    CrashLoopBackOff           │                                    │
│  └───────────────────────────────┘  ┌─ DaemonSet: fluentd ─────────┐ │
│                                     │  ready: 3/3                  │ │
│  ┌─ Services ────────────────────┐  │  ● fluentd-xk2p  node-01    │ │
│  │  api-svc  ClusterIP  :80      │  │  ● fluentd-mn4q  node-02    │ │
│  │  pg-svc   ClusterIP  :5432    │  │  ● fluentd-rs7w  node-03    │ │
│  └───────────────────────────────┘  └──────────────────────────────┘ │
│                                                                       │
│  ┌─ Ingress ─────────────────────┐                                   │
│  │  api.example.com → api-svc:80 │                                   │
│  └───────────────────────────────┘                                   │
└───────────────────────────────────────────────────────────────────────┘

┌─ namespace: staging ─────────────────────────────────────────────────┐
│  ┌─ Deployment: api-server ── ⚠ degraded ──────────────────────────┐ │
│  │  ready: 1/3                                                      │ │
│  │  ● pod-hk4p  node-01  0↺                                        │ │
│  │  ✖ pod-xx9q  CrashLoopBackOff  3↺                               │ │
│  │  ◌ pod-pn3r  Pending                                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────
namespaces: 2  |  workloads: 4  |  pods: 7  |  errors: 2
```

### 3.3 Layout Rules

- Mỗi namespace = 1 outer box (`┌─ namespace: <name> ─┐`)
- Workload boxes xếp theo hàng ngang, tối đa **2 boxes/hàng** (tránh tràn terminal 80 cols)
- Nếu terminal width > 120 cols → tối đa **3 boxes/hàng**
- Service và Ingress gom chung vào box riêng ở cuối namespace
- Workload bị degraded: title bar thêm `── ⚠ degraded ──`
- Độ rộng box workload: **tự động theo terminal width** (`process.stdout.columns`)

### 3.4 New Files

```
src/
├── render/
│   ├── BlockView.tsx       # root block component
│   ├── NamespaceBlock.tsx  # outer namespace box
│   ├── WorkloadBlock.tsx   # inner workload box
│   └── ascii/
│       └── box.ts          # helper vẽ box: drawBox(width, lines[])
```

### 3.5 `box.ts` Helper

```typescript
// src/render/ascii/box.ts
export interface BoxOptions {
  title: string;
  lines: string[];
  width: number;
  warning?: boolean; // thêm ⚠ vào title
}

export function drawBox(opts: BoxOptions): string[];
// Returns mảng string, mỗi string = 1 dòng của box
// Caller dùng <Text> của ink để render từng dòng

// Example output:
// ┌─ Deployment: api-server ──────┐
// │  ready: 3/3                   │
// │  ● pod-xk2p  node-01  0↺     │
// └───────────────────────────────┘
```

### 3.6 Tests

```typescript
// tests/render/box.test.ts
describe('drawBox', () => {
  it('renders box with correct width');
  it('truncates long lines with ellipsis');
  it('adds warning indicator when warning=true');
  it('handles empty lines array');
});

// tests/render/BlockView.test.tsx
describe('BlockView', () => {
  it('renders 2 workload boxes per row on narrow terminal');
  it('renders 3 workload boxes per row on wide terminal');
  it('groups services and ingresses into separate box');
});
```

---

## 4. Feature 3 — Graph View

### 4.1 CLI Flag

```bash
kubechart --view graph
kubechart --view graph -n production
kubechart --view graph --show-errors
```

### 4.2 ASCII Format

```
◆ CLUSTER prod-cluster | traffic flow: top-down

namespace: production
─────────────────────────────────────────────────────

Internet
   │
   ▼
├── ◆ Ingress api.example.com 🔒
│   │  → app-svc:80
│   ▼
├── ● Service: app-svc ClusterIP 10.96.0.50
│   │  load balances to 3 pods
│   ├────────────────┬────────────────┐
│   ▼                ▼                ▼
│   ● pod-xk2p node-01
│   ● pod-mn4q node-02
│   └── ● pod-rs7w node-03
│       ▼
│   ▲ Deployment: app ready: 3/3
│       image: app:v1
│
└── ● Service: postgres-svc ClusterIP 10.96.0.51
    │  load balances to 1 pod
    ▼
    ● postgres-0 node-03
    ▼
    ◆ StatefulSet: postgres ready: 1/1
        image: postgres:15

─────────────────────────────────────────────────────
(workloads không có Ingress/Service sẽ hiển thị riêng bên dưới)
```

**Note**: Graph view redesigned to use tree structure with flow arrows (▼, │, └──, ├──) instead of level-based graph boxes. This provides better readability in terminal.

### 4.3 Graph Builder (`src/graph/builder.ts`)

```typescript
import type { NamespaceNode, PodPhase } from '../tree/types.js';

export interface GraphNode {
  id: string;
  kind: 'Internet' | 'Ingress' | 'Service' | 'Workload' | 'Pod';
  label: string;
  meta: string[]; // dòng phụ hiển thị trong box
  status?: PodPhase;
}

export interface GraphEdge {
  from: string; // GraphNode.id
  to: string; // GraphNode.id
  label?: string; // e.g. "→ api-svc:80"
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(ns: NamespaceNode): Graph;

// Rules:
// 1. Bắt đầu từ Ingress → tìm Service target → tìm Pods qua label selector
// 2. Pods của Service → tìm Workload owner qua ownerReferences
// 3. Workload → tìm Service nó depend on qua env vars (SERVICE_HOST pattern) hoặc annotations
// 4. Workloads không linked với Ingress/Service nào → đưa vào "orphan" section
// 5. Tránh cycle: mỗi node chỉ render 1 lần dù có nhiều edges đến
```

### 4.4 Graph Renderer (`src/render/GraphView.tsx`)

```typescript
import type { Graph } from '../graph/builder.js';

// Render theo topological sort của Graph
// Level 0: Internet + Ingress nodes
// Level 1: Service nodes (linked từ Ingress)
// Level 2: Pod nodes (grouped theo Workload)
// Level 3: Downstream Service nodes
// Level N: ...tiếp tục cho đến leaf

// Connector lines:
// 1 target   → dùng "   │\n   ▼"
// 2 targets  → dùng "   ├────┐\n   ▼    ▼"
// 3 targets  → dùng "   ├────┬────┐\n   ▼    ▼    ▼"
// N targets  → tương tự, tự tính spacing theo terminal width
```

### 4.5 New Files

```
src/
├── graph/
│   └── builder.ts          # buildGraph() từ NamespaceNode
├── render/
│   ├── GraphView.tsx        # root graph component
│   └── GraphNode.tsx        # render 1 node box
```

### 4.6 Tests

```typescript
// tests/graph/builder.test.ts
describe('buildGraph', () => {
  it('links Ingress → Service → Pods correctly');
  it('handles Service without Ingress (orphan)');
  it('handles Pod without Service (orphan)');
  it('avoids duplicate nodes in cycle-like configs');
  it('handles multiple Ingress rules pointing to same Service');
});
```

---

## 5. Feature 4 — Output to File

### 5.1 CLI Flags

```bash
# Print JSON to stdout
kubechart --output json

# Print YAML to stdout
kubechart --output yaml

# Write to file
kubechart --output json --out-file ./cluster-snapshot.json
kubechart --output yaml --out-file ./cluster-snapshot.yaml

# Kết hợp với filter
kubechart -n production --output json --out-file ./prod.json

# Dùng trong CI/CD pipeline
kubechart --output json | jq '.namespaces[].workloads[] | select(.ready != .desired)'
```

### 5.2 JSON Schema

```typescript
// Output JSON = ClusterTree interface serialize trực tiếp
// src/output/serializer.ts
import type { ResourceKind } from '../tree/types.js';

export interface ClusterSnapshot {
  meta: {
    contextName: string;
    serverVersion: string;
    nodeCount: number;
    fetchedAt: string; // ISO 8601
    kubechartVersion: string;
  };
  namespaces: NamespaceSnapshot[];
}

export interface NamespaceSnapshot {
  name: string;
  status: string;
  workloads: WorkloadSnapshot[];
  services: ServiceSnapshot[];
  ingresses: IngressSnapshot[];
}

export interface WorkloadSnapshot {
  name: string;
  kind: ResourceKind;
  readyReplicas: number;
  desiredReplicas: number;
  image: string;
  degraded: boolean;
  pods: PodSnapshot[];
}

export interface PodSnapshot {
  name: string;
  phase: string;
  nodeName: string;
  ip: string;
  restarts: number;
  reason?: string;
}

// ServiceSnapshot, IngressSnapshot tương tự — serialize flat
```

### 5.3 YAML Output

```typescript
// Dùng thư viện `js-yaml` để serialize
// KHÔNG dùng thư viện nặng, chỉ cần dump ClusterSnapshot
// src/output/serializer.ts
import * as yaml from 'js-yaml';
import type { ClusterSnapshot } from './serializer.js';

export function toYaml(snapshot: ClusterSnapshot): string {
  return yaml.dump(snapshot, { indent: 2, lineWidth: 120 });
}
```

### 5.4 Serializer (`src/output/serializer.ts`)

```typescript
import type { ClusterTree } from '../tree/types.js';
import type { ClusterSnapshot } from './serializer.js';

export function toJson(tree: ClusterTree): string;
export function toYaml(tree: ClusterTree): string;
export async function writeToFile(content: string, path: string): Promise<void>;
// writeToFile: dùng fs.promises.writeFile
// Nếu path đã tồn tại → overwrite (không hỏi, vì dùng trong CI)
// Sau khi write → in ra stderr: "Written to ./cluster-snapshot.json"
// (stderr để không pollute stdout khi pipe)
```

### 5.5 New Files

```
src/
├── output/
│   └── serializer.ts       # toJson(), toYaml(), writeToFile()
```

### 5.6 New Dependencies

```json
{
  "dependencies": {
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9"
  }
}
```

### 5.7 Tests

```typescript
// tests/output/serializer.test.ts
describe('serializer', () => {
  it('toJson serializes ClusterTree correctly');
  it('toJson output is valid JSON (JSON.parse does not throw)');
  it('toYaml serializes ClusterTree correctly');
  it('toYaml output is valid YAML (yaml.load does not throw)');
  it('meta.fetchedAt is valid ISO 8601 string');
  it('degraded=true when readyReplicas < desiredReplicas');
});
```

---

## 6. Updated CLI (`src/cli.ts`)

```typescript
program
  .name('kubechart')
  .description('Visualize Kubernetes cluster as ASCII tree')
  .version(pkg.version)
  // MVP flags (giữ nguyên)
  .option('-n, --namespace <ns>', 'Filter by namespace')
  .option('-A, --all-namespaces', 'Show all namespaces (default)')
  .option('--context <ctx>', 'Kubeconfig context to use')
  .option('-l, --selector <sel>', 'Label selector (e.g. app=api,env=prod)')
  .option('--show-errors', 'Only show workloads with errors')
  .option('--no-color', 'Disable colored output')
  // V1.1 flags mới
  .option('--once', 'Print chart once and exit (default: watch mode)')
  .option('--interval <seconds>', 'Watch refresh interval (default: 5)', '5')
  .option('--view <mode>', 'View mode: tree | block | graph (default: tree)', 'tree')
  .option('--output <format>', 'Output format: json | yaml (requires --out-file)')
  .option('--out-file <path>', 'File path to write output (requires --output)')
  .parse(process.argv);
```

---

## 7. Updated Project Structure

```
kubechart/
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── k8s/
│   │   ├── client.ts
│   │   ├── fetcher.ts
│   │   └── types.ts
│   ├── tree/
│   │   ├── builder.ts
│   │   └── types.ts
│   ├── watch/                  # NEW
│   │   ├── differ.ts
│   │   └── flash.ts
│   ├── graph/                  # NEW
│   │   └── builder.ts
│   ├── output/                 # NEW
│   │   └── serializer.ts
│   ├── render/
│   │   ├── TreeView.tsx        # Updated: nhận flashing prop
│   │   ├── BlockView.tsx       # NEW
│   │   ├── NamespaceBlock.tsx  # NEW
│   │   ├── WorkloadBlock.tsx   # NEW
│   │   ├── GraphView.tsx       # NEW
│   │   ├── GraphNode.tsx       # NEW
│   │   ├── WatchView.tsx       # NEW
│   │   ├── StatusBar.tsx       # NEW
│   │   ├── PodStatus.tsx
│   │   ├── Summary.tsx
│   │   ├── ascii/
│   │   │   └── box.ts          # NEW
│   │   └── colors.ts
├── tests/
│   ├── tree/
│   ├── watch/                  # NEW
│   │   └── differ.test.ts
│   ├── graph/                  # NEW
│   │   └── builder.test.ts
│   ├── output/                 # NEW
│   │   └── serializer.test.ts
│   └── render/
│       ├── box.test.ts         # NEW
│       └── BlockView.test.tsx  # NEW
└── ...
```

---

## 8. V1.1 Roadmap

### Phase 1 — Watch Mode (tuần 1)

- [ ] `src/watch/differ.ts` — `diffTrees()`
- [ ] `src/watch/flash.ts` — `useFlash()` hook
- [ ] `src/render/WatchView.tsx` — fetch loop + keyboard input
- [ ] `src/render/StatusBar.tsx` — bottom bar
- [ ] Update `TreeView.tsx` nhận `flashing` prop
- [ ] Update `cli.ts` thêm `--watch`, `--interval`
- [ ] Tests: `differ.test.ts`

### Phase 2 — Block View (tuần 1-2)

- [ ] `src/render/ascii/box.ts` — `drawBox()`
- [ ] `src/render/WorkloadBlock.tsx`
- [ ] `src/render/NamespaceBlock.tsx`
- [ ] `src/render/BlockView.tsx`
- [ ] Update `cli.ts` thêm `--view block`
- [ ] Tests: `box.test.ts`, `BlockView.test.tsx`

### Phase 3 — Graph View (tuần 2)

- [ ] `src/graph/builder.ts` — `buildGraph()`
- [ ] `src/render/GraphNode.tsx`
- [ ] `src/render/GraphView.tsx`
- [ ] Update `cli.ts` thêm `--view graph`
- [ ] Tests: `builder.test.ts` (graph)

### Phase 4 — Output to File (tuần 2-3)

- [ ] `npm install js-yaml @types/js-yaml`
- [ ] `src/output/serializer.ts` — `toJson()`, `toYaml()`, `writeToFile()`
- [ ] Update `cli.ts` thêm `--output`, `--out-file`
- [ ] Tests: `serializer.test.ts`

### Phase 5 — Polish & Publish (tuần 3)

- [ ] E2E test với `minikube` trong CI (GitHub Actions)
- [ ] Update README: thêm GIF demo cho watch mode + block + graph
- [ ] `npm version minor` → `0.2.0`
- [ ] `npm publish`

---

## 9. GitHub Actions CI (v1.1)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test -- --coverage

  publish:
    needs: test
    if: github.ref == 'refs/heads/main' && startsWith(github.event.head_commit.message, 'release:')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 10. Breaking Changes từ MVP

**Behavior change**: Default behavior thay đổi từ static tree view sang watch mode (auto-refresh).

| Flag                 | MVP               | V1.1                                 |
| -------------------- | ----------------- | ------------------------------------ |
| (no flags)           | tree view, static | watch mode (auto-refresh 5s)         |
| `--once`             | N/A               | print once and exit (static mode)    |
| `--view tree`        | N/A               | tree view (tường minh)               |
| `--view block`       | N/A               | block view                           |
| `--view graph`       | N/A               | graph view (tree-based flow)         |
| `--interval`         | N/A               | watch refresh interval (default: 5s) |
| `--output json/yaml` | N/A               | serialize ra JSON/YAML               |
| `--out-file`         | N/A               | write output to file                 |

**Migration guide**:

- Nếu muốn behavior cũ (static print): thêm flag `--once`
- Nếu muốn watch mode: chạy mặc định (không cần flag)

---

_Generated by project-scaffolding-agent v1.1 — đọc cùng với `AGENT.md` (MVP spec)._

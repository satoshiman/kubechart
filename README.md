# kubechart

CLI tool to visualize Kubernetes cluster as an ASCII tree directly in your terminal. Perfect for quick debugging when SSH'd into servers.

## Features

- **Watch Mode (Default)**: Auto-refresh with countdown timer, diff highlighting, and manual refresh with `r` key
- **Pause/Resume**: Pause the countdown timer with `p` key to stop auto-refresh temporarily
- **Real-time Metrics**: Display CPU, memory, and network metrics from metrics-server (graceful degradation if unavailable)
- **Metrics Toggle Modes**: Cycle through `general`, `bar`, `use`, `use/lim`, `use/req/lim` with `m` key
- **Bar Chart Mode**: Visual resource usage as progress bars
- **Selector Toggle**: Show/hide label selectors and pod labels with `s` key
- **ASCII Tree Visualization**: Clean, readable tree structure showing namespaces, workloads, replicaSets, pods, services, ingresses, and configmaps
- **Kubernetes Hierarchy**: Displays proper Deployment → ReplicaSet → Pod structure for Deployments
- **Inactive Replica Sets**: Old replica sets without pods are dimmed and marked as "(inactive)"
- **CronJob Integration**: Jobs owned by CronJobs are nested under their parent CronJob to avoid duplication
- **Color-Coded Status**: Visual indicators for pod health (Running, Pending, Failed, etc.)
- **Resource Type Symbols**: Distinct symbols for Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, ReplicaSets, Services, and Ingresses
- **Flexible Filtering**: Filter by namespace, label selector, or show only resources with errors
- **Multi-Context Support**: Switch between different kubeconfig contexts
- **Error Handling**: Clear error messages for common K8s connection issues

## Installation

```bash
npm install -g kubechart
```

Or use with npx:

```bash
npx kubechart
```

## Usage

### Basic Usage

```bash
# Watch mode (default) - auto-refresh every 5s
kubechart

# Print once and exit
kubechart --once

# Show all namespaces
kubechart -A

# Filter by specific namespace
kubechart -n production
```

### Watch Mode

```bash
# Watch with default interval (5s)
kubechart

# Custom refresh interval
kubechart --interval 10

# Keyboard controls:
# - r: manual refresh
# - p: pause/resume countdown timer
# - q or Ctrl+C: quit
# - h: toggle pod status legend
# - +/=: increase refresh interval (max 60s)
# - -/_: decrease refresh interval (min 1s)
# - m: cycle metrics mode (general → bar → use → use/lim → use/req/lim)
# - s: toggle selector display (show/hide label selectors and pod labels)
# - ?: show help overlay
```

### Filtering Options

```bash
# Use specific kubeconfig context
kubechart --context my-eks-cluster

# Label selector (same syntax as kubectl)
kubechart -l app=api
kubechart --selector app=api,env=prod

# Show only workloads with errors
kubechart --show-errors
```

### Metrics Options

```bash
# Disable metrics display entirely
kubechart --no-metrics

# Set metrics display mode
kubechart --metrics use          # usage only
kubechart --metrics use/lim      # usage + limit (default)
kubechart --metrics use/req/lim  # usage + request + limit

# Display metrics as bar charts
kubechart --bar
```

### Output Options

```bash
# Disable colored output
kubechart --no-color

# Export to JSON/YAML
kubechart --output json --out-file cluster.json
kubechart --output yaml --out-file cluster.yaml
```

### Examples

```
◆ CLUSTER minikube | k8s v1.35.1 | 1 nodes

[m]etric: use/lim [s]elector: OFF | ↺ 3/5s [-/+] [r]efresh [p]ause [q]uit [?]help
[0] system ns [1] default [●] kubechart-test [3] kubernetes-dashboard

└── NAMESPACE kubechart-test [Active]
    ├── ▲ Deployment test-deployment [2/2]
    │   ├── ◆ ReplicaSet test-deployment-76f555f8cd [2/2]
    │   │   ├── POD ● test-deployment-76f555f8cd-d9jb6   CPU: 5m/10m  50%  MEM: 8Mi/20Mi  40%
    │   │   └── POD ● test-deployment-76f555f8cd-gmv7w   CPU: 5m/10m  50%  MEM: 8Mi/20Mi  40%
    │   └── ◆ ReplicaSet test-deployment-5cf658bb5 [0/1] (inactive)
    ├── ◆ StatefulSet test-statefulset [2/2]
    │   ├── POD ● test-statefulset-0                 CPU: 5m/10m  50%  MEM: 8Mi/20Mi  40%
    │   └── POD ● test-statefulset-1                 CPU: 5m/10m  50%  MEM: 8Mi/20Mi  40%
    ├── ■ DaemonSet test-daemonset [1/1]
    │   └── POD ● test-daemonset-2m5jb               CPU: 5m/10m  50%  MEM: 8Mi/20Mi  40%
    ├── ● Job test-job [1/1] duration: 9s
    │   └── POD ○ test-job-vttcj                     Completed
    ├── ○ CronJob test-cronjob [0 jobs] last: 3m ago + next: ~2m
    │   └── POD ○ test-cronjob-29679440-sz72c       Completed
    ├── SVC ● ClusterIP test-clusterip-svc           10.101.87.67  80/TCP
    ├── SVC ▲ LoadBalancer test-loadbalancer-svc     [EXTERNAL-IP: <pending>]
    ├── SVC ◆ NodePort test-nodeport-svc             10.102.234.145  80/TCP :30080
    ├── ING ◆ test.local  / → test-clusterip-svc:80
    ├── ING ◆ secure.local 🔒 / → test-clusterip-svc:80 [TLS secret missing]
    ├── CM ◉ app-config 3 keys
    └── CM ◉ test-config 2 keys
────────────────────────────────────────
namespaces: 1 | workloads: 5 | pods: 9 | services: 3 | ingresses: 2 | configmaps: 3
```

## Pod Status Legend

| Symbol | Color  | Meaning                               |
| ------ | ------ | ------------------------------------- |
| `●`    | green  | Running + Ready                       |
| `◑`    | yellow | Running but not Ready                 |
| `◌`    | yellow | Pending                               |
| `✖`    | red    | Failed / CrashLoopBackOff / OOMKilled |
| `○`    | gray   | Succeeded (Job completed)             |
| `◍`    | orange | Terminating (being deleted)           |

## Resource Type Legend

| Symbol | Type         |
| ------ | ------------ |
| ▲      | Deployment   |
| ◆      | ReplicaSet   |
| ◆      | StatefulSet  |
| ■      | DaemonSet    |
| ●      | Job          |
| ○      | CronJob      |
| ●      | ClusterIP    |
| ◆      | NodePort     |
| ▲      | LoadBalancer |
| ○      | ExternalName |
| ◆      | Ingress      |
| ◉      | ConfigMap    |

## Error Handling

kubechart provides clear error messages for common issues:

- **Cannot load kubeconfig**: Check that `~/.kube/config` exists
- **Context not found**: Verify the context name in your kubeconfig
- **Cannot connect to cluster**: Ensure your cluster is running and accessible
- **Forbidden/Unauthorized**: Check your RBAC permissions and credentials
- **Namespace not found**: Watch mode will auto-retry when the namespace becomes available
- **Non-interactive terminal**: Watch mode requires a TTY. Use `--once` flag for static output in scripts or non-interactive environments

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run with local cluster
npm start

# Watch mode with hot reload
npm run dev -- -n <namespace>

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

## Requirements

- Node.js >= 18.0.0
- Access to a Kubernetes cluster
- Valid kubeconfig file

## License

MIT

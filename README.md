# kubechart

CLI tool to visualize Kubernetes cluster as an ASCII tree directly in your terminal. Perfect for quick debugging when SSH'd into servers.

## Features

- **Watch Mode (Default)**: Auto-refresh with countdown timer, diff highlighting, and manual refresh with `r` key
- **Pause/Resume**: Pause the countdown timer with `p` key to stop auto-refresh temporarily
- **ASCII Tree Visualization**: Clean, readable tree structure showing namespaces, workloads, replicaSets, pods, services, and ingresses
- **Kubernetes Hierarchy**: Displays proper Deployment → ReplicaSet → Pod structure for Deployments
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

### Output Options

```bash
# Disable colored output
kubechart --no-color
```

### Examples

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
│   ├── ● SVC  ClusterIP api-svc  10.96.0.50  80/TCP
│   └── ◆ ING  api.example.com  🔒  → /, /api

└── NAMESPACE  staging  [Active]
    └── ▲ Deployment  worker  [0/2]  ⚠ degraded
        └── ◆ ReplicaSet  worker-abc  [0/2]
            ├── POD  ◌ worker-abc-hk4p  Pending
            └── POD  ✖ worker-abc-xx9q  OOMKilled  3 restarts

────────────────────────────────────────
namespaces: 2  |  workloads: 3  |  pods: 5  |  services: 1  |  ingresses: 1
Pod Status: ● Running+Ready  ◑ Running+NotReady  ◌ Pending  ✖ Failed  ○ Succeeded
```

## Pod Status Legend

| Symbol | Color  | Meaning                               |
| ------ | ------ | ------------------------------------- |
| `●`    | green  | Running + Ready                       |
| `◑`    | yellow | Running but not Ready                 |
| `◌`    | yellow | Pending                               |
| `✖`    | red    | Failed / CrashLoopBackOff / OOMKilled |
| `○`    | gray   | Succeeded (Job completed)             |

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

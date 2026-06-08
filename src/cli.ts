#!/usr/bin/env node
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { createClient } from './k8s/client.js';
import { fetchClusterData } from './k8s/fetcher.js';
import { buildTree } from './tree/builder.js';
import { TreeView } from './render/TreeView.js';
import { WatchView } from './render/WatchView.js';
import { setUseColors } from './render/colors.js';
import { serializeCluster } from './output/serializer.js';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { FetchOptions } from './k8s/types.js';

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);
const version = packageJson.version as string;

const program = new Command();

program
  .name('kubechart')
  .description('Visualize Kubernetes cluster as ASCII tree with real-time metrics')
  .version(version)
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
    '-m, --metrics [mode]',
    'Metrics display mode: use | use/lim | use/req/lim (default: bar)'
  )
  .option('--no-metrics', 'Disable metrics display entirely')
  .option('--bar', 'Display metrics as bar charts instead of numbers')
  .parse(process.argv);

const options = program.opts();

async function main() {
  try {
    // Clear screen for watch mode
    if (!options.output && !options.outFile) {
      console.clear();
    }

    // Set color mode based on --no-color flag
    setUseColors(options.color !== false);

    // Create K8s client
    const client = createClient(options.context);

    // Build fetch options
    // Default to current namespace (kubectl behavior)
    // Use -A for all namespaces, -n for specific namespace
    const fetchOpts: FetchOptions = {
      namespace: options.allNamespaces ? undefined : options.namespace || client.currentNamespace,
      allNamespaces: options.allNamespaces,
      selector: options.selector,
      showErrors: options.showErrors,
    };

    // Static mode (--once flag)
    if (options.once) {
      const rawData = await fetchClusterData(client, fetchOpts);
      const tree = buildTree(rawData, client.contextName, {
        showErrors: options.showErrors,
        selector: options.selector,
      });

      // Output to file
      if (options.output && options.outFile) {
        const snapshot = serializeCluster(tree);
        let content: string;

        if (options.output === 'json') {
          content = JSON.stringify(snapshot, null, 2);
        } else if (options.output === 'yaml') {
          content = yaml.dump(snapshot);
        } else {
          console.error(`Error: --output must be 'json' or 'yaml'`);
          process.exit(1);
        }

        fs.writeFileSync(options.outFile, content, 'utf-8');
        console.log(`Output written to ${options.outFile}`);
        return;
      }

      if (options.output || options.outFile) {
        console.error('Error: --output and --out-file must be used together');
        process.exit(1);
      }

      const { waitUntilExit } = render(React.createElement(TreeView, { tree }));
      await waitUntilExit();
      return;
    }

    // Watch mode (default)
    const interval = parseInt(options.interval, 10);
    if (isNaN(interval) || interval < 1) {
      console.error('Error: --interval must be a positive number');
      process.exit(1);
    }

    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      console.error('Error: Watch mode requires an interactive terminal (TTY)');
      console.error('Use --once flag for static output in non-interactive environments');
      process.exit(1);
    }

    const { waitUntilExit } = render(
      React.createElement(WatchView, {
        opts: {
          interval,
          fetchOpts,
          client,
          metrics: options.metrics,
          bar: options.bar,
          noMetrics: options.noMetrics,
        },
      }),
      { patchConsole: false }
    );
    await waitUntilExit();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    console.error('Unknown error occurred');
    process.exit(1);
  }
}

main();

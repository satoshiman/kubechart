import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { fetchClusterData, fetchAllNamespaceNames } from '../k8s/fetcher.js';
import { buildTree } from '../tree/builder.js';
import { diffTrees } from '../watch/differ.js';
import { useFlash } from '../watch/flash.js';
import { TreeView } from './TreeView.js';
import { StatusBar } from './StatusBar.js';
import { isSystemNamespace } from '../k8s/types.js';
import {
  fetchPodMetrics,
  fetchNodeMetrics,
  fetchNodeCapacity,
  attachMetrics,
} from '../k8s/metrics.js';
import type { ClusterTree } from '../tree/types.js';
import type { DiffResult } from '../watch/differ.js';
import type { K8sClient } from '../k8s/client.js';
import type { FetchOptions } from '../k8s/types.js';
import type { MetricsMode } from '../metrics/types.js';

export type DisplayMode = 'general' | 'bar' | 'use' | 'use/lim' | 'use/req/lim';
export interface WatchOptions {
  interval: number;
  fetchOpts: FetchOptions;
  client: K8sClient;
  metrics?: MetricsMode | boolean;
  bar?: boolean;
  noMetrics?: boolean;
}

export function WatchView({ opts }: { opts: WatchOptions }): React.ReactElement {
  const [tree, setTree] = useState<ClusterTree | null>(null);
  const [diff, setDiff] = useState<DiffResult>({ added: [], removed: [], changed: [] });
  const [status, setStatus] = useState<'fetching' | 'idle' | 'error'>('fetching');
  const [error, setError] = useState<string | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(opts.interval);
  const [currentInterval, setCurrentInterval] = useState(opts.interval);
  const [isPaused, setIsPaused] = useState(false);
  const [currentNamespace, setCurrentNamespace] = useState<string | string[] | undefined>(
    opts.fetchOpts.namespace
  );
  const [allNamespaces, setAllNamespaces] = useState<string[]>([]);
  const [showLegend, setShowLegend] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (!opts.metrics) return 'general';
    if (opts.bar) return 'bar';
    if (typeof opts.metrics === 'boolean') return 'bar';
    return opts.metrics;
  });
  const DISPLAY_MODE_CYCLE: DisplayMode[] = ['general', 'bar', 'use', 'use/lim', 'use/req/lim'];
  const flashing = useFlash(diff.changed);

  const fetchTree = useCallback(async () => {
    try {
      setStatus('fetching');
      setError(undefined);
      const fetchOptsWithNs = {
        ...opts.fetchOpts,
        namespace: currentNamespace,
      };
      const rawData = await fetchClusterData(opts.client, fetchOptsWithNs);
      let newTree = buildTree(rawData, opts.client.contextName, {
        showErrors: opts.fetchOpts.showErrors,
        selector: opts.fetchOpts.selector,
      });

      // Fetch and attach metrics if not disabled
      if (!opts.noMetrics) {
        const namespaceForMetrics = Array.isArray(currentNamespace) ? undefined : currentNamespace;
        const [podMetrics, nodeMetrics, nodeCapacity] = await Promise.all([
          fetchPodMetrics(opts.client.kc, namespaceForMetrics),
          fetchNodeMetrics(opts.client.kc),
          fetchNodeCapacity(opts.client.core),
        ]);
        newTree = attachMetrics(newTree, podMetrics, nodeMetrics, nodeCapacity);
      }

      if (tree) {
        const newDiff = diffTrees(tree, newTree);
        setDiff(newDiff);
      }

      setTree(newTree);
      setLastUpdated(new Date());
      setTimeUntilRefresh(currentInterval);
      setStatus('idle');

      // Refetch namespace list after successful tree fetch
      fetchAllNamespaceNames(opts.client)
        .then(setAllNamespaces)
        .catch((err) => {
          console.error('Failed to fetch namespace list:', err);
        });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatus('error');
    }
  }, [tree, opts.client, opts.fetchOpts, opts.interval, currentNamespace, opts.noMetrics]);

  const fetchTreeRef = useRef(fetchTree);
  fetchTreeRef.current = fetchTree;

  // Initial fetch
  useEffect(() => {
    fetchTreeRef.current();
    // Fetch all namespace names for the footer
    fetchAllNamespaceNames(opts.client)
      .then(setAllNamespaces)
      .catch((err) => {
        console.error('Failed to fetch namespace list:', err);
      });
  }, []);

  // Countdown timer - triggers API when reaches 0
  useEffect(() => {
    if (status === 'fetching') {
      setTimeUntilRefresh(currentInterval);
      return;
    }

    const id = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (isPaused) {
          return prev;
        }
        if (prev <= 1) {
          fetchTreeRef.current();
          return currentInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, currentInterval, isPaused]);

  // Manual refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchTreeRef.current();
    }
  }, [refreshTrigger]);

  // Keyboard input (only if stdin is a TTY)
  // Note: useInput must be called unconditionally, but we check inside
  useInput((input, key) => {
    if (!process.stdin.isTTY) return;

    if (input === 'r') {
      setRefreshTrigger((prev) => prev + 1);
    }
    if (input === 'p') {
      setIsPaused((prev) => !prev);
    }
    if (input === 'h') {
      setShowLegend((prev) => !prev);
    }
    if (input === '+' || input === '=') {
      setCurrentInterval((prev) => {
        const newInterval = Math.min(prev + 1, 60);
        setTimeUntilRefresh(newInterval);
        return newInterval;
      });
    }
    if (input === '-' || input === '_') {
      setCurrentInterval((prev) => {
        const newInterval = Math.max(prev - 1, 1);
        setTimeUntilRefresh(newInterval);
        return newInterval;
      });
    }
    if (input === 'q' || (key.ctrl && input === 'c')) {
      process.exit(0);
    }
    // v2 new keys:
    if (input === 'm') {
      setDisplayMode((m: DisplayMode) => {
        const idx = DISPLAY_MODE_CYCLE.indexOf(m);
        return DISPLAY_MODE_CYCLE[(idx + 1) % DISPLAY_MODE_CYCLE.length];
      });
    }
    if (input === 'g') {
      setDisplayMode('general');
    }
    if (input === '?') {
      setShowHelp((v) => !v);
    }

    // Namespace switching with number keys
    if (allNamespaces.length > 0) {
      const num = parseInt(input, 10);
      if (!isNaN(num)) {
        if (num === 0) {
          // Show system/plugin namespaces
          const systemNs = allNamespaces.filter((ns) => isSystemNamespace(ns));
          if (systemNs.length > 0) {
            setCurrentNamespace(systemNs);
            setRefreshTrigger((prev) => prev + 1);
          }
        } else if (num >= 1) {
          // Show non-system namespaces (numbered 1, 2, 3...)
          const nonSystemNs = allNamespaces.filter((ns) => !isSystemNamespace(ns));
          if (num <= nonSystemNs.length) {
            const newNamespace = nonSystemNs[num - 1];
            if (newNamespace !== currentNamespace) {
              setCurrentNamespace(newNamespace);
              setRefreshTrigger((prev) => prev + 1);
            }
          }
        }
      }
    }
  });

  if (!tree) {
    if (status === 'error') {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="red">✖ Error: {error}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Press [r] to retry or [q] to quit</Text>
          </Box>
          <StatusBar
            status="idle"
            diff={diff}
            interval={currentInterval}
            lastUpdated={lastUpdated}
            tree={tree || undefined}
            showLegend={showLegend}
            isPaused={isPaused}
          />
        </Box>
      );
    }
    return (
      <Box>
        <Box marginBottom={1}>
          <Text color="yellow">⠋ Fetching cluster data...</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <TreeView
          tree={tree}
          flashing={flashing}
          namespaces={allNamespaces}
          currentNamespace={currentNamespace}
        />
        <Box marginBottom={1}>
          <Text color="red">✖ Error: {error}</Text>
        </Box>
        <StatusBar
          status="idle"
          diff={diff}
          interval={currentInterval}
          lastUpdated={lastUpdated}
          tree={tree}
          showLegend={showLegend}
          isPaused={isPaused}
        />
      </Box>
    );
  }

  const showMetrics = displayMode !== 'general';
  const barMode = displayMode === 'bar';
  const metricsMode: MetricsMode =
    displayMode === 'bar' ? 'use/lim' : displayMode === 'general' ? 'use' : displayMode;

  return (
    <Box flexDirection="column">
      <TreeView
        tree={tree}
        flashing={flashing}
        namespaces={allNamespaces}
        currentNamespace={currentNamespace}
        metricsMode={metricsMode}
        barMode={barMode}
        showMetrics={showMetrics}
        displayMode={displayMode}
        timeUntilRefresh={timeUntilRefresh}
        interval={currentInterval}
      />
      <StatusBar
        status={status}
        diff={diff}
        interval={currentInterval}
        lastUpdated={lastUpdated}
        tree={tree}
        showLegend={showLegend}
        isPaused={isPaused}
        showHelp={showHelp}
        setShowHelp={setShowHelp}
      />
    </Box>
  );
}

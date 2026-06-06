import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { fetchClusterData, fetchAllNamespaceNames } from '../k8s/fetcher.js';
import { buildTree } from '../tree/builder.js';
import { diffTrees } from '../watch/differ.js';
import { useFlash } from '../watch/flash.js';
import { TreeView } from './TreeView.js';
import { StatusBar } from './StatusBar.js';
import { SYSTEM_NAMESPACES } from '../k8s/types.js';
import type { ClusterTree } from '../tree/types.js';
import type { DiffResult } from '../watch/differ.js';
import type { K8sClient } from '../k8s/client.js';
import type { FetchOptions } from '../k8s/types.js';

export interface WatchOptions {
  interval: number;
  fetchOpts: FetchOptions;
  client: K8sClient;
}

export function WatchView({ opts }: { opts: WatchOptions }): React.ReactElement {
  const [tree, setTree] = useState<ClusterTree | null>(null);
  const [diff, setDiff] = useState<DiffResult>({ added: [], removed: [], changed: [] });
  const [status, setStatus] = useState<'fetching' | 'idle' | 'error'>('fetching');
  const [error, setError] = useState<string | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(opts.interval);
  const [currentNamespace, setCurrentNamespace] = useState<string | string[] | undefined>(
    opts.fetchOpts.namespace
  );
  const [allNamespaces, setAllNamespaces] = useState<string[]>([]);
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
      const newTree = buildTree(rawData, opts.client.contextName, {
        showErrors: opts.fetchOpts.showErrors,
        selector: opts.fetchOpts.selector,
      });

      if (tree) {
        const newDiff = diffTrees(tree, newTree);
        setDiff(newDiff);
      }

      setTree(newTree);
      setLastUpdated(new Date());
      setTimeUntilRefresh(opts.interval);
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
  }, [tree, opts.client, opts.fetchOpts, opts.interval, currentNamespace]);

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

  // Auto-refresh interval (continue even on error to retry automatically)
  useEffect(() => {
    const id = setInterval(() => {
      fetchTreeRef.current();
    }, opts.interval * 1000);
    return () => clearInterval(id);
  }, [opts.interval]);

  // Countdown timer
  useEffect(() => {
    if (status === 'fetching') {
      setTimeUntilRefresh(opts.interval);
      return;
    }

    const id = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (prev <= 1) {
          return opts.interval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, opts.interval]);

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
    if (input === 'q' || (key.ctrl && input === 'c')) {
      process.exit(0);
    }

    // Namespace switching with number keys
    if (allNamespaces.length > 0) {
      const num = parseInt(input, 10);
      if (!isNaN(num)) {
        if (num === 0) {
          // Show system/plugin namespaces
          const systemNs = allNamespaces.filter((ns) => SYSTEM_NAMESPACES.includes(ns));
          if (systemNs.length > 0) {
            setCurrentNamespace(systemNs);
            setRefreshTrigger((prev) => prev + 1);
          }
        } else if (num >= 1) {
          // Show non-system namespaces (numbered 1, 2, 3...)
          const nonSystemNs = allNamespaces.filter((ns) => !SYSTEM_NAMESPACES.includes(ns));
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
            interval={opts.interval}
            lastUpdated={lastUpdated}
            timeUntilRefresh={timeUntilRefresh}
            tree={tree || undefined}
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
          interval={opts.interval}
          lastUpdated={lastUpdated}
          timeUntilRefresh={timeUntilRefresh}
          tree={tree}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <TreeView
        tree={tree}
        flashing={flashing}
        namespaces={allNamespaces}
        currentNamespace={currentNamespace}
      />
      <StatusBar
        status={status}
        diff={diff}
        interval={opts.interval}
        lastUpdated={lastUpdated}
        timeUntilRefresh={timeUntilRefresh}
        tree={tree}
      />
    </Box>
  );
}

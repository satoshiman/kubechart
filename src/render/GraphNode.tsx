import React from 'react';
import { Box, Text } from 'ink';
import type { GraphNode } from '../graph/builder.js';

interface GraphNodeProps {
  node: GraphNode;
}

export function GraphNodeComponent({ node }: GraphNodeProps): React.ReactElement {
  const getStatusColor = () => {
    if (node.kind === 'Pod' && node.status) {
      switch (node.status) {
        case 'Running':
          return 'green';
        case 'Pending':
          return 'yellow';
        case 'Failed':
          return 'red';
        case 'Succeeded':
          return 'gray';
        default:
          return 'white';
      }
    }
    return 'white';
  };

  const getKindSymbol = () => {
    switch (node.kind) {
      case 'Internet':
        return '☁';
      case 'Ingress':
        return '◆';
      case 'Service':
        return '●';
      case 'Workload':
        return '▲';
      case 'Pod':
        return '○';
      default:
        return '▪';
    }
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getStatusColor()}>{getKindSymbol()} {node.label}</Text>
      </Box>
      {node.meta.map((line, index) => (
        <Box key={index}>
          <Text dimColor>  {line}</Text>
        </Box>
      ))}
    </Box>
  );
}

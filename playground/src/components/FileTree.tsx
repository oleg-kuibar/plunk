import { useState, useEffect, useCallback } from 'react';

interface FileTreeProps {
  readdir: (path: string) => Promise<string[]>;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  isReady: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

function FileIcon({ name, isDirectory }: { name: string; isDirectory: boolean }) {
  if (isDirectory) {
    return <span style={{ marginRight: '6px' }}>📁</span>;
  }

  // File type icons
  if (name.endsWith('.ts') || name.endsWith('.tsx')) {
    return <span style={{ marginRight: '6px', color: '#3178c6' }}>TS</span>;
  }
  if (name.endsWith('.js') || name.endsWith('.jsx')) {
    return <span style={{ marginRight: '6px', color: '#f7df1e' }}>JS</span>;
  }
  if (name.endsWith('.json')) {
    return <span style={{ marginRight: '6px', color: '#cbcb41' }}>{'{}'}</span>;
  }
  if (name.endsWith('.html')) {
    return <span style={{ marginRight: '6px', color: '#e34c26' }}>{'<>'}</span>;
  }
  if (name.endsWith('.css')) {
    return <span style={{ marginRight: '6px', color: '#563d7c' }}>#</span>;
  }
  if (name.endsWith('.md')) {
    return <span style={{ marginRight: '6px', color: '#083fa1' }}>M↓</span>;
  }

  return <span style={{ marginRight: '6px' }}>📄</span>;
}

function TreeItem({
  node,
  depth,
  onToggle,
  onSelect,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  const isSelected = selectedPath === node.path;
  const paddingLeft = 12 + depth * 16;

  return (
    <>
      <div
        onClick={() => {
          if (node.isDirectory) {
            onToggle(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        style={{
          padding: '4px 8px',
          paddingLeft: `${paddingLeft}px`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          fontSize: '13px',
          backgroundColor: isSelected ? '#1f6feb33' : 'transparent',
          color: isSelected ? '#58a6ff' : '#c9d1d9',
          borderLeft: isSelected ? '2px solid #58a6ff' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = '#21262d';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {node.isDirectory && (
          <span
            style={{
              marginRight: '4px',
              fontSize: '10px',
              color: '#8b949e',
              width: '12px',
            }}
          >
            {node.isLoading ? '...' : node.isExpanded ? '▼' : '▶'}
          </span>
        )}
        <FileIcon name={node.name} isDirectory={node.isDirectory} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
      </div>
      {node.isDirectory && node.isExpanded && node.children && (
        <>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </>
      )}
    </>
  );
}

export function FileTree({
  readdir,
  onFileSelect,
  selectedFile,
  isReady,
}: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Load root directory
  useEffect(() => {
    if (!isReady) return;

    async function loadRoot() {
      setLoading(true);
      try {
        const entries = await readdir('/');
        const nodes: TreeNode[] = entries
          .filter((name) => !name.startsWith('.') && name !== 'node_modules/')
          .map((name) => ({
            name: name.replace(/\/$/, ''),
            path: `/${name.replace(/\/$/, '')}`,
            isDirectory: name.endsWith('/'),
            isExpanded: false,
          }));

        // Sort: directories first, then alphabetically
        nodes.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        setTree(nodes);
      } catch (err) {
        console.error('Failed to load root directory:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRoot();
  }, [isReady, readdir]);

  const toggleDirectory = useCallback(
    async (path: string) => {
      const updateNode = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
        return Promise.all(
          nodes.map(async (node) => {
            if (node.path === path) {
              if (!node.isExpanded && !node.children) {
                // Need to load children
                const newNode = { ...node, isLoading: true };
                setTree((prev) => replaceNode(prev, path, newNode));

                try {
                  const entries = await readdir(path);
                  const children: TreeNode[] = entries
                    .filter(
                      (name) => !name.startsWith('.') && name !== 'node_modules/'
                    )
                    .map((name) => ({
                      name: name.replace(/\/$/, ''),
                      path: `${path}/${name.replace(/\/$/, '')}`,
                      isDirectory: name.endsWith('/'),
                      isExpanded: false,
                    }));

                  // Sort: directories first, then alphabetically
                  children.sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) {
                      return a.isDirectory ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                  });

                  return {
                    ...node,
                    isExpanded: true,
                    isLoading: false,
                    children,
                  };
                } catch {
                  return { ...node, isLoading: false };
                }
              }
              return { ...node, isExpanded: !node.isExpanded };
            }
            if (node.children) {
              return { ...node, children: await updateNode(node.children) };
            }
            return node;
          })
        );
      };

      const replaceNode = (
        nodes: TreeNode[],
        targetPath: string,
        newNode: TreeNode
      ): TreeNode[] => {
        return nodes.map((node) => {
          if (node.path === targetPath) {
            return newNode;
          }
          if (node.children) {
            return { ...node, children: replaceNode(node.children, targetPath, newNode) };
          }
          return node;
        });
      };

      setTree(await updateNode(tree));
    },
    [tree, readdir]
  );

  const handleSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
    },
    [onFileSelect]
  );

  if (!isReady) {
    return (
      <div
        style={{
          padding: '16px',
          color: '#8b949e',
          fontSize: '13px',
          textAlign: 'center',
        }}
      >
        <div className="animate-pulse">Waiting for environment...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          padding: '16px',
          color: '#8b949e',
          fontSize: '13px',
          textAlign: 'center',
        }}
      >
        <div className="animate-pulse">Loading files...</div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: '8px', paddingBottom: '8px' }}>
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          onToggle={toggleDirectory}
          onSelect={handleSelect}
          selectedPath={selectedFile}
        />
      ))}
    </div>
  );
}

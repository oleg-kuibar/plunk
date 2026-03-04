/// <reference types="vite/client" />

declare module 'virtual:local-plunk' {
  import type { FileSystemTree } from '@webcontainer/api';
  const tree: FileSystemTree | null;
  export default tree;
}

import * as vscode from "vscode";
import type { PlunkStateWatcher } from "../state-watcher";
import { PackageItem, MetadataItem, buildMetadataItems } from "./items";

type TreeNode = PackageItem | MetadataItem;

export class PlunkTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly watcher: PlunkStateWatcher) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      const state = await this.watcher.readState();
      if (!state || !state.links) return [];
      return Object.entries(state.links)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, link]) => new PackageItem(name, link));
    }
    if (element instanceof PackageItem) {
      return buildMetadataItems(element.link);
    }
    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

import * as vscode from "vscode";
import { PlunkStateWatcher } from "./state-watcher";
import { PlunkTreeProvider } from "./tree/provider";
import { GraphPanel } from "./graph/panel";

let stateWatcher: PlunkStateWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  stateWatcher = new PlunkStateWatcher(workspaceRoot);
  context.subscriptions.push(stateWatcher);

  // Tree view
  const treeProvider = new PlunkTreeProvider(stateWatcher);
  const treeView = vscode.window.createTreeView("plunk.linkedPackages", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // Auto-refresh tree on state changes
  stateWatcher.onDidChange((event) => {
    if (event === "state-changed") {
      treeProvider.refresh();
    }
  });

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("plunk.refresh", () => {
      treeProvider.refresh();
    })
  );

  // Graph panel
  const graphPanel = new GraphPanel(context.extensionUri, stateWatcher);
  context.subscriptions.push(graphPanel);

  context.subscriptions.push(
    vscode.commands.registerCommand("plunk.showGraph", () => {
      graphPanel.show();
    })
  );
}

export function deactivate(): void {
  stateWatcher = undefined;
}

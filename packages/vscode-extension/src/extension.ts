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
  context.subscriptions.push(treeView, treeProvider);

  // Auto-refresh tree on any state change
  stateWatcher.onDidChange(() => {
    treeProvider.refresh();
  });

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("plunk.refresh", () => {
      treeProvider.refresh();
    })
  );

  // Open source package.json on click
  context.subscriptions.push(
    vscode.commands.registerCommand("plunk.openSource", async (sourcePath: string) => {
      const pkgJson = vscode.Uri.file(
        sourcePath.replace(/\\/g, "/") + "/package.json"
      );
      try {
        const doc = await vscode.workspace.openTextDocument(pkgJson);
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        // If package.json doesn't exist, reveal the folder in explorer
        vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(sourcePath));
      }
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

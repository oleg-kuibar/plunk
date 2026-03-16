import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import type { ConsumerState, ConsumersRegistry } from "./types";

export type StateEvent = "state-changed" | "consumers-changed";

export class PlunkStateWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<StateEvent>();
  readonly onDidChange = this.emitter.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly DEBOUNCE_MS = 200;

  private cachedState: ConsumerState | undefined;
  private cachedConsumers: ConsumersRegistry | undefined;

  constructor(private readonly workspaceRoot: string) {
    this.setupWatchers();
  }

  private get plunkHome(): string {
    return process.env.PLUNK_HOME || path.join(os.homedir(), ".plunk");
  }

  private setupWatchers(): void {
    // Watch local .plunk/state.json
    const statePattern = new vscode.RelativePattern(
      this.workspaceRoot,
      ".plunk/state.json"
    );
    const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
    stateWatcher.onDidChange(() => this.debouncedEmit("state-changed"));
    stateWatcher.onDidCreate(() => this.debouncedEmit("state-changed"));
    stateWatcher.onDidDelete(() => {
      this.cachedState = undefined;
      this.debouncedEmit("state-changed");
    });
    this.disposables.push(stateWatcher);

    // Watch global consumers.json
    const consumersPattern = new vscode.RelativePattern(
      vscode.Uri.file(this.plunkHome),
      "consumers.json"
    );
    const consumersWatcher =
      vscode.workspace.createFileSystemWatcher(consumersPattern);
    consumersWatcher.onDidChange(() => this.debouncedEmit("consumers-changed"));
    consumersWatcher.onDidCreate(() => this.debouncedEmit("consumers-changed"));
    consumersWatcher.onDidDelete(() => {
      this.cachedConsumers = undefined;
      this.debouncedEmit("consumers-changed");
    });
    this.disposables.push(consumersWatcher);
  }

  private debouncedEmit(event: StateEvent): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (event === "state-changed") this.cachedState = undefined;
      if (event === "consumers-changed") this.cachedConsumers = undefined;
      this.emitter.fire(event);
    }, this.DEBOUNCE_MS);
  }

  async readState(): Promise<ConsumerState | undefined> {
    if (this.cachedState) return this.cachedState;
    try {
      const uri = vscode.Uri.file(
        path.join(this.workspaceRoot, ".plunk", "state.json")
      );
      const data = await vscode.workspace.fs.readFile(uri);
      this.cachedState = JSON.parse(Buffer.from(data).toString("utf-8"));
      return this.cachedState;
    } catch {
      return undefined;
    }
  }

  async readConsumers(): Promise<ConsumersRegistry | undefined> {
    if (this.cachedConsumers) return this.cachedConsumers;
    try {
      const uri = vscode.Uri.file(
        path.join(this.plunkHome, "consumers.json")
      );
      const data = await vscode.workspace.fs.readFile(uri);
      this.cachedConsumers = JSON.parse(Buffer.from(data).toString("utf-8"));
      return this.cachedConsumers;
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.emitter.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

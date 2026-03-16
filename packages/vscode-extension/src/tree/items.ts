import * as vscode from "vscode";
import type { LinkEntry } from "../types";

/** Top-level node: a linked package */
export class PackageItem extends vscode.TreeItem {
  constructor(
    public readonly packageName: string,
    public readonly link: LinkEntry
  ) {
    super(packageName, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = link.version;
    this.tooltip = `${packageName}@${link.version}`;
    this.iconPath = new vscode.ThemeIcon("package");
    this.contextValue = "plunkPackage";
  }
}

/** Child node: a metadata field of a linked package */
export class MetadataItem extends vscode.TreeItem {
  constructor(label: string, value: string, icon?: string) {
    super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
    this.contextValue = "plunkMetadata";
  }
}

/** Helper: build metadata children for a linked package */
export function buildMetadataItems(link: LinkEntry): MetadataItem[] {
  const items: MetadataItem[] = [];
  items.push(new MetadataItem("Source", shortenPath(link.sourcePath), "folder"));
  items.push(new MetadataItem("Linked", formatRelativeTime(link.linkedAt), "clock"));
  if (link.buildId) {
    items.push(new MetadataItem("Build", link.buildId, "tag"));
  }
  items.push(
    new MetadataItem(
      "Backup",
      link.backupExists ? "\u2713" : "\u2717",
      link.backupExists ? "pass" : "warning"
    )
  );
  return items;
}

function shortenPath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

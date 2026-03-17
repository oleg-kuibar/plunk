import ELK from "elkjs/lib/elk.bundled.js";

interface ProjectInfo {
  label: string;
  projectPath: string;
  links: Record<string, { version: string; linkedAt: string; buildId?: string }>;
}

interface GraphMessage {
  command: "update";
  projects: ProjectInfo[];
  consumers: Record<string, string[]> | null;
}

interface LayoutNode {
  id: string;
  type: "library" | "consumer";
  label: string;
  meta?: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
}

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

acquireVsCodeApi();
const elk = new ELK();

const graphEl = document.getElementById("graph")!;
const tooltipEl = document.getElementById("tooltip")!;

let currentNodes: LayoutNode[] = [];
let currentEdges: LayoutEdge[] = [];

let panX = 0;
let panY = 0;
let scale = 1;
let isPanning = false;
let lastMouse = { x: 0, y: 0 };

window.addEventListener("message", async (event: MessageEvent<GraphMessage>) => {
  const msg = event.data;
  if (msg.command === "update") {
    await layoutAndRender(msg.projects, msg.consumers);
  }
});

async function layoutAndRender(
  projects: ProjectInfo[],
  consumers: GraphMessage["consumers"]
): Promise<void> {
  const nodeMap = new Map<string, LayoutNode>();
  const edges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  let edgeIdx = 0;

  // Normalize paths for matching: forward slashes, lowercase on Windows
  const normPath = (p: string) => p.replace(/\\/g, "/").toLowerCase();

  // Build a map of normalized project paths → labels for workspace projects
  const projectLabels = new Map<string, string>();
  for (const p of projects) {
    projectLabels.set(normPath(p.projectPath), p.label);
  }

  // Collect all link info from all projects (for library metadata)
  const allLinks = new Map<string, { version: string; buildId?: string }>();
  for (const project of projects) {
    for (const [pkgName, link] of Object.entries(project.links)) {
      if (!allLinks.has(pkgName)) {
        allLinks.set(pkgName, { version: link.version, buildId: link.buildId });
      }
    }
  }

  // Build graph from workspace projects (local links)
  for (const project of projects) {
    const consId = `con:${normPath(project.projectPath)}`;
    if (!nodeMap.has(consId)) {
      nodeMap.set(consId, {
        id: consId,
        type: "consumer",
        label: project.label,
        meta: `${Object.keys(project.links).length} linked`,
        width: Math.max(120, project.label.length * 8 + 24),
        height: 40,
      });
    }

    for (const [pkgName, link] of Object.entries(project.links)) {
      const libId = `lib:${pkgName}`;
      if (!nodeMap.has(libId)) {
        const meta = `v${link.version}${link.buildId ? ` (${link.buildId})` : ""}`;
        nodeMap.set(libId, {
          id: libId,
          type: "library",
          label: pkgName,
          meta,
          width: Math.max(120, pkgName.length * 8 + 24),
          height: 40,
        });
      }

      edges.push({
        id: `e${edgeIdx++}`,
        sources: [libId],
        targets: [consId],
      });
    }
  }

  // Add edges from consumers.json for consumers outside the workspace
  if (consumers) {
    for (const [pkgName, consumerPaths] of Object.entries(consumers)) {
      const libId = `lib:${pkgName}`;
      if (!nodeMap.has(libId)) {
        const linkInfo = allLinks.get(pkgName);
        const meta = linkInfo
          ? `v${linkInfo.version}${linkInfo.buildId ? ` (${linkInfo.buildId})` : ""}`
          : "";
        nodeMap.set(libId, {
          id: libId,
          type: "library",
          label: pkgName,
          meta,
          width: Math.max(120, pkgName.length * 8 + 24),
          height: 40,
        });
      }

      for (const consumerPath of consumerPaths) {
        const normConsumer = normPath(consumerPath);
        const consId = `con:${normConsumer}`;

        // Skip if already added from workspace projects (avoid duplicates)
        if (nodeMap.has(consId)) {
          // But still add the edge if it doesn't exist
          const edgeExists = edges.some(
            (e) => e.sources[0] === libId && e.targets[0] === consId
          );
          if (!edgeExists) {
            edges.push({
              id: `e${edgeIdx++}`,
              sources: [libId],
              targets: [consId],
            });
          }
          continue;
        }

        // External consumer — use short path, dimmer style
        const shortPath = consumerPath.split("/").slice(-2).join("/");
        nodeMap.set(consId, {
          id: consId,
          type: "consumer",
          label: shortPath,
          meta: "external",
          width: Math.max(120, shortPath.length * 8 + 24),
          height: 40,
        });

        edges.push({
          id: `e${edgeIdx++}`,
          sources: [libId],
          targets: [consId],
        });
      }
    }
  }

  if (nodeMap.size === 0) {
    graphEl.innerHTML = '<div class="empty-state">No linked packages found</div>';
    return;
  }

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
    children: Array.from(nodeMap.values()).map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      labels: [{ text: n.label }],
    })),
    edges,
  };

  try {
    const laid = await elk.layout(elkGraph);

    for (const child of laid.children || []) {
      const node = nodeMap.get(child.id);
      if (node) {
        node.x = child.x ?? 0;
        node.y = child.y ?? 0;
        node.width = child.width ?? node.width;
        node.height = child.height ?? node.height;
      }
    }

    currentNodes = Array.from(nodeMap.values());
    currentEdges = (laid.edges || []).map((e: any) => ({
      id: e.id,
      source: e.sources[0],
      target: e.targets[0],
      sections: e.sections,
    }));

    render();
  } catch (err) {
    graphEl.innerHTML = `<div class="empty-state">Layout error: ${err}</div>`;
  }
}

function render(): void {
  const svgNs = "http://www.w3.org/2000/svg";

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of currentNodes) {
    const nx = n.x ?? 0;
    const ny = n.y ?? 0;
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + n.width);
    maxY = Math.max(maxY, ny + n.height);
  }
  const pad = 40;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;

  let svg = `<svg xmlns="${svgNs}" width="100%" height="100%"
    viewBox="${minX - pad} ${minY - pad} ${vbW} ${vbH}"
    style="transform: translate(${panX}px, ${panY}px) scale(${scale}); transform-origin: center;">`;

  // Arrowhead marker
  svg += `<defs><marker id="arrowhead" viewBox="0 0 10 7" refX="10" refY="3.5"
    markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="var(--vscode-editorWidget-border, #454545)"/>
  </marker></defs>`;

  // Edges
  for (const edge of currentEdges) {
    if (edge.sections) {
      for (const section of edge.sections) {
        let d = `M ${section.startPoint.x} ${section.startPoint.y}`;
        if (section.bendPoints) {
          for (const bp of section.bendPoints) {
            d += ` L ${bp.x} ${bp.y}`;
          }
        }
        d += ` L ${section.endPoint.x} ${section.endPoint.y}`;
        svg += `<path class="edge" d="${d}" marker-end="url(#arrowhead)"/>`;
      }
    }
  }

  // Nodes
  for (const node of currentNodes) {
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const isExternal = node.meta === "external";
    const cssClass = node.type === "library" ? "node-library" : "node-consumer";
    const extraClass = isExternal ? " node-external" : "";
    const rx = node.type === "library" ? 20 : 4;

    svg += `<rect x="${nx}" y="${ny}" width="${node.width}" height="${node.height}"
      rx="${rx}" ry="${rx}" class="${cssClass}${extraClass}"
      data-id="${node.id}" data-meta="${escapeAttr(node.meta || "")}" />`;

    svg += `<text class="label${isExternal ? " label-external" : ""}" x="${nx + node.width / 2}" y="${ny + node.height / 2}">${escapeHtml(node.label)}</text>`;
  }

  svg += "</svg>";
  graphEl.innerHTML = svg;

  // Hover events
  graphEl.querySelectorAll("rect[data-id]").forEach((el) => {
    el.addEventListener("mouseenter", (e) => {
      const target = e.target as SVGElement;
      const id = target.getAttribute("data-id") ?? "";
      const node = currentNodes.find((n) => n.id === id);
      if (!node) return;

      let text = node.label;
      if (node.meta && node.meta !== "external") text += `\n${node.meta}`;
      if (node.meta === "external") text += "\n(outside workspace)";
      tooltipEl.textContent = text;
      tooltipEl.style.display = "block";
    });

    el.addEventListener("mousemove", (e) => {
      const me = e as MouseEvent;
      tooltipEl.style.left = me.clientX + 12 + "px";
      tooltipEl.style.top = me.clientY + 12 + "px";
    });

    el.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });
  });
}

// Pan/zoom
graphEl.addEventListener("mousedown", (e) => {
  isPanning = true;
  lastMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  panX += e.clientX - lastMouse.x;
  panY += e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  const svg = graphEl.querySelector("svg");
  if (svg) {
    (svg as HTMLElement).style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
});

window.addEventListener("mouseup", () => {
  isPanning = false;
});

graphEl.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale = Math.max(0.1, Math.min(3, scale * delta));
  const svg = graphEl.querySelector("svg");
  if (svg) {
    (svg as HTMLElement).style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
}, { passive: false });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

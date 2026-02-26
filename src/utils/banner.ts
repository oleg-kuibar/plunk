import pc from "picocolors";

const PLUNK_ASCII = `
  ██████╗ ██╗     ██╗   ██╗███╗   ██╗██╗  ██╗
  ██╔══██╗██║     ██║   ██║████╗  ██║██║ ██╔╝
  ██████╔╝██║     ██║   ██║██╔██╗ ██║█████╔╝
  ██╔═══╝ ██║     ██║   ██║██║╚██╗██║██╔═██╗
  ██║     ███████╗╚██████╔╝██║ ╚████║██║  ██╗
  ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝
`;

export function showBanner(): void {
  console.log(pc.yellow(PLUNK_ASCII));
  console.log(pc.cyan("  📦 Modern local package development tool"));
  console.log(pc.dim("  Smart file copying for node_modules injection\n"));
}

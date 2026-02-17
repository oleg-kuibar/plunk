import { consola } from "consola";
import pc from "picocolors";

interface Suggestion {
  pattern: RegExp;
  message: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    pattern: /not found in store/i,
    message: "Run 'plunk publish' in the package directory first, or use --from <path>.",
  },
  {
    pattern: /is not linked/i,
    message: "Run 'plunk add <package>' to link it first.",
  },
  {
    pattern: /No package\.json/i,
    message: "Make sure you're in a valid package directory with a package.json.",
  },
  {
    pattern: /missing 'name'/i,
    message: "Add a 'name' field to your package.json.",
  },
  {
    pattern: /missing 'version'/i,
    message: "Add a 'version' field to your package.json.",
  },
  {
    pattern: /store entry missing/i,
    message: "Re-publish the package with 'plunk publish'.",
  },
  {
    pattern: /EACCES|EPERM/i,
    message: "Permission denied. Try running with elevated privileges or check file ownership.",
  },
  {
    pattern: /ENOSPC/i,
    message: "Disk is full. Free up some space and try again.",
  },
  {
    pattern: /No publishable files/i,
    message: "Check the 'files' field in package.json, or ensure the build output exists.",
  },
  {
    pattern: /private.*package/i,
    message: "Use --private flag to publish private packages.",
  },
];

/**
 * Log an error with an actionable suggestion if one matches.
 */
export function errorWithSuggestion(message: string): void {
  consola.error(message);
  for (const { pattern, message: suggestion } of SUGGESTIONS) {
    if (pattern.test(message)) {
      consola.info(`${pc.dim("Suggestion:")} ${suggestion}`);
      break;
    }
  }
}

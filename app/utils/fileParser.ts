import type { ParsedFile, ParsedFileData } from "~/types";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/jpg",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

interface ParseResult {
  sku: string;
  sortOrder: number;
}

/**
 * Parse a filename to extract SKU and sort order.
 * Uses the LAST hyphen as separator to protect SKUs containing hyphens.
 * Example: "SUMMER-DRESS-RED-01.jpg" -> { sku: "SUMMER-DRESS-RED", sortOrder: 1 }
 */
export function parseFilename(filename: string): ParseResult {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // Find LAST hyphen position
  const lastHyphenIndex = nameWithoutExt.lastIndexOf("-");

  if (lastHyphenIndex === -1) {
    throw new Error("No hyphen found - cannot determine sort order");
  }

  if (lastHyphenIndex === 0) {
    throw new Error("SKU cannot be empty");
  }

  const sku = nameWithoutExt.substring(0, lastHyphenIndex).trim();
  const sortStr = nameWithoutExt.substring(lastHyphenIndex + 1).trim();

  if (!sku) {
    throw new Error("SKU cannot be empty");
  }

  const sortOrder = parseInt(sortStr, 10);

  if (isNaN(sortOrder)) {
    throw new Error(`Invalid sort number: "${sortStr}"`);
  }

  if (sortOrder < 0) {
    throw new Error("Sort number cannot be negative");
  }

  return { sku: sku.toUpperCase(), sortOrder };
}

/**
 * Validate a file's type and size
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type || "unknown"}. Allowed: JPEG, PNG, GIF, WebP`,
    };
  }

  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `File exceeds 20MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: "File is empty",
    };
  }

  return { valid: true };
}

/**
 * Parse and validate a single file
 */
export function parseAndValidateFile(file: File): ParsedFile {
  // First validate file type and size
  const validation = validateFile(file);
  if (!validation.valid) {
    return {
      originalFilename: file.name,
      sku: "",
      sortOrder: 0,
      file,
      isValid: false,
      error: validation.error,
    };
  }

  // Then parse filename
  try {
    const { sku, sortOrder } = parseFilename(file.name);
    return {
      originalFilename: file.name,
      sku,
      sortOrder,
      file,
      isValid: true,
    };
  } catch (error) {
    return {
      originalFilename: file.name,
      sku: "",
      sortOrder: 0,
      file,
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

/**
 * Parse multiple files and return parsed results
 */
export function parseFiles(files: File[]): ParsedFile[] {
  return files.map(parseAndValidateFile);
}

/**
 * Group parsed files by SKU
 */
export function groupFilesBySku(
  files: ParsedFileData[]
): Record<string, ParsedFileData[]> {
  const grouped: Record<string, ParsedFileData[]> = {};

  for (const file of files) {
    if (!file.isValid) continue;

    if (!grouped[file.sku]) {
      grouped[file.sku] = [];
    }
    grouped[file.sku].push(file);
  }

  // Sort files within each group by sortOrder
  for (const sku of Object.keys(grouped)) {
    grouped[sku].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return grouped;
}

/**
 * Get unique SKUs from parsed files
 */
export function getUniqueSKUs(files: ParsedFileData[]): string[] {
  const skus = new Set<string>();
  for (const file of files) {
    if (file.isValid && file.sku) {
      skus.add(file.sku);
    }
  }
  return Array.from(skus);
}

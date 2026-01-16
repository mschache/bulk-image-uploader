// Upload Settings Configuration
export interface UploadSettings {
  dryRun: boolean;
  uploadStrategy: "replace" | "prepend" | "append";
  seoOptimization: boolean;
  altTextByPosition: Record<number, string>; // Custom alt text per sort position, e.g., {1: "Front", 2: "Back"}
}

// Parsed file with extracted SKU and sort order
export interface ParsedFile {
  originalFilename: string;
  sku: string;
  sortOrder: number;
  file: File;
  isValid: boolean;
  error?: string;
}

// Server-side parsed file (File converted to buffer data)
export interface ParsedFileData {
  originalFilename: string;
  sku: string;
  sortOrder: number;
  fileData: ArrayBuffer;
  fileType: string;
  fileSize: number;
  isValid: boolean;
  error?: string;
}

// Product data returned from Shopify
export interface ProductData {
  id: string;
  title: string;
  mediaIds: string[];
}

// Result of processing a single file
export interface ProcessingResult {
  filename: string;
  detectedSku: string;
  productFound: boolean;
  productTitle?: string;
  productId?: string;
  status: "skipped" | "success" | "error" | "dry-run";
  errorDetails?: string;
}

// Upload task for the queue
export interface UploadTask {
  parsedFile: ParsedFileData;
  productId: string;
  productTitle: string;
  settings: UploadSettings;
}

// Staged upload target from Shopify
export interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

// Grouped files by SKU
export interface GroupedFiles {
  [sku: string]: ParsedFileData[];
}

// Action response
export interface ActionResponse {
  success: boolean;
  results: ProcessingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

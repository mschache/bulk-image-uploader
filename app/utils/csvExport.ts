import type { ProcessingResult } from "~/types";

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // If value contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Generate CSV content from processing results
 */
export function generateCSV(results: ProcessingResult[]): string {
  const headers = [
    "Filename",
    "Detected SKU",
    "Product Found",
    "Product Title",
    "Status",
    "Error Details",
  ];

  const rows = results.map((result) => [
    result.filename,
    result.detectedSku,
    result.productFound ? "Yes" : "No",
    result.productTitle || "",
    formatStatus(result.status),
    result.errorDetails || "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCSV).join(","))
    .join("\n");

  return csvContent;
}

/**
 * Format status for human-readable display
 */
function formatStatus(status: ProcessingResult["status"]): string {
  switch (status) {
    case "success":
      return "Success";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    case "dry-run":
      return "Dry Run (Not Uploaded)";
    default:
      return status;
  }
}

/**
 * Create a downloadable CSV blob URL
 */
export function createCSVDownloadURL(results: ProcessingResult[]): string {
  const csvContent = generateCSV(results);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  return URL.createObjectURL(blob);
}

/**
 * Generate a filename for the CSV export
 */
export function generateCSVFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `bulk-upload-report-${timestamp}.csv`;
}

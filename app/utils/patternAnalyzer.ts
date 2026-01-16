import type { ParsedFile } from "~/types";

export interface MissingImageWarning {
  sku: string;
  expectedCount: number;
  actualCount: number;
  missingNumbers: number[];
  hasGaps: boolean;
}

export interface PatternAnalysis {
  mostCommonCount: number;
  totalSkus: number;
  skusWithExpectedCount: number;
  warnings: MissingImageWarning[];
  isConsistentPattern: boolean;
}

/**
 * Analyze files to detect potentially missing images based on patterns
 */
export function analyzeImagePattern(files: ParsedFile[]): PatternAnalysis | null {
  const validFiles = files.filter((f) => f.isValid);

  if (validFiles.length === 0) {
    return null;
  }

  // Group files by SKU
  const skuGroups: Record<string, number[]> = {};
  for (const file of validFiles) {
    if (!skuGroups[file.sku]) {
      skuGroups[file.sku] = [];
    }
    skuGroups[file.sku].push(file.sortOrder);
  }

  const skus = Object.keys(skuGroups);

  if (skus.length === 0) {
    return null;
  }

  // Count images per SKU
  const countFrequency: Record<number, number> = {};
  for (const sku of skus) {
    const count = skuGroups[sku].length;
    countFrequency[count] = (countFrequency[count] || 0) + 1;
  }

  // Find the most common count
  let mostCommonCount = 0;
  let maxFrequency = 0;
  for (const [count, frequency] of Object.entries(countFrequency)) {
    if (frequency > maxFrequency) {
      maxFrequency = frequency;
      mostCommonCount = parseInt(count);
    }
  }

  // Only analyze patterns if we have at least 2 SKUs
  if (skus.length < 2) {
    return null;
  }

  // Check if at least 50% of SKUs follow the same pattern
  const isConsistentPattern = maxFrequency >= skus.length * 0.5;

  // Find warnings for SKUs that don't match the pattern or have gaps
  const warnings: MissingImageWarning[] = [];

  for (const sku of skus) {
    const sortOrders = skuGroups[sku].sort((a, b) => a - b);
    const actualCount = sortOrders.length;

    // Check for gaps in sequence
    const missingNumbers: number[] = [];
    const minSort = Math.min(...sortOrders);
    const maxSort = Math.max(...sortOrders);

    // Find gaps in the sequence
    for (let i = minSort; i <= maxSort; i++) {
      if (!sortOrders.includes(i)) {
        missingNumbers.push(i);
      }
    }

    // Check if this SKU has fewer images than expected
    const hasFewerThanExpected = isConsistentPattern && actualCount < mostCommonCount;
    const hasGaps = missingNumbers.length > 0;

    // Add missing numbers at the end if fewer than expected
    if (hasFewerThanExpected && !hasGaps) {
      const lastNumber = maxSort;
      for (let i = lastNumber + 1; i <= lastNumber + (mostCommonCount - actualCount); i++) {
        missingNumbers.push(i);
      }
    }

    if (hasGaps || hasFewerThanExpected) {
      warnings.push({
        sku,
        expectedCount: mostCommonCount,
        actualCount,
        missingNumbers,
        hasGaps,
      });
    }
  }

  // Sort warnings by SKU
  warnings.sort((a, b) => a.sku.localeCompare(b.sku));

  return {
    mostCommonCount,
    totalSkus: skus.length,
    skusWithExpectedCount: maxFrequency,
    warnings,
    isConsistentPattern,
  };
}

/**
 * Format missing numbers as a readable string
 */
export function formatMissingNumbers(numbers: number[]): string {
  if (numbers.length === 0) return "";
  if (numbers.length === 1) return String(numbers[0]).padStart(2, "0");

  // Group consecutive numbers
  const groups: string[] = [];
  let start = numbers[0];
  let end = numbers[0];

  for (let i = 1; i <= numbers.length; i++) {
    if (i < numbers.length && numbers[i] === end + 1) {
      end = numbers[i];
    } else {
      if (start === end) {
        groups.push(String(start).padStart(2, "0"));
      } else {
        groups.push(`${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`);
      }
      if (i < numbers.length) {
        start = numbers[i];
        end = numbers[i];
      }
    }
  }

  return groups.join(", ");
}

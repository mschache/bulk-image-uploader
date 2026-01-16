import pLimit from "p-limit";
import type {
  ParsedFileData,
  ProcessingResult,
  UploadSettings,
  ProductData,
  StagedUploadTarget,
} from "~/types";
import {
  createStagedUpload,
  uploadToStagedTarget,
  createProductMedia,
  deleteProductMedia,
  reorderProductMedia,
} from "./shopifyMedia.server";

// Maximum concurrent uploads - balanced for speed while respecting API limits
const MAX_CONCURRENT = 5;
const limit = pLimit(MAX_CONCURRENT);

interface AdminContext {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

interface UploadTask {
  file: ParsedFileData;
  product: ProductData;
  settings: UploadSettings;
  admin: AdminContext;
}

/**
 * Process a single upload task
 */
async function processOneUpload(task: UploadTask): Promise<ProcessingResult> {
  const { file, product, settings, admin } = task;

  try {
    // Generate alt text if SEO optimization is enabled
    let altText: string | undefined;
    if (settings.seoOptimization) {
      const customText = settings.altTextByPosition?.[file.sortOrder];
      const suffix = customText || `View ${String(file.sortOrder).padStart(2, "0")}`;
      altText = `${product.title} - ${suffix}`;
    }

    // Step 1: Create staged upload target
    const stagedTarget = await createStagedUpload(admin, file);

    // Step 2: Upload file to staged target
    await uploadToStagedTarget(stagedTarget, file);

    // Step 3: Create product media with the uploaded file
    await createProductMedia(admin, product.id, stagedTarget.resourceUrl, altText);

    return {
      filename: file.originalFilename,
      detectedSku: file.sku,
      productFound: true,
      productTitle: product.title,
      productId: product.id,
      status: "success",
    };
  } catch (error) {
    return {
      filename: file.originalFilename,
      detectedSku: file.sku,
      productFound: true,
      productTitle: product.title,
      productId: product.id,
      status: "error",
      errorDetails: error instanceof Error ? error.message : "Unknown upload error",
    };
  }
}

/**
 * Process all files for a single product based on upload strategy
 */
async function processProductFiles(
  files: ParsedFileData[],
  product: ProductData,
  settings: UploadSettings,
  admin: AdminContext
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  // Sort files by sortOrder
  const sortedFiles = [...files].sort((a, b) => a.sortOrder - b.sortOrder);

  // Handle different upload strategies
  if (settings.uploadStrategy === "replace") {
    // Delete all existing media first
    if (product.mediaIds.length > 0) {
      try {
        await deleteProductMedia(admin, product.id, product.mediaIds);
      } catch (error) {
        // Log error but continue with upload
        console.error(`Failed to delete existing media for ${product.id}:`, error);
      }
    }
  }

  // Process uploads with concurrency limit
  const uploadPromises = sortedFiles.map((file) =>
    limit(() =>
      processOneUpload({
        file,
        product,
        settings,
        admin,
      })
    )
  );

  const uploadResults = await Promise.all(uploadPromises);
  results.push(...uploadResults);

  // Handle prepend strategy - reorder media after upload
  if (settings.uploadStrategy === "prepend" && product.mediaIds.length > 0) {
    const successfulUploads = uploadResults.filter((r) => r.status === "success");
    if (successfulUploads.length > 0) {
      try {
        // New images should come first, then existing ones
        // The reorder will be handled by position in productReorderMedia
        await reorderProductMedia(admin, product.id, successfulUploads.length);
      } catch (error) {
        console.error(`Failed to reorder media for ${product.id}:`, error);
      }
    }
  }

  return results;
}

/**
 * Process the entire upload queue
 */
export async function processUploadQueue(
  groupedFiles: Record<string, ParsedFileData[]>,
  productMap: Map<string, ProductData>,
  settings: UploadSettings,
  admin: AdminContext
): Promise<ProcessingResult[]> {
  const allResults: ProcessingResult[] = [];

  // Process each SKU group
  for (const [sku, files] of Object.entries(groupedFiles)) {
    const product = productMap.get(sku);

    if (!product) {
      // Product not found - mark all files for this SKU as skipped
      for (const file of files) {
        allResults.push({
          filename: file.originalFilename,
          detectedSku: file.sku,
          productFound: false,
          status: "skipped",
          errorDetails: `No product found with SKU: ${sku}`,
        });
      }
      continue;
    }

    // Dry run mode - don't actually upload
    if (settings.dryRun) {
      for (const file of files) {
        allResults.push({
          filename: file.originalFilename,
          detectedSku: file.sku,
          productFound: true,
          productTitle: product.title,
          productId: product.id,
          status: "dry-run",
        });
      }
      continue;
    }

    // Process actual uploads
    const productResults = await processProductFiles(files, product, settings, admin);
    allResults.push(...productResults);
  }

  return allResults;
}

/**
 * Generate summary statistics from results
 */
export function generateSummary(results: ProcessingResult[]) {
  return {
    total: results.length,
    successful: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    dryRun: results.filter((r) => r.status === "dry-run").length,
  };
}

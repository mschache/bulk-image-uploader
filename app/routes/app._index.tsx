import { useState, useCallback, useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  Card,
  Text,
  Banner,
  Spinner,
  ProgressBar,
  Button,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { SettingsCard } from "~/components/SettingsCard";
import { UploadDropZone } from "~/components/UploadDropZone";
import { ResultsTable } from "~/components/ResultsTable";
import type {
  UploadSettings,
  ParsedFile,
  ParsedFileData,
  ProcessingResult,
  ActionResponse,
} from "~/types";
import { groupFilesBySku, getUniqueSKUs } from "~/utils/fileParser";
import { queryProductsBySKUs } from "~/utils/shopifyMedia.server";
import { processUploadQueue, generateSummary } from "~/utils/imageQueue.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await unstable_parseMultipartFormData(
      request,
      unstable_createMemoryUploadHandler({
        maxPartSize: 20 * 1024 * 1024,
      })
    );

    const settingsJson = formData.get("settings");
    if (!settingsJson || typeof settingsJson !== "string") {
      throw new Error("Settings not provided");
    }
    const settings: UploadSettings = JSON.parse(settingsJson);

    const filesDataJson = formData.get("filesData");
    if (!filesDataJson || typeof filesDataJson !== "string") {
      throw new Error("Files data not provided");
    }
    const filesMetadata: Array<{
      originalFilename: string;
      sku: string;
      sortOrder: number;
      fileType: string;
      fileSize: number;
      isValid: boolean;
      error?: string;
    }> = JSON.parse(filesDataJson);

    const fileBlobs = formData.getAll("files") as File[];

    const parsedFiles: ParsedFileData[] = await Promise.all(
      filesMetadata.map(async (meta, index) => {
        const file = fileBlobs[index];
        const fileData = file ? await file.arrayBuffer() : new ArrayBuffer(0);
        return {
          originalFilename: meta.originalFilename,
          sku: meta.sku,
          sortOrder: meta.sortOrder,
          fileData,
          fileType: meta.fileType,
          fileSize: meta.fileSize,
          isValid: meta.isValid,
          error: meta.error,
        };
      })
    );

    const validFiles = parsedFiles.filter((f) => f.isValid);
    const invalidResults: ProcessingResult[] = parsedFiles
      .filter((f) => !f.isValid)
      .map((f) => ({
        filename: f.originalFilename,
        detectedSku: f.sku || "",
        productFound: false,
        status: "error" as const,
        errorDetails: f.error || "Invalid file",
      }));

    if (validFiles.length === 0) {
      return json<ActionResponse>({
        success: false,
        results: invalidResults,
        summary: {
          total: invalidResults.length,
          successful: 0,
          failed: invalidResults.length,
          skipped: 0,
        },
      });
    }

    const groupedFiles = groupFilesBySku(validFiles);
    const uniqueSKUs = getUniqueSKUs(validFiles);
    const productMap = await queryProductsBySKUs(admin, uniqueSKUs);
    const uploadResults = await processUploadQueue(
      groupedFiles,
      productMap,
      settings,
      admin
    );

    const allResults = [...invalidResults, ...uploadResults];
    const summary = generateSummary(allResults);

    return json<ActionResponse>({
      success: summary.failed === 0,
      results: allResults,
      summary,
    });
  } catch (error) {
    console.error("Action error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json<ActionResponse>({
      success: false,
      results: [{
        filename: "Error",
        detectedSku: "",
        productFound: false,
        status: "error",
        errorDetails: errorMessage,
      }],
      summary: {
        total: 1,
        successful: 0,
        failed: 1,
        skipped: 0,
      },
    });
  }
};

export default function Index() {
  const fetcher = useFetcher<ActionResponse>();
  const isProcessing = fetcher.state === "submitting" || fetcher.state === "loading";

  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [settings, setSettings] = useState<UploadSettings>({
    dryRun: true,
    uploadStrategy: "append",
    seoOptimization: false,
    altTextByPosition: {},
  });
  const [results, setResults] = useState<ActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const progressRef = useRef(0);

  const validFilesCount = files.filter((f) => f.isValid).length;
  const canProcess = validFilesCount > 0 && !isProcessing;
  const validSortOrders = files.filter((f) => f.isValid).map((f) => f.sortOrder);
  const maxPosition = validSortOrders.length > 0 ? Math.max(...validSortOrders) : 0;

  // Handle fetcher response
  useEffect(() => {
    console.log("Fetcher state:", fetcher.state, "Data:", fetcher.data);
    if (fetcher.state === "idle" && fetcher.data) {
      console.log("Setting results:", fetcher.data);
      setResults(fetcher.data);
      setProgress(100);
      setUploadStatus("Complete!");
    }
  }, [fetcher.data, fetcher.state]);

  // Realistic progress based on file count during processing
  useEffect(() => {
    if (isProcessing && validFilesCount > 0) {
      progressRef.current = 0;
      setProgress(0);

      // Calculate time per file (estimate ~2 seconds per file for dry run, ~4 for upload)
      const timePerFile = settings.dryRun ? 800 : 2000;
      const totalTime = validFilesCount * timePerFile;
      const updateInterval = 100;
      const incrementPerUpdate = (100 / (totalTime / updateInterval)) * 0.9; // Cap at 90%

      let currentFile = 0;
      const interval = setInterval(() => {
        progressRef.current += incrementPerUpdate;
        if (progressRef.current >= 90) {
          progressRef.current = 90;
        }

        // Update file counter for status
        const estimatedFile = Math.min(
          Math.floor((progressRef.current / 90) * validFilesCount) + 1,
          validFilesCount
        );
        if (estimatedFile !== currentFile) {
          currentFile = estimatedFile;
          setUploadStatus(
            settings.dryRun
              ? `Validating file ${currentFile} of ${validFilesCount}...`
              : `Uploading file ${currentFile} of ${validFilesCount}...`
          );
        }

        setProgress(progressRef.current);
      }, updateInterval);

      return () => clearInterval(interval);
    }
  }, [isProcessing, validFilesCount, settings.dryRun]);

  const handleProcess = useCallback(() => {
    if (!canProcess) return;

    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append("settings", JSON.stringify(settings));

    const filesMetadata = files.map((f) => ({
      originalFilename: f.originalFilename,
      sku: f.sku,
      sortOrder: f.sortOrder,
      fileType: f.file.type,
      fileSize: f.file.size,
      isValid: f.isValid,
      error: f.error,
    }));
    formData.append("filesData", JSON.stringify(filesMetadata));

    for (const parsedFile of files) {
      formData.append("files", parsedFile.file);
    }

    fetcher.submit(formData, {
      method: "POST",
      encType: "multipart/form-data",
    });
  }, [canProcess, files, settings, fetcher]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setResults(null);
    setError(null);
    setProgress(0);
    setUploadStatus("");
  }, []);

  return (
    <Page
      title="Bulk Image Uploader"
      subtitle="Upload product images by matching filenames to SKUs"
      primaryAction={{
        content: settings.dryRun ? "Run Dry Test" : "Upload Images",
        onAction: handleProcess,
        disabled: !canProcess,
        loading: isProcessing,
      }}
      secondaryActions={
        results
          ? [
              {
                content: "Start New Upload",
                onAction: handleReset,
              },
            ]
          : undefined
      }
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        )}

        {isProcessing && (
          <Card>
            <BlockStack gap="400">
              <InlineCenter>
                <Spinner size="large" />
              </InlineCenter>
              <Text as="p" variant="headingMd" alignment="center">
                {settings.dryRun ? "Validating files..." : "Uploading images..."}
              </Text>
              <Text as="p" variant="bodyMd" alignment="center" fontWeight="semibold">
                {uploadStatus || `Processing ${validFilesCount} file${validFilesCount !== 1 ? "s" : ""}...`}
              </Text>
              <ProgressBar progress={progress} size="small" tone="primary" />
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                {Math.round(progress)}% complete
              </Text>
            </BlockStack>
          </Card>
        )}

        {!results && !isProcessing ? (
          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                <UploadDropZone
                  files={files}
                  onFilesChange={setFiles}
                  disabled={isProcessing}
                />
                {validFilesCount > 0 && (
                  <Card>
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Ready to {settings.dryRun ? "validate" : "upload"} {validFilesCount} image{validFilesCount !== 1 ? "s" : ""}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {settings.dryRun
                            ? "Dry run mode - no changes will be made"
                            : `Strategy: ${settings.uploadStrategy.charAt(0).toUpperCase() + settings.uploadStrategy.slice(1)}`}
                        </Text>
                      </BlockStack>
                      <Button
                        variant="primary"
                        size="large"
                        onClick={handleProcess}
                        disabled={!canProcess}
                      >
                        {settings.dryRun ? "Run Dry Test" : "Upload Images"}
                      </Button>
                    </InlineStack>
                  </Card>
                )}
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <SettingsCard
                settings={settings}
                onChange={setSettings}
                disabled={isProcessing}
                maxPosition={maxPosition}
              />
            </Layout.Section>
          </Layout>
        ) : results ? (
          <Layout>
            <Layout.Section>
              <ResultsTable results={results.results} summary={results.summary} />
            </Layout.Section>
          </Layout>
        ) : null}

        {!results && !isProcessing && (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                How it works
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                1. Name your image files using the format: <strong>SKU-SortNumber.extension</strong>
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                2. Example: <strong>SUMMER-DRESS-RED-01.jpg</strong> → SKU: SUMMER-DRESS-RED, Sort: 01
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                3. The app uses the LAST hyphen to separate SKU from sort number (SKUs can contain hyphens)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                4. Drop your files, configure settings, and click Upload to process
              </Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

function InlineCenter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
      {children}
    </div>
  );
}

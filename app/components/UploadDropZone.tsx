import { useCallback, useState, useEffect } from "react";
import {
  DropZone,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  Banner,
  Box,
  Spinner,
  ProgressBar,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import JSZip from "jszip";
import type { ParsedFile } from "~/types";
import { parseAndValidateFile } from "~/utils/fileParser";
import { analyzeImagePattern, formatMissingNumbers, type PatternAnalysis } from "~/utils/patternAnalyzer";

interface UploadDropZoneProps {
  files: ParsedFile[];
  onFilesChange: (files: ParsedFile[]) => void;
  disabled?: boolean;
}

const VALID_IMAGE_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp", "image/jpg"];
const VALID_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function UploadDropZone({
  files,
  onFilesChange,
  disabled = false,
}: UploadDropZoneProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const [extractedCount, setExtractedCount] = useState(0);
  const [totalToExtract, setTotalToExtract] = useState(0);
  const [patternAnalysis, setPatternAnalysis] = useState<PatternAnalysis | null>(null);

  // Analyze pattern when files change
  useEffect(() => {
    if (files.length > 0) {
      const analysis = analyzeImagePattern(files);
      setPatternAnalysis(analysis);
    } else {
      setPatternAnalysis(null);
    }
  }, [files]);

  const extractImagesFromZip = async (zipFile: File): Promise<File[]> => {
    const zip = await JSZip.loadAsync(zipFile);
    const imageFiles: File[] = [];
    const entries = Object.entries(zip.files);

    // Count valid image files first
    const validEntries = entries.filter(([path, zipEntry]) => {
      if (zipEntry.dir) return false;
      const fileName = path.split("/").pop() || "";
      if (fileName.startsWith("._") || fileName.startsWith(".")) return false;
      const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
      return VALID_EXTENSIONS.includes(extension);
    });

    setTotalToExtract(validEntries.length);
    setExtractedCount(0);

    let processed = 0;
    for (const [path, zipEntry] of validEntries) {
      const fileName = path.split("/").pop() || "";
      const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

      const blob = await zipEntry.async("blob");
      const mimeType = extension === ".png" ? "image/png"
        : extension === ".gif" ? "image/gif"
        : extension === ".webp" ? "image/webp"
        : "image/jpeg";

      const file = new File([blob], fileName, { type: mimeType });
      imageFiles.push(file);

      processed++;
      setExtractedCount(processed);
      setProcessingProgress((processed / validEntries.length) * 100);
      setProcessingStatus(`Extracting ${processed} of ${validEntries.length} images...`);
    }

    return imageFiles;
  };

  const handleDrop = useCallback(
    async (_droppedFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setIsProcessing(true);
      setProcessingProgress(0);
      setProcessingStatus("Reading files...");

      try {
        const allImageFiles: File[] = [];

        // Process ZIP files and regular images
        for (const file of acceptedFiles) {
          if (file.name.toLowerCase().endsWith(".zip")) {
            setProcessingStatus(`Opening ${file.name}...`);
            setProcessingProgress(0);
            const extractedImages = await extractImagesFromZip(file);
            allImageFiles.push(...extractedImages);
          } else if (VALID_IMAGE_TYPES.includes(file.type)) {
            allImageFiles.push(file);
          }
        }

        // Parse filenames
        if (allImageFiles.length > 0) {
          setProcessingStatus(`Parsing ${allImageFiles.length} filenames...`);
          setProcessingProgress(0);

          const newParsedFiles: ParsedFile[] = [];
          for (let i = 0; i < allImageFiles.length; i++) {
            const parsed = parseAndValidateFile(allImageFiles[i]);
            newParsedFiles.push(parsed);
            setProcessingProgress(((i + 1) / allImageFiles.length) * 100);
            setProcessingStatus(`Parsing filename ${i + 1} of ${allImageFiles.length}...`);
          }

          onFilesChange([...files, ...newParsedFiles]);
        }
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        setIsProcessing(false);
        setProcessingProgress(0);
        setProcessingStatus("");
        setExtractedCount(0);
        setTotalToExtract(0);
      }
    },
    [files, onFilesChange]
  );

  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFiles = [...files];
      newFiles.splice(index, 1);
      onFilesChange(newFiles);
    },
    [files, onFilesChange]
  );

  const handleClearAll = useCallback(() => {
    onFilesChange([]);
  }, [onFilesChange]);

  const validFiles = files.filter((f) => f.isValid);
  const invalidFiles = files.filter((f) => !f.isValid);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            Upload Images
          </Text>
          {files.length > 0 && !isProcessing && (
            <Button onClick={handleClearAll} variant="plain" disabled={disabled}>
              Clear all
            </Button>
          )}
        </InlineStack>

        <DropZone
          onDrop={handleDrop}
          accept="image/*,.zip"
          disabled={disabled || isProcessing}
          allowMultiple
        >
          {isProcessing ? (
            <Box padding="600">
              <BlockStack gap="400">
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Spinner size="large" />
                </div>
                <Text as="p" variant="bodyMd" alignment="center">
                  {processingStatus}
                </Text>
                <ProgressBar progress={processingProgress} size="small" tone="primary" />
              </BlockStack>
            </Box>
          ) : files.length === 0 ? (
            <DropZone.FileUpload
              actionTitle="Add images or ZIP file"
              actionHint="Drag and drop images or a ZIP archive"
            />
          ) : (
            <Box padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                  {validFiles.length > 0 && ` (${validFiles.length} valid)`}
                  {invalidFiles.length > 0 && ` (${invalidFiles.length} with errors)`}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Drop more files or a ZIP to add them
                </Text>
              </BlockStack>
            </Box>
          )}
        </DropZone>

        {invalidFiles.length > 0 && (
          <Banner tone="warning" title={`${invalidFiles.length} file(s) have errors`}>
            <BlockStack gap="100">
              {invalidFiles.slice(0, 5).map((file, index) => (
                <Text as="p" variant="bodySm" key={index}>
                  <strong>{file.originalFilename}</strong>: {file.error}
                </Text>
              ))}
              {invalidFiles.length > 5 && (
                <Text as="p" variant="bodySm">
                  ...and {invalidFiles.length - 5} more
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {patternAnalysis && patternAnalysis.warnings.length > 0 && patternAnalysis.isConsistentPattern && (
          <Banner tone="info" title="Potentially missing images detected">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                Most SKUs have <strong>{patternAnalysis.mostCommonCount} images</strong> ({patternAnalysis.skusWithExpectedCount} of {patternAnalysis.totalSkus} SKUs).
                The following SKUs may be missing images:
              </Text>
              <BlockStack gap="100">
                {patternAnalysis.warnings.slice(0, 10).map((warning, index) => (
                  <Text as="p" variant="bodySm" key={index}>
                    <strong>{warning.sku}</strong>: Has {warning.actualCount} image{warning.actualCount !== 1 ? "s" : ""},
                    {warning.hasGaps ? " missing " : " expected "}
                    {formatMissingNumbers(warning.missingNumbers)}
                  </Text>
                ))}
                {patternAnalysis.warnings.length > 10 && (
                  <Text as="p" variant="bodySm">
                    ...and {patternAnalysis.warnings.length - 10} more SKUs with potential issues
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Banner>
        )}

        {files.length > 0 && !isProcessing && (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Files to upload ({validFiles.length} valid)
            </Text>
            <div
              style={{
                padding: "8px",
                background: "var(--p-color-bg-surface-secondary)",
                borderRadius: "8px",
                maxHeight: "300px",
                overflowY: "auto",
              }}
            >
              <BlockStack gap="200">
                {files.map((file, index) => (
                  <InlineStack
                    key={index}
                    align="space-between"
                    blockAlign="center"
                    gap="300"
                  >
                    <InlineStack gap="300" blockAlign="center">
                      <ImageThumbnail file={file} />
                      <BlockStack gap="050">
                        <Text
                          as="span"
                          variant="bodySm"
                          fontWeight={file.isValid ? "regular" : "regular"}
                          tone={file.isValid ? undefined : "critical"}
                        >
                          {file.originalFilename}
                        </Text>
                        {file.isValid ? (
                          <Text as="span" variant="bodySm" tone="subdued">
                            SKU: {file.sku} | Sort: {file.sortOrder}
                          </Text>
                        ) : (
                          <Text as="span" variant="bodySm" tone="critical">
                            {file.error}
                          </Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                    <Button
                      icon={DeleteIcon}
                      variant="plain"
                      onClick={() => handleRemoveFile(index)}
                      disabled={disabled}
                      accessibilityLabel={`Remove ${file.originalFilename}`}
                    />
                  </InlineStack>
                ))}
              </BlockStack>
            </div>
          </BlockStack>
        )}

        <Box paddingBlockStart="200">
          <Text as="p" variant="bodySm" tone="subdued">
            <strong>Supported:</strong> Images (JPEG, PNG, GIF, WebP) or ZIP archives containing images
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            <strong>Filename format:</strong> SKU-SortNumber.extension (e.g., SUMMER-DRESS-RED-01.jpg)
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Maximum file size: 20MB per image
          </Text>
        </Box>
      </BlockStack>
    </Card>
  );
}

// Simple thumbnail using Polaris icon - avoids blob URL issues
function ImageThumbnail({ file }: { file: ParsedFile }) {
  return (
    <div
      style={{
        width: "40px",
        height: "40px",
        borderRadius: "4px",
        backgroundColor: file.isValid ? "var(--p-color-bg-surface-secondary)" : "var(--p-color-bg-surface-critical)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "10px",
        color: "var(--p-color-text-subdued)",
        fontWeight: 500,
      }}
    >
      {file.file?.type?.includes("png") ? "PNG" :
       file.file?.type?.includes("gif") ? "GIF" :
       file.file?.type?.includes("webp") ? "WEBP" : "JPG"}
    </div>
  );
}

import { useCallback, useMemo } from "react";
import {
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Box,
  useIndexResourceState,
} from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import type { ProcessingResult } from "~/types";
import { generateCSV, generateCSVFilename } from "~/utils/csvExport";

interface ResultsTableProps {
  results: ProcessingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    dryRun?: number;
  };
}

export function ResultsTable({ results, summary }: ResultsTableProps) {
  const resourceName = {
    singular: "result",
    plural: "results",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(results.map((_, i) => String(i)));

  const handleExportCSV = useCallback(() => {
    const csvContent = generateCSV(results);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = generateCSVFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results]);

  const getStatusBadge = (status: ProcessingResult["status"]) => {
    switch (status) {
      case "success":
        return <Badge tone="success">Success</Badge>;
      case "error":
        return <Badge tone="critical">Error</Badge>;
      case "skipped":
        return <Badge tone="warning">Skipped</Badge>;
      case "dry-run":
        return <Badge tone="info">Dry Run</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const rowMarkup = results.map((result, index) => (
    <IndexTable.Row
      id={String(index)}
      key={index}
      position={index}
      selected={selectedResources.includes(String(index))}
    >
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {result.filename}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm">
          {result.detectedSku || "-"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {result.productFound ? (
          <Badge tone="success">Yes</Badge>
        ) : (
          <Badge tone="critical">No</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm">
          {result.productTitle || "-"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{getStatusBadge(result.status)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone={result.errorDetails ? "critical" : "subdued"}>
          {result.errorDetails || "-"}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Processing Results
          </Text>
          <Button icon={ExportIcon} onClick={handleExportCSV}>
            Export CSV
          </Button>
        </InlineStack>

        <InlineStack gap="400" wrap={false}>
          <Box
            padding="300"
            background="bg-surface-secondary"
            borderRadius="200"
            minWidth="100px"
          >
            <BlockStack gap="100">
              <Text as="p" variant="headingLg" alignment="center">
                {summary.total}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Total
              </Text>
            </BlockStack>
          </Box>
          <Box
            padding="300"
            background="bg-fill-success-secondary"
            borderRadius="200"
            minWidth="100px"
          >
            <BlockStack gap="100">
              <Text as="p" variant="headingLg" alignment="center">
                {summary.successful}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Successful
              </Text>
            </BlockStack>
          </Box>
          <Box
            padding="300"
            background="bg-fill-critical-secondary"
            borderRadius="200"
            minWidth="100px"
          >
            <BlockStack gap="100">
              <Text as="p" variant="headingLg" alignment="center">
                {summary.failed}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Failed
              </Text>
            </BlockStack>
          </Box>
          <Box
            padding="300"
            background="bg-fill-warning-secondary"
            borderRadius="200"
            minWidth="100px"
          >
            <BlockStack gap="100">
              <Text as="p" variant="headingLg" alignment="center">
                {summary.skipped}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Skipped
              </Text>
            </BlockStack>
          </Box>
          {summary.dryRun !== undefined && summary.dryRun > 0 && (
            <Box
              padding="300"
              background="bg-fill-info-secondary"
              borderRadius="200"
              minWidth="100px"
            >
              <BlockStack gap="100">
                <Text as="p" variant="headingLg" alignment="center">
                  {summary.dryRun}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Dry Run
                </Text>
              </BlockStack>
            </Box>
          )}
        </InlineStack>

        <IndexTable
          resourceName={resourceName}
          itemCount={results.length}
          selectedItemsCount={
            allResourcesSelected ? "All" : selectedResources.length
          }
          onSelectionChange={handleSelectionChange}
          headings={[
            { title: "Filename" },
            { title: "Detected SKU" },
            { title: "Product Found" },
            { title: "Product Title" },
            { title: "Status" },
            { title: "Error Details" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </BlockStack>
    </Card>
  );
}

import {
  Card,
  FormLayout,
  Checkbox,
  RadioButton,
  BlockStack,
  Text,
  InlineStack,
  Box,
  TextField,
} from "@shopify/polaris";
import type { UploadSettings } from "~/types";

interface SettingsCardProps {
  settings: UploadSettings;
  onChange: (settings: UploadSettings) => void;
  disabled?: boolean;
  maxPosition?: number; // Highest sort position in uploaded files
}

export function SettingsCard({ settings, onChange, disabled = false, maxPosition = 0 }: SettingsCardProps) {
  const handleDryRunChange = (checked: boolean) => {
    onChange({ ...settings, dryRun: checked });
  };

  const handleStrategyChange = (strategy: UploadSettings["uploadStrategy"]) => {
    onChange({ ...settings, uploadStrategy: strategy });
  };

  const handleSeoChange = (checked: boolean) => {
    onChange({ ...settings, seoOptimization: checked });
  };

  const handleAltTextChange = (position: number, value: string) => {
    const newAltTextByPosition = { ...settings.altTextByPosition };
    if (value.trim()) {
      newAltTextByPosition[position] = value.trim();
    } else {
      delete newAltTextByPosition[position];
    }
    onChange({ ...settings, altTextByPosition: newAltTextByPosition });
  };

  // Show positions 1 through max(maxPosition, 6) when SEO is enabled
  const positionsToShow = Math.max(maxPosition, 6);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Upload Settings
        </Text>

        <FormLayout>
          <BlockStack gap="300">
            <Checkbox
              label="Dry Run Mode"
              helpText="Parse files and check SKU matches without uploading or modifying images"
              checked={settings.dryRun}
              onChange={handleDryRunChange}
              disabled={disabled}
            />

            <Box paddingBlockStart="200">
              <BlockStack gap="200">
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  Upload Strategy
                </Text>
                <BlockStack gap="100">
                  <RadioButton
                    label="Replace"
                    helpText="Delete all existing images, then upload new ones"
                    checked={settings.uploadStrategy === "replace"}
                    id="strategy-replace"
                    name="uploadStrategy"
                    onChange={() => handleStrategyChange("replace")}
                    disabled={disabled}
                  />
                  <RadioButton
                    label="Prepend"
                    helpText="Add new images at the start (first image becomes main product image)"
                    checked={settings.uploadStrategy === "prepend"}
                    id="strategy-prepend"
                    name="uploadStrategy"
                    onChange={() => handleStrategyChange("prepend")}
                    disabled={disabled}
                  />
                  <RadioButton
                    label="Append"
                    helpText="Add new images to the end of the gallery"
                    checked={settings.uploadStrategy === "append"}
                    id="strategy-append"
                    name="uploadStrategy"
                    onChange={() => handleStrategyChange("append")}
                    disabled={disabled}
                  />
                </BlockStack>
              </BlockStack>
            </Box>

            <Box paddingBlockStart="200">
              <BlockStack gap="300">
                <Checkbox
                  label="SEO Optimization"
                  helpText="Set alt text as: [Product Title] - [Custom Text or View ##]"
                  checked={settings.seoOptimization}
                  onChange={handleSeoChange}
                  disabled={disabled}
                />
                {settings.seoOptimization && (
                  <Box paddingInlineStart="600">
                    <BlockStack gap="200">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Custom alt text per position (leave empty for "View ##"):
                      </Text>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {Array.from({ length: positionsToShow }, (_, i) => i + 1).map((position) => (
                          <TextField
                            key={position}
                            label={`Position ${String(position).padStart(2, "0")}`}
                            labelHidden
                            placeholder={`${String(position).padStart(2, "0")}: View ${String(position).padStart(2, "0")}`}
                            value={settings.altTextByPosition[position] || ""}
                            onChange={(value) => handleAltTextChange(position, value)}
                            disabled={disabled}
                            size="slim"
                            autoComplete="off"
                          />
                        ))}
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Example: "Front", "Back", "Detail", "Label"
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Box>
          </BlockStack>
        </FormLayout>
      </BlockStack>
    </Card>
  );
}

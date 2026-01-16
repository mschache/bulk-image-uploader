import type { ParsedFileData, ProductData, StagedUploadTarget } from "~/types";

interface AdminContext {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Query products by SKU and return product data
 */
export async function queryProductBySKU(
  admin: AdminContext,
  sku: string
): Promise<ProductData | null> {
  const response = await admin.graphql(
    `#graphql
    query GetProductBySKU($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            media(first: 100) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }`,
    {
      variables: {
        query: `sku:${sku}`,
      },
    }
  );

  const data = await response.json();

  if (data.errors) {
    console.error("GraphQL errors:", data.errors);
    throw new Error(`Failed to query product: ${data.errors[0]?.message}`);
  }

  const products = data.data?.products?.edges;
  if (!products || products.length === 0) {
    return null;
  }

  const product = products[0].node;
  const mediaIds = product.media.edges.map((edge: { node: { id: string } }) => edge.node.id);

  return {
    id: product.id,
    title: product.title,
    mediaIds,
  };
}

/**
 * Query multiple products by their SKUs
 */
export async function queryProductsBySKUs(
  admin: AdminContext,
  skus: string[]
): Promise<Map<string, ProductData>> {
  const productMap = new Map<string, ProductData>();

  // Query products in batches to avoid rate limits
  for (const sku of skus) {
    try {
      const product = await queryProductBySKU(admin, sku);
      if (product) {
        productMap.set(sku, product);
      }
    } catch (error) {
      console.error(`Failed to query product for SKU ${sku}:`, error);
    }
  }

  return productMap;
}

/**
 * Create a staged upload target for a file
 */
export async function createStagedUpload(
  admin: AdminContext,
  file: ParsedFileData
): Promise<StagedUploadTarget> {
  const response = await admin.graphql(
    `#graphql
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename: file.originalFilename,
            mimeType: file.fileType,
            resource: "IMAGE",
            fileSize: String(file.fileSize),
            httpMethod: "POST",
          },
        ],
      },
    }
  );

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Failed to create staged upload: ${data.errors[0]?.message}`);
  }

  const stagedUploads = data.data?.stagedUploadsCreate;
  if (stagedUploads?.userErrors?.length > 0) {
    throw new Error(`Staged upload error: ${stagedUploads.userErrors[0].message}`);
  }

  const target = stagedUploads?.stagedTargets?.[0];
  if (!target) {
    throw new Error("No staged upload target returned");
  }

  return target;
}

/**
 * Upload a file to the staged upload target
 */
export async function uploadToStagedTarget(
  target: StagedUploadTarget,
  file: ParsedFileData
): Promise<void> {
  const formData = new FormData();

  // Add all parameters from the staged target
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }

  // Add the file
  const blob = new Blob([file.fileData], { type: file.fileType });
  formData.append("file", blob, file.originalFilename);

  const response = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
  }
}

/**
 * Create product media from an uploaded file
 */
export async function createProductMedia(
  admin: AdminContext,
  productId: string,
  resourceUrl: string,
  altText?: string
): Promise<string> {
  const response = await admin.graphql(
    `#graphql
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
        }
        mediaUserErrors {
          code
          message
          field
        }
        product {
          id
          title
        }
      }
    }`,
    {
      variables: {
        productId,
        media: [
          {
            originalSource: resourceUrl,
            alt: altText || "",
            mediaContentType: "IMAGE",
          },
        ],
      },
    }
  );

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Failed to create media: ${data.errors[0]?.message}`);
  }

  const result = data.data?.productCreateMedia;
  if (result?.mediaUserErrors?.length > 0) {
    throw new Error(`Media creation error: ${result.mediaUserErrors[0].message}`);
  }

  const mediaId = result?.media?.[0]?.id;
  if (!mediaId) {
    throw new Error("No media ID returned");
  }

  return mediaId;
}

/**
 * Delete product media by IDs
 */
export async function deleteProductMedia(
  admin: AdminContext,
  productId: string,
  mediaIds: string[]
): Promise<void> {
  if (mediaIds.length === 0) return;

  const response = await admin.graphql(
    `#graphql
    mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        mediaUserErrors {
          code
          message
          field
        }
      }
    }`,
    {
      variables: {
        productId,
        mediaIds,
      },
    }
  );

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Failed to delete media: ${data.errors[0]?.message}`);
  }

  const result = data.data?.productDeleteMedia;
  if (result?.mediaUserErrors?.length > 0) {
    throw new Error(`Media deletion error: ${result.mediaUserErrors[0].message}`);
  }
}

/**
 * Reorder product media to move new images to the front (for prepend strategy)
 */
export async function reorderProductMedia(
  admin: AdminContext,
  productId: string,
  newImagesCount: number
): Promise<void> {
  // First, get all current media for the product
  const response = await admin.graphql(
    `#graphql
    query GetProductMedia($id: ID!) {
      product(id: $id) {
        media(first: 100) {
          edges {
            node {
              id
            }
          }
        }
      }
    }`,
    {
      variables: { id: productId },
    }
  );

  const data = await response.json();
  const mediaEdges = data.data?.product?.media?.edges || [];
  const allMediaIds = mediaEdges.map((edge: { node: { id: string } }) => edge.node.id);

  if (allMediaIds.length <= newImagesCount) {
    return; // No reordering needed
  }

  // The new images are at the end, we want them at the beginning
  // Create moves: new images move to positions 0 to (newImagesCount - 1)
  const moves = [];
  for (let i = 0; i < newImagesCount; i++) {
    const mediaId = allMediaIds[allMediaIds.length - newImagesCount + i];
    moves.push({
      id: mediaId,
      newPosition: String(i),
    });
  }

  const reorderResponse = await admin.graphql(
    `#graphql
    mutation ProductReorderMedia($productId: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(productId: $productId, moves: $moves) {
        job {
          id
        }
        mediaUserErrors {
          code
          message
          field
        }
      }
    }`,
    {
      variables: {
        productId,
        moves,
      },
    }
  );

  const reorderData = await reorderResponse.json();

  if (reorderData.errors) {
    throw new Error(`Failed to reorder media: ${reorderData.errors[0]?.message}`);
  }

  const reorderResult = reorderData.data?.productReorderMedia;
  if (reorderResult?.mediaUserErrors?.length > 0) {
    throw new Error(`Media reorder error: ${reorderResult.mediaUserErrors[0].message}`);
  }
}

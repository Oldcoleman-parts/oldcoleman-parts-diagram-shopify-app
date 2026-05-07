import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = ["application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot >= 0 ? name.slice(lastDot + 1).replace(/[^a-zA-Z0-9]/g, "") : "";
  const base = (lastDot >= 0 ? name.slice(0, lastDot) : name).replace(/[^a-zA-Z0-9_-]/g, "_");
  return ext ? `${base}.${ext}` : base;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const type = (formData.get("type") as string) ?? "";
  const fileEntry = formData.get("file");

  if (!fileEntry || !(fileEntry instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const file = fileEntry;
  const mimeType = file.type;
  const fileSize = file.size;
  const filename = sanitizeFilename(file.name || "upload");

  if (!mimeType || !fileSize) {
    return Response.json({ error: "Missing file metadata" }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE) {
    return Response.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const isImage = type === "IMAGE";
  const allowedTypes = isImage ? ALLOWED_IMAGE_TYPES : ALLOWED_FILE_TYPES;
  if (!allowedTypes.includes(mimeType)) {
    return Response.json({ error: `Invalid file type: ${mimeType}` }, { status: 400 });
  }

  // Step 1: Get a staged upload target from Shopify
  const stagedRes = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename,
            mimeType,
            resource: isImage ? "IMAGE" : "FILE",
            fileSize: String(fileSize),
          },
        ],
      },
    },
  );

  const stagedData = await stagedRes.json();
  const userErrors = stagedData.data?.stagedUploadsCreate?.userErrors;
  if (userErrors?.length) {
    return Response.json({ error: userErrors[0].message }, { status: 422 });
  }

  const targets = stagedData.data?.stagedUploadsCreate?.stagedTargets;
  if (!targets?.length) {
    return Response.json({ error: "Failed to create staged upload" }, { status: 500 });
  }

  const { url, resourceUrl, parameters } = targets[0] as {
    url: string;
    resourceUrl: string;
    parameters: { name: string; value: string }[];
  };

  // Step 2: Upload the file from the server to GCS (avoids all client-side signature issues)
  const buffer = await file.arrayBuffer();
  const hasPolicyParam = parameters.some((p) => p.name.toLowerCase() === "policy");

  let uploadRes: Response;
  if (hasPolicyParam) {
    const uploadForm = new FormData();
    for (const { name, value } of parameters) {
      uploadForm.append(name, value);
    }
    // Append the file last — required by GCS policy-based uploads
    uploadForm.append("file", new Blob([buffer], { type: mimeType }), filename);
    uploadRes = await fetch(url, { method: "POST", body: uploadForm });
  } else {
    uploadRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: buffer,
    });
  }

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    return Response.json(
      { error: `CDN upload failed (${uploadRes.status})${detail ? ": " + detail.slice(0, 200) : ""}` },
      { status: 500 },
    );
  }

  // Step 3: Commit the staged file to Shopify Files API to get a permanent CDN URL
  const contentType = isImage ? "IMAGE" : "FILE";
  const createRes = await admin.graphql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on MediaImage { image { url } }
          ... on GenericFile { url }
        }
        userErrors { message }
      }
    }`,
    {
      variables: {
        files: [{ alt: filename, contentType, originalSource: resourceUrl }],
      },
    },
  );

  const createData = await createRes.json();
  const createErrors = createData.data?.fileCreate?.userErrors;
  if (createErrors?.length) {
    return Response.json({ error: createErrors[0].message }, { status: 422 });
  }

  const createdFile = createData.data?.fileCreate?.files?.[0];
  if (!createdFile) {
    return Response.json({ error: "File creation failed" }, { status: 500 });
  }

  // Return immediately if already ready
  const immediateUrl = createdFile.image?.url ?? createdFile.url;
  if (createdFile.fileStatus === "READY" && immediateUrl) {
    return Response.json({ cdnUrl: immediateUrl });
  }

  const fileId = createdFile.id;

  // Poll up to 10 s for Shopify to process the file
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const pollRes = await admin.graphql(
      `#graphql
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage { fileStatus image { url } }
          ... on GenericFile { fileStatus url }
        }
      }`,
      { variables: { id: fileId } },
    );

    const pollData = await pollRes.json();
    const node = pollData.data?.node;

    if (node?.fileStatus === "FAILED") {
      return Response.json({ error: "File processing failed" }, { status: 500 });
    }

    if (node?.fileStatus === "READY") {
      const cdnUrl = node.image?.url ?? node.url;
      if (cdnUrl) return Response.json({ cdnUrl });
    }
  }

  // Timed out — return the staging URL as a last resort (temporary but usable)
  return Response.json({ cdnUrl: resourceUrl });
};

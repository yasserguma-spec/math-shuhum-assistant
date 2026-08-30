import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false,
  },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readMultipartFile(req) {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    throw new Error("يجب إرسال الصورة باستخدام multipart/form-data.");
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("تعذر تحديد بيانات رفع الصورة.");
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);

  const boundaryBuffer = Buffer.from(`--${boundary}`);

  const parts = [];

  let start = 0;

  while (true) {
    const index = buffer.indexOf(boundaryBuffer, start);

    if (index === -1) {
      break;
    }

    parts.push(buffer.slice(start, index));

    start = index + boundaryBuffer.length;
  }

  for (const part of parts) {
    const cleaned = part
      .toString("latin1")
      .replace(/^\r\n/, "")
      .replace(/\r\n$/, "");

    const headerEnd = cleaned.indexOf("\r\n\r\n");

    if (headerEnd === -1) {
      continue;
    }

    const headers = cleaned.slice(0, headerEnd);
    const bodyStart = headerEnd + 4;

    if (
      !/name="file"/i.test(headers) ||
      !/filename=/i.test(headers)
    ) {
      continue;
    }

    const dispositionMatch = headers.match(
      /filename="([^"]*)"/i
    );

    const filename =
      dispositionMatch?.[1] || "image.jpg";

    const contentTypeMatch = headers.match(
      /Content-Type:\s*([^\r\n]+)/i
    );

    const mimeType =
      contentTypeMatch?.[1]?.trim() ||
      "application/octet-stream";

    const rawBody = Buffer.from(
      cleaned.slice(bodyStart),
      "latin1"
    );

    return {
      filename,
      mimeType,
      buffer: rawBody,
    };
  }

  throw new Error("لم يتم العثور على ملف باسم file.");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { filename, mimeType, buffer } =
      await readMultipartFile(req);

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(mimeType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error:
          "نوع الصورة غير مدعوم. استخدم JPG أو JPEG أو PNG أو WEBP.",
      });
    }

    const maxSize = 4 * 1024 * 1024;

    if (buffer.length > maxSize) {
      return res.status(400).json({
        success: false,
        error: "حجم الصورة كبير جدًا. الحد الأقصى 4MB.",
      });
    }

    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
        ? "webp"
        : "jpg";

    const uniqueName =
      `majidat/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

    const blob = await put(
      uniqueName,
      buffer,
      {
        access: "public",
        contentType: mimeType,
      }
    );

    return res.status(200).json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      filename,
    });

  } catch (error) {
    console.error("Blob upload error:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "حدث خطأ أثناء رفع الصورة.",
    });
  }
}

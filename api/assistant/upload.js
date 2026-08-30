import { put } from "@vercel/blob";
import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function setCors(res) {
  const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      reject(
        new Error(
          "يجب إرسال الصورة باستخدام multipart/form-data."
        )
      );
      return;
    }

    let fileBuffer = null;
    let filename = "";
    let mimeType = "";

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: 4 * 1024 * 1024,
      },
    });

    busboy.on("file", (fieldname, file, info) => {
      const {
        filename: incomingFilename,
        mimeType: incomingMimeType,
      } = info;

      if (fieldname !== "file") {
        file.resume();
        return;
      }

      filename = incomingFilename || "image";
      mimeType = (incomingMimeType || "").toLowerCase();

      const chunks = [];

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("limit", () => {
        reject(
          new Error(
            "حجم الصورة كبير جدًا. الحد الأقصى 4MB."
          )
        );
      });

      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", () => {
      if (!fileBuffer || !fileBuffer.length) {
        reject(
          new Error(
            "لم يتم العثور على ملف صورة باسم file."
          )
        );
        return;
      }

      resolve({
        buffer: fileBuffer,
        filename,
        mimeType,
      });
    });

    busboy.on("error", (error) => {
      reject(error);
    });

    req.pipe(busboy);
  });
}

function getExtension(mimeType, filename) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  if (map[mimeType]) {
    return map[mimeType];
  }

  const match = filename.match(/\.([a-zA-Z0-9]+)$/);

  return match ? match[1].toLowerCase() : "jpg";
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error(
        "BLOB_READ_WRITE_TOKEN is missing."
      );

      return sendJson(res, 500, {
        success: false,
        error:
          "خدمة تخزين الصور غير مهيأة على الخادم.",
      });
    }

    const {
      buffer,
      filename,
      mimeType,
    } = await parseMultipart(req);

    const allowedTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedTypes.has(mimeType)) {
      return sendJson(res, 400, {
        success: false,
        error:
          "نوع الصورة غير مدعوم. استخدم JPG أو JPEG أو PNG أو WEBP.",
      });
    }

    if (buffer.length > 4 * 1024 * 1024) {
      return sendJson(res, 400, {
        success: false,
        error: "حجم الصورة يجب ألا يتجاوز 4MB.",
      });
    }

    const extension = getExtension(
      mimeType,
      filename
    );

    const uniqueName =
      `majidat/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}.${extension}`;

    const blob = await put(
      uniqueName,
      buffer,
      {
        access: "public",
        contentType: mimeType,
        addRandomSuffix: false,
      }
    );

    return sendJson(res, 200, {
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      filename,
    });

  } catch (error) {
    console.error(
      "Vercel Blob upload error:",
      error
    );

    return sendJson(res, 500, {
      success: false,
      error:
        error?.message ||
        "حدث خطأ أثناء رفع الصورة.",
    });
  }
}

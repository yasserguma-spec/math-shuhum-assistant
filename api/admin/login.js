import crypto from "crypto";

export const config = {
  api: {
    bodyParser: true,
  },
};

function setCors(res) {
  const origin =
    process.env.FRONTEND_ORIGIN ||
    "https://math-shuhum-assistant-vercel.vercel.app";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

function createSessionToken() {
  const secret = process.env.ADMIN_PASSWORD;

  if (!secret) {
    throw new Error(
      "ADMIN_PASSWORD is not configured"
    );
  }

  const payload = {
    role: "admin",
    exp: Date.now() + 8 * 60 * 60 * 1000,
  };

  const raw = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("base64url");

  return `${raw}.${signature}`;
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

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error(
      "ADMIN_PASSWORD is missing in Vercel Environment Variables"
    );

    return res.status(500).json({
      success: false,
      error:
        "لم يتم إعداد كلمة مرور الإدارة في Vercel.",
    });
  }

  try {
    const body = req.body || {};

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "يرجى إدخال كلمة المرور.",
      });
    }

    const passwordBuffer =
      Buffer.from(password);

    const adminPasswordBuffer =
      Buffer.from(adminPassword);

    let passwordMatches = false;

    if (
      passwordBuffer.length ===
      adminPasswordBuffer.length
    ) {
      passwordMatches =
        crypto.timingSafeEqual(
          passwordBuffer,
          adminPasswordBuffer
        );
    }

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        error: "كلمة المرور غير صحيحة.",
      });
    }

    const token =
      createSessionToken();

    res.setHeader(
      "Set-Cookie",
      `admin_session=${encodeURIComponent(
        token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
    );

    return res.status(200).json({
      success: true,
      authenticated: true,
      message: "تم تسجيل الدخول بنجاح.",
    });

  } catch (error) {
    console.error(
      "Admin login error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "حدث خطأ أثناء تسجيل الدخول.",
    });
  }
}

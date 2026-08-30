import crypto from "crypto";

function setCors(res) {
  const origin =
    process.env.FRONTEND_ORIGIN ||
    "https://math-shuhum-assistant-vercel.vercel.app";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

function parseCookies(cookieHeader = "") {
  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function verifySessionToken(token) {
  if (!token || !process.env.ADMIN_PASSWORD) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [raw, signature] = parts;

  const expected = crypto
    .createHmac(
      "sha256",
      process.env.ADMIN_PASSWORD
    )
    .update(raw)
    .digest("base64url");

  const receivedBuffer = Buffer.from(
    signature
  );

  const expectedBuffer = Buffer.from(
    expected
  );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  if (
    !crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    )
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        raw,
        "base64url"
      ).toString("utf8")
    );

    if (!payload) {
      return false;
    }

    if (
      !Number.isFinite(
        Number(payload.exp)
      )
    ) {
      return false;
    }

    return (
      Number(payload.exp) >
      Date.now()
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      authenticated: false,
    });
  }

  try {
    const cookies = parseCookies(
      req.headers.cookie || ""
    );

    const token =
      cookies.admin_session;

    const authenticated =
      verifySessionToken(token);

    return res.status(200).json({
      authenticated,
    });
  } catch (error) {
    console.error(
      "Admin session error:",
      error
    );

    return res.status(200).json({
      authenticated: false,
    });
  }
}

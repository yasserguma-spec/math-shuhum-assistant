import crypto from "crypto";

function setCors(res) {
  const origin =
    process.env.FRONTEND_ORIGIN ||
    "https://math-shuhum-assistant-vercel.vercel.app";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

function parseCookies(cookieHeader) {
  const cookies = {};

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((part) => {
    const index = part.indexOf("=");

    if (index === -1) {
      return;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function verifySessionToken(token) {
  if (!token) {
    return false;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const raw = parts[0];
    const signature = parts[1];

    const adminPassword =
      process.env.ADMIN_PASSWORD || "";

    if (!adminPassword) {
      return false;
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          adminPassword
        )
        .update(raw)
        .digest("base64url");

    const signatureBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }

    if (
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
      )
    ) {
      return false;
    }

    const payload =
      JSON.parse(
        Buffer.from(raw, "base64url").toString("utf8")
      );

    if (!payload) {
      return false;
    }

    if (payload.role !== "admin") {
      return false;
    }

    if (
      typeof payload.exp !== "number" ||
      Date.now() > payload.exp
    ) {
      return false;
    }

    return true;

  } catch (error) {

    console.error(
      "Session verification error:",
      error
    );

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
      success: false,
      authenticated: false,
      error: "Method not allowed"
    });
  }

  try {

    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );

    const token =
      cookies.admin_session || "";

    const authenticated =
      verifySessionToken(token);

    return res.status(200).json({
      success: true,
      authenticated
    });

  } catch (error) {

    console.error(
      "Admin session error:",
      error
    );

    return res.status(200).json({
      success: true,
      authenticated: false
    });
  }
}

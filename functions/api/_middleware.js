const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/login" || url.pathname === "/api/health") {
    return context.next();
  }

  if (!env.ADMIN_PASSWORD) {
    return Response.json(
      { ok: false, error: "Admin password is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = getCookie(request, "admin_session");
  if (!token) {
    return Response.json(
      { ok: false, error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return Response.json(
      { ok: false, error: "Invalid session" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const expected = await sign(payload, env.ADMIN_PASSWORD);
    if (signature !== expected) {
      return Response.json(
        { ok: false, error: "Invalid session" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (data.exp < Math.floor(Date.now() / 1000) || data.role !== "admin") {
      return Response.json(
        { ok: false, error: "Session expired" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return Response.json(
      { ok: false, error: "Invalid session" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return context.next();
}

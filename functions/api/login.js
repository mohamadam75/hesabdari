const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    return Response.json(
      { ok: false, error: "Admin password is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (typeof body.password !== "string" || body.password.length > 1024) {
    return Response.json(
      { ok: false, error: "Invalid password" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const suppliedHash = await crypto.subtle.digest("SHA-256", encoder.encode(body.password));
  const expectedHash = await crypto.subtle.digest("SHA-256", encoder.encode(env.ADMIN_PASSWORD));
  const a = new Uint8Array(suppliedHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];

  if (difference !== 0) {
    return Response.json(
      { ok: false, error: "Incorrect password" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
    }))
  );
  const signature = await sign(payload, env.ADMIN_PASSWORD);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `admin_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
    }
  });
}

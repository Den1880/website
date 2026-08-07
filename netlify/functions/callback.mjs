// Den 1880 -- GitHub OAuth callback for the content editor at /admin.
// Exchanges the ?code GitHub sends back for an access token, then hands it to
// the CMS tab via postMessage using the handshake Decap CMS / Sveltia CMS expect
// from a custom `github` backend auth_endpoint (this exact postMessage dance is
// the standard pattern used by every self-hosted OAuth provider for these CMSes).
// See auth.mjs for the first leg of the flow.

export default async (req) => {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return htmlResponse(
      renderHandoff("error", { message: "Missing GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET env vars." }),
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (oauthError) {
    return htmlResponse(renderHandoff("error", { message: oauthError }));
  }
  if (!code) {
    return new Response("Missing ?code from GitHub.", { status: 400 });
  }

  let tokenJson;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${url.origin}/callback`,
      }),
    });
    tokenJson = await tokenRes.json();
  } catch (err) {
    return htmlResponse(renderHandoff("error", { message: "Could not reach GitHub to exchange the code." }));
  }

  if (tokenJson.error || !tokenJson.access_token) {
    return htmlResponse(
      renderHandoff("error", { message: tokenJson.error_description || tokenJson.error || "Token exchange failed." }),
    );
  }

  return htmlResponse(renderHandoff("success", { token: tokenJson.access_token, provider: "github" }));
};

function renderHandoff(status, payload) {
  const payloadJson = JSON.stringify(JSON.stringify(payload));
  return [
    "<!DOCTYPE html><html><body>",
    "<script>",
    "(function () {",
    "  function receiveMessage(e) {",
    `    window.opener.postMessage("authorization:github:${status}:" + ${payloadJson}, e.origin);`,
    "    window.removeEventListener('message', receiveMessage, false);",
    "  }",
    "  window.addEventListener('message', receiveMessage, false);",
    "  window.opener.postMessage('authorizing:github', '*');",
    "})();",
    "</script>",
    "</body></html>",
  ].join("\n");
}

function htmlResponse(body) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const config = { path: "/callback" };

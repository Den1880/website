// Den 1880 -- GitHub OAuth entry point for the content editor at /admin.
// Starts the standard GitHub "Authorize this app" redirect; callback.mjs handles
// the return trip and hands a token back to the CMS tab.
//
// One-time setup required (see PILOT_README.md at the repo root):
//   1. A GitHub OAuth App (github.com/settings/developers) with
//      Authorization callback URL = https://den1880.co/callback
//   2. Its Client ID / Client Secret saved in Netlify as env vars:
//        GITHUB_OAUTH_CLIENT_ID
//        GITHUB_OAUTH_CLIENT_SECRET   (used in callback.mjs, not here)
//
// This mirrors the well-known minimal OAuth provider pattern used by Decap CMS /
// Sveltia CMS when self-hosting on your own domain instead of Netlify Identity.

export default async (req) => {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;

  if (!clientId) {
    return new Response(
      "Content editor isn't set up yet: missing GITHUB_OAUTH_CLIENT_ID. See PILOT_README.md.",
      { status: 500 },
    );
  }

  const { origin } = new URL(req.url);
  const state = crypto.randomUUID();

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/callback`);
  authorizeUrl.searchParams.set("scope", "repo,user");
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: { Location: authorizeUrl.toString() },
  });
};

export const config = { path: "/auth" };

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

const AIT_BASE = 'https://apps-in-toss-api.toss.im';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const { authorizationCode, referrer } = await req.json().catch(() => ({}));

  if (!authorizationCode || !referrer) {
    return new Response(JSON.stringify({ error: 'missing params' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // 1. authorizationCode → accessToken
  const tokenRes = await fetch(
    `${AIT_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
    },
  );
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.success?.accessToken) {
    return new Response(JSON.stringify({ error: 'token exchange failed', detail: tokenData }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const accessToken = tokenData.success.accessToken;

  // 2. accessToken → userKey
  const meRes = await fetch(
    `${AIT_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const meData = await meRes.json();

  if (!meRes.ok || !meData.success?.userKey) {
    return new Response(JSON.stringify({ error: 'user info failed', detail: meData }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const userKey: number = meData.success.userKey;

  // 3. users 테이블 upsert
  await supabase
    .from('users')
    .upsert({ user_key: userKey }, { onConflict: 'user_key' });

  return new Response(JSON.stringify({ userKey }), {
    status: 200,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
});

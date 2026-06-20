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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Vary': 'Origin',
  };
}

const AIT_BASE = 'https://apps-in-toss-api.toss.im';

// 앱인토스 서버 간(Server-to-Server) 통신은 mTLS 인증서가 필수예요.
// 콘솔에서 발급한 PEM을 Supabase secret으로 등록해 사용합니다.
//   supabase secrets set TOSS_MTLS_CERT="$(cat savelog_public.crt)"
//   supabase secrets set TOSS_MTLS_KEY="$(cat savelog_private.key)"
const TOSS_MTLS_CERT = Deno.env.get('TOSS_MTLS_CERT');
const TOSS_MTLS_KEY = Deno.env.get('TOSS_MTLS_KEY');

const aitClient =
  TOSS_MTLS_CERT && TOSS_MTLS_KEY
    ? Deno.createHttpClient({ cert: TOSS_MTLS_CERT, key: TOSS_MTLS_KEY })
    : undefined;

// Deno.createHttpClient의 client 옵션은 표준 RequestInit에 없어 캐스팅해서 전달합니다.
function aitFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, client: aitClient } as RequestInit);
}

function jsonRes(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonRes(req, { error: 'method not allowed' }, 405);
  }

  try {
    const { authorizationCode, referrer, oldUserId } = await req.json().catch(() => ({}));
    if (!authorizationCode) return jsonRes(req, { error: 'missing authorizationCode' }, 400);

    // 1. authorizationCode → accessToken
    let tokenRes: Response;
    try {
      tokenRes = await aitFetch(
        `${AIT_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorizationCode, ...(referrer != null ? { referrer } : {}) }),
        },
      );
    } catch (e) {
      return jsonRes(req, { error: 'token fetch error', detail: String(e) }, 502);
    }
    const tokenText = await tokenRes.text();
    let tokenData: any = null;
    try { tokenData = JSON.parse(tokenText); } catch { /* non-json */ }
    if (!tokenRes.ok || !tokenData?.success?.accessToken) {
      return jsonRes(req, {
        error: 'token exchange failed',
        status: tokenRes.status,
        detail: tokenData ?? tokenText.slice(0, 500),
      }, 400);
    }
    const accessToken = tokenData.success.accessToken;

    // 2. accessToken → userKey
    let meRes: Response;
    try {
      meRes = await aitFetch(
        `${AIT_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
        { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (e) {
      return jsonRes(req, { error: 'me fetch error', detail: String(e) }, 502);
    }
    const meText = await meRes.text();
    let meData: any = null;
    try { meData = JSON.parse(meText); } catch { /* non-json */ }
    if (!meRes.ok || !meData?.success?.userKey) {
      return jsonRes(req, {
        error: 'user info failed',
        status: meRes.status,
        detail: meData ?? meText.slice(0, 500),
      }, 400);
    }
    const userKey: number = meData.success.userKey;

    // 3. users 테이블 upsert (실패해도 로그인은 계속)
    try {
      await supabase.from('users').upsert({ user_key: userKey }, { onConflict: 'user_key' });
    } catch (e) {
      console.error('[users upsert] failed', e);
    }

    // 4. 기존 anonymousKey로 저장된 모든 데이터를 새 userKey로 일괄 마이그레이션
    const userKeyStr = String(userKey);
    if (oldUserId && String(oldUserId) !== userKeyStr) {
      const oid = String(oldUserId);
      const safeUpdate = async (table: string, col: string) => {
        try { await supabase.from(table).update({ [col]: userKeyStr }).eq(col, oid); }
        catch (e) { console.error(`[migrate] ${table}.${col} failed`, e); }
      };
      await Promise.all([
        safeUpdate('entries', 'user_id'),
        safeUpdate('reactions', 'user_id'),
        safeUpdate('balance_votes', 'user_id'),
        safeUpdate('follows', 'follower_id'),
        safeUpdate('follows', 'followed_id'),
        safeUpdate('stories', 'user_id'),
        safeUpdate('community_posts', 'user_id'),
        safeUpdate('community_comments', 'user_id'),
        safeUpdate('community_likes', 'user_id'),
        safeUpdate('notifications', 'recipient_id'),
        safeUpdate('notifications', 'sender_id'),
        safeUpdate('chat_messages', 'user_id'),
      ]);
    }

    return jsonRes(req, { userKey });
  } catch (e) {
    console.error('[toss-login] unhandled', e);
    return jsonRes(req, { error: 'internal', detail: String(e) }, 500);
  }
});

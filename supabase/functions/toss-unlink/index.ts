import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let userKey: number | null = null;
  let referrer: string | null = null;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    userKey = Number(url.searchParams.get('userKey'));
    referrer = url.searchParams.get('referrer');
  } else if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    userKey = Number(body.userKey);
    referrer = body.referrer;
  }

  if (!userKey) {
    return new Response(JSON.stringify({ error: 'missing userKey' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  // 연결 끊기 시 해당 유저 데이터 처리
  // referrer: UNLINK | WITHDRAWAL_TERMS | WITHDRAWAL_TOSS
  if (referrer === 'WITHDRAWAL_TOSS') {
    // 토스 탈퇴 시 개인정보 삭제
    await supabase.from('entries').delete().eq('user_key', userKey);
    await supabase.from('users').delete().eq('user_key', userKey);
  } else {
    // 연결 끊기 / 약관 철회 시 user_key 익명 처리 (기록은 보존)
    await supabase.from('users').delete().eq('user_key', userKey);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

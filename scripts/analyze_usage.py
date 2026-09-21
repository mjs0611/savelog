"""Read-only usage audit. Raw rows and identifiers stay in memory; only aggregates leave.

Run: python3 scripts/analyze_usage.py
Uses the same public Supabase configuration as the app. Never prints credentials.
"""
import json
import os
import statistics
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
env = {}
for filename in ('.env', '.env.production', '.env.local', '.env.production.local'):
    path = ROOT / filename
    if path.exists():
        for line in path.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip().strip('\"\'')
env.update({k: v for k, v in os.environ.items() if k.startswith('VITE_SUPABASE_')})
base = env['VITE_SUPABASE_URL'].rstrip('/')
key = env.get('VITE_SUPABASE_PUBLISHABLE_KEY') or env['VITE_SUPABASE_ANON_KEY']
headers = {'apikey': key, 'Prefer': 'count=exact'}
if key.startswith('eyJ'):
    headers['Authorization'] = 'Bearer ' + key

TABLES = {
    'users': 'user_key,created_at',
    'entries': 'id,user_id,date,week_key,items,total_amount,created_at',
    'reactions': 'entry_id,user_id,type,created_at',
    'community_posts': 'id,user_id,created_at',
    'community_comments': 'post_id,user_id,created_at',
    'community_likes': 'user_id,created_at',
    'follows': 'follower_id,followed_id,created_at',
    'notifications': 'recipient_id,sender_id,read,created_at',
    'stories': 'user_id,created_at',
    'duos': 'member_a,member_b,created_at',
    'interactions': 'a_id,b_id,count,created_at',
    'balance_votes': 'user_id,created_at',
    'circle_members': 'user_id,joined_at',
    'battles': 'challenger,opponent',
    'chat_messages': 'user_id,created_at',
}


def fetch_table(pair):
    table, columns = pair
    rows = []
    try:
        for offset in range(0, 100000, 1000):
            query = urllib.parse.urlencode({'select': columns, 'limit': 1000, 'offset': offset})
            request = urllib.request.Request(base + '/rest/v1/' + table + '?' + query, headers=headers)
            with urllib.request.urlopen(request, timeout=25) as response:
                batch = json.load(response)
                content_range = response.headers.get('Content-Range', '')
            rows.extend(batch)
            total = content_range.split('/')[-1]
            if not batch or (total.isdigit() and len(rows) >= int(total)):
                return table, rows, {'rows': len(rows), 'complete': True}
        return table, rows, {'rows': len(rows), 'complete': False, 'error': '100000-row safety limit'}
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        return table, [], {'error': body.get('code', str(error.code)), 'message': body.get('message', '')}


now = datetime.now(ZoneInfo('Asia/Seoul'))
today = now.date()
data, coverage = {}, {}
with ThreadPoolExecutor(max_workers=4) as pool:
    for table, rows, status in pool.map(fetch_table, TABLES.items()):
        data[table], coverage[table] = rows, status
# Some deployed schemas predate timestamp columns. Keep that absence explicit.
for table, columns in {'users': 'user_key', 'interactions': 'me_id', 'battles': 'challenger', 'notifications': 'recipient_id,sender_id,created_at'}.items():
    if 'error' in coverage[table]:
        _, rows, status = fetch_table((table, columns))
        status['fallback_columns'] = columns
        data[table], coverage[table] = rows, status

for required in ['users', 'entries', 'reactions']:
    if not coverage[required].get('complete'):
        raise SystemExit(f'Required table {required} unavailable or incomplete; no report written.')


def human(value):
    value = str(value or '')
    return bool(value) and value != '__fairy__' and not value.startswith(('seed-', 'mock-', 'test-', 'fairy', 'savelog-fairy', 'ai-'))


def date_of(row):
    timestamp = row.get('created_at') or row.get('joined_at')
    if timestamp:
        return datetime.fromisoformat(timestamp.replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Seoul')).date()
    return None


raw = data['entries']
entries = [e for e in raw if human(e['user_id'])]
records = [e for e in entries if not e['week_key'].startswith(('social-', 'milestone-'))]
authors = defaultdict(list)
for e in records:
    authors[str(e['user_id'])].append(e)
users = {str(u['user_key']) for u in data['users']}
linked_authors = users & set(authors)
active = defaultdict(set)
for table in ['entries', 'reactions', 'community_posts', 'community_comments', 'community_likes', 'stories', 'balance_votes', 'chat_messages']:
    for row in data[table]:
        if human(row.get('user_id')) and date_of(row):
            active[date_of(row)].add(str(row['user_id']))
months = sorted({d.strftime('%Y-%m') for d in active} | {date_of(e).strftime('%Y-%m') for e in records})
monthly = []
for month in months:
    selected = [e for e in records if date_of(e).strftime('%Y-%m') == month]
    signup = [u for u in data['users'] if date_of(u) and date_of(u).strftime('%Y-%m') == month]
    monthly.append({'month': month, 'records': len(selected), 'writers': len({e['user_id'] for e in selected}),
                    'write_active_users': len(set().union(*(v for d, v in active.items() if d.strftime('%Y-%m') == month))),
                    'new_linked_users': len(signup) if all(date_of(u) for u in data['users']) else None})
repeat = sum(len(es) >= 2 for es in authors.values())
repeat_days = sum(len({e['date'] for e in es}) >= 2 for es in authors.values())
cohorts = {}
for day in [1, 7, 30]:
    eligible = retained = 0
    for es in authors.values():
        days = {date_of(e) for e in es}
        first = min(days)
        if first + timedelta(days=day) <= today:
            eligible += 1
            retained += first + timedelta(days=day) in days
    cohorts[f'D{day}_exact_record_return'] = {'returned': retained, 'eligible': eligible}
entry_ids = {e['id'] for e in records}
reactions = [r for r in data['reactions'] if r['entry_id'] in entry_ids and human(r['user_id'])]
judgments = [r for r in reactions if r['type'] in ('trust', 'doubt')]
feedback_groups = {'human_reaction_within_24h': {'authors': 0, 'later_record_day': 0},
                   'no_human_reaction_within_24h': {'authors': 0, 'later_record_day': 0}}
for uid, es in authors.items():
    first = min(es, key=lambda e: e['created_at'])
    start = datetime.fromisoformat(first['created_at'].replace('Z', '+00:00'))
    reacted = any(r['entry_id'] == first['id'] and str(r['user_id']) != uid and
                  start <= datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')) <= start + timedelta(hours=24)
                  for r in judgments)
    group = feedback_groups['human_reaction_within_24h' if reacted else 'no_human_reaction_within_24h']
    group['authors'] += 1
    group['later_record_day'] += any(date_of(e) > date_of(first) for e in es)
categories = Counter(it.get('category', '') for e in records for it in e['items'])
text_lengths = [sum(len(it.get('comment') or '') + (len(it.get('category', '')) if it.get('category') not in ['한마디', '식비', '카페', '교통', '쇼핑', '기타', '무지출', '절약 방어'] else 0) for it in e['items']) for e in records]
counts = sorted([len(es) for es in authors.values()], reverse=True)
summary = {
    'as_of_kst': now.isoformat(), 'coverage': coverage,
    'definitions': {'active': 'Observed successful writes only; not visits or DAU. No impression/session data in these tables.',
                    'exclusions': 'user_id __fairy__ and prefixes seed-, mock-, test-, fairy, savelog-fairy, ai-; social-/milestone- entries excluded from record metrics.',
                    'linked_conversion': 'Set intersection of current users.user_key and records.user_id; anonymous/orphan identities reported separately.',
                    'retention': 'Exact calendar day after first recorded write, KST. Not app-open retention.',
                    'causality': 'Behavioral associations, not reasons supplied by users. No causal effect estimate.'},
    'funnel': {'linked_users': len(users), 'linked_users_with_record': len(linked_authors),
               'linked_users_without_record': len(users - linked_authors), 'all_record_authors': len(authors),
               'unmatched_record_authors': len(set(authors) - users), 'repeat_record_authors': repeat, 'repeat_day_authors': repeat_days},
    'records': {'raw': len(raw), 'human': len(entries), 'core': len(records),
                'zero_amount': sum(e['total_amount'] == 0 for e in records),
                'saved_amount_records': sum(any(it.get('saved_amount', 0) > 0 for it in e['items']) for e in records),
                'text_length_median': statistics.median(text_lengths) if text_lengths else None,
                'top_two_author_records': sum(counts[:2]),
                'latest_record_day': str(max((date_of(e) for e in records), default='none'))},
    'monthly': monthly, 'retention': cohorts, 'first_record_feedback': feedback_groups,
    'reactions': {'human': len(reactions), 'types': dict(Counter(r['type'] for r in reactions)),
                  'human_judges': len({r['user_id'] for r in judgments}),
                  'automated_rows': sum(r['user_id'] == '__fairy__' for r in data['reactions'])},
    'recent': {},
}
for window in [7, 30]:
    start = today - timedelta(days=window - 1)
    subset = [e for e in records if start <= date_of(e) <= today]
    summary['recent'][str(window)] = {'from': str(start), 'to': str(today), 'records': len(subset),
                                    'writers': len({e['user_id'] for e in subset}),
                                    'write_active_users': len(set().union(*(v for d, v in active.items() if start <= d <= today)))}
out = ROOT / 'docs/research' / f'usage-{today}.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))

-- 2026-07-24 짠수첩(담기) + reactions 제약 정비
--
-- ⚠️ 발견된 라이브 버그: reactions_type_check가 ('trust','doubt')만 허용해서
--    2026-07-04 이후 거지방 스탬프(type='stamp:*') insert가 전부 무증상 실패(23514).
--    unique(entry_id,user_id)도 한 사람이 같은 글에 리액션+스탬프를 병존시키는 걸 차단(23505).
--    이 SQL이 스탬프를 살리고, '수첩에 담기(type=scrap)' 서버 집계를 연다.
--
-- 앱은 이 SQL 없이도 동작한다: 내 수첩은 localStorage가 원본이고 서버 집계(담김 수)만 0으로 보인다.

alter table reactions drop constraint reactions_type_check;
alter table reactions add constraint reactions_type_check
  check (type in ('trust', 'doubt', 'scrap') or type like 'stamp:%');

alter table reactions drop constraint reactions_entry_id_user_id_key;

-- 종류별 1인 1행 무결성은 부분 유니크 인덱스로 유지
create unique index if not exists reactions_one_plain on reactions (entry_id, user_id) where type in ('trust', 'doubt');
create unique index if not exists reactions_one_stamp on reactions (entry_id, user_id) where type like 'stamp:%';
create unique index if not exists reactions_one_scrap on reactions (entry_id, user_id) where type = 'scrap';

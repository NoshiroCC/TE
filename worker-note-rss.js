// Cloudflare Worker — note の RSS を取得し、タグで振り分けた JSON を返す。
//
// 【なぜ必要か】
// ブラウザから note の RSS を直接読むことは note 側の制限でできない。
// また無料の変換サービス（rss2json）はアイキャッチ画像とタグを捨ててしまうため、
// 画像つき・タグ絞り込みで表示するにはこの中継役が必要。
//
// 【設置手順】
// 1. Cloudflare ダッシュボード → Workers & Pages → Create → Worker
// 2. 適当な名前を付けて Deploy（中身は後で差し替わる）
// 3. 「Edit code」でこのファイルの内容を全部貼り付け → Deploy
// 4. 払い出された URL の末尾に ?url= を付けたものを、各ページの設定 proxyUrl に入れる
//
// 【呼び出し方】
//   ?url=<RSSのURL>                → 全記事
//   ?url=<RSSのURL>&tag=お得な情報   → そのタグが付いた記事だけ
//
// タグは note 記事ページのハッシュタグから読み取る（RSS の <category> があればそれも使う）。
// 無料枠（1日10万リクエスト）で十分に収まります。

const ALLOWED_HOSTS = ['note.com'];
const CACHE_SECONDS = 900;   // 15分キャッシュ
const MAX_LOOKUPS = 14;      // 記事ページを見に行く本数の上限

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const params = new URL(request.url).searchParams;
    const target = params.get('url');
    const wantTag = normalizeTag(params.get('tag') || '');
    if (!target) return json({ error: 'url parameter required' }, 400, cors);

    let feedUrl;
    try { feedUrl = new URL(target); } catch { return json({ error: 'invalid url' }, 400, cors); }
    if (!ALLOWED_HOSTS.some((h) => feedUrl.hostname === h || feedUrl.hostname.endsWith('.' + h))) {
      return json({ error: 'host not allowed' }, 403, cors);
    }

    const res = await fetch(feedUrl.toString(), {
      headers: { 'User-Agent': 'NoshiroCC-Site/1.0' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!res.ok) return json({ error: 'upstream ' + res.status }, 502, cors);

    const items = parseRss(await res.text());

    // 記事ページを1本ずつ見て、アイキャッチ画像とハッシュタグを補う。
    // タグ絞り込みが必要なときは、判定のため画像があるものも見に行く。
    const needs = items.slice(0, MAX_LOOKUPS).filter(
      (it) => it.link && (wantTag || !it.thumbnail)
    );
    await Promise.all(needs.map(async (it) => {
      try {
        const page = await fetch(it.link, {
          headers: { 'User-Agent': 'NoshiroCC-Site/1.0' },
          cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        });
        if (!page.ok) return;
        const html = await page.text();
        if (!it.thumbnail) it.thumbnail = ogImage(html) || '';
        const found = hashtags(html);
        if (found.length) it.tags = dedupe(it.tags.concat(found));
      } catch { /* 取れなくても記事自体は表示する */ }
    }));

    const out = wantTag
      ? items.filter((it) => it.tags.some((t) => normalizeTag(t) === wantTag))
      : items;

    return json({ tag: params.get('tag') || '', items: out }, 200, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

// タグ比較用の正規化。全角空白・空白・大文字小文字・先頭の # の差を吸収する。
function normalizeTag(s) {
  return (s || '')
    .replace(/^[#＃]+/, '')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

function dedupe(list) {
  const seen = new Set(), out = [];
  for (const t of list) {
    const k = normalizeTag(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function parseRss(xml) {
  const out = [];
  for (const b of xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []) {
    const desc = tag(b, 'description') || tag(b, 'content:encoded');
    out.push({
      title: tag(b, 'title'),
      link: tag(b, 'link'),
      pubDate: tag(b, 'pubDate'),
      description: desc,
      tags: categories(b),
      thumbnail:
        attr(b, 'media:thumbnail', 'url') ||
        attr(b, 'media:content', 'url') ||
        attr(b, 'enclosure', 'url') ||
        firstImg(desc) ||
        '',
    });
  }
  return out;
}

function categories(block) {
  const out = [];
  for (const m of block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/g)) {
    const v = decode(m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
    if (v) out.push(v);
  }
  return dedupe(out);
}

// note の記事ページは、ハッシュタグを /hashtag/<タグ名> へのリンクとして持つ。
function hashtags(html) {
  const out = [];
  for (const m of html.matchAll(/\/hashtag\/([^"'?#\s<>\\]+)/g)) {
    let v = m[1];
    try { v = decodeURIComponent(v); } catch { /* そのまま使う */ }
    v = decode(v).trim();
    if (v && v.length < 60) out.push(v);
  }
  return dedupe(out);
}

function ogImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decode(m[1]);
  }
  return '';
}

function firstImg(html) {
  const m = (html || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? decode(m[1]) : '';
}

function tag(src, name) {
  const m = src.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
  if (!m) return '';
  return decode(m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
}

function attr(src, name, key) {
  const m = src.match(new RegExp('<' + name + '\\s[^>]*' + key + '="([^"]*)"'));
  return m ? m[1] : '';
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

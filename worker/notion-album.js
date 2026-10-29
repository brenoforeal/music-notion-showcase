// GET /notion-album?page=<Notion link or ID>  -> one review page, parsed
// GET /notion-albums                         -> list of review pages under Music
// Parsing lives in album-parser.js; this file only talks to Notion.
// The caller sends its own Notion token in the Authorization header, like the
// calculator already does for the proxy; the worker doesn't store it.
import { simplifyBlock, parseAlbumPage, pageIdFrom, parseTitle } from './album-parser.js';

const NOTION_VERSION = '2022-06-28';
// Only these sections are opened; Preview and the like are skipped to save requests.
const SECTIONS = /^(review|final thoughts|bonus tracks)$/i;

class NotionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// GET (or POST with a body). On 429 "slow down", waits as long as Notion asks, up to 3 tries.
async function notionGet(path, auth, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.notion.com/v1/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: auth, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(Number(res.headers.get('Retry-After')) || 1, 5);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new NotionError(res.status, data.message || 'Notion answered ' + res.status);
    return data;
  }
}

// All children of a block, following Notion's pages of 100.
export async function children(id, auth) {
  const out = [];
  let cursor;
  do {
    const data = await notionGet('blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''), auth);
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

const blockText = b => ((b[b.type] || {}).rich_text || []).map(t => t.plain_text).join('').trim();

export async function readAlbumPage(pageId, auth) {
  const page = await notionGet('pages/' + pageId, auth);
  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
  const title = titleProp ? titleProp.title.map(t => t.plain_text).join('') : '';

  const top = await children(pageId, auth);
  for (const b of top) {
    if (b.has_children && SECTIONS.test(blockText(b))) b.children = await children(b.id, auth);
  }

  const icon = page.icon && (page.icon.external || page.icon.file);
  return {
    pageId: page.id,
    url: page.url,
    cover: icon ? icon.url : null,
    lastEdited: page.last_edited_time,
    ...parseAlbumPage(title, top.map(simplifyBlock)),
  };
}

// ── List: every album review page under the Music page ──
// The "Music" page (the one with a site view). Not a secret, just an ID.
const MUSIC_PAGE_ID = '3e0007e8-bb6e-8072-ac46-d364067b8b5e';
// Review pages are titled "Artist - Album"; folders and discography pages are skipped.
const isReviewTitle = t => / - /.test(t) && !/discograph|just the ratings|in depth reviews/i.test(t);

const pageTitle = p => {
  const prop = Object.values(p.properties || {}).find(x => x.type === 'title');
  return prop ? prop.title.map(t => t.plain_text).join('') : '';
};

export async function listAlbumPages(auth) {
  // 1. Every page the integration can see (search returns 100 at a time).
  const pages = new Map();
  let cursor;
  do {
    const data = await notionGet('search', auth, {
      filter: { property: 'object', value: 'page' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const p of data.results) {
      if (!p.archived && !p.in_trash) pages.set(p.id, { id: p.id, title: pageTitle(p), url: p.url, parent: p.parent, lastEdited: p.last_edited_time });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  // 2. A page inside a toggle has a block as parent; walk up to the page holding it.
  const blockPage = new Map();
  async function pageOfBlock(id) {
    if (!blockPage.has(id)) {
      blockPage.set(id, (async () => {
        const p = (await notionGet('blocks/' + id, auth)).parent || {};
        if (p.type === 'page_id') return p.page_id;
        return p.type === 'block_id' ? pageOfBlock(p.block_id) : null;
      })());
    }
    return blockPage.get(id);
  }
  async function parentPage(p) {
    if (p.parent.type === 'page_id') return p.parent.page_id;
    if (p.parent.type === 'block_id') return pageOfBlock(p.parent.block_id);
    return null;
  }

  // 3. Keep pages whose parent chain reaches Music; remember the folder path.
  async function pathToMusic(p) {
    const path = [];
    for (let cur = p, depth = 0; cur && depth < 12; depth++) {
      const pid = await parentPage(cur);
      if (pid === MUSIC_PAGE_ID) return path.reverse();
      cur = pages.get(pid);
      if (cur) path.push(cur.title);
    }
    return null;
  }

  const out = [];
  for (const p of pages.values()) {
    if (!isReviewTitle(p.title)) continue;
    const path = await pathToMusic(p);
    if (path) out.push({ pageId: p.id, title: p.title, name: parseTitle(p.title).name, url: p.url, path, lastEdited: p.lastEdited });
  }
  return out.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')) || a.name.localeCompare(b.name));
}

export async function handleNotionAlbum(request, env, url, corsHeaders) {
  if (!['/notion-album', '/notion-albums'].includes(url.pathname) || request.method !== 'GET') return null;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  const auth = request.headers.get('Authorization');
  if (!auth) return json({ error: 'Send your Notion token in the Authorization header.' }, 401);

  if (url.pathname === '/notion-albums') {
    try {
      return json({ pages: await listAlbumPages(auth) });
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500);
    }
  }

  const pageId = pageIdFrom(url.searchParams.get('page'));
  if (!pageId) return json({ error: 'That doesn\'t look like a Notion page link.' }, 400);

  try {
    return json(await readAlbumPage(pageId, auth));
  } catch (e) {
    // Notion's own message already explains 404s (page not shared with the integration).
    return json({ error: e.message || String(e) }, e.status || 500);
  }
}

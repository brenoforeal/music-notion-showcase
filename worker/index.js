// Main worker (deployed as "notion-proxy"). This file is only the router:
// each handler checks whether a request is its own and returns a Response,
// or null so the next handler can try.
import { handleAuth } from './auth.js';
import { handleRanking } from './ranking.js';
import { handleLyrics, refreshLyric } from './lyrics.js';
import { handleSong, refreshSong } from './song.js';
import { handleNotionProxy } from './notion-proxy.js';
import { handleNotionAlbum } from './notion-album.js';
import { handleCoverOptions } from './cover-options.js';

// Order matters: the first handler that returns a Response wins.
const HANDLERS = [handleAuth, handleRanking, handleLyrics, handleSong, handleNotionAlbum, handleCoverOptions];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Notion-Version, X-Target-URL',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    for (const handle of HANDLERS) {
      const res = await handle(request, env, url, corsHeaders);
      if (res) return res;
    }

    // Anything else is forwarded to the Notion API (used by the calculator).
    return handleNotionProxy(request, env, url, corsHeaders);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try { await refreshLyric(env); } catch (e) {}
      try { await refreshSong(env); } catch (e) { console.error('Song of the Day refresh failed:', e); }
    })());
  },
};

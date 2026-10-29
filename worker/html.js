// Small helpers shared by the HTML pages.

export function escHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function fmtDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  return m + '/' + d + '/' + y;
}

export function simplePage(pageTitle, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1115">
<title>${escHtml(pageTitle)}</title>
<style>
  :root{--bg:#0f1115;--card:#171a21;--line:#2a2f3a;--txt:#e8ecf3;--muted:#8b95a7;--accent:#6ea8fe}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg)}
  body{background:var(--bg);color:var(--txt);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:10px 6px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .head{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin-bottom:8px}
  .title{font-size:16px;font-weight:700;line-height:1.3}
  .artist{font-size:12px;color:var(--muted);margin-top:2px}
  .player{margin-top:12px;border-radius:8px;overflow:hidden;border:1px solid var(--line);background:#000;width:300px;height:150px}
  .player iframe{width:100%;height:100%;border:0;display:block}
  .actions{margin-top:10px}
  .yt-link{display:inline-block;font-size:12px;color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:7px;padding:6px 10px}
  .yt-link:hover{border-color:var(--accent)}
  .history{display:grid;gap:4px}
  .entry{font-size:13px;padding:6px 0;border-bottom:1px solid #20242e}
  .entry:last-child{border-bottom:none}
  .entry .date{color:var(--muted);font-size:11px}
  .empty{color:var(--muted);text-align:center;padding:20px;background:var(--card);border:1px solid var(--line);border-radius:10px}
</style>
</head>
<body>
${inner}
</body>
</html>`;
}

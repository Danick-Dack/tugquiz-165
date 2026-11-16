// WebSocket с автоматическим переподключением и сверкой часов с сервером.
export function connect({ onMessage, onOpen, onStatus = () => {} }) {
  let ws;
  let closed = false;
  let retry = 0;
  let offset = 0;
  const conn = {
    send: (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); },
    close: () => { closed = true; ws?.close(); },
    now: () => Date.now() + offset,
  };
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; onStatus(true); onOpen(conn); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.now) offset = m.now - Date.now();
      onMessage(m);
    };
    ws.onclose = () => {
      if (closed) return;
      onStatus(false);
      setTimeout(open, Math.min(5000, 400 * 2 ** retry++));
    };
  };
  open();
  return conn;
}

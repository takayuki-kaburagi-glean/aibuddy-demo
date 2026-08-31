import crypto from 'node:crypto';

// A2A JSON-RPC client. message/send, message/stream, tasks/get, tasks/cancel.
// A2A messages use text parts only (per spec, attachments are ignored).

function rpcId() {
  return 'rpc-' + crypto.randomUUID();
}

/** Build a user message with only a text part */
export function buildTextMessage(text) {
  return {
    role: 'user',
    parts: [{ kind: 'text', text: String(text) }],
    messageId: crypto.randomUUID(),
  };
}

function authHeaders(token) {
  if (!token) return {};
  return { Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}` };
}

/** Single JSON-RPC call (for message/send, tasks/get, tasks/cancel) */
export async function jsonRpc(endpoint, method, params, { token } = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId(), method, params }),
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Authorization error (token may be expired or permissions insufficient)');
    err.status = res.status;
    err.code = 'AUTH';
    throw err;
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error(`JSON-RPC did not return JSON (status ${res.status})`);
    err.status = res.status;
    throw err;
  }
  if (json.error) {
    const err = new Error(json.error.message || 'JSON-RPC error');
    err.rpcError = json.error;
    throw err;
  }
  return json.result;
}

export const messageSend = (endpoint, text, opts) =>
  jsonRpc(endpoint, 'message/send', { message: buildTextMessage(text) }, opts);

export const tasksGet = (endpoint, taskId, opts) =>
  jsonRpc(endpoint, 'tasks/get', { id: taskId }, opts);

export const tasksCancel = (endpoint, taskId, opts) =>
  jsonRpc(endpoint, 'tasks/cancel', { id: taskId }, opts);

/**
 * Call message/stream and pass SSE events to the callback one at a time.
 * @param {function} onEvent (parsedData) => void  the JSON.parse'd data portion
 * @returns {Promise<void>} resolves when the stream ends
 */
export async function messageStream(endpoint, text, { token, onEvent, signal } = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId(),
      method: 'message/stream',
      params: { message: buildTextMessage(text) },
    }),
    signal,
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Authorization error (token may be expired or permissions insufficient)');
    err.status = res.status;
    err.code = 'AUTH';
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`message/stream failed (status ${res.status}) ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  // If the server returns plain JSON instead of SSE, notify once as a single result
  if (!ct.includes('text/event-stream')) {
    const json = await res.json().catch(() => null);
    if (json?.result) onEvent?.(json.result);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // Normalize newlines to LF (sse-starlette etc. use CRLF/\r\n\r\n)
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    // In SSE, event boundaries are blank lines (\n\n)
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = [];
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) continue;
      const dataStr = dataLines.join('\n');
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        // If wrapped in JSON-RPC ({result: ...}), extract the contents
        onEvent?.(parsed.result !== undefined ? parsed.result : parsed);
      } catch {
        // Pass unparseable data through raw
        onEvent?.({ raw: dataStr });
      }
    }
  }
}

/**
 * Helper that extracts "text deltas" and the "final answer" from A2A stream events.
 * Handles various shapes such as status-update / artifact-update / message / task.
 */
export function extractText(evt) {
  const texts = [];
  const collectParts = (parts) => {
    if (!Array.isArray(parts)) return;
    for (const p of parts) {
      if (p && (p.kind === 'text' || p.type === 'text') && typeof p.text === 'string') {
        texts.push(p.text);
      }
    }
  };

  // status-update: { status: { message: { parts } } }
  if (evt?.status?.message?.parts) collectParts(evt.status.message.parts);
  // artifact-update: { artifact: { parts } }
  if (evt?.artifact?.parts) collectParts(evt.artifact.parts);
  // message result: { parts }
  if (evt?.parts) collectParts(evt.parts);
  // task result: { artifacts: [{ parts }], status: {...} }
  if (Array.isArray(evt?.artifacts)) {
    for (const a of evt.artifacts) collectParts(a.parts);
  }

  return texts.join('');
}

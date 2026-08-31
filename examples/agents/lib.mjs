// Minimal zero-dependency A2A server. Implements Agent Card + message/send + message/stream(SSE)
// + tasks/get. Register the localhost URL in the Registry to run Test query.
import http from 'node:http';
import crypto from 'node:crypto';

/**
 * @param {object} cfg
 *  port, name, description, organization, orgUrl, version, skills[],
 *  respond(query, skills) => string   function that returns the response text
 */
export function createA2AAgent(cfg) {
  const endpoint = `http://localhost:${cfg.port}/a2a`;
  const card = {
    protocolVersion: '0.2.5',
    name: cfg.name,
    description: cfg.description,
    version: cfg.version || '1.0.0',
    provider: { organization: cfg.organization, url: cfg.orgUrl || 'https://example.com' },
    url: endpoint,
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    // No authentication (can be registered with auth=none, so Test query works immediately)
    skills: cfg.skills,
  };

  const tasks = new Map(); // taskId -> { state, text }

  function sendChunk(res, taskId, chunk) {
    const t = tasks.get(taskId);
    t.text += chunk;
    const ev = {
      jsonrpc: '2.0',
      result: {
        kind: 'status-update',
        id: taskId,
        status: { state: 'working', message: { parts: [{ kind: 'text', text: chunk }] } },
      },
    };
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  function endStream(res, taskId) {
    tasks.get(taskId).state = 'completed';
    const done = {
      jsonrpc: '2.0',
      result: { kind: 'status-update', id: taskId, status: { state: 'completed' } },
    };
    res.write(`data: ${JSON.stringify(done)}\n\n`);
    res.end();
  }

  // Pseudo-stream a fixed string word by word
  function streamText(res, text) {
    startSSE(res);
    const taskId = newTask();
    const words = text.match(/\S+\s*/g) || [text];
    let i = 0;
    const iv = setInterval(() => {
      if (i < words.length) sendChunk(res, taskId, words[i++]);
      else {
        clearInterval(iv);
        endStream(res, taskId);
      }
    }, 60);
  }

  // Stream a real LLM via an async generator
  async function streamGenerator(res, gen) {
    startSSE(res);
    const taskId = newTask();
    try {
      for await (const chunk of gen) {
        if (chunk) sendChunk(res, taskId, chunk);
      }
    } catch (e) {
      sendChunk(res, taskId, `\n[Error] ${e.message}`);
    } finally {
      endStream(res, taskId);
    }
  }

  function startSSE(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  }
  function newTask() {
    const taskId = 'task-' + crypto.randomUUID();
    tasks.set(taskId, { state: 'working', text: '' });
    return taskId;
  }

  const server = http.createServer((req, res) => {
    // CORS not required (goes through the backend proxy) but allow it just in case
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(card));
    }

    if (req.method === 'POST' && req.url === '/a2a') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let rpc;
        try {
          rpc = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400);
          return res.end('bad json');
        }
        const query =
          rpc.params?.message?.parts?.map((p) => p.text).filter(Boolean).join(' ') || '';

        if (rpc.method === 'agent/getCard') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: card }));
        }
        if (rpc.method === 'message/stream') {
          // If cfg.stream(query) exists, stream a real LLM via an async generator.
          // Otherwise, pseudo-stream the fixed string from cfg.respond(query).
          if (cfg.stream) return streamGenerator(res, cfg.stream(query, cfg.skills));
          return streamText(res, cfg.respond(query, cfg.skills));
        }
        if (rpc.method === 'message/send') {
          const finish = async () => {
            let text = '';
            if (cfg.stream) {
              for await (const c of cfg.stream(query, cfg.skills)) text += c || '';
            } else {
              text = cfg.respond(query, cfg.skills);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: rpc.id,
                result: { kind: 'message', parts: [{ kind: 'text', text }] },
              })
            );
          };
          finish().catch((e) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: e.message } }));
          });
          return;
        }
        if (rpc.method === 'tasks/get') {
          const t = tasks.get(rpc.params?.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result: t
                ? { id: rpc.params.id, status: { state: t.state }, artifacts: [{ parts: [{ kind: 'text', text: t.text }] }] }
                : null,
            })
          );
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'method not found' } }));
      });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  return { server, card, endpoint };
}

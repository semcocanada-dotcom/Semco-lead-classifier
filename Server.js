const https = require('https');
const http = require('http');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MANUS_WEBHOOK = 'https://manuswebhook-vssdftpv.manus.space';
const PORT = process.env.PORT || 3000;

function postJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    };
    const req = (u.protocol === 'https:' ? https : http).request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function classifyLead(lead) {
  const res = await postJson('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: `You are a lead classifier for Semco Canada microcement. Return ONLY valid JSON.

Name: ${lead.name}
Email: ${lead.email}
City: ${lead.city}
Message: ${lead.message}
How can we help: ${lead.how_can_we_help_you || ''}

Return: {"lead_category":"homeowner_hiring|architect|commercial_installer|unclassified","intent":"buy|technical|info|install_network","province_guess":"2-letter province","route_to":"DIST-001 if ON+buy else SEMCO_DIRECT","confidence":"high|medium|low","summary":"one sentence"}` }]
  }, {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01'
  });
  if (res.status !== 200) throw new Error(`Claude error ${res.status}`);
  const text = res.body.content[0].text.trim();
  try { return JSON.parse(text); }
  catch { return JSON.parse(text.match(/\{[\s\S]*\}/)[0]); }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Semco Lead Classifier' }));
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
      try {
        const lead = JSON.parse(body);
        console.log(`Lead: ${lead.name} ${lead.email} ${lead.city}`);
        const classification = await classifyLead(lead);
        const leadId = `SEMCO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        await postJson(MANUS_WEBHOOK, {
          lead_id: leadId,
          name: lead.name,
          email: lead.email,
          city: lead.city,
          message: lead.message,
          how_can_we_help: lead.how_can_we_help_you || '',
          classification,
          submitted_at: new Date().toISOString(),
          source: 'semco_contact_form'
        });
        console.log(`Done: ${leadId} → ${classification.route_to}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`Semco classifier on port ${PORT}`));

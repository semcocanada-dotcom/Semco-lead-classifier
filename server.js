const http = require("http");

const PORT = process.env.PORT || 10000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MANUS_WEBHOOK_URL = process.env.MANUS_WEBHOOK_URL;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "semco-lead-classifier" }));
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }

  let body = "";
  req.on("data", chunk => body += chunk);

  req.on("end", async () => {
    try {
      const lead = JSON.parse(body || "{}");

      const prompt = `
You are a lead classifier for Semco Canada microcement.

Return ONLY valid JSON. No markdown. No prose.

Lead:
${JSON.stringify(lead, null, 2)}

Classify:
- property owner = homeowner_hiring
- architect/designer/builder = architect
- contractor/installer = commercial_installer
- unclear = unclassified

Intent:
- buy = wants to purchase or find supplier
- technical = questions about application/substrate/system
- info = general curiosity
- install_network = wants to become installer/dealer

Return this exact JSON shape:
{
  "lead_category": "",
  "intent": "",
  "confidence": "",
  "summary": "",
  "questions_asked": "",
  "route_to": "SEMCO_DIRECT"
}
`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          temperature: 0,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const claudeData = await claudeRes.json();

      if (!claudeRes.ok) {
        throw new Error(JSON.stringify(claudeData));
      }

      const classificationText = claudeData?.content?.[0]?.text || "{}";
      let classification;

      try {
        classification = JSON.parse(classificationText);
      } catch {
        classification = { raw: classificationText };
      }

      const output = {
        ...lead,
        classification,
        received_at: new Date().toISOString(),
        source: "semco_contact_form"
      };

      if (MANUS_WEBHOOK_URL) {
        await fetch(MANUS_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(output)
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(output));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

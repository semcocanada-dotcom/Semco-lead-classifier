const http = require("http");

const PORT = process.env.PORT || 10000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MANUS_WEBHOOK_URL = "https://manuswebhook-vssdftpv.manus.space";
const MAKE_EMAIL_WEBHOOK = "https://hook.us2.make.com/ixsvekr2ehtpaibmrwrlou9lcsu1epc6";

const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
    try {
      const lead = JSON.parse(body);
      console.log("Lead received:", lead.name, lead.email);
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages: [{
            role: "user",
            content: `Classify this Semco Canada lead. Return JSON only, no prose.\nName: ${lead.name}\nEmail: ${lead.email}\nCity: ${lead.city}\nMessage: ${lead.message}\nHow can we help: ${lead.how_can_we_help_you || ""}\n\nReturn: {"lead_category":"homeowner_hiring|architect|commercial_installer|unclassified","intent":"buy|technical|info|install_network","province_guess":"2-letter province","route_to":"DIST-001 if ON+buy else SEMCO_DIRECT","confidence":"high|medium|low","summary":"one sentence"}`
          }]
        })
      });
      const claudeData = await claudeRes.json();
      const classification = JSON.parse(claudeData.content[0].text);
      console.log("Classified:", classification.route_to);
      const payload = { name: lead.name, email: lead.email, city: lead.city, message: lead.message, how_can_we_help: lead.how_can_we_help_you || "", classification, submitted_at: new Date().toISOString(), source: "semco_contact_form" };
      await fetch(MANUS_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      console.log("Manus notified");
      await fetch(MAKE_EMAIL_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      console.log("Emails triggered");
    } catch (e) {
      console.error("Error:", e.message);
    }
  });
});

server.listen(PORT, () => console.log("Semco classifier listening on port", PORT));

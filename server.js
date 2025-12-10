import express from "express";
import bodyParser from "body-parser";
import { createServer } from "http";
import WebSocket from "ws";

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "wss://api.deepseek.ai/stream"; // replace with your real endpoint

if (!DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY is missing!");
  process.exit(1);
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio incoming call webhook
app.post("/twiml", (req, res) => {
  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Hello! Nadia AI speaking. Connecting you now...</Say>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
    </Response>
  `;
  res.type("text/xml").send(twiml);
});

// HTTP + WebSocket server
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", (twilioWs) => {
  console.log("📡 Twilio Media Stream connected");

  // Open DeepSeek WebSocket
  const deepSeekWs = new WebSocket(`${DEEPSEEK_URL}?api_key=${DEEPSEEK_API_KEY}`);

  deepSeekWs.on("open", () => {
    console.log("✅ Connected to DeepSeek, ready to forward audio");
  });

  deepSeekWs.on("message", (msg) => {
    // Here you could process DeepSeek responses and optionally send back to Twilio
    console.log("DeepSeek message:", msg.toString());
  });

  deepSeekWs.on("close", () => console.log("DeepSeek connection closed"));
  deepSeekWs.on("error", (err) => console.error("DeepSeek error:", err));

  twilioWs.on("message", (msg) => {
    // Forward audio chunks to DeepSeek
    if (deepSeekWs.readyState === WebSocket.OPEN) {
      deepSeekWs.send(msg);
    }
  });

  twilioWs.on("close", () => {
    console.log("Call ended");
    if (deepSeekWs.readyState === WebSocket.OPEN) deepSeekWs.close();
  });

  twilioWs.on("error", (err) => console.error("Twilio WS error:", err));
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

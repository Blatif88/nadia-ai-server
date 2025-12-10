// server.js
import express from "express";
import { WebSocketServer } from "ws";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // for DeepSeek API requests
import { createServer } from "http";

// Config
const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY; // put your DeepSeek key in Render env variables

if (!DEEPSEEK_API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY environment variable!");
  process.exit(1);
}

// Create Express App
const app = express();
app.use(bodyParser.json());

// HTTP server for WebSocket upgrade
const server = createServer(app);

// TwiML endpoint for Twilio Calls
app.post("/twiml", (req, res) => {
  const twiml = `
    <Response>
      <Say>Hello! Nadia AI speaking. Connecting you now...</Say>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
    </Response>
  `;
  res.type("text/xml").send(twiml);
});

// WebSocket server for Twilio Media Stream
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("📡 Twilio Media Stream connected");

  ws.on("message", async (message) => {
    const msg = JSON.parse(message.toString());

    // Only handle real-time speech payloads
    if (msg.event === "media") {
      const audioBase64 = msg.media.payload;

      // Call DeepSeek API to process & respond
      try {
        const response = await fetch("https://api.deepseek.ai/v1/speech-to-speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input_audio: audioBase64,
            voice: "Nadia", // choose your DeepSeek voice
            output_format: "wav"
          }),
        });

        const data = await response.json();

        if (data.audio_base64) {
          // Send back DeepSeek audio to Twilio
          ws.send(JSON.stringify({
            event: "media",
            media: {
              payload: data.audio_base64
            }
          }));
        }
      } catch (err) {
        console.error("DeepSeek API error:", err);
      }
    }

    // Handle call end
    if (msg.event === "stop") {
      console.log("Call ended");
      ws.close();
    }
  });

  ws.on("close", () => {
    console.log("📴 Twilio Media Stream disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

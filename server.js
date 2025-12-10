// server.js
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";

const { json, urlencoded } = bodyParser;

const app = express();
app.use(urlencoded({ extended: false }));
app.use(json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// -------------------- TwiML (HARD CODED WSS URL) --------------------
app.post("/twiml", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://nadia-server.onrender.com/media" />
      </Start>
    </Response>
  `;
  res.type("text/xml").send(twiml);
});

// -------------------- START SERVER BEFORE WS --------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// -------------------- WEBSOCKET SERVER --------------------
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("🎧 Twilio connected to /media");

  sendDeepSeekAudio(ws, "Hello, Nadia AI speaking. I am listening.");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "media") {
        const audio = Buffer.from(data.media.payload, "base64");
        const aiAudio = await getDeepSeekAudio(audio);

        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: aiAudio.toString("base64") },
          })
        );
      }

      if (data.event === "stop") {
        console.log("📴 Twilio ended stream");
        ws.close();
      }
    } catch (err) {
      console.error("WS handler error:", err);
    }
  });
});

// -------------------- DEEPSEEK AUDIO FUNCTIONS --------------------
async function getDeepSeekAudio(inputAudio) {
  try {
    const response = await fetch("https://api.deepseek.ai/v1/voice/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      body: inputAudio,
    });

    if (!response.ok) {
      console.error("DeepSeek error:", await response.text());
      return Buffer.alloc(320); // short silence
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("DeepSeek request failed:", err);
    return Buffer.alloc(320);
  }
}

async function sendDeepSeekAudio(ws, text) {
  try {
    const response = await fetch("https://api.deepseek.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voice: "Nadia" }),
    });

    if (!response.ok) return;

    const audioBuf = Buffer.from(await response.arrayBuffer());

    ws.send(
      JSON.stringify({
        event: "media",
        media: { payload: audioBuf.toString("base64") },
      })
    );
  } catch (err) {
    console.error("DeepSeek TTS error:", err);
  }
}

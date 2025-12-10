// server.js - Twilio + DeepSeek working version

import http from "http";
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// -------------------- TWIML ENDPOINT --------------------
app.post("/twiml", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://nadia-server.onrender.com/media" />
      </Start>
    </Response>
  `);
});

// -------------------- HEALTH CHECK --------------------
app.get("/", (req, res) => res.send("OK"));

// -------------------- CREATE RAW HTTP SERVER (REQUIRED BY TWILIO) --------------------
const server = http.createServer(app);

// -------------------- CREATE WEBSOCKET SERVER --------------------
const wss = new WebSocketServer({
  noServer: true,        // <-- IMPORTANT FIX
  path: "/media"
});

// Handle upgrade manually (REQUIRED FOR TWILIO)
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// -------------------- WS CONNECTION --------------------
wss.on("connection", (ws) => {
  console.log("🔌 Twilio WebSocket connected!");

  sendDeepSeekTTS(ws, "Hello, Nadia AI speaking. I'm listening.");

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.event === "media") {
        const inputAudio = Buffer.from(data.media.payload, "base64");
        const aiAudio = await getDeepSeekAudio(inputAudio);

        ws.send(JSON.stringify({
          event: "media",
          media: { payload: aiAudio.toString("base64") }
        }));
      }

      if (data.event === "stop") {
        console.log("🔚 Twilio ended stream");
        ws.close();
      }

    } catch (e) {
      console.error("WS message error:", e);
    }
  });
});

// -------------------- DEEPSEEK AUDIO --------------------
async function getDeepSeekAudio(input) {
  try {
    const resp = await fetch("https://api.deepseek.ai/v1/voice/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      body: input,
    });

    if (!resp.ok) {
      console.error(await resp.text());
      return Buffer.alloc(320);
    }

    return Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    console.error("DeepSeek error:", err);
    return Buffer.alloc(320);
  }
}

async function sendDeepSeekTTS(ws, text) {
  try {
    const resp = await fetch("https://api.deepseek.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voice: "Nadia" }),
    });

    if (!resp.ok) return;

    const audio = Buffer.from(await resp.arrayBuffer());

    ws.send(JSON.stringify({
      event: "media",
      media: { payload: audio.toString("base64") }
    }));
  } catch (err) {
    console.error("TTS error:", err);
  }
}

// -------------------- START SERVER --------------------
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

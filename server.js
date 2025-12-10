// server.js
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import fetch from "node-fetch"; // for DeepSeek API
import fs from "fs";

const { json, urlencoded } = bodyParser;

const app = express();
app.use(urlencoded({ extended: false }));
app.use(json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// -------------------- TwiML Endpoint --------------------
app.post("/twiml", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml);
});

// -------------------- WebSocket for Media Stream --------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("🎧 Twilio Media Stream connected");

  // Send initial greeting
  sendDeepSeekAudio(ws, "Hello, Nadia AI speaking. Connecting you now.");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "media") {
        const audioChunk = Buffer.from(data.media.payload, "base64");

        // Send to DeepSeek
        const aiAudio = await getDeepSeekResponse(audioChunk);

        ws.send(JSON.stringify({
          event: "media",
          media: {
            payload: aiAudio.toString("base64")
          }
        }));
      }

      if (data.event === "stop") {
        console.log("📴 Call ended by Twilio");
        ws.close();
      }

    } catch (err) {
      console.error("Error handling Twilio media:", err);
    }
  });
});

// -------------------- DeepSeek Functions --------------------
async function getDeepSeekResponse(inputAudioBuffer) {
  // Example using DeepSeek TTS / Voice Conversion API
  const response = await fetch("https://api.deepseek.ai/v1/voice/stream", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/octet-stream"
    },
    body: inputAudioBuffer
  });

  if (!response.ok) {
    console.error("DeepSeek API error:", await response.text());
    return Buffer.alloc(16000 * 2); // 1s PCM16 silence at 16kHz
  }

  return Buffer.from(await response.arrayBuffer());
}

async function sendDeepSeekAudio(ws, text) {
  const response = await fetch("https://api.deepseek.ai/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, voice: "Nadia" })
  });

  if (!response.ok) {
    console.error("DeepSeek TTS error:", await response.text());
    return;
  }

  const audioArrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(audioArrayBuffer);

  ws.send(JSON.stringify({
    event: "media",
    media: { payload: audioBuffer.toString("base64") }
  }));
}

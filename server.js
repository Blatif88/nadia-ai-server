import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Convert 16-bit PCM → base64 for TTS playback
function base64ToPCM(base64) {
  return Buffer.from(base64, "base64");
}

async function deepseekASR(audioBase64) {
  const payload = {
    model: "deepseek-asr",
    audio: audioBase64
  };

  const res = await fetch("https://api.deepseek.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return (await res.json()).text;
}

async function deepseekTTS(text) {
  const payload = {
    model: "deepseek-tts",
    voice: "female-1",
    input: text,
    format: "pcm16"
  };

  const res = await fetch("https://api.deepseek.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function deepseekAnswer(query) {
  const payload = {
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: "You are Nadia, a warm, confident female medical billing specialist calling from The Billing Advisors."
      },
      { role: "user", content: query }
    ]
  };

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return (await res.json()).choices[0].message.content;
}

async function getMemoryEngineAnswer(text) {
  const result = await fetch(`${APPS_SCRIPT_URL}?text=${encodeURIComponent(text)}`);
  return result.text();
}

// EXPRESS APP
const app = express();
app.use(bodyParser.json());

app.get("/", (_, res) => res.send("Nadia DeepSeek-Twilio Server Running"));

// TWILIO WEBSOCKET SERVER
const wsServer = new WebSocketServer({ noServer: true });

wsServer.on("connection", (ws) => {
  console.log("🔗 Twilio connected to WebSocket");

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    if (data.event === "media") {
      const audioChunk = data.media.payload; // base64

      // 1. Convert speech → text
      const transcript = await deepseekASR(audioChunk);

      if (!transcript || transcript.trim() === "") return;

      console.log("Caller said:", transcript);

      // 2. Ask Memory Engine for answer
      const answer = await getMemoryEngineAnswer(transcript);
      console.log("Nadia says:", answer);

      // 3. Convert text → speech
      const audioResponse = await deepseekTTS(answer);
      const base64Audio = audioResponse.toString("base64");

      // 4. Send audio back to Twilio
      ws.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: base64Audio
          }
        })
      );
    }

    if (data.event === "start") {
      console.log("Call started.");
    }

    if (data.event === "stop") {
      console.log("Call ended.");
    }
  });

  ws.on("close", () => {
    console.log("🔌 Twilio disconnected from WebSocket");
  });
});

// UPGRADE HTTP SERVER FOR TWILIO MEDIA STREAMS
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

server.on("upgrade", (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit("connection", ws, request);
  });
});

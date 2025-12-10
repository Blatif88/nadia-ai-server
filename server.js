// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import bodyParser from "body-parser";

// Replace this with your actual DeepSeek SDK import
// import DeepSeek from "deepseek-sdk"; 

const app = express();
const server = http.createServer(app);

// Parse application/x-www-form-urlencoded for Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// TwiML endpoint for incoming calls
app.post("/twiml", (req, res) => {
  const twimlResponse = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Hello! Nadia AI speaking. Connecting you now...</Say>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
    </Response>
  `;
  res.type("text/xml");
  res.send(twimlResponse);
});

// WebSocket server for Twilio Media Stream
const wss = new WebSocketServer({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("📡 Twilio Media Stream connected");

  // Initialize your DeepSeek session here
  // const deepSeekSession = new DeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });

  ws.on("message", async (message) => {
    // Twilio sends JSON messages over WebSocket
    const msg = JSON.parse(message);

    if (msg.event === "start") {
      console.log("Call started");
      // You can send initial instructions to DeepSeek if needed
    } else if (msg.event === "media") {
      // The audio payload is base64 encoded PCM
      const audioBase64 = msg.media.payload;

      // TODO: Send audioBase64 to DeepSeek API for transcription/response
      // const responseAudio = await deepSeekSession.processAudio(audioBase64);

      // For now, just log received media size
      console.log(`Received audio chunk: ${audioBase64.length} bytes`);

      // TODO: Optionally send audio back to Twilio if DeepSeek returns audio
      // ws.send(JSON.stringify({ event: "media", media: { payload: responseAudio } }));
    } else if (msg.event === "stop") {
      console.log("Call ended");
      // Clean up DeepSeek session if needed
      // deepSeekSession.close();
    }
  });

  ws.on("close", () => {
    console.log("WebSocket disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

// Start HTTP server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

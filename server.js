import express from "express";
import { urlencoded } from "body-parser";
import twilio from 'twilio';

const { twiml: TwilioTwiML } = twilio;
const app = express();
const PORT = process.env.PORT || 10000;

// Twilio sends POST requests with urlencoded body
app.use(urlencoded({ extended: false }));

// TwiML route for Twilio to get call instructions
app.post("/twiml", (req, res) => {
  const twiml = new VoiceResponse();

  // Say something to the caller
  twiml.say("Hello! Nadia AI is now online. Connecting you to AI voice...");

  // Start Media Stream to your server
  twiml.start().stream({
    url: "wss://nadia-server.onrender.com/voice-stream" // WebSocket endpoint
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Optional GET route to test in browser
app.get("/twiml", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Hello! This is Nadia AI. You are visiting the TwiML endpoint.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// Example WebSocket endpoint for media stream
// You need a WebSocket server to receive audio events
import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  console.log("Media Stream connected");

  ws.on("message", (message) => {
    // message is a JSON event with audio chunks
    const data = JSON.parse(message);
    console.log("Received audio event:", data.event);
    // Here you can process the audio (e.g., send to AI)
  });

  ws.on("close", () => {
    console.log("Media Stream disconnected");
  });
});

// Upgrade HTTP server to handle WebSocket
import http from "http";
const server = http.createServer(app);
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/voice-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

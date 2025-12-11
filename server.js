// test-server.js
import http from "http";
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

app.post("/twiml", (req, res) => {
  res.type("text/xml").send(`
    <Response>
      <Start><Stream url="wss://nadia-server.onrender.com/media" /></Start>
    </Response>
  `);
});

app.get("/", (req, res) => res.send("OK"));

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true, path: "/media" });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media") {
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

wss.on("connection", ws => {
  console.log("⚡ Twilio connected!");
  ws.on("message", msg => {
    try {
      const d = JSON.parse(msg.toString());
      console.log("→ event:", d.event, "payload:", d.media?.payload ? "[audio chunk]" : "");
      if (d.event === "stop") {
        console.log("🛑 Stream stopped");
        ws.close();
      }
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
  });
});

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

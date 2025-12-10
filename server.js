import express from "express";
import { twiml as TwilioTwiML } from "twilio";

const app = express();
const port = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));

// Root route
app.get("/", (req, res) => {
  res.send("Nadia DeepSeek-Twilio Server Running");
});

// TwiML route
app.post("/twiml", (req, res) => {
  const voiceResponse = new TwilioTwiML.VoiceResponse();

  // Example: say something
  voiceResponse.say("Hello, this is Nadia AI. Your call is being connected.");

  // Optional: add more instructions (e.g., <Start> for Media Streams)

  res.type("text/xml");
  res.send(voiceResponse.toString());
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

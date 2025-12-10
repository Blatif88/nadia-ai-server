import express from 'express';
import pkg from 'body-parser';
const { json, urlencoded } = pkg;
import http from 'http';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import { spawn } from 'child_process';
import { Readable } from 'stream';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(json());
app.use(urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Twilio webhook
app.post('/twiml', (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello! Nadia AI speaking. Connecting you now...</Say>
  <Start>
    <Stream url="wss://${req.headers.host}/media"/>
  </Start>
</Response>`;
  res.type('text/xml');
  res.send(twiml);
});

const server = http.createServer(app);

// WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/media' });

wss.on('connection', (ws) => {
  console.log('📡 Twilio Media Stream connected');
  ws.isAlive = true;

  ws.on('pong', () => ws.isAlive = true);

  let audioBuffer = [];

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === 'start') console.log('Call started');
      if (data.event === 'stop') console.log('Call ended');

      if (data.event === 'media' && data.media && data.media.payload) {
        // Collect incoming audio
        const chunk = Buffer.from(data.media.payload, 'base64');
        audioBuffer.push(chunk);

        // If enough audio collected, process it (you can adjust size for real-time)
        if (audioBuffer.length >= 50) {
          const fullAudio = Buffer.concat(audioBuffer);
          audioBuffer = [];

          // Convert PCM16 8kHz mono from Twilio to WAV for OpenAI
          const ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', '8000',
            '-ac', '1',
            '-i', 'pipe:0',
            '-f', 'wav',
            'pipe:1'
          ]);
          const wavChunks = [];
          ffmpeg.stdout.on('data', (chunk) => wavChunks.push(chunk));
          ffmpeg.stdin.write(fullAudio);
          ffmpeg.stdin.end();

          ffmpeg.on('close', async () => {
            const wavBuffer = Buffer.concat(wavChunks);

            // Transcribe with OpenAI Whisper
            const transcription = await openai.audio.transcriptions.create({
              file: wavBuffer,
              model: 'whisper-1'
            });

            const userText = transcription.text;
            console.log('Caller said:', userText);

            // Generate AI reply
            const gptResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'You are Nadia AI, helpful and friendly.' },
                { role: 'user', content: userText }
              ]
            });

            const replyText = gptResponse.choices[0].message.content;
            console.log('Nadia replies:', replyText);

            // Generate TTS audio
            const ttsStream = await openai.audio.speech.create({
              model: 'gpt-4o-mini-tts',
              voice: 'alloy',
              input: replyText
            });

            const ttsChunks = [];
            for await (const chunk of ttsStream) ttsChunks.push(chunk);
            const ttsBuffer = Buffer.concat(ttsChunks);

            // Convert TTS to Twilio PCM16 8kHz mono
            const ffmpeg2 = spawn('ffmpeg', [
              '-i', 'pipe:0',
              '-ar', '8000',
              '-ac', '1',
              '-f', 's16le',
              'pipe:1'
            ]);

            const pcmChunks = [];
            ffmpeg2.stdout.on('data', (chunk) => pcmChunks.push(chunk));
            ffmpeg2.stdin.write(ttsBuffer);
            ffmpeg2.stdin.end();

            ffmpeg2.on('close', () => {
              const pcmData = Buffer.concat(pcmChunks);
              const base64Audio = pcmData.toString('base64');

              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  event: 'media',
                  media: { payload: base64Audio }
                }));
              }
            });
          });
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => console.log('Twilio Media Stream disconnected'));
  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// Ping clients to keep connection alive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

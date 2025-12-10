import express from 'express';
import pkg from 'body-parser';
const { json, urlencoded } = pkg;
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(json());
app.use(urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// --- Health check ---
app.get('/', (req, res) => {
  res.send('🚀 Nadia DeepSeek-Twilio Server Running');
});

// --- Twilio webhook: start media stream ---
app.post('/twiml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello! Nadia AI speaking. Connecting you now...</Say>
  <Start>
    <Stream url="wss://${req.headers.host}/media"/>
  </Start>
</Response>`);
});

// --- WebSocket server for Twilio Media Streams ---
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/media' });

wss.on('connection', (twilioWs) => {
  console.log('📡 Twilio Media Stream connected');

  // OpenAI Realtime WebSocket
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  openaiWs.on('open', () => {
    console.log('🌐 Connected to OpenAI Realtime');
  });

  openaiWs.on('message', (msg) => {
    const data = JSON.parse(msg.toString());

    // Forward AI's speech to Twilio
    if (data.type === 'audio_chunk') {
      twilioWs.send(JSON.stringify({
        event: 'media',
        media: {
          payload: data.data // already base64-encoded audio from OpenAI
        }
      }));
    }

    if (data.type === 'message' && data.role === 'assistant') {
      console.log('AI text:', data.content);
    }
  });

  twilioWs.on('message', (msg) => {
    const data = JSON.parse(msg);

    // Twilio sends audio in base64 format
    if (data.event === 'media') {
      const audioBase64 = data.media.payload;

      // Send audio chunk to OpenAI Realtime
      openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: audioBase64
      }));

      // Optionally finalize chunk
      openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));

      // Request AI to respond
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    }

    if (data.event === 'start') console.log('Call started');
    if (data.event === 'stop') {
      console.log('Call ended');
      twilioWs.close();
      openaiWs.close();
    }
  });

  twilioWs.on('close', () => console.log('📴 Twilio Media Stream disconnected'));
});

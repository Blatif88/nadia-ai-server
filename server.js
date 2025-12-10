import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { json, urlencoded } from 'body-parser';
import { Buffer } from 'buffer';
import fs from 'fs';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(json());
app.use(urlencoded({ extended: true }));

// -------------------------
// TwiML Endpoint
// -------------------------
app.post('/twiml', (req, res) => {
    res.type('text/xml');
    res.send(`
        <Response>
            <Start>
                <Stream url="wss://${req.headers.host}/media"/>
            </Start>
            <Say>Hello! Nadia AI speaking. How can I assist you today?</Say>
        </Response>
    `);
});

// -------------------------
// Media WebSocket
// -------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/media' });

wss.on('connection', (ws) => {
    console.log('Media stream connected');

    ws.on('message', async (msg) => {
        const event = JSON.parse(msg.toString());

        switch (event.event) {
            case 'start':
                console.log('Stream started');
                break;

            case 'media':
                // Receive audio from Twilio
                const audioBase64 = event.media.payload;
                const audioBuffer = Buffer.from(audioBase64, 'base64');

                // -------------------------
                // Step 1: Speech-to-Text (Whisper)
                // -------------------------
                try {
                    const sttResponse = await openai.audio.transcriptions.create({
                        file: audioBuffer,
                        model: "whisper-1"
                    });

                    const userText = sttResponse.text;
                    console.log("Caller said:", userText);

                    // -------------------------
                    // Step 2: GPT AI Response
                    // -------------------------
                    const aiResp = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: userText }]
                    });

                    const aiText = aiResp.choices[0].message.content;
                    console.log("Nadia responds:", aiText);

                    // -------------------------
                    // Step 3: Text-to-Speech (TTS)
                    // -------------------------
                    const ttsResp = await openai.audio.speech.create({
                        model: "gpt-4o-mini-tts",
                        voice: "alloy",
                        input: aiText
                    });

                    const ttsBuffer = Buffer.from(await ttsResp.arrayBuffer());

                    // Twilio expects 16-bit PCM 8kHz
                    // Convert to base64 PCM
                    const base64TTS = ttsBuffer.toString('base64');

                    // -------------------------
                    // Step 4: Send audio back to Twilio
                    // -------------------------
                    ws.send(JSON.stringify({
                        event: 'media',
                        media: {
                            payload: base64TTS
                        }
                    }));

                } catch (err) {
                    console.error("Error in media handling:", err);
                }

                break;

            case 'stop':
                console.log('Stream stopped');
                break;

            default:
                console.log('Unknown event:', event.event);
        }
    });

    ws.on('close', () => console.log('Media stream disconnected'));
});

// -------------------------
// Start server
// -------------------------
server.listen(port, () => console.log(`🚀 Server running on port ${port}`));

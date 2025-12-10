// server.js
import express from 'express';
import pkg from 'twilio';
const { twiml: TwilioTwiML } = pkg;

const app = express();

// Middleware to parse POST data from Twilio
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Nadia DeepSeek-Twilio Server Running');
});

// TwiML endpoint for Twilio calls
app.post('/twiml', (req, res) => {
  try {
    // Log incoming request from Twilio
    console.log('Incoming request body:', req.body);

    // Create TwiML response
    const response = new TwilioTwiML.VoiceResponse();

    // Say a message (Nadia speaking)
    response.say('Hello! Nadia AI speaking. How can I assist you today?', { voice: 'alice' });

    // Respond with XML
    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('Error generating TwiML:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const dotenv = require('dotenv');
const { Groq } = require('groq-sdk');
const { createClient } = require('@deepgram/sdk');
const fs = require('fs');
const { Buffer } = require('buffer');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const port = process.env.PORT || 4000;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_API_URL = 'wss://api.deepgram.com/v1/listen';
const deepgram = createClient(DEEPGRAM_API_KEY);

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  const deepgramSocket = new WebSocket(DEEPGRAM_API_URL, {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
    },
  });

  deepgramSocket.on('message', (message) => {
    // console.log('Message from Deepgram:', message);
    ws.send(message);
  });

  ws.on('message', (message) => {
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.send(message);
    }
  });

  ws.on('close', () => {
    deepgramSocket.close();
    console.log('Client disconnected');
  });

  deepgramSocket.on('error', (error) => {
    console.error('Deepgram WebSocket error:', error);
  });
});

app.post('/api/generate-content', async (req, res) => {
  console.log(req.body?.transcript); 

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: req.body.transcript }],
      model: 'llama3-8b-8192',
    });

    console.log('Response from Groq API:', response);
    res.json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Error generating content');
  }
});

app.post('/generate-audio', async (req, res) => {
  const { text } = req.body;

  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model: 'aura-asteria-en',
        encoding: 'linear16',
        container: 'wav',
      }
    );

    const stream = await response.getStream();
    const buffer = await getAudioBuffer(stream);

    res.setHeader('Content-Type', 'audio/wav');
    res.send(buffer);
  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).send('Error generating audio');
  }
});


const getAudioBuffer = async (response) => {
  const reader = response.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
  }

  const dataArray = chunks.reduce(
    (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
    new Uint8Array(0)
  );

  return Buffer.from(dataArray.buffer);
};

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

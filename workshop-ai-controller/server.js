import express from 'express';
import cors from 'cors';

const app = express();
const port = 3001;

// Middleware
// Enable Cross-Origin Resource Sharing (CORS) with a more explicit configuration.
// This is crucial for allowing the frontend (running in the browser) to communicate
// with this backend server. The `fetch` API in browsers enforces a same-origin policy,
// and CORS headers are required to bypass this for legitimate requests.
app.use(cors({
  origin: '*', // For development, allow any origin. In production, you'd restrict this to your app's domain.
  methods: ['GET', 'POST', 'OPTIONS'], // Allow these HTTP methods.
  allowedHeaders: ['Content-Type'], // Allow the 'Content-Type' header, which is sent by the frontend.
}));
app.use(express.json()); // Parse JSON bodies

// --- In-memory state for simulation ---
let googleToken = null;
let lightState = {
    power: 'off',
    color: { r: 255, g: 255, b: 255 }
};

// --- TODO: Real Google Home API Integration ---
// In a real application, you would use libraries like 'googleapis' and 'google-auth-library'.
// The server would manage OAuth2 tokens and make authenticated requests to the
// Google Home Graph API or Smart Device Management API.
// This requires a Google Cloud project with the appropriate APIs enabled.
// Example: https://developers.google.com/nest/device-access/authorize

// --- API Endpoints ---

// Simulates the start of the OAuth 2.0 flow
app.get('/api/auth/google', (req, res) => {
    // In a real app, you would redirect to Google's OAuth consent screen:
    // const authUrl = googleOauthClient.generateAuthUrl({ ... });
    // res.redirect(authUrl);
    
    // For this demo, we'll simulate a successful authentication immediately.
    console.log('[BACKEND] Simulating Google OAuth flow...');
    res.send('<script>window.close();</script>');
});

// The frontend would call this after the popup closes to confirm auth
app.post('/api/auth/verify', (req, res) => {
    // In a real app, this would be a callback endpoint from Google with an auth code.
    // The server would exchange the code for an access token.
    console.log('[BACKEND] Simulating token exchange...');
    googleToken = 'simulated_google_access_token_' + Date.now();
    res.json({ 
        status: 'SUCCESS',
        user: { email: 'user@gmail.com' }
    });
});

// Simulates logging out
app.post('/api/auth/logout', (req, res) => {
    console.log('[BACKEND] User logged out.');
    googleToken = null;
    res.json({ status: 'SUCCESS' });
});

// Endpoint to set light power
app.post('/api/lights/power', (req, res) => {
    if (!googleToken) {
        return res.status(401).json({ status: 'ERROR', message: 'Not authenticated' });
    }
    const { power } = req.body;
    if (power !== 'on' && power !== 'off') {
        return res.status(400).json({ status: 'ERROR', message: 'Invalid power state' });
    }

    console.log(`[BACKEND] Received command to turn light ${power}.`);
    // --- TODO: Real Google API call ---
    // Here you would make a call to the Google Smart Home API to execute the command.
    // Example:
    // await homegraph.devices.execute({
    //     requestId: '...',
    //     payload: { commands: [{...}] }
    // });

    // Simulate network latency and potential failure
    setTimeout(() => {
        if (Math.random() > 0.95) { // 5% chance of failure
            console.error('[BACKEND] Simulated API call failed!');
            res.status(500).json({ status: 'ERROR', message: 'Failed to execute command' });
        } else {
            lightState.power = power;
            console.log(`[BACKEND] Light power is now ${lightState.power}`);
            res.json({ status: 'SUCCESS' });
        }
    }, 500);
});

// Endpoint to set light color
app.post('/api/lights/color', (req, res) => {
    if (!googleToken) {
        return res.status(401).json({ status: 'ERROR', message: 'Not authenticated' });
    }
    const { r, g, b } = req.body;
    if (r === undefined || g === undefined || b === undefined) {
        return res.status(400).json({ status: 'ERROR', message: 'Invalid color value' });
    }

    console.log(`[BACKEND] Received command to set color to rgb(${r}, ${g}, ${b}).`);
    // --- TODO: Real Google API call for color ---

    // Simulate faster latency for color changes
    setTimeout(() => {
        lightState.color = { r, g, b };
        console.log(`[BACKEND] Light color is now rgb(${lightState.color.r}, ${lightState.color.g}, ${lightState.color.b})`);
        res.json({ status: 'SUCCESS' });
    }, 300);
});


app.listen(port, () => {
    console.log(`
===================================================================
  Workshop AI Controller Backend is running on http://localhost:${port}
===================================================================

This is a mock server to simulate Google Home integration.
It provides API endpoints that your frontend can call.

- To start the OAuth flow (simulated): GET /api/auth/google
- To control the lights:
  - POST /api/lights/power with body { "power": "on" | "off" }
  - POST /api/lights/color with body { "r": 255, "g": 100, "b": 50 }

Make sure your frontend application is making requests to this server.
`);
});
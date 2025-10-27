// // backend/server.js
// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const fs = require('fs');
// const path = require('path');
// const http = require('http');
// const socketIo = require('socket.io');
// const axios = require('axios');
// const chrono = require('chrono-node');
// 
// // Load environment variables from .env file
// dotenv.config();
// 
// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//     cors: {
//         origin: "http://localhost:5173",
//         methods: ["GET", "POST"]
//     }
// });
// const port = process.env.PORT || 3001;
// 
// app.use(cors());
// app.use(express.json());
// 
// // --- API Endpoint to serve all geocoded stories ---
// app.get('/api/stories', (req, res) => {
//     const geocodedStoriesPath = path.join(__dirname, 'geocoded_stories.json');
//     fs.readFile(geocodedStoriesPath, 'utf-8', (err, data) => {
//         if (err) {
//             console.error("Error reading geocoded_stories.json:", err);
//             return res.status(500).json({ error: "Could not load story data. Run the geocode_stories.py script first." });
//         }
//         res.json(JSON.parse(data));
//     });
// });
// 
// const chatHistories = new Map();
// // --- START: Data loading from local files ---
// let victimStories = '';
// let analyzedStories = [];
// let recognizedLocations = [];
// 
// try {
//     const dataFolderPath = path.join(__dirname, '..', 'data');
//     const fileNames = fs.readdirSync(dataFolderPath);
//     fileNames.forEach(fileName => {
//         const filePath = path.join(dataFolderPath, fileName);
//         if (fs.statSync(filePath).isFile()) {
//             victimStories += fs.readFileSync(filePath, 'utf-8') + '\n\n';
//         }
//     });
// 
//     const analyzedStoriesPath = path.join(__dirname, 'analyzed_stories.json');
//     if (fs.existsSync(analyzedStoriesPath)) {
//         const analyzedData = fs.readFileSync(analyzedStoriesPath, 'utf-8');
//         analyzedStories = JSON.parse(analyzedData);
//         const locations = analyzedStories.map(story => story.location?.name).filter(Boolean);
//         recognizedLocations = [...new Set(locations)];
//         console.log('Successfully loaded analyzed stories and recognized locations.');
//     } else {
//         console.log('analyzed_stories.json not found. Some features may be limited.');
//     }
// } catch (error) {
//     console.error('Error during initial data loading:', error);
// }
// // --- END: Data loading ---
// 
// const getSystemInstruction = () => {
//     return [
//         { text: `You are an empathetic AI assistant named Hope...` }, // Keeping this brief for the example
//     ];
// };
// 
// io.on('connection', (socket) => {
//     console.log('New client connected to WebSocket');
//     socket.on('disconnect', () => {
//         console.log('Client disconnected from WebSocket');
//     });
// });
// 
// app.post('/chat', async (req, res) => {
//     const { sessionId, userResponse } = req.body;
// 
//     if (!sessionId || userResponse === undefined) {
//         return res.status(400).json({ error: 'Missing sessionId or userResponse.' });
//     }
// 
//     let previousHistory = chatHistories.get(sessionId) || [];
// 
//     try {
//         // --- 1. RAG: Find a relevant story and its sentiment ---
//         let relevantSentiment = 'neutral'; // Default sentiment
//         const allTopics = [...new Set(analyzedStories.flatMap(story => story.topics || []))];
//         const mentionedTopics = allTopics.filter(topic => userResponse.toLowerCase().includes(topic.toLowerCase()));
// 
//         if (mentionedTopics.length > 0) {
//             console.log(`RAG: Found relevant topics: ${mentionedTopics.join(', ')}`);
//             const relevantStories = analyzedStories.filter(story => 
//                 story.topics && story.topics.some(topic => mentionedTopics.includes(topic))
//             );
//             if (relevantStories.length > 0) {
//                 // Sort to find the most relevant story (e.g., by sentiment or another metric)
//                 const topStory = relevantStories.sort((a, b) => {
//                     const sentimentOrder = { 'positive': 2, 'neutral': 1, 'negative': 0 }; // Prioritize negative/neutral for context
//                     return (sentimentOrder[b.sentiment] || 0) - (sentimentOrder[a.sentiment] || 0);
//                 })[0];
//                 relevantSentiment = topStory.sentiment;
//                 console.log(`RAG: Using sentiment '${relevantSentiment}' from a related story to guide response.`);
//             }
//         }
// 
//         // --- 2. Call Python service to generate empathetic response ---
//         const responseGenerationUrl = 'http://localhost:5002/generate_response';
//         console.log(`Calling response generation service at ${responseGenerationUrl}`);
//         
//         const pythonResponse = await axios.post(responseGenerationUrl, {
//             user_message: userResponse,
//             story_sentiment: relevantSentiment
//         });
// 
//         const modelResponse = pythonResponse.data.response;
// 
//         if (!modelResponse) {
//             throw new Error("Python service returned an empty response.");
//         }
// 
//         // --- 4. Update History and Handle Side-effects ---
//         const newFullHistory = [...previousHistory, { role: 'user', text: userResponse }, { role: 'model', text: modelResponse }];
//         chatHistories.set(sessionId, newFullHistory);
// 
//         // Real-time map update logic
//         const locationRegex = new RegExp(`\b(${recognizedLocations.join('|')})\b`, 'i');
//         const locationMatch = userResponse.match(locationRegex);
//         if (locationMatch) {
//             const locationName = locationMatch[0];
//             const matchedStory = analyzedStories.find(story => story.location?.name.toLowerCase() === locationName.toLowerCase());
//             try {
//                 const geoResponse = await axios.post('http://localhost:5001/geocode', { location: locationName });
//                 io.emit('mapUpdate', {
//                     location: locationName,
//                     latitude: geoResponse.data.latitude,
//                     longitude: geoResponse.data.longitude,
//                     storySummary: matchedStory ? matchedStory.summary : 'No specific story found.',
//                     sentiment: matchedStory ? matchedStory.sentiment : null
//                 });
//                 console.log(`Sent real-time map update for: ${locationName}`);
//             } catch (geoError) {
//                 console.error(`Error calling geocoding API: ${geoError.message}`);
//             }
//         }
// 
//         res.json({ response: modelResponse, history: newFullHistory });
// 
//     } catch (error) {
//         console.error('Error in /chat endpoint:', error.response ? error.response.data : error.message);
//         res.status(500).json({ error: 'Failed to get a response from Hope.' });
//     }
// });
// 
// server.listen(port, () => {
//     console.log(`Backend server running on http://localhost:${port}`);
// });
// 
// module.exports = { app, chatHistories };

// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const chrono = require('chrono-node');

// Load environment variables from .env file
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173", // Use env variable or default
        methods: ["GET", "POST"]
    }
});
const port = process.env.PORT || 3001;
const GEMINI_API_URL = process.env.GEMINI_API_URL || "YOUR_GEMINI_MODEL_ENDPOINT"; // Placeholder for actual LLM endpoint
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Ensure this is set in your .env file

app.use(cors());
app.use(express.json());

const chatHistories = new Map();
// --- START: Data loading from local files ---
let victimStories = '';
let analyzedStories = [];
let geocodedStories = []; // NEW: Variable to hold the final geocoded data
let recognizedLocations = [];

// Function to load and parse a JSON file
const loadJsonFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
};

try {
    const dataFolderPath = path.join(__dirname, '..', 'data');
    const fileNames = fs.readdirSync(dataFolderPath);
    fileNames.forEach(fileName => {
        const filePath = path.join(dataFolderPath, fileName);
        if (fs.statSync(filePath).isFile()) {
            victimStories += fs.readFileSync(filePath, 'utf-8') + '\n\n';
        }
    });

    const analyzedStoriesPath = path.join(__dirname, 'analyzed_stories.json');
    const geocodedStoriesPath = path.join(__dirname, 'geocoded_stories.json');

    analyzedStories = loadJsonFile(analyzedStoriesPath) || [];
    geocodedStories = loadJsonFile(geocodedStoriesPath) || [];

    if (analyzedStories.length > 0) {
        const locations = analyzedStories.map(story => story.location?.name).filter(Boolean);
        recognizedLocations = [...new Set(locations)];
        console.log('Recognized locations loaded:', recognizedLocations); // Added log
    }

    // Check which files loaded successfully
    if (geocodedStories.length > 0) {
        console.log(`Successfully loaded ${geocodedStories.length} geocoded stories for map display.`);
    } else {
        console.warn('geocoded_stories.json not found or empty. Map features will be unavailable.');
    }
    if (analyzedStories.length > 0) {
        console.log(`Successfully loaded ${analyzedStories.length} analyzed stories for RAG.`);
    }

} catch (error) {
    console.error('Error during initial data loading:', error);
}
// --- END: Data loading ---


// --- API Endpoint to serve all geocoded stories (Uses in-memory data) ---
app.get('/api/stories', (req, res) => {
    if (geocodedStories.length === 0) {
        console.error("Story data is empty. Did you run geocode_stories.py?");
        return res.status(500).json({ error: "Could not load story data. Run the geocode_stories.py script first." });
    }
    res.json(geocodedStories);
});

// System Instruction for the LLM
const getSystemInstruction = (sentiment, contextSummary) => {
    let instruction = `You are an empathetic AI assistant named Hope. Your goal is to respond supportively and concisely to users discussing sensitive topics.`;

    if (contextSummary) {
        instruction += `\n\n**CONTEXT (RAG):** A relevant story has a sentiment of '${sentiment}'. The story summary is: "${contextSummary}". Use this context to inform your response, making it specific and empathetic to the general tone of the user's inquiry.`;
    } else {
        instruction += `\n\nRespond based on general knowledge with high empathy.`;
    }
    
    return [
        { role: 'system', text: instruction }
    ];
};

io.on('connection', (socket) => {
    console.log('New client connected to WebSocket');
    socket.on('disconnect', () => {
        console.log('Client disconnected from WebSocket');
    });
});

app.post('/chat', async (req, res) => {
    const { sessionId, userResponse } = req.body;

    if (!sessionId || userResponse === undefined) {
        return res.status(400).json({ error: 'Missing sessionId or userResponse.' });
    }

    // --- 1. RAG: Find a relevant story and its context ---
    let topStory = null;
    let relevantSentiment = 'neutral';
    let contextSummary = null;

    const allTopics = [...new Set(analyzedStories.flatMap(story => story.topics || []))];
    const mentionedTopics = allTopics.filter(topic => userResponse.toLowerCase().includes(topic.toLowerCase()));

    if (mentionedTopics.length > 0) {
        console.log(`RAG: Found relevant topics: ${mentionedTopics.join(', ')}`);
        const relevantStories = analyzedStories.filter(story => 
            story.topics && story.topics.some(topic => mentionedTopics.includes(topic))
        );
        
        if (relevantStories.length > 0) {
            // Prioritize stories with negative/neutral sentiment for empathy/support context
            topStory = relevantStories.sort((a, b) => {
                const sentimentOrder = { 'negative': 2, 'neutral': 1, 'positive': 0 };
                return (sentimentOrder[a.sentiment] || 0) - (sentimentOrder[b.sentiment] || 0);
            })[0];
            
            relevantSentiment = topStory.sentiment;
            contextSummary = topStory.summary; // Use the summary as the context
            console.log(`RAG: Using story with sentiment '${relevantSentiment}' and summary as context.`);
        }
    }

    // --- 2. Build Prompt and Call LLM ---
    let previousHistory = chatHistories.get(sessionId) || [];
    const systemInstruction = getSystemInstruction(relevantSentiment, contextSummary);

    // Combine system instruction, previous chat, and new user message for the LLM
    const chatPrompt = [
        ...systemInstruction,
        ...previousHistory,
        { role: 'user', text: userResponse }
    ];
    
    // TEMPORARY LLM CALL (Replace with actual Gemini/OpenAI SDK call)
    try {
        // --- This entire axios block should be replaced by the @google/genai SDK ---
        const llmResponse = await axios.post(GEMINI_API_URL, {
            // Structure based on a common LLM API format (e.g., Gemini's generateContent)
            messages: chatPrompt.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            model: process.env.MODEL, // Specify the model from .env
            temperature: 0.7,
            max_tokens: 150 // Limit response length for concise chat
        }, {
            headers: {
                'Authorization': `Bearer ${GEMINI_API_KEY}`, // Using API Key
                'Content-Type': 'application/json'
            }
        });
        // Assuming the response structure is simple, adapt this part to your chosen model's SDK/API
        const modelResponse = llmResponse.data.choices[0].message.content; 
        // ---------------------------------------------------------------------------------

        if (!modelResponse) {
            throw new Error("LLM service returned an empty response.");
        }

        // --- 3. Update History and Handle Side-effects ---
        const newFullHistory = [...previousHistory, { role: 'user', text: userResponse }, { role: 'model', text: modelResponse }];
        chatHistories.set(sessionId, newFullHistory);

        // Real-time map update logic
        // Only trigger map update if a location recognized during data preprocessing is mentioned
        const locationRegex = new RegExp(`\\b(${recognizedLocations.join('|')})\\b`, 'i');
        const locationMatch = userResponse.match(locationRegex);
        
        if (locationMatch) {
            const locationName = locationMatch[0];
            const matchedStory = geocodedStories.find(story => 
                story.location?.name && story.location.name.toLowerCase() === locationName.toLowerCase()
            );

            try {
                console.log(`Attempting to geocode location: "${locationName}"`); // Added log
                // Call the local geocoding proxy API (http://localhost:5001)
                const geoResponse = await axios.post('http://localhost:5001/geocode', { location: locationName });
                
                io.emit('mapUpdate', {
                    location: locationName,
                    latitude: geoResponse.data.latitude,
                    longitude: geoResponse.data.longitude,
                    // Use matchedStory from the fully geocoded data for accurate coordinates
                    storySummary: matchedStory ? matchedStory.summary : 'No specific story found.',
                    sentiment: matchedStory ? matchedStory.sentiment : null
                });
                console.log(`Sent real-time map update for: ${locationName}`);
            } catch (geoError) {
                console.error(`Error calling geocoding API (5001): ${geoError.message}. Is geocode_api.py running?`);
            }
        }

        res.json({ response: modelResponse, history: newFullHistory });

    } catch (error) {
        console.error('Error in /chat endpoint:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to get a response from Hope. Check the LLM API endpoint and key.' });
    }
});

server.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});

module.exports = { app, chatHistories };
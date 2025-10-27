import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';
import jsPDF from 'jspdf';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import io from 'socket.io-client';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';

// CSS for leaflet is loaded via CDN in index.html

// Default icon fix for Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API_URL);

// Custom icons for different sentiments
const sentimentIcons = {
    positive: new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    negative: new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    neutral: new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
};

const App = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [loading, setLoading] = useState(false);
    const [realtimeMarkers, setRealtimeMarkers] = useState([]);
    const [initialStories, setInitialStories] = useState([]);
    const [mapBounds, setMapBounds] = useState(null); // State for map bounds
    const messagesEndRef = useRef(null);
    const mapRef = useRef(null);
    const defaultPosition = [-43.532, 172.636]; // Fallback center

    // Effect for initial message
    useEffect(() => {
        setMessages([
            { role: 'model', text: 'Hello! I am Hope, your Earthquake Support Chatbot. How can I help you today?' }
        ]);
    }, []);

    // Effect for session ID and WebSocket
    useEffect(() => {
        const storedSessionId = localStorage.getItem('sessionId') || uuidv4();
        setSessionId(storedSessionId);
        localStorage.setItem('sessionId', storedSessionId);
        
        socket.on('mapUpdate', (data) => {
            console.log('Received real-time map update:', data);
            setRealtimeMarkers(prev => [...prev, data]);
            if (mapRef.current && data.latitude && data.longitude) {
                mapRef.current.flyTo([data.latitude, data.longitude], 13);
            }
        });

        return () => socket.off('mapUpdate');
    }, []);

    // Effect for fetching initial stories and setting map bounds
    useEffect(() => {
        const fetchInitialStories = async () => {
            try {
                // NOTE: This URL uses /api/stories which is correct for the story fetching endpoint
                const response = await fetch(`${API_URL}/api/stories`);
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                setInitialStories(data);
                console.log(`Fetched ${data.length} initial stories.`);

                // Calculate bounds from the fetched stories
                const points = data
                    .map(story => story.location?.coordinates)
                    .filter(coords => coords?.latitude && coords?.longitude)
                    .map(coords => [coords.latitude, coords.longitude]);

                if (points.length > 0) {
                    setMapBounds(L.latLngBounds(points));
                }
            } catch (error) {
                console.error("Failed to fetch initial stories:", error);
            }
        };
        fetchInitialStories();
    }, []);

    // Effect to scroll chat to bottom whenever messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    // --- CHAT LOGIC ---

    const generatePdf = () => {
        // Implementation for downloading chat as PDF
        const doc = new jsPDF();
        doc.text("Hope Chatbot Conversation Log", 10, 10);
        let y = 20;

        messages.forEach(msg => {
            doc.text(`${msg.role.toUpperCase()}: ${msg.text}`, 10, y);
            y += 10;
        });

        doc.save("hope_chatbot_log.pdf");
    };

    const handleSendMessage = async (userMessage) => { 
        if (!userMessage.trim() || loading) return;

        const newMessage = { role: 'user', text: userMessage };
        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);
        setInput('');
        setLoading(true);

        try {
            // FIX APPLIED: URL corrected to use /chat instead of /api/chat
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // *** FIX APPLIED: Changed 'message' to 'userResponse' ***
                body: JSON.stringify({ userResponse: userMessage, sessionId }),
            });

            const data = await response.json();

            // --- MODIFICATION: Add source attribution for RAG ---
            // This simulates the backend sending a source story ID with the response.
            const sourceStory = initialStories.length > 0 
                ? initialStories[Math.floor(Math.random() * initialStories.length)] 
                : null;

            const botMessage = {
                role: 'model',
                text: data.response,
                source: sourceStory ? sourceStory.story_id : null,
            };
            setMessages(prev => [...prev, botMessage]);
            // --- END MODIFICATION ---

        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I am having trouble connecting right now.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handleNewChat = () => {
        if (loading) return;
        setMessages([]);
        setInput('');
        const newSessionId = uuidv4();
        setSessionId(newSessionId);
        localStorage.setItem('sessionId', newSessionId);
        setRealtimeMarkers([]); // Clear real-time markers for a new chat
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(input);
        }
    };

    // --- MODIFICATION: Function to show source info ---
    const showSourceInfo = (storyId) => {
        const story = initialStories.find(s => s.story_id === storyId);
        if (story) {
            alert(
                `This response is based on a story from: ${story.location.name}\n\n` +
                `Sentiment: ${story.sentiment}\n` +
                `Summary: ${story.summary}`
            );
        } else {
            alert('Source story details not found.');
        }
    };
    // --- END MODIFICATION ---

    // --- RENDER ---

    return (
        <div className="app-container">
            <header className="header">
                <h1>Hope - Earthquake Support Chatbot</h1>
            </header>
            <div className="content-area">
                <div className="chat-section">
                    {/* BEGIN: Chat UI Content - NOW CORRECTLY INCLUDED */}
                    <div className="messages-list">
                        {messages.map((msg, index) => (
                            <div key={index} className={`message ${msg.role}`}>
                                <div className="message-content">{msg.text}</div>
                                {/* --- MODIFICATION: Add source button --- */}
                                {msg.role === 'model' && msg.source && (
                                    <button onClick={() => showSourceInfo(msg.source)} className="source-button">
                                        Source
                                    </button>
                                )}
                                {/* --- END MODIFICATION --- */}
                            </div>
                        ))}
                        {loading && (
                            <div className="message model">
                                <div className="message-content">Hope is typing...</div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="input-area">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type your message..."
                            rows="3"
                            disabled={loading}
                        ></textarea>
                        <div className="button-group">
                            <button onClick={() => handleSendMessage(input)} disabled={loading || !input.trim()}>
                                Send Message
                            </button>
                            <button onClick={handleNewChat} disabled={loading}>
                                New Chat
                            </button>
                            <button onClick={generatePdf} disabled={loading || messages.length === 0}>
                                Download Chat (PDF)
                            </button>
                        </div>
                    </div>
                    {/* END: Chat UI Content */}
                </div>
                <div className="map-section">
                    <MapContainer 
                        ref={mapRef} 
                        center={defaultPosition} 
                        zoom={4} 
                        bounds={mapBounds}
                        boundsOptions={{ padding: [50, 50] }}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors' />
                        
                        {/* HeatmapLayer */}
                        <HeatmapLayer
                            points={initialStories.map(story => {
                                if (story.location?.coordinates) {
                                    return [story.location.coordinates.latitude, story.location.coordinates.longitude, 1]; // [lat, lng, intensity]
                                }
                                return null;
                            }).filter(Boolean)}
                            longitudeExtractor={m => m[1]}
                            latitudeExtractor={m => m[0]}
                            intensityExtractor={m => parseFloat(m[2])}
                            radius={20}
                            max={1}
                            blur={15}
                        />

                        {/* Initial Stories Markers */}
                        {initialStories.map(story => (
                            story.location?.coordinates && (
                                <Marker 
                                    key={story.story_id} 
                                    position={[story.location.coordinates.latitude, story.location.coordinates.longitude]}
                                    icon={sentimentIcons[story.sentiment] || new L.Icon.Default()}
                                >
                                    <Popup>
                                        <b>{story.location.name}</b><br/>
                                        <p><b>Sentiment:</b> {story.sentiment}</p>
                                        <p><b>Summary:</b> {story.summary}</p>
                                    </Popup>
                                </Marker>
                            )
                        ))}

                        {/* Real-time Markers */}
                        {realtimeMarkers.map((marker, index) => (
                            <Marker key={`realtime-${index}`} position={[marker.latitude, marker.longitude]}>
                                <Popup>
                                    <b>{marker.location}</b> (from chat)<br/>
                                    <p>{marker.storySummary}</p>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default App;

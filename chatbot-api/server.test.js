// backend/server.test.js
import { describe, beforeEach, test, expect, vi } from 'vitest';
const request = require('supertest');
const { app, genAI, chatHistories } = require('./server'); // Import genAI directly

// We will spy on methods of `genAI` object after it's imported.
let spyGetGenerativeModel;

vi.mock('@google/generative-ai', () => {
    const mockText = vi.fn();
    const mockSendMessageStream = vi.fn();
    const mockStartChat = vi.fn();
    const mockGetGenerativeModelInternal = vi.fn();

    const stream = {
        [Symbol.asyncIterator]: async function* () {
            yield { text: mockText };
        },
    };

    mockText.mockImplementation(() => "");
    mockSendMessageStream.mockImplementation(() => stream);
    mockStartChat.mockImplementation(() => ({
        sendMessageStream: mockSendMessageStream,
        getHistory: vi.fn(() => []),
    }));
    mockGetGenerativeModelInternal.mockImplementation(() => ({
        startChat: mockStartChat,
    }));

    return {
        GoogleGenerativeAI: vi.fn(() => ({
            getGenerativeModel: mockGetGenerativeModelInternal,
        })),
        _mockGetGenerativeModel: mockGetGenerativeModelInternal,
        _mockStartChat: mockStartChat,
        _mockSendMessageStream: mockSendMessageStream,
        _mockText: mockText,
    };
});

describe('Chat API Endpoint', () => {
    beforeEach(() => {
        chatHistories.clear(); // Clear in-memory chat history for each test

        if (spyGetGenerativeModel) {
            spyGetGenerativeModel.mockRestore();
        }
        spyGetGenerativeModel = vi.spyOn(genAI, 'getGenerativeModel');

        const mockSendMessageStreamDefault = vi.fn();
        const mockStartChatDefault = vi.fn(() => ({
            sendMessageStream: mockSendMessageStreamDefault,
            getHistory: vi.fn(() => [])
        }));

        spyGetGenerativeModel.mockImplementation(() => ({
            startChat: mockStartChatDefault,
        }));

        vi.spyOn(console, 'error').mockImplementation(() => {});

        process.env.GOOGLE_API_KEY = 'mock_api_key';
    });

    // Test case 1: Initial empty message and AI greeting
    test('should handle initial empty message and return AI greeting', async () => {
        // Adjusted AI greeting to the new "Hope" persona
        const mockHopeGreeting = "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?\n";
        
        spyGetGenerativeModel.mockImplementationOnce(() => ({
            startChat: vi.fn(() => ({
                sendMessageStream: vi.fn(async () => ({
                    stream: {
                        [Symbol.asyncIterator]: async function* () {
                            yield { text: () => mockHopeGreeting };
                        }
                    }
                })),
                getHistory: vi.fn(() => [])
            }))
        }));

        const res = await request(app)
            .post('/chat')
            .send({ sessionId: 'testSession123', userResponse: '' });

        expect(res.statusCode).toEqual(200);
        expect(res.body.response.trim()).toEqual(mockHopeGreeting.trim());
        expect(res.body.history).toEqual([
            { role: 'user', text: "Start conversation with Hope." },
            { role: 'model', text: mockHopeGreeting }
        ]);

        expect(spyGetGenerativeModel).toHaveBeenCalledWith({
            model: "gemini-1.5-flash-latest",
            systemInstruction: expect.any(Object),
            generationConfig: { responseMimeType: "text/plain" },
        });

        const startChatMock = spyGetGenerativeModel.mock.results[0].value.startChat;
        expect(startChatMock).toHaveBeenCalledWith({ history: [{ role: 'user', parts: [{ text: "Start conversation with Hope." }] }] });

        const sendMessageStreamMock = startChatMock.mock.results[0].value.sendMessageStream;
        expect(sendMessageStreamMock).toHaveBeenCalledWith("Start conversation with Hope.");
    });

    // Test case 2: User message and AI response
    test('should process user message and return AI response', async () => {
        const historyAfterInitialGreeting = [
            { role: 'user', text: "Start conversation with Hope." },
            { role: 'model', text: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?\n" }
        ];
        chatHistories.set('testSession123', historyAfterInitialGreeting);

        const userMessage = "I'm feeling so sad and anxious.";
        // Adjusted AI response to the new "Hope" persona
        const mockAIResponse = "That sounds incredibly difficult. It's completely understandable to feel overwhelmed right now.";
        
        spyGetGenerativeModel.mockImplementationOnce(() => ({
            startChat: vi.fn(() => ({
                sendMessageStream: vi.fn(async () => ({
                    stream: {
                        [Symbol.asyncIterator]: async function* () {
                            yield { text: () => mockAIResponse };
                        }
                    }
                })),
                getHistory: vi.fn(() => [])
            }))
        }));

        const res = await request(app)
            .post('/chat')
            .send({ sessionId: 'testSession123', userResponse: userMessage });

        expect(res.statusCode).toEqual(200);
        expect(res.body.response.trim()).toEqual(mockAIResponse.trim());

        const expectedFullHistory = [
            ...historyAfterInitialGreeting,
            { role: 'user', text: userMessage },
            { role: 'model', text: mockAIResponse }
        ];

        expect(res.body.history).toEqual(expectedFullHistory);

        expect(spyGetGenerativeModel).toHaveBeenCalledWith({
            model: "gemini-1.5-flash-latest",
            systemInstruction: expect.any(Object),
            generationConfig: { responseMimeType: "text/plain" },
        });

        const startChatMock = spyGetGenerativeModel.mock.results[0].value.startChat;
        expect(startChatMock).toHaveBeenCalledWith({
            history: [
                { role: 'user', parts: [{ text: "Start conversation with Hope." }] },
                { role: 'model', parts: [{ text: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?\n" }] },
                { role: 'user', parts: [{ text: userMessage }] }
            ]
        });

        const sendMessageStreamMock = startChatMock.mock.results[0].value.sendMessageStream;
        expect(sendMessageStreamMock).toHaveBeenCalledWith(userMessage);
    });

    // Test case 3: Invalid request body (missing sessionId)
    test('should return 400 if sessionId is missing', async () => {
        const res = await request(app)
            .post('/chat')
            .send({ userResponse: 'Hello' });

        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toEqual('Missing sessionId or userResponse.');
    });

    // Test case 4: Invalid request body (missing userResponse)
    test('should return 400 if userResponse is missing', async () => {
        const res = await request(app)
            .post('/chat')
            .send({ sessionId: 'testSession456' });

        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toEqual('Missing sessionId or userResponse.');
    });

    // Test case 5: Handling Gemini API errors gracefully
    test('should handle Gemini API errors gracefully', async () => {
        const errorMessage = 'API error occurred.';
        
        spyGetGenerativeModel.mockImplementationOnce(() => ({
            startChat: vi.fn(() => ({
                sendMessageStream: vi.fn(() => {
                    throw new Error(errorMessage); 
                }),
                getHistory: vi.fn(() => [])
            }))
        }));

        const res = await request(app)
            .post('/chat')
            .send({ sessionId: 'errorSession', userResponse: 'Test message' });

        expect(res.statusCode).toEqual(500);
        expect(res.body.error).toEqual('Failed to get a response from Hope. Please try again.');
        expect(console.error).toHaveBeenCalledWith('Error calling Gemini API:', expect.any(Error));
    });

    // Test case 6: Handling "First content should be with role user" error from Gemini API
    test('should handle "First content should be with role user" error from Gemini API', async () => {
        const specificErrorMessage = "First content should be with role 'user', got model";
        
        spyGetGenerativeModel.mockImplementationOnce(() => ({
            startChat: vi.fn(() => ({
                sendMessageStream: vi.fn(() => {
                    const error = new Error(specificErrorMessage);
                    throw error;
                }),
                getHistory: vi.fn(() => [])
            }))
        }));

        const res = await request(app)
            .post('/chat')
            .send({ sessionId: 'syncErrorSession', userResponse: 'Test message' });

        expect(res.statusCode).toEqual(500);
        expect(res.body.error).toEqual("There was an internal chat history synchronization issue. Please refresh the page and try again.");
        expect(console.error).toHaveBeenCalledWith('Error calling Gemini API:', expect.any(Error));
    });
});
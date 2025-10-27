// frontend/src/App.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import { vi } from 'vitest';

describe('App Component', () => {
    beforeEach(() => {
        // Mock the fetch API
        global.fetch = vi.fn();
        
        // Mock localStorage
        const localStorageMock = (function() {
            let store = {};
            return {
                getItem: vi.fn(key => store[key] || null),
                setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
                removeItem: vi.fn(key => { delete store[key]; }),
                clear: vi.fn(() => { store = {}; })
            };
        })();
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });

        // Mock the initial AI greeting
        global.fetch.mockImplementationOnce(() =>
            Promise.resolve(new Response(JSON.stringify({
                response: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?",
                history: [
                    { role: 'user', text: "Start conversation with Hope." },
                    { role: 'model', text: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?" }
                ]
            }), { status: 200 }))
        );
    });

    test('renders chat interface and displays initial AI greeting', async () => {
        render(<App />);

        await waitFor(() => {
            expect(screen.getByText(/Hello, I'm Hope/i)).toBeInTheDocument();
        }, { timeout: 15000 });

        expect(screen.queryByText(/Hope is thinking\.\.\./i)).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('Type your message here...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download chat as pdf/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /start new chat/i })).toBeInTheDocument();
    });

    test('allows user to send a message and Hope responds', async () => {
        render(<App />);

        await waitFor(() => {
            expect(screen.getByText(/Hello, I'm Hope/i)).toBeInTheDocument();
        }, { timeout: 15000 });

        global.fetch.mockImplementationOnce(() =>
            Promise.resolve(new Response(JSON.stringify({
                response: "That sounds incredibly difficult. It's completely understandable to feel overwhelmed right now.",
                history: [
                    { role: 'user', text: "Start conversation with Hope." },
                    { role: 'model', text: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?" },
                    { role: 'user', text: "I'm feeling so sad and anxious." },
                    { role: 'model', text: "That sounds incredibly difficult. It's completely understandable to feel overwhelmed right now." }
                ]
            }), { status: 200 }))
        );

        const userInput = screen.getByPlaceholderText('Type your message here...');
        const sendButton = screen.getByRole('button', { name: /send/i });

        fireEvent.change(userInput, { target: { value: "I'm feeling so sad and anxious." } });
        fireEvent.click(sendButton);

        await waitFor(() => {
            const userMessages = screen.getAllByText((content, element) => {
                return element.textContent.includes("Me: I'm feeling so sad and anxious.") && element.classList.contains('message') && element.classList.contains('user');
            });
            expect(userMessages.length).toBeGreaterThanOrEqual(1);
        }, { timeout: 15000 });

        expect(await screen.findByText(/That sounds incredibly difficult/i, undefined, { timeout: 15000 })).toBeInTheDocument();
        expect(screen.queryByText(/Hope is thinking\.\.\./i)).not.toBeInTheDocument();
        expect(userInput.value).toBe('');
    });

    test('start new chat functionality works', async () => {
        render(<App />);

        await expect(screen.findByText(/Hello, I'm Hope/i, undefined, { timeout: 15000 })).resolves.toBeInTheDocument();

        global.fetch.mockImplementationOnce(() =>
            Promise.resolve(new Response(JSON.stringify({
                response: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?",
                history: [
                    { role: 'user', text: "Start conversation with Hope." },
                    { role: 'model', text: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?" }
                ]
            }), { status: 200 }))
        );

        const startNewChatButton = screen.getByRole('button', { name: /start new chat/i });
        fireEvent.click(startNewChatButton);

        await waitFor(() => {
            expect(localStorage.removeItem).toHaveBeenCalledWith('sessionId');
            expect(localStorage.setItem).toHaveBeenCalledWith('sessionId', expect.any(String));
        }, { timeout: 15000 });
        
        await waitFor(() => {
            const hopeGreetings = screen.getAllByText(/Hello, I'm Hope/i);
            expect(hopeGreetings.length).toBe(1);
        }, { timeout: 15000 });
    });
});
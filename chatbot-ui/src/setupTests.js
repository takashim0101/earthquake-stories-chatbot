// frontend/src/setupTests.js

import '@testing-library/jest-dom/vitest';
import { vi, beforeEach, afterEach } from 'vitest';
import jsPDF from 'jspdf'; // Import jsPDF to mock its prototype methods

// --- Global Mocking ---

// Mock the localStorage object
const localStorageMock = (function() {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// --- Mocks & Spies Setup ---

beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Mock fetch globally
    vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
            response: "Hello, I'm Hope. Thank you for reaching out. How are you feeling today?",
            history: [{ role: 'model', text: "Hello, I'm Hope..." }]
        }),
    });

    // Spy on jsPDF methods used in App.jsx
    vi.spyOn(jsPDF.prototype, 'text').mockImplementation(() => {});
    vi.spyOn(jsPDF.prototype, 'splitTextToSize').mockImplementation((text) => text.split('\n'));
    vi.spyOn(jsPDF.prototype, 'addPage').mockImplementation(() => {});
    vi.spyOn(jsPDF.prototype, 'save').mockImplementation(() => {});

    // You can add other specific mocks here if needed, but this is sufficient for your current App.jsx.
});

afterEach(() => {
    // We already use vi.clearAllMocks in beforeEach, but this can be a good safety net
    // for other tests that don't follow the same pattern.
    vi.clearAllMocks();
});
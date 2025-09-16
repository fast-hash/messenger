// client/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChatPage  from './pages/ChatPage';
import { useState } from 'react';

export default function App() {
    const [user, setUser] = useState(null); // заполняем после логина

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage onLogin={setUser} />} />
                <Route
                    path="/chat/*"
                    element={user ? <ChatPage me={user} /> : <Navigate to="/" replace />}
                />
            </Routes>
        </BrowserRouter>
    );
}

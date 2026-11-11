import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// (no StrictMode: the 3D game is created once and must not be double-initialised)
createRoot(document.getElementById('root')).render(<App />);

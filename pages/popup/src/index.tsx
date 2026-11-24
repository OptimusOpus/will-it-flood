import './index.css';
import Popup from './Popup';
import { createRoot } from 'react-dom/client';

const appContainer = document.getElementById('app-container');
if (!appContainer) throw new Error('Missing popup container.');
createRoot(appContainer).render(<Popup />);

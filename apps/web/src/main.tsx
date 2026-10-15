import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { domAnimation, LazyMotion } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import { persistOptions, queryClient, resumeRestoredMutations } from './lib/queryClient.ts';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // A meal saved while offline and then closed is sent when the app opens again online.
      onSuccess={resumeRestoredMutations}
    >
      {/* Only the DOM animation features are bundled; use `m.*` components, not `motion.*`. */}
      <LazyMotion features={domAnimation} strict>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LazyMotion>
    </PersistQueryClientProvider>
  </StrictMode>,
);

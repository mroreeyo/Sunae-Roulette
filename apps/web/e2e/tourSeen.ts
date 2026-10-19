/**
 * Browser storage of someone who has already finished the first-visit tour, which otherwise
 * covers the page. Tests start from it (playwright.config.ts), and so must contexts they open.
 */
export const tourSeen = {
  cookies: [],
  origins: [
    {
      origin: 'http://localhost:5173',
      localStorage: [{ name: 'lunch-tour', value: JSON.stringify({ state: { done: true }, version: 0 }) }],
    },
  ],
};

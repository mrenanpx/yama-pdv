import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://havkqpgyljqckvykscgu.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdmtxcGd5bGpxY2t2eWtzY2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTU4MjksImV4cCI6MjEwNzk5MTgyOX0.dHYfVXBrOkfYJrmnfmxLphh7PSaAIvkcG32mXjcTWok";

// Fetch customizado com timeout curto para evitar que quedas de internet
// (onde o roteador local continua ligado e navigator.onLine é true) travem o PDV.
const fetchComTimeout: typeof fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isStorage = urlStr.includes('/storage/v1/');
  const timeoutMs = isStorage ? 12000 : 4000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    fetch: fetchComTimeout,
  },
});

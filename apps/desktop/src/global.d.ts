export {};

declare global {
  interface Window {
    tradingApp: {
      version: string;
      invoke: (channel: string, payload?: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
      onRealtimeData: (callback: (data: unknown) => void) => void;
    };
  }
}

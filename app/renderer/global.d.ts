declare global {
  interface Window {
    rnaQueue?: {
      onEvent: (handler: (payload: any) => void) => () => void;
      onPressure: (handler: (payload: any) => void) => () => void;
    };
  }
}
export {};


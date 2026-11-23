export function mockProvider(): Promise<{
  issuer: string;
  refreshExchanges: number;
  exchanges: number;
  issue(url: string, overrides?: Record<string, unknown>): string;
  logoutToken(overrides?: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}>;

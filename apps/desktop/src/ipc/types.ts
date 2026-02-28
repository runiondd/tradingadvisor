export type IpcChannel =
  | "config:get"
  | "config:set"
  | "portfolio:list"
  | "portfolio:importCsv"
  | "portfolio:selectAndImportCsv"
  | "market:quote"
  | "market:history"
  | "recommendation:get"
  | "options:chain"
  | "options:optimize";

export interface IpcRequest {
  channel: IpcChannel;
  payload?: unknown;
}

export interface IpcResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

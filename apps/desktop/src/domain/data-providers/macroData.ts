import type { MacroDataProvider } from "./marketData";
import type { MacroSnapshot } from "./marketDataModels";
import { getProviderConfig } from "@config/providers";

export class FredMacroDataProvider implements MacroDataProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getProviderConfig().macro;

    if (!cfg || cfg.type !== "fred") {
      throw new Error("Macro provider configuration is missing or invalid");
    }

    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://api.stlouisfed.org/fred/series/observations";
  }

  async getMacroSnapshot(seriesIds: string[]): Promise<MacroSnapshot> {
    const series = await Promise.all(
      seriesIds.map(async (id) => {
        const url = new URL(this.baseUrl);
        url.searchParams.set("series_id", id);
        url.searchParams.set("api_key", this.apiKey);
        url.searchParams.set("file_type", "json");

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`FRED error: ${response.status}`);
        }

        const data = (await response.json()) as {
          observations: { date: string; value: string }[];
        };

        return {
          id,
          name: id,
          description: undefined,
          frequency: "monthly",
          points: data.observations
            .filter((o) => o.value !== ".")
            .map((o) => ({
              date: o.date,
              value: Number(o.value)
            }))
        };
      })
    );

    return {
      series,
      asOf: new Date().toISOString()
    };
  }
}


import { Injectable } from "@nestjs/common";
import { MarketingApiConnector, MockMetaConnector, McpMetaConnector, type MetaConnector } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { loadConfig } from "../core/config";

/**
 * Chooses the Meta connector implementation by META_MODE.
 * - mock: fully offline dev connector
 * - marketing-api: real Graph API
 * - mcp: bridge to a Meta Ads MCP server (transport must be wired at deploy time)
 */
@Injectable()
export class MetaConnectorFactory {
  private cached: MetaConnector | null = null;

  get(): MetaConnector {
    if (this.cached) return this.cached;
    const cfg = loadConfig();
    switch (cfg.META_MODE) {
      case "mock":
        this.cached = new MockMetaConnector();
        break;
      case "marketing-api":
        this.cached = new MarketingApiConnector({
          graphVersion: cfg.META_GRAPH_VERSION,
          appId: cfg.META_APP_ID,
          appSecret: cfg.META_APP_SECRET,
        });
        break;
      case "mcp":
        // The MCP transport is deployment-specific. Until one is wired, calls fail loudly.
        this.cached = new McpMetaConnector({
          callTool: () => {
            throw AppException.badRequest(
              "טרנספורט MCP אינו מוגדר בפריסה זו. עברו ל-META_MODE=marketing-api או mock.",
              "MCP_NOT_CONFIGURED",
            );
          },
        });
        break;
    }
    return this.cached!;
  }

  /** For the OAuth flow we always need the Graph implementation's token helpers. */
  marketingApi(): MarketingApiConnector {
    const cfg = loadConfig();
    return new MarketingApiConnector({
      graphVersion: cfg.META_GRAPH_VERSION,
      appId: cfg.META_APP_ID,
      appSecret: cfg.META_APP_SECRET,
    });
  }
}

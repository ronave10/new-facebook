# Meta Ads MCP — Tool Map

Mapped from the `facebook` MCP server discovered in the development environment (91 tools).
The `McpMetaConnector` (packages/meta/src/connectors/mcp.ts) bridges our `MetaConnector`
interface to these tools. Policy: **read tools are freely callable; write tools require an
approved `Approval` record** — enforced in `MetaMcpService`/`MetaCallLogger` at the API layer,
and every call is logged to `meta_api_call_logs`.

## Read tools (allowlisted)

| Category | Tools |
|---|---|
| Accounts & identity | `ads_get_ad_accounts`, `ads_get_ad_account_pages`, `ads_get_user_pages`, `ads_get_pages_for_business`, `ads_get_ig_accounts`, `ads_get_ig_media` |
| Entities | `ads_get_ad_entities`, `ads_get_creatives`, `ads_get_creative_ads`, `ads_get_ad_images`, `ads_get_ad_videos`, `ads_get_field_context`, `ads_get_ad_preview` |
| Insights & diagnostics | `ads_insights_performance_trend`, `ads_insights_anomaly_signal`, `ads_insights_auction_ranking_benchmarks`, `ads_insights_industry_benchmark`, `ads_insights_advertiser_context`, `ads_get_opportunity_score`, `ads_get_errors`, `ads_account_get_activity_logs`, `ads_get_help_article` |
| Audiences | `ads_get_ad_account_custom_audiences`, `ads_get_custom_audience`, `ads_get_custom_audience_adsets` |
| Pixels / datasets | `ads_pixel_event_read`, `ads_pixel_parameter_read`, `ads_get_datasets`, `ads_get_dataset_details`, `ads_get_dataset_quality`, `ads_get_dataset_stats`, `ads_get_customconversions` |
| Catalog | `ads_catalog_get_catalogs`, `ads_catalog_get_details`, `ads_catalog_get_diagnostics`, `ads_catalog_get_dynamic_ads_health`, `ads_catalog_search_product`, `ads_catalog_get_product_details`, `ads_catalog_get_product_sets`, `ads_catalog_get_product_set_details`, `ads_catalog_get_product_set_products`, `ads_catalog_get_product_product_sets`, `ads_catalog_get_feed_rules`, `ads_catalog_get_data_sources`, `ads_catalog_get_product_feed_details`, `ads_catalog_get_product_feed_upload_sessions` |
| Experiments | `ads_experiment_check_eligibility`, `ads_experiment_list_tests`, `ads_experiment_abtest_get_test`, `ads_experiment_lift_get_test` |
| Ad library (research) | `ads_library_search` |

## Write tools (require Approval; NEVER auto-invoked)

| Category | Tools | Notes |
|---|---|---|
| Campaign creation | `ads_create_campaign`, `ads_create_ad_set`, `ads_create_creative`, `ads_create_ad` | Created **PAUSED** by design |
| Going live | `ads_activate_entity` | The only path to ACTIVE — gated by consumed Approval |
| Mutations | `ads_update_entity`, `ads_boost_ig_post` | Status/budget changes — extra confirmation |
| Audiences | `ads_create_custom_audience`, `ads_update_custom_audience`, `ads_update_custom_audience_users`, `ads_delete_custom_audience` | |
| Pixels | `ads_pixel_event_create/update/delete`, `ads_pixel_parameter_create/update/delete` | |
| Catalog | `ads_catalog_create*`, `ads_catalog_update*`, `ads_catalog_delete_product` | Delete is irreversible — double confirmation |
| Experiments | `ads_experiment_abtest_create_test`, `ads_experiment_abtest_update_test`, `ads_experiment_lift_create_test` | |

## MetaConnector → MCP mapping (core methods)

| MetaConnector method | MCP tool |
|---|---|
| `listAdAccounts` | `ads_get_ad_accounts` |
| `listPages` | `ads_get_ad_account_pages` |
| `listIgAccounts` | `ads_get_ig_accounts` |
| `listCampaigns` / `listAdSets` / `listAds` | `ads_get_ad_entities` |
| `listCreatives` | `ads_get_creatives` |
| `getInsights` | `ads_insights_performance_trend` |
| `createCampaign` | `ads_create_campaign` |
| `createAdSet` | `ads_create_ad_set` |
| `createCreative` | `ads_create_creative` |
| `createAd` | `ads_create_ad` |
| `activateEntity` | `ads_activate_entity` |
| `pauseEntity` | `ads_update_entity` (status=PAUSED) |

## Tenant-safety rules for MCP usage

1. The MCP transport is initialized **per connection** with that tenant's credentials — a tool
   call can never see another tenant's ad account.
2. Tool allowlist enforced in code: unknown/write tools rejected unless the call carries an
   `approvalId` referencing an APPROVED, unconsumed `Approval`.
3. Every call → `meta_api_call_logs` (operation, isWrite, duration, success, approvalId).
4. Fallback: when no MCP transport is configured, `MetaConnectorFactory` falls back to
   `MarketingApiConnector` (direct Graph API) — same interface, same safety gates.

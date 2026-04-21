# Super Search

Custom Service Portal search experience for ServiceNow. The app replaces a single-source search box with a multi-source search flow that aggregates:

- Knowledge articles
- Catalog items and record producers
- News articles
- Users
- Topics

The implementation is intentionally widget-driven and does not depend on AI Search or a custom indexing pipeline. Search is executed at request time through a scoped script include that queries multiple tables, scores results in memory, and returns a normalized result model to the portal widgets.

## Goals

- Give users one search entry point from the portal front page.
- Search across multiple ServiceNow content types with one consistent result card design.
- Keep portal visibility aligned with portal taxonomy and Service Portal visibility settings.
- Support filtering by result type on the results page.
- Publish search and click analytics to `GlideSPSearchAnalytics`.

## Main Components

### 1. `superSearchEngine` script include

This is the core of the application. It is responsible for:

- Normalizing and tokenizing the query
- Expanding the query with synonym sets
- Building per-table search passes
- Fetching candidates from multiple tables
- Applying portal-aware visibility filters
- Scoring and sorting results
- Shaping results into a UI-friendly DTO
- Producing filter counts and paginated output

Public entry point:

- `searchKnowledge(options)`

Despite the method name, it searches more than knowledge.

### 2. Homepage search widget

Purpose:

- Render the search box on a landing page or header
- Collect the raw query
- Redirect the user to the results page with `?id=<results_page_id>&q=<query>`

Notable behavior:

- Optional compact mode for header/nav usage
- Animated placeholder typing effect
- No server-side search happens here

### 3. Results widget

Purpose:

- Execute search requests through the script include
- Render the filter sidebar, result cards, and pager
- Perform client-side paging/filtering across the already returned result set
- Publish analytics for search impressions and clicks

### 4. Analytics bridge

Purpose:

- Convert widget analytics payloads into `GlideSPSearchAnalytics` payloads
- Publish search events
- Publish click events
- Backfill `click_rank` on `sys_search_event` when widget click tracking does not do it reliably

Important:

- This file is stored in `global_reference`, not under the scoped app export tree.
- Treat it as a companion dependency that must exist in the target instance global scope.

## Runtime Architecture

```text
[Homepage Widget]
    |
    | redirect with q
    v
[Search Results Page]
    |
    | c.server.get({ query, page, resultFilter })
    v
[Searchresults Server Script]
    |
    | new x_1122545_super_0.superSearchEngine().searchKnowledge(...)
    v
[superSearchEngine]
    |
    | query multiple tables + score + shape
    v
[Searchresults Client/Template]
    |
    | render cards, filters, pagination
    | publish search/click analytics
    v
[SuperSearchAnalyticsBridge]
    |
    v
[GlideSPSearchAnalytics / sys_search_event]
```

## End-to-End Flow

### Homepage flow

1. User enters a query in `Supersearchwidget`.
2. Client controller normalizes whitespace.
3. Widget redirects to the configured results page:

```text
?id=search_results&q=<query>
```

### Results page flow

1. `Searchresults` server script reads URL params and widget options.
2. On initial page load without widget `input`, it builds an empty shell state and sets `deferInitialQuery = true`.
3. `Searchresults` client controller detects this and immediately calls the server with the query.
4. Server script calls `superSearchEngine.searchKnowledge(...)`.
5. Script include returns:
   - `allResults`
   - paged `results`
   - filter counts
   - paging metadata
   - query display metadata
6. Client stores the response and performs filter/paging changes locally without requerying the server.
7. Search analytics are published once per executed query.
8. Click analytics are published just before browser navigation to the result URL.

## Search Sources

The engine searches the following tables:

| Result type | Table | Notes |
| --- | --- | --- |
| `knowledge` | `kb_knowledge` | Active, published knowledge articles |
| `catalog_item` | `sc_cat_item` | Includes regular catalog items and record producers |
| `news` | `sn_cd_content_base` | Filtered by configured content type |
| `sys_user` | `sys_user` | Active users |
| `topic` | `topic` | Filtered by current portal taxonomy |

## Search Strategy

### Query normalization

The engine:

- trims leading/trailing whitespace
- collapses repeated whitespace
- lowercases normalized values for matching and scoring
- tokenizes the query for overlap scoring and fallback matching

### Synonym expansion

Synonyms come from `ts_synonym_set`.

Behavior:

- If `synonym_dictionary_id` is configured, only that set is used.
- Otherwise all active synonym sets are eligible.
- A matching synonym set contributes additional search terms.
- Synonym-derived hits are scored lower than direct query matches.

### Per-table pass definitions

The engine does not issue one broad encoded query. It builds ordered search passes per content type and stops when it has enough candidates.

Examples:

- Knowledge:
  - `number`
  - `short_description`
  - `meta`
  - `keywords`
  - optionally `text`
- Catalog:
  - `name`
  - `short_description`
  - `meta`
  - optionally `description`
- News:
  - `title`
- Users:
  - `name`
  - `title`
  - `department.name`
  - `user_name`
  - `email`
- Topics:
  - `name`
  - optionally `description`

Operators vary by field:

- exact match: `=`
- prefix match: `STARTSWITH`
- broad match: `CONTAINS`

### Candidate limits per source

The global candidate limit is split per result type before scoring:

- Knowledge: about 50%
- Catalog: about 30%
- News: about 25%
- Users: about 35%
- Topics: about 25%

These are independent ceilings before all candidates are merged and scored.

### Fallback logic

Two sources have additional fallback logic if direct passes produce no candidates:

- Knowledge:
  - probes `short_description`
  - requires token overlap above a threshold
- News:
  - probes `title`
  - filters out weak matches using token overlap and stop-word handling
  - fallback hits receive a score penalty

### Short-query optimization

Very short queries can explode broad `CONTAINS` matching. The widget supports a short-query profile controlled by:

- `short_query_length`
- `short_query_candidate_limit`
- `short_query_result_limit`

When a query length is at or below the threshold:

- body search is disabled
- candidate fetch count is reduced
- exposed result count is capped

This is useful for short internal abbreviations such as `HR`.

## Base Visibility Filters

The engine applies source-specific base filters before any scoring.

### Knowledge

- `active = true` when available
- `workflow_state = published`
- `published <= today`
- `valid_to` is empty or in the future

### Catalog

- `active = true`
- `hidden_sp = false`
- `visible_sp = true`
- the current user must be able to view the item through the catalog search access check

Catalog records are queried with `GlideRecord`, not `GlideRecordSecure`.

Reason:

- the implementation wants portal search to follow portal/service catalog visibility behavior rather than raw ACL behavior on `sc_cat_item`
- catalog and record producer user criteria, such as Available For and Not Available For, are enforced with the Service Catalog API before results are returned

### News

- `active = true`
- `content_type = <configured news content type sys_id>`

### Users

- `active = true`

### Topics

- `active = true`
- topic taxonomy must belong to the current portal
- optional exclusion of one configured featured topic subtree

Topics are queried with `GlideRecord`, not `GlideRecordSecure`, for the same reason as catalog visibility: the search is aligned to portal taxonomy configuration rather than direct table ACL interpretation.

## Portal-Aware Behavior

Two implementation details are easy to miss but important:

### Portal taxonomy drives topic visibility

The engine reads `m2m_sp_portal_taxonomy` for the active portal and only returns topics in those taxonomies.

### Catalog items must be connected to visible topics

Catalog candidates are post-filtered through `m2m_connected_content`.

Only catalog items connected to topics in the current portal taxonomy are kept. This prevents the widget from showing arbitrary catalog items that are technically searchable but not connected into the portal’s navigational model.

### Catalog user criteria is enforced server-side

Catalog candidates are also checked with `sn_sc.CatItem(...).canViewOnSearch(false)` before they are returned to the result widget.

This keeps inaccessible record producers and catalog items out of both the visible result cards and the `allResults` payload used for paging, filters, and analytics.

## Ranking and Sorting

After candidate collection, all result types are merged and scored in memory.

### Score inputs

Each candidate is scored against:

- title
- metadata
- body text
- synonyms

Current scoring bias:

- Title exact/prefix/contains carries the strongest weight
- Metadata is secondary
- Body text is lowest weight
- Synonym matches score below direct matches
- Fallback news matches receive a penalty

### Type priority

Sorting is not score-only. Result type priority is applied before score:

1. `catalog_item`
2. `knowledge`
3. `news`
4. `topic`
5. `sys_user`

Implication:

- A lower-scoring catalog item can still rank above a higher-scoring knowledge article because type priority is considered first.

Tie-breakers after type priority:

- score descending
- `updatedOn` descending
- title ascending

## Result Model Returned to the Widget

The script include shapes raw records into a normalized object used by the UI:

- `sysId`
- `resultType`
- `resultTypeLabel`
- `title`
- `titleHtml`
- `snippet`
- `snippetHtml`
- `number`
- `kbName`
- `catalogName`
- `employeeTitle`
- `departmentName`
- `categoryName`
- `language`
- `updatedOnDisplay`
- `url`
- type booleans such as `isRequestItem`, `isNewsItem`, `isUser`, `isTopic`

This keeps the Angular template simple and avoids table-specific branching in the UI.

## Filtering Model

The results widget supports these filter ids:

- `all`
- `knowledge_total`
- `featured_kb`
- `knowledge_articles`
- `news`
- `catalog_item`
- `sys_user`
- `topic`

Notes:

- `knowledge_total` is the superset of all knowledge hits.
- `featured_kb` is a subset of knowledge based on a configured knowledge base sys_id.
- `knowledge_articles` is knowledge excluding `featured_kb`.

The widget computes paging and filtering locally from `allResults`. Changing page or filter does not trigger a new server-side search.

## Localization

### Current behavior

- UI labels in templates and server-side defaults are mostly hardcoded in Norwegian.
- Query execution itself is not language-aware per source; there is no global filter such as “only return records in the user’s language”.

### Catalog and record producer display values

Catalog result cards now prefer `getDisplayValue(field)` for:

- `name`
- `description`
- `short_description`
- `meta`

This allows translated catalog items and record producers to display in the user’s language when translations exist, while still falling back to the raw value if needed.

Important distinction:

- Display language on the card is localized
- Search matching still depends on the queried source fields and platform behavior; that is a different concern than result rendering

## Analytics

The `Searchresults` widget publishes two analytics streams:

### Search impression event

Triggered after the server returns a search response.

Payload includes:

- normalized query
- portal id
- page id
- page size
- whether results were returned
- top results with `sysId` and `resultType`

### Click event

Triggered when a user clicks a result card or title link.

Payload includes:

- query
- portal id
- page id
- click rank
- browser info
- clicked record sys_id and result type
- the visible result list used for ranking context

The global `SuperSearchAnalyticsBridge` maps result types to source tables and publishes them through `GlideSPSearchAnalytics`. It also updates the latest matching `sys_search_event` row so `click_rank` remains usable in downstream reporting.

## Configuration

### Homepage widget options

| Option | Purpose |
| --- | --- |
| `results_page_id` | Target portal page id for results |
| `input_placeholder` | Typing-placeholder text |
| `button_label` | Search button label |
| `compact_mode` | Compact layout without greeting |

### Results widget options

| Option | Purpose |
| --- | --- |
| `page_size` | Results per page |
| `candidate_limit` | Max number of candidates gathered before scoring |
| `include_body_search` | Enables low-weight body/description/text search |
| `short_query_length` | Threshold for short-query optimization |
| `short_query_candidate_limit` | Candidate ceiling for short queries |
| `short_query_result_limit` | Max returned results for short queries |
| `article_page_id` | Target page for knowledge records |
| `catalog_item_page_id` | Target page for catalog items / record producers |
| `news_page_id` | Target page for news records |
| `news_content_type_id` | News content type filter |
| `portal_sys_id` | Explicit portal override |
| `synonym_dictionary_id` | Optional synonym set restriction |
| `featured_knowledge_base_id` | KB sys_id for featured KB filter |
| `featured_knowledge_base_label` | Label for featured KB filter |
| `featured_topic_id` | Topic subtree to exclude from topic results |

### Instance-level overrides

The deployed widget instance contains option overrides. In the current snapshot most values are left empty, so runtime defaults from the option schema and server script apply.

## Key Records by Responsibility

### Search engine

- Script include: `superSearchEngine`

### Homepage widget

- Widget: `Super search widget`
- Contains: server script, client controller, template, and styling

### Results widget

- Widget: `Search results`
- Contains: server script, client controller, template, and styling

### Companion global dependency

- Global script include: `SuperSearchAnalyticsBridge`

## Known Design Decisions and Limitations

### 1. Result type priority is opinionated

Catalog items always sort ahead of knowledge, news, topics, and users. That is a business rule embedded in `_getResultTypePriority`, not an emergent behavior.

### 2. Labels are largely Norwegian

Widget templates, filter labels, and some result type labels are hardcoded in Norwegian. If the portal needs full multilingual UI labels, those strings should be externalized.

### 3. Search is live-query based

This solution queries source tables at runtime. It is simple and transparent, but it is not optimized for very large datasets in the way a dedicated indexing/search service would be.

### 4. Initial results page search is deferred to the client

The first render builds shell state and then issues the actual search via `c.server.get(...)`. This keeps the widget behavior explicit but means the initial page render does not contain precomputed search results.

### 5. Global dependency is outside app scope

`SuperSearchAnalyticsBridge` is stored in `global_reference`, so deployment needs to account for that separately if the scoped app is moved between instances.

### 6. Search matching and display localization are different problems

The app now displays translated catalog values using display values where available, but query matching still follows the underlying source field search logic.

## Extension Guidance

If a future developer needs to change behavior, these are the main extension points:

### Add another result source

Typical work:

1. Add table constant and context field map
2. Add candidate collection function
3. Add base filters
4. Add `_store...Candidate`
5. Add scoring metadata as needed
6. Add icon and `resultTypeLabel`
7. Add filter summary support if user-visible filtering is required
8. Update analytics result-type-to-table mapping in `SuperSearchAnalyticsBridge`

### Change ranking

Primary places:

- `_calculateScore`
- `_getResultTypePriority`
- `_compareCandidates`

### Change portal visibility rules

Primary places:

- `_applyCatalogBaseFilters`
- `_applyTopicBaseFilters`
- `_getConnectedCatalogItemIdMap`
- `_getPortalTaxonomyIds`

### Change displayed fields

Primary places:

- `_storeKnowledgeCandidate`
- `_storeCatalogCandidate`
- `_storeNewsCandidate`
- `_storeUserCandidate`
- `_storeTopicCandidate`
- `_shapeResults`
- the `Search results` widget template

## Suggested Onboarding Path for the Next Developer

If you are new to this app, read in this order:

1. This document
2. Script include `superSearchEngine`
3. Widget `Search results`
4. Widget `Super search widget`
5. Global script include `SuperSearchAnalyticsBridge`

That order mirrors the runtime request flow and will get you productive fastest.

## Current Snapshot Notes

- Scope name: `x_1122545_super_0`
- Core script include: `superSearchEngine`
- Widgets:
  - `Super search widget`
  - `Search results`
- Referenced page id:
  - `search_results`

## No Automated Test Harness in Repo

This repository snapshot does not contain automated unit tests or ATF coverage for the search engine. Validation is currently manual through widget preview URLs and portal pages.

If this app becomes long-lived, the most valuable test targets would be:

- query normalization
- synonym expansion
- candidate filtering
- ranking order
- portal taxonomy gating
- featured KB counts
- localization of catalog display values

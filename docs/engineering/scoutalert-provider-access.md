# Supported discovery access

Checked 15 October 2026. This describes access available to ScoutAlert, the remaining provider applications, and the evidence needed before enabling another integration.

## Current coverage

| Source              | Available now                                                                | Remaining limitation                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Public PDFs         | Permitted HTTPS download and local text extraction, including observed links | Scans require OCR; password protection and parser limits remain explicit incomplete captures                             |
| Bluesky             | Official public API reads of exact observed post permalinks                  | The unauthenticated search probe returned 403; discovery uses indexed URLs. Replies, quotes and images remain incomplete |
| X                   | Existing authenticated native search integration                             | Both bounded live queries returned zero posts; connectivity does not establish useful demand                             |
| Upwork              | Clear approved-access requirement before any website request                 | No approved commercial integration; ordinary keys do not grant this use                                                  |
| Guru                | Search-index discovery; public access only when permitted                    | Live robots request returned 403; marketplace API/feed capabilities and permission are unconfirmed                       |
| Facebook / LinkedIn | Indexed observations retained as unverified leads                            | No approved read integration; blocked source content cannot support recommendations                                      |

## What to obtain

### Upwork

Start by asking Upwork whether it will authorize ScoutAlert's **commercial opportunity discovery and alerts**. The standard API program is limited to personal/internal use. Its published eligibility includes verified identity/payment, an authentic profile, good standing, $25,000 combined lifetime earnings/spend and, for freelancers/agencies, at least 90% JSS. An ordinary application must explain its purpose and comply with the stated request limit. A key alone would not authorize this product. [Current application requirements](https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork).

If Upwork grants the intended use, request the GraphQL **Read marketplace Job Postings** scope and OAuth client credentials for `marketplaceJobPostingsSearch`. Record approved storage/display limits and callback URLs before implementation. [GraphQL documentation](https://www.upwork.com/developer/documentation/graphql/api/docs/index.html). The old RSS route is not an alternative: it was discontinued in 2024. [RSS deprecation](https://support.upwork.com/hc/en-us/articles/52052528243731-RSS-deprecation).

### Guru

Ask Guru support for its current API documentation and explicit permission to search/read public buyer projects for commercial alerts, including authentication, quotas and retention/display terms. Guru advertises API access for agency solutions, but that does **not** establish a supported marketplace-search endpoint. No verified contract was available during this check. [Guru agency features](https://www.guru.com/agency-features/). Documentation for the separate GetGuru knowledge-management product does not apply.

### Facebook

Create a Meta developer app and check whether its current review dashboard offers the required Pages public-content access for this use. Describe exactly which public Pages and fields ScoutAlert would read. Prepare a working demonstration, privacy/data-deletion information and any business-verification evidence the dashboard requests. The exact current requirements could not be confirmed because the documentation returned HTTP 429. [Page Public Content Access reference](https://developers.facebook.com/docs/features-reference/page-public-content-access/).

Meta's official historical announcement describes app review for this feature. It does not establish that ScoutAlert will be approved today or grant general search of personal posts, groups or private content. Treat these as separate capabilities requiring explicit confirmation. [Meta platform announcement](https://about.fb.com/news/2018/07/a-platform-update/).

### LinkedIn

For authorized company-Page management, create a developer application associated with a company Page and apply for Community Management Development Tier. Standard Tier requires an additional application and demonstration. This program is not documented as a general search API for everybody's public posts. LinkedIn currently says `r_member_social` is closed and new requests are not accepted. Broad member-post discovery therefore remains unavailable through this route. [Community Management access and limits](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-03).

## Application preparation

Prepare a short product description, the exact read-only operations needed, examples of what users see, expected request volume, privacy/retention/deletion handling, company/domain details and OAuth callback URLs. Describe ScoutAlert accurately as a commercial discovery product. Ask each provider to confirm permitted searching, storing, matching, displaying and alerting separately; access to account management does not imply access to marketplace or platform-wide search.

Once access is approved, configure credentials locally through the project's configuration process. Preserve the approval scope and documentation alongside the integration design. No applications or support messages were submitted during this work, and no credentials need to be pasted into chat.

## Verification status

The model provider returned `credit_balance_exhausted`. At the user's direction, subsequent live checks disabled all model stages. Public capture and deterministic pipeline checks passed, but fresh AI source review, private fit assessment and recommendation quality remain blocked. See the [recorded supported-access checks](../../evaluations/discovery/README.md#supported-access-and-model-outage--15-october).

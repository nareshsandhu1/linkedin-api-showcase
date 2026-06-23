/**
 * Per-endpoint defaults for the "Try it" inline editor.
 *
 * Keyed by `${METHOD} ${path}` matching lib/scope-catalog.js entries.
 * `tryUrl`  — a fully-formed URL containing the required query params /
 *             finder values from LinkedIn's docs, with realistic
 *             placeholder values you can edit before sending.
 * `tryBody` — a JSON body with the required fields for POST/PUT requests.
 *
 * References:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/
 *   https://learn.microsoft.com/en-us/linkedin/compliance/
 *   https://learn.microsoft.com/en-us/linkedin/consumer/
 *
 * Sample URNs/IDs are illustrative — replace with values from your account.
 */
const SAMPLE_ORG = 'urn:li:organization:2414183';
const SAMPLE_PERSON = 'urn:li:person:782bbtaQ';
const SAMPLE_AD_ACCOUNT = 'urn:li:sponsoredAccount:506336348';
const SAMPLE_CAMPAIGN_GROUP = 'urn:li:sponsoredCampaignGroup:600000001';
const SAMPLE_SHARE = 'urn:li:share:6855705995027808256';

module.exports = {
  // --- OpenID / Profile ---
  'GET https://api.linkedin.com/v2/userinfo': {},
  'GET https://api.linkedin.com/v2/me': {},
  'GET https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))': {},

  // --- Member-level posting ---
  'POST https://api.linkedin.com/rest/posts': {
    tryBody: {
      author: SAMPLE_PERSON,
      commentary: 'Hello world from the LinkedIn API Showcase!',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  },
  'POST https://api.linkedin.com/v2/ugcPosts': {
    tryBody: {
      author: SAMPLE_PERSON,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: 'Hello world!' },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
  },

  // --- Social actions ---
  'POST https://api.linkedin.com/rest/socialActions/{urn}/comments': {
    tryUrl: `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(SAMPLE_SHARE)}/comments`,
    tryBody: {
      actor: SAMPLE_PERSON,
      message: { text: 'Great post!' },
    },
  },
  'GET https://api.linkedin.com/rest/socialActions/{urn}/comments': {
    tryUrl: `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(SAMPLE_SHARE)}/comments`,
  },
  'POST https://api.linkedin.com/rest/reactions': {
    tryUrl: `https://api.linkedin.com/rest/reactions?actor=${encodeURIComponent(SAMPLE_PERSON)}`,
    tryBody: {
      root: SAMPLE_SHARE,
      reactionType: 'LIKE',
    },
  },
  'GET https://api.linkedin.com/rest/reactions': {
    tryUrl: `https://api.linkedin.com/rest/reactions?q=entity&entity=${encodeURIComponent(SAMPLE_SHARE)}`,
  },

  // --- Organization / Community Management ---
  'GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee': {
    tryUrl: 'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
  },
  'POST https://api.linkedin.com/rest/organizations': {
    tryBody: {
      vanityName: 'example-co',
      localizedName: 'Example Co.',
      name: { localized: { en_US: 'Example Co.' }, preferredLocale: { country: 'US', language: 'en' } },
    },
  },
  'GET https://api.linkedin.com/rest/organizationalEntityFollowerStatistics': {
    tryUrl: `https://api.linkedin.com/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(SAMPLE_ORG)}`,
  },
  'GET https://api.linkedin.com/rest/posts?q=author&author={orgUrn}': {
    tryUrl: `https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(SAMPLE_ORG)}&count=10`,
  },

  // --- Member Analytics ---
  'GET https://api.linkedin.com/rest/memberPostAnalytics': {
    tryUrl: `https://api.linkedin.com/rest/memberPostAnalytics?q=memberAndTimeRange&author=${encodeURIComponent(SAMPLE_PERSON)}&timeRange.start=1704067200000&timeRange.end=1706745600000`,
  },
  'GET https://api.linkedin.com/rest/memberProfileAnalytics': {
    tryUrl: `https://api.linkedin.com/rest/memberProfileAnalytics?q=memberAndTimeRange&member=${encodeURIComponent(SAMPLE_PERSON)}&timeRange.start=1704067200000&timeRange.end=1706745600000`,
  },

  // --- Ads & Reporting API ---
  'GET https://api.linkedin.com/rest/adAccounts': {
    tryUrl: 'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))',
  },
  'POST https://api.linkedin.com/rest/adCampaigns': {
    tryBody: {
      account: SAMPLE_AD_ACCOUNT,
      campaignGroup: SAMPLE_CAMPAIGN_GROUP,
      name: 'Showcase Test Campaign',
      type: 'SPONSORED_UPDATES',
      status: 'DRAFT',
      costType: 'CPM',
      dailyBudget: { amount: '50', currencyCode: 'USD' },
      unitCost: { amount: '8', currencyCode: 'USD' },
      locale: { country: 'US', language: 'en' },
      runSchedule: { start: 1735689600000 },
      objectiveType: 'BRAND_AWARENESS',
      targetingCriteria: {
        include: {
          and: [
            { or: { 'urn:li:adTargetingFacet:locations': ['urn:li:geo:103644278'] } },
          ],
        },
      },
    },
  },
  'POST https://api.linkedin.com/rest/creatives': {
    tryBody: {
      campaign: 'urn:li:sponsoredCampaign:700000001',
      content: {
        reference: 'urn:li:ugcPost:7000000000000000000',
      },
      intendedStatus: 'DRAFT',
    },
  },
  'GET https://api.linkedin.com/rest/adAnalytics?q=analytics': {
    tryUrl:
      'https://api.linkedin.com/rest/adAnalytics?q=analytics' +
      '&pivot=ACCOUNT' +
      '&dateRange=(start:(year:2025,month:1,day:1),end:(year:2025,month:1,day:31))' +
      '&timeGranularity=ALL' +
      `&accounts=List(${encodeURIComponent(SAMPLE_AD_ACCOUNT)})` +
      '&fields=impressions,clicks,costInLocalCurrency,externalWebsiteConversions',
    paramSchema: {
      baseUrl: 'https://api.linkedin.com/rest/adAnalytics',
      description:
        'Build an Ad Analytics query. Pick a pivot, a date range, the entities you want to report on, and the metrics to return.',
      fields: [
        {
          key: 'q',
          label: 'Query type (q)',
          type: 'select',
          required: true,
          options: ['analytics', 'statistics', 'analyticsV2'],
          default: 'analytics',
        },
        {
          key: 'pivot',
          label: 'Pivot',
          type: 'select',
          required: true,
          default: 'ACCOUNT',
          options: [
            'ACCOUNT',
            'CAMPAIGN_GROUP',
            'CAMPAIGN',
            'CREATIVE',
            'COMPANY',
            'CONVERSION',
            'CONVERSATION_NODE',
            'IMPRESSION_DEVICE_TYPE',
            'MEMBER_COMPANY_SIZE',
            'MEMBER_INDUSTRY',
            'MEMBER_SENIORITY',
            'MEMBER_JOB_TITLE',
            'MEMBER_JOB_FUNCTION',
            'MEMBER_COUNTRY_V2',
            'MEMBER_REGION_V2',
            'OBJECTIVE_TYPE',
            'PLACEMENT_NAME',
            'SERVING_LOCATION',
          ],
        },
        {
          key: 'timeGranularity',
          label: 'Time granularity',
          type: 'select',
          required: true,
          options: ['ALL', 'DAILY', 'MONTHLY', 'YEARLY'],
          default: 'ALL',
        },
        {
          key: 'dateRange',
          label: 'Date range',
          type: 'dateRange',
          required: true,
          defaults: { start: '2025-01-01', end: '2025-01-31' },
        },
        {
          key: 'accounts',
          label: 'Ad account URNs',
          type: 'urnList',
          default: SAMPLE_AD_ACCOUNT,
          hint: 'Comma- or newline-separated. Use when pivot = ACCOUNT.',
        },
        {
          key: 'campaigns',
          label: 'Campaign URNs (optional)',
          type: 'urnList',
          default: '',
          hint: 'Use when pivot = CAMPAIGN. e.g. urn:li:sponsoredCampaign:700000001',
        },
        {
          key: 'campaignGroups',
          label: 'Campaign group URNs (optional)',
          type: 'urnList',
          default: '',
          hint: 'Use when pivot = CAMPAIGN_GROUP.',
        },
        {
          key: 'creatives',
          label: 'Creative URNs (optional)',
          type: 'urnList',
          default: '',
          hint: 'Use when pivot = CREATIVE.',
        },
        {
          key: 'fields',
          label: 'Fields (metrics to return)',
          type: 'checkboxes',
          defaults: [
            'impressions',
            'clicks',
            'costInLocalCurrency',
            'externalWebsiteConversions',
          ],
          options: [
            'impressions',
            'clicks',
            'costInLocalCurrency',
            'costInUsd',
            'externalWebsiteConversions',
            'externalWebsitePostClickConversions',
            'externalWebsitePostViewConversions',
            'oneClickLeads',
            'leadGenerationMailContactInfoShares',
            'leadGenerationMailInterestedClicks',
            'videoViews',
            'videoCompletions',
            'videoFirstQuartileCompletions',
            'videoMidpointCompletions',
            'videoThirdQuartileCompletions',
            'reactions',
            'comments',
            'shares',
            'follows',
            'landingPageClicks',
            'companyPageClicks',
            'opens',
            'sends',
            'totalEngagements',
            'approximateUniqueImpressions',
            'cardClicks',
            'cardImpressions',
            'dateRange',
            'pivotValues',
          ],
        },
      ],
    },
  },
  'GET https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0': {},

  // --- Company Intelligence (Account Intelligence) ---
  'GET https://api.linkedin.com/rest/accountIntelligence?q=account': {
    paramSchema: {
      baseUrl: 'https://api.linkedin.com/rest/accountIntelligence',
      description:
        'Retrieve company (target account)-level paid & organic engagement for a Sponsored Ad Account. Pick the account and paging, then narrow the results with the filterCriteria fields (lookback window, ad segments, campaign).',
      fields: [
        {
          key: 'q',
          label: 'Query type (q)',
          type: 'select',
          required: true,
          options: ['account'],
          default: 'account',
        },
        {
          key: 'account',
          label: 'Ad account URN',
          type: 'text',
          required: true,
          default: SAMPLE_AD_ACCOUNT,
          hint: 'urn:li:sponsoredAccount:123 — you must have a VIEWER or higher role on this ad account.',
        },
        {
          key: 'start',
          label: 'Start (pagination offset)',
          type: 'number',
          default: 0,
          min: 0,
        },
        {
          key: 'count',
          label: 'Count (page size, max 1000)',
          type: 'number',
          default: 10,
          min: 1,
          max: 1000,
        },
        {
          key: 'lookbackWindow',
          label: 'Lookback window',
          type: 'select',
          group: 'filterCriteria',
          default: 'LAST_90_DAYS',
          options: [
            'LAST_7_DAYS',
            'LAST_30_DAYS',
            'LAST_60_DAYS',
            'LAST_90_DAYS',
            'LAST_180_DAYS',
            'LAST_365_DAYS',
          ],
          hint: 'Part of filterCriteria. Defaults to 90 days if omitted.',
        },
        {
          key: 'adSegments',
          label: 'Ad segment URNs (optional)',
          type: 'urnList',
          group: 'filterCriteria',
          default: '',
          hint: 'Part of filterCriteria. Comma- or newline-separated, e.g. urn:li:adSegment:1234',
        },
        {
          key: 'campaign',
          label: 'Campaign URN (optional)',
          type: 'text',
          group: 'filterCriteria',
          default: '',
          hint: 'Part of filterCriteria. Single campaign only, e.g. urn:li:sponsoredCampaign:123. Organic metrics return 0 when set.',
        },
      ],
    },
  },

  // --- Lead Sync ---
  'GET https://api.linkedin.com/rest/leadFormResponses': {
    tryUrl:
      'https://api.linkedin.com/rest/leadFormResponses?q=owner' +
      `&owner=(sponsoredAccount:${encodeURIComponent(SAMPLE_AD_ACCOUNT)})` +
      '&leadType=(leadType:SPONSORED)',
  },
  'GET https://api.linkedin.com/rest/eventLeadFormResponses': {
    tryUrl:
      'https://api.linkedin.com/rest/eventLeadFormResponses?q=organizationAndTimeRange' +
      `&organization=${encodeURIComponent(SAMPLE_ORG)}` +
      '&timeRange.start=1704067200000&timeRange.end=1706745600000',
  },

  // --- Conversions ---
  'POST https://api.linkedin.com/rest/conversions': {
    tryBody: {
      account: SAMPLE_AD_ACCOUNT,
      name: 'Showcase – Signup',
      type: 'LEAD',
      enabled: true,
      attributionType: 'LAST_TOUCH_BY_CAMPAIGN',
      postClickAttributionWindowSize: 30,
      viewThroughAttributionWindowSize: 7,
    },
  },
  'POST https://api.linkedin.com/rest/conversionEvents': {
    tryBody: {
      conversion: 'urn:lla:llaPartnerConversion:(urn:li:sponsoredAccount:506336348,123456)',
      conversionHappenedAt: Date.now(),
      conversionValue: { currencyCode: 'USD', amount: '49.99' },
      user: {
        userIds: [{ idType: 'SHA256_EMAIL', idValue: 'eb2c4d7d8f2f1c6e9a1d4b3c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f' }],
      },
    },
  },

  // --- Audiences ---
  'POST https://api.linkedin.com/rest/dmpSegments': {
    tryBody: {
      name: 'Showcase – Email match list',
      account: SAMPLE_AD_ACCOUNT,
      sourcePlatform: 'API',
      type: 'USER',
      destinations: [{ destination: 'LINKEDIN' }],
      accessPolicy: 'PRIVATE',
    },
  },
  'POST https://api.linkedin.com/rest/dmpSegments/{id}/users': {
    tryUrl: 'https://api.linkedin.com/rest/dmpSegments/123456/users?action=add',
    tryBody: {
      elements: [
        {
          action: 'ADD',
          userIds: [
            { idType: 'SHA256_EMAIL', idValue: 'eb2c4d7d8f2f1c6e9a1d4b3c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f' },
          ],
        },
      ],
    },
  },

  // --- Events ---
  'GET https://api.linkedin.com/rest/events': {
    tryUrl: `https://api.linkedin.com/rest/events?q=organization&organization=${encodeURIComponent(SAMPLE_ORG)}`,
  },

  // --- Audience Insights API ---
  // POST /rest/targetingAudienceInsights?action=audienceInsights
  // Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/audience-insights-api
  'POST https://api.linkedin.com/rest/targetingAudienceInsights?action=audienceInsights': {
    tryBody: {
      request: {
        requestMetaData: { sponsoredAccount: SAMPLE_AD_ACCOUNT },
        targetingCriteria: {
          include: {
            and: [
              { or: { 'urn:li:adTargetingFacet:locations': ['urn:li:geo:103644278'] } },
              { or: { 'urn:li:adTargetingFacet:interfaceLocales': ['urn:li:locale:en_US'] } },
            ],
          },
        },
        groupBy: 'urn:li:adTargetingFacet:jobFunctions',
        maxReturnCount: 5,
      },
    },
    paramSchema: {
      httpMethod: 'POST',
      bodyShape: 'audienceInsights',
      baseUrl:
        'https://api.linkedin.com/rest/targetingAudienceInsights?action=audienceInsights',
      description:
        'Estimate audience size and demographics for a set of ad targeting criteria. ' +
        'Each non-empty facet becomes its own AND clause; values within a facet are OR-combined. ' +
        'Some facets (ageRanges, genders, groups, interfaceLocales) can only be used in include.',
      fields: [
        // --- Required top-level / metadata ---
        {
          key: 'sponsoredAccount',
          label: 'Sponsored account URN',
          type: 'text',
          required: true,
          default: SAMPLE_AD_ACCOUNT,
          location: 'metadata',
          hint: 'Authenticated user must have an ad-account role on this account.',
        },
        {
          key: 'groupBy',
          label: 'Group by (returned segmentation)',
          type: 'select',
          required: true,
          default: 'urn:li:adTargetingFacet:jobFunctions',
          options: [
            'urn:li:adTargetingFacet:jobFunctions',
            'urn:li:adTargetingFacet:seniorities',
            'urn:li:adTargetingFacet:titles',
            'urn:li:adTargetingFacet:yearsOfExperienceRanges',
            'urn:li:adTargetingFacet:interests',
            'urn:li:adTargetingFacet:productInterests',
            'urn:li:adTargetingFacet:skills',
            'urn:li:adTargetingFacet:industries',
            'urn:li:adTargetingFacet:staffCountRanges',
            'urn:li:adTargetingFacet:growthRate',
            'urn:li:adTargetingFacet:employers',
            'urn:li:adTargetingFacet:bingContinent',
            'urn:li:adTargetingFacet:bingCountry',
            'urn:li:adTargetingFacet:bingState',
            'urn:li:adTargetingFacet:bingCity',
          ],
          location: 'top',
        },
        {
          key: 'maxReturnCount',
          label: 'Max return count (1–100)',
          type: 'number',
          default: 5,
          min: 1,
          max: 100,
          location: 'top',
        },
        {
          key: 'segmentsOrderedBy',
          label: 'Order by',
          type: 'select',
          options: ['AUDIENCE_PERCENTAGE', 'HIERARCHICAL'],
          default: 'AUDIENCE_PERCENTAGE',
          location: 'top',
        },

        // --- Facets: Member attributes ---
        {
          key: 'ageRanges',
          label: 'Age ranges (include only)',
          type: 'checkboxes',
          facetUrn: 'urn:li:adTargetingFacet:ageRanges',
          includeOnly: true,
          defaults: [],
          options: [
            'urn:li:ageRange:(18,24)',
            'urn:li:ageRange:(25,34)',
            'urn:li:ageRange:(35,54)',
            'urn:li:ageRange:(55,2147483647)',
          ],
        },
        {
          key: 'genders',
          label: 'Genders (include only)',
          type: 'checkboxes',
          facetUrn: 'urn:li:adTargetingFacet:genders',
          includeOnly: true,
          defaults: [],
          options: ['urn:li:gender:FEMALE', 'urn:li:gender:MALE'],
        },
        {
          key: 'interfaceLocales',
          label: 'Interface locales (include only)',
          type: 'checkboxes',
          facetUrn: 'urn:li:adTargetingFacet:interfaceLocales',
          includeOnly: true,
          defaults: [],
          options: [
            'urn:li:locale:en_US',
            'urn:li:locale:en_GB',
            'urn:li:locale:fr_FR',
            'urn:li:locale:de_DE',
            'urn:li:locale:es_ES',
            'urn:li:locale:pt_BR',
            'urn:li:locale:ja_JP',
          ],
        },
        {
          key: 'groups',
          label: 'Groups (include only)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:groups',
          includeOnly: true,
          default: '',
          hint: 'e.g. urn:li:group:1234',
        },

        // --- Facets: Location ---
        {
          key: 'locations',
          label: 'Locations (current or profile)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:locations',
          default: 'urn:li:geo:103644278',
          hint: 'e.g. urn:li:geo:103644278 (United States), urn:li:country:us, urn:li:countryGroup:NA.',
        },
        {
          key: 'profileLocations',
          label: 'Profile locations (profile only)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:profileLocations',
          default: '',
        },

        // --- Facets: Job ---
        {
          key: 'jobFunctions',
          label: 'Job functions',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:jobFunctions',
          default: '',
          hint: 'e.g. urn:li:function:22.',
        },
        {
          key: 'titles',
          label: 'Job titles (current)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:titles',
          default: '',
          hint: 'e.g. urn:li:title:4.',
        },
        {
          key: 'titlesAll',
          label: 'Job titles (current OR past)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:titlesAll',
          default: '',
        },
        {
          key: 'titlesPast',
          label: 'Job titles (past)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:titlesPast',
          default: '',
        },
        {
          key: 'seniorities',
          label: 'Seniorities',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:seniorities',
          default: '',
          hint: 'e.g. urn:li:seniority:7.',
        },
        {
          key: 'yearsOfExperienceRanges',
          label: 'Years of experience',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:yearsOfExperienceRanges',
          default: '',
          hint: 'e.g. urn:li:yearsOfExperience:3 (max 2 URNs: lower/upper).',
        },
        {
          key: 'skills',
          label: 'Skills',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:skills',
          default: '',
          hint: 'e.g. urn:li:skill:17.',
        },
        {
          key: 'memberBehaviors',
          label: 'Member behaviors',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:memberBehaviors',
          default: '',
          hint: 'e.g. urn:li:memberBehavior:2.',
        },
        {
          key: 'interests',
          label: 'Member interests',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:interests',
          default: '',
          hint: 'e.g. urn:li:interest:689290.',
        },

        // --- Facets: Education ---
        {
          key: 'schools',
          label: 'Schools',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:schools',
          default: '',
          hint: 'e.g. urn:li:organization:1035.',
        },
        {
          key: 'degrees',
          label: 'Degrees',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:degrees',
          default: '',
          hint: 'e.g. urn:li:degree:700.',
        },
        {
          key: 'fieldsOfStudy',
          label: 'Fields of study',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:fieldsOfStudy',
          default: '',
          hint: 'e.g. urn:li:fieldOfStudy:100275.',
        },

        // --- Facets: Company / firmographics ---
        {
          key: 'employers',
          label: 'Employers (current)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:employers',
          default: '',
          hint: 'e.g. urn:li:organization:1035.',
        },
        {
          key: 'employersAll',
          label: 'Employers (current OR past)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:employersAll',
          default: '',
        },
        {
          key: 'employersPast',
          label: 'Employers (past)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:employersPast',
          default: '',
        },
        {
          key: 'industries',
          label: 'Industries',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:industries',
          default: '',
          hint: 'e.g. urn:li:industry:9.',
        },
        {
          key: 'companyCategory',
          label: 'Company category',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:companyCategory',
          default: '',
          hint: 'e.g. urn:li:organizationRankingList:1.',
        },
        {
          key: 'staffCountRanges',
          label: 'Company size',
          type: 'checkboxes',
          facetUrn: 'urn:li:adTargetingFacet:staffCountRanges',
          defaults: [],
          options: [
            'urn:li:staffCountRange:(1,1)',
            'urn:li:staffCountRange:(2,10)',
            'urn:li:staffCountRange:(11,50)',
            'urn:li:staffCountRange:(51,200)',
            'urn:li:staffCountRange:(201,500)',
            'urn:li:staffCountRange:(501,1000)',
            'urn:li:staffCountRange:(1001,5000)',
            'urn:li:staffCountRange:(5001,10000)',
            'urn:li:staffCountRange:(10001,2147483647)',
          ],
        },
        {
          key: 'growthRate',
          label: 'Company growth rate',
          type: 'checkboxes',
          facetUrn: 'urn:li:adTargetingFacet:growthRate',
          defaults: [],
          options: [
            'urn:li:growthRate:(-2147483647,0)',
            'urn:li:growthRate:(0,3)',
            'urn:li:growthRate:(3,10)',
            'urn:li:growthRate:(10,20)',
            'urn:li:growthRate:(20,2147483647)',
          ],
        },
        {
          key: 'followedCompanies',
          label: 'Followed companies',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:followedCompanies',
          default: '',
        },
        {
          key: 'firstDegreeConnectionCompanies',
          label: '1st-degree connections of companies',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:firstDegreeConnectionCompanies',
          default: '',
        },
        {
          key: 'buyerGroups',
          label: 'Buyer groups (v202603+)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:buyerGroups',
          default: '',
          hint: 'e.g. urn:li:standardizedProductCategory:1031.',
        },

        // --- Facets: Matched audiences / retargeting ---
        {
          key: 'audienceMatchingSegments',
          label: 'Matched audience segments (contact / company)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:audienceMatchingSegments',
          default: '',
          hint: 'e.g. urn:li:adSegment:10001.',
        },
        {
          key: 'dynamicSegments',
          label: 'Dynamic segments (website / engagement retargeting)',
          type: 'urnList',
          facetUrn: 'urn:li:adTargetingFacet:dynamicSegments',
          default: '',
        },
      ],
    },
  },
};

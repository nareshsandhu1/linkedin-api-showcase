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

  // --- Marketing Developer Platform ---
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
  },
  'GET https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0': {},

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
};

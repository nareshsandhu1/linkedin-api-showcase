/**
 * Maps LinkedIn OAuth scopes to the Developer Portal "Products" that grant them.
 *
 * NOTE: LinkedIn doesn't expose an API to ask "what products does my developer
 * app have?". The Products page in this app shows products derived from scopes
 * actually granted in the access token. To see every product your app has
 * access to, your LINKEDIN_SCOPES env var must request every scope your app
 * supports — LinkedIn will only grant scopes the app is authorized for.
 */
const ENTRIES = [
  // --- Sign In with LinkedIn using OpenID Connect ---
  ['openid',  'Sign In with LinkedIn using OpenID Connect', 'Use your app as an OpenID Connect identity provider.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/userinfo', label: 'OpenID userinfo' },
  ]],
  ['profile', 'Sign In with LinkedIn using OpenID Connect', 'Read name, profile picture, and LinkedIn member ID.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/userinfo', label: 'OpenID userinfo' },
  ]],
  ['email',   'Sign In with LinkedIn using OpenID Connect', 'Read the member’s primary email address.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/userinfo', label: 'OpenID userinfo' },
  ]],

  // --- Sign In with LinkedIn (legacy) / Profile API ---
  ['r_liteprofile',  'Sign In with LinkedIn (legacy)', 'Use the member’s name and photo.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/me', label: 'Profile (lite)' },
  ]],
  ['r_emailaddress', 'Sign In with LinkedIn (legacy)', 'Read the member’s primary email address.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', label: 'Email API' },
  ]],
  ['r_basicprofile', 'Profile API', 'Read basic profile (name, photo, headline, public URL).', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/me', label: 'Profile API' },
  ]],

  // --- Share on LinkedIn (member-level posting) ---
  ['w_member_social',      'Share on LinkedIn', 'Create, modify, and delete posts, comments, and reactions on the member’s behalf.', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/posts', label: 'Posts API' },
    { method: 'POST', path: 'https://api.linkedin.com/v2/ugcPosts', label: 'UGC Posts (legacy)' },
  ]],
  ['w_member_social_feed', 'Share on LinkedIn', 'Create, modify, and delete comments/reactions on posts on the member’s behalf.', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/socialActions/{urn}/comments', label: 'Social Actions — comments' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/reactions', label: 'Reactions API' },
  ]],

  // --- Community Management API (organization-level) ---
  ['rw_organization_admin',     'Community Management API', 'Manage organization pages and retrieve reporting data.', [
    { method: 'GET',  path: 'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee', label: 'Organization ACLs' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/organizations', label: 'Organizations' },
  ]],
  ['r_organization_admin',      'Community Management API', 'Retrieve organization pages and reporting (followers, visitors, content).', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee', label: 'Organization ACLs' },
    { method: 'GET', path: 'https://api.linkedin.com/rest/organizationalEntityFollowerStatistics', label: 'Follower statistics' },
  ]],
  ['r_organization_social',     'Community Management API', 'Retrieve organization posts, comments, reactions, and engagement.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/posts?q=author&author={orgUrn}', label: 'Posts API' },
  ]],
  ['w_organization_social',     'Community Management API', 'Create, modify, and delete posts/comments/reactions for the organization.', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/posts', label: 'Posts API' },
  ]],
  ['r_organization_social_feed','Community Management API', 'Retrieve comments, reactions, and engagement on organization posts.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/socialActions/{urn}/comments', label: 'Social Actions — comments' },
    { method: 'GET', path: 'https://api.linkedin.com/rest/reactions', label: 'Reactions API' },
  ]],
  ['w_organization_social_feed','Community Management API', 'Create, modify, and delete comments/reactions on organization posts.', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/socialActions/{urn}/comments', label: 'Social Actions — comments' },
  ]],
  ['r_organization_followers',  'Community Management API', 'Read follower data so your organization can mention them in posts.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/organizationalEntityFollowerStatistics', label: 'Follower statistics' },
  ]],

  // --- Member Analytics ---
  ['r_member_postAnalytics',    'Member Post Analytics', 'Retrieve the member’s posts and their reporting data.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/memberPostAnalytics', label: 'Member Post Analytics' },
  ]],
  ['r_member_profileAnalytics', 'Member Profile Analytics', 'Retrieve profile viewers, followers, and search appearances.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/memberProfileAnalytics', label: 'Member Profile Analytics' },
  ]],

  // --- Ads & Reporting API (formerly Marketing Developer Platform) ---
  ['r_ads',                          'Ads & Reporting API', 'Retrieve advertising accounts.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/adAccounts', label: 'Ad Accounts' },
  ]],
  ['rw_ads',                         'Ads & Reporting API', 'Manage advertising accounts, campaigns, and creatives.', [
    { method: 'GET',  path: 'https://api.linkedin.com/rest/adAccounts', label: 'Ad Accounts' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/adCampaigns', label: 'Campaigns' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/creatives', label: 'Creatives' },
  ]],
  ['r_ads_reporting',                'Ads & Reporting API', 'Retrieve reporting/analytics for advertising accounts.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/adAnalytics?q=analytics', label: 'Ad Analytics' },
  ]],
  ['r_1st_connections_size',         'Ads & Reporting API', 'Read the size of the member’s 1st-degree network.', [
    { method: 'GET', path: 'https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0', label: 'Connections count' },
  ]],

  // --- Lead Sync ---
  ['r_ads_leadgen_automation',       'Lead Sync API', 'Access Lead Gen Forms and retrieve ad leads.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/leadFormResponses', label: 'Lead Form Responses' },
  ]],
  ['r_marketing_leadgen_automation', 'Lead Sync API', 'Access lead generation forms (event, ad, and organization page leads).', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/leadFormResponses', label: 'Lead Form Responses' },
  ]],
  ['r_events_leadgen_automation',    'Lead Sync API', 'Retrieve organization events and the leads associated with them.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/eventLeadFormResponses', label: 'Event Lead Form Responses' },
  ]],

  // --- Conversions ---
  ['rw_conversions',         'Conversions API', 'Upload conversion data and manage conversion tracking.', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/conversions', label: 'Conversions' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/conversionEvents', label: 'Conversion Events' },
  ]],

  // --- Audiences ---
  ['rw_dmp_segments',        'Audiences API', 'Create and manage matched audiences (DMP segments).', [
    { method: 'POST', path: 'https://api.linkedin.com/rest/dmpSegments', label: 'DMP Segments' },
    { method: 'POST', path: 'https://api.linkedin.com/rest/dmpSegments/{id}/users', label: 'DMP Segment Users' },
  ]],

  // --- Events Management ---
  ['r_events', 'Events Management API', 'Retrieve the organization’s events.', [
    { method: 'GET', path: 'https://api.linkedin.com/rest/events', label: 'Events' },
  ]],
];

const catalog = {};
for (const [scope, product, description, endpoints] of ENTRIES) {
  catalog[scope] = { product, description, endpoints };
}

module.exports = catalog;

/**
 * Example request/response payloads for each LinkedIn product.
 * Keyed by the exact product name used in lib/scope-catalog.js.
 *
 * These are illustrative samples taken from LinkedIn's public docs
 * (https://learn.microsoft.com/en-us/linkedin/) and trimmed for clarity.
 * Real responses contain additional fields.
 */
module.exports = {
  'Sign In with LinkedIn using OpenID Connect': {
    request: `GET https://api.linkedin.com/v2/userinfo
Authorization: Bearer {ACCESS_TOKEN}`,
    response: `{
  "sub": "782bbtaQ",
  "name": "Jane Doe",
  "given_name": "Jane",
  "family_name": "Doe",
  "picture": "https://media.licdn.com/dms/image/.../profile.jpg",
  "locale": { "country": "US", "language": "en" },
  "email": "jane.doe@example.com",
  "email_verified": true
}`,
  },

  'Sign In with LinkedIn (legacy)': {
    request: `GET https://api.linkedin.com/v2/me
Authorization: Bearer {ACCESS_TOKEN}`,
    response: `{
  "id": "782bbtaQ",
  "localizedFirstName": "Jane",
  "localizedLastName": "Doe",
  "profilePicture": {
    "displayImage": "urn:li:digitalmediaAsset:C5603AQHxe..."
  }
}`,
  },

  'Profile API': {
    request: `GET https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,headline,vanityName)
Authorization: Bearer {ACCESS_TOKEN}`,
    response: `{
  "id": "782bbtaQ",
  "localizedFirstName": "Jane",
  "localizedLastName": "Doe",
  "headline": "Senior Software Engineer at Example Co.",
  "vanityName": "jane-doe"
}`,
  },

  'Share on LinkedIn': {
    request: `POST https://api.linkedin.com/rest/posts
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506
X-Restli-Protocol-Version: 2.0.0
Content-Type: application/json

{
  "author": "urn:li:person:782bbtaQ",
  "commentary": "Hello, world — posted from the LinkedIn API Showcase!",
  "visibility": "PUBLIC",
  "lifecycleState": "PUBLISHED",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  }
}`,
    response: `HTTP/1.1 201 Created
x-restli-id: urn:li:share:7012345678901234567

{
  "id": "urn:li:share:7012345678901234567"
}`,
  },

  'Community Management API': {
    request: `GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED
Authorization: Bearer {ACCESS_TOKEN}`,
    response: `{
  "elements": [
    {
      "organizationalTarget": "urn:li:organization:2414183",
      "role": "ADMINISTRATOR",
      "roleAssignee": "urn:li:person:782bbtaQ",
      "state": "APPROVED"
    }
  ],
  "paging": { "count": 10, "start": 0, "total": 1 }
}`,
  },

  'Member Post Analytics': {
    request: `GET https://api.linkedin.com/rest/memberPostAnalytics?q=memberAndTimeRange&member=urn:li:person:782bbtaQ&timeRange.start=1714521600000&timeRange.end=1717113600000
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506`,
    response: `{
  "elements": [
    {
      "post": "urn:li:share:7012345678901234567",
      "impressionCount": 4823,
      "uniqueImpressionsCount": 4011,
      "clickCount": 312,
      "likeCount": 88,
      "commentCount": 14,
      "shareCount": 6
    }
  ]
}`,
  },

  'Member Profile Analytics': {
    request: `GET https://api.linkedin.com/rest/memberProfileAnalytics?q=memberAndTimeRange&member=urn:li:person:782bbtaQ&timeRange.start=1714521600000&timeRange.end=1717113600000
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506`,
    response: `{
  "profileViewCount": 247,
  "searchAppearanceCount": 58,
  "followerCount": 1432,
  "uniqueProfileViewersCount": 198
}`,
  },

  'Marketing Developer Platform': {
    request: `GET https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506
X-Restli-Protocol-Version: 2.0.0`,
    response: `{
  "elements": [
    {
      "id": 503012345,
      "name": "Example Co. — Brand",
      "currency": "USD",
      "type": "BUSINESS",
      "status": "ACTIVE",
      "reference": "urn:li:organization:2414183"
    }
  ],
  "paging": { "count": 10, "start": 0, "total": 1 }
}`,
  },

  'Lead Sync API': {
    request: `GET https://api.linkedin.com/rest/leadFormResponses?q=owner&owner.sponsoredAccount=urn:li:sponsoredAccount:503012345
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506`,
    response: `{
  "elements": [
    {
      "id": "urn:li:leadFormResponse:(urn:li:sponsoredAccount:503012345,7110011)",
      "submittedAt": 1714602345678,
      "leadType": "SPONSORED",
      "answers": [
        { "questionId": "EMAIL_ADDRESS", "answer": "jane.doe@example.com" },
        { "questionId": "FIRST_NAME",    "answer": "Jane" },
        { "questionId": "LAST_NAME",     "answer": "Doe" },
        { "questionId": "COMPANY_NAME",  "answer": "Example Co." }
      ]
    }
  ]
}`,
  },

  'Conversions API': {
    request: `POST https://api.linkedin.com/rest/conversionEvents
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506
Content-Type: application/json

{
  "conversion": "urn:lla:llaPartnerConversion:12345",
  "conversionHappenedAt": 1717113600000,
  "user": {
    "userIds": [
      { "idType": "SHA256_EMAIL", "idValue": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
    ]
  },
  "conversionValue": { "currencyCode": "USD", "amount": "49.99" }
}`,
    response: `HTTP/1.1 201 Created

{
  "id": "urn:lla:llaPartnerConversionEvent:99887766"
}`,
  },

  'Conversions API (Offline)': {
    request: `POST https://api.linkedin.com/rest/conversionEvents
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506
Content-Type: application/json

{
  "conversion": "urn:lla:llaPartnerConversion:67890",
  "conversionHappenedAt": 1717000000000,
  "source": "OFFLINE",
  "user": {
    "userIds": [
      { "idType": "SHA256_EMAIL", "idValue": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
    ]
  }
}`,
    response: `HTTP/1.1 201 Created

{
  "id": "urn:lla:llaPartnerConversionEvent:99887767"
}`,
  },

  'Audiences API': {
    request: `POST https://api.linkedin.com/rest/dmpSegments
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506
Content-Type: application/json

{
  "name": "Spring Webinar Attendees",
  "account": "urn:li:sponsoredAccount:503012345",
  "sourcePlatform": "API",
  "type": "USER",
  "destinations": [{ "destination": "LINKEDIN" }]
}`,
    response: `HTTP/1.1 201 Created

{
  "id": "urn:li:dmpSegment:200012345"
}`,
  },

  'Events Management API': {
    request: `GET https://api.linkedin.com/rest/events?q=organizer&organizer=urn:li:organization:2414183
Authorization: Bearer {ACCESS_TOKEN}
LinkedIn-Version: 202506`,
    response: `{
  "elements": [
    {
      "id": "urn:li:event:7012001",
      "name": { "localized": { "en_US": "Q3 Customer Webinar" } },
      "startAt": 1717508400000,
      "endAt":   1717515600000,
      "venueDetails": { "venueName": "Online — LinkedIn Live" },
      "organizer": "urn:li:organization:2414183"
    }
  ]
}`,
  },
};

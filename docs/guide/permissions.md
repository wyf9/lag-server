# Permissions

## Identities and platform administrator

External-provider users have an `oauth_identities` record; optional nickname users are guests. The first newly created external identity is granted `platform_admin`. An exact configured claim match can grant the same role later. A platform administrator bypasses room owner/moderator admission checks and can use the administrator APIs and console.

When `PRISM_TEAM_ID` is configured, owners and co-owners of that Prism team receive a dynamic `platform_admin` grant at login.

## Room roles

| Role | Enter permitted room | Voice publish | Manage ordinary members | Manage moderators/settings | Delete/transfer room |
| --- | ---: | ---: | ---: | ---: | ---: |
| `listener` | Yes | No | No | No | No |
| `speaker` | Yes | Yes | No | No | No |
| `moderator` | Yes | Yes | Kick/ban, invite, change speaker/listener | No moderator changes; no settings | No |
| `owner` | Yes | Yes | Yes | Yes | Yes |
| `platform_admin` | Yes | Yes | Yes | Yes | Yes |

Room creators become owners. Ownership transfer requires a current member to accept within 24 hours. Owners can set visibility (`public`, `unlisted`, `private`), guest admission, default role, maximum participants, history visibility (`all`, `since_membership`, `none`), and retention (`7`, `30`, `forever`).

## Admission and content

- Public rooms appear in listings; unlisted/private rooms appear to members and platform administrators.
- Private rooms require a non-guest membership. Guest-disabled rooms reject guests.
- Bans override ordinary room access; platform administrators bypass the ban check.
- User invitations target external identities. Link invitations may admit guests only when room policy allows.
- Message reads obey admission, history visibility, and retention. Message posting obeys admission but is not restricted to speaker roles.
- LiveKit publish permission follows room role; listeners receive subscribe-only grants.

The schema includes room ACL entries, but current authorization does not evaluate them. Do not rely on arbitrary ACL policy until it is wired into route checks.

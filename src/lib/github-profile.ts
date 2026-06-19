import { createHash } from 'node:crypto';

export const USERNAME_PATTERN = /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}$/;

const GITHUB_API_BASE_URL = 'https://api.github.com';
const UPSTREAM_TIMEOUT_MS = 8_000;
const FRESH_TTL_MS = 15 * 60 * 1000;
const STALE_WINDOW_MS = 60 * 60 * 1000;

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string | number>;
  };
};

export type ProfileRepo = {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
};

export type ContributionDay = {
  date: string;
  weekday: number;
  count: number;
  level: number;
};

export type ContributionWeek = {
  index: number;
  firstDay: string;
  contributionDays: ContributionDay[];
};

export type ContributionCalendar = {
  from: string;
  to: string;
  rangeDays: number;
  totalContributions: number;
  privateContributionsIncluded: boolean;
  colors: string[];
  weeks: ContributionWeek[];
};

export type ProfilePayload = {
  username: string;
  normalizedUsername: string;
  source: 'github.rest';
  sourceUrl: string;
  fetchedAt: string;
  contributions: ContributionCalendar;
  profile: {
    name: string | null;
    login: string;
    avatarUrl: string;
    bio: string | null;
    company: string | null;
    location: string | null;
    followers: number;
    following: number;
    publicRepos: number;
    profileUrl: string;
    topLanguages: string[];
    lastActiveAt: string | null;
    recentRepos: ProfileRepo[];
  };
};

export type CacheEntry = {
  payload: ProfilePayload;
  etag: string;
  fetchedAtMs: number;
};

export type CacheState = 'MISS' | 'HIT' | 'STALE';

type GitHubUserResponse = {
  avatar_url: string;
  bio: string | null;
  company: string | null;
  followers: number;
  following: number;
  html_url: string;
  location: string | null;
  login: string;
  name: string | null;
  public_repos: number;
};

type GitHubRepoResponse = {
  description: string | null;
  html_url: string;
  language: string | null;
  name: string;
  pushed_at: string;
  stargazers_count: number;
};

type GitHubEventResponse = {
  created_at: string;
};

type GitHubContribDayResponse = {
  weekday: number;
  count: number;
  level: number;
};

type GitHubContribWeekResponse = {
  index: number;
  first_day: string;
  contribution_days: GitHubContribDayResponse[];
};

type GitHubContribResponse = {
  from: string;
  to: string;
  range_days: number;
  total_contributions: number;
  private_contributions_included: boolean;
  colors_full?: string[];
  colors?: string[];
  weeks: GitHubContribWeekResponse[];
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string | number>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string | number>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const cache = new Map<string, CacheEntry>();
const inFlightFetches = new Map<string, Promise<CacheEntry>>();

export const normalizeUsername = (username: string): string => username.trim().toLowerCase();

export const isValidUsername = (username: string): boolean => {
  if (!USERNAME_PATTERN.test(username)) {
    return false;
  }

  return !username.endsWith('-');
};

export const etagFor = (payload: ProfilePayload): string => {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  return `W/"${hash}"`;
};

const githubHeaders = (): HeadersInit => {
  const token = process.env.GITHUB_TOKEN?.trim();

  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mona-mayhem-dev-card',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const isRateLimited = (response: Response): boolean => {
  if (response.status === 429) {
    return true;
  }

  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
};

const assertHealthyResponse = (response: Response, endpoint: string, username: string): void => {
  if (endpoint === 'profile' && response.status === 404) {
    throw new ApiError(404, 'user_not_found', 'GitHub user was not found.', {
      username,
    });
  }

  if (isRateLimited(response)) {
    throw new ApiError(429, 'upstream_rate_limited', 'GitHub API rate limit reached.', {
      username,
    });
  }

  if (response.status >= 500) {
    throw new ApiError(502, 'bad_gateway', 'GitHub upstream returned an error.', {
      endpoint,
      upstreamStatus: response.status,
    });
  }

  if (!response.ok) {
    throw new ApiError(502, 'upstream_error', 'GitHub upstream request failed.', {
      endpoint,
      upstreamStatus: response.status,
    });
  }
};

const parseJson = async <T>(response: Response): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      502,
      'invalid_upstream_response',
      'GitHub upstream response was not valid JSON.',
    );
  }
};

const summarizeLanguages = (repos: GitHubRepoResponse[]): string[] => {
  const counts = new Map<string, number>();

  for (const repo of repos) {
    if (!repo.language) {
      continue;
    }

    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([language]) => language);
};

const addDays = (dateString: string, days: number): string => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const normalizeContributions = (contributions: GitHubContribResponse): ContributionCalendar => ({
  from: contributions.from,
  to: contributions.to,
  rangeDays: contributions.range_days,
  totalContributions: contributions.total_contributions,
  privateContributionsIncluded: contributions.private_contributions_included,
  colors: contributions.colors_full ?? contributions.colors ?? ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  weeks: contributions.weeks.map((week) => ({
    index: week.index,
    firstDay: week.first_day,
    contributionDays: week.contribution_days.map((day) => ({
      date: addDays(week.first_day, day.weekday),
      weekday: day.weekday,
      count: day.count,
      level: day.level,
    })),
  })),
});

const buildPayload = (
  username: string,
  normalizedUsername: string,
  user: GitHubUserResponse,
  repos: GitHubRepoResponse[],
  events: GitHubEventResponse[],
  contributions: GitHubContribResponse,
): ProfilePayload => ({
  username,
  normalizedUsername,
  source: 'github.rest',
  sourceUrl: user.html_url,
  fetchedAt: new Date().toISOString(),
  contributions: normalizeContributions(contributions),
  profile: {
    name: user.name,
    login: user.login,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    company: user.company,
    location: user.location,
    followers: user.followers,
    following: user.following,
    publicRepos: user.public_repos,
    profileUrl: user.html_url,
    topLanguages: summarizeLanguages(repos),
    lastActiveAt: events[0]?.created_at ?? repos[0]?.pushed_at ?? null,
    recentRepos: repos.slice(0, 4).map((repo) => ({
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      updatedAt: repo.pushed_at,
    })),
  },
});

const fetchFromGitHub = async (username: string, normalizedUsername: string): Promise<CacheEntry> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const [profileResponse, reposResponse, eventsResponse, contributionsResponse] = await Promise.all([
      fetch(`${GITHUB_API_BASE_URL}/users/${encodeURIComponent(username)}`, {
        headers: githubHeaders(),
        signal: controller.signal,
      }),
      fetch(
        `${GITHUB_API_BASE_URL}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=6&type=owner`,
        {
          headers: githubHeaders(),
          signal: controller.signal,
        },
      ),
      fetch(`${GITHUB_API_BASE_URL}/users/${encodeURIComponent(username)}/events/public?per_page=1`, {
        headers: githubHeaders(),
        signal: controller.signal,
      }),
      fetch(`https://github.com/${encodeURIComponent(username)}.contribs`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'signal-card-contrib-proxy',
        },
        signal: controller.signal,
      }),
    ]);

    assertHealthyResponse(profileResponse, 'profile', username);
    assertHealthyResponse(reposResponse, 'repos', username);
    assertHealthyResponse(eventsResponse, 'events', username);
    assertHealthyResponse(contributionsResponse, 'contribs', username);

    const [user, repos, events, contributions] = await Promise.all([
      parseJson<GitHubUserResponse>(profileResponse),
      parseJson<GitHubRepoResponse[]>(reposResponse),
      parseJson<GitHubEventResponse[]>(eventsResponse),
      parseJson<GitHubContribResponse>(contributionsResponse),
    ]);

    const payload = buildPayload(username, normalizedUsername, user, repos, events, contributions);

    return {
      payload,
      etag: etagFor(payload),
      fetchedAtMs: Date.now(),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(504, 'gateway_timeout', 'Timed out while contacting GitHub upstream.');
    }

    throw new ApiError(502, 'bad_gateway', 'Failed to contact GitHub upstream.');
  } finally {
    clearTimeout(timeout);
  }
};

const refreshCache = (username: string, normalizedUsername: string): Promise<CacheEntry> => {
  const existing = inFlightFetches.get(normalizedUsername);
  if (existing) {
    return existing;
  }

  const request = fetchFromGitHub(username, normalizedUsername)
    .then((entry) => {
      cache.set(normalizedUsername, entry);
      return entry;
    })
    .finally(() => {
      inFlightFetches.delete(normalizedUsername);
    });

  inFlightFetches.set(normalizedUsername, request);
  return request;
};

export const getProfileEntry = async (
  username: string,
): Promise<{ entry: CacheEntry; cacheState: CacheState }> => {
  const normalizedUsername = normalizeUsername(username);
  const cached = cache.get(normalizedUsername);
  const now = Date.now();

  if (cached) {
    const age = now - cached.fetchedAtMs;
    if (age <= FRESH_TTL_MS) {
      return {
        entry: cached,
        cacheState: 'HIT',
      };
    }

    if (age <= FRESH_TTL_MS + STALE_WINDOW_MS) {
      void refreshCache(username, normalizedUsername).catch(() => {
        // Keep serving the cached profile if a refresh fails.
      });

      return {
        entry: cached,
        cacheState: 'STALE',
      };
    }
  }

  const entry = await refreshCache(username, normalizedUsername);
  return {
    entry,
    cacheState: 'MISS',
  };
};

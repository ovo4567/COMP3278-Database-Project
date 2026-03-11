import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AdminAnalytics, AdminSqlResult, Role, User } from '../lib/types';
import { adminApi } from '../lib/api';
import { Timestamp } from '../components/Timestamp';

type Props = {
  currentUser: User | null;
};

type SeriesPoint = {
  day: string;
  value: number;
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatDecimal = (value: number) => value.toFixed(2);
const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const lastValue = (points: SeriesPoint[]) => (points.length ? points[points.length - 1]!.value : 0);

function DashboardStat(props: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'pink' | 'aqua' | 'amber' | 'neutral';
}) {
  const toneClass =
    props.tone === 'aqua'
      ? 'from-cyan-400/30 via-cyan-300/10 to-transparent'
      : props.tone === 'amber'
        ? 'from-amber-300/30 via-orange-200/10 to-transparent'
        : props.tone === 'pink'
          ? 'from-pink-400/30 via-rose-200/10 to-transparent'
          : 'from-white/30 via-white/5 to-transparent';

  return (
    <div className="ui-panel ui-panel-soft relative overflow-hidden rounded-[28px] p-5">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${toneClass}`} />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">{props.label}</div>
        <div className="mt-3 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{props.value}</div>
        {props.meta ? <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{props.meta}</div> : null}
      </div>
    </div>
  );
}

function MiniAreaChart(props: { points: SeriesPoint[]; colorClass: string }) {
  const width = 320;
  const height = 120;
  const values = props.points.map((point) => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);

  const line = useMemo(() => {
    if (!props.points.length) return '';

    return props.points
      .map((point, index) => {
        const x = props.points.length === 1 ? width / 2 : (index / (props.points.length - 1)) * width;
        const y = height - ((point.value - min) / range) * (height - 12) - 6;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [height, min, props.points, range]);

  const area = useMemo(() => {
    if (!line) return '';
    return `${line} L ${width} ${height} L 0 ${height} Z`;
  }, [height, line, width]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-32 w-full overflow-visible" preserveAspectRatio="none">
      <path d={area} fill="currentColor" opacity="0.14" className={props.colorClass} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="3" className={props.colorClass} strokeLinecap="round" />
    </svg>
  );
}

function TrendCard(props: {
  title: string;
  subtitle: string;
  value: string;
  points: SeriesPoint[];
  colorClass: string;
}) {
  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{props.title}</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-950 dark:text-white">{props.value}</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Latest day</div>
        </div>
      </div>
      <div className="mt-4">
        <MiniAreaChart points={props.points} colorClass={props.colorClass} />
      </div>
      <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
        <span>{props.points[0] ? formatDay(props.points[0].day) : 'Start'}</span>
        <span>{props.points[props.points.length - 1] ? formatDay(props.points[props.points.length - 1]!.day) : 'Now'}</span>
      </div>
    </div>
  );
}

function RankingList(props: {
  title: string;
  subtitle: string;
  rows: Array<{ username: string; displayName: string | null; value: number }>;
  suffix: string;
}) {
  const maxValue = Math.max(...props.rows.map((row) => row.value), 1);

  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{props.title}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.subtitle}</div>
      <div className="mt-4 space-y-3">
        {props.rows.map((row, index) => (
          <div key={`${row.username}-${index}`} className="rounded-[22px] border border-white/25 bg-white/30 p-3 backdrop-blur-xl dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/u/${encodeURIComponent(row.username)}`} className="truncate text-sm font-semibold text-gray-900 hover:underline dark:text-white">
                  @{row.username}
                </Link>
                <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{row.displayName ?? 'No display name set'}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-950 dark:text-white">{formatNumber(row.value)}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{props.suffix}</div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/30 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 via-orange-300 to-cyan-400"
                style={{ width: `${Math.max((row.value / maxValue) * 100, 8)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostLeaderboard(props: {
  title: string;
  subtitle: string;
  rows: Array<{ id: number; username: string; text: string; createdAt: string; metric: number; label: string }>;
}) {
  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{props.title}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.subtitle}</div>
      <div className="mt-4 space-y-3">
        {props.rows.map((row) => (
          <div key={row.id} className="rounded-[24px] border border-white/25 bg-white/30 p-4 backdrop-blur-xl dark:bg-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Link to={`/u/${encodeURIComponent(row.username)}`} className="hover:underline">
                    @{row.username}
                  </Link>
                  <span className="ui-dot" />
                  <Timestamp value={row.createdAt} />
                  <span className="ui-dot" />
                  <Link to={`/p/${row.id}`} className="hover:underline">
                    Open post
                  </Link>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
                  {row.text.trim() ? row.text.slice(0, 180) : 'Image-first post'}
                  {row.text.length > 180 ? '…' : ''}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/30 bg-white/45 px-3 py-2 text-right shadow-[0_16px_28px_-24px_rgb(var(--ui-shadow-rgb)_/_0.5)] dark:bg-white/10">
                <div className="text-xl font-bold text-gray-950 dark:text-white">{formatNumber(row.metric)}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{row.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionCard(props: { rows: Array<{ bucket: string; count: number }> }) {
  const maxValue = Math.max(...props.rows.map((row) => row.count), 1);

  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Posting distribution</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">How many posts users tend to publish overall.</div>
      <div className="mt-5 space-y-3">
        {props.rows.map((row) => (
          <div key={row.bucket}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">{row.bucket} posts</span>
              <span className="ui-system text-gray-500 dark:text-gray-400">{formatNumber(row.count)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/30 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-pink-400"
                style={{ width: `${Math.max((row.count / maxValue) * 100, 6)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightCard(props: { items: string[] }) {
  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">What stands out right now</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Quick readouts for the admin team.</div>
      <div className="mt-4 grid gap-3">
        {props.items.map((item, index) => (
          <div key={index} className="rounded-[22px] border border-white/25 bg-white/30 px-4 py-3 text-sm leading-6 text-gray-700 backdrop-blur-xl dark:bg-white/5 dark:text-gray-300">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function SqlPanel(props: {
  sql: string;
  onSqlChange: (value: string) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  result: AdminSqlResult | null;
}) {
  return (
    <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Read-only SQL panel</div>
          <div className="mt-1 max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400">
            For inspection only. The backend only allows single-statement `SELECT` or `WITH` queries and automatically limits large results.
          </div>
        </div>
        <div className="rounded-[22px] border border-white/25 bg-white/35 px-4 py-3 text-xs text-gray-600 shadow-[0_18px_34px_-28px_rgb(var(--ui-shadow-rgb)_/_0.5)] backdrop-blur-xl dark:bg-white/10 dark:text-gray-300">
          Safe mode enabled
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <textarea
            value={props.sql}
            onChange={(event) => props.onSqlChange(event.target.value)}
            className="ui-textarea min-h-56 font-mono text-xs leading-6"
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Suggested: `SELECT username, role, created_at FROM users ORDER BY created_at DESC`
            </div>
            <button type="button" onClick={props.onRun} disabled={props.loading} className="ui-btn ui-btn-primary px-5 py-2.5 disabled:opacity-50">
              {props.loading ? 'Running query…' : 'Run read-only query'}
            </button>
          </div>
          {props.error ? <div className="ui-error mt-4">{props.error}</div> : null}
        </div>

        <div className="rounded-[24px] border border-white/25 bg-white/30 p-4 backdrop-blur-xl dark:bg-white/5">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Query result</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Run a read-only query to inspect live application data.</div>

          {props.result ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>Rows: <span className="ui-system">{props.result.rowCount}</span></span>
                <span>Columns: <span className="ui-system">{props.result.columns.length}</span></span>
                {props.result.limited ? <span className="ui-badge ui-system">Limited</span> : null}
              </div>

              <div className="mt-4 max-h-80 overflow-auto rounded-[18px] border border-white/20 bg-black/[0.04] dark:bg-white/[0.03]">
                {props.result.columns.length > 0 ? (
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white/80 backdrop-blur-xl dark:bg-slate-900/80">
                      <tr>
                        {props.result.columns.map((column) => (
                          <th key={column} className="border-b border-white/20 px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {props.result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-white/10 last:border-b-0">
                          {row.map((cell, cellIndex) => (
                            <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-gray-700 dark:text-gray-200">
                              {cell === null ? <span className="text-gray-400 dark:text-gray-500">null</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Query returned no columns.</div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-[18px] border border-dashed border-white/25 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No query has been run yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminPage({ currentUser }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sql, setSql] = useState('SELECT username, role, created_at FROM users ORDER BY created_at DESC');
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<AdminSqlResult | null>(null);

  const isAdmin = Boolean(currentUser && (currentUser.role as Role) === 'admin');

  useEffect(() => {
    if (!isAdmin) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.analytics({ days });
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [days, isAdmin]);

  const seriesNewUsers = useMemo(() => (data ? data.users.series.map((point) => ({ day: point.day, value: point.newUsers })) : []), [data]);
  const seriesActiveUsers = useMemo(() => (data ? data.users.series.map((point) => ({ day: point.day, value: point.activeUsers })) : []), [data]);
  const seriesPosts = useMemo(() => (data ? data.posts.series.map((point) => ({ day: point.day, value: point.newPosts })) : []), [data]);
  const seriesLikes = useMemo(() => (data ? data.engagement.series.map((point) => ({ day: point.day, value: point.likes })) : []), [data]);
  const seriesComments = useMemo(() => (data ? data.engagement.series.map((point) => ({ day: point.day, value: point.comments })) : []), [data]);
  const seriesFriendRequests = useMemo(() => (data ? data.friends.series.map((point) => ({ day: point.day, value: point.requests })) : []), [data]);
  const seriesFriendAccepted = useMemo(() => (data ? data.friends.series.map((point) => ({ day: point.day, value: point.accepted })) : []), [data]);

  const insights = useMemo(() => {
    if (!data) return [];

    const topCreator = data.users.top.byPosts[0];
    const topLikedPost = data.posts.mostLiked[0];
    const topConnected = data.friends.topByFriends[0];

    return [
      `${formatNumber(data.users.new.week)} new users joined in the last 7 days, with ${formatNumber(lastValue(seriesActiveUsers))} people active on the latest day of this window.`,
      topCreator
        ? `@${topCreator.username} is the most active creator right now with ${formatNumber(topCreator.value)} posts published.`
        : 'No single creator has pulled ahead yet in total posts.',
      topLikedPost
        ? `The hottest post in the app belongs to @${topLikedPost.username} with ${formatNumber(topLikedPost.likeCount)} likes.`
        : 'There is no standout post yet in the most-liked ranking.',
      `The app averages ${formatDecimal(data.posts.perUserAverage)} posts per user, with ${formatPercent(data.friends.acceptanceRate)} of resolved friend requests ending in acceptance.`,
      topConnected
        ? `@${topConnected.username} currently leads the network graph with ${formatNumber(topConnected.value)} accepted friendships.`
        : 'Friendship data is still too light to identify a network hub.',
    ];
  }, [data, seriesActiveUsers]);

  const runSql = async () => {
    setSqlLoading(true);
    setSqlError(null);
    try {
      const result = await adminApi.runSql({ query: sql });
      setSqlResult(result);
    } catch (err) {
      setSqlResult(null);
      setSqlError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setSqlLoading(false);
    }
  };

  if (!currentUser) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/" />;

  return (
    <div className="ui-shell space-y-5">
      <section className="ui-hero ui-card-hover">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-4 h-40 w-40 rounded-full bg-[rgb(var(--ui-accent-rgb)_/_0.18)] blur-3xl" />
          <div className="absolute right-6 top-8 h-36 w-36 rounded-full bg-[rgb(var(--ui-accent-2-rgb)_/_0.18)] blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-24 w-64 rounded-full bg-[rgb(255_190_92_/_0.18)] blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="ui-kicker">Admin command center</div>
            <h1 className="ui-h1 mt-3 text-3xl sm:text-4xl">A live pulse on growth, creators, and community momentum.</h1>
            <p className="ui-muted mt-3 max-w-2xl text-sm sm:text-base">
              This dashboard is tuned for the signals an admin actually needs: who is posting, what content is winning attention, how the network is growing, and where engagement is concentrating.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="ui-badge ui-system">{days} day analysis window</span>
              {data ? <span className="ui-badge ui-system">Updated <Timestamp value={data.generatedAt} /></span> : null}
              <span className="ui-badge ui-system">Realtime social health</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[28rem]">
            <div className="ui-stat rotate-[-2deg]">
              <div className="ui-stat-value">{data ? formatNumber(data.users.total) : '...'}</div>
              <div className="ui-stat-label">Total users</div>
            </div>
            <div className="ui-stat translate-y-3 rotate-[3deg]">
              <div className="ui-stat-value">{data ? formatNumber(data.posts.total) : '...'}</div>
              <div className="ui-stat-label">Total posts</div>
            </div>
          </div>
        </div>

        <div className="ui-divider-glow my-6" />

        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {[7, 30, 90, 365].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={`ui-btn px-4 py-2 ${days === value ? 'ui-btn-primary' : ''}`}
              >
                {value} days
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-white/25 bg-white/35 px-4 py-3 text-sm shadow-[0_18px_36px_-28px_rgb(var(--ui-shadow-rgb)_/_0.48)] backdrop-blur-xl dark:bg-white/10">
            <span className="text-gray-600 dark:text-gray-300">Need the public experience?</span>
            <Link to="/" className="ui-btn px-4 py-2">
              Back to feed
            </Link>
          </div>
        </div>
      </section>

      {loading ? <div className="ui-panel ui-panel-soft rounded-[28px] p-5 text-sm text-gray-700 dark:text-gray-300">Loading dashboard data…</div> : null}
      {error ? <div className="ui-error">{error}</div> : null}

      {data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStat
              label="Community size"
              value={formatNumber(data.users.total)}
              meta={<><span className="ui-system">{formatNumber(data.users.new.month)}</span> joined in the last 30 days</>}
              tone="pink"
            />
            <DashboardStat
              label="Daily activity"
              value={formatNumber(lastValue(seriesActiveUsers))}
              meta={<><span className="ui-system">{formatNumber(data.users.new.week)}</span> joined in the last 7 days</>}
              tone="aqua"
            />
            <DashboardStat
              label="Content volume"
              value={formatNumber(data.posts.total)}
              meta={<><span className="ui-system">{formatDecimal(data.posts.perUserAverage)}</span> posts per user on average</>}
              tone="amber"
            />
            <DashboardStat
              label="Relationship health"
              value={formatPercent(data.friends.acceptanceRate)}
              meta={<><span className="ui-system">{formatNumber(data.friends.totalPending)}</span> requests are still pending</>}
              tone="neutral"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <TrendCard title="New users" subtitle="Fresh signups entering the app" value={formatNumber(lastValue(seriesNewUsers))} points={seriesNewUsers} colorClass="text-pink-500" />
              <TrendCard title="Posts created" subtitle="Publishing velocity across the network" value={formatNumber(lastValue(seriesPosts))} points={seriesPosts} colorClass="text-amber-400" />
              <TrendCard title="Likes generated" subtitle="Positive engagement landing on posts" value={formatNumber(lastValue(seriesLikes))} points={seriesLikes} colorClass="text-cyan-400" />
              <TrendCard title="Comments written" subtitle="Conversation depth by day" value={formatNumber(lastValue(seriesComments))} points={seriesComments} colorClass="text-fuchsia-400" />
            </div>

            <div className="grid gap-4">
              <InsightCard items={insights} />
              <DistributionCard rows={data.posts.perUserBuckets} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <DashboardStat
              label="Likes per post"
              value={formatDecimal(data.engagement.likeToPostRatio)}
              meta="Average likes generated for each published post."
              tone="pink"
            />
            <DashboardStat
              label="Comments per post"
              value={formatDecimal(data.engagement.commentToPostRatio)}
              meta="Conversation depth relative to post volume."
              tone="aqua"
            />
            <DashboardStat
              label="Average friends per user"
              value={formatDecimal(data.friends.avgFriendsPerUser)}
              meta={<><span className="ui-system">{formatNumber(data.friends.accepted.window)}</span> new accepted connections in this window</>}
              tone="amber"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <PostLeaderboard
              title="Most liked posts"
              subtitle="The content currently winning the strongest positive reaction."
              rows={data.posts.mostLiked.map((post) => ({
                id: post.id,
                username: post.username,
                text: post.text,
                createdAt: post.createdAt,
                metric: post.likeCount,
                label: 'likes',
              }))}
            />
            <PostLeaderboard
              title="Most discussed posts"
              subtitle="Posts that are generating the most conversation."
              rows={data.posts.mostCommented.map((post) => ({
                id: post.id,
                username: post.username,
                text: post.text,
                createdAt: post.createdAt,
                metric: post.commentCount,
                label: 'comments',
              }))}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <RankingList
              title="Most active users"
              subtitle="Users publishing the most posts overall."
              rows={data.users.top.byPosts}
              suffix="posts"
            />
            <RankingList
              title="Most liked creators"
              subtitle="Users receiving the strongest audience approval."
              rows={data.users.top.byLikesReceived}
              suffix="likes"
            />
            <RankingList
              title="Top commenters"
              subtitle="Users driving the most replies and discussion."
              rows={data.users.top.byCommentsMade}
              suffix="comments"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="ui-panel ui-panel-soft rounded-[28px] p-5">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Connection momentum</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Friend requests compared with accepted connections inside the current window.</div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <TrendCard
                  title="Requests sent"
                  subtitle="How fast new social edges are being created"
                  value={formatNumber(lastValue(seriesFriendRequests))}
                  points={seriesFriendRequests}
                  colorClass="text-cyan-400"
                />
                <TrendCard
                  title="Requests accepted"
                  subtitle="How much of that demand becomes real connection"
                  value={formatNumber(lastValue(seriesFriendAccepted))}
                  points={seriesFriendAccepted}
                  colorClass="text-pink-500"
                />
              </div>
            </div>

            <RankingList
              title="Network hubs"
              subtitle="Users with the highest accepted friend counts."
              rows={data.friends.topByFriends}
              suffix="friends"
            />
          </section>

          <section>
            <SqlPanel
              sql={sql}
              onSqlChange={setSql}
              onRun={() => void runSql()}
              loading={sqlLoading}
              error={sqlError}
              result={sqlResult}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
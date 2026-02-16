import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AdminAnalytics, AdminSqlResult, Role, User } from '../lib/types';
import { adminApi } from '../lib/api';
import { Timestamp } from '../components/Timestamp';

type Props = {
  currentUser: User | null;
};

type SeriesPoint = { day: string; value: number };

const lastValue = (points: SeriesPoint[]): number => (points.length ? points[points.length - 1]!.value : 0);

function MetricTile(props: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="ui-panel ui-panel-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-600 dark:text-gray-400">{props.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.value}</div>
          {props.sub ? <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{props.sub}</div> : null}
        </div>
        {props.right ? <div className="w-40 shrink-0 text-gray-800 dark:text-gray-200">{props.right}</div> : null}
      </div>
    </div>
  );
}

function Sparkline(props: { points: SeriesPoint[]; height?: number }) {
  const height = props.height ?? 40;
  const width = 260;

  const max = Math.max(...props.points.map((p) => p.value), 0);
  const min = Math.min(...props.points.map((p) => p.value), 0);
  const range = Math.max(1, max - min);

  const path = useMemo(() => {
    if (props.points.length === 0) return '';
    return props.points
      .map((p, i) => {
        const x = props.points.length === 1 ? 0 : (i / (props.points.length - 1)) * width;
        const y = height - ((p.value - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [props.points, height, min, range]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-800 dark:text-gray-200" />
    </svg>
  );
}

function TopUserTable(props: { title: string; rows: Array<{ username: string; displayName: string | null; value: number }>; valueLabel: string }) {
  return (
    <div className="ui-panel ui-panel-soft p-3">
      <div className="text-sm font-semibold">{props.title}</div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-gray-600 dark:text-gray-400">
            <tr>
              <th className="py-1 pr-2">User</th>
              <th className="py-1 pr-2">{props.valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.username} className="border-t dark:border-gray-800">
                <td className="py-2 pr-2">
                  <Link className="hover:underline" to={`/u/${encodeURIComponent(r.username)}`}>
                    @{r.username}
                  </Link>
                  {r.displayName ? <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.displayName}</span> : null}
                </td>
                <td className="py-2 pr-2 tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopPostTable(props: { title: string; rows: Array<{ id: number; username: string; text: string; createdAt: string; value: number }>; valueLabel: string }) {
  const snippet = (t: string) => (t.length > 120 ? `${t.slice(0, 120)}…` : t);

  return (
    <div className="ui-panel ui-panel-soft p-3">
      <div className="text-sm font-semibold">{props.title}</div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-gray-600 dark:text-gray-400">
            <tr>
              <th className="py-1 pr-2">Post</th>
              <th className="py-1 pr-2">{props.valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t dark:border-gray-800">
                <td className="py-2 pr-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <Link className="hover:underline" to={`/u/${encodeURIComponent(r.username)}`}>
                      @{r.username}
                    </Link>
                    <span className="mx-2">·</span>
                    <Timestamp value={r.createdAt} />
                    <span className="mx-2">·</span>
                    <Link className="hover:underline" to={`/p/${r.id}`}>
                      View
                    </Link>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{snippet(r.text)}</div>
                </td>
                <td className="py-2 pr-2 tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminPage({ currentUser }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sql, setSql] = useState("SELECT username, role, created_at FROM users ORDER BY created_at DESC");
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<AdminSqlResult | null>(null);

  const isAdmin = Boolean(currentUser && (currentUser.role as Role) === 'admin');

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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

  const seriesNewUsers: SeriesPoint[] = useMemo(
    () => (data ? data.users.series.map((p) => ({ day: p.day, value: p.newUsers })) : []),
    [data],
  );
  const seriesActiveUsers: SeriesPoint[] = useMemo(
    () => (data ? data.users.series.map((p) => ({ day: p.day, value: p.activeUsers })) : []),
    [data],
  );
  const seriesNewPosts: SeriesPoint[] = useMemo(
    () => (data ? data.posts.series.map((p) => ({ day: p.day, value: p.newPosts })) : []),
    [data],
  );
  const seriesLikes: SeriesPoint[] = useMemo(
    () => (data ? data.engagement.series.map((p) => ({ day: p.day, value: p.likes })) : []),
    [data],
  );
  const seriesComments: SeriesPoint[] = useMemo(
    () => (data ? data.engagement.series.map((p) => ({ day: p.day, value: p.comments })) : []),
    [data],
  );
  const seriesChatMessages: SeriesPoint[] = useMemo(
    () => (data ? data.chat.series.map((p) => ({ day: p.day, value: p.messages })) : []),
    [data],
  );
  const seriesFriendRequests: SeriesPoint[] = useMemo(
    () => (data ? data.friends.series.map((p) => ({ day: p.day, value: p.requests })) : []),
    [data],
  );
  const seriesFriendAccepted: SeriesPoint[] = useMemo(
    () => (data ? data.friends.series.map((p) => ({ day: p.day, value: p.accepted })) : []),
    [data],
  );

  if (!currentUser) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="ui-panel ui-panel-soft p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admin analytics</h1>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Window <span className="ui-system">{days}d</span>
              {data ? (
                <>
                  <span className="mx-2">·</span>
                  Generated <Timestamp value={data.generatedAt} />
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Window</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="ui-btn px-2 py-1 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>

            {data ? (
              <>
                <button
                  type="button"
                  className="ui-btn px-3 py-2 text-sm"
                  onClick={() => {
                    download(
                      `analytics_${days}d_${new Date(data.generatedAt).toISOString()}.json`,
                      JSON.stringify(data, null, 2),
                      'application/json',
                    );
                  }}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="ui-btn px-3 py-2 text-sm"
                  onClick={() => {
                    const lines: string[] = [];
                    lines.push('section,day,metric,value');

                    for (const p of data.users.series) {
                      lines.push(`users,${p.day},newUsers,${p.newUsers}`);
                      lines.push(`users,${p.day},activeUsers,${p.activeUsers}`);
                    }
                    for (const p of data.posts.series) {
                      lines.push(`posts,${p.day},newPosts,${p.newPosts}`);
                    }
                    for (const p of data.engagement.series) {
                      lines.push(`engagement,${p.day},likes,${p.likes}`);
                      lines.push(`engagement,${p.day},comments,${p.comments}`);
                    }
                    for (const p of data.chat.series) {
                      lines.push(`chat,${p.day},messages,${p.messages}`);
                    }
                    for (const p of data.friends.series) {
                      lines.push(`friends,${p.day},requests,${p.requests}`);
                      lines.push(`friends,${p.day},accepted,${p.accepted}`);
                    }

                    download(
                      `analytics_series_${days}d_${new Date(data.generatedAt).toISOString()}.csv`,
                      `${lines.join('\n')}\n`,
                      'text/csv',
                    );
                  }}
                >
                  Export CSV
                </button>
              </>
            ) : null}

            <Link to="/" className="ui-link text-sm">
              Back to feed
            </Link>
          </div>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Loading…</div> : null}
      {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</div> : null}

      {data ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricTile
              label="Users"
              value={data.users.total}
              sub={
                <>
                  New: today <span className="ui-system">{data.users.new.today}</span>, week{' '}
                  <span className="ui-system">{data.users.new.week}</span>, month <span className="ui-system">{data.users.new.month}</span>
                </>
              }
              right={
                <>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Active/day (latest)</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="ui-system text-sm tabular-nums">{lastValue(seriesActiveUsers)}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">trend</div>
                  </div>
                  <div className="mt-1">
                    <Sparkline points={seriesActiveUsers} />
                  </div>
                </>
              }
            />
            <MetricTile
              label="Posts"
              value={data.posts.total}
              sub={
                <>
                  Avg/user <span className="ui-system">{data.posts.perUserAverage.toFixed(2)}</span>
                </>
              }
              right={
                <>
                  <div className="text-xs text-gray-600 dark:text-gray-400">New posts/day (latest)</div>
                  <div className="mt-1 ui-system text-sm tabular-nums">{lastValue(seriesNewPosts)}</div>
                  <div className="mt-1">
                    <Sparkline points={seriesNewPosts} />
                  </div>
                </>
              }
            />
            <MetricTile
              label="Engagement"
              value={
                <>
                  <span className="ui-system">{data.engagement.totalLikes}</span> likes ·{' '}
                  <span className="ui-system">{data.engagement.totalComments}</span> comments
                </>
              }
              sub={
                <>
                  Ratios: like/post <span className="ui-system">{data.engagement.likeToPostRatio.toFixed(2)}</span>, comment/post{' '}
                  <span className="ui-system">{data.engagement.commentToPostRatio.toFixed(2)}</span>
                </>
              }
              right={
                <>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Likes/day (latest)</div>
                  <div className="mt-1 ui-system text-sm tabular-nums">{lastValue(seriesLikes)}</div>
                  <div className="mt-1">
                    <Sparkline points={seriesLikes} />
                  </div>
                </>
              }
            />
            <MetricTile
              label="Friendships"
              value={data.friends.totalAccepted}
              sub={
                <>
                  Pending <span className="ui-system">{data.friends.totalPending}</span> · Rejected{' '}
                  <span className="ui-system">{data.friends.totalRejected}</span> · Acceptance{' '}
                  <span className="ui-system">{(data.friends.acceptanceRate * 100).toFixed(1)}%</span>
                </>
              }
              right={
                <>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Requests/day (latest)</div>
                  <div className="mt-1 ui-system text-sm tabular-nums">{lastValue(seriesFriendRequests)}</div>
                  <div className="mt-1">
                    <Sparkline points={seriesFriendRequests} />
                  </div>
                </>
              }
            />
            <MetricTile
              label="Chat"
              value={data.chat.totalMessages}
              sub={
                <>
                  Images <span className="ui-system">{data.chat.imageMessages}</span>
                </>
              }
              right={
                <>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Messages/day (latest)</div>
                  <div className="mt-1 ui-system text-sm tabular-nums">{lastValue(seriesChatMessages)}</div>
                  <div className="mt-1">
                    <Sparkline points={seriesChatMessages} />
                  </div>
                </>
              }
            />
            <MetricTile
              label="This window"
              value={<span className="ui-system">{days} days</span>}
              sub={
                <>
                  Friend requests <span className="ui-system">{data.friends.requests.window}</span> · Accepted{' '}
                  <span className="ui-system">{data.friends.accepted.window}</span>
                </>
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-4">
              <div className="ui-panel ui-panel-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Trends (window)</div>
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                      Daily series for the last <span className="ui-system">{days}d</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricTile label="New users/day" value={<span className="ui-system">{lastValue(seriesNewUsers)}</span>} right={<Sparkline points={seriesNewUsers} />} />
                  <MetricTile label="Active users/day" value={<span className="ui-system">{lastValue(seriesActiveUsers)}</span>} right={<Sparkline points={seriesActiveUsers} />} />
                  <MetricTile label="Comments/day" value={<span className="ui-system">{lastValue(seriesComments)}</span>} right={<Sparkline points={seriesComments} />} />
                  <MetricTile label="Friend accept/day" value={<span className="ui-system">{lastValue(seriesFriendAccepted)}</span>} right={<Sparkline points={seriesFriendAccepted} />} />
                </div>
              </div>

              <div className="ui-panel ui-panel-soft p-3">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Distribution</div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">Posts per user (histogram)</div>
                <div className="mt-2 grid gap-1 text-xs">
                  {data.posts.perUserBuckets.map((b) => (
                    <div key={b.bucket} className="flex items-center justify-between">
                      <div className="text-gray-700 dark:text-gray-300">{b.bucket}</div>
                      <div className="ui-system tabular-nums">{b.count}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ui-panel ui-panel-soft p-3">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat leaderboards</div>
                <div className="mt-2 grid gap-3">
                  <div className="ui-panel ui-panel-soft p-3">
                    <div className="text-sm font-semibold">Most active chat groups</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-gray-600 dark:text-gray-400">
                          <tr>
                            <th className="py-1 pr-2">Group</th>
                            <th className="py-1 pr-2">Messages</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.chat.mostActiveGroups.map((g) => (
                            <tr key={g.id} className="border-t dark:border-gray-800">
                              <td className="py-2 pr-2">
                                <span className="text-gray-900 dark:text-gray-100">{g.name}</span>
                                {g.isPrivate ? (
                                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Private</span>
                                ) : (
                                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Public</span>
                                )}
                              </td>
                              <td className="py-2 pr-2 ui-system tabular-nums">{g.messageCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="ui-panel ui-panel-soft p-3">
                    <div className="text-sm font-semibold">Most active chatters</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-gray-600 dark:text-gray-400">
                          <tr>
                            <th className="py-1 pr-2">User</th>
                            <th className="py-1 pr-2">Messages</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.chat.mostActiveChatters.map((u) => (
                            <tr key={u.username} className="border-t dark:border-gray-800">
                              <td className="py-2 pr-2">
                                <Link className="hover:underline" to={`/u/${encodeURIComponent(u.username)}`}>
                                  @{u.username}
                                </Link>
                                {u.displayName ? <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{u.displayName}</span> : null}
                              </td>
                              <td className="py-2 pr-2 ui-system tabular-nums">{u.messageCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="ui-panel ui-panel-soft p-3">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Leaderboards (all time)</div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">Rankings use all-time totals (not windowed).</div>
                <div className="mt-3 grid gap-3">
                  <TopUserTable title="Most active users (posts)" valueLabel="Posts" rows={data.users.top.byPosts} />
                  <TopUserTable title="Most active users (likes received)" valueLabel="Likes" rows={data.users.top.byLikesReceived} />
                  <TopUserTable title="Most active users (comments made)" valueLabel="Comments" rows={data.users.top.byCommentsMade} />
                  <TopUserTable title="Most connected users (friends)" valueLabel="Friends" rows={data.friends.topByFriends} />
                  <TopPostTable
                    title="Most liked posts (all time)"
                    valueLabel="Likes"
                    rows={data.posts.mostLiked.map((p) => ({ id: p.id, username: p.username, text: p.text, createdAt: p.createdAt, value: p.likeCount }))}
                  />
                  <TopPostTable
                    title="Most discussed posts (all time)"
                    valueLabel="Comments"
                    rows={data.posts.mostCommented.map((p) => ({ id: p.id, username: p.username, text: p.text, createdAt: p.createdAt, value: p.commentCount }))}
                  />
                </div>
              </div>

              <div className="ui-panel ui-panel-soft p-3">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">SQL console (read-only)</div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">Only single-statement SELECT/WITH queries are allowed. Results are capped.</div>

                {sqlError ? <div className="mt-2 text-sm text-red-600 dark:text-red-300">{sqlError}</div> : null}

                <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="mt-2 min-h-28 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs dark:border-gray-800 dark:bg-gray-950"
                />

                <div className="mt-2 flex items-center justify-end">
                  <button
                    disabled={sqlLoading}
                    onClick={async () => {
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
                    }}
                    className="ui-btn px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {sqlLoading ? 'Running…' : 'Run query'}
                  </button>
                </div>

                {sqlResult ? (
                  <div className="mt-3 overflow-x-auto">
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Rows: <span className="ui-system">{sqlResult.rowCount}</span>
                      {sqlResult.limited ? ' (limited)' : ''}
                    </div>
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-gray-600 dark:text-gray-400">
                        <tr>
                          {sqlResult.columns.map((c) => (
                            <th key={c} className="border-b py-1 pr-3 dark:border-gray-800">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.rows.map((r, idx) => (
                          <tr key={idx} className="border-b dark:border-gray-800">
                            {r.map((cell, j) => (
                              <td key={j} className="py-1 pr-3 align-top">
                                {cell === null || cell === undefined ? '' : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Generated at <Timestamp value={data.generatedAt} />
          </div>
        </div>
      ) : null}

      <div className="sr-only">Analytics dashboard</div>
    </div>
  );
}
